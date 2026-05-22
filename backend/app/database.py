from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from typing import Optional
import logging
from .config import MONGO_URL, DB_NAME

logger = logging.getLogger(__name__)


class Database:
    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None

    @classmethod
    async def connect(cls):
        logger.info("Connessione a MongoDB Atlas...")
        cls.client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
        cls.db = cls.client[DB_NAME]
        await cls.client.admin.command("ping")
        logger.info(f"✅ Connesso a DB: {DB_NAME}")

        # Indexes
        try:
            await cls.db.dipendenti_cloud.create_index("id", unique=True, sparse=True)
            await cls.db.presenze_cloud.create_index([("dipendente_id", 1), ("data", 1)])
            await cls.db.ferie_cloud.create_index([("dipendente_id", 1), ("stato", 1)])
            await cls.db.turni_cloud.create_index("id", unique=True, sparse=True)
            await cls.db.missioni_cloud.create_index([("dipendente_id", 1), ("stato", 1)])
            await cls.db.documenti_cloud.create_index("dipendente_id")
        except Exception as e:
            logger.warning(f"Index warning: {e}")

    @classmethod
    async def close(cls):
        if cls.client:
            cls.client.close()

    @classmethod
    def get_db(cls) -> AsyncIOMotorDatabase:
        if cls.db is None:
            raise RuntimeError("Database non inizializzato")
        return cls.db
