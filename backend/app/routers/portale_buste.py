"""
Portale buste paga del dipendente — a norma di consegna.

Il dipendente vede e scarica SOLO le proprie buste. Ogni accesso al documento
è tracciato in modo permanente nell'audit_log (visualizzazione, download,
presa visione) con data/ora esatta e IP. La presa visione/accettazione viene
memorizzata anche in `cedolini_accettazioni` per consultazione rapida.

NB: le meccaniche di tracciamento e consegna sono complete; la validità formale
"a norma di legge" in caso di contenzioso va confermata dal consulente del lavoro.
"""
import base64
import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import StreamingResponse

from backend.app.database import Database, Collections
from backend.app.utils.identity import get_identity
from backend.app.services.audit_logger import log_evento

logger = logging.getLogger(__name__)
router = APIRouter()

COLL_CED = "cedolini"
COLL_ACCETT = "cedolini_accettazioni"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _dipendente_keys(identity: Dict[str, Any]) -> Tuple[str, Optional[str]]:
    """Ritorna (dipendente_id, codice_fiscale) per filtrare le buste sue."""
    db = Database.get_db()
    dip = await db[Collections.EMPLOYEES].find_one(
        {"id": identity["id"]}, {"_id": 0, "id": 1, "codice_fiscale": 1}
    )
    cf = (dip.get("codice_fiscale") if dip else None) or None
    return identity["id"], cf


def _owner_query(dip_id: str, cf: Optional[str]) -> Dict[str, Any]:
    ors: List[Dict[str, Any]] = [{"dipendente_id": dip_id}]
    if cf:
        ors.append({"codice_fiscale": cf.upper()})
        ors.append({"codice_fiscale": cf})
    return {"$or": ors}


async def _carica_mia_busta(cedolino_id: str, identity: Dict[str, Any], proj=None) -> Dict[str, Any]:
    db = Database.get_db()
    dip_id, cf = await _dipendente_keys(identity)
    q = {"$and": [{"id": cedolino_id}, _owner_query(dip_id, cf)]}
    doc = await db[COLL_CED].find_one(q, proj or {"_id": 0})
    if not doc:
        # 404 anche se esiste ma non è sua: non riveliamo l'esistenza
        raise HTTPException(404, "Busta paga non trovata")
    return doc


@router.get("", summary="Le mie buste paga")
async def le_mie_buste(identity: Dict[str, Any] = Depends(get_identity)) -> List[Dict[str, Any]]:
    db = Database.get_db()
    dip_id, cf = await _dipendente_keys(identity)
    docs = await db[COLL_CED].find(
        _owner_query(dip_id, cf),
        {"_id": 0, "pdf_data": 0},
    ).sort([("anno", -1), ("mese", -1)]).to_list(500)

    accettate = {a["cedolino_id"] async for a in db[COLL_ACCETT].find(
        {"dipendente_id": dip_id}, {"_id": 0, "cedolino_id": 1})}

    out = []
    for c in docs:
        cid = c.get("id", "")
        out.append({
            "id": cid,
            "mese": c.get("mese"),
            "anno": c.get("anno"),
            "competenza": c.get("competenza"),
            "netto": c.get("netto", 0),
            "lordo": c.get("lordo", 0),
            "filename": c.get("filename") or c.get("pdf_filename"),
            "ha_pdf": bool(c.get("pdf_data")) if "pdf_data" in c else None,
            "presa_visione": cid in accettate,
        })
    return out


@router.get("/{cedolino_id}", summary="Dettaglio busta + registra visualizzazione")
async def dettaglio_busta(cedolino_id: str, request: Request,
                          identity: Dict[str, Any] = Depends(get_identity)):
    doc = await _carica_mia_busta(cedolino_id, identity, proj={"_id": 0, "pdf_data": 0})
    db = Database.get_db()
    await log_evento(
        modulo="cedolini", azione="visualizzazione",
        entita_id=cedolino_id, entita_collection=COLL_CED, db=db,
        fonte="portale", utente=identity["id"],
        dettaglio=f"Visualizzazione busta {doc.get('mese')}/{doc.get('anno')}",
        extra={"ip": _client_ip(request), "user_agent": request.headers.get("user-agent", "")},
    )
    acc = await db[COLL_ACCETT].find_one(
        {"dipendente_id": identity["id"], "cedolino_id": cedolino_id}, {"_id": 0})
    doc["presa_visione"] = bool(acc)
    doc["presa_visione_il"] = acc.get("accettata_il") if acc else None
    return doc


@router.get("/{cedolino_id}/pdf", summary="Scarica il PDF + registra download")
async def scarica_pdf(cedolino_id: str, request: Request,
                      identity: Dict[str, Any] = Depends(get_identity)):
    doc = await _carica_mia_busta(cedolino_id, identity,
                                  proj={"_id": 0, "pdf_data": 1, "filename": 1,
                                        "pdf_filename": 1, "mese": 1, "anno": 1})
    pdf_data = doc.get("pdf_data")
    if not pdf_data:
        raise HTTPException(404, "PDF non disponibile per questa busta")
    try:
        pdf_bytes = base64.b64decode(pdf_data)
    except Exception:
        raise HTTPException(500, "PDF corrotto")

    db = Database.get_db()
    await log_evento(
        modulo="cedolini", azione="download",
        entita_id=cedolino_id, entita_collection=COLL_CED, db=db,
        fonte="portale", utente=identity["id"],
        dettaglio=f"Download busta {doc.get('mese')}/{doc.get('anno')}",
        extra={"ip": _client_ip(request), "user_agent": request.headers.get("user-agent", "")},
    )
    fname = doc.get("pdf_filename") or doc.get("filename") or f"busta_{doc.get('mese')}_{doc.get('anno')}.pdf"
    import io
    return StreamingResponse(
        io.BytesIO(pdf_bytes), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.post("/{cedolino_id}/presa-visione", summary="Conferma presa visione/accettazione")
async def presa_visione(cedolino_id: str, request: Request,
                        identity: Dict[str, Any] = Depends(get_identity)):
    doc = await _carica_mia_busta(cedolino_id, identity, proj={"_id": 0, "id": 1, "mese": 1, "anno": 1})
    db = Database.get_db()
    esistente = await db[COLL_ACCETT].find_one(
        {"dipendente_id": identity["id"], "cedolino_id": cedolino_id}, {"_id": 0})
    if esistente:
        return {"ok": True, "gia_accettata": True, "accettata_il": esistente.get("accettata_il")}

    ip = _client_ip(request)
    ua = request.headers.get("user-agent", "")
    quando = _now()
    await db[COLL_ACCETT].insert_one({
        "id": f"acc_{uuid.uuid4().hex[:12]}",
        "dipendente_id": identity["id"],
        "cedolino_id": cedolino_id,
        "accettata_il": quando, "ip": ip, "user_agent": ua,
    })
    await log_evento(
        modulo="cedolini", azione="presa_visione",
        entita_id=cedolino_id, entita_collection=COLL_CED, db=db,
        fonte="portale", utente=identity["id"],
        dettaglio=f"Presa visione/accettazione busta {doc.get('mese')}/{doc.get('anno')}",
        extra={"ip": ip, "user_agent": ua},
    )
    return {"ok": True, "gia_accettata": False, "accettata_il": quando}


@router.get("/{cedolino_id}/storico-accessi", summary="Storico accessi a questa busta (admin)")
async def storico_accessi(cedolino_id: str,
                          identity: Dict[str, Any] = Depends(get_identity)):
    # admin vede il registro permanente; il dipendente vede solo il proprio
    db = Database.get_db()
    q = {"entita_id": cedolino_id, "entita_collection": COLL_CED}
    if identity.get("role") != "admin":
        await _carica_mia_busta(cedolino_id, identity, proj={"_id": 0, "id": 1})
        q["utente"] = identity["id"]
    return await db["audit_log"].find(q, {"_id": 0}).sort("timestamp", -1).to_list(500)
