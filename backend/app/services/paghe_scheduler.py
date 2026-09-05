"""Riconciliazione automatica cedolini/bonifici/stato pagamento: job periodico
che richiama gli stessi due endpoint già esistenti in "Cedolini & Bonifici"
("🔄 Sincronizza da cedolini" e "🔗 Recupera bonifici storici") invece di
lasciarli alla pressione manuale di un bottone.

Trovato in produzione (28-29/08/2026): 887 bonifici stipendio già in archivio
(dipendente_id + competenza noti) non erano mai stati agganciati alle buste
perché il bottone "Recupera bonifici storici" non era mai stato premuto con
successo — 333 buste risultavano ancora "in attesa di pagamento" nonostante il
bonifico corrispondente fosse già disponibile. Nessun nuovo motore: richiama
gli stessi due handler del router (`sincronizza_paga_da_cedolini`,
`sincronizza_bonifici_storici`), che restano l'unico punto che scrive
paghe_mensili/pagamenti_esiti — qui si automatizza solo la chiamata.
"""
import logging
import os
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)
_scheduler = None

# Interruttore d'emergenza (05/09/2026): dopo la PR #30 e il suo revert, il
# giro automatico uccideva il processo ~40 s dopo l'avvio (nessuna eccezione
# loggata: kill duro, presumibilmente memoria) mandando l'app in 503 continuo.
# Con PAGHE_SCHEDULER_ENABLED=false il job non parte; i due bottoni manuali in
# "Cedolini & Bonifici" restano disponibili come prima del 29/08/2026.
def _scheduler_abilitato() -> bool:
    return os.environ.get("PAGHE_SCHEDULER_ENABLED", "true").strip().lower() not in ("0", "false", "no", "off")


async def sincronizza_paghe_periodico():
    try:
        from backend.app.routers.dipendenti_cloud import (
            sincronizza_paghe_da_cedolini, sincronizza_bonifici_storici)
        r1 = await sincronizza_paghe_da_cedolini()
        r2 = await sincronizza_bonifici_storici()
        logger.info(f"Sincronizzazione paghe periodica: cedolini={r1} bonifici_storici={r2}")
    except Exception as e:
        logger.error(f"Sincronizzazione paghe periodica fallita: {e}")


def start_scheduler():
    """Avvia il job periodico (best-effort). No-op se APScheduler manca."""
    global _scheduler
    if _scheduler:
        return _scheduler
    if not _scheduler_abilitato():
        logger.warning("Scheduler sincronizzazione paghe DISATTIVATO da PAGHE_SCHEDULER_ENABLED: "
                       "usare i bottoni manuali in Cedolini & Bonifici")
        return None
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
    except Exception as e:
        logger.warning(f"APScheduler non disponibile, sincronizzazione paghe disattivata: {e}")
        return None

    sched = AsyncIOScheduler(timezone="Europe/Rome")
    # datetime.now() e' naive nel fuso del processo (UTC su Render), ma APScheduler
    # interpreta un next_run_time naive nel fuso DELLO SCHEDULER (Rome, +1/+2h) —
    # senza .now(sched.timezone) il primo giro risulterebbe nel passato e verrebbe
    # saltato (misfire), rimandando la prima sincronizzazione a dopo il prossimo
    # intervallo di 6h. Trovato da un review automatico prima del deploy.
    sched.add_job(sincronizza_paghe_periodico, "interval", hours=6, id="sincronizza_paghe",
                  next_run_time=datetime.now(sched.timezone) + timedelta(seconds=60),
                  replace_existing=True)
    sched.start()
    _scheduler = sched
    logger.info("Scheduler sincronizzazione paghe avviato (ogni 6h)")
    return sched


def stop_scheduler():
    global _scheduler
    if _scheduler:
        try:
            _scheduler.shutdown(wait=False)
        except Exception:
            pass
        _scheduler = None
