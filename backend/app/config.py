"""Configurazione AppDipendenti."""
import os
from typing import List

SECRET_KEY = os.environ.get("JWT_SECRET", "changeme-secret-key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 giorni

CORS_ORIGINS: List[str] = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://ceraldicontabilita.github.io",
    "https://gestionale-ceraldi.onrender.com",
    "*",
]

PIN_CODE = os.environ.get("PIN_CODE", "141574")
