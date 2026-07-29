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
