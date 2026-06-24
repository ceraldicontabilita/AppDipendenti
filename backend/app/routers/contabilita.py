"""
Router Contabilità / Gestione Pagamenti — Ceraldi Group
========================================================
Porta dentro AppDipendenti la "centrale pagamenti" (fatture passive,
fornitori, documenti fiscali da PEC, scadenze "da pagare") recuperata
dall'app esterna https://ceraldi-gestione.onrender.com.

FASE 1 = sola lettura + import dello snapshot recuperato.

Collezioni (allineate agli handler event-bus già presenti):
- ``invoices``         → fatture passive
- ``fornitori``        → anagrafica fornitori (IBAN / metodo pagamento)
- ``documents_inbox``  → documenti ricevuti via PEC/email (Agenzia Riscossione,
                          INPS, INAIL, TARI, PagoPA, commercialista…)

I dati arrivano dal seed ``backend/app/data/contabilita_seed.json``,
caricato una tantum con POST ``/api/contabilita/importa-snapshot``.
"""
import json
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from backend.app.database import Database

router = APIRouter()
logger = logging.getLogger(__name__)

SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "contabilita_seed.json"

# Documenti considerati "da pagare/regolarizzare" quando ad alta priorità.
TIPI_DOCUMENTO = [
    "PAGHE_F24", "COMMERCIALISTA", "AGENZIA_RISCOSSIONE", "INPS",
    "INAIL", "TARI", "PAGOPA_NAPOLI", "RICEVUTA_PAGOPA",
]


# ============================================================
# IMPORT SNAPSHOT (admin) — idempotente
# ============================================================
@router.post("/importa-snapshot")
async def importa_snapshot(svuota: bool = Query(False, description="Svuota le collezioni prima di importare")):
    """Carica il seed recuperato nelle collezioni invoices/fornitori/documents_inbox.

    Idempotente: upsert per ``_id`` (id originale). Non duplica righe già presenti.
    """
    db = Database.get_db()
    if not SEED_PATH.exists():
        raise HTTPException(status_code=404, detail=f"Seed non trovato: {SEED_PATH}")

    try:
        seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Seed non leggibile: {e}")

    risultati = {}
    for coll_name in ("invoices", "fornitori", "documents_inbox"):
        records = seed.get(coll_name, [])
        coll = db[coll_name]
        if svuota:
            await coll.delete_many({"fonte": "snapshot_gestione"})
        nuovi = aggiornati = 0
        for r in records:
            _id = r.get("_id") or r.get("id")
            if not _id:
                continue
            res = await coll.update_one({"_id": _id}, {"$set": r}, upsert=True)
            if res.upserted_id is not None:
                nuovi += 1
            elif res.modified_count:
                aggiornati += 1
        risultati[coll_name] = {"totale": len(records), "nuovi": nuovi, "aggiornati": aggiornati}

    logger.info("Import snapshot contabilità: %s", risultati)
    return {"ok": True, "risultati": risultati, "meta": seed.get("_meta", {})}


# ============================================================
# DASHBOARD
# ============================================================
@router.get("/dashboard")
async def dashboard():
    db = Database.get_db()
    inv = db["invoices"]
    forn = db["fornitori"]
    docs = db["documents_inbox"]

    tot_fatture = await inv.count_documents({})
    fatture_da_pagare = await inv.count_documents({"stato_pagamento": "da_pagare"})
    fatture_pagate = await inv.count_documents({"stato_pagamento": "pagato"})

    # Importo totale da pagare
    importo_da_pagare = 0.0
    async for d in inv.find({"stato_pagamento": "da_pagare"}, {"importo_totale": 1}):
        importo_da_pagare += float(d.get("importo_totale") or 0)

    tot_fornitori = await forn.count_documents({})
    tot_documenti = await docs.count_documents({})
    documenti_da_pagare = await docs.count_documents({"da_pagare": True})

    # Documenti urgenti per tipo
    per_tipo = {}
    async for d in docs.find({"da_pagare": True}, {"tipo": 1}):
        t = d.get("tipo") or "ALTRO"
        per_tipo[t] = per_tipo.get(t, 0) + 1

    return {
        "fatture": {
            "totale": tot_fatture,
            "da_pagare": fatture_da_pagare,
            "pagate": fatture_pagate,
            "importo_da_pagare": round(importo_da_pagare, 2),
        },
        "fornitori": {"totale": tot_fornitori},
        "documenti": {
            "totale": tot_documenti,
            "da_pagare": documenti_da_pagare,
            "per_tipo": per_tipo,
        },
    }


# ============================================================
# FATTURE
# ============================================================
@router.get("/fatture")
async def lista_fatture(
    anno: Optional[int] = None,
    stato: Optional[str] = Query(None, description="da_pagare | pagato"),
    fornitore: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(200, le=2000),
    skip: int = 0,
):
    db = Database.get_db()
    q = {}
    if anno:
        q["anno"] = anno
    if stato in ("da_pagare", "pagato"):
        q["stato_pagamento"] = stato
    if fornitore:
        q["forn_norm"] = {"$regex": fornitore.upper(), "$options": "i"}
    if search:
        rx = {"$regex": search, "$options": "i"}
        q["$or"] = [{"fornitore": rx}, {"numero": rx}, {"piva": rx}]

    coll = db["invoices"]
    totale = await coll.count_documents(q)
    cursor = coll.find(q, {"fonte": 0}).sort("data", -1).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    for it in items:
        it.pop("_id", None)
    return {"totale": totale, "items": items}


# ============================================================
# FORNITORI
# ============================================================
@router.get("/fornitori")
async def lista_fornitori(search: Optional[str] = None):
    db = Database.get_db()
    q = {}
    if search:
        q["forn_norm"] = {"$regex": search.upper(), "$options": "i"}
    cursor = db["fornitori"].find(q).sort("nome", 1)
    items = await cursor.to_list(length=1000)
    return {"totale": len(items), "items": items}


@router.get("/fornitori/{forn_id}")
async def dettaglio_fornitore(forn_id: str):
    db = Database.get_db()
    f = await db["fornitori"].find_one({"_id": forn_id})
    if not f:
        raise HTTPException(status_code=404, detail="Fornitore non trovato")
    # Fatture collegate (per partita IVA o nome normalizzato)
    q = {"$or": []}
    if f.get("piva"):
        q["$or"].append({"piva": f["piva"]})
    if f.get("forn_norm"):
        q["$or"].append({"forn_norm": f["forn_norm"]})
    fatture = []
    if q["$or"]:
        fatture = await db["invoices"].find(q, {"fonte": 0}).sort("data", -1).to_list(length=2000)
    return {"fornitore": f, "fatture": fatture}


# ============================================================
# DOCUMENTI FISCALI (PEC / email)
# ============================================================
@router.get("/documenti")
async def lista_documenti(
    tipo: Optional[str] = None,
    priorita: Optional[str] = None,
    da_pagare: Optional[bool] = None,
    search: Optional[str] = None,
    limit: int = Query(300, le=2000),
):
    db = Database.get_db()
    q = {}
    if tipo:
        q["tipo"] = tipo
    if priorita:
        q["priorita"] = priorita
    if da_pagare is not None:
        q["da_pagare"] = da_pagare
    if search:
        rx = {"$regex": search, "$options": "i"}
        q["$or"] = [{"oggetto": rx}, {"mittente": rx}]
    cursor = db["documents_inbox"].find(q).sort("data", -1).limit(limit)
    items = await cursor.to_list(length=limit)
    return {"totale": len(items), "items": items}


# ============================================================
# DA PAGARE — documenti urgenti raggruppati per tipo
# ============================================================
@router.get("/da-pagare")
async def da_pagare(search: Optional[str] = None):
    db = Database.get_db()
    q = {"da_pagare": True}
    if search:
        rx = {"$regex": search, "$options": "i"}
        q["$or"] = [{"oggetto": rx}, {"mittente": rx}]
    docs = await db["documents_inbox"].find(q).sort("data", -1).to_list(length=2000)
    gruppi: dict = {}
    for d in docs:
        gruppi.setdefault(d.get("tipo") or "ALTRO", []).append(d)

    fatture_da_pagare = await db["invoices"].count_documents({"stato_pagamento": "da_pagare"})
    return {
        "totale_documenti": len(docs),
        "gruppi": gruppi,
        "fatture_da_pagare": fatture_da_pagare,
    }
