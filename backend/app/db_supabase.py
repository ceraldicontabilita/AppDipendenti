"""Adattatore Mongo -> Postgres/Supabase.

L'app e' scritta contro motor (269 punti chiamano `Database.get_db()`), ma il
cluster MongoDB non esiste piu'. Invece di riscrivere tutti i chiamanti, qui
c'e' un sottoinsieme dell'API di motor appoggiato a Postgres: ogni collection
diventa una tabella `app_<nome>` con una colonna `doc jsonb`.

Le collection in gioco sono piccole (dipendenti, users, tablet_operatori: decine
di documenti), quindi il filtro Mongo viene applicato in Python sui documenti
letti: niente traduzione query->SQL da mantenere, e il comportamento e' quello
di Mongo anche sugli operatori annidati.

Coperto: $ne $exists $in $nin $gt $gte $lt $lte $or $and, proiezioni
include/exclude, $set $setOnInsert $unset $inc, upsert.
NON coperto: aggregate, indici, $push, find_one_and_*, bulk write.
"""
import json
import logging
import re
import uuid
from typing import Any, Dict, List, Optional

import asyncpg

logger = logging.getLogger(__name__)

_NOME_OK = re.compile(r"^[A-Za-z0-9_]+$")


def _tabella(collection: str) -> str:
    if not _NOME_OK.match(collection):
        raise ValueError("nome collection non valido: %r" % collection)
    return "app_" + collection.lower()


class _Mancante:
    """Sentinella: campo assente, diverso da None (Mongo li distingue)."""

    def __repr__(self) -> str:
        return "<mancante>"


_MANCANTE = _Mancante()


def _get(doc: Dict[str, Any], path: str) -> Any:
    cur: Any = doc
    for parte in path.split("."):
        if not isinstance(cur, dict) or parte not in cur:
            return _MANCANTE
        cur = cur[parte]
    return cur


def _confronta(valore: Any, cond: Any) -> bool:
    """Applica una condizione Mongo a un singolo valore."""
    if isinstance(cond, dict) and any(k.startswith("$") for k in cond):
        # $options accompagna $regex e viene letto li', non come operatore a se'
        flags = re.I if "i" in (cond.get("$options") or "") else 0
        for op, atteso in cond.items():
            presente = valore is not _MANCANTE
            if op == "$options":
                continue
            if op == "$eq":
                if not (presente and valore == atteso):
                    return False
            elif op == "$ne":
                if presente and valore == atteso:
                    return False
            elif op == "$exists":
                if presente != bool(atteso):
                    return False
            elif op == "$in":
                if not (presente and valore in atteso):
                    return False
            elif op == "$nin":
                if presente and valore in atteso:
                    return False
            elif op in ("$gt", "$gte", "$lt", "$lte"):
                if not presente:
                    return False
                try:
                    if op == "$gt" and not valore > atteso:
                        return False
                    if op == "$gte" and not valore >= atteso:
                        return False
                    if op == "$lt" and not valore < atteso:
                        return False
                    if op == "$lte" and not valore <= atteso:
                        return False
                except TypeError:
                    return False
            elif op == "$regex":
                if not (presente and isinstance(valore, str)
                        and re.search(atteso, valore, flags)):
                    return False
            else:
                raise NotImplementedError("operatore non supportato: " + op)
        return True
    return valore is not _MANCANTE and valore == cond


def _match(doc: Dict[str, Any], filtro: Optional[Dict[str, Any]]) -> bool:
    if not filtro:
        return True
    for chiave, cond in filtro.items():
        if chiave == "$or":
            if not any(_match(doc, sub) for sub in cond):
                return False
        elif chiave == "$and":
            if not all(_match(doc, sub) for sub in cond):
                return False
        elif chiave.startswith("$"):
            raise NotImplementedError("operatore top-level non supportato: " + chiave)
        else:
            if not _confronta(_get(doc, chiave), cond):
                return False
    return True


def _proietta(doc: Dict[str, Any], proj: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not proj:
        return doc
    campi = {k: v for k, v in proj.items() if k != "_id"}
    if campi and all(bool(v) for v in campi.values()):        # include
        out = {k: doc[k] for k in campi if k in doc}
    elif campi:                                                # exclude
        out = {k: v for k, v in doc.items() if k not in campi}
    else:
        out = dict(doc)
    if proj.get("_id", 1):
        if "_id" in doc:
            out.setdefault("_id", doc["_id"])
    else:
        out.pop("_id", None)
    return out


def _applica_update(doc: Dict[str, Any], update: Dict[str, Any],
                    inserito: bool) -> Dict[str, Any]:
    if not any(k.startswith("$") for k in update):
        return dict(update)                                    # replace completo
    nuovo = dict(doc)
    for op, campi in update.items():
        if op == "$set":
            nuovo.update(campi)
        elif op == "$setOnInsert":
            if inserito:
                nuovo.update(campi)
        elif op == "$unset":
            for k in campi:
                nuovo.pop(k, None)
        elif op == "$inc":
            for k, delta in campi.items():
                nuovo[k] = (nuovo.get(k) or 0) + delta
        else:
            raise NotImplementedError("update non supportato: " + op)
    return nuovo


def _chiave_ordine(v: Any):
    """Chiave d'ordinamento che non mescola i tipi.

    I numeri restano numeri: stringere tutto a stringa metterebbe il mese 3
    dopo l'11. Il primo elemento raggruppa per tipo cosi' che valori
    disomogenei nella stessa colonna non facciano esplodere il confronto.
    """
    if v is _MANCANTE or v is None:
        return (0, 0)
    if isinstance(v, bool):
        return (1, int(v))
    if isinstance(v, (int, float)):
        return (2, v)
    return (3, str(v))


class _Risultato:
    def __init__(self, matched: int, modified: int, upserted_id: Any = None):
        self.matched_count = matched
        self.modified_count = modified
        self.upserted_id = upserted_id


class _Cursore:
    """Cursore compatibile con motor: `await cur.to_list(n)` e `async for`."""

    def __init__(self, coll, filtro, proj, limite=None, ordina=None):
        self._coll, self._filtro, self._proj = coll, filtro, proj
        self._limite, self._ordina = limite, ordina
        self._iter = None

    def sort(self, chiave, direzione=1):
        # motor accetta sia sort("anno", -1) sia sort([("anno", -1), ("mese", -1)])
        if isinstance(chiave, (list, tuple)) and not isinstance(chiave, str):
            self._ordina = [tuple(c) for c in chiave]
        else:
            self._ordina = [(chiave, direzione)]
        return self

    def limit(self, n):
        self._limite = n
        return self

    async def _materializza(self) -> List[Dict[str, Any]]:
        escludi = self._coll._escludibili(self._filtro, self._proj)
        # Un campo su cui si ordina va letto, anche se la proiezione lo esclude:
        # l'ordinamento avviene qui, dopo la lettura.
        chiavi_ordine = {k.split(".")[0] for k, _ in (self._ordina or [])}
        escludi = [k for k in escludi if k not in chiavi_ordine]
        docs = [d for d in await self._coll._tutti(escludi) if _match(d, self._filtro)]
        # ordinamenti multipli: si applicano dal meno al piu' significativo
        for chiave, direzione in reversed(self._ordina or []):
            docs.sort(key=lambda d, k=chiave: _chiave_ordine(_get(d, k)),
                      reverse=direzione < 0)
        if self._limite:
            docs = docs[: self._limite]
        return [_proietta(d, self._proj) for d in docs]

    async def to_list(self, length: Optional[int] = None) -> List[Dict[str, Any]]:
        docs = await self._materializza()
        return docs[:length] if length else docs

    def __aiter__(self):
        self._iter = None
        return self

    async def __anext__(self):
        if self._iter is None:
            self._iter = iter(await self._materializza())
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration


class SupabaseCollection:
    def __init__(self, db: "SupabaseDatabase", nome: str):
        self._db = db
        self._nome = nome
        self._tab = _tabella(nome)

    async def _assicura_tabella(self):
        if self._tab in self._db._tabelle_pronte:
            return
        async with self._db._pool.acquire() as con:
            await con.execute(
                'CREATE TABLE IF NOT EXISTS public."%s" ('
                ' id text PRIMARY KEY,'
                ' doc jsonb NOT NULL)' % self._tab
            )
            # RLS attiva e nessuna policy: il ruolo anon di PostgREST non legge
            # nulla (su questo progetto anon e' volutamente aperto). La
            # connessione diretta usa il proprietario, che scavalca la RLS.
            await con.execute(
                'ALTER TABLE public."%s" ENABLE ROW LEVEL SECURITY' % self._tab
            )
        self._db._tabelle_pronte.add(self._tab)

    async def _tutti(self, escludi=None) -> List[Dict[str, Any]]:
        """Legge i documenti, togliendo in SQL i campi che non servono.

        `cedolini` tiene il PDF in base64 dentro il documento: leggere tutta la
        collection per filtrarla in Python significava trasferire decine di MB e
        andare in timeout. Con l'esclusione spinta nella query (`doc - 'pdf_data'`)
        gli elenchi tornano leggeri, e il PDF si legge solo quando serve davvero.
        """
        await self._assicura_tabella()
        if escludi:
            campi = ", ".join("'%s'" % c.replace("'", "''") for c in sorted(escludi))
            sql = 'SELECT doc - ARRAY[%s] AS doc FROM public."%s"' % (campi, self._tab)
        else:
            sql = 'SELECT doc FROM public."%s"' % self._tab
        async with self._db._pool.acquire() as con:
            righe = await con.fetch(sql)
        out = []
        for r in righe:
            doc = r["doc"]
            out.append(json.loads(doc) if isinstance(doc, str) else doc)
        return out

    @staticmethod
    def _escludibili(filtro, proiezione) -> List[str]:
        """Campi che la proiezione esclude e che il filtro non usa: si possono
        togliere gia' in SQL senza cambiare il risultato."""
        if not proiezione:
            return []
        esclusi = [k for k, v in proiezione.items() if not v and k != "_id"]
        if not esclusi:
            return []
        usati = set()

        def raccogli(f):
            if not isinstance(f, dict):
                return
            for k, v in f.items():
                if k in ("$or", "$and"):
                    for sub in (v or []):
                        raccogli(sub)
                elif not k.startswith("$"):
                    usati.add(k.split(".")[0])

        raccogli(filtro)
        return [k for k in esclusi if k not in usati]

    async def find_one(self, filtro=None, proiezione=None, **_):
        escludi = self._escludibili(filtro, proiezione)
        for d in await self._tutti(escludi):
            if _match(d, filtro):
                return _proietta(d, proiezione)
        return None

    def find(self, filtro=None, proiezione=None, **_) -> _Cursore:
        return _Cursore(self, filtro, proiezione)

    async def count_documents(self, filtro=None, **_) -> int:
        return sum(1 for d in await self._tutti() if _match(d, filtro))

    async def estimated_document_count(self, **_) -> int:
        return await self.count_documents(None)

    async def insert_one(self, doc: Dict[str, Any]) -> _Risultato:
        await self._assicura_tabella()
        doc = dict(doc)
        chiave = str(doc.get("id") or doc.get("_id") or uuid.uuid4())
        doc.setdefault("id", chiave)
        async with self._db._pool.acquire() as con:
            await con.execute(
                'INSERT INTO public."%s" (id, doc) VALUES ($1, $2::jsonb)' % self._tab,
                chiave, json.dumps(doc, default=str),
            )
        return _Risultato(0, 0, chiave)

    async def update_one(self, filtro, update, upsert: bool = False, **_) -> _Risultato:
        await self._assicura_tabella()
        esistente = None
        for d in await self._tutti():
            if _match(d, filtro):
                esistente = d
                break

        if esistente is None:
            if not upsert:
                return _Risultato(0, 0)
            base = {k: v for k, v in (filtro or {}).items()
                    if not k.startswith("$") and not isinstance(v, dict)}
            nuovo = _applica_update(base, update, inserito=True)
            chiave = str(nuovo.get("id") or nuovo.get("_id") or uuid.uuid4())
            nuovo.setdefault("id", chiave)
            async with self._db._pool.acquire() as con:
                await con.execute(
                    'INSERT INTO public."%s" (id, doc) VALUES ($1, $2::jsonb) '
                    'ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc' % self._tab,
                    chiave, json.dumps(nuovo, default=str),
                )
            return _Risultato(0, 0, chiave)

        chiave = str(esistente.get("id") or esistente.get("_id"))
        nuovo = _applica_update(esistente, update, inserito=False)
        async with self._db._pool.acquire() as con:
            await con.execute(
                'UPDATE public."%s" SET doc = $2::jsonb WHERE id = $1' % self._tab,
                chiave, json.dumps(nuovo, default=str),
            )
        return _Risultato(1, 1 if nuovo != esistente else 0)

    async def delete_one(self, filtro, **_) -> _Risultato:
        await self._assicura_tabella()
        for d in await self._tutti():
            if _match(d, filtro):
                chiave = str(d.get("id") or d.get("_id"))
                async with self._db._pool.acquire() as con:
                    await con.execute(
                        'DELETE FROM public."%s" WHERE id = $1' % self._tab, chiave
                    )
                return _Risultato(1, 1)
        return _Risultato(0, 0)


class SupabaseDatabase:
    """Sta al posto dell'oggetto database di motor: `db["dipendenti"]`."""

    def __init__(self, pool: "asyncpg.Pool"):
        self._pool = pool
        self._tabelle_pronte: set = set()
        self._cache: Dict[str, SupabaseCollection] = {}

    def __getitem__(self, nome: str) -> SupabaseCollection:
        if nome not in self._cache:
            self._cache[nome] = SupabaseCollection(self, nome)
        return self._cache[nome]

    def __getattr__(self, nome: str) -> SupabaseCollection:
        if nome.startswith("_"):
            raise AttributeError(nome)
        return self[nome]

    async def list_collection_names(self) -> List[str]:
        async with self._pool.acquire() as con:
            righe = await con.fetch(
                "SELECT tablename FROM pg_tables "
                "WHERE schemaname='public' AND tablename LIKE 'app\\_%'"
            )
        return [r["tablename"][4:] for r in righe]


async def crea_database(dsn: str) -> SupabaseDatabase:
    pool = await asyncpg.create_pool(dsn, min_size=1, max_size=5, command_timeout=60)
    logger.info("Supabase/Postgres connesso")
    return SupabaseDatabase(pool)
