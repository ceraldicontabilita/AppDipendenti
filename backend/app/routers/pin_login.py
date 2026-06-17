"""
PIN Login router — accesso rapido via PIN dall'app mobile Ceraldi.

Il PIN è UNICO e FISSO, concede un JWT admin. Il valore vive SOLO nelle env
di Render (PIN_CODE): non è mai scritto nel codice. Viene confrontato come
hash SHA-256 calcolato a runtime, mai persistito in chiaro.

Flow:
  POST /api/auth/pin-login   body: {"pin": "<pin>"}
  -> {"access_token": "...", "token_type": "bearer", ...}
"""
from fastapi import APIRouter, HTTPException, Body, Request, status
from datetime import datetime, timedelta, timezone
from typing import Dict, Any
import hashlib
import hmac
import logging
import time

from jose import jwt

from backend.app.config import settings
from backend.app.database import Database, Collections
from backend.app.repositories import UserRepository
from backend.app.services.auth_dipendenti import login_dipendente, lista_login

logger = logging.getLogger(__name__)
router = APIRouter()

PIN_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES

# ---- anti brute force (in-memory, per IP) ----
_FAILED_ATTEMPTS: Dict[str, Dict[str, Any]] = {}
MAX_ATTEMPTS = 8
LOCK_SECONDS = 60


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _is_locked(ip: str) -> int:
    rec = _FAILED_ATTEMPTS.get(ip)
    if not rec:
        return 0
    if rec.get("locked_until", 0) > time.time():
        return int(rec["locked_until"] - time.time())
    return 0


def _register_failure(ip: str):
    rec = _FAILED_ATTEMPTS.get(ip) or {"count": 0, "locked_until": 0}
    rec["count"] += 1
    if rec["count"] >= MAX_ATTEMPTS:
        rec["locked_until"] = time.time() + LOCK_SECONDS
        rec["count"] = 0
        logger.warning(f"PIN-login: IP {ip} bloccato per {LOCK_SECONDS}s")
    _FAILED_ATTEMPTS[ip] = rec


def _clear_failures(ip: str):
    _FAILED_ATTEMPTS.pop(ip, None)


def _pin_ok(pin: str) -> bool:
    """Confronto costante tra l'hash del PIN inviato e quello configurato (env)."""
    configured = settings.PIN_CODE or ""
    if not configured:
        return False
    sent = hashlib.sha256(pin.encode("utf-8")).hexdigest()
    expected = hashlib.sha256(configured.encode("utf-8")).hexdigest()
    return hmac.compare_digest(sent, expected)


@router.post("/pin-login", summary="Login via PIN (mobile app)")
async def pin_login(
    request: Request,
    payload: Dict[str, Any] = Body(..., example={"pin": "******"}),
) -> Dict[str, Any]:
    ip = _client_ip(request)

    lock_sec = _is_locked(ip)
    if lock_sec > 0:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            f"Troppi tentativi, riprova tra {lock_sec}s")

    pin = str(payload.get("pin", "")).strip()
    dipendente_id = payload.get("dipendente_id")

    # --- Ramo dipendente: dipendente_id + PIN personale ---
    if dipendente_id:
        result = await login_dipendente(str(dipendente_id), pin)
        if not result:
            _register_failure(ip)
            logger.warning(f"PIN-login dipendente fallito da IP {ip}")
            raise HTTPException(401, "Credenziali non valide")
        _clear_failures(ip)
        logger.info(f"PIN-login dipendente OK · IP {ip} · {result['user_id']} · {result['role']}")
        return result

    # --- Ramo admin: PIN unico da env ---
    if not settings.PIN_CODE:
        logger.error("PIN-login: PIN_CODE non configurato nelle env")
        raise HTTPException(503, "Login PIN non configurato")

    if not pin.isdigit() or not (4 <= len(pin) <= 12):
        _register_failure(ip)
        raise HTTPException(400, "PIN non valido")

    if not _pin_ok(pin):
        _register_failure(ip)
        logger.warning(f"PIN-login: PIN errato da IP {ip}")
        raise HTTPException(401, "PIN non valido")

    db = Database.get_db()
    user_repo = UserRepository(db[Collections.USERS])

    user = None
    try:
        user = await user_repo.find_by_username(settings.PIN_ADMIN_USERNAME)
    except Exception:
        user = None
    if not user:
        user = await db[Collections.USERS].find_one({"role": "admin"})
    if not user:
        user = await db[Collections.USERS].find_one({"is_active": True})
    if not user:
        logger.error("PIN-login: nessun utente admin nel DB")
        raise HTTPException(500, "Nessun utente admin configurato")

    user_id = str(user.get("id") or user.get("_id"))
    expire = datetime.now(timezone.utc) + timedelta(minutes=PIN_TOKEN_EXPIRE_MINUTES)
    token = jwt.encode(
        {
            "sub": user_id,
            "email": user.get("email", ""),
            "name": user.get("name"),
            "role": user.get("role", "admin"),
            "exp": expire,
            "iat": datetime.now(timezone.utc),
            "auth_method": "pin",
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )

    try:
        await user_repo.update_last_login(user_id)
    except Exception:
        pass

    _clear_failures(ip)
    logger.info(f"PIN-login OK · IP {ip} · user {user_id} · role {user.get('role')}")

    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": user_id,
        "email": user.get("email", ""),
        "name": user.get("name"),
        "role": user.get("role", "admin"),
        "auth_method": "pin",
    }


@router.get("/dipendenti-login", summary="Elenco dipendenti per schermata login mobile")
async def dipendenti_login_list():
    """Lista (id, nome, mansione, ruolo) dei dipendenti con PIN attivo. Nessun dato sensibile."""
    return await lista_login()


@router.get("/pin-login/health", summary="Health check PIN login")
async def pin_login_health() -> Dict[str, Any]:
    return {
        "ok": True,
        "configured": bool(settings.PIN_CODE),
        "admin_username": settings.PIN_ADMIN_USERNAME,
        "token_expire_minutes": PIN_TOKEN_EXPIRE_MINUTES,
    }
