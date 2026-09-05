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
from typing import Dict, Any, Optional

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
    verificati = [dip for dip in candidati
                  if dip.get("pin_hash") and verify_pin(pin, dip["pin_hash"])]
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


def _dipendente_eleggibile(dip: Dict[str, Any]) -> bool:
    """Stesso filtro di login_dipendente_per_nome (attivo, non fuso, non
    cessato/dimesso/archiviato): un dipendente non eleggibile non deve poter
    fare login anche se il suo pin_hash e' ancora sul documento."""
    if dip.get("attivo") is False:
        return False
    if "merged_into" in dip:
        return False
    if dip.get("stato") in ("cessato", "dimesso", "archiviato"):
        return False
    return True


async def login_dipendente(dipendente_id: str, pin: str) -> Optional[Dict[str, Any]]:
    """Valida il PIN del dipendente e ritorna il token, oppure None.

    Unica fonte: il PIN personale del portale (pin_hash sul documento),
    impostato dall'amministratore in Gestione → Accessi. Fino al 03/09/2026
    c'era una seconda fonte, il "PIN della cassa" letto da `tablet_operatori`
    (la tabella operatori di Lotti): in produzione quella tabella qui e' vuota
    da sempre, perche' Lotti sta su un ALTRO progetto Supabase — il ponte non
    ha mai potuto funzionare ed era solo un secondo sistema per la stessa
    funzione. Rimosso.

    Revoca del pin_hash alla cessazione: vedi handlers/dipendente_handlers.py;
    il controllo di eleggibilita' qui copre un pin_hash rimasto sul documento.
    """
    if not _valid_pin_format(pin):
        return None
    db = Database.get_db()
    dip = await db[Collections.EMPLOYEES].find_one({"id": dipendente_id})
    if not dip or not _dipendente_eleggibile(dip):
        return None
    if not (dip.get("pin_hash") and verify_pin(pin, dip["pin_hash"])):
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


async def elenco_dipendenti_per_login() -> Dict[str, Any]:
    """Nomi dei dipendenti attivi, per il selettore di login del portale
    (tocca il tuo nome, poi il PIN — niente più tastiera).
    Decisione esplicita del titolare: reintroduce l'elenco nomi in login
    (prima rimosso per non esporli pre-autenticazione) in cambio di zero
    digitazione, per un dispositivo condiviso in negozio dove la lista dei
    dipendenti non è comunque un segreto. Restituisce solo id+nome: niente
    PIN, ruolo o altri dati — quelli restano protetti dal PIN al login vero.

    Include SOLO chi ha un pin_hash impostato: un dipendente senza PIN sarebbe
    un nome selezionabile il cui PIN viene sempre rifiutato (trovato da una
    review automatica). Il totale dei dipendenti attivi viene restituito a
    parte, così il portale può dire "nessuno ha ancora un PIN" invece di un
    generico "nessun nome" (in produzione, 03/09/2026: 17 attivi, 0 con PIN —
    il selettore appariva vuoto senza spiegare perché)."""
    db = Database.get_db()
    out = []
    attivi = 0
    async for d in db[Collections.EMPLOYEES].find(
            {"attivo": {"$ne": False},
             "merged_into": {"$exists": False},
             "stato": {"$nin": ["cessato", "dimesso", "archiviato"]}}):
        nome = d.get("nome_completo") or f"{d.get('nome', '')} {d.get('cognome', '')}".strip()
        if not (nome and d.get("id")):
            continue
        attivi += 1
        if d.get("pin_hash"):
            out.append({"id": d["id"], "nome": nome})
    out.sort(key=lambda x: x["nome"])
    return {"dipendenti": out, "attivi": attivi}


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
