"""Fix una-tantum richiesti dal titolare in chat, applicati all'avvio dell'app.

Ogni fix ha un marcatore in `impostazioni` per essere eseguito UNA VOLTA SOLA:
così se il titolare in futuro riattiva a mano un dipendente, un riavvio non
riapplica la cessazione. Quando un fix risulta applicato in produzione, la sua
voce si può rimuovere da questo modulo.
"""
import logging
from datetime import datetime, timezone

from backend.app.database import Database

logger = logging.getLogger(__name__)


async def applica_fix_avvio():
    """Fix una-tantum in ordine di richiesta (ognuno col suo marcatore)."""
    await _fix_lubrano_cessato()
    await _fix_nome_carotenuto()


async def _fix_lubrano_cessato():
    """29/07/2026 — Lubrano Di Diego Cristian non è più in carico: va cessato
    (sparisce da Turni e da tutte le liste dei dipendenti attivi), con lo stesso
    iter del pulsante 'Cessa' in Anagrafica (evento DIPENDENTE_CESSATO)."""
    try:
        db = Database.get_db()
        fix_id = "startup_fix_lubrano_cessato"
        if await db.impostazioni.find_one({"id": fix_id}):
            return
        oggi = datetime.now(timezone.utc).date().isoformat()
        adesso = datetime.now(timezone.utc).isoformat()
        cessati = []
        async for d in db.dipendenti.find(
                {"merged_into": {"$exists": False},
                 "$or": [{"cognome": {"$regex": "lubrano", "$options": "i"}},
                         {"nome_completo": {"$regex": "lubrano", "$options": "i"}}]},
                {"_id": 0}):
            if (d.get("stato") or "") == "cessato":
                continue
            nome = d.get("nome_completo") or f"{d.get('cognome', '')} {d.get('nome', '')}".strip()
            await db.dipendenti.update_one({"id": d["id"]}, {"$set": {
                "stato": "cessato", "attivo": False,
                "data_dimissione": oggi, "cessato_il": adesso,
                "motivo_cessazione": "non più in carico (richiesta titolare)",
            }})
            try:
                from backend.app.services.event_bus import propagate_event, EventTypes
                await propagate_event(EventTypes.DIPENDENTE_CESSATO, {
                    "dipendente_id": d["id"], "nome_completo": nome,
                    "data_cessazione": oggi,
                }, db, source_module="startup_fix", user="system")
            except Exception as e:
                logger.warning(f"Fix Lubrano: evento cessazione non propagato per {nome}: {e}")
            cessati.append(nome)
        await db.impostazioni.update_one(
            {"id": fix_id},
            {"$set": {"id": fix_id, "done": True, "applicato_il": adesso, "cessati": cessati}},
            upsert=True)
        if cessati:
            logger.info(f"Fix avvio: cessati {cessati}")
        else:
            logger.info("Fix avvio: nessun Lubrano attivo trovato, marcato come applicato")
    except Exception as e:
        logger.warning(f"Fix avvio non riuscito (non blocca l'avvio): {e}")


async def _fix_nome_carotenuto():
    """29/07/2026 — refuso in anagrafica: 'CARATENUTO' va corretto in
    'CAROTENUTO ANTONELLA' (cognome CAROTENUTO, nome ANTONELLA)."""
    try:
        db = Database.get_db()
        fix_id = "startup_fix_nome_carotenuto"
        if await db.impostazioni.find_one({"id": fix_id}):
            return
        adesso = datetime.now(timezone.utc).isoformat()
        corretti = []
        async for d in db.dipendenti.find(
                {"merged_into": {"$exists": False},
                 "$or": [{"cognome": {"$regex": "caratenuto", "$options": "i"}},
                         {"nome": {"$regex": "caratenuto", "$options": "i"}},
                         {"nome_completo": {"$regex": "caratenuto", "$options": "i"}}]},
                {"_id": 0}):
            await db.dipendenti.update_one({"id": d["id"]}, {"$set": {
                "cognome": "CAROTENUTO", "nome": "ANTONELLA",
                "nome_completo": "CAROTENUTO ANTONELLA",
            }})
            corretti.append(d.get("nome_completo") or f"{d.get('cognome', '')} {d.get('nome', '')}".strip())
        await db.impostazioni.update_one(
            {"id": fix_id},
            {"$set": {"id": fix_id, "done": True, "applicato_il": adesso, "corretti": corretti}},
            upsert=True)
        if corretti:
            logger.info(f"Fix avvio: corretti in CAROTENUTO ANTONELLA: {corretti}")
        else:
            logger.info("Fix avvio: nessun 'Caratenuto' trovato, marcato come applicato")
    except Exception as e:
        logger.warning(f"Fix nome Carotenuto non riuscito (non blocca l'avvio): {e}")
