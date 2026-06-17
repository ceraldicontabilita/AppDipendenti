"""Configurazione AppDipendenti — punto unico (oggetto `settings` + costanti)."""
import os
from typing import List


class Settings:
    """Config centrale. I valori sensibili arrivano dalle env di Render."""
    # JWT
    SECRET_KEY: str = os.environ.get("JWT_SECRET", "changeme-secret-key")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 giorni

    # PIN unico (fisso) per il login mobile. Valore SOLO nelle env (PIN_CODE).
    PIN_CODE: str = os.environ.get("PIN_CODE", "")

    # Utente admin a cui il PIN concede accesso (deve esistere in `users`).
    PIN_ADMIN_USERNAME: str = os.environ.get("PIN_ADMIN_USERNAME", "ceraldi")


settings = Settings()

# Retro-compatibilità con chi importa le costanti a modulo.
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
PIN_CODE = settings.PIN_CODE

# Feature flag (usati da require_feature). Vuoto = nessuna feature gated attiva.
FEATURES: dict = {}

CORS_ORIGINS: List[str] = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://ceraldicontabilita.github.io",
    "https://gestionale-ceraldi.onrender.com",
    "*",
]
