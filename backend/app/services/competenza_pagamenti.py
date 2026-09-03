"""Competenza dei pagamenti stipendio: a QUALE BUSTA (anno, mese) appartiene un
bonifico. Motore unico, usato da ogni ingresso che scrive `pagamenti_esiti`
(ponte bonifici storici, CSV banca, PDF da Drive, PDF caricati a mano).

Perché esiste (verificato sui dati reali di produzione il 03/09/2026, 887
bonifici in archivio): lo stipendio del mese M viene pagato nel mese M+1
(nel 91% dei bonifici già agganciati a un cedolino la data del pagamento cade
nel mese successivo a quello della busta, nel 60% dei casi entro il giorno 10),
ma il campo `competenza` salvato dal vecchio import era uguale al MESE DEL
PAGAMENTO in 646 casi su 800. Il ponte storico prendeva quel campo per buono e
attribuiva ogni bonifico alla busta del mese sbagliato: la busta di febbraio
restava "in attesa di pagamento" mentre quella di marzo risultava pagata (o
"parziale") con i soldi di febbraio, a cascata su tutto l'archivio — 809 buste
su 1222 "in attesa" e 106 "parziali" nonostante i bonifici fossero in archivio.

Regole, in ordine di affidabilità (il campo `metodo` sul pagamento dice quale
ha deciso, così la pagina "Cedolini & Bonifici" può distinguere un aggancio
provato da uno dedotto):
  1. `cedolino`  — il pagamento porta già l'id del cedolino (abbinamento fatto
                   dal gestionale): vince su tutto.
  2. `causale`   — mese dichiarato esplicitamente nella causale o nel nome del
                   file ("stipendio 1/2026", "bonifico marzo").
  3. `importo`   — l'importo coincide (±0,50 €) col netto di un cedolino del
                   dipendente nella finestra [mese-3 … mese del pagamento],
                   preferendo il mese precedente; include 13ª/14ª.
  4. `importo_somma` — due pagamenti dello stesso dipendente entro 45 giorni
                   (acconto + saldo) che insieme fanno il netto di una busta.
  5. `presunto`  — nessuna prova: mese precedente a quello del pagamento (la
                   regola statisticamente dominante). Va mostrato come "da
                   verificare", mai come aggancio certo.

Il vecchio campo `competenza` dei bonifici storici NON è tra le fonti: è
proprio il dato che si è rivelato sbagliato.
"""
import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

TOLLERANZA_EURO = 0.5
MESI_INDIETRO = 3
GIORNI_COPPIA = 45

MESI_IT = {"gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4, "maggio": 5, "giugno": 6,
           "luglio": 7, "agosto": 8, "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12}
# Mensilità aggiuntive: nel registro paghe hanno mese 13/14 (stessa convenzione
# dell'import Prima Nota). Per la finestra temporale contano come il mese in
# cui vengono normalmente pagate.
MESE_EQUIVALENTE = {13: 12, 14: 6}

_RE_MESE_NUM = re.compile(r"\b(0?[1-9]|1[0-2])\s*[-/]\s*(20\d{2})\b")
_RE_ANNO = re.compile(r"\b(20\d{2})\b")


def _num(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _idx(anno: int, mese: int) -> int:
    """Indice lineare di un mese (13ª/14ª riportate al mese in cui si pagano)."""
    return int(anno) * 12 + (MESE_EQUIVALENTE.get(int(mese), int(mese)) - 1)


def mese_precedente(anno: int, mese: int) -> Tuple[int, int]:
    return (anno - 1, 12) if mese == 1 else (anno, mese - 1)


def anno_mese_da_data(data: Optional[str]) -> Optional[Tuple[int, int]]:
    """'YYYY-MM-DD' (o 'YYYY-MM') -> (anno, mese); None se non leggibile."""
    if not data:
        return None
    m = re.match(r"^(\d{4})-(\d{2})", str(data))
    if not m:
        return None
    anno, mese = int(m.group(1)), int(m.group(2))
    if not 1 <= mese <= 12:
        return None
    return anno, mese


def competenza_da_causale(causale: Optional[str], data: Optional[str] = None) -> Optional[Tuple[int, int]]:
    """Mese/anno SOLO se dichiarati esplicitamente nella causale: "1/2026",
    "01-2026", "marzo 2026", "stip. dicembre" (anno dedotto dalla data del
    pagamento: "dicembre" pagato a gennaio è dicembre dell'anno prima),
    "tredicesima"/"quattordicesima" (mese 13/14). Altrimenti None."""
    c = (causale or "").lower()
    if not c.strip():
        return None
    m = _RE_MESE_NUM.search(c)
    if m:
        return int(m.group(2)), int(m.group(1))
    dm = anno_mese_da_data(data)
    if "tredicesima" in c or re.search(r"\b13\s*(a|ª|esima)\b", c):
        anno = _anno_in_testo(c) or (dm[0] if dm else None)
        return (anno, 13) if anno else None
    if "quattordicesima" in c or re.search(r"\b14\s*(a|ª|esima)\b", c):
        anno = _anno_in_testo(c) or (dm[0] if dm else None)
        return (anno, 14) if anno else None
    for nome, num in MESI_IT.items():
        if re.search(r"\b" + nome + r"\b", c):
            anno = _anno_in_testo(c)
            if anno is None and dm:
                anno = dm[0]
                if num > dm[1]:      # "dicembre" pagato a gennaio -> anno prima
                    anno -= 1
            return (anno, num) if anno else None
    return None


def _anno_in_testo(c: str) -> Optional[int]:
    m = _RE_ANNO.search(c)
    return int(m.group(1)) if m else None


class IndiceCedolini:
    """Cedolini per dipendente, in memoria (una sola lettura della collezione,
    senza pdf_data): l'adattatore Supabase non ha indici, una query per
    pagamento sarebbe l'ennesimo N×M."""

    def __init__(self, cedolini: Iterable[Dict[str, Any]]):
        self.per_dip: Dict[str, List[Dict[str, Any]]] = {}
        self.per_id: Dict[str, Dict[str, Any]] = {}
        for c in cedolini:
            dip, anno, mese, netto = c.get("dipendente_id"), c.get("anno"), c.get("mese"), _num(c.get("netto"))
            if not dip or not anno or not mese or netto is None:
                continue
            try:
                anno, mese = int(anno), int(mese)
            except (TypeError, ValueError):
                continue
            if not 1 <= mese <= 14:
                continue
            voce = {"id": c.get("id"), "dipendente_id": dip, "anno": anno, "mese": mese,
                    "netto": round(netto, 2), "tipo": c.get("tipo_cedolino") or "ordinario"}
            self.per_dip.setdefault(dip, []).append(voce)
            if voce["id"]:
                self.per_id[voce["id"]] = voce

    @classmethod
    async def carica(cls, db) -> "IndiceCedolini":
        rows = []
        async for c in db["cedolini"].find({}, {"_id": 0, "pdf_data": 0, "voci": 0}):
            rows.append(c)
        return cls(rows)

    def in_finestra(self, dip: str, anno_pag: int, mese_pag: int) -> List[Dict[str, Any]]:
        fine = _idx(anno_pag, mese_pag)
        inizio = fine - MESI_INDIETRO
        return [c for c in self.per_dip.get(dip, []) if inizio <= _idx(c["anno"], c["mese"]) <= fine]

    def per_importo(self, dip: str, importo: float, anno_pag: int, mese_pag: int) -> List[Dict[str, Any]]:
        """Cedolini nella finestra col netto uguale all'importo, ordinati per
        preferenza: prima chi combacia al centesimo rispetto a chi rientra solo
        nella tolleranza, poi il mese precedente al pagamento, poi lo stesso
        mese, poi più indietro."""
        cands = [c for c in self.in_finestra(dip, anno_pag, mese_pag)
                 if abs(c["netto"] - importo) <= TOLLERANZA_EURO]
        prec = _idx(anno_pag, mese_pag) - 1

        def rango(c):
            i = _idx(c["anno"], c["mese"])
            esatto = 0 if abs(c["netto"] - importo) < 0.01 else 1
            return (esatto, 0 if i == prec else 1 if i == prec + 1 else 2, -i)
        return sorted(cands, key=rango)


def _esito(anno: int, mese: int, metodo: str, cedolino: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {"anno": int(anno), "mese": int(mese), "metodo": metodo,
            "cedolino_id": cedolino.get("id") if cedolino else None}


def risolvi_competenza(pag: Dict[str, Any], indice: IndiceCedolini) -> Optional[Dict[str, Any]]:
    """Regole 1-3 su un singolo pagamento. None = nessuna prova (il chiamante
    prova la coppia acconto+saldo e poi il ripiego 'presunto')."""
    cid = pag.get("cedolino_id")
    if cid and cid in indice.per_id:
        c = indice.per_id[cid]
        return _esito(c["anno"], c["mese"], "cedolino", c)

    if pag.get("mese_esplicito") and pag.get("anno_esplicito"):
        return _esito(pag["anno_esplicito"], pag["mese_esplicito"], "causale")
    esplicita = competenza_da_causale(pag.get("causale"), pag.get("data"))
    if esplicita:
        return _esito(esplicita[0], esplicita[1], "causale")

    dm = anno_mese_da_data(pag.get("data"))
    importo = _num(pag.get("importo"))
    dip = pag.get("dipendente_id")
    if dm and importo and dip:
        cands = indice.per_importo(dip, importo, dm[0], dm[1])
        if cands:
            return _esito(cands[0]["anno"], cands[0]["mese"], "importo", cands[0])
    return None


def _giorni(data: str) -> Optional[int]:
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", str(data or ""))
    if not m:
        return None
    from datetime import date
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3))).toordinal()
    except ValueError:
        return None


def risolvi_lotto(pagamenti: List[Dict[str, Any]], indice: IndiceCedolini) -> List[Optional[Dict[str, Any]]]:
    """Applica tutte le regole a un lotto di pagamenti (stessa lista in
    ingresso e in uscita, posizione per posizione). None solo se il
    pagamento non ha nemmeno una data leggibile."""
    esiti: List[Optional[Dict[str, Any]]] = [risolvi_competenza(p, indice) for p in pagamenti]

    # Regola 4: acconto + saldo. Tra i pagamenti ancora senza prova dello
    # stesso dipendente, entro 45 giorni l'uno dall'altro, una coppia la cui
    # somma coincide col netto di una busta nella finestra del più recente.
    irrisolti = [i for i, e in enumerate(esiti) if e is None]
    per_dip: Dict[str, List[int]] = {}
    for i in irrisolti:
        p = pagamenti[i]
        if p.get("dipendente_id") and _num(p.get("importo")) and _giorni(p.get("data")) is not None:
            per_dip.setdefault(p["dipendente_id"], []).append(i)
    for dip, idxs in per_dip.items():
        idxs.sort(key=lambda i: _giorni(pagamenti[i]["data"]))
        for a_pos, i in enumerate(idxs):
            if esiti[i] is not None:
                continue
            for j in idxs[a_pos + 1:]:
                if esiti[j] is not None:
                    continue
                gi, gj = _giorni(pagamenti[i]["data"]), _giorni(pagamenti[j]["data"])
                if gj - gi > GIORNI_COPPIA:
                    break
                somma = _num(pagamenti[i]["importo"]) + _num(pagamenti[j]["importo"])
                dm = anno_mese_da_data(pagamenti[j]["data"])
                cands = indice.per_importo(dip, somma, dm[0], dm[1]) if dm else []
                if cands:
                    c = cands[0]
                    esiti[i] = _esito(c["anno"], c["mese"], "importo_somma", c)
                    esiti[j] = _esito(c["anno"], c["mese"], "importo_somma", c)
                    break

    # Regola 5: ripiego sul mese precedente al pagamento.
    for i, e in enumerate(esiti):
        if e is None:
            dm = anno_mese_da_data(pagamenti[i].get("data"))
            if dm:
                a, m = mese_precedente(dm[0], dm[1])
                esiti[i] = _esito(a, m, "presunto")
    return esiti
