import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Calendar, FileText, Inbox, Bell, Users, LogOut, Download,
  Check, ChevronLeft, Send, Eye, ClipboardList, Settings,
} from "lucide-react";
import "./portale.css";

const TK = "pt_token";
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((c) => {
  const t = localStorage.getItem(TK);
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

const TIPI = [
  { v: "ferie_programmate", l: "Ferie programmate", date: true },
  { v: "indisponibilita", l: "Indisponibilità", date: true },
  { v: "cambio_turno", l: "Cambio turno" },
  { v: "acconto_stipendio", l: "Acconto stipendio" },
  { v: "acconto_tfr", l: "Acconto TFR" },
  { v: "anticipo_retribuzione", l: "Anticipo retribuzione" },
  { v: "cambio_mansione", l: "Cambio mansione" },
  { v: "reclamo", l: "Reclamo" },
  { v: "contestazione_busta", l: "Contestazione busta paga" },
];
const tipoLabel = (v) => (TIPI.find((t) => t.v === v) || {}).l || v;
const fmt = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "-");

function turnoCell(a) {
  if (!a || !a.turno) return <span className="t-riposo">—</span>;
  if (a.turno === "lunga") return <span className="t-lunga">{a.label}</span>;
  if (a.turno === "riposo") return <span className="t-riposo">Riposo</span>;
  if (a.turno === "indisponibile") return <span className="t-indisp">Ferie</span>;
  return <span className="t-lav">{a.inizio}–{a.fine}</span>;
}

/* ---------------- LOGIN ---------------- */
function Login({ onLogin }) {
  const [lista, setLista] = useState([]);
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get("/auth/dipendenti-login").then((r) => setLista(r.data)).catch(() => {});
  }, []);

  const press = (n) => { setErr(""); if (pin.length < 8) setPin(pin + n); };
  const submit = async (p) => {
    try {
      const r = await api.post("/auth/pin-login", { dipendente_id: sel.id, pin: p });
      localStorage.setItem(TK, r.data.access_token);
      localStorage.setItem("pt_role", r.data.role);
      localStorage.setItem("pt_name", r.data.name || sel.nome_completo);
      onLogin();
    } catch { setErr("PIN errato"); setPin(""); }
  };
  useEffect(() => { if (pin.length >= 4 && sel) {/* attendi conferma */} }, [pin, sel]);

  if (!sel) return (
    <div className="login">
      <div className="brand"><div className="logo"><Users size={30} /></div>
        <h2>Portale Dipendenti</h2><div className="muted" style={{textAlign:"center"}}>Ceraldi Group</div></div>
      <div className="card"><h3>Chi sei?</h3>
        {lista.length === 0 && <div className="muted">Nessun dipendente abilitato. Chiedi all'amministratore di impostare il tuo PIN.</div>}
        {lista.map((d) => (
          <button key={d.id} className="btn gh" style={{ marginTop: 8, textAlign: "left" }} onClick={() => setSel(d)}>
            {d.nome_completo} <span className="muted">· {d.mansione}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="login">
      <button className="btn gh sm" style={{ width: "auto" }} onClick={() => { setSel(null); setPin(""); }}>
        <ChevronLeft size={16} /> indietro</button>
      <h2 style={{ marginTop: 18 }}>Ciao {sel.nome_completo.split(" ")[0]}</h2>
      <div className="muted" style={{ textAlign: "center" }}>Inserisci il tuo PIN</div>
      <div className="pin-dots">{[0,1,2,3].map((i)=><i key={i} className={pin.length>i?"on":""} />)}</div>
      {err && <div className="err">{err}</div>}
      <div className="pinpad">
        {[1,2,3,4,5,6,7,8,9].map((n)=><button key={n} onClick={()=>press(n)}>{n}</button>)}
        <button onClick={()=>setPin("")}>C</button>
        <button onClick={()=>press(0)}>0</button>
        <button onClick={()=>submit(pin)} disabled={pin.length<4} style={{color:"var(--violet)"}}>OK</button>
      </div>
    </div>
  );
}

/* ---------------- TURNI ---------------- */
function Turni() {
  const [mine, setMine] = useState(null);
  const [grid, setGrid] = useState(null);
  const [tutti, setTutti] = useState(false);
  useEffect(() => { api.get("/turni/miei/corrente").then((r)=>setMine(r.data)).catch(()=>setMine({giorni:[]})); }, []);
  const vediTutti = async () => {
    setTutti(true);
    if (mine?.settimana_inizio) {
      try { const r = await api.get(`/turni/${mine.settimana_inizio}`); setGrid(r.data); } catch {}
    }
  };
  if (!mine) return <div className="spin">Caricamento…</div>;
  if (!mine.settimana_inizio) return <div className="empty">Nessun turno pubblicato al momento.</div>;
  return (
    <>
      <div className="card">
        <div className="row"><h3 style={{margin:0}}>I miei turni</h3>
          <span className="pill info">sett. {fmt(mine.settimana_inizio)}</span></div>
        {mine.giorni.map((g)=>(
          <div className="daycard" key={g.data}>
            <div><b>{g.giorno_nome}</b> <span className="muted">{fmt(g.data)}</span></div>
            <div>{turnoCell(g.turno)}</div>
          </div>
        ))}
      </div>
      {!tutti ? (
        <button className="btn sec" onClick={vediTutti}><Users size={16}/> Vedi i turni di tutti</button>
      ) : grid ? (
        <div className="card"><h3>Tutti i turni</h3>
          <div className="tgrid"><table>
            <thead><tr><th>Dipendente</th>{grid.giorni.map((g)=><th key={g.data}>{g.giorno_nome.slice(0,3)}<br/>{fmt(g.data)}</th>)}</tr></thead>
            <tbody>
              {Object.entries(grid.totali||{}).map(([id,t])=>(
                <tr key={id}><td className="name">{t.nome}</td>
                  {grid.giorni.map((g)=><td key={g.data}>{turnoCell(g.assegnazioni[id])}</td>)}</tr>
              ))}
            </tbody>
          </table></div>
        </div>
      ) : <div className="spin">Caricamento griglia…</div>}
    </>
  );
}

/* ---------------- BUSTE ---------------- */
function Buste() {
  const [buste, setBuste] = useState(null);
  const load = useCallback(()=>{ api.get("/portale/buste").then((r)=>setBuste(r.data)).catch(()=>setBuste([])); },[]);
  useEffect(()=>{load();},[load]);
  const scarica = async (b) => {
    try {
      const r = await api.get(`/portale/buste/${b.id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a"); a.href = url;
      a.download = b.filename || `busta_${b.mese}_${b.anno}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { alert("PDF non disponibile"); }
  };
  const presaVisione = async (b) => {
    try { await api.post(`/portale/buste/${b.id}/presa-visione`); load(); } catch {}
  };
  if (!buste) return <div className="spin">Caricamento…</div>;
  if (buste.length === 0) return <div className="empty">Nessuna busta paga disponibile.</div>;
  return buste.map((b)=>(
    <div className="card" key={b.id}>
      <div className="row">
        <div><b>{String(b.mese).padStart(2,"0")}/{b.anno}</b>
          <div className="muted">Netto € {Number(b.netto||0).toFixed(2)}</div></div>
        {b.presa_visione ? <span className="pill ok"><Check size={11}/> Presa visione</span>
          : <span className="pill warn">Da leggere</span>}
      </div>
      <div className="row" style={{marginTop:10,gap:8}}>
        <button className="btn sec sm" onClick={()=>scarica(b)}><Download size={14}/> Scarica PDF</button>
        {!b.presa_visione && <button className="btn sm" onClick={()=>presaVisione(b)}><Eye size={14}/> Confermo presa visione</button>}
      </div>
    </div>
  ));
}

/* ---------------- RICHIESTE ---------------- */
function Richieste() {
  const [tipo, setTipo] = useState("ferie_programmate");
  const [dettaglio, setDettaglio] = useState("");
  const [dal, setDal] = useState(""); const [al, setAl] = useState("");
  const [mie, setMie] = useState([]);
  const [msg, setMsg] = useState("");
  const conDate = (TIPI.find((t)=>t.v===tipo)||{}).date;
  const load = useCallback(()=>{ api.get("/richieste/mie").then((r)=>setMie(r.data)).catch(()=>{}); },[]);
  useEffect(()=>{load();},[load]);
  const invia = async () => {
    const dati = conDate ? { dal, al } : {};
    try {
      await api.post("/richieste", { tipo, dettaglio, dati });
      setDettaglio(""); setDal(""); setAl(""); setMsg("Richiesta inviata"); load();
      setTimeout(()=>setMsg(""),2500);
    } catch { setMsg("Errore invio"); }
  };
  return (
    <>
      <div className="card"><h3>Nuova richiesta</h3>
        <label>Tipo</label>
        <select value={tipo} onChange={(e)=>setTipo(e.target.value)}>
          {TIPI.map((t)=><option key={t.v} value={t.v}>{t.l}</option>)}
        </select>
        {conDate && <div className="row" style={{gap:8}}>
          <div style={{flex:1}}><label>Dal</label><input className="input" type="date" value={dal} onChange={(e)=>setDal(e.target.value)}/></div>
          <div style={{flex:1}}><label>Al</label><input className="input" type="date" value={al} onChange={(e)=>setAl(e.target.value)}/></div>
        </div>}
        <label>Note</label>
        <textarea rows={2} value={dettaglio} onChange={(e)=>setDettaglio(e.target.value)} placeholder="Dettagli…" />
        {msg && <div className="muted" style={{marginTop:8}}>{msg}</div>}
        <button className="btn" style={{marginTop:12}} onClick={invia}><Send size={15}/> Invia richiesta</button>
        <div className="muted" style={{marginTop:8,fontSize:12}}>
          Turni → Luigi (responsabile). Tutto il resto → amministratore.</div>
      </div>
      <div className="card"><h3>Le mie richieste</h3>
        {mie.length===0 && <div className="muted">Nessuna richiesta.</div>}
        {mie.map((r)=>(
          <div className="daycard" key={r.id}>
            <div><b>{tipoLabel(r.tipo)}</b><div className="muted">{r.dettaglio||"—"}</div></div>
            <span className={`pill ${r.stato==="approvata"?"ok":r.stato==="rifiutata"?"danger":"muted"}`}>{r.stato}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------------- NOTIFICHE ---------------- */
function Notifiche({ onChange }) {
  const [list, setList] = useState([]);
  const load = useCallback(()=>{ api.get("/notifiche").then((r)=>{setList(r.data);onChange&&onChange();}).catch(()=>{}); },[onChange]);
  useEffect(()=>{load();},[load]);
  const letta = async (n) => { await api.post(`/notifiche/${n.id}/letta`); load(); };
  if (list.length===0) return <div className="empty">Nessuna notifica.</div>;
  return list.map((n)=>(
    <div className="card" key={n.id} onClick={()=>!n.letta&&letta(n)} style={{opacity:n.letta?.7:1}}>
      <div className="row"><b>{n.titolo}</b>{!n.letta&&<span className="pill info">nuova</span>}</div>
      <div className="muted" style={{whiteSpace:"pre-line",marginTop:6}}>{n.messaggio}</div>
    </div>
  ));
}

/* ---------------- GESTIONE (Luigi/admin) ---------------- */
function Gestione() {
  const [lun, setLun] = useState("");
  const [doc, setDoc] = useState(null);
  const [coda, setCoda] = useState([]);
  const [msg, setMsg] = useState("");
  const loadCoda = useCallback(()=>{ api.get("/richieste?stato=aperta").then((r)=>setCoda(r.data)).catch(()=>{}); },[]);
  useEffect(()=>{loadCoda();},[loadCoda]);
  const genera = async () => {
    setMsg("");
    try { const r = await api.post("/turni/genera",{settimana_inizio:lun}); setDoc(r.data); }
    catch(e){ setMsg(e.response?.data?.detail || "Errore"); }
  };
  const pubblica = async () => {
    try { const r = await api.post(`/turni/${doc.settimana_inizio}/pubblica`); setMsg(`Pubblicato, ${r.data.dipendenti_notificati} notificati`); setDoc({...doc,stato:"pubblicato"}); }
    catch(e){ setMsg(e.response?.data?.detail || "Errore"); }
  };
  const risolvi = async (r, esito) => { await api.post(`/richieste/${r.id}/risolvi`,{esito}); loadCoda(); };
  return (
    <>
      <div className="card"><h3>Genera turni</h3>
        <label>Settimana (lunedì)</label>
        <input className="input" type="date" value={lun} onChange={(e)=>setLun(e.target.value)} />
        <button className="btn" style={{marginTop:10}} onClick={genera} disabled={!lun}><Calendar size={15}/> Genera bozza</button>
        {msg && <div className="muted" style={{marginTop:8}}>{msg}</div>}
        {doc && <>
          {doc.avvisi?.length>0 && <div className="err" style={{marginTop:10}}>
            <b>Avvisi:</b><br/>{doc.avvisi.join(" · ")}</div>}
          <div className="tgrid" style={{marginTop:10}}><table>
            <thead><tr><th>Dip.</th>{doc.giorni.map((g)=><th key={g.data}>{g.giorno_nome.slice(0,3)}</th>)}</tr></thead>
            <tbody>{Object.entries(doc.totali||{}).map(([id,t])=>(
              <tr key={id}><td className="name">{t.nome}</td>
                {doc.giorni.map((g)=><td key={g.data}>{turnoCell(g.assegnazioni[id])}</td>)}</tr>))}
            </tbody></table></div>
          {doc.stato!=="pubblicato" && <button className="btn" style={{marginTop:10}} onClick={pubblica}><Send size={15}/> Pubblica e notifica</button>}
        </>}
      </div>
      <div className="card"><h3>Richieste da gestire</h3>
        {coda.length===0 && <div className="muted">Nessuna richiesta aperta.</div>}
        {coda.map((r)=>(
          <div className="daycard" key={r.id}>
            <div><b>{r.dipendente_nome}</b><div className="muted">{tipoLabel(r.tipo)} · {r.dettaglio||"—"}</div></div>
            <div style={{display:"flex",gap:6}}>
              <button className="btn sm" onClick={()=>risolvi(r,"approvata")}><Check size={14}/></button>
              <button className="btn gh sm" onClick={()=>risolvi(r,"rifiutata")}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------------- SHELL ---------------- */
export default function PortaleDipendente() {
  const [logged, setLogged] = useState(!!localStorage.getItem(TK));
  const [tab, setTab] = useState("turni");
  const [nonLette, setNonLette] = useState(0);
  const role = localStorage.getItem("pt_role");
  const isGestore = role === "responsabile_turni" || role === "admin";

  const refreshBadge = useCallback(()=>{ api.get("/notifiche/conteggio").then((r)=>setNonLette(r.data.non_lette)).catch(()=>{}); },[]);
  useEffect(()=>{ if(logged) refreshBadge(); },[logged,tab,refreshBadge]);

  if (!logged) return <div className="pt-root"><Login onLogin={()=>setLogged(true)} /></div>;
  const logout = () => { localStorage.removeItem(TK); localStorage.removeItem("pt_role"); localStorage.removeItem("pt_name"); setLogged(false); };

  const tabs = [
    { k:"turni", l:"Turni", icon:Calendar },
    { k:"buste", l:"Buste", icon:FileText },
    { k:"richieste", l:"Richieste", icon:Inbox },
    { k:"notifiche", l:"Avvisi", icon:Bell },
    ...(isGestore ? [{ k:"gestione", l:"Gestione", icon:Settings }] : []),
  ];

  return (
    <div className="pt-root">
      <div className="pt-head">
        <h1>Portale Dipendenti</h1>
        <div className="sub">{localStorage.getItem("pt_name")}{isGestore?` · ${role==="admin"?"admin":"responsabile turni"}`:""}</div>
        <button className="logout" onClick={logout}><LogOut size={13}/> Esci</button>
      </div>
      <div className="pt-body">
        {tab==="turni" && <Turni/>}
        {tab==="buste" && <Buste/>}
        {tab==="richieste" && <Richieste/>}
        {tab==="notifiche" && <Notifiche onChange={refreshBadge}/>}
        {tab==="gestione" && isGestore && <Gestione/>}
      </div>
      <div className="tabbar">
        {tabs.map((t)=>{
          const I=t.icon;
          return <button key={t.k} className={`tab ${tab===t.k?"active":""}`} onClick={()=>setTab(t.k)}>
            <I size={20}/>{t.l}
            {t.k==="notifiche" && nonLette>0 && <span className="dot">{nonLette}</span>}
          </button>;
        })}
      </div>
    </div>
  );
}
