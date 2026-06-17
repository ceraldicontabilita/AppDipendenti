"""
Autenticazione per-dipendente via PIN personale.

Ogni dipendente ha un PIN personale (salvato come hash sul suo documento, mai
in chiaro) e un `ruolo_app`. Il login richiede dipendente_id + pin, così non ci
sono collisioni tra PIN uguali. Emette un JWT coerente con il resto del portale
(jose + settings), con role = ruolo_app.
"""
import hashlib
import hmac
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional

from jose import jwt

from backend.app.config import settings
from backend.app.database import Database, Collections

logger = logging.getLogger(__name__)

RUOLI_VALIDI = {"dipendente", "responsabile_turni", "admin"}


def hash_pin(pin: str) -> str:
    return hashlib.sha256(pin.encode("utf-8")).hexdigest()


def verify_pin(pin: str, pin_hash: str) -> bool:
    if not pin or not pin_hash:
        return False
    return hmac.compare_digest(hash_pin(pin), pin_hash)


def _valid_pin_format(pin: str) -> bool:
    return bool(pin) and pin.isdigit() and 4 <= len(pin) <= 8


def crea_token_dipendente(dip: Dict[str, Any]) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": dip["id"],
        "name": dip.get("nome_completo", ""),
        "role": dip.get("ruolo_app", "dipendente"),
        "tipo": "dipendente",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "auth_method": "pin_dipendente",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def lista_login() -> List[Dict[str, Any]]:
    """Elenco dipendenti che possono accedere (PIN impostato). Niente dati sensibili."""
    db = Database.get_db()
    cursor = db[Collections.EMPLOYEES].find(
        {"pin_hash": {"$exists": True, "$ne": None},
         "attivo": {"$ne": False},
         "merged_into": {"$exists": False}},
        {"_id": 0, "id": 1, "nome_completo": 1, "mansione": 1, "ruolo_app": 1},
    ).sort("nome_completo", 1)
    out = []
    for d in await cursor.to_list(500):
        out.append({
            "id": d.get("id"),
            "nome_completo": d.get("nome_completo", ""),
            "mansione": d.get("mansione", ""),
            "ruolo_app": d.get("ruolo_app", "dipendente"),
        })
    return out


async def login_dipendente(dipendente_id: str, pin: str) -> Optional[Dict[str, Any]]:
    """Valida pin contro il dipendente. Ritorna dict con token oppure None."""
    if not _valid_pin_format(pin):
        return None
    db = Database.get_db()
    dip = await db[Collections.EMPLOYEES].find_one({"id": dipendente_id})
    if not dip or not dip.get("pin_hash"):
        return None
    if not verify_pin(pin, dip["pin_hash"]):
        return None
    token = crea_token_dipendente(dip)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": dip["id"],
        "name": dip.get("nome_completo", ""),
        "role": dip.get("ruolo_app", "dipendente"),
        "tipo": "dipendente",
        "auth_method": "pin_dipendente",
    }


async def imposta_pin(dipendente_id: str, pin: str) -> bool:
    if not _valid_pin_format(pin):
        raise ValueError("PIN non valido: 4-8 cifre")
    db = Database.get_db()
    r = await db[Collections.EMPLOYEES].update_one(
        {"id": dipendente_id},
        {"$set": {"pin_hash": hash_pin(pin),
                  "pin_updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return r.matched_count > 0


async def rimuovi_pin(dipendente_id: str) -> bool:
    db = Database.get_db()
    r = await db[Collections.EMPLOYEES].update_one(
        {"id": dipendente_id}, {"$unset": {"pin_hash": "", "pin_updated_at": ""}}
    )
    return r.matched_count > 0


async def imposta_ruolo(dipendente_id: str, ruolo_app: str) -> bool:
    if ruolo_app not in RUOLI_VALIDI:
        raise ValueError(f"Ruolo non valido: {ruolo_app}")
    db = Database.get_db()
    r = await db[Collections.EMPLOYEES].update_one(
        {"id": dipendente_id}, {"$set": {"ruolo_app": ruolo_app}}
    )
    return r.matched_count > 0
