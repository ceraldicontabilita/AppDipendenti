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


async def login_dipendente_per_nome(nome: str, pin: str) -> Optional[Dict[str, Any]]:
    """Login senza elenco esposto: il dipendente scrive il PROPRIO cognome (o
    nome e cognome) e il PIN. Si cercano i dipendenti attivi che corrispondono
    al nome e si accetta solo quello il cui PIN verifica — così due omonimi non
    collidono e nessun nome viene mai mostrato prima dell'autenticazione."""
    nome = (nome or "").strip()
    if len(nome) < 2 or not _valid_pin_format(pin):
        return None
    db = Database.get_db()
    tokens = [t for t in nome.lower().split() if t]
    candidati = []
    async for d in db[Collections.EMPLOYEES].find(
            {"attivo": {"$ne": False},
             "merged_into": {"$exists": False},
             "stato": {"$nin": ["cessato", "dimesso", "archiviato"]}}):
        completo = (d.get("nome_completo") or f"{d.get('nome', '')} {d.get('cognome', '')}").lower()
        if all(t in completo for t in tokens):
            candidati.append(d)
    verificati = []
    for dip in candidati:
        ok = bool(dip.get("pin_hash")) and verify_pin(pin, dip["pin_hash"])
        if not ok:
            ok = await _pin_operatore_valido(db, dip, pin)
        if ok:
            verificati.append(dip)
    if len(verificati) != 1:
        return None  # nessuno o ambiguo (stesso nome E stesso PIN): niente accesso
    dip = verificati[0]
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


async def _pin_operatore_valido(db, dip: Dict[str, Any], pin: str) -> bool:
    """Verifica il PIN contro la fonte operatori condivisa (tablet_operatori),
    la stessa usata dalla cassa di Lotti. Accetta solo se l'operatore con quel
    PIN corrisponde, per nome, al dipendente selezionato (un dipendente non puo'
    entrare col PIN di un altro). PIN unico cassa+portale, nessuna copia.
    """
    nome_dip = (dip.get("nome_completo") or f"{dip.get('nome','')} {dip.get('cognome','')}").strip().lower()
    if not nome_dip:
        return False
    candidati = []
    try:
        coll = db["tablet_operatori"]
        doc = await coll.find_one({"attivo": True, "pin_chiaro": pin}, {"_id": 0, "nome": 1})
        if doc:
            candidati.append(doc)
        else:
            try:
                import bcrypt
                for d in await coll.find({"attivo": True}, {"_id": 0, "nome": 1, "pin": 1}).to_list(100):
                    h = (d.get("pin") or "")
                    if h.startswith("$2") and bcrypt.checkpw(pin.encode(), h.encode()):
                        candidati.append(d)
                        break
            except Exception:
                pass
    except Exception:
        return False
    for c in candidati:
        nome_op = (c.get("nome") or "").lower().strip()
        if nome_op and (nome_op in nome_dip or all(tok in nome_dip for tok in nome_op.split() if tok)):
            return True
    return False


async def operatore_amministratore(db, pin: str):
    """Operatore con ruolo amministratore e questo PIN, dalla fonte condivisa
    tablet_operatori. Permette l'accesso admin col PIN unico della cassa."""
    try:
        coll = db["tablet_operatori"]
        doc = await coll.find_one(
            {"attivo": True, "pin_chiaro": pin, "ruolo": "amministratore"},
            {"_id": 0, "id": 1, "nome": 1},
        )
        if doc:
            return doc
        try:
            import bcrypt
            for d in await coll.find({"attivo": True, "ruolo": "amministratore"},
                                     {"_id": 0, "id": 1, "nome": 1, "pin": 1}).to_list(50):
                h = (d.get("pin") or "")
                if h.startswith("$2") and bcrypt.checkpw(pin.encode(), h.encode()):
                    return d
        except Exception:
            pass
    except Exception:
        return None
    return None


async def login_dipendente(dipendente_id: str, pin: str) -> Optional[Dict[str, Any]]:
    """Valida il PIN del dipendente e ritorna il token, oppure None.

    Due fonti accettate (PIN unico aziendale):
      1. PIN personale del portale (pin_hash sul documento), se impostato.
      2. PIN della cassa: stessa fonte operatori di Lotti (tablet_operatori).
    """
    if not _valid_pin_format(pin):
        return None
    db = Database.get_db()
    dip = await db[Collections.EMPLOYEES].find_one({"id": dipendente_id})
    if not dip:
        return None
    ok = False
    if dip.get("pin_hash") and verify_pin(pin, dip["pin_hash"]):
        ok = True
    if not ok and await _pin_operatore_valido(db, dip, pin):
        ok = True
    if not ok:
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
