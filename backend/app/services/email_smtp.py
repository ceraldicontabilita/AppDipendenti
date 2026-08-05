"""Invio email via SMTP — punto unico di risoluzione delle credenziali.

Un solo sistema per tutte le email dell'app (presenze al commercialista,
notifiche richieste dal portale...): niente logica SMTP duplicata in più router.

Ordine di risoluzione (nessuna nuova variabile da chiedere se è già configurato
l'account Gmail amministrativo, come nel GestionaleCloud):
  1. SMTP_HOST/SMTP_PORT + SMTP_EMAIL|SMTP_USER + SMTP_PASSWORD
  2. PEC_HOST/PEC_PORT + PEC_USER + PEC_PASSWORD
  3. GMAIL_APP_PASSWORD (+ ADMIN_EMAIL o GMAIL_ACCOUNT_AMMINISTRATIVO) → smtp.gmail.com:465
Credenziali SOLO nelle env di Render, mai nel codice/chat.
"""
import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Optional, Sequence, Tuple


def credenziali_smtp() -> Optional[dict]:
    host = os.getenv("SMTP_HOST") or os.getenv("PEC_HOST")
    port_str = os.getenv("SMTP_PORT") or os.getenv("PEC_PORT")
    user = os.getenv("SMTP_EMAIL") or os.getenv("SMTP_USER") or os.getenv("PEC_USER")
    pwd = os.getenv("SMTP_PASSWORD") or os.getenv("PEC_PASSWORD")
    if not (host and user and pwd):
        gmail_pwd = os.getenv("GMAIL_APP_PASSWORD")
        gmail_user = os.getenv("GMAIL_ACCOUNT_AMMINISTRATIVO") or os.getenv("ADMIN_EMAIL")
        if gmail_pwd and gmail_user:
            host = host or "smtp.gmail.com"
            user = user or gmail_user
            # l'app password di Gmail si copia spesso con gli spazi (xxxx xxxx xxxx xxxx)
            pwd = pwd or gmail_pwd.replace(" ", "")
    if not (host and user and pwd):
        return None
    return {"host": host, "port": int(port_str or 465), "user": user, "password": pwd}


def invia_email(destinatario: str, oggetto: str, corpo: str,
                allegati: Optional[Sequence[Tuple[bytes, str, str, str]]] = None) -> None:
    """Invio SINCRONO (bloccante): chiamare da un thread (asyncio.to_thread) se
    usato da codice async. allegati: lista di (bytes, maintype, subtype, filename)."""
    cred = credenziali_smtp()
    if not cred:
        raise RuntimeError("Email non configurata su Render (mancano SMTP_HOST/PEC_HOST oppure "
                           "GMAIL_APP_PASSWORD + ADMIN_EMAIL)")
    msg = EmailMessage()
    msg["From"] = cred["user"]
    msg["To"] = destinatario
    msg["Subject"] = oggetto
    msg.set_content(corpo)
    for dati, maintype, subtype, filename in (allegati or []):
        msg.add_attachment(dati, maintype=maintype, subtype=subtype, filename=filename)
    if cred["port"] == 465:
        with smtplib.SMTP_SSL(cred["host"], cred["port"], context=ssl.create_default_context()) as s:
            s.login(cred["user"], cred["password"])
            s.send_message(msg)
    else:
        with smtplib.SMTP(cred["host"], cred["port"]) as s:
            s.starttls(context=ssl.create_default_context())
            s.login(cred["user"], cred["password"])
            s.send_message(msg)
