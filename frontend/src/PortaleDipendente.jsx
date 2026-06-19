import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Calendar, FileText, Inbox, Bell, Users, LogOut, Download,
  Check, ChevronLeft, Send, Eye, ClipboardList, Settings,
  FolderOpen, Upload, Trash2, AlertTriangle,
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
      const body = sel.admin ? { pin: p } : { dipendente_id: sel.id, pin: p };
      const r = await api.post("/auth/pin-login", body);
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
        {lista.length === 0 && <div className="muted">Nessun dipendente abilitato. Entra come amministratore per impostare i PIN.</div>}
        {lista.map((d) => (
          <button key={d.id} className="btn gh" style={{ marginTop: 8, textAlign: "left" }} onClick={() => setSel(d)}>
            {d.nome_completo} <span className="muted">· {d.mansione}</span>
          </button>
        ))}
      </div>
      <button className="btn sec" onClick={() => setSel({ id: null, nome_completo: "Amministratore", admin: true })}>
        Accesso amministratore</button>
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
/* ===================== MOTORE TURNI (regole pasticceria) =====================
   Ricostruito dai file HTML condivisi. Squadra di 6, lunghe a rotazione,
   Luigi riposa il lunedì ed è sempre lunga il sabato, Angela riposa il giovedì
   e la domenica è al banco. Nessuno due lunghe o due riposi di fila; chi fa la
   lunga venerdì non la fa il sabato. */
const TEAM = ["Luigi", "Angela", "Giuliano", "Liliana", "Carmine", "Mario"];
const GG = ["Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato","Domenica"];

function rotate(a,n){ return a.slice(n).concat(a.slice(0,n)); }
function pickN(cands,used,n){ const out=[]; for(const p of cands){ if(!used.has(p)&&out.length<n){ out.push(p); used.add(p);} } return out; }
function isFixedRest(day,p){ return (day===0&&p==="Luigi")||(day===3&&p==="Angela"); }
function weekdayLong(day,startName,weekLongs,prevLong){
  const start=TEAM.indexOf(startName);
  const pref=rotate(TEAM,(start<0?0:start)+day);
  let list=pref.filter(p=>!isFixedRest(day,p)&&p!==prevLong&&!weekLongs.has(p));
  if(day===4)list=list.filter(p=>p!=="Luigi");
  if(!list.length)list=pref.filter(p=>!isFixedRest(day,p)&&p!==prevLong&&!(day===4&&p==="Luigi"));
  if(!list.length)list=pref.filter(p=>!isFixedRest(day,p));
  return list[0];
}
function chooseRest(day,used,prevRest){
  if(day===0)return "Luigi"; if(day===3)return "Angela";
  let c=rotate(TEAM,day).filter(p=>!used.has(p)&&p!==prevRest);
  if(day===2)c=c.filter(p=>p!=="Angela"); if(day===1)c=c.filter(p=>p!=="Luigi");
  if(!c.length)c=TEAM.filter(p=>!used.has(p)); return c[0];
}
function generaSchedule(startLong){
  const sched=[]; let prevLong=null,prevRest=null,fridayLong=null; const weekLongs=new Set();
  for(let d=0; d<7; d++){
    const day={m1:[],m2:[],longa:[],pom:[],rip:[],note:[]};
    if(d===6){ day.m1=[{p:"Angela",time:"07:00–15:00",bank:true}]; day.rip=[{p:"— altri a riposo",time:""}]; day.note=["Angela al banco. Gli altri non in turno."]; sched.push(day); continue; }
    const used=new Set(), cands=rotate(TEAM,d);
    if(d<5){
      const lunga=weekdayLong(d,startLong,weekLongs,prevLong); used.add(lunga); weekLongs.add(lunga);
      const rip=chooseRest(d,used,prevRest); used.add(rip);
      const m1=pickN(cands,used,1)[0], m2=pickN(cands,used,1)[0], pom=pickN(cands,used,2);
      day.m1=[{p:m1,time:"07:00–15:00"}]; day.m2=[{p:m2,time:"08:00–16:00"}];
      day.longa=[{p:lunga,time:"09:30–19:30"}]; day.pom=pom.map(p=>({p,time:"15:00–21:00"})); day.rip=[{p:rip,time:""}];
      if(d===0)day.note.push("Luigi riposo fisso"); if(d===3)day.note.push("Angela riposo fisso");
      prevLong=lunga; prevRest=rip; if(d===4)fridayLong=lunga;
    } else {
      const lunga1="Luigi"; const start=TEAM.indexOf(startLong);
      let pref=rotate(TEAM,(start<0?0:start)+5).filter(p=>p!==lunga1&&p!==fridayLong&&p!==prevLong);
      if(!pref.length)pref=TEAM.filter(p=>p!==lunga1&&p!==fridayLong); if(!pref.length)pref=TEAM.filter(p=>p!==lunga1);
      const lunga2=pref[0]; used.add(lunga1); used.add(lunga2);
      const matt=pickN(cands,used,2), pom=pickN(cands,used,2);
      day.m1=[{p:matt[0],time:"07:00–15:00"}]; day.m2=[{p:matt[1],time:"08:00–16:00"}];
      day.longa=[{p:lunga1,time:"09:00–19:00"},{p:lunga2,time:"09:30–19:30"}];
      day.pom=pom.map(p=>({p,time:"15:00–21:00"})); day.rip=[{p:"— tutti presenti",time:""}];
      day.note=["Sabato: Luigi sempre lunga."];
    }
    sched.push(day);
  }
  return sched;
}
function turnoDi(day,nome){
  if(!day) return null;
  for(const k of ["longa","m1","m2","pom","rip"]){
    const hit=(day[k]||[]).find(x=>x.p===nome);
    if(hit) return {k, time:hit.time};
  }
  return null;
}
function Chip({t}){
  if(!t || !t.k) return <span className="t-riposo">—</span>;
  if(t.k==="longa") return <span className="t-lunga">Lunga{t.time?` ${t.time}`:""}</span>;
  if(t.k==="rip") return <span className="t-riposo">Riposo</span>;
  return <span className="t-lav">{t.time||"—"}</span>;
}
function prossimoLunedi(){ const d=new Date(); const off=(d.getDay()+6)%7; d.setDate(d.getDate()-off); return d.toISOString().slice(0,10); }
function settimanaDate(monday){ const out=[]; const base=new Date(monday+"T12:00:00"); for(let i=0;i<7;i++){ const x=new Date(base); x.setDate(x.getDate()+i); out.push(x.toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"})); } return out; }

function Turni() {
  const [griglia, setGriglia] = useState(null);
  const [tutti, setTutti] = useState(false);
  const role = localStorage.getItem("pt_role");
  const isGestore = role === "responsabile_turni" || role === "admin";
  const mioNome = (localStorage.getItem("pt_name") || "").split(" ")[0];
  useEffect(() => { api.get("/turni/griglia/corrente").then((r)=>setGriglia(r.data)).catch(()=>setGriglia({settimana_inizio:null})); }, []);
  if (!griglia) return <div className="spin">Caricamento…</div>;
  if (!griglia.settimana_inizio) return (
    <div className="empty">Nessun turno pubblicato.<br/>
      {isGestore ? "Vai nella scheda Gestione per generarli e pubblicarli." : "Il responsabile non ha ancora pubblicato i turni della settimana."}
    </div>
  );
  const date = settimanaDate(griglia.settimana_inizio);
  const persone = (griglia.persone && griglia.persone.length) ? griglia.persone : TEAM;
  const giorni = griglia.giorni || [];
  return (
    <>
      <div className="card">
        <div className="row"><h3 style={{margin:0}}>I miei turni</h3>
          <span className="pill info">sett. {fmt(griglia.settimana_inizio)}</span></div>
        {giorni.map((g,i)=>(
          <div className="daycard" key={i}>
            <div><b>{GG[i]}</b> <span className="muted">{date[i]}</span></div>
            <div><Chip t={turnoDi(g, mioNome)}/></div>
          </div>
        ))}
      </div>
      {!tutti ? (
        <button className="btn sec" onClick={()=>setTutti(true)}><Users size={16}/> Vedi i turni di tutti</button>
      ) : (
        <div className="card"><h3>Tutti i turni · sett. {fmt(griglia.settimana_inizio)}</h3>
          <div className="tgrid"><table>
            <thead><tr><th>Dip.</th>{GG.map((g,i)=><th key={i}>{g.slice(0,3)}<br/>{date[i]}</th>)}</tr></thead>
            <tbody>
              {persone.map((p)=>(
                <tr key={p}><td className="name">{p}</td>
                  {giorni.map((g,i)=><td key={i}><Chip t={turnoDi(g,p)}/></td>)}</tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </>
  );
}

/* ---------------- BUSTE ---------------- */
function Buste() {
  const [buste, setBuste] = useState(null);
  const [aperta, setAperta] = useState(null);
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
  const accetta = async (b) => {
    try { await api.post(`/portale/buste/${b.id}/presa-visione`); } catch {}
    setAperta(null); load();
    setTimeout(()=>alert(
      "Presa visione registrata con data e ora.\n\n" +
      "Se non sei d'accordo con questa busta puoi contestarla: vai nella sezione " +
      "Documenti e scarica il «Modulo di contestazione busta paga»."
    ), 80);
  };
  if (!buste) return <div className="spin">Caricamento…</div>;
  if (buste.length === 0) return <div className="empty">Nessuna busta paga disponibile.</div>;
  const mm = (b)=>String(b.mese).padStart(2,"0");
  return (
    <>
      {buste.map((b)=>(
        <div className="card" key={b.id}>
          <div className="row">
            <div><b>{mm(b)}/{b.anno}</b>
              <div className="muted">Netto € {Number(b.netto||0).toFixed(2)}</div></div>
            {b.presa_visione ? <span className="pill ok"><Check size={11}/> Presa visione</span>
              : <span className="pill warn">Da leggere</span>}
          </div>
          <div className="row" style={{marginTop:10}}>
            <button className="btn sm" style={{width:"100%",justifyContent:"center"}} onClick={()=>setAperta(b)}>
              <Eye size={14}/> Apri busta
            </button>
          </div>
        </div>
      ))}
      {aperta && (
        <div onClick={()=>setAperta(null)}
             style={{position:"fixed",inset:0,background:"rgba(30,27,40,.5)",display:"flex",
                     alignItems:"center",justifyContent:"center",padding:18,zIndex:1000}}>
          <div onClick={(e)=>e.stopPropagation()}
               style={{background:"#fff",borderRadius:16,padding:20,maxWidth:440,width:"100%",
                       maxHeight:"85vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
            <h3 style={{margin:"0 0 2px"}}>Busta paga {mm(aperta)}/{aperta.anno}</h3>
            <div className="muted">Netto € {Number(aperta.netto||0).toFixed(2)}</div>
            {aperta.acconto_cedolino ? (
              <div className="muted" style={{marginTop:2}}>
                Acconto già erogato € {Number(aperta.acconto_cedolino).toFixed(2)} · saldo € {Number(aperta.saldo_residuo||0).toFixed(2)}
              </div>
            ) : null}
            <div style={{background:"#eef3ef",border:"1px solid #d9e4dc",borderRadius:10,
                         padding:12,fontSize:13,lineHeight:1.55,margin:"12px 0"}}>
              Dichiaro di aver ricevuto e preso visione della busta paga relativa al mese
              di <b>{mm(aperta)}/{aperta.anno}</b>. La presente accettazione viene registrata
              con data e ora e ha valore di ricevuta. In caso di disaccordo posso contestare
              la busta tramite il modulo nella sezione <b>Documenti</b>.
            </div>
            {aperta.presa_visione && (
              <div className="pill ok" style={{marginBottom:12}}><Check size={11}/> Già accettata il {aperta.presa_visione_il ? fmt(aperta.presa_visione_il) : ""}</div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <button className="btn sec" onClick={()=>scarica(aperta)}><Download size={14}/> Scarica PDF</button>
              {aperta.presa_visione
                ? <button className="btn" onClick={()=>setAperta(null)}>Chiudi</button>
                : <button className="btn" onClick={()=>accetta(aperta)}><Check size={14}/> Chiudi e conferma presa visione</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
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
  const isAdmin = (localStorage.getItem("pt_role") || "") === "admin";
  const [lun, setLun] = useState(prossimoLunedi());
  const [startLong, setStartLong] = useState("Luigi");
  const [sched, setSched] = useState(null);
  const [msg, setMsg] = useState("");
  const [coda, setCoda] = useState([]);
  const [accessi, setAccessi] = useState([]);
  const [pinIn, setPinIn] = useState({});
  const [sgg, setSgg] = useState(0);
  const [sout, setSout] = useState("Angela");
  const [sin, setSin] = useState("Luigi");
  const loadCoda = useCallback(()=>{ api.get("/richieste?stato=aperta").then((r)=>setCoda(r.data)).catch(()=>{}); },[]);
  const loadAccessi = useCallback(()=>{ api.get("/accessi").then((r)=>setAccessi(r.data)).catch(()=>{}); },[]);
  useEffect(()=>{loadCoda(); if(isAdmin) loadAccessi();},[loadCoda,loadAccessi,isAdmin]);
  const salvaPin = async (id)=>{ const pin=pinIn[id]; if(!pin)return; try{await api.post(`/accessi/${id}/pin`,{pin});}catch{} setPinIn({...pinIn,[id]:""}); loadAccessi(); };
  const salvaRuolo = async (id,ruolo_app)=>{ try{await api.post(`/accessi/${id}/ruolo`,{ruolo_app});}catch{} loadAccessi(); };
  const date = settimanaDate(lun);
  const elabora = ()=>{ setSched(generaSchedule(startLong)); setMsg(""); };
  const sostituisci = ()=>{
    if(!sched) return;
    if(sout===sin){ setMsg("Scegli due persone diverse"); return; }
    const day = sched[sgg]; if(!day) return;
    const ks=["m1","m2","longa","pom","rip"];
    let kOut=null,kIn=null;
    for(const k of ks){ if((day[k]||[]).some(x=>x.p===sout))kOut=k; if((day[k]||[]).some(x=>x.p===sin))kIn=k; }
    if(!kOut){ setMsg(`${sout} non è in turno il ${GG[sgg]}`); return; }
    (day[kOut]||[]).forEach(x=>{ if(x.p===sout)x.p=sin; });
    if(kIn)(day[kIn]||[]).forEach(x=>{ if(x.p===sin)x.p=sout; });
    day.note=[...(day.note||[]), `Scambio: ${sin} ⇄ ${sout}`];
    setSched([...sched]); setMsg(`${sin} sostituisce ${sout} il ${GG[sgg]}`);
  };
  const pubblica = async ()=>{
    if(!sched){ setMsg("Prima elabora i turni"); return; }
    try{ const r=await api.post("/turni/griglia",{settimana_inizio:lun,persone:TEAM,giorni:sched});
      setMsg(`Pubblicato · ${r.data.dipendenti_notificati} dipendenti notificati`);
    }catch(e){ setMsg(e.response?.data?.detail || "Errore nella pubblicazione"); }
  };
  const risolvi = async (r, esito) => { await api.post(`/richieste/${r.id}/risolvi`,{esito}); loadCoda(); };
  return (
    <>
      <div className="card"><h3>Genera turni settimana</h3>
        <label>Settimana (lunedì)</label>
        <input className="input" type="date" value={lun} onChange={(e)=>setLun(e.target.value)} />
        <label>Chi fa la lunga il lunedì</label>
        <select value={startLong} onChange={(e)=>setStartLong(e.target.value)}>
          {TEAM.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
        <button className="btn" style={{marginTop:10}} onClick={elabora}><Calendar size={15}/> Elabora turni</button>
        {msg && <div className="muted" style={{marginTop:8}}>{msg}</div>}
        {sched && <>
          <div className="tgrid" style={{marginTop:10}}><table>
            <thead><tr><th>Dip.</th>{GG.map((g,i)=><th key={i}>{g.slice(0,3)}<br/>{date[i]}</th>)}</tr></thead>
            <tbody>{TEAM.map(p=>(
              <tr key={p}><td className="name">{p}</td>
                {sched.map((g,i)=><td key={i}><Chip t={turnoDi(g,p)}/></td>)}</tr>))}
            </tbody></table></div>
          <button className="btn" style={{marginTop:10}} onClick={pubblica}><Send size={15}/> Pubblica e notifica</button>
        </>}
      </div>
      {sched && <div className="card"><h3>Sostituzione rapida</h3>
        <label>Giorno</label>
        <select value={sgg} onChange={(e)=>setSgg(Number(e.target.value))}>
          {GG.map((g,i)=><option key={i} value={i}>{g}</option>)}</select>
        <div className="row" style={{gap:8,alignItems:"flex-end"}}>
          <div style={{flex:1}}><label>Chi non può</label>
            <select value={sout} onChange={(e)=>setSout(e.target.value)}>{TEAM.map(p=><option key={p}>{p}</option>)}</select></div>
          <div style={{flex:1}}><label>Lo sostituisce</label>
            <select value={sin} onChange={(e)=>setSin(e.target.value)}>{TEAM.map(p=><option key={p}>{p}</option>)}</select></div>
        </div>
        <button className="btn sec" style={{marginTop:10}} onClick={sostituisci}>Applica scambio</button>
        <div className="muted" style={{marginTop:6,fontSize:12}}>Ricordati di ripubblicare dopo le modifiche.</div>
      </div>}
      {isAdmin && (
      <div className="card"><h3>Accessi dipendenti</h3>
        {accessi.length===0 && <div className="muted">Nessun dipendente in anagrafica.</div>}
        {accessi.map((d)=>(
          <div className="daycard" key={d.id} style={{flexDirection:"column",alignItems:"stretch",gap:6}}>
            <div className="row"><div><b>{d.nome_completo}</b> <span className="muted">· {d.mansione}</span></div>
              {d.pin_impostato?<span className="pill ok">PIN ok</span>:<span className="pill warn">no PIN</span>}</div>
            <div className="row" style={{gap:6}}>
              <input className="input" style={{marginTop:0}} inputMode="numeric" placeholder="nuovo PIN" value={pinIn[d.id]||""} onChange={(e)=>setPinIn({...pinIn,[d.id]:e.target.value})}/>
              <button className="btn sm" onClick={()=>salvaPin(d.id)}>Salva PIN</button>
            </div>
            <select value={d.ruolo_app} onChange={(e)=>salvaRuolo(d.id,e.target.value)}>
              <option value="dipendente">dipendente</option>
              <option value="responsabile_turni">responsabile turni</option>
              <option value="admin">admin</option>
            </select>
          </div>
        ))}
      </div>
      )}
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

/* ---------------- DOCUMENTI ---------------- */
function Documenti() {
  const [docs, setDocs] = useState(null);
  const [busy, setBusy] = useState("");
  const load = useCallback(()=>{ api.get("/portale/documenti").then((r)=>setDocs(r.data)).catch(()=>setDocs([])); },[]);
  useEffect(()=>{load();},[load]);
  const perTipo = (t)=> (docs||[]).filter((d)=>d.tipo===t);

  const blobDownload = (data, nome) => {
    const url = URL.createObjectURL(data);
    const a = document.createElement("a"); a.href=url; a.download=nome; a.click();
    URL.revokeObjectURL(url);
  };
  const scaricaModulo = async (tipo) => {
    try { const r = await api.get(`/portale/documenti/modulo/${tipo}`, {responseType:"blob"});
      blobDownload(r.data, `modulo_${tipo}.pdf`);
    } catch { alert("Modulo non disponibile"); }
  };
  const scaricaFile = async (d) => {
    try { const r = await api.get(`/portale/documenti/${d.id}/file`, {responseType:"blob"});
      blobDownload(r.data, d.nome_file || "documento");
    } catch { alert("Documento non disponibile"); }
  };
  const carica = async (tipo, ev) => {
    const file = ev.target.files?.[0]; if(!file) return;
    const fd = new FormData(); fd.append("tipo", tipo); fd.append("file", file);
    setBusy(tipo);
    try { await api.post("/portale/documenti/upload", fd, {headers:{"Content-Type":"multipart/form-data"}}); load(); }
    catch(e){ alert(e?.response?.data?.detail || "Errore nel caricamento"); }
    setBusy(""); ev.target.value="";
  };
  const elimina = async (d) => {
    if(!window.confirm("Eliminare questo documento?")) return;
    try { await api.delete(`/portale/documenti/${d.id}`); load(); } catch {}
  };

  if (!docs) return <div className="spin">Caricamento…</div>;

  const FileRow = ({d, eliminabile}) => (
    <div className="row" style={{padding:"8px 0",borderTop:"1px solid #efeae0"}}>
      <div style={{minWidth:0}}>
        <div style={{fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.nome_file}</div>
        <div className="muted" style={{fontSize:12}}>{fmt(d.caricato_il)} · {d.caricato_da==="azienda"?"dall'azienda":"caricato da te"}</div>
      </div>
      <div style={{display:"flex",gap:6}}>
        <button className="btn gh sm" onClick={()=>scaricaFile(d)}><Download size={14}/></button>
        {eliminabile && <button className="btn gh sm" onClick={()=>elimina(d)}><Trash2 size={14}/></button>}
      </div>
    </div>
  );
  const UploadBtn = ({tipo, label}) => (
    <label className="btn sec sm" style={{cursor:"pointer",margin:0}}>
      <Upload size={14}/> {busy===tipo ? "Carico…" : (label||"Carica file")}
      <input type="file" style={{display:"none"}} disabled={busy===tipo}
             onChange={(e)=>carica(tipo,e)} />
    </label>
  );

  const moduli = [
    { t:"contestazione", l:"Contestazione busta paga" },
    { t:"richiesta_ferie", l:"Richiesta ferie / permessi" },
    { t:"richiesta_acconto_tfr", l:"Richiesta acconto TFR" },
  ];

  return (
    <>
      <div className="card">
        <h3 style={{marginTop:0}}><FolderOpen size={16}/> Moduli da compilare</h3>
        <div className="muted" style={{fontSize:13,marginBottom:6}}>
          Scarica il modulo, compilalo e ricaricalo qui. L'azienda lo riceverà.
        </div>
        {moduli.map((m)=>(
          <div key={m.t} style={{borderTop:"1px solid #efeae0",padding:"10px 0"}}>
            <div style={{fontWeight:700,marginBottom:6}}>{m.l}</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button className="btn gh sm" onClick={()=>scaricaModulo(m.t)}><Download size={14}/> Scarica modulo</button>
              <UploadBtn tipo={m.t} label="Invia compilato"/>
            </div>
            {perTipo(m.t).map((d)=><FileRow key={d.id} d={d} eliminabile={d.categoria==="caricato_dipendente"}/>)}
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{marginTop:0}}>Certificazione Unica (CU)</h3>
        {perTipo("certificazione_unica").length===0
          ? <div className="muted" style={{fontSize:13}}>Nessuna CU caricata dall'azienda.</div>
          : perTipo("certificazione_unica").map((d)=><FileRow key={d.id} d={d}/>)}
      </div>

      <div className="card">
        <h3 style={{marginTop:0}}>Unilav</h3>
        {perTipo("unilav").length===0
          ? <div className="muted" style={{fontSize:13}}>Nessun Unilav caricato dall'azienda.</div>
          : perTipo("unilav").map((d)=><FileRow key={d.id} d={d}/>)}
      </div>

      <div className="card">
        <h3 style={{marginTop:0}}>Documenti di riconoscimento</h3>
        <div className="muted" style={{fontSize:13,marginBottom:8}}>
          Carica carta d'identità, codice fiscale o patente.
        </div>
        <UploadBtn tipo="documento_riconoscimento" label="Carica documento"/>
        {perTipo("documento_riconoscimento").map((d)=><FileRow key={d.id} d={d} eliminabile={d.categoria==="caricato_dipendente"}/>)}
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
    { k:"documenti", l:"Documenti", icon:FolderOpen },
    { k:"richieste", l:"Richieste", icon:Inbox },
    { k:"notifiche", l:"Avvisi", icon:Bell },
    ...(isGestore ? [{ k:"gestione", l:"Gestione", icon:Settings }] : []),
  ];

  return (
    <div className="pt-root">
      <div className="pt-head">
        <h1>Portale Dipendenti</h1>
        <div className="sub">{localStorage.getItem("pt_name")}{isGestore?` · ${role==="admin"?"admin":"responsabile turni"}`:""}</div>
        {role==="admin" && <button className="logout" style={{right:96,background:"#3f5a4e",color:"#fff"}} onClick={()=>{window.location.href="/dipendenti";}}><Settings size={13}/> Gestione</button>}
        <button className="logout" onClick={logout}><LogOut size={13}/> Esci</button>
      </div>
      <div className="pt-body">
        {tab==="turni" && <Turni/>}
        {tab==="buste" && <Buste/>}
        {tab==="documenti" && <Documenti/>}
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
