"""Notifiche in-app del dipendente."""
import logging
from datetime import datetime, timezone
from typing import Dict, Any
from fastapi import APIRouter, HTTPException, Query, Depends

from backend.app.database import Database
from backend.app.utils.identity import get_identity

logger = logging.getLogger(__name__)
router = APIRouter()
COLL = "notifiche"


@router.get("", summary="Le mie notifiche (admin: tutte)")
async def le_mie(solo_non_lette: bool = Query(False),
                 identity: Dict[str, Any] = Depends(get_identity)):
    db = Database.get_db()
    # L'admin vede tutti gli avvisi; il dipendente solo i propri.
    q: Dict[str, Any] = {} if identity.get("role") == "admin" else {"dipendente_id": identity["id"]}
    if solo_non_lette:
        q["letta"] = False
    return await db[COLL].find(q, {"_id": 0}).sort("creato_il", -1).to_list(500)


@router.get("/conteggio", summary="Conteggio non lette")
async def conteggio(identity: Dict[str, Any] = Depends(get_identity)):
    db = Database.get_db()
    q: Dict[str, Any] = {"letta": False}
    if identity.get("role") != "admin":
        q["dipendente_id"] = identity["id"]
    n = await db[COLL].count_documents(q)
    return {"non_lette": n}


@router.post("/{notifica_id}/letta", summary="Segna come letta")
async def segna_letta(notifica_id: str, identity: Dict[str, Any] = Depends(get_identity)):
    db = Database.get_db()
    q = {"id": notifica_id} if identity.get("role") == "admin" else {"id": notifica_id, "dipendente_id": identity["id"]}
    r = await db[COLL].update_one(
        q,
        {"$set": {"letta": True, "letta_il": datetime.now(timezone.utc).isoformat()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Notifica non trovata")
    return {"ok": True}
