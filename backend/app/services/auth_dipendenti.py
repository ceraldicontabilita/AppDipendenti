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
    """Elenco dipendenti per la schermata di login del portale.

    Mostra TUTTI i dipendenti attivi: chi non ha ancora un PIN lo crea al primo
    accesso (flag pin_impostato=False). Nessun dato sensibile.
    """
    db = Database.get_db()
    cursor = db[Collections.EMPLOYEES].find(
        {"attivo": {"$ne": False},
         "merged_into": {"$exists": False},
         "stato": {"$nin": ["cessato", "dimesso", "archiviato"]}},
        {"_id": 0, "id": 1, "nome_completo": 1, "nome": 1, "cognome": 1,
         "mansione": 1, "ruolo": 1, "ruolo_app": 1, "pin_hash": 1},
    )
    # Gli amministratori accedono SOLO da "Accesso amministratore", non dalla lista.
    ESCLUSI = [("vincenzo", "ceraldi"), ("valerio", "ceraldi")]
    out = []
    for d in await cursor.to_list(500):
        if not d.get("id"):
            continue
        if d.get("ruolo_app") == "admin":
            continue
        nome = (d.get("nome_completo") or f"{d.get('nome','')} {d.get('cognome','')}").strip()
        if not nome:
            continue
        _fn = nome.lower()
        if any(a in _fn and b in _fn for a, b in ESCLUSI):
            continue
        out.append({
            "id": d.get("id"),
            "nome_completo": nome,
            "mansione": d.get("mansione", "") or d.get("ruolo", ""),
            "ruolo_app": d.get("ruolo_app", "dipendente"),
            "pin_impostato": bool(d.get("pin_hash")),
        })
    out.sort(key=lambda x: x["nome_completo"].lower())
    return out


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
