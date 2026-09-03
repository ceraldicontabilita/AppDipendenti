"""Popola `paghe_mensili` (il registro che alimenta la pagina Buste Paga e
"Cedolini & Bonifici") dai cedolini in archivio, invece di lasciarlo alla
compilazione manuale.

La pagina Buste Paga dell'app non legge affatto la collection `cedolini`: legge
`paghe_mensili`, un registro pensato per l'inserimento a mano (importo busta,
bonifico ricevuto, acconti). Con ~1300 cedolini importati non ha senso
ricopiarli a mano — questo modulo lo fa per tutti i mesi in archivio, e resta
richiamabile a ogni nuovo import (lo scheduler lo fa da solo).

Bonifico del mese: SOLO da `pagamenti_esiti`, il motore unico dei pagamenti
reali (CSV banca, PDF Drive, ponte bonifici storici, coda manuale, PDF
caricati). Prima qui c'era una seconda fonte, `bonifici.cedolino_id`, che
copriva 142 bonifici su 887 e in 5 casi contraddiceva l'aggancio per importo:
oggi anche quei bonifici passano dal ponte storico (che rispetta il
cedolino_id come prova più forte), quindi la seconda fonte era solo un
doppione — eliminata ("un solo sistema per funzione").

Include anche tredicesima e quattordicesima (mese 13 e 14, stessa convenzione
dell'import Prima Nota): senza, i bonifici di dicembre/giugno uguali al netto
della mensilità aggiuntiva restavano "bonifico senza busta" o finivano sommati
allo stipendio ordinario del mese.

Gli acconti letti sulla busta (`cedolino.acconti.acconto_erogato`) vengono
esposti come campo informativo a parte, non sommati dentro `acconti[]`:
sommarli al bonifico conterebbe due volte la stessa somma se il bonifico è
già al netto dell'acconto trattenuto in busta. Il saldo resta "netto dovuto
meno bonifico ricevuto".

Non tocca un mese che un umano ha già modificato a mano (`origine` diverso da
"cedolino"): l'inserimento manuale vince sempre sulla sincronizzazione.
"""
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from backend.app.database import Collections

TIPI_ORDINARI = ("ordinario", "mensile", None)
MENSILITA_AGGIUNTIVE = {"tredicesima": 13, "quattordicesima": 14}


def _num(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _stato_e_saldo(busta: float, bonifico: float) -> Dict[str, Any]:
    if busta <= 0 and bonifico <= 0:
        stato = "vuoto"
    elif bonifico <= 0:
        stato = "in_attesa_pagamento"
    elif bonifico + 0.5 >= busta:
        stato = "pagato"
    else:
        stato = "parziale"
    return {"stato_pagamento": stato, "saldo": round(busta - bonifico, 2)}


def _mese_registro(c: Dict[str, Any]) -> Optional[int]:
    """Mese sotto cui il cedolino va nel registro: 1-12 per l'ordinario, 13/14
    per le mensilità aggiuntive SOLO se il cedolino le porta già come mese 13/14
    (un cedolino 'tredicesima' con mese=7 è un dato ambiguo del parser LUL e
    resta fuori, come prima, invece di collidere con la busta di luglio)."""
    tipo = c.get("tipo_cedolino")
    try:
        mese = int(c.get("mese"))
    except (TypeError, ValueError):
        return None
    if tipo in TIPI_ORDINARI:
        return mese if 1 <= mese <= 12 else None
    if tipo in MENSILITA_AGGIUNTIVE:
        return mese if mese == MENSILITA_AGGIUNTIVE[tipo] else None
    return None


async def sincronizza(db, anno: int = None) -> Dict[str, Any]:
    filtro_ced: Dict[str, Any] = {}
    if anno:
        filtro_ced["anno"] = anno
    cedolini = await db[Collections.PAYSLIPS].find(filtro_ced, {"_id": 0, "pdf_data": 0, "voci": 0}).to_list(5000)
    voci = []
    for c in cedolini:
        mese = _mese_registro(c)
        if c.get("dipendente_id") and c.get("anno") and mese and _num(c.get("netto")) is not None:
            voci.append((c, mese))

    # Prefetch di pagamenti_esiti, sommati una volta sola per (dipendente,
    # anno, mese) con la data dell'ultimo pagamento: zero query nel ciclo
    # (l'adattatore Supabase non ha indici, ogni find legge tutta la tabella).
    esiti_idx: Dict[tuple, Dict[str, Any]] = {}
    async for e in db["pagamenti_esiti"].find({}, {"_id": 0, "pdf_data": 0, "causale": 0, "beneficiario": 0}):
        k = (e.get("dipendente_id"), e.get("anno"), e.get("mese"))
        agg = esiti_idx.setdefault(k, {"tot": 0.0, "data": None})
        agg["tot"] = round(agg["tot"] + (_num(e.get("importo")) or 0), 2)
        if e.get("data") and (agg["data"] is None or e["data"] > agg["data"]):
            agg["data"] = e["data"]

    esistenti_idx: Dict[tuple, Dict[str, Any]] = {}
    async for p in db["paghe_mensili"].find({}, {"_id": 0}):
        esistenti_idx[(p.get("dipendente_id"), p.get("anno"), p.get("mese"))] = p

    adesso = datetime.now(timezone.utc).isoformat()
    creati = aggiornati = saltati_manuali = 0

    for c, mese_c in voci:
        dip, anno_c = c["dipendente_id"], int(c["anno"])
        esistente = esistenti_idx.get((dip, anno_c, mese_c))
        if esistente and esistente.get("origine") not in (None, "cedolino"):
            saltati_manuali += 1
            continue

        netto = _num(c.get("netto"))
        agg = esiti_idx.get((dip, anno_c, mese_c))
        doc: Dict[str, Any] = {
            "dipendente_id": dip, "anno": anno_c, "mese": mese_c,
            "importo_busta": netto,
            "acconti": esistente.get("acconti", []) if esistente else [],
            "giorni_lavorati": (c.get("periodo") or {}).get("giorni_lavorati") or c.get("giorni_lavorati"),
            "acconto_da_cedolino": (c.get("acconti") or {}).get("acconto_erogato"),
            "livello": c.get("livello"),
            "cedolino_id": c.get("id"),
            "tipo_cedolino": c.get("tipo_cedolino") or "ordinario",
            "origine": "cedolino",
            "updated_at": adesso,
        }
        if agg:
            bonifico = agg["tot"]
            doc.update({"bonifico_importo": bonifico, "bonifico_ricevuto": bonifico > 0,
                        "bonifico_data": agg["data"], "bonifico_da_esiti": True})
        elif esistente and esistente.get("bonifico_da_esiti"):
            # Il mese aveva pagamenti che il ponte ha poi ri-attribuito altrove:
            # l'importo residuo veniva dagli esiti e va azzerato, non lasciato.
            bonifico = 0.0
            doc.update({"bonifico_importo": 0.0, "bonifico_ricevuto": False,
                        "bonifico_data": None, "bonifico_da_esiti": False})
        else:
            # Nessun pagamento reale: un importo scritto a mano o dalla Prima
            # Nota (se c'è) resta com'è e conta per lo stato.
            bonifico = _num((esistente or {}).get("bonifico_importo")) or 0.0
        doc.update(_stato_e_saldo(netto, bonifico))
        doc = {k: v for k, v in doc.items() if v is not None or k in ("acconti", "bonifico_data")}

        await db["paghe_mensili"].update_one(
            {"dipendente_id": dip, "anno": anno_c, "mese": mese_c}, {"$set": doc}, upsert=True)
        if esistente:
            aggiornati += 1
        else:
            creati += 1

    return {"cedolini_considerati": len(voci), "creati": creati,
            "aggiornati": aggiornati, "saltati_manuali": saltati_manuali}
