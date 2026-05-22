import os
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.getenv("DB_NAME", "Gestionale")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")
