"""Riconciliazione automatica cedolini/bonifici/stato pagamento: job periodico
che richiama gli stessi due passi di "Cedolini & Bonifici" ("🔗 Recupera
bonifici storici", poi "🔄 Sincronizza da cedolini") invece di lasciarli alla
pressione manuale di un bottone.

Trovato in produzione (28-29/08/2026): 887 bonifici stipendio già in archivio
non erano mai stati agganciati alle buste perché il bottone non era mai stato
premuto con successo. Nessun nuovo motore: richiama gli stessi handler del
router, che restano l'unico punto che scrive paghe_mensili/pagamenti_esiti.

Ordine: PRIMA il ponte bonifici (scrive pagamenti_esiti), POI il registro
(che legge pagamenti_esiti): nell'ordine inverso il primo giro dopo l'avvio
popolava il registro senza bonifici. Lo stesso ordine è dentro
`/paghe/sincronizza`, qui si richiama solo quello.

Sul piano free di Render il processo viene spento dopo 15 minuti senza
traffico e riacceso alla prima richiesta: il giro "ogni 6 ore" in pratica
parte 60 secondi dopo ogni avvio. Se in quel momento Render sta già
riavviando il servizio (deploy) la coroutine riceve CancelledError: NON è un
errore del job e non va inghiottito come tale (rilanciato), mentre un errore
vero va loggato con tipo e traceback — prima `{e}` produceva un messaggio
vuoto per un TimeoutError e non si capiva cosa fosse fallito.
"""
import asyncio
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)
_scheduler = None


async def sincronizza_paghe_periodico():
    try:
        from backend.app.routers.dipendenti_cloud import sincronizza_paghe_da_cedolini
        r = await sincronizza_paghe_da_cedolini()
        logger.info(f"Sincronizzazione paghe periodica: {r}")
    except asyncio.CancelledError:
        logger.warning("Sincronizzazione paghe periodica interrotta (processo in spegnimento): riparte al prossimo avvio")
        raise
    except Exception as e:
        logger.error("Sincronizzazione paghe periodica fallita: %r", e, exc_info=True)


def start_scheduler():
    """Avvia il job periodico (best-effort). No-op se APScheduler manca."""
    global _scheduler
    if _scheduler:
        return _scheduler
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
    # intervallo di 6h. misfire_grace_time: un avvio lento (52s a freddo sul piano
    # free) non deve far saltare il primo giro.
    sched.add_job(sincronizza_paghe_periodico, "interval", hours=6, id="sincronizza_paghe",
                  next_run_time=datetime.now(sched.timezone) + timedelta(seconds=60),
                  misfire_grace_time=600, replace_existing=True)
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
