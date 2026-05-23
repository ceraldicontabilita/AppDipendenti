"""
AppDipendenti — Backend FastAPI
Gestione HR standalone: dipendenti, cedolini, presenze, TFR, contratti.
DB: MongoDB Atlas — Gestionale (stesso cluster di GestionaleCloud)
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

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
    from .routers.auth import router as auth_router
    from .routers.pin_login import router as pin_router
    from .routers.employees.dipendenti import router as dipendenti_router
    from .routers.employees.buste_paga import router as buste_paga_router
    from .routers.employees.employee_contracts import router as contracts_router
    from .routers.employees.giustificativi import router as giustificativi_router
    from .routers.employees.shifts import router as shifts_router
    from .routers.employees.staff import router as staff_router
    from .routers.employees.fascicolo_dipendente import router as fascicolo_router
    from .routers.cedolini import router as cedolini_router
    from .routers.cedolini_riconciliazione import router as ced_ric_router
    from .routers.tfr import router as tfr_router
    from .routers.attendance import router as attendance_router
    from .routers.attendance_module.presenze import router as presenze_router
    from .routers.attendance_module.timbrature import router as timbrature_router
    from .routers.dimissioni import router as dimissioni_router
    from .routers.salari_unificati_v2 import router as salari_router
    from .routers.bonifici_stipendi import router as bonifici_router
    from .routers.libro_unico_parser import router as libro_router
    from .routers.f24_parser import router as f24_parser_router
    from .routers.payroll import router as payroll_router

    app.include_router(auth_router, prefix="/api/auth", tags=["Auth"])
    app.include_router(pin_router, prefix="/api/auth", tags=["PIN Login"])
    app.include_router(dipendenti_router, prefix="/api/dipendenti", tags=["Dipendenti"])
    app.include_router(buste_paga_router, prefix="/api", tags=["Buste Paga"])
    app.include_router(contracts_router, prefix="/api/contracts", tags=["Contratti"])
    app.include_router(giustificativi_router, prefix="/api/giustificativi", tags=["Giustificativi"])
    app.include_router(shifts_router, prefix="/api/shifts", tags=["Turni"])
    app.include_router(staff_router, prefix="/api/staff", tags=["Staff"])
    app.include_router(fascicolo_router, prefix="/api", tags=["Fascicolo Dipendente"])
    app.include_router(ced_ric_router, prefix="/api/cedolini", tags=["Cedolini Riconciliazione"])
    app.include_router(cedolini_router, prefix="/api/cedolini", tags=["Cedolini"])
    app.include_router(tfr_router, prefix="/api/tfr", tags=["TFR"])
    app.include_router(attendance_router, prefix="/api/attendance", tags=["Attendance"])
    app.include_router(presenze_router, prefix="/api/attendance", tags=["Presenze"])
    app.include_router(timbrature_router, prefix="/api/attendance", tags=["Timbrature"])
    app.include_router(dimissioni_router, prefix="/api/dimissioni", tags=["Dimissioni"])
    app.include_router(salari_router, prefix="/api/salari-v2", tags=["Salari V2"])
    app.include_router(bonifici_router, tags=["Bonifici Stipendi"])
    app.include_router(libro_router, prefix="/api/paghe", tags=["Libro Unico"])
    app.include_router(f24_parser_router, prefix="/api/paghe", tags=["F24 Parser"])
    app.include_router(payroll_router, prefix="/api/payroll", tags=["Payroll"])

    logger.info("✅ Tutti i router HR registrati")


register_routers()


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": "AppDipendenti", "db": "Gestionale"}


# Serve frontend React in produzione
STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.exists(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
