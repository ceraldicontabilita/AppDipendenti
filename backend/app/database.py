"""Database connection per AppDipendenti."""
import os
import logging
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)

MONGO_URL = os.environ.get("MONGO_URL", "")
DB_NAME = os.environ.get("DB_NAME", "Gestionale")


class Collections:
    """Nomi canonici delle collection MongoDB (un solo punto di verità)."""
    USERS = "users"
    EMPLOYEES = "dipendenti"
    PAYSLIPS = "cedolini"
    AUDIT_LOG = "audit_log"


class Database:
    client: AsyncIOMotorClient = None
    db = None

    @classmethod
    async def connect(cls):
        cls.client = AsyncIOMotorClient(MONGO_URL)
        cls.db = cls.client[DB_NAME]
        logger.info(f"MongoDB connesso: {DB_NAME}")

    @classmethod
    async def close(cls):
        if cls.client:
            cls.client.close()

    @classmethod
    def get_db(cls):
        return cls.db


def get_database():
    """Accessor funzionale usato dalle dependency FastAPI (Depends)."""
    return Database.get_db()
