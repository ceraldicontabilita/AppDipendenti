"""Caricamento una-tantum dei periodi TFR forniti dal titolare in chat (28/07/2026).

All'avvio dell'app inserisce la scaletta di Vespa nel simulatore TFR, così il
titolare non deve caricare l'Excel a mano. È idempotente: se il dipendente ha
già periodi salvati non tocca NULLA (quindi non sovrascrive mai modifiche fatte
dopo dall'interfaccia). Quando i dati saranno confermati in produzione, questo
modulo si può rimuovere.
"""
import logging
from datetime import datetime, timezone
from uuid import uuid4

from backend.app.database import Database
from backend.app.routers.tfr import _calcola_periodo_tfr

logger = logging.getLogger(__name__)

# (data_inizio, data_fine | None = periodo in corso, importo settimanale)
_PERIODI_VESPA = [
    ("2015-07-22", "2015-12-31", 240.0),
    ("2016-01-01", "2016-12-31", 240.0),
    ("2017-01-01", "2017-12-31", 250.0),
    ("2018-01-01", "2018-12-31", 250.0),
    ("2019-01-01", "2019-12-31", 270.0),
    ("2020-01-01", "2020-12-31", 270.0),
    ("2021-01-01", "2021-12-31", 270.0),
    ("2022-01-01", "2022-12-31", 300.0),
    ("2023-01-01", "2023-12-31", 300.0),
    ("2024-01-01", "2024-12-31", 300.0),
    ("2025-09-01", "2025-12-31", 350.0),
    ("2026-01-01", None, 350.0),  # in corso: matura da solo fino ad oggi
]

_CF_VESPA = "VSPVCN67T26F839P"


async def seed_tfr_periodi():
    """Inserisce i periodi di Vespa se non ne ha già (mai sovrascrivere)."""
    try:
        db = Database.get_db()
        dip = await db.dipendenti.find_one({"codice_fiscale": _CF_VESPA}, {"_id": 0, "id": 1})
        if not dip:
            dip = await db.dipendenti.find_one(
                {"merged_into": {"$exists": False},
                 "$or": [{"cognome": {"$regex": "vespa", "$options": "i"}},
                         {"nome_completo": {"$regex": "vespa", "$options": "i"}}]},
                {"_id": 0, "id": 1})
        if not dip:
            logger.warning("Seed TFR: dipendente Vespa non trovato in anagrafica, salto")
            return
        esistenti = await db.tfr_simulazione_periodi.count_documents({"dipendente_id": dip["id"]})
        if esistenti:
            return  # già popolato (o modificato a mano): non toccare
        for inizio, fine, importo in _PERIODI_VESPA:
            periodo = {
                "id": str(uuid4()), "dipendente_id": dip["id"],
                "data_inizio": inizio, "data_fine": fine,
                "importo_settimanale": importo, "aliquota_tassazione": 23.0,
                "chiuso_automaticamente": False, "fonte": "seed_chat_titolare",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            if fine:
                periodo.update(_calcola_periodo_tfr(
                    datetime.strptime(inizio, "%Y-%m-%d"), datetime.strptime(fine, "%Y-%m-%d"),
                    importo, 23.0))
            await db.tfr_simulazione_periodi.insert_one(periodo)
        logger.info(f"Seed TFR: caricati {len(_PERIODI_VESPA)} periodi per Vespa")
    except Exception as e:
        logger.warning(f"Seed TFR non riuscito (non blocca l'avvio): {e}")
