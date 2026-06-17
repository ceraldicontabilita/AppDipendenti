"""
Turni settimanali: generazione con vincoli, bozza→pubblicato, modifica con
rivalidazione, pubblicazione con notifica al dipendente.
"""
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Body, Depends

from backend.app.database import Database, Collections
from backend.app.utils.identity import get_identity, require_roles
from backend.app.services import turni_generator as TG
from backend.app.services.notifiche import crea_notifica

logger = logging.getLogger(__name__)
router = APIRouter()

COLL = "turni_settimane"
COLL_INDISP = "turni_indisponibilita"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sid(settimana_inizio: str) -> str:
    return f"sett_{settimana_inizio}"


async def _dipendenti_attivi() -> List[Dict[str, Any]]:
    db = Database.get_db()
    docs = await db[Collections.EMPLOYEES].find(
        {"attivo": {"$ne": False}, "merged_into": {"$exists": False}},
        {"_id": 0, "id": 1, "nome_completo": 1},
    ).sort("nome_completo", 1).to_list(500)
    return [d for d in docs if d.get("id")]


async def _indisponibilita() -> List[Dict[str, Any]]:
    db = Database.get_db()
    return await db[COLL_INDISP].find({}, {"_id": 0}).to_list(2000)


def _ricalcola_totali(doc: Dict[str, Any]) -> None:
    tot: Dict[str, Dict[str, Any]] = {}
    for g in doc["giorni"]:
        for dip_id, a in g["assegnazioni"].items():
            t = tot.setdefault(dip_id, {"nome": doc.get("totali", {}).get(dip_id, {}).get("nome", ""),
                                        "ore": 0, "lunghe": 0, "riposi": 0})
            t["ore"] += a.get("ore", 0)
            if a.get("turno") == "lunga":
                t["lunghe"] += 1
            if a.get("turno") == "riposo":
                t["riposi"] += 1
    doc["totali"] = tot


@router.post("/genera", summary="Genera bozza turni (responsabile/admin)")
async def genera(
    payload: Dict[str, Any] = Body(..., example={"settimana_inizio": "2026-06-15"}),
    identity: Dict[str, Any] = Depends(require_roles("responsabile_turni", "admin")),
):
    settimana = str(payload.get("settimana_inizio", "")).strip()
    try:
        base = datetime.strptime(settimana, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "settimana_inizio deve essere una data YYYY-MM-DD (lunedì)")
    if base.weekday() != 0:
        raise HTTPException(400, "settimana_inizio deve essere un lunedì")

    dipendenti = await _dipendenti_attivi()
    if not dipendenti:
        raise HTTPException(400, "Nessun dipendente attivo")

    db = Database.get_db()
    esistente = await db[COLL].find_one({"id": _sid(settimana)}, {"_id": 0})
    if esistente and esistente.get("stato") == "pubblicato":
        raise HTTPException(409, "Settimana già pubblicata: crea una nuova versione sbloccandola prima")

    gen = TG.genera_settimana(dipendenti, await _indisponibilita(), settimana,
                              fabbisogno=payload.get("fabbisogno"))
    doc = {
        "id": _sid(settimana),
        "settimana_inizio": settimana,
        "stato": "bozza",
        "versione": (esistente.get("versione", 0) + 1) if esistente else 1,
        "giorni": gen["giorni"],
        "totali": gen["totali"],
        "avvisi": gen["avvisi"],
        "creato_da": identity["id"],
        "creato_il": _now(),
        "pubblicato_da": None,
        "pubblicato_il": None,
    }
    await db[COLL].replace_one({"id": _sid(settimana)}, doc, upsert=True)
    doc.pop("_id", None)
    return doc


@router.get("", summary="Elenco settimane (responsabile/admin)")
async def lista(_: Dict[str, Any] = Depends(require_roles("responsabile_turni", "admin"))):
    db = Database.get_db()
    return await db[COLL].find({}, {"_id": 0, "giorni": 0}).sort("settimana_inizio", -1).to_list(200)


@router.get("/miei/corrente", summary="I miei turni (ultima settimana pubblicata)")
async def miei(identity: Dict[str, Any] = Depends(get_identity)):
    db = Database.get_db()
    doc = await db[COLL].find_one({"stato": "pubblicato"}, {"_id": 0},
                                  sort=[("settimana_inizio", -1)])
    if not doc:
        return {"settimana_inizio": None, "giorni": []}
    mid = identity["id"]
    giorni = [{"data": g["data"], "giorno_nome": g["giorno_nome"],
               "turno": g["assegnazioni"].get(mid, {})} for g in doc["giorni"]]
    return {"settimana_inizio": doc["settimana_inizio"], "stato": doc["stato"], "giorni": giorni}


@router.get("/{settimana_inizio}", summary="Dettaglio settimana")
async def dettaglio(settimana_inizio: str, identity: Dict[str, Any] = Depends(get_identity)):
    db = Database.get_db()
    doc = await db[COLL].find_one({"id": _sid(settimana_inizio)}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Settimana non trovata")
    if identity.get("role") in ("admin", "responsabile_turni"):
        return doc
    # dipendente: vede la griglia completa di tutti, ma solo se pubblicata
    # e senza le note gestionali (avvisi/metadati interni)
    if doc["stato"] != "pubblicato":
        raise HTTPException(403, "Turni non ancora pubblicati")
    return {
        "settimana_inizio": doc["settimana_inizio"],
        "stato": doc["stato"],
        "giorni": doc["giorni"],
        "totali": doc.get("totali", {}),
    }


@router.put("/{settimana_inizio}/cella", summary="Modifica una cella (responsabile/admin) + rivalida")
async def modifica_cella(
    settimana_inizio: str,
    payload: Dict[str, Any] = Body(..., example={"data": "2026-06-16", "dipendente_id": "dip-1", "turno": "lunga"}),
    _: Dict[str, Any] = Depends(require_roles("responsabile_turni", "admin")),
):
    data = payload.get("data")
    dip_id = payload.get("dipendente_id")
    turno = payload.get("turno")
    if turno not in TG.TURNI_DEFAULT:
        raise HTTPException(400, f"Turno non valido: {turno}")
    db = Database.get_db()
    doc = await db[COLL].find_one({"id": _sid(settimana_inizio)}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Settimana non trovata")
    if doc["stato"] == "pubblicato":
        raise HTTPException(409, "Settimana pubblicata: non modificabile")

    trovato = False
    for g in doc["giorni"]:
        if g["data"] == data and dip_id in g["assegnazioni"]:
            t = TG.TURNI_DEFAULT[turno]
            g["assegnazioni"][dip_id] = {"turno": turno, "label": t["label"],
                                         "inizio": t["inizio"], "fine": t["fine"], "ore": t["ore"]}
            trovato = True
            break
    if not trovato:
        raise HTTPException(404, "Cella (data/dipendente) non trovata")

    _ricalcola_totali(doc)
    doc["avvisi"] = TG.rivalida(doc)
    await db[COLL].replace_one({"id": doc["id"]}, doc)
    doc.pop("_id", None)
    return {"ok": True, "avvisi": doc["avvisi"]}


@router.post("/{settimana_inizio}/pubblica", summary="Pubblica e notifica i dipendenti")
async def pubblica(settimana_inizio: str,
                   identity: Dict[str, Any] = Depends(require_roles("responsabile_turni", "admin"))):
    db = Database.get_db()
    doc = await db[COLL].find_one({"id": _sid(settimana_inizio)}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Settimana non trovata")
    if doc["stato"] == "pubblicato":
        raise HTTPException(409, "Già pubblicata")

    await db[COLL].update_one({"id": doc["id"]},
                              {"$set": {"stato": "pubblicato", "pubblicato_il": _now(),
                                        "pubblicato_da": identity["id"]}})

    # notifica ogni dipendente coinvolto, col riepilogo dei suoi turni
    coinvolti = {dip for g in doc["giorni"] for dip in g["assegnazioni"]}
    notificati = 0
    for dip_id in coinvolti:
        righe = []
        for g in doc["giorni"]:
            a = g["assegnazioni"].get(dip_id, {})
            lbl = a.get("label", "—")
            orario = f" {a['inizio']}–{a['fine']}" if a.get("inizio") else ""
            righe.append(f"{g['giorno_nome'][:3]} {g['data'][8:10]}/{g['data'][5:7]}: {lbl}{orario}")
        msg = ("Turni della settimana del " + settimana_inizio + " pubblicati. "
               "Collegati all'app per la visione.\n\n" + "\n".join(righe))
        await crea_notifica(db, dip_id, "turno_pubblicato",
                            f"Turni settimana {settimana_inizio}", msg,
                            extra={"settimana_inizio": settimana_inizio})
        notificati += 1

    return {"ok": True, "stato": "pubblicato", "dipendenti_notificati": notificati}


@router.post("/{settimana_inizio}/sblocca", summary="Riporta in bozza (admin)")
async def sblocca(settimana_inizio: str, _: Dict[str, Any] = Depends(require_roles("admin"))):
    db = Database.get_db()
    r = await db[COLL].update_one({"id": _sid(settimana_inizio)}, {"$set": {"stato": "bozza"}})
    if r.matched_count == 0:
        raise HTTPException(404, "Settimana non trovata")
    return {"ok": True, "stato": "bozza"}
