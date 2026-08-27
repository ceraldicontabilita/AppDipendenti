"""Database connection per AppDipendenti.

Due backend possibili, scelti dalle env:
  - SUPABASE_DB_URL impostata -> Postgres/Supabase via l'adattatore db_supabase
  - altrimenti                -> MongoDB (motor), il backend storico

L'oggetto restituito da `get_db()` espone la stessa API nei due casi, per cui i
269 punti che chiamano `Database.get_db()` non cambiano.
"""
import os
import logging

logger = logging.getLogger(__name__)

MONGO_URL = os.environ.get("MONGO_URL", "")
DB_NAME = os.environ.get("DB_NAME", "Gestionale")
SUPABASE_DB_URL = os.environ.get("SUPABASE_DB_URL", "")


class Collections:
    """Nomi canonici delle collection (un solo punto di verità)."""
    USERS = "users"
    EMPLOYEES = "dipendenti"
    PAYSLIPS = "cedolini"
    AUDIT_LOG = "audit_log"


class Database:
    client = None
    db = None
    backend: str = ""

    @classmethod
    async def connect(cls):
        if SUPABASE_DB_URL:
            from .db_supabase import crea_database
            cls.db = await crea_database(SUPABASE_DB_URL)
            cls.client = cls.db._pool
            cls.backend = "supabase"
            logger.info("Database: Supabase/Postgres")
            return

        from motor.motor_asyncio import AsyncIOMotorClient
        cls.client = AsyncIOMotorClient(MONGO_URL)
        cls.db = cls.client[DB_NAME]
        cls.backend = "mongo"
        logger.info(f"MongoDB connesso: {DB_NAME}")

    @classmethod
    async def close(cls):
        if cls.client is None:
            return
        if cls.backend == "supabase":
            await cls.client.close()
        else:
            cls.client.close()

    @classmethod
    def get_db(cls):
        return cls.db


def get_database():
    """Accessor funzionale usato dalle dependency FastAPI (Depends)."""
    return Database.get_db()
