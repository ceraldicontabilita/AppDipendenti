"""
Dipendenti in Cloud - Router completo
Tutte le collections: dipendenti_cloud, presenze_cloud, ferie_cloud,
turni_cloud, assegnazioni_turni_cloud, buste_paga_cloud,
missioni_cloud, documenti_cloud
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime, timezone

from ..database import Database

router = APIRouter(prefix="/api/dipendenti-cloud", tags=["Dipendenti Cloud"])


# ============ HELPERS ============

def get_db():
    return Database.get_db()

def gen_id():
    return str(uuid.uuid4())

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def clean(doc):
    if doc and "_id" in doc:
        del doc["_id"]
    return doc


# ============ MODELS ============

class DipendenteModel(BaseModel):
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
    importo_stipendio: float = 0
    stato: str = "attivo"

class PresenzaModel(BaseModel):
    dipendente_id: str
    data: str
    entrata: Optional[str] = None
    uscita: Optional[str] = None
    stato: str = "presente"
    giustificativo: Optional[str] = None
    ore_lavorate: float = 0
    note: Optional[str] = None

class FerieModel(BaseModel):
    dipendente_id: str
    tipo: str
    data_inizio: str
    data_fine: str
    giorni: int = 1
    stato: str = "in_attesa"
    nota: Optional[str] = None

class TurnoModel(BaseModel):
    nome: str
    orario_inizio: str
    orario_fine: str
    colore: str = "#3b82f6"

class BustaPagaModel(BaseModel):
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

class MissioneModel(BaseModel):
    dipendente_id: str
    destinazione: str
    data_inizio: str
    data_fine: str
    scopo: str
    rimborso: float = 0
    stato: str = "in_attesa"

class DocumentoModel(BaseModel):
    dipendente_id: str
    titolo: str
    tipo: str
    scadenza: Optional[str] = None
    file_url: Optional[str] = None


# ============ DIPENDENTI ============

@router.get("/dipendenti")
async def get_dipendenti():
    docs = await get_db().dipendenti_cloud.find({}, {"_id": 0}).to_list(1000)
    # Fallback: legge anche dalla collection principale "dipendenti" se cloud è vuota
    if not docs:
        docs_main = await get_db().dipendenti.find({}, {"_id": 0}).to_list(1000)
        result = []
        for d in docs_main:
            result.append({
                "id": d.get("id", str(d.get("_id", gen_id()))),
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
                "created_at": d.get("created_at", ""),
            })
        return result
    return docs

@router.get("/dipendenti/{dipendente_id}")
async def get_dipendente(dipendente_id: str):
    doc = await get_db().dipendenti_cloud.find_one({"id": dipendente_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Dipendente non trovato")
    return doc

@router.post("/dipendenti")
async def create_dipendente(dip: DipendenteModel):
    d = dip.model_dump()
    d["id"] = gen_id()
    d["created_at"] = now_iso()
    await get_db().dipendenti_cloud.insert_one(d)
    return clean(d)

@router.put("/dipendenti/{dipendente_id}")
async def update_dipendente(dipendente_id: str, dip: DipendenteModel):
    r = await get_db().dipendenti_cloud.update_one(
        {"id": dipendente_id}, {"$set": dip.model_dump()}
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Dipendente non trovato")
    return {"ok": True}

@router.delete("/dipendenti/{dipendente_id}")
async def delete_dipendente(dipendente_id: str):
    r = await get_db().dipendenti_cloud.delete_one({"id": dipendente_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Dipendente non trovato")
    return {"ok": True}


# ============ PRESENZE ============

@router.get("/presenze")
async def get_presenze(anno: Optional[int] = None, mese: Optional[int] = None, dipendente_id: Optional[str] = None):
    q: dict = {}
    if dipendente_id:
        q["dipendente_id"] = dipendente_id
    if anno and mese:
        q["data"] = {"$regex": f"^{anno}-{str(mese).zfill(2)}"}
    docs = await get_db().presenze_cloud.find(q, {"_id": 0}).to_list(5000)

    # Integra con dati LUL dalla collection presenze (struttura mese/giorni)
    q_lul: dict = {}
    if anno:
        q_lul["anno"] = anno
    if mese:
        q_lul["mese"] = mese
    presenze_lul = await get_db().presenze.find(q_lul, {"_id": 0}).to_list(500)

    cloud_keys = {(p.get("dipendente_id"), p.get("data")) for p in docs}
    for p_lul in presenze_lul:
        cf = p_lul.get("codice_fiscale", "")
        anno_p = p_lul.get("anno", 2026)
        mese_p = p_lul.get("mese", 1)
        giorni = p_lul.get("giorni", [])
        dip = await get_db().dipendenti.find_one({"codice_fiscale": cf})
        dip_id = dip.get("id", cf) if dip else cf
        for g in giorni:
            gn = g.get("giorno", 1)
            data_str = f"{anno_p}-{str(mese_p).zfill(2)}-{str(gn).zfill(2)}"
            if (dip_id, data_str) in cloud_keys:
                continue
            giust = g.get("giustificativo", "")
            ore = g.get("ore_ordinarie", 0)
            stato = giust if giust else ("presente" if ore > 0 else "assente")
            docs.append({
                "id": f"{cf}_{data_str}",
                "dipendente_id": dip_id,
                "data": data_str,
                "entrata": None,
                "uscita": None,
                "stato": stato,
                "giustificativo": giust,
                "ore_lavorate": ore,
                "note": "",
            })
    return docs

@router.post("/presenze")
async def create_presenza(p: PresenzaModel):
    d = p.model_dump()
    d["id"] = gen_id()
    d["created_at"] = now_iso()
    if d.get("entrata") and d.get("uscita"):
        try:
            ent = datetime.strptime(d["entrata"], "%H:%M")
            usc = datetime.strptime(d["uscita"], "%H:%M")
            d["ore_lavorate"] = round((usc - ent).seconds / 3600, 2)
        except Exception:
            pass
    await get_db().presenze_cloud.insert_one(d)
    return clean(d)

@router.post("/presenze/batch")
async def create_presenze_batch(presenze: List[PresenzaModel]):
    for p in presenze:
        d = p.model_dump()
        d["id"] = gen_id()
        d["created_at"] = now_iso()
        existing = await get_db().presenze_cloud.find_one(
            {"dipendente_id": d["dipendente_id"], "data": d["data"]}
        )
        if existing:
            await get_db().presenze_cloud.update_one({"id": existing["id"]}, {"$set": d})
        else:
            await get_db().presenze_cloud.insert_one(d)
    return {"ok": True, "count": len(presenze)}

@router.delete("/presenze/{presenza_id}")
async def delete_presenza(presenza_id: str):
    await get_db().presenze_cloud.delete_one({"id": presenza_id})
    return {"ok": True}


# ============ FERIE ============

@router.get("/ferie")
async def get_ferie(dipendente_id: Optional[str] = None, stato: Optional[str] = None):
    q: dict = {}
    if dipendente_id:
        q["dipendente_id"] = dipendente_id
    if stato:
        q["stato"] = stato
    return await get_db().ferie_cloud.find(q, {"_id": 0}).to_list(1000)

@router.post("/ferie")
async def create_ferie(f: FerieModel):
    d = f.model_dump()
    d["id"] = gen_id()
    d["created_at"] = now_iso()
    await get_db().ferie_cloud.insert_one(d)
    return clean(d)

@router.put("/ferie/{ferie_id}/approva")
async def approva_ferie(ferie_id: str):
    r = await get_db().ferie_cloud.update_one({"id": ferie_id}, {"$set": {"stato": "approvata"}})
    if r.matched_count == 0:
        raise HTTPException(404, "Non trovato")
    return {"ok": True}

@router.put("/ferie/{ferie_id}/rifiuta")
async def rifiuta_ferie(ferie_id: str):
    r = await get_db().ferie_cloud.update_one({"id": ferie_id}, {"$set": {"stato": "rifiutata"}})
    if r.matched_count == 0:
        raise HTTPException(404, "Non trovato")
    return {"ok": True}

@router.delete("/ferie/{ferie_id}")
async def delete_ferie(ferie_id: str):
    await get_db().ferie_cloud.delete_one({"id": ferie_id})
    return {"ok": True}


# ============ TURNI ============

@router.get("/turni")
async def get_turni():
    return await get_db().turni_cloud.find({}, {"_id": 0}).to_list(100)

@router.post("/turni")
async def create_turno(t: TurnoModel):
    d = t.model_dump()
    d["id"] = gen_id()
    await get_db().turni_cloud.insert_one(d)
    return clean(d)

@router.put("/turni/{turno_id}")
async def update_turno(turno_id: str, t: TurnoModel):
    r = await get_db().turni_cloud.update_one({"id": turno_id}, {"$set": t.model_dump()})
    if r.matched_count == 0:
        raise HTTPException(404, "Non trovato")
    return {"ok": True}

@router.delete("/turni/{turno_id}")
async def delete_turno(turno_id: str):
    await get_db().turni_cloud.delete_one({"id": turno_id})
    await get_db().assegnazioni_turni_cloud.delete_many({"turno_id": turno_id})
    return {"ok": True}

@router.get("/assegnazioni-turni")
async def get_assegnazioni():
    return await get_db().assegnazioni_turni_cloud.find({}, {"_id": 0}).to_list(1000)

@router.post("/assegnazioni-turni")
async def upsert_assegnazione(data: dict):
    dip_id = data.get("dipendente_id")
    giorno = data.get("giorno")
    turno_id = data.get("turno_id")
    if not dip_id or not giorno:
        raise HTTPException(400, "dipendente_id e giorno obbligatori")
    existing = await get_db().assegnazioni_turni_cloud.find_one(
        {"dipendente_id": dip_id, "giorno": giorno}
    )
    if turno_id:
        if existing:
            await get_db().assegnazioni_turni_cloud.update_one(
                {"id": existing["id"]}, {"$set": {"turno_id": turno_id}}
            )
        else:
            await get_db().assegnazioni_turni_cloud.insert_one({
                "id": gen_id(), "dipendente_id": dip_id, "giorno": giorno, "turno_id": turno_id
            })
    else:
        if existing:
            await get_db().assegnazioni_turni_cloud.delete_one({"id": existing["id"]})
    return {"ok": True}


# ============ BUSTE PAGA ============

@router.get("/buste-paga")
async def get_buste_paga(anno: Optional[int] = None, mese: Optional[int] = None, dipendente_id: Optional[str] = None):
    q: dict = {}
    if anno:
        q["anno"] = anno
    if mese:
        q["mese"] = mese
    if dipendente_id:
        dip = await get_db().dipendenti_cloud.find_one({"id": dipendente_id})
        if dip:
            q["$or"] = [
                {"dipendente_id": dipendente_id},
                {"nome_dipendente": {"$regex": dip.get("cognome", ""), "$options": "i"}},
            ]
    # Prima cerca nella collection cedolini (storico)
    cedolini = await get_db().cedolini.find(q, {"_id": 0}).sort([("anno", -1), ("mese", -1)]).to_list(1000)
    result = []
    for c in cedolini:
        result.append({
            "id": c.get("id", ""),
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
            "created_at": c.get("created_at", ""),
        })
    return result

@router.post("/buste-paga")
async def create_busta(b: BustaPagaModel):
    d = b.model_dump()
    d["id"] = gen_id()
    d["created_at"] = now_iso()
    await get_db().buste_paga_cloud.insert_one(d)
    return clean(d)

@router.post("/buste-paga/genera")
async def genera_buste(data: dict):
    mese = data.get("mese")
    anno = data.get("anno")
    lordo = data.get("lordo", 1500)
    if not mese or not anno:
        raise HTTPException(400, "mese e anno obbligatori")
    dipendenti = await get_db().dipendenti_cloud.find({"stato": "attivo"}, {"_id": 0}).to_list(1000)
    created = 0
    for dip in dipendenti:
        existing = await get_db().buste_paga_cloud.find_one(
            {"dipendente_id": dip["id"], "mese": mese, "anno": anno}
        )
        if not existing:
            inps = round(lordo * 0.0919, 2)
            irpef = round((lordo - inps) * 0.23, 2)
            netto = round(lordo - inps - irpef, 2)
            await get_db().buste_paga_cloud.insert_one({
                "id": gen_id(), "dipendente_id": dip["id"],
                "mese": mese, "anno": anno, "lordo": lordo,
                "inps": inps, "irpef": irpef, "trattenute": 0,
                "netto": netto, "stato": "DA_PAGARE", "created_at": now_iso(),
            })
            created += 1
    return {"generated": created}

@router.put("/buste-paga/{busta_id}/paga")
async def paga_busta(busta_id: str):
    r = await get_db().buste_paga_cloud.update_one(
        {"id": busta_id}, {"$set": {"stato": "PAGATO", "data_pagamento": now_iso()}}
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Non trovato")
    return {"ok": True}


# ============ MISSIONI ============

@router.get("/missioni")
async def get_missioni(dipendente_id: Optional[str] = None, stato: Optional[str] = None):
    q: dict = {}
    if dipendente_id:
        q["dipendente_id"] = dipendente_id
    if stato:
        q["stato"] = stato
    return await get_db().missioni_cloud.find(q, {"_id": 0}).to_list(1000)

@router.post("/missioni")
async def create_missione(m: MissioneModel):
    d = m.model_dump()
    d["id"] = gen_id()
    d["created_at"] = now_iso()
    await get_db().missioni_cloud.insert_one(d)
    return clean(d)

@router.put("/missioni/{missione_id}/approva")
async def approva_missione(missione_id: str):
    r = await get_db().missioni_cloud.update_one({"id": missione_id}, {"$set": {"stato": "approvata"}})
    if r.matched_count == 0:
        raise HTTPException(404, "Non trovato")
    return {"ok": True}

@router.delete("/missioni/{missione_id}")
async def delete_missione(missione_id: str):
    await get_db().missioni_cloud.delete_one({"id": missione_id})
    return {"ok": True}


# ============ DOCUMENTI ============

@router.get("/documenti")
async def get_documenti(dipendente_id: Optional[str] = None):
    q: dict = {}
    if dipendente_id:
        q["dipendente_id"] = dipendente_id
    return await get_db().documenti_cloud.find(q, {"_id": 0}).to_list(1000)

@router.post("/documenti")
async def create_documento(doc: DocumentoModel):
    d = doc.model_dump()
    d["id"] = gen_id()
    d["data_caricamento"] = now_iso()
    await get_db().documenti_cloud.insert_one(d)
    return clean(d)

@router.delete("/documenti/{documento_id}")
async def delete_documento(documento_id: str):
    await get_db().documenti_cloud.delete_one({"id": documento_id})
    return {"ok": True}


# ============ DASHBOARD STATS ============

@router.get("/dashboard/stats")
async def get_stats():
    db = get_db()
    dipendenti = await db.dipendenti_cloud.find({}, {"_id": 0}).to_list(1000)
    # Fallback se dipendenti_cloud vuota
    if not dipendenti:
        dipendenti = await db.dipendenti.find({}, {"_id": 0}).to_list(1000)
    attivi = sum(1 for d in dipendenti if d.get("stato") == "attivo")
    ferie_pending = await db.ferie_cloud.count_documents({"stato": "in_attesa"})
    missioni_pending = await db.missioni_cloud.count_documents({"stato": "in_attesa"})
    today = datetime.now().strftime("%Y-%m-%d")
    presenze_oggi = await db.presenze_cloud.count_documents({"data": today, "stato": "presente"})
    return {
        "totale_dipendenti": len(dipendenti),
        "dipendenti_attivi": attivi,
        "ferie_in_attesa": ferie_pending,
        "missioni_in_attesa": missioni_pending,
        "presenze_oggi": presenze_oggi,
    }
