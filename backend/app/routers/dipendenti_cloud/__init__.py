"""
Dipendenti in Cloud - Router Module
Sistema HR completo per gestione personale
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
import re
import os
import io
import zipfile
import tempfile
from datetime import datetime, timezone

from backend.app.database import Database

# Router principale
router = APIRouter(prefix="/dipendenti-cloud", tags=["Dipendenti Cloud"])

# ============ HELPERS ============

def get_db():
    """Get database instance"""
    return Database.get_db()

def generate_id():
    return str(uuid.uuid4())

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def serialize_doc(doc):
    if doc and '_id' in doc:
        del doc['_id']
    return doc

# ============ MODELS ============

class DipendenteCloud(BaseModel):
    nome: str
    cognome: str
    matricola: Optional[str] = None
    codice_fiscale: Optional[str] = None
    data_nascita: Optional[str] = None
    email: Optional[str] = None
    telefono: Optional[str] = None
    indirizzo: Optional[str] = None
    ruolo: Optional[str] = None
    luogo_lavoro: Optional[str] = None
    contratto: str = "Indeterminato"
    data_assunzione: Optional[str] = None
    data_fine_contratto: Optional[str] = None
    iban: Optional[str] = None
    stato: str = "attivo"

class PresenzaCloud(BaseModel):
    dipendente_id: str
    data: str
    entrata: Optional[str] = None
    uscita: Optional[str] = None
    stato: str = "presente"
    giustificativo: Optional[str] = None
    ore_lavorate: float = 0
    note: Optional[str] = None

class FerieCloud(BaseModel):
    dipendente_id: str
    tipo: str  # Ferie, Permesso, Malattia, ROL
    data_inizio: str
    data_fine: str
    giorni: int = 1
    stato: str = "in_attesa"
    nota: Optional[str] = None

class TurnoCloud(BaseModel):
    nome: str
    orario_inizio: str
    orario_fine: str
    colore: str = "#3b82f6"

class BustaPagaCloud(BaseModel):
    dipendente_id: str
    mese: int
    anno: int
    lordo: float
    netto: float
    inps: float = 0
    irpef: float = 0
    trattenute: float = 0
    stato: str = "DA_PAGARE"
    data_pagamento: Optional[str] = None

class MissioneCloud(BaseModel):
    dipendente_id: str
    destinazione: str
    data_inizio: str
    data_fine: str
    scopo: str
    rimborso: float = 0
    stato: str = "in_attesa"

class DocumentoCloud(BaseModel):
    dipendente_id: str
    titolo: str
    tipo: str
    scadenza: Optional[str] = None
    file_url: Optional[str] = None

# ============ DIPENDENTI ============

@router.get("/dipendenti")
async def get_dipendenti():
    """Legge dalla collezione 'dipendenti' esistente nel database Gestionale"""
    dipendenti = await get_db().dipendenti.find({}, {"_id": 0}).to_list(1000)
    # Normalizza i campi per compatibilità con il frontend
    result = []
    for d in dipendenti:
        result.append({
            "id": d.get("id") or str(d.get("_id", "")),
            "nome": d.get("nome", ""),
            "cognome": d.get("cognome", ""),
            "codice_fiscale": d.get("codice_fiscale", ""),
            "stato": d.get("stato", "attivo"),
            "ruolo": d.get("ruolo", ""),
            "iban": d.get("iban", ""),
            "email": d.get("email", ""),
            "telefono": d.get("telefono", ""),
            "contratto": d.get("contratto", "Indeterminato"),
            "data_assunzione": d.get("data_assunzione", ""),
            "luogo_lavoro": d.get("luogo_lavoro", ""),
            "importo_stipendio": d.get("importo_stipendio", 0),
            "created_at": d.get("created_at", "")
        })
    return result

@router.get("/dipendenti/{dipendente_id}")
async def get_dipendente(dipendente_id: str):
    dip = await get_db().dipendenti.find_one({"id": dipendente_id}, {"_id": 0})
    if not dip:
        raise HTTPException(status_code=404, detail="Dipendente non trovato")
    return dip

@router.post("/dipendenti")
async def create_dipendente(dip: DipendenteCloud):
    dip_dict = dip.model_dump()
    dip_dict["id"] = generate_id()
    dip_dict["created_at"] = now_iso()
    await get_db().dipendenti.insert_one(dip_dict)
    return serialize_doc(dip_dict)

@router.put("/dipendenti/{dipendente_id}")
async def update_dipendente(dipendente_id: str, dip: DipendenteCloud):
    result = await get_db().dipendenti.update_one(
        {"id": dipendente_id},
        {"$set": dip.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Dipendente non trovato")
    return {"message": "Dipendente aggiornato"}

@router.delete("/dipendenti/{dipendente_id}")
async def delete_dipendente(dipendente_id: str):
    result = await get_db().dipendenti.delete_one({"id": dipendente_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Dipendente non trovato")
    return {"message": "Dipendente eliminato"}

@router.get("/ordine-dipendenti")
async def get_ordine_dipendenti():
    doc = await get_db().dipendenti_ordine.find_one({"id": "ordine"}, {"_id": 0})
    return {"ordine": (doc or {}).get("lista", [])}

@router.post("/ordine-dipendenti")
async def set_ordine_dipendenti(data: dict):
    lista = data.get("ordine", [])
    await get_db().dipendenti_ordine.update_one(
        {"id": "ordine"}, {"$set": {"lista": lista}}, upsert=True)
    return {"ok": True}

# ============ PAGHE MENSILI (importo busta + bonifico + acconti) ============

@router.get("/paghe")
async def get_paghe(anno: int, mese: int):
    return await get_db().paghe_mensili.find(
        {"anno": int(anno), "mese": int(mese)}, {"_id": 0}).to_list(500)

@router.post("/paghe")
async def upsert_pagha(data: dict):
    dip = data.get("dipendente_id"); anno = data.get("anno"); mese = data.get("mese")
    if not dip or not anno or not mese:
        raise HTTPException(status_code=400, detail="dipendente_id, anno, mese obbligatori")
    # Normalizza gli acconti: massimo 3, solo importo+data
    acconti = []
    for a in (data.get("acconti") or [])[:3]:
        acconti.append({"importo": a.get("importo"), "data": a.get("data")})
    doc = {
        "dipendente_id": dip, "anno": int(anno), "mese": int(mese),
        "importo_busta": data.get("importo_busta"),
        "bonifico_ricevuto": bool(data.get("bonifico_ricevuto", False)),
        "bonifico_importo": data.get("bonifico_importo"),
        "bonifico_data": data.get("bonifico_data"),
        "acconti": acconti,
        "updated_at": now_iso(),
    }
    await get_db().paghe_mensili.update_one(
        {"dipendente_id": dip, "anno": int(anno), "mese": int(mese)},
        {"$set": doc}, upsert=True)
    return {"ok": True, "pagha": doc}

@router.delete("/paghe")
async def delete_pagha(dipendente_id: str, anno: int, mese: int):
    res = await get_db().paghe_mensili.delete_one(
        {"dipendente_id": dipendente_id, "anno": int(anno), "mese": int(mese)})
    return {"ok": True, "eliminati": res.deleted_count}


@router.post("/paghe/importa-excel-salari")
async def importa_excel_salari(file: UploadFile = File(...)):
    """Importa l'Excel 'prima nota salari' (colonne: DIPENDENTE, MESE, ANNO,
    STIPENDIO NETTO, IMPORTO EROGATO). Il netto fissa il valore atteso della busta,
    l'erogato il valore atteso del bonifico. I flag di riconciliazione partono a False
    e diventano True quando arriva il PDF (busta o ricevuta bonifico) con importo che
    combacia. I dipendenti non presenti in anagrafica vengono solo segnalati."""
    import openpyxl
    nome_file = (file.filename or "").lower()
    if not nome_file.endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Serve un file Excel (.xlsx)")

    _MESI_IT = {"gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4, "maggio": 5, "giugno": 6,
                "luglio": 7, "agosto": 8, "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12}

    def _num(x):
        if x in (None, ""):
            return None
        if isinstance(x, (int, float)):
            return float(x)
        try:
            return float(str(x).strip().replace(".", "").replace(",", "."))
        except Exception:
            return None

    data = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Excel non leggibile: {e}")
    ws = wb.active

    dips = await get_db().dipendenti.find({}, {"_id": 0}).to_list(1000)
    anag = {}
    for d in dips:
        cg = (d.get("cognome") or "").upper().strip()
        nm = (d.get("nome") or "").upper().strip()
        if cg or nm:
            anag[f"{cg} {nm}".strip()] = d   # Cognome Nome
            anag[f"{nm} {cg}".strip()] = d   # Nome Cognome (ordine invertito)

    try:
        await get_db().paghe_mensili.create_index(
            [("dipendente_id", 1), ("anno", 1), ("mese", 1)], unique=True, name="uniq_dip_anno_mese")
    except Exception:
        pass

    anno_corrente = datetime.now(timezone.utc).year
    importati, mesi_set = 0, set()
    non_trovati, scartati = {}, []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or not row[0]:
            continue
        nome = str(row[0]).strip()
        mese = _MESI_IT.get(str(row[1]).strip().lower()) if len(row) > 1 and row[1] else None
        try:
            anno = int(row[2]) if len(row) > 2 and row[2] else None
        except Exception:
            anno = None
        netto = _num(row[3]) if len(row) > 3 else None
        erogato = _num(row[4]) if len(row) > 4 else None

        dip = anag.get(nome.upper())
        if not dip:
            non_trovati[nome] = non_trovati.get(nome, 0) + 1
            continue
        if not mese or not anno or anno < 2023 or anno > anno_corrente + 1:
            scartati.append({"nome": nome, "motivo": f"periodo non valido ({row[1]} {row[2]})"})
            continue

        set_doc = {"dipendente_id": dip["id"], "anno": anno, "mese": mese,
                   "fonte_excel": True, "updated_at": now_iso()}
        if netto is not None:
            set_doc["importo_busta"] = netto
            set_doc["netto_atteso"] = netto
        if erogato is not None:
            set_doc["bonifico_importo"] = erogato
            set_doc["erogato_atteso"] = erogato
        await get_db().paghe_mensili.update_one(
            {"dipendente_id": dip["id"], "anno": anno, "mese": mese},
            {"$set": set_doc,
             "$setOnInsert": {"busta_riconciliata": False, "bonifico_riconciliato": False}},
            upsert=True)
        importati += 1
        mesi_set.add((anno, mese))

    mesi = sorted([{"anno": y, "mese": m} for (y, m) in mesi_set], key=lambda x: (x["anno"], x["mese"]))
    return {"importati": importati,
            "mesi": mesi,
            "dipendenti_non_in_anagrafica": [{"nome": k, "righe": v} for k, v in sorted(non_trovati.items())],
            "scartati": scartati}


# --- Import automatico Libro Unico (PDF) → divide per dipendente e memorizza i netti ---

_CF_RE = re.compile(r'\b([A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z])\b')
_MESI = {"gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4, "maggio": 5, "giugno": 6,
         "luglio": 7, "agosto": 8, "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12}

def _lul_netto(text):
    m = re.findall(r'([\d]{1,3}(?:\.\d{3})*,\d{2})\s*€', text)
    return m[-1] if m else None

def _lul_periodo(text):
    m = re.search(r'(Gennaio|Febbraio|Marzo|Aprile|Maggio|Giugno|Luglio|Agosto|Settembre|Ottobre|Novembre|Dicembre)\s+(\d{4})', text, re.I)
    if m:
        return _MESI[m.group(1).lower()], int(m.group(2))
    return None, None

def _parse_lul(pdf_path):
    """Raggruppa le pagine per codice fiscale (gestisce 1, 2 o 3 pagine a dipendente)."""
    import pdfplumber
    ced = {}
    with pdfplumber.open(pdf_path) as pdf:
        cur = None
        for page in pdf.pages:
            t = page.extract_text() or ""
            cfs = _CF_RE.findall(t)
            mese, anno = _lul_periodo(t)
            if cfs:
                cur = cfs[0]
                d = ced.setdefault(cur, {"nome": None, "netto": None, "mese": None, "anno": None})
                if mese:
                    d["mese"], d["anno"] = mese, anno
                for line in t.split("\n"):
                    mm = re.search(r'\b0[0-9]{6}\b\s+([A-ZÀ-Ù\' ]{4,}?)\s+[A-Z]{6}\d{2}[A-Z]', line)
                    if mm:
                        d["nome"] = mm.group(1).strip()
                        break
            if cur:
                n = _lul_netto(t)
                if n:
                    ced[cur]["netto"] = n
                if not ced[cur].get("mese") and mese:
                    ced[cur]["mese"], ced[cur]["anno"] = mese, anno
    return ced

def _to_float(s):
    return float(s.replace(".", "").replace(",", ".")) if s else None

def _estrai_testo(pdf_path):
    import pdfplumber
    parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            parts.append(page.extract_text() or "")
    return "\n".join(parts)

def _classifica_doc(text):
    """Distingue: bonifico (ricevuta bancaria), presenze (LUL ore/timbrature),
    cedolino (busta paga con netto). Default: cedolino (per il Libro Unico multi-dipendente)."""
    T = (text or "").upper()
    if "RICEVUTA PER ORDINANTE" in T or "A VOSTRO DEBITO A FAVORE DI" in T or ("BONIFICO" in T and "IBAN BENEFICIARIO" in T):
        return "bonifico"
    ha_netto = "NETTO DEL MESE" in T or "NETTOSDELSMESE" in T
    if ha_netto:
        return "cedolino"
    if ("PERIODO DI RIFERIMENTO" in T or "TIMBRATURE" in T or "ORE ORDINARIE" in T):
        return "presenze"
    return "cedolino"

def _competenza_da_causale(causale, data_iso):
    """Determina mese/anno di competenza di un bonifico dalla causale; se non c'è un
    mese esplicito, ripiega sul mese precedente alla data del bonifico."""
    c = (causale or "").lower()
    m = re.search(r'(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s*(\d{4})?', c)
    if m:
        mese = _MESI[m.group(1)]
        anno = int(m.group(2)) if m.group(2) else (int(data_iso[:4]) if data_iso else None)
        return mese, anno, True
    m = re.search(r'\b(0?[1-9]|1[0-2])[-/](\d{4})\b', c)
    if m:
        return int(m.group(1)), int(m.group(2)), True
    if data_iso:
        y, mo = int(data_iso[:4]), int(data_iso[5:7])
        mo -= 1
        if mo == 0:
            mo, y = 12, y - 1
        return mo, y, False   # competenza dedotta (non esplicita)
    return None, None, False

def _parse_bonifico(text):
    imp = None
    m = re.search(r'EUR\s+([\d.]+,\d{2})', text) or re.search(r'IMPORTO\s+([\d.]+,\d{2})', text)
    if m:
        imp = _to_float(m.group(1))
    data = None
    md = re.search(r'DATA\s+(\d{2})/(\d{2})/(\d{4})', text)
    if md:
        data = f"{md.group(3)}-{md.group(2)}-{md.group(1)}"
    caus = None
    mc = re.search(r'CAUSALE\s*\n\s*([^\n]+)', text)
    if mc:
        caus = mc.group(1).strip()
    cro = None
    mr = re.search(r'(MB0B\w+)', text)
    if mr:
        cro = mr.group(1).strip()
    mese_c, anno_c, esplicita = _competenza_da_causale(caus, data)
    return {"importo": imp, "data": data, "causale": caus,
            "cro": cro, "mese": mese_c, "anno": anno_c, "competenza_esplicita": esplicita}


@router.post("/paghe/importa-lul")
async def importa_libro_unico(files: List[UploadFile] = File(...)):
    """Legge uno o più PDF Libro Unico (anche dentro file ZIP, anche più ZIP insieme),
    divide per dipendente (per codice fiscale), associa all'anagrafica e memorizza il
    netto del mese in paghe_mensili. Ogni PDF porta il proprio mese. Conserva
    bonifici/acconti eventualmente già inseriti."""
    dips = await get_db().dipendenti.find({}, {"_id": 0}).to_list(1000)
    by_cf = {(d.get("codice_fiscale") or "").upper(): d for d in dips if d.get("codice_fiscale")}
    by_nome = {}
    for d in dips:
        cg = (d.get("cognome") or "").upper().strip()
        nm = (d.get("nome") or "").upper().strip()
        if cg or nm:
            by_nome[f"{cg} {nm}".strip()] = d
            by_nome[f"{nm} {cg}".strip()] = d

    # Vincolo: una sola busta per (dipendente, anno, mese) — i duplicati diventano impossibili
    try:
        await get_db().paghe_mensili.create_index(
            [("dipendente_id", 1), ("anno", 1), ("mese", 1)], unique=True, name="uniq_dip_anno_mese")
    except Exception:
        pass

    async def _processa_pdf(pdfbytes, origine):
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(pdfbytes)
            path = tmp.name
        ass, dac, bon, pres = [], [], [], []
        anno_corrente = datetime.now(timezone.utc).year
        try:
            text = _estrai_testo(path)
            tipo = _classifica_doc(text)

            # ---- BONIFICO (ricevuta bancaria) ----
            if tipo == "bonifico":
                b = _parse_bonifico(text)
                # match dipendente: "COGNOME NOME" presente nel testo; fallback cognome nella causale
                T = text.upper()
                dip = None
                for cand in dips:
                    cg = (cand.get("cognome") or "").upper().strip()
                    nm = (cand.get("nome") or "").upper().strip()
                    if cg and nm and f"{cg} {nm}" in T:
                        dip = cand; break
                if not dip:
                    cau = (b.get("causale") or "").upper()
                    for cand in dips:
                        cg = (cand.get("cognome") or "").upper().strip()
                        if cg and cg in cau:
                            dip = cand; break
                manca = []
                if not dip: manca.append("dipendente non riconosciuto")
                if not b.get("importo"): manca.append("importo")
                if not b.get("mese"): manca.append("mese")
                if manca:
                    dac.append({"nome": (b.get("causale") or "?")[:30], "origine": origine,
                                "motivo": "bonifico: " + ", ".join(manca)})
                else:
                    mese, anno = b["mese"], b["anno"]
                    esist = await get_db().paghe_mensili.find_one(
                        {"dipendente_id": dip["id"], "anno": anno, "mese": mese}, {"erogato_atteso": 1})
                    atteso = (esist or {}).get("erogato_atteso")
                    discrep = atteso if (atteso is not None and abs(atteso - b["importo"]) > 1) else None
                    set_doc = {"dipendente_id": dip["id"], "anno": anno, "mese": mese,
                               "bonifico_importo": b["importo"], "bonifico_data": b.get("data"),
                               "bonifico_ricevuto": True, "bonifico_causale": b.get("causale"),
                               "bonifico_cro": b.get("cro"), "bonifico_pdf": origine,
                               "bonifico_riconciliato": True, "updated_at": now_iso()}
                    await get_db().paghe_mensili.update_one(
                        {"dipendente_id": dip["id"], "anno": anno, "mese": mese},
                        {"$set": set_doc, "$setOnInsert": {"busta_riconciliata": False}}, upsert=True)
                    bon.append({"dipendente": f"{dip.get('cognome')} {dip.get('nome')}".strip(),
                                "importo": b["importo"], "mese": mese, "anno": anno,
                                "causale": b.get("causale"), "data": b.get("data"),
                                "riconciliato": True, "discrepanza": discrep,
                                "competenza_esplicita": b.get("competenza_esplicita")})
                return ass, dac, bon, pres

            # ---- FOGLIO PRESENZE (ore/timbrature, non è una busta) ----
            if tipo == "presenze":
                cf = (_CF_RE.findall(text) or [None])[0]
                mese, anno = _lul_periodo(text)
                dip = by_cf.get((cf or "").upper())
                pres.append({"dipendente": (f"{dip.get('cognome')} {dip.get('nome')}".strip() if dip else (cf or "?")),
                             "mese": mese, "anno": anno, "origine": origine})
                return ass, dac, bon, pres

            # ---- CEDOLINO / LIBRO UNICO multi-dipendente (netti) ----
            ced = _parse_lul(path)
            for cf, info in ced.items():
                dip = by_cf.get(cf)
                metodo = "codice fiscale"
                if not dip:
                    dip = by_nome.get((info.get("nome") or "").upper())
                    metodo = "nome (CF non combacia)"
                netto = _to_float(info.get("netto"))
                mese, anno = info.get("mese"), info.get("anno")
                if not dip or not mese:
                    dac.append({"nome": info.get("nome"), "cf": cf, "netto": netto, "origine": origine,
                                "motivo": "dipendente non trovato" if not dip else "periodo non rilevato"})
                    continue
                if not netto or netto <= 0:
                    dac.append({"nome": info.get("nome"), "cf": cf, "netto": netto, "origine": origine,
                                "motivo": "netto non rilevato (non salvato)"})
                    continue
                if anno < 2023 or anno > anno_corrente + 1:
                    dac.append({"nome": info.get("nome"), "cf": cf, "netto": netto, "origine": origine,
                                "motivo": f"anno fuori intervallo: {mese}/{anno} (non salvato)"})
                    continue
                esistente = await get_db().paghe_mensili.find_one(
                    {"dipendente_id": dip["id"], "anno": anno, "mese": mese}, {"netto_atteso": 1})
                atteso = (esistente or {}).get("netto_atteso")
                discrep = atteso if (atteso is not None and abs(atteso - netto) > 1) else None
                set_doc = {"dipendente_id": dip["id"], "anno": anno, "mese": mese,
                           "importo_busta": netto, "busta_da_lul": True,
                           "busta_riconciliata": True, "updated_at": now_iso()}
                await get_db().paghe_mensili.update_one(
                    {"dipendente_id": dip["id"], "anno": anno, "mese": mese},
                    {"$set": set_doc}, upsert=True)
                ass.append({"dipendente_id": dip["id"],
                            "dipendente": f"{dip.get('cognome')} {dip.get('nome')}".strip(),
                            "netto": netto, "metodo": metodo, "mese": mese, "anno": anno,
                            "riconciliata": True, "discrepanza": discrep})
        finally:
            try:
                os.unlink(path)
            except Exception:
                pass
        return ass, dac, bon, pres

    associati, da_controllare, errori, bonifici, presenze = [], [], [], [], []
    file_pdf = 0
    for uf in files:
        nome = uf.filename or ""
        low = nome.lower()
        try:
            data = await uf.read()
        except Exception:
            errori.append(f"{nome}: lettura fallita")
            continue
        if low.endswith(".pdf"):
            try:
                a, d, b, p = await _processa_pdf(data, nome)
                associati += a; da_controllare += d; bonifici += b; presenze += p; file_pdf += 1
            except Exception as e:
                errori.append(f"{nome}: {e}")
        elif low.endswith(".zip"):
            try:
                with zipfile.ZipFile(io.BytesIO(data)) as z:
                    pdf_interni = [n for n in z.namelist() if n.lower().endswith(".pdf") and "__MACOSX" not in n]
                    if not pdf_interni:
                        errori.append(f"{nome}: ZIP senza PDF")
                    for zi in pdf_interni:
                        try:
                            a, d, b, p = await _processa_pdf(z.read(zi), f"{nome} › {zi}")
                            associati += a; da_controllare += d; bonifici += b; presenze += p; file_pdf += 1
                        except Exception as e:
                            errori.append(f"{nome} › {zi}: {e}")
            except zipfile.BadZipFile:
                errori.append(f"{nome}: ZIP non valido")
            except Exception as e:
                errori.append(f"{nome}: {e}")
        else:
            errori.append(f"{nome}: tipo non supportato (servono PDF o ZIP)")

    if file_pdf == 0:
        raise HTTPException(status_code=400, detail="Nessun PDF valido trovato nei file caricati. " + ("; ".join(errori) if errori else ""))

    # Dedup: se lo stesso dipendente/mese è arrivato da più file, tieni una riga sola
    visti = {}
    for a in associati:
        visti[(a["dipendente_id"], a["anno"], a["mese"])] = a
    associati = list(visti.values())

    mesi_set = sorted({(a["anno"], a["mese"]) for a in associati})
    mesi = [{"anno": y, "mese": m, "n": sum(1 for a in associati if a["anno"] == y and a["mese"] == m)}
            for (y, m) in mesi_set]
    associati.sort(key=lambda x: (x["anno"], x["mese"], x["dipendente"]))
    bonifici.sort(key=lambda x: (x["anno"], x["mese"], x["dipendente"]))
    return {"associati": associati, "da_controllare": da_controllare,
            "totale_associati": len(associati), "file_pdf": file_pdf,
            "mesi": mesi, "errori": errori,
            "bonifici": bonifici, "presenze": presenze}

# ============ PRESENZE ============

@router.get("/presenze")
async def get_presenze(anno: Optional[int] = None, mese: Optional[int] = None, dipendente_id: Optional[str] = None):
    """
    Recupera presenze dalla collezione 'presenze' (dati storici dal Libro Unico).
    Le presenze sono raggruppate per mese con un array 'giorni'.
    """
    db = get_db()
    
    # Prima leggi da presenze_cloud (inserimenti manuali)
    query_cloud = {}
    if dipendente_id:
        query_cloud["dipendente_id"] = dipendente_id
    if anno and mese:
        query_cloud["data"] = {"$regex": f"^{anno}-{str(mese).zfill(2)}"}
    
    presenze_cloud = await db.presenze_cloud.find(query_cloud, {"_id": 0}).to_list(5000)
    
    # Poi leggi da presenze (dati storici dal LUL - struttura diversa)
    query_lul = {}
    if anno:
        query_lul["anno"] = anno
    if mese:
        query_lul["mese"] = mese
    
    presenze_lul = await db.presenze.find(query_lul, {"_id": 0}).to_list(500)
    
    # Converti presenze LUL in formato giornaliero
    result = list(presenze_cloud)
    cloud_keys = {(p.get("dipendente_id"), p.get("data")) for p in presenze_cloud}
    
    for p_lul in presenze_lul:
        cf = p_lul.get("codice_fiscale", "")
        anno_p = p_lul.get("anno", 2026)
        mese_p = p_lul.get("mese", 1)
        giorni = p_lul.get("giorni", [])
        
        # Trova l'ID dipendente dal codice fiscale
        dip = await db.dipendenti.find_one({"codice_fiscale": cf})
        dip_id = dip.get("id", cf) if dip else cf
        
        for g in giorni:
            giorno_num = g.get("giorno", 1)
            data_str = f"{anno_p}-{str(mese_p).zfill(2)}-{str(giorno_num).zfill(2)}"
            
            key = (dip_id, data_str)
            if key in cloud_keys:
                continue  # Già presente nei dati manuali
            
            # Determina lo stato dal giustificativo
            giust = g.get("giustificativo", "")
            ore = g.get("ore_ordinarie", 0)
            
            if giust:
                stato = giust  # AI, FE, MA, RL, etc.
            elif ore > 0:
                stato = "presente"
            else:
                stato = "assente"
            
            result.append({
                "id": f"{cf}_{data_str}",
                "dipendente_id": dip_id,
                "data": data_str,
                "entrata": None,
                "uscita": None,
                "stato": stato,
                "giustificativo": giust,
                "ore_lavorate": ore,
                "note": ""
            })
    
    return result

@router.post("/presenze")
async def create_presenza(presenza: PresenzaCloud):
    pres_dict = presenza.model_dump()
    pres_dict["id"] = generate_id()
    pres_dict["created_at"] = now_iso()
    
    # Calculate hours worked
    if pres_dict.get("entrata") and pres_dict.get("uscita"):
        try:
            ent = datetime.strptime(pres_dict["entrata"], "%H:%M")
            usc = datetime.strptime(pres_dict["uscita"], "%H:%M")
            pres_dict["ore_lavorate"] = round((usc - ent).seconds / 3600, 2)
        except:
            pass
    
    await get_db().presenze_cloud.insert_one(pres_dict)
    return serialize_doc(pres_dict)

@router.put("/presenze/{presenza_id}")
async def update_presenza(presenza_id: str, presenza: PresenzaCloud):
    pres_dict = presenza.model_dump()
    
    if pres_dict.get("entrata") and pres_dict.get("uscita"):
        try:
            ent = datetime.strptime(pres_dict["entrata"], "%H:%M")
            usc = datetime.strptime(pres_dict["uscita"], "%H:%M")
            pres_dict["ore_lavorate"] = round((usc - ent).seconds / 3600, 2)
        except:
            pass
    
    result = await get_db().presenze_cloud.update_one(
        {"id": presenza_id},
        {"$set": pres_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Presenza non trovata")
    return {"message": "Presenza aggiornata"}

@router.delete("/presenze/{presenza_id}")
async def delete_presenza(presenza_id: str):
    result = await get_db().presenze_cloud.delete_one({"id": presenza_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Presenza non trovata")
    return {"message": "Presenza eliminata"}

@router.post("/presenze/batch")
async def create_presenze_batch(presenze: List[PresenzaCloud]):
    created = []
    for p in presenze:
        pres_dict = p.model_dump()
        pres_dict["id"] = generate_id()
        pres_dict["created_at"] = now_iso()
        
        existing = await get_db().presenze_cloud.find_one({
            "dipendente_id": pres_dict["dipendente_id"],
            "data": pres_dict["data"]
        })
        
        if existing:
            await get_db().presenze_cloud.update_one(
                {"id": existing["id"]},
                {"$set": pres_dict}
            )
        else:
            await get_db().presenze_cloud.insert_one(pres_dict)
        created.append(pres_dict)
    
    return {"message": f"Inserite/aggiornate {len(created)} presenze"}

# ============ FERIE E PERMESSI ============

@router.get("/ferie")
async def get_ferie(dipendente_id: Optional[str] = None, stato: Optional[str] = None):
    query = {}
    if dipendente_id:
        query["dipendente_id"] = dipendente_id
    if stato:
        query["stato"] = stato
    ferie = await get_db().ferie_cloud.find(query, {"_id": 0}).to_list(1000)
    return ferie

@router.post("/ferie")
async def create_ferie(ferie: FerieCloud):
    ferie_dict = ferie.model_dump()
    ferie_dict["id"] = generate_id()
    ferie_dict["created_at"] = now_iso()
    await get_db().ferie_cloud.insert_one(ferie_dict)
    return serialize_doc(ferie_dict)

@router.post("/ferie-giorno")
async def set_ferie_giorno(data: dict):
    """Assegna/aggiorna/rimuove un'assenza di un singolo giorno dal calendario.
    tipo=None rimuove. Usato dalla vista calendario di Ferie & Permessi."""
    dip = data.get("dipendente_id")
    giorno = data.get("data")
    tipo = data.get("tipo")
    if not dip or not giorno:
        raise HTTPException(status_code=400, detail="dipendente_id e data obbligatori")
    existing = await get_db().ferie_cloud.find_one({
        "dipendente_id": dip, "data_inizio": giorno, "data_fine": giorno
    })
    if tipo:
        if existing:
            await get_db().ferie_cloud.update_one({"id": existing["id"]}, {"$set": {"tipo": tipo}})
        else:
            await get_db().ferie_cloud.insert_one({
                "id": generate_id(), "dipendente_id": dip, "tipo": tipo,
                "data_inizio": giorno, "data_fine": giorno, "giorni": 1,
                "stato": "approvata", "created_at": now_iso()
            })
    elif existing:
        await get_db().ferie_cloud.delete_one({"id": existing["id"]})
    return {"ok": True}

@router.put("/ferie/{ferie_id}/approva")
async def approva_ferie(ferie_id: str):
    result = await get_db().ferie_cloud.update_one(
        {"id": ferie_id},
        {"$set": {"stato": "approvata"}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")
    return {"message": "Richiesta approvata"}

@router.put("/ferie/{ferie_id}/rifiuta")
async def rifiuta_ferie(ferie_id: str):
    result = await get_db().ferie_cloud.update_one(
        {"id": ferie_id},
        {"$set": {"stato": "rifiutata"}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")
    return {"message": "Richiesta rifiutata"}

@router.delete("/ferie/{ferie_id}")
async def delete_ferie(ferie_id: str):
    result = await get_db().ferie_cloud.delete_one({"id": ferie_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")
    return {"message": "Richiesta eliminata"}

# ============ TURNI ============

@router.get("/turni")
async def get_turni():
    turni = await get_db().turni_cloud.find({}, {"_id": 0}).to_list(100)
    return turni

@router.post("/turni")
async def create_turno(turno: TurnoCloud):
    turno_dict = turno.model_dump()
    turno_dict["id"] = generate_id()
    await get_db().turni_cloud.insert_one(turno_dict)
    return serialize_doc(turno_dict)

@router.put("/turni/{turno_id}")
async def update_turno(turno_id: str, turno: TurnoCloud):
    result = await get_db().turni_cloud.update_one(
        {"id": turno_id},
        {"$set": turno.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Turno non trovato")
    return {"message": "Turno aggiornato"}

@router.delete("/turni/{turno_id}")
async def delete_turno(turno_id: str):
    result = await get_db().turni_cloud.delete_one({"id": turno_id})
    await get_db().assegnazioni_turni_cloud.delete_many({"turno_id": turno_id})
    return {"message": "Turno eliminato"}

@router.get("/assegnazioni-turni")
async def get_assegnazioni(settimana: Optional[str] = None):
    query = {"settimana": settimana} if settimana else {}
    assegnazioni = await get_db().assegnazioni_turni_cloud.find(query, {"_id": 0}).to_list(2000)
    return assegnazioni

@router.post("/assegnazioni-turni/migra")
async def migra_settimana_assegnazioni(data: dict):
    """Una-tantum: assegna una settimana ai record che non ce l'hanno."""
    settimana = data.get("settimana")
    if not settimana:
        raise HTTPException(status_code=400, detail="settimana obbligatoria")
    res = await get_db().assegnazioni_turni_cloud.update_many(
        {"$or": [{"settimana": {"$exists": False}}, {"settimana": None}]},
        {"$set": {"settimana": settimana}}
    )
    return {"migrati": res.modified_count}

@router.post("/assegnazioni-turni")
async def create_or_update_assegnazione(data: dict):
    dipendente_id = data.get("dipendente_id")
    giorno = data.get("giorno")
    turno_id = data.get("turno_id")
    settimana = data.get("settimana")
    
    if not dipendente_id or not giorno:
        raise HTTPException(status_code=400, detail="dipendente_id e giorno sono obbligatori")
    
    match = {"dipendente_id": dipendente_id, "giorno": giorno}
    if settimana:
        match["settimana"] = settimana
    existing = await get_db().assegnazioni_turni_cloud.find_one(match)
    
    if turno_id:
        if existing:
            await get_db().assegnazioni_turni_cloud.update_one(
                {"id": existing["id"]},
                {"$set": {"turno_id": turno_id}}
            )
        else:
            ass = {
                "id": generate_id(),
                "dipendente_id": dipendente_id,
                "giorno": giorno,
                "turno_id": turno_id,
                "settimana": settimana,
            }
            await get_db().assegnazioni_turni_cloud.insert_one(ass)
    else:
        if existing:
            await get_db().assegnazioni_turni_cloud.delete_one({"id": existing["id"]})
    
    return {"message": "Assegnazione salvata"}

# ============ BUSTE PAGA ============

@router.get("/buste-paga")
async def get_buste_paga(anno: Optional[int] = None, mese: Optional[int] = None, dipendente_id: Optional[str] = None):
    """
    Recupera cedolini dalla collezione 'cedolini' (dati storici dal 2014).
    Se dipendente_id è fornito, cerca anche per nome del dipendente in dipendenti_cloud.
    """
    query = {}
    if anno:
        query["anno"] = anno
    if mese:
        query["mese"] = mese
    
    # Se abbiamo un dipendente_id, dobbiamo trovare il nome per cercare nei cedolini
    if dipendente_id:
        dip = await get_db().dipendenti_cloud.find_one({"id": dipendente_id})
        if dip:
            nome_completo = f"{dip.get('nome', '')} {dip.get('cognome', '')}".strip().upper()
            query["$or"] = [
                {"dipendente_id": dipendente_id},
                {"nome_dipendente": {"$regex": dip.get('cognome', ''), "$options": "i"}}
            ]
    
    # Leggi dalla collezione cedolini (dati storici)
    cedolini = await get_db().cedolini.find(query, {"_id": 0}).sort([("anno", -1), ("mese", -1)]).to_list(1000)
    
    # Normalizza i campi per compatibilità con il frontend
    result = []
    for c in cedolini:
        result.append({
            "id": c.get("id", str(c.get("_id", ""))),
            "dipendente_id": c.get("dipendente_id", ""),
            "dipendente_nome": c.get("nome_dipendente") or c.get("dipendente_nome") or "",
            "mese": c.get("mese"),
            "anno": c.get("anno"),
            "lordo": c.get("lordo", 0),
            "netto": c.get("netto", 0),
            "inps": c.get("inps_dipendente", 0),
            "irpef": c.get("irpef", 0),
            "trattenute": c.get("trattenute", 0),
            "stato": c.get("stato_pagamento") or c.get("stato") or "DA_PAGARE",
            "created_at": c.get("created_at", "")
        })
    
    return result

@router.post("/buste-paga")
async def create_busta_paga(busta: BustaPagaCloud):
    busta_dict = busta.model_dump()
    busta_dict["id"] = generate_id()
    busta_dict["created_at"] = now_iso()
    await get_db().buste_paga_cloud.insert_one(busta_dict)
    return serialize_doc(busta_dict)

@router.post("/buste-paga/genera")
async def genera_buste_paga(data: dict):
    """Genera buste paga per tutti i dipendenti attivi per un mese specifico"""
    mese = data.get("mese")
    anno = data.get("anno")
    lordo_default = data.get("lordo", 1500)
    
    if not mese or not anno:
        raise HTTPException(status_code=400, detail="mese e anno sono obbligatori")
    
    dipendenti = await get_db().dipendenti_cloud.find({"stato": "attivo"}, {"_id": 0}).to_list(1000)
    created = 0
    
    for dip in dipendenti:
        existing = await get_db().buste_paga_cloud.find_one({
            "dipendente_id": dip["id"],
            "mese": mese,
            "anno": anno
        })
        
        if not existing:
            inps = round(lordo_default * 0.0919, 2)
            irpef = round((lordo_default - inps) * 0.23, 2)
            netto = round(lordo_default - inps - irpef, 2)
            
            busta = {
                "id": generate_id(),
                "dipendente_id": dip["id"],
                "mese": mese,
                "anno": anno,
                "lordo": lordo_default,
                "inps": inps,
                "irpef": irpef,
                "trattenute": 0,
                "netto": netto,
                "stato": "DA_PAGARE",
                "created_at": now_iso()
            }
            await get_db().buste_paga_cloud.insert_one(busta)
            created += 1
    
    return {"message": f"Generate {created} buste paga"}

@router.put("/buste-paga/{busta_id}/paga")
async def paga_busta(busta_id: str):
    result = await get_db().buste_paga_cloud.update_one(
        {"id": busta_id},
        {"$set": {"stato": "PAGATO", "data_pagamento": now_iso()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Busta paga non trovata")
    return {"message": "Busta paga marcata come pagata"}

# ============ MISSIONI ============

@router.get("/missioni")
async def get_missioni(dipendente_id: Optional[str] = None, stato: Optional[str] = None):
    query = {}
    if dipendente_id:
        query["dipendente_id"] = dipendente_id
    if stato:
        query["stato"] = stato
    missioni = await get_db().missioni_cloud.find(query, {"_id": 0}).to_list(1000)
    return missioni

@router.post("/missioni")
async def create_missione(missione: MissioneCloud):
    miss_dict = missione.model_dump()
    miss_dict["id"] = generate_id()
    miss_dict["created_at"] = now_iso()
    await get_db().missioni_cloud.insert_one(miss_dict)
    return serialize_doc(miss_dict)

@router.put("/missioni/{missione_id}/approva")
async def approva_missione(missione_id: str):
    result = await get_db().missioni_cloud.update_one(
        {"id": missione_id},
        {"$set": {"stato": "approvata"}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Missione non trovata")
    return {"message": "Missione approvata"}

@router.delete("/missioni/{missione_id}")
async def delete_missione(missione_id: str):
    result = await get_db().missioni_cloud.delete_one({"id": missione_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Missione non trovata")
    return {"message": "Missione eliminata"}

# ============ DOCUMENTI ============

@router.get("/documenti")
async def get_documenti(dipendente_id: Optional[str] = None):
    query = {}
    if dipendente_id:
        query["dipendente_id"] = dipendente_id
    documenti = await get_db().documenti_cloud.find(query, {"_id": 0}).to_list(1000)
    return documenti

@router.post("/documenti")
async def create_documento(doc: DocumentoCloud):
    doc_dict = doc.model_dump()
    doc_dict["id"] = generate_id()
    doc_dict["data_caricamento"] = now_iso()
    await get_db().documenti_cloud.insert_one(doc_dict)
    return serialize_doc(doc_dict)

@router.delete("/documenti/{documento_id}")
async def delete_documento(documento_id: str):
    result = await get_db().documenti_cloud.delete_one({"id": documento_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    return {"message": "Documento eliminato"}

# ============ DASHBOARD STATS ============

@router.get("/dashboard/stats")
async def get_dashboard_stats():
    dipendenti = await get_db().dipendenti.find({}, {"_id": 0}).to_list(1000)
    attivi = [d for d in dipendenti if d.get("attivo", True) is not False and d.get("stato", "attivo") not in ("cessato", "disattivo", "inattivo")]
    
    ferie_pending = await get_db().ferie_cloud.count_documents({"stato": "in_attesa"})
    missioni_pending = await get_db().missioni_cloud.count_documents({"stato": "in_attesa"})
    
    # Presenze oggi
    today = datetime.now().strftime("%Y-%m-%d")
    presenze_oggi = await get_db().presenze_cloud.count_documents({"data": today, "stato": "presente"})
    
    return {
        "totale_dipendenti": len(dipendenti),
        "dipendenti_attivi": len(attivi),
        "ferie_in_attesa": ferie_pending,
        "missioni_in_attesa": missioni_pending,
        "presenze_oggi": presenze_oggi
    }

# ============ SEED DATA ============

@router.post("/seed-data")
async def seed_data():
    """Crea dati di esempio se non esistono"""
    existing = await get_db().dipendenti_cloud.count_documents({})
    if existing > 0:
        return {"message": "Dati già presenti"}
    
    # Crea dipendenti di esempio
    dipendenti_sample = [
        {"nome": "Mario", "cognome": "Rossi", "ruolo": "Responsabile", "stato": "attivo", "contratto": "Indeterminato"},
        {"nome": "Lucia", "cognome": "Bianchi", "ruolo": "Cameriere", "stato": "attivo", "contratto": "Determinato"},
        {"nome": "Giuseppe", "cognome": "Verdi", "ruolo": "Barista", "stato": "attivo", "contratto": "Indeterminato"},
    ]
    
    for d in dipendenti_sample:
        d["id"] = generate_id()
        d["created_at"] = now_iso()
        await get_db().dipendenti_cloud.insert_one(d)
    
    # Crea turni di esempio
    turni_sample = [
        {"nome": "Mattina", "orario_inizio": "06:00", "orario_fine": "14:00", "colore": "#3b82f6"},
        {"nome": "Pomeriggio", "orario_inizio": "14:00", "orario_fine": "22:00", "colore": "#10b981"},
        {"nome": "Notte", "orario_inizio": "22:00", "orario_fine": "06:00", "colore": "#8b5cf6"},
    ]
    
    for t in turni_sample:
        t["id"] = generate_id()
        await get_db().turni_cloud.insert_one(t)
    
    return {"message": "Dati di esempio creati"}
