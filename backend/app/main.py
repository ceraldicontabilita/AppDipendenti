"""AppDipendenti — Backend FastAPI."""
import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
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
    yield
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
    from .routers import auth, pin_login
    app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
    app.include_router(pin_login.router, prefix="/api/auth", tags=["PIN Login"])

    from .routers.employees import dipendenti, buste_paga, employee_contracts, giustificativi, shifts, fascicolo_dipendente
    app.include_router(dipendenti.router, prefix="/api/dipendenti", tags=["Dipendenti"])
    app.include_router(buste_paga.router, prefix="/api", tags=["Buste Paga"])
    app.include_router(employee_contracts.router, prefix="/api/contracts", tags=["Contratti"])
    app.include_router(giustificativi.router, prefix="/api/giustificativi", tags=["Giustificativi"])
    app.include_router(shifts.router, prefix="/api/shifts", tags=["Turni"])
    app.include_router(fascicolo_dipendente.router, prefix="/api", tags=["Fascicolo"])

    from .routers import cedolini, cedolini_riconciliazione, tfr, attendance, dimissioni
    app.include_router(cedolini_riconciliazione.router, prefix="/api/cedolini", tags=["Cedolini Ric."])
    app.include_router(cedolini.router, prefix="/api/cedolini", tags=["Cedolini"])
    app.include_router(tfr.router, prefix="/api/tfr", tags=["TFR"])
    app.include_router(attendance.router, prefix="/api/attendance", tags=["Presenze"])
    app.include_router(dimissioni.router, prefix="/api/dimissioni", tags=["Dimissioni"])

    from .routers.attendance_module import presenze, timbrature
    app.include_router(presenze.router, prefix="/api/attendance", tags=["Presenze modulo"])
    app.include_router(timbrature.router, prefix="/api/attendance", tags=["Timbrature"])

    from .routers import libro_unico_parser, f24_parser, bonifici_stipendi, salari_unificati_v2
    app.include_router(libro_unico_parser.router, prefix="/api/paghe", tags=["Libro Unico"])
    app.include_router(f24_parser.router, prefix="/api/paghe", tags=["F24 Parser"])
    app.include_router(bonifici_stipendi.router, tags=["Bonifici Stipendi"])
    app.include_router(salari_unificati_v2.router, prefix="/api/salari-v2", tags=["Salari V2"])

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
