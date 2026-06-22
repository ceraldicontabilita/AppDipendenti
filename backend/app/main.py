"""AppDipendenti — Backend FastAPI."""
import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .database import Database
from .config import CORS_ORIGINS

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await Database.connect()
    try:
        from .services.scadenze_scheduler import start_scheduler
        start_scheduler()
    except Exception as e:
        logger.warning(f"Scadenzario non avviato: {e}")
    yield
    try:
        from .services.scadenze_scheduler import stop_scheduler
        stop_scheduler()
    except Exception:
        pass
    await Database.close()


app = FastAPI(title="AppDipendenti — Ceraldi Group", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def register_routers():
    # Autenticazione strict per l'area gestione (niente bypass).
    from .utils.dependencies import require_admin, require_staff

    from .routers import auth, pin_login
    app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
    app.include_router(pin_login.router, prefix="/api/auth", tags=["PIN Login"])

    # Dipendenze di sicurezza riusate. STAFF = admin o responsabile_turni; ADMIN = solo admin.
    STAFF = [Depends(require_staff)]
    ADMIN = [Depends(require_admin)]

    from .routers.employees import dipendenti, buste_paga, employee_contracts, giustificativi, shifts, fascicolo_dipendente, accessi
    app.include_router(dipendenti.router, prefix="/api/dipendenti", tags=["Dipendenti"], dependencies=STAFF)
    app.include_router(accessi.router, prefix="/api/accessi", tags=["Accessi"])  # già protetto per-endpoint (admin)
    app.include_router(buste_paga.router, prefix="/api", tags=["Buste Paga"], dependencies=ADMIN)
    # Contratti: solo amministratore (JWT valido + ruolo admin).
    app.include_router(employee_contracts.router, prefix="/api/contracts", tags=["Contratti"],
                       dependencies=ADMIN)
    app.include_router(giustificativi.router, prefix="/api/giustificativi", tags=["Giustificativi"], dependencies=STAFF)
    app.include_router(shifts.router, prefix="/api/shifts", tags=["Turni"], dependencies=STAFF)
    app.include_router(fascicolo_dipendente.router, prefix="/api", tags=["Fascicolo"], dependencies=STAFF)

    from .routers import cedolini, cedolini_riconciliazione, tfr, attendance, dimissioni, richieste, portale_buste, turni, notifiche
    from .routers import dipendenti_cloud
    from .routers import portale_documenti
    from .routers import timbrature
    app.include_router(timbrature.router, prefix="/api/timbrature", tags=["Timbrature"])
    app.include_router(richieste.router, prefix="/api/richieste", tags=["Richieste"])
    app.include_router(portale_buste.router, prefix="/api/portale/buste", tags=["Portale Buste"])
    app.include_router(portale_documenti.router, prefix="/api/portale/documenti", tags=["Portale Documenti"])
    app.include_router(turni.router, prefix="/api/turni", tags=["Turni"])
    app.include_router(notifiche.router, prefix="/api/notifiche", tags=["Notifiche"])
    # App "Dipendenti in Cloud" (8 pagine HR) -> /api/dipendenti-cloud
    # Area gestione: JWT valido + ruolo admin o responsabile_turni (la pagina
    # Turni del responsabile carica dati da questo router).
    app.include_router(dipendenti_cloud.router, prefix="/api", tags=["Dipendenti Cloud"],
                       dependencies=[Depends(require_staff)])
    app.include_router(cedolini_riconciliazione.router, prefix="/api/cedolini", tags=["Cedolini Ric."], dependencies=ADMIN)
    app.include_router(cedolini.router, prefix="/api/cedolini", tags=["Cedolini"], dependencies=ADMIN)
    app.include_router(tfr.router, prefix="/api/tfr", tags=["TFR"], dependencies=ADMIN)
    app.include_router(attendance.router, prefix="/api/attendance", tags=["Presenze"], dependencies=STAFF)
    app.include_router(dimissioni.router, prefix="/api/dimissioni", tags=["Dimissioni"], dependencies=ADMIN)

    from .routers import libro_unico_parser, f24_parser, bonifici_stipendi, salari_unificati_v2
    app.include_router(libro_unico_parser.router, prefix="/api/paghe", tags=["Libro Unico"], dependencies=ADMIN)
    app.include_router(f24_parser.router, prefix="/api/paghe", tags=["F24 Parser"], dependencies=ADMIN)
    app.include_router(bonifici_stipendi.router, tags=["Bonifici Stipendi"], dependencies=ADMIN)
    app.include_router(salari_unificati_v2.router, prefix="/api/salari-v2", tags=["Salari V2"], dependencies=ADMIN)

    logger.info("✅ Router AppDipendenti registrati")


register_routers()


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": "AppDipendenti", "version": "1.0.0"}


# Serve frontend React in produzione
STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.exists(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
