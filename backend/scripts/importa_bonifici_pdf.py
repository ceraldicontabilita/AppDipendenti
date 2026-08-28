"""Estrae i bonifici pagati ai dipendenti da Drive/Bonifici effettuati/Elaborate,
li aggancia al mese giusto e salva il PDF stesso per l'eventuale controllo.

I nomi file non sono affidabili (alcuni portano l'indirizzo del beneficiario,
non il nome: "80100 napoli_05-06-2025_EUR875_00.pdf" e' in realta' un bonifico
a Lesina Angela). Ogni PDF viene quindi aperto e letto per intero; il
dipendente si riconosce dal cognome nel testo, non dal nome del file.

Importo e data vengono presi dal contenuto del documento (piu' affidabile del
nome file, e presente su entrambi i formati usati nel tempo: le vecchie
ricevute CheBanca "REGISTRIAMO A VOSTRO DEBITO" e le distinte Banco BPM piu'
recenti). La competenza (mese di riferimento dello stipendio) si legge dalla
causale quando la nomina esplicitamente ("Ariante stipendio luglio 2022",
"Lesina Stip maggio 2025"); il pagamento arriva quasi sempre il mese dopo la
competenza, quindi senza causale esplicita si stima cosi'.
"""
import base64
import glob
import json
import re
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, r"C:/Users/ceral/Desktop/AppDipendenti-codex-audit")
import fitz

RADICE = r"C:/Users/ceral/Il mio Drive/GESTIONALE/Bonifici effettuati/Elaborate/*.pdf"

MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio",
        "agosto", "settembre", "ottobre", "novembre", "dicembre"]

RE_IMPORTO_EUR = re.compile(r"EUR\s*([\d.]+,\d{2})")
RE_IMPORTO_INV = re.compile(r"([\d.]+,\d{2})\s*EUR")
RE_DATA = re.compile(r"(\d{2})/(\d{2})/(\d{4})")
RE_IBAN = re.compile(r"\b([A-Z]{2}\d{2}[A-Z0-9]{11,30})\b")
RE_CAUSALE_MESE = re.compile(r"(" + "|".join(MESI) + r")\.?\s*(\d{4})", re.I)


def normalizza(s):
    import unicodedata
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return " ".join(sorted(p.lower() for p in re.sub(r"[^A-Za-z ]", " ", s).split()))


def trova_dipendente(testo_lower, indice):
    """Il dipendente citato nel testo. Prima il nome completo (sicuro anche
    quando piu' persone condividono cognome, come i quattro Ceraldi); solo se
    nessun nome completo compare si scende al solo cognome, e se quello e'
    condiviso da piu' persone il caso resta ambiguo — meglio non attribuirlo
    che sbagliare persona su un documento che vale come prova."""
    per_nome = [d for d in indice.values()
                if (d.get("nome_completo") or "").strip().lower() in testo_lower
                and d.get("nome_completo")]
    if len(per_nome) == 1:
        return per_nome[0]
    if len(per_nome) > 1:
        return None  # piu' nomi completi citati nello stesso testo: ambiguo

    per_cognome = {}
    for d in indice.values():
        cognome = (d.get("cognome") or "").strip().lower()
        if cognome == "ceraldi":
            # "Ceraldi" e' anche la ragione sociale: compare su OGNI bonifico
            # ("CERALDI GROUP S.R.L.", l'intestatario del conto), quindi come
            # solo cognome non identifica nessuno — rendeva ambiguo qualsiasi
            # documento che citasse anche un altro cognome. Per i dipendenti
            # Ceraldi serve il nome completo (gia' controllato sopra).
            continue
        if len(cognome) >= 3 and cognome in testo_lower:
            per_cognome.setdefault(cognome, []).append(d)
    candidati = [d for lista in per_cognome.values() for d in lista]
    distinti = {d["id"] for d in candidati}
    if len(distinti) == 1:
        return candidati[0]
    return None


def estrai(testo):
    out = {}
    m = RE_IMPORTO_EUR.search(testo) or RE_IMPORTO_INV.search(testo)
    if m:
        out["importo"] = float(m.group(1).replace(".", "").replace(",", "."))
    m = RE_DATA.search(testo)
    if m:
        out["data"] = "%s-%s-%s" % (m.group(3), m.group(2), m.group(1))
    m = RE_IBAN.search(testo)
    if m:
        out["iban"] = m.group(1)
    m = RE_CAUSALE_MESE.search(testo)
    if m:
        out["competenza_da_causale"] = "%s-%02d" % (m.group(2), MESI.index(m.group(1).lower()) + 1)
    # Pagamenti una tantum (transazione/conciliazione di fine rapporto, TFR
    # liquidato): non sono "lo stipendio del mese", etichettarli come tali
    # inganna chi legge la riconciliazione mensile.
    if re.search(r"transazion|conciliazion|liquidazion", testo, re.I):
        out["tipo_pagamento"] = "una_tantum"
    return out


def competenza_stimata(data_iso):
    """Un mese prima del pagamento: e' cosi' che paga quest'azienda quando la
    causale non lo dice esplicitamente (verificato sui bonifici gia' noti)."""
    anno, mese = int(data_iso[:4]), int(data_iso[5:7])
    if mese == 1:
        return "%d-12" % (anno - 1)
    return "%d-%02d" % (anno, mese - 1)


def main():
    import asyncio
    import asyncpg

    dsn = sys.argv[1] if len(sys.argv) > 1 else None
    dry = "--dry-run" in sys.argv or not dsn

    files = glob.glob(RADICE)
    print("file nella cartella: %d" % len(files))

    async def run():
        con = None
        indice = {}
        esistenti_bonifici = []
        if dsn:
            con = await asyncpg.connect(dsn)
            righe = await con.fetch("SELECT id, doc FROM public.\"app_dipendenti\"")
            for r in righe:
                d = r["doc"] if isinstance(r["doc"], dict) else json.loads(r["doc"])
                if d.get("merged_into"):
                    continue  # doppione gia' fuso nel record canonico
                indice[normalizza(d.get("nome_completo", ""))] = d
            esistenti_bonifici = await con.fetch(
                "SELECT id, doc->>'dipendente_id' dip, doc->>'data' data, "
                "(doc->>'importo')::float importo FROM public.\"app_bonifici\"")
        if dry:
            print("(--dry-run: nessuna scrittura)")

        adesso = datetime.now(timezone.utc).isoformat()

        agganciati = nuovi = allegati_a_esistente = 0
        senza_importo_o_data = 0
        per_dip_conteggio = {}

        for f in files:
            try:
                testo = "\n".join(p.get_text() for p in fitz.open(f))
            except Exception:
                continue
            low = testo.lower()
            if "beneficiari diversi" in low:
                continue  # riepilogo cumulativo, non un pagamento a una persona

            dip = trova_dipendente(low, indice) if indice else None
            if not dip:
                continue
            info = estrai(testo)
            if "importo" not in info or "data" not in info:
                senza_importo_o_data += 1
                continue

            if info.get("tipo_pagamento") == "una_tantum":
                competenza = None  # non e' lo stipendio di un mese: non si stima
            else:
                competenza = info.get("competenza_da_causale") or competenza_stimata(info["data"])
            agganciati += 1
            nome = dip["nome_completo"]
            per_dip_conteggio[nome] = per_dip_conteggio.get(nome, 0) + 1

            if dry:
                continue

            match = None
            for e in esistenti_bonifici:
                if e["dip"] == dip["id"] and e["data"] == info["data"] and abs((e["importo"] or 0) - info["importo"]) < 0.01:
                    match = e
                    break
            pdf_b64 = base64.b64encode(open(f, "rb").read()).decode("ascii")
            fname = f.split("\\")[-1]
            if match:
                await con.execute(
                    "UPDATE public.\"app_bonifici\" SET doc = doc || jsonb_build_object("
                    "'pdf_data', $2::jsonb, 'pdf_filename', $3::jsonb, 'competenza', $4::jsonb) "
                    "WHERE id = $1",
                    match["id"], json.dumps(pdf_b64), json.dumps(fname), json.dumps(competenza))
                allegati_a_esistente += 1
            else:
                doc = {
                    "id": str(uuid.uuid4()), "dipendente_id": dip["id"],
                    "dipendente_nome": dip.get("nome_completo"),
                    "data": info["data"], "importo": info["importo"],
                    "competenza": competenza,
                    "tipo_pagamento": info.get("tipo_pagamento", "stipendio"),
                    "iban_beneficiario": info.get("iban"),
                    "categoria": "DIPENDENTE",
                    "pdf_filename": fname, "pdf_data": pdf_b64,
                    "fonte": "Drive/GESTIONALE/Bonifici effettuati/Elaborate",
                    "created_at": adesso,
                }
                await con.execute(
                    "INSERT INTO public.\"app_bonifici\" (id, doc) VALUES ($1, $2::jsonb)",
                    doc["id"], json.dumps(doc, ensure_ascii=False))
                nuovi += 1

        print("\nagganciati a un dipendente: %d" % agganciati)
        print("senza importo/data leggibili: %d" % senza_importo_o_data)
        if not dry:
            print("nuovi bonifici creati: %d" % nuovi)
            print("PDF allegato a un bonifico gia' esistente: %d" % allegati_a_esistente)
        print("\nper dipendente:")
        for n, c in sorted(per_dip_conteggio.items(), key=lambda x: -x[1]):
            print("   %-26s %d" % (n, c))

        if con:
            await con.close()

    asyncio.run(run())


if __name__ == "__main__":
    main()
