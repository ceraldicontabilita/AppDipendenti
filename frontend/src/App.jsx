/**
 * Dipendenti in Cloud - Modulo HR completo con sidebar dedicata
 * Layout originale con sidebar blu scuro e navigazione tramite URL
 */
import React, { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import Sortable from "sortablejs";
import { 
  Users, Calendar, Clock, FileText, Briefcase, Home, 
  ChevronRight, Plus, Check, X, Edit2, Trash2, 
  MapPin, Euro, Download, RefreshCw, ChevronLeft, Grid3X3,
  User, FolderOpen, Settings, LogOut, ArrowLeft, AlertTriangle,
  Wallet, Receipt, Building2, Inbox, CheckCircle2, Link2
} from "lucide-react";
import "./App.css";

const API = '/api/dipendenti-cloud';

// --- Autenticazione: allega il JWT a ogni chiamata e gestisce la scadenza ---
// L'area gestione è protetta lato server (require_admin/require_staff): senza
// token valido le API rispondono 401/403 e qui riportiamo l'utente al PIN.
axios.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("pt_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});
axios.interceptors.response.use(
  (r) => r,
  (err) => {
    const s = err?.response?.status;
    if (s === 401 || s === 403) {
      localStorage.removeItem("pt_token");
      localStorage.removeItem("pt_role");
      localStorage.removeItem("pt_name");
      if (!location.pathname.startsWith("/portale")) location.replace("/portale");
    }
    return Promise.reject(err);
  }
);

// Helper functions
const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const getInitials = (nome, cognome) => `${nome?.[0] || ""}${cognome?.[0] || ""}`.toUpperCase();

const AVATAR_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];
const getAvatarColor = (str) => {
  let hash = 0;
  for (let i = 0; i < (str || "").length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

// Badge component
const Badge = ({ children, variant = "default" }) => {
  const variants = {
    default: "dc-badge-default",
    success: "dc-badge-success",
    warning: "dc-badge-warning",
    danger: "dc-badge-danger",
    info: "dc-badge-info",
  };
  return <span className={`dc-badge ${variants[variant]}`}>{children}</span>;
};

// Avatar component
const Avatar = ({ nome, cognome, size = "md" }) => {
  const sizes = { sm: "dc-avatar-sm", md: "dc-avatar-md", lg: "dc-avatar-lg" };
  return (
    <div className={`dc-avatar ${sizes[size]}`} style={{ backgroundColor: getAvatarColor(`${nome}${cognome}`) }}>
      {getInitials(nome, cognome)}
    </div>
  );
};

// Main App Component with Router
export default function DipendentiCloudApp({ page: pageProp }) {
  const { page: pageParam } = useParams();
  const navigate = useNavigate();
  const role = typeof window !== "undefined" ? localStorage.getItem("pt_role") : null;
  // Il responsabile turni entra in azienda ma può stare SOLO sulla pagina Turni.
  const soloTurni = role === "responsabile_turni";
  const currentPage = soloTurni ? "turni" : (pageProp || pageParam || "dashboard");

  const [dipendenti, setDipendenti] = useState([]);
  const [presenze, setPresenze] = useState([]);
  const [ferie, setFerie] = useState([]);
  const [turni, setTurni] = useState([]);
  const [bustePaga, setBustePaga] = useState([]);
  const [missioni, setMissioni] = useState([]);
  const [documenti, setDocumenti] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [ordineDip, setOrdineDip] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [dipRes, ferRes, turRes, missRes, docRes, statsRes, ordRes] = await Promise.all([
        axios.get(`${API}/dipendenti`),
        axios.get(`${API}/ferie`),
        axios.get(`${API}/turni`),
        axios.get(`${API}/missioni`),
        axios.get(`${API}/documenti`),
        axios.get(`${API}/dashboard/stats`),
        axios.get(`${API}/ordine-dipendenti`).catch(() => ({ data: { ordine: [] } })),
      ]);
      setDipendenti(dipRes.data || []);
      setFerie(ferRes.data || []);
      setTurni(turRes.data || []);
      setMissioni(missRes.data || []);
      setDocumenti(docRes.data || []);
      setStats(statsRes.data || {});
      setOrdineDip((ordRes.data || {}).ordine || []);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const getDipendente = (id) => dipendenti.find(d => d.id === id);
  const activeDipendenti = (() => {
    const attivi = dipendenti.filter(d => d.stato === "attivo");
    if (!ordineDip.length) return attivi;
    const pos = (id) => { const i = ordineDip.indexOf(id); return i === -1 ? 9999 : i; };
    return [...attivi].sort((a, b) => pos(a.id) - pos(b.id));
  })();

  // Menu items
  const menuItems = soloTurni ? [
    { id: "turni", label: "Turni", icon: Grid3X3, section: "TURNI" },
  ] : [
    { id: "dashboard", label: "Pannello di controllo", icon: Home, section: "GESTIONE" },
    { id: "anagrafica", label: "Anagrafica", icon: User, section: "DIPENDENTI" },
    { id: "presenze", label: "Presenze", icon: Calendar, section: "DIPENDENTI" },
    { id: "ferie-permessi", label: "Ferie & Permessi", icon: Calendar, section: "DIPENDENTI" },
    { id: "turni", label: "Turni", icon: Grid3X3, section: "DIPENDENTI" },
    { id: "timbrature", label: "Timbrature", icon: Clock, section: "DIPENDENTI" },
    { id: "buste-paga", label: "Buste Paga", icon: Euro, section: "DIPENDENTI" },
    { id: "paghe-bonifici", label: "Cedolini & Bonifici", icon: Link2, section: "DIPENDENTI" },
    { id: "documenti", label: "Documenti", icon: FolderOpen, section: "DIPENDENTI" },
    { id: "assunzione", label: "Assunzione & Contratti", icon: Briefcase, section: "DIPENDENTI" },
    { id: "contabilita", label: "Pagamenti", icon: Wallet, section: "CONTABILITÀ" },
    { id: "da-pagare", label: "Da Pagare", icon: AlertTriangle, section: "CONTABILITÀ" },
    { id: "fatture", label: "Fatture", icon: Receipt, section: "CONTABILITÀ" },
    { id: "fornitori", label: "Fornitori", icon: Building2, section: "CONTABILITÀ" },
    { id: "bonifici-banca", label: "Bonifici", icon: Euro, section: "CONTABILITÀ" },
    { id: "riconciliazione", label: "Da Verificare", icon: RefreshCw, section: "CONTABILITÀ" },
    { id: "calendario-pagamenti", label: "Calendario", icon: Calendar, section: "CONTABILITÀ" },
    { id: "documenti-fiscali", label: "Documenti fiscali", icon: Inbox, section: "CONTABILITÀ" },
    { id: "paypal", label: "PayPal", icon: Wallet, section: "CONTABILITÀ" },
  ];

  const pageLabels = {
    dashboard: "Pannello di controllo",
    anagrafica: "Anagrafica",
    presenze: "Presenze",
    "ferie-permessi": "Ferie & Permessi",
    turni: "Turni",
    timbrature: "Timbrature",
    "buste-paga": "Buste Paga",
    "paghe-bonifici": "Cedolini & Bonifici",
    missioni: "Missioni",
    documenti: "Documenti",
    assunzione: "Assunzione & Contratti",
    contabilita: "Pagamenti",
    "da-pagare": "Da Pagare",
    fatture: "Fatture",
    fornitori: "Fornitori",
    "bonifici-banca": "Bonifici",
    riconciliazione: "Da Verificare",
    "calendario-pagamenti": "Calendario",
    "documenti-fiscali": "Documenti fiscali",
    paypal: "PayPal",
  };

  if (loading) {
    return (
      <div className="dc-loading">
        <div className="dc-spinner" />
        <p>Caricamento Dipendenti in Cloud...</p>
      </div>
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return <DashboardPage stats={stats} dipendenti={dipendenti} ferie={ferie} missioni={missioni} getDipendente={getDipendente} />;
      case "anagrafica":
        return <AnagraficaPage dipendenti={dipendenti} reload={loadData} />;
      case "presenze":
        return <PresenzePage dipendenti={activeDipendenti} reload={loadData} />;
      case "ferie-permessi":
        return <FeriePage dipendenti={activeDipendenti} ferie={ferie} reload={loadData} getDipendente={getDipendente} />;
      case "turni":
        return <TurniPage dipendenti={activeDipendenti} turni={turni} reload={loadData} />;
      case "timbrature":
        return <TimbraturePage dipendenti={dipendenti} getDipendente={getDipendente} />;
      case "buste-paga":
        return <BustePagaPage dipendenti={activeDipendenti} reload={loadData} getDipendente={getDipendente} />;
      case "paghe-bonifici":
        return <PagheBonificiPage />;
      case "missioni":
        return <MissioniPage dipendenti={activeDipendenti} missioni={missioni} reload={loadData} getDipendente={getDipendente} />;
      case "documenti":
        return <DocumentiPage dipendenti={dipendenti} documenti={documenti} reload={loadData} getDipendente={getDipendente} />;
      case "assunzione":
        return <AssunzionePage dipendenti={dipendenti} reload={loadData} />;
      case "contabilita":
        return <ContabilitaDashboardPage navigate={navigate} />;
      case "da-pagare":
        return <DaPagarePage />;
      case "fatture":
        return <FatturePage />;
      case "fornitori":
        return <FornitoriPage />;
      case "bonifici-banca":
        return <BonificiContabPage />;
      case "riconciliazione":
        return <RiconciliazionePage />;
      case "calendario-pagamenti":
        return <CalendarioPagamentiPage />;
      case "documenti-fiscali":
        return <DocumentiFiscaliPage />;
      case "paypal":
        return <PayPalPage />;
      default:
        return <DashboardPage stats={stats} dipendenti={dipendenti} ferie={ferie} missioni={missioni} getDipendente={getDipendente} />;
    }
  };

  // Group menu items by section
  const sections = {};
  menuItems.forEach(item => {
    if (!sections[item.section]) sections[item.section] = [];
    sections[item.section].push(item);
  });

  return (
    <div className="dc-app">
      {/* Barra mobile con menu a tendina */}
      <div className="dc-mobile-topbar">
        <button className="dc-hamburger" onClick={() => setMobileMenuOpen(true)} aria-label="Apri menu">
          <span></span><span></span><span></span>
        </button>
        <span className="dc-mobile-title">{menuItems.find(m => m.id === currentPage)?.label || "Dipendenti"}</span>
      </div>
      {mobileMenuOpen && <div className="dc-mobile-overlay" onClick={() => setMobileMenuOpen(false)} />}
      {/* Sidebar */}
      <aside className={`dc-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="dc-sidebar-header">
          <div className="dc-sidebar-logo">
            <Users size={28} />
            <div>
              <span className="dc-logo-title">Dipendenti</span>
              <span className="dc-logo-subtitle">nella nuvola</span>
            </div>
          </div>
        </div>

        {/* Back to ERP button */}
        <Link to="/" className="dc-back-to-erp" data-testid="back-to-erp">
          <ArrowLeft size={16} />
          <span>Torna a OpenClaw ERP</span>
        </Link>

        <nav className="dc-sidebar-nav">
          {Object.entries(sections).map(([section, items]) => (
            <div key={section} className="dc-sidebar-section">
              <div className="dc-sidebar-section-title">{section}</div>
              {items.map(item => (
                <Link
                  key={item.id}
                  to={`/dipendenti/${item.id}`}
                  className={`dc-sidebar-item ${currentPage === item.id ? 'active' : ''}`}
                  data-testid={`sidebar-${item.id}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="dc-sidebar-footer">
          <div className="dc-sidebar-user">
            <div className="dc-avatar dc-avatar-sm" style={{ backgroundColor: "#10b981" }}>VC</div>
            <div className="dc-user-info">
              <span className="dc-user-name">Vincenzo C.</span>
              <span className="dc-user-role">Proprietario</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="dc-main">
        {/* Breadcrumb */}
        <div className="dc-breadcrumb">
          <span>Gestione</span>
          <ChevronRight size={14} />
          <span className="dc-breadcrumb-current">{pageLabels[currentPage] || currentPage}</span>
          <div className="dc-breadcrumb-company">Ceraldi Group SRL</div>
        </div>

        {/* Page Content */}
        <div className="dc-content">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}

// ==================== PAGES ====================

// Dashboard Page
function DashboardPage({ stats, dipendenti, ferie, missioni, getDipendente }) {
  const attivi = dipendenti.filter(d => d.stato === "attivo").length;
  const pendingFerie = ferie.filter(f => f.stato === "in_attesa");
  const pendingMissioni = missioni.filter(m => m.stato === "in_attesa");
  const [alerts, setAlerts] = useState([]);
  const [pendenze, setPendenze] = useState(null);
  const loadAlerts = () => axios.get(`${API}/alerts`).then(r => setAlerts(r.data.alerts || [])).catch(() => {});
  useEffect(() => { loadAlerts(); axios.get(`${API}/paghe/in-attesa`).then(r => setPendenze(r.data)).catch(() => {}); }, []);
  const mesiIt = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
  const risolviAlert = async (id) => {
    try { await axios.post(`${API}/alerts/${id}/risolvi`); loadAlerts(); } catch {}
  };
  const sevColor = (s) => ({ critico: "danger", alto: "danger", warning: "warning", media: "warning" }[s] || "default");

  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <h1>Pannello di Controllo</h1>
        <p>{dipendenti.length} dipendenti totali</p>
      </div>

      <div className="dc-stats-grid">
        <div className="dc-stat-card dc-stat-blue">
          <div className="dc-stat-icon"><Users size={24} /></div>
          <div className="dc-stat-content">
            <span className="dc-stat-label">DIPENDENTI</span>
            <span className="dc-stat-value">{dipendenti.length}</span>
            <span className="dc-stat-sub">{attivi} attivi</span>
          </div>
        </div>
        <div className="dc-stat-card dc-stat-green">
          <div className="dc-stat-icon"><Clock size={24} /></div>
          <div className="dc-stat-content">
            <span className="dc-stat-label">PRESENTI OGGI</span>
            <span className="dc-stat-value">{stats.presenze_oggi || 0}</span>
          </div>
        </div>
        <div className="dc-stat-card dc-stat-yellow">
          <div className="dc-stat-icon"><Calendar size={24} /></div>
          <div className="dc-stat-content">
            <span className="dc-stat-label">FERIE IN ATTESA</span>
            <span className="dc-stat-value">{pendingFerie.length}</span>
          </div>
        </div>
        <div className="dc-stat-card dc-stat-purple">
          <div className="dc-stat-icon"><MapPin size={24} /></div>
          <div className="dc-stat-content">
            <span className="dc-stat-label">MISSIONI IN ATTESA</span>
            <span className="dc-stat-value">{pendingMissioni.length}</span>
          </div>
        </div>
        <div className="dc-stat-card dc-stat-yellow">
          <div className="dc-stat-icon"><AlertTriangle size={24} /></div>
          <div className="dc-stat-content">
            <span className="dc-stat-label">AVVISI &amp; SCADENZE</span>
            <span className="dc-stat-value">{stats.alert_aperti ?? alerts.length}</span>
          </div>
        </div>
        <div className="dc-stat-card" style={{ borderLeft: "4px solid #d35f4e" }}>
          <div className="dc-stat-icon"><FileText size={24} /></div>
          <div className="dc-stat-content">
            <span className="dc-stat-label">BUSTE DA PAGARE</span>
            <span className="dc-stat-value">{stats.buste_in_attesa ?? 0}</span>
            <span className="dc-stat-sub">€ {(stats.importo_in_attesa || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} da erogare</span>
          </div>
        </div>
      </div>

      <div className="dc-card" style={{ marginBottom: 16 }}>
        <h3><AlertTriangle size={18} /> Avvisi &amp; Scadenze</h3>
        {alerts.length === 0 ? (
          <p className="dc-empty">Nessun avviso aperto</p>
        ) : (
          <div className="dc-list">
            {alerts.slice(0, 12).map((a) => (
              <div key={a.id} className="dc-list-item">
                <Badge variant={sevColor(a.severita)}>{a.severita}</Badge>
                <div className="dc-list-info" style={{ flex: 1 }}>
                  <span className="dc-list-name">{a.titolo}</span>
                  <span className="dc-list-sub">{a.dettaglio}</span>
                </div>
                <button className="dc-btn" onClick={() => risolviAlert(a.id)}>Risolvi</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {pendenze && pendenze.totale > 0 && (
        <div className="dc-card" style={{ marginBottom: 16, borderLeft: "4px solid #d35f4e" }}>
          <h3><FileText size={18} /> Buste in attesa di pagamento <span className="dc-muted" style={{ fontWeight: 400 }}>· {pendenze.totale} · € {(pendenze.importo || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></h3>
          <div style={{ overflowX: "auto" }}>
            <table className="dc-table" style={{ minWidth: 480 }}>
              <thead><tr><th>Dipendente</th><th>Periodo</th><th style={{ textAlign: "right" }}>Busta €</th><th style={{ textAlign: "right" }}>Manca €</th><th>Stato</th></tr></thead>
              <tbody>
                {pendenze.righe.slice(0, 30).map((x, i) => (
                  <tr key={i}>
                    <td>{x.dipendente}</td>
                    <td>{mesiIt[(x.mese || 1) - 1]} {x.anno}</td>
                    <td style={{ textAlign: "right" }}>{x.busta ? x.busta.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</td>
                    <td style={{ textAlign: "right", color: "#d35f4e", fontWeight: 700 }}>{x.saldo.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td><Badge variant={x.stato === "parziale" ? "warning" : "danger"}>{x.stato === "parziale" ? "parziale" : "in attesa"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="dc-muted" style={{ fontSize: 12, marginTop: 8 }}>Aggancio automatico: appena arriva il bonifico (PDF/Excel/CSV) la riga sparisce. Dettaglio in Buste Paga.</p>
        </div>
      )}

      <div className="dc-dashboard-grid">
        <div className="dc-card">
          <h3><Calendar size={18} /> Ferie/Permessi da Approvare</h3>
          {pendingFerie.length === 0 ? (
            <p className="dc-empty">Nessuna richiesta in attesa</p>
          ) : (
            <div className="dc-list">
              {pendingFerie.slice(0, 5).map((f, i) => {
                const dip = getDipendente(f.dipendente_id);
                return (
                  <div key={f.id || i} className="dc-list-item">
                    <Avatar nome={dip?.nome} cognome={dip?.cognome} size="sm" />
                    <div className="dc-list-info">
                      <span className="dc-list-name">{dip?.nome} {dip?.cognome}</span>
                      <span className="dc-list-sub">{f.tipo} - {f.giorni}gg dal {formatDate(f.data_inizio)}</span>
                    </div>
                    <Badge variant="warning">In attesa</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="dc-card">
          <h3><MapPin size={18} /> Missioni da Approvare</h3>
          {pendingMissioni.length === 0 ? (
            <p className="dc-empty">Nessuna missione in attesa</p>
          ) : (
            <div className="dc-list">
              {pendingMissioni.slice(0, 5).map((m, i) => {
                const dip = getDipendente(m.dipendente_id);
                return (
                  <div key={m.id || i} className="dc-list-item">
                    <Avatar nome={dip?.nome} cognome={dip?.cognome} size="sm" />
                    <div className="dc-list-info">
                      <span className="dc-list-name">{dip?.nome} {dip?.cognome}</span>
                      <span className="dc-list-sub">{m.destinazione} - {formatDate(m.data_inizio)}</span>
                    </div>
                    <Badge variant="warning">In attesa</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Anagrafica Page
function AnagraficaPage({ dipendenti, reload }) {
  const [showModal, setShowModal] = useState(false);
  const [editingDip, setEditingDip] = useState(null);
  const [formData, setFormData] = useState({
    nome: "", cognome: "", ruolo: "", email: "", telefono: "",
    codice_fiscale: "", contratto: "Indeterminato", iban: "", stato: "attivo"
  });
  const [filter, setFilter] = useState("tutti");
  const anagRef = useRef(null);
  const [anagBusy, setAnagBusy] = useState(false);
  const handleImportAnagrafica = async (e) => {
    const fl = (e.target.files || [])[0];
    if (!fl) return;
    setAnagBusy(true);
    try {
      const fd = new FormData(); fd.append("file", fl);
      const r = await axios.post(`${API}/dipendenti/importa-anagrafica`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      alert(`Anagrafica importata: ${r.data.creati} creati, ${r.data.aggiornati} aggiornati.`);
      reload && reload();
    } catch (err) { alert(err?.response?.data?.detail || "Errore import anagrafica"); }
    finally { setAnagBusy(false); if (anagRef.current) anagRef.current.value = ""; }
  };
  const [showRid, setShowRid] = useState(false);
  const [ridRows, setRidRows] = useState([]);
  const apriRid = () => {
    setRidRows(dipendenti.map(d => { const r = d.riduzione_orario || {}; return {
      dipendente_id: d.id, nome: `${d.cognome || ''} ${d.nome || ''}`.trim() || d.nome,
      attiva: !!r.attiva, era_attiva: !!r.attiva, ore_giorno: r.ore_giorno ?? "", paga_oraria: r.paga_oraria ?? "",
      data_inizio: r.data_inizio || "", data_fine: r.data_fine || "" }; }));
    setShowRid(true);
  };
  const setRidRow = (i, k, v) => setRidRows(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const salvaRid = async () => {
    await axios.post(`${API}/riduzioni-orario`, { voci: ridRows.map(r => ({ dipendente_id: r.dipendente_id, attiva: r.attiva, ore_giorno: r.ore_giorno, paga_oraria: r.paga_oraria, data_inizio: r.data_inizio || null, data_fine: r.data_fine || null })) });
    // Per chi viene ATTIVATO ora: genera il contratto di solidarietà → entra nell'iter firma
    const daGenerare = ridRows.filter(r => r.attiva && !r.era_attiva);
    let generati = 0; const falliti = [];
    for (const r of daGenerare) {
      try {
        await axios.post(`/api/contracts/generate/${r.dipendente_id}`, { contract_type: "riduzione_orario",
          additional_data: { ore_giorno: r.ore_giorno, stipendio_orario: r.paga_oraria, ore_settimanali: r.ore_giorno ? String(Number(r.ore_giorno) * 6) : "", data_inizio: r.data_inizio, data_fine: r.data_fine } });
        generati++;
      } catch (e) { falliti.push(r.nome + (e?.response?.status === 400 ? " (manca il modello)" : "")); }
    }
    setShowRid(false); reload && reload();
    if (daGenerare.length) {
      alert(`Riduzione salvata.\nContratti di solidarietà generati: ${generati}` +
        (falliti.length ? `\nNon generati: ${falliti.join(", ")}\n→ carica il modello "Accordo Riduzione Orario" in Assunzione → Modelli.` : `\nLi trovi in Assunzione & Contratti per firma/invio e archiviazione nel fascicolo.`));
    }
  };
  const oggiISO = new Date().toISOString().slice(0, 10);

  const filteredDipendenti = dipendenti.filter(d => {
    if (filter === "attivi") return d.stato === "attivo";
    if (filter === "inattivi") return d.stato !== "attivo";
    return true;
  });

  const openModal = (dip = null) => {
    if (dip) {
      setEditingDip(dip);
      setFormData({ ...dip });
    } else {
      setEditingDip(null);
      setFormData({
        nome: "", cognome: "", ruolo: "", email: "", telefono: "",
        codice_fiscale: "", contratto: "Indeterminato", iban: "", stato: "attivo"
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingDip) {
        await axios.put(`${API}/dipendenti/${editingDip.id}`, formData);
      } else {
        await axios.post(`${API}/dipendenti`, formData);
      }
      setShowModal(false);
      reload();
    } catch (error) {
      console.error("Error saving:", error);
      alert("Errore nel salvataggio");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Eliminare questo dipendente?")) return;
    await axios.delete(`${API}/dipendenti/${id}`);
    reload();
  };

  const handleCessa = async (dip) => {
    const nome = `${dip.cognome || ""} ${dip.nome || ""}`.trim();
    const data = window.prompt(`Cessare il rapporto con ${nome}?\nData cessazione (AAAA-MM-GG):`, new Date().toISOString().slice(0, 10));
    if (!data) return;
    try {
      const r = await axios.post(`${API}/dipendenti/${dip.id}/cessa`, { data_cessazione: data });
      const az = (r.data.automazioni || []).map(a => a.handler || a.error).filter(Boolean);
      window.alert(`Rapporto cessato.\nAutomazioni eseguite: ${az.length ? az.join(", ") : "nessuna"}.`);
      reload();
    } catch (e) { window.alert(e?.response?.data?.detail || "Errore cessazione"); }
  };

  const attivi = dipendenti.filter(d => d.stato === "attivo").length;

  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <div>
          <h1>Anagrafica Dipendenti</h1>
          <p>{dipendenti.length} dipendenti totali, {attivi} attivi</p>
        </div>
        <div className="dc-page-actions">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="dc-select">
            <option value="tutti">Tutti ({dipendenti.length})</option>
            <option value="attivi">Attivi ({attivi})</option>
            <option value="inattivi">Inattivi ({dipendenti.length - attivi})</option>
          </select>
          <input ref={anagRef} type="file" accept=".xlsx" onChange={handleImportAnagrafica} style={{ display: "none" }} />
          <button onClick={() => anagRef.current?.click()} disabled={anagBusy} className="dc-btn" title="Importa/aggiorna l'anagrafica da Excel (Cognome, Nome, CF, …)">
            {anagBusy ? "Importo…" : "📥 Importa anagrafica (Excel)"}
          </button>
          <button onClick={apriRid} className="dc-btn" title="Riduzione oraria collettiva: ore/giorno, paga oraria e scadenza sorvegliata">
            ⏱️ Riduzione orario
          </button>
          <button onClick={() => openModal()} className="dc-btn dc-btn-primary" data-testid="add-dipendente">
            <Plus size={18} /> Nuovo Dipendente
          </button>
        </div>
      </div>

      <div className="dc-card">
        <table className="dc-table dc-table--cards">
          <thead>
            <tr>
              <th>DIPENDENTE</th>
              <th>RUOLO</th>
              <th>CONTRATTO</th>
              <th>STATO</th>
              <th>AZIONI</th>
            </tr>
          </thead>
          <tbody>
            {filteredDipendenti.map((dip) => (
              <tr key={dip.id}>
                <td>
                  <div className="dc-table-user">
                    <Avatar nome={dip.nome} cognome={dip.cognome} size="sm" />
                    <div>
                      <span className="dc-table-name">{dip.nome} {dip.cognome}</span>
                      <span className="dc-table-email">{dip.email || "No email"}</span>
                    </div>
                  </div>
                </td>
                <td data-label="Ruolo">{dip.ruolo || "-"}</td>
                <td data-label="Contratto">{dip.contratto}</td>
                <td data-label="Stato"><Badge variant={dip.stato === "attivo" ? "success" : "default"}>{dip.stato}</Badge></td>
                <td data-label="Azioni" className="dc-table-actions">
                  <button onClick={() => openModal(dip)} className="dc-btn-icon"><Edit2 size={16} /></button>
                  {dip.stato === "attivo" && <button onClick={() => handleCessa(dip)} className="dc-btn-icon" title="Cessa rapporto"><LogOut size={16} /></button>}
                  <button onClick={() => handleDelete(dip.id)} className="dc-btn-icon dc-btn-danger"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="dc-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="dc-modal" onClick={e => e.stopPropagation()}>
            <div className="dc-modal-header">
              <h3>{editingDip ? "Modifica Dipendente" : "Nuovo Dipendente"}</h3>
              <button onClick={() => setShowModal(false)} className="dc-modal-close"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="dc-modal-body">
              <div className="dc-form-grid">
                <div className="dc-form-group">
                  <label>Nome *</label>
                  <input required value={formData.nome} onChange={(e) => setFormData({...formData, nome: e.target.value})} />
                </div>
                <div className="dc-form-group">
                  <label>Cognome *</label>
                  <input required value={formData.cognome} onChange={(e) => setFormData({...formData, cognome: e.target.value})} />
                </div>
                <div className="dc-form-group">
                  <label>Email</label>
                  <input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
                </div>
                <div className="dc-form-group">
                  <label>Telefono</label>
                  <input value={formData.telefono} onChange={(e) => setFormData({...formData, telefono: e.target.value})} />
                </div>
                <div className="dc-form-group">
                  <label>Ruolo</label>
                  <input value={formData.ruolo} onChange={(e) => setFormData({...formData, ruolo: e.target.value})} />
                </div>
                <div className="dc-form-group">
                  <label>Codice Fiscale</label>
                  <input value={formData.codice_fiscale} onChange={(e) => setFormData({...formData, codice_fiscale: e.target.value.toUpperCase()})} />
                </div>
                <div className="dc-form-group">
                  <label>Contratto</label>
                  <select value={formData.contratto} onChange={(e) => setFormData({...formData, contratto: e.target.value})}>
                    <option>Indeterminato</option>
                    <option>Determinato</option>
                    <option>Part-time</option>
                    <option>Apprendistato</option>
                  </select>
                </div>
                <div className="dc-form-group">
                  <label>Stato</label>
                  <select value={formData.stato} onChange={(e) => setFormData({...formData, stato: e.target.value})}>
                    <option value="attivo">Attivo</option>
                    <option value="inattivo">Inattivo</option>
                  </select>
                </div>
              </div>
              <div className="dc-modal-footer">
                <button type="button" onClick={() => setShowModal(false)} className="dc-btn">Annulla</button>
                <button type="submit" className="dc-btn dc-btn-primary">{editingDip ? "Salva" : "Crea"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRid && (
        <div onClick={() => setShowRid(false)} style={{ position: "fixed", inset: 0, background: "rgba(42,51,41,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, zIndex: 50, overflow: "auto" }}>
          <div onClick={e => e.stopPropagation()} className="dc-card" style={{ maxWidth: 880, width: "100%", marginTop: 20 }}>
            <h3 style={{ marginTop: 0 }}>⏱️ Riduzione oraria collettiva</h3>
            <p className="dc-muted" style={{ fontSize: 13, marginTop: 0 }}>Per ogni dipendente: spunta <b>Attiva</b>, imposta le <b>ore/giorno</b> ridotte, l'eventuale <b>paga oraria</b> e le date <b>dal/al</b>. <b>All'attivazione il sistema genera il contratto di solidarietà</b> che entra nell'iter firma (lo trovi in Assunzione &amp; Contratti → firma/invio → archiviazione nel fascicolo e nei documenti del dipendente). Il sistema sorveglia la <b>scadenza</b>: rossa se scaduta, arancione entro 30 giorni.</p>
            <div style={{ maxHeight: "62vh", overflow: "auto" }}>
              <table className="dc-table" style={{ minWidth: 800, whiteSpace: "nowrap" }}>
                <thead><tr><th>Dipendente</th><th>Attiva</th><th>Ore/giorno</th><th>Paga oraria €</th><th>Dal</th><th>Al (scadenza)</th><th>Stato</th></tr></thead>
                <tbody>
                  {ridRows.map((r, i) => {
                    const scaduta = r.attiva && r.data_fine && r.data_fine < oggiISO;
                    const vicina = r.attiva && r.data_fine && r.data_fine >= oggiISO && (new Date(r.data_fine) - new Date(oggiISO)) / 86400000 <= 30;
                    return (
                      <tr key={r.dipendente_id}>
                        <td>{r.nome}</td>
                        <td style={{ textAlign: "center" }}><input type="checkbox" checked={r.attiva} onChange={e => setRidRow(i, "attiva", e.target.checked)} /></td>
                        <td><input className="dc-input" style={{ width: 70 }} type="number" min="0" max="24" step="0.5" value={r.ore_giorno} onChange={e => setRidRow(i, "ore_giorno", e.target.value)} /></td>
                        <td><input className="dc-input" style={{ width: 84 }} type="number" min="0" step="0.01" value={r.paga_oraria} onChange={e => setRidRow(i, "paga_oraria", e.target.value)} /></td>
                        <td><input className="dc-input" type="date" value={r.data_inizio} onChange={e => setRidRow(i, "data_inizio", e.target.value)} /></td>
                        <td><input className="dc-input" type="date" value={r.data_fine} onChange={e => setRidRow(i, "data_fine", e.target.value)} /></td>
                        <td>{!r.attiva ? <span className="dc-muted">—</span> : scaduta ? <Badge variant="danger">scaduta</Badge> : vicina ? <Badge variant="warning">in scadenza</Badge> : <Badge variant="success">attiva</Badge>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button className="dc-btn" onClick={() => setShowRid(false)}>Chiudi</button>
              <button className="dc-btn-primary" onClick={salvaRid}>Salva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Presenze Page - Calendario Mensile
function PresenzePage({ dipendenti, reload }) {
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [mese, setMese] = useState(new Date().getMonth() + 1);
  const [presenze, setPresenze] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    dipendente_id: "", tipo: "P", data_inizio: "", data_fine: "", nota: ""
  });
  const [penna, setPenna] = useState(null);
  const [tuttiMode, setTuttiMode] = useState(false);
  const [ferieList, setFerieList] = useState([]);
  const [turniMese, setTurniMese] = useState([]);
  const [tipiTurno, setTipiTurno] = useState([]);

  const mesi = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  const daysInMonth = new Date(anno, mese, 0).getDate();
  const firstDayOfWeek = new Date(anno, mese - 1, 1).getDay();

  const loadPresenze = async () => {
    try {
      const res = await axios.get(`${API}/presenze?anno=${anno}&mese=${mese}`);
      setPresenze(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { loadPresenze(); }, [anno, mese]);

  // Carica ferie, tipi turno e i turni delle settimane che toccano il mese (per derivare le presenze)
  useEffect(() => {
    axios.get(`${API}/ferie`).then(r => setFerieList(r.data || [])).catch(() => {});
    axios.get(`${API}/turni`).then(r => setTipiTurno(r.data || [])).catch(() => {});
    const isoD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const lunSet = new Set();
    for (let g = 1; g <= daysInMonth; g++) {
      const dt = new Date(anno, mese - 1, g); const off = (dt.getDay() + 6) % 7;
      const lun = new Date(dt); lun.setDate(dt.getDate() - off); lunSet.add(isoD(lun));
    }
    Promise.all([...lunSet].map(s => axios.get(`${API}/assegnazioni-turni?settimana=${s}`).then(r => r.data || []).catch(() => [])))
      .then(arrs => setTurniMese(arrs.flat()));
  }, [anno, mese]);

  const isoD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const NOMI_G = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  const lunISOdi = (date) => { const off = (date.getDay() + 6) % 7; const l = new Date(date); l.setDate(date.getDate() - off); return isoD(l); };
  const ferieDi = (dipId, dateStr) => ferieList.find(f => f.dipendente_id === dipId && f.data_inizio <= dateStr && (f.data_fine || f.data_inizio) >= dateStr);
  const turnoDi = (dipId, date) => turniMese.find(a => a.dipendente_id === dipId && a.settimana === lunISOdi(date) && a.giorno === NOMI_G[date.getDay()]);
  const nomeTurnoId = (id) => (tipiTurno.find(t => t.id === id) || {}).nome;

  // Codice giustificativo derivato per una cella: presenza salvata > ferie/permesso > turno.
  // Regola: NON si può essere "presenti" in un giorno futuro (oggi compreso = ok).
  const codiceDerivato = (dipId, day) => {
    const date = new Date(anno, mese - 1, day);
    const dStr = isoD(date);
    const futuro = dStr > isoD(new Date());
    const pres = getPresenza(dipId, day);
    if (pres) {
      const g = pres.giustificativo;
      if (g === 'P' || (!g && pres.stato === 'presente')) return futuro ? null : 'P';
      if (g) return g;
      if (pres.stato === 'assente') return 'AS';
      return null;
    }
    const fer = ferieDi(dipId, dStr);
    if (fer) return fer.tipo === 'Permesso' ? 'PE' : fer.tipo === 'Malattia' ? 'M' : fer.tipo === 'ROL' ? 'R' : 'F';
    const t = turnoDi(dipId, date);
    if (t) { const n = nomeTurnoId(t.turno_id); if (n === 'Riposo') return 'RS'; if (n === 'Ferie') return 'F'; return (n && !futuro) ? 'P' : null; }
    return null;
  };

  const getPresenza = (dipId, day) => {
    const dataStr = `${anno}-${String(mese).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return presenze.find(p => p.dipendente_id === dipId && p.data === dataStr);
  };

  // Riposi attesi nel mese = numero di domeniche (≈ una settimana di riposo a testa per settimana).
  const domenicheMese = (() => { let n = 0; for (let d = 1; d <= daysInMonth; d++) if (new Date(anno, mese - 1, d).getDay() === 0) n++; return n; })();
  // Conta solo i giorni di Riposo settimanale (RS): ferie e permessi NON contano.
  const contaRiposi = (dipId) => { let n = 0; for (let d = 1; d <= daysInMonth; d++) if (codiceDerivato(dipId, d) === 'RS') n++; return n; };

  // Pennello: applica il giustificativo selezionato a uno o tutti i dipendenti, in qualsiasi giorno.
  const applica = async (dipIds, day) => {
    if (!penna) return;
    const data = `${anno}-${String(mese).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const stato = penna === 'P' ? 'presente' : penna === 'AS' ? 'assente' : 'giustificato';
    const batch = dipIds.map(id => ({ dipendente_id: id, data, stato, giustificativo: penna }));
    try { await axios.post(`${API}/presenze/batch`, batch); await loadPresenze(); } catch (e) { console.error(e); }
  };

  const handleTuttiPresenti = async () => {
    if (!window.confirm("Segnare tutti come presenti per oggi?")) return;
    const oggi = isoD(new Date());  // data LOCALE (non UTC: evita l'errore di un giorno)
    const batch = dipendenti.map(d => ({
      dipendente_id: d.id,
      data: oggi,
      stato: "presente",
      entrata: "09:00",
      uscita: "18:00"
    }));
    await axios.post(`${API}/presenze/batch`, batch);
    loadPresenze();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Create presenze for date range
    const start = new Date(formData.data_inizio);
    const end = new Date(formData.data_fine);
    const batch = [];
    
    for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
      batch.push({
        dipendente_id: formData.dipendente_id,
        data: isoD(d),  // data LOCALE (non UTC)
        stato: formData.tipo === 'P' ? 'presente' : formData.tipo === 'UN' ? 'assente' : 'giustificato',
        giustificativo: formData.tipo,
        note: formData.nota
      });
    }
    
    await axios.post(`${API}/presenze/batch`, batch);
    setShowModal(false);
    loadPresenze();
  };

  const tipiGiustificativo = [
    { code: "P", label: "Presente", color: "#10b981" },
    { code: "AS", label: "Assente", color: "#ef4444" },
    { code: "F", label: "Ferie", color: "#3b82f6" },
    { code: "PE", label: "Permesso", color: "#8b5cf6" },
    { code: "M", label: "Malattia", color: "#f59e0b" },
    { code: "R", label: "ROL", color: "#06b6d4" },
    { code: "CH", label: "Chiuso", color: "#6b7280" },
    { code: "RS", label: "Riposo Sett.", color: "#9ca3af" },
    { code: "X", label: "Cessato", color: "#374151" },
    { code: "FNL", label: "Festività Non Lav.", color: "#a855f7" },
  ];

  // Calcola statistiche
  const totalePresenti = presenze.filter(p => p.stato === 'presente').length;
  const totaleAssenti = presenze.filter(p => p.stato === 'assente').length;

  const prevMonth = () => {
    if (mese === 1) { setMese(12); setAnno(anno - 1); }
    else setMese(mese - 1);
  };
  const nextMonth = () => {
    if (mese === 12) { setMese(1); setAnno(anno + 1); }
    else setMese(mese + 1);
  };

  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <div>
          <h1>Presenze Mensili</h1>
          <p>{dipendenti.length} dipendenti attivi</p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="dc-presenze-stats">
        <div className="dc-presenze-stat">
          <span className="dc-presenze-stat-label">PRESENTI</span>
          <span className="dc-presenze-stat-value dc-text-green">{totalePresenti}</span>
        </div>
        <div className="dc-presenze-stat">
          <span className="dc-presenze-stat-label">ASSENTI</span>
          <span className="dc-presenze-stat-value dc-text-red">{totaleAssenti}</span>
        </div>
        <div className="dc-presenze-stat">
          <span className="dc-presenze-stat-label">ROL</span>
          <span className="dc-presenze-stat-value dc-text-red">0</span>
        </div>
        <div className="dc-presenze-stat">
          <span className="dc-presenze-stat-label">ALTRI</span>
          <span className="dc-presenze-stat-value">0</span>
        </div>

        {/* Month Navigation */}
        <div className="dc-month-nav">
          <button onClick={prevMonth} className="dc-btn-icon"><ChevronLeft size={20} /></button>
          <span className="dc-month-label">{mesi[mese - 1]} {anno}</span>
          <button onClick={nextMonth} className="dc-btn-icon"><ChevronRight size={20} /></button>
        </div>

        {/* Action Buttons */}
        <button onClick={handleTuttiPresenti} className="dc-btn dc-btn-success">
          <Check size={16} /> Tutti Presenti
        </button>
        <button onClick={() => setShowModal(true)} className="dc-btn dc-btn-primary">
          <Plus size={16} /> Giustificativo
        </button>
      </div>

      {/* Barra pennello */}
      <div className="dc-card" style={{ marginBottom: 12, padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "#6b7669", marginRight: 4 }}>Pennello:</span>
          {tipiGiustificativo.map(t => (
            <button key={t.code} type="button" onClick={() => setPenna(t.code)} title={t.label}
              style={{ border: penna === t.code ? "3px solid #5b7a6b" : "1px solid #e5e7eb", background: penna === t.code ? t.color : "#fff", color: penna === t.code ? "#fff" : "#374151", borderRadius: 8, padding: "6px 10px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
              {t.code} <span style={{ fontWeight: 400, fontSize: 11 }}>{t.label}</span>
            </button>
          ))}
          <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={tuttiMode} onChange={e => setTuttiMode(e.target.checked)} />
            Applica a tutti i dipendenti
          </label>
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
          Seleziona un tipo: nel mese si <b>evidenziano</b> tutte le sue caselle. Poi clicca una cella dipendente/giorno per <b>applicarlo</b> (anche su giorni passati), o il <b>numero del giorno</b> in cima per applicarlo a tutti.
        </div>
      </div>

      {/* Attendance Grid */}
      <div className="dc-card dc-presenze-grid-container">
        <table className="dc-presenze-table">
          <thead>
            <tr>
              <th className="dc-presenze-th-name">Dipendente</th>
              {Array.from({length: daysInMonth}, (_, i) => {
                const date = new Date(anno, mese - 1, i + 1);
                const dayNames = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                return (
                  <th key={i} className={`dc-presenze-th-day ${isWeekend ? 'weekend' : ''}`} onClick={() => applica(dipendenti.map(d => d.id), i + 1)} style={{ cursor: "pointer" }} title="Applica a tutti per questo giorno">
                    <span className="dc-day-name">{dayNames[date.getDay()]}</span>
                    <span className="dc-day-num">{i + 1}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {dipendenti.map((dip) => (
              <tr key={dip.id}>
                <td className="dc-presenze-td-name">
                  <div className="dc-table-user">
                    <Avatar nome={dip.nome} cognome={dip.cognome} size="sm" />
                    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                      <span>{dip.cognome ? `${dip.cognome} ${dip.nome?.[0] || ''}.` : dip.nome}</span>
                      {(() => { const r = contaRiposi(dip.id); const ok = r >= domenicheMese; return (
                        <span style={{ fontSize: 10, fontWeight: 700, color: ok ? "#3d8168" : "#d35f4e" }} title="Riposi del mese rispetto agli attesi">
                          {ok ? "✓" : "⚠"} {r}/{domenicheMese} riposi
                        </span>); })()}
                    </div>
                  </div>
                </td>
                {Array.from({length: daysInMonth}, (_, i) => {
                  const day = i + 1;
                  const date = new Date(anno, mese - 1, day);
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  const salvata = getPresenza(dip.id, day);
                  const code = codiceDerivato(dip.id, day);
                  const tipo = tipiGiustificativo.find(t => t.code === code);
                  const dimmed = penna && code !== penna;
                  return (
                    <td key={i} className={`dc-presenze-td-day ${isWeekend ? 'weekend' : ''}`} onClick={() => applica(tuttiMode ? dipendenti.map(d => d.id) : [dip.id], day)} style={{ cursor: "pointer" }}>
                      {code ? (
                        <span className="dc-presenza-badge" style={{ backgroundColor: tipo?.color || '#10b981', opacity: dimmed ? 0.12 : (salvata ? 1 : 0.55) }}>
                          {code}
                        </span>
                      ) : (
                        <span className="dc-presenza-empty">-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Nuovo Giustificativo */}
      {showModal && (
        <div className="dc-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="dc-modal dc-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="dc-modal-header">
              <h3>Nuovo Giustificativo</h3>
              <button onClick={() => setShowModal(false)} className="dc-modal-close"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="dc-modal-body">
              <div className="dc-form-group">
                <label>Dipendente *</label>
                <select required value={formData.dipendente_id} onChange={e => setFormData({...formData, dipendente_id: e.target.value})}>
                  <option value="">Seleziona dipendente...</option>
                  {dipendenti.map(d => (
                    <option key={d.id} value={d.id}>{d.cognome} {d.nome}</option>
                  ))}
                </select>
              </div>
              
              <div className="dc-form-group">
                <label>Tipo Giustificativo *</label>
                <div className="dc-giustificativo-grid">
                  {tipiGiustificativo.map(t => (
                    <button
                      type="button"
                      key={t.code}
                      onClick={() => setFormData({...formData, tipo: t.code})}
                      className={`dc-giustificativo-btn ${formData.tipo === t.code ? 'active' : ''}`}
                      style={{ borderColor: formData.tipo === t.code ? t.color : '#e5e7eb', backgroundColor: formData.tipo === t.code ? t.color : 'white', color: formData.tipo === t.code ? 'white' : '#374151' }}
                    >
                      <span className="dc-giust-code">{t.code}</span>
                      <span className="dc-giust-label">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="dc-form-row">
                <div className="dc-form-group">
                  <label>Data di inizio *</label>
                  <input type="date" required value={formData.data_inizio} onChange={e => setFormData({...formData, data_inizio: e.target.value})} />
                </div>
                <div className="dc-form-group">
                  <label>Data Fine *</label>
                  <input type="date" required value={formData.data_fine} onChange={e => setFormData({...formData, data_fine: e.target.value})} />
                </div>
              </div>

              <div className="dc-form-group">
                <label>Nota (facoltativa)</label>
                <textarea value={formData.nota} onChange={e => setFormData({...formData, nota: e.target.value})} placeholder="Es: Certificato medico n. 12345" />
              </div>

              <div className="dc-modal-footer">
                <button type="button" onClick={() => setShowModal(false)} className="dc-btn">Annulla</button>
                <button type="submit" className="dc-btn dc-btn-primary">Salva Giustificativo</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Ferie Page
function FeriePage({ dipendenti, ferie, reload, getDipendente }) {
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    dipendente_id: "", tipo: "Ferie", data_inizio: "", data_fine: "", giorni: 1, nota: ""
  });
  const [mese, setMese] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  const TIPI = [
    { tipo: "Ferie", code: "F", color: "#3b82f6" },
    { tipo: "Permesso", code: "PE", color: "#8b5cf6" },
  ];
  const ymd = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const giorniMese = new Date(mese.getFullYear(), mese.getMonth() + 1, 0).getDate();
  const meseLabel = mese.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const assenzaDi = (dipId, dateStr) => ferie.find(f =>
    f.dipendente_id === dipId && f.data_inizio <= dateStr && (f.data_fine || f.data_inizio) >= dateStr);

  const ciclaCella = async (dipId, dateStr) => {
    const att = assenzaDi(dipId, dateStr);
    const next = !att ? "Ferie" : att.tipo === "Ferie" ? "Permesso" : null;
    await axios.post(`${API}/ferie-giorno`, { dipendente_id: dipId, data: dateStr, tipo: next });
    reload();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await axios.post(`${API}/ferie`, formData);
    setShowModal(false);
    reload();
  };

  const handleApprova = async (id) => {
    await axios.put(`${API}/ferie/${id}/approva`);
    reload();
  };

  const handleRifiuta = async (id) => {
    await axios.put(`${API}/ferie/${id}/rifiuta`);
    reload();
  };

  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <div>
          <h1>Ferie & Permessi</h1>
          <p>Gestione richieste ferie e permessi</p>
        </div>
        <button onClick={() => setShowModal(true)} className="dc-btn dc-btn-primary">
          <Plus size={18} /> Nuova Richiesta
        </button>
      </div>

      <div className="dc-card dc-scroll-x" style={{ overflowX: "auto", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <button onClick={() => setMese(new Date(mese.getFullYear(), mese.getMonth() - 1, 1))} className="dc-btn">‹</button>
          <strong style={{ textTransform: "capitalize", minWidth: 150, textAlign: "center" }}>{meseLabel}</strong>
          <button onClick={() => setMese(new Date(mese.getFullYear(), mese.getMonth() + 1, 1))} className="dc-btn">›</button>
          <span style={{ marginLeft: 12, fontSize: 13, color: "#6b7669" }}>
            Clicca una cella: vuoto → <b style={{ color: "#3b82f6" }}>Ferie</b> → <b style={{ color: "#8b5cf6" }}>Permesso</b> → vuoto
          </span>
        </div>
        <table className="dc-table" style={{ fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", left: 0, background: "#fff", minWidth: 130, zIndex: 1 }}>DIPENDENTE</th>
              {Array.from({ length: giorniMese }, (_, i) => i + 1).map(d => {
                const dow = new Date(mese.getFullYear(), mese.getMonth(), d).getDay();
                const we = dow === 0 || dow === 6;
                return <th key={d} style={{ padding: "4px 3px", textAlign: "center", background: we ? "#f1f5f9" : undefined, color: we ? "#94a3b8" : undefined }}>{d}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {dipendenti.map(dip => (
              <tr key={dip.id}>
                <td style={{ position: "sticky", left: 0, background: "#fff", whiteSpace: "nowrap" }}>{dip.cognome} {dip.nome?.[0]}.</td>
                {Array.from({ length: giorniMese }, (_, i) => i + 1).map(d => {
                  const dateStr = ymd(mese.getFullYear(), mese.getMonth(), d);
                  const att = assenzaDi(dip.id, dateStr);
                  const meta = att ? TIPI.find(t => t.tipo === att.tipo) : null;
                  return (
                    <td key={d} onClick={() => ciclaCella(dip.id, dateStr)} title={att ? att.tipo : ""}
                      style={{ cursor: "pointer", textAlign: "center", padding: "5px 3px", border: "1px solid #f1f5f9",
                        background: meta ? meta.color : "transparent", color: meta ? "#fff" : "#cbd5e1", fontWeight: 600 }}>
                      {meta ? meta.code : "·"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="dc-card">
        <table className="dc-table dc-table--cards">
          <thead>
            <tr>
              <th>DIPENDENTE</th>
              <th>TIPO</th>
              <th>PERIODO</th>
              <th>GIORNI</th>
              <th>STATO</th>
              <th>AZIONI</th>
            </tr>
          </thead>
          <tbody>
            {ferie.map((f) => {
              const dip = getDipendente(f.dipendente_id);
              return (
                <tr key={f.id}>
                  <td>
                    <div className="dc-table-user">
                      <Avatar nome={dip?.nome} cognome={dip?.cognome} size="sm" />
                      <span>{dip?.nome} {dip?.cognome}</span>
                    </div>
                  </td>
                  <td data-label="Tipo">{f.tipo}</td>
                  <td data-label="Periodo">{formatDate(f.data_inizio)} - {formatDate(f.data_fine)}</td>
                  <td data-label="Giorni">{f.giorni}</td>
                  <td data-label="Stato"><Badge variant={f.stato === 'approvata' ? 'success' : f.stato === 'rifiutata' ? 'danger' : 'warning'}>{f.stato}</Badge></td>
                  <td data-label="Azioni" className="dc-table-actions">
                    {f.stato === 'in_attesa' && (
                      <>
                        <button onClick={() => handleApprova(f.id)} className="dc-btn-icon dc-btn-success"><Check size={16} /></button>
                        <button onClick={() => handleRifiuta(f.id)} className="dc-btn-icon dc-btn-danger"><X size={16} /></button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="dc-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="dc-modal" onClick={e => e.stopPropagation()}>
            <div className="dc-modal-header">
              <h3>Nuova Richiesta Ferie/Permesso</h3>
              <button onClick={() => setShowModal(false)} className="dc-modal-close"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="dc-modal-body">
              <div className="dc-form-group">
                <label>Dipendente *</label>
                <select required value={formData.dipendente_id} onChange={e => setFormData({...formData, dipendente_id: e.target.value})}>
                  <option value="">Seleziona...</option>
                  {dipendenti.map(d => <option key={d.id} value={d.id}>{d.nome} {d.cognome}</option>)}
                </select>
              </div>
              <div className="dc-form-group">
                <label>Tipo</label>
                <select value={formData.tipo} onChange={e => setFormData({...formData, tipo: e.target.value})}>
                  <option>Ferie</option>
                  <option>Permesso</option>
                  <option>ROL</option>
                  <option>Malattia</option>
                </select>
              </div>
              <div className="dc-form-row">
                <div className="dc-form-group">
                  <label>Data Inizio</label>
                  <input type="date" required value={formData.data_inizio} onChange={e => setFormData({...formData, data_inizio: e.target.value})} />
                </div>
                <div className="dc-form-group">
                  <label>Data Fine</label>
                  <input type="date" required value={formData.data_fine} onChange={e => setFormData({...formData, data_fine: e.target.value})} />
                </div>
              </div>
              <div className="dc-form-group">
                <label>Giorni</label>
                <input type="number" min="1" value={formData.giorni} onChange={e => setFormData({...formData, giorni: +e.target.value})} />
              </div>
              <div className="dc-modal-footer">
                <button type="button" onClick={() => setShowModal(false)} className="dc-btn">Annulla</button>
                <button type="submit" className="dc-btn dc-btn-primary">Crea Richiesta</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Turni Page
function TurniPage({ dipendenti, turni, reload }) {
  const [assegnazioni, setAssegnazioni] = useState([]);
  const [busy, setBusy] = useState(false);
  const [evid, setEvid] = useState(null);
  const [showSost, setShowSost] = useState(false);
  const [sost, setSost] = useState({ assente: "", giorno: "", motivo: "malattia", sostituto: "", turnoSost: "" });
  const tbodyRef = useRef(null);
  const giorni = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
  const lunOggi = (() => { const o = new Date(); const off = (o.getDay() + 6) % 7; const m = new Date(o); m.setDate(o.getDate() - off); m.setHours(0, 0, 0, 0); return m; })();
  const [lunedi, setLunedi] = useState(lunOggi);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const settimana = iso(lunedi);
  const dataDi = (i) => { const d = new Date(lunedi); d.setDate(lunedi.getDate() + i); return d.getDate(); };
  const meseLabel = (() => { const f = new Date(lunedi); const l = new Date(lunedi); l.setDate(l.getDate() + 6); return `${f.getDate()} ${f.toLocaleDateString('it-IT', { month: 'short' })} – ${l.getDate()} ${l.toLocaleDateString('it-IT', { month: 'short' })}`; })();
  const BASE_BAR = new Date(2026, 5, 15);
  const settimanaPari = ((Math.round((lunedi - BASE_BAR) / (7 * 86400000)) % 2) + 2) % 2 === 0;
  const [barChiusoDomPom, setBarChiusoDomPom] = useState(true);
  const [periodoInizio, setPeriodoInizio] = useState("2026-06-01");
  const [periodoFine, setPeriodoFine] = useState("2026-08-31");
  useEffect(() => { axios.get(`${API}/impostazioni-turni`).then(r => {
    setBarChiusoDomPom(r.data?.bar_chiuso_domenica_pomeriggio !== false);
    if (r.data?.periodo_inizio) setPeriodoInizio(r.data.periodo_inizio);
    if (r.data?.periodo_fine) setPeriodoFine(r.data.periodo_fine);
  }).catch(() => {}); }, []);
  const salvaImpostazione = (patch) => {
    const next = { bar_chiuso_domenica_pomeriggio: barChiusoDomPom, periodo_inizio: periodoInizio, periodo_fine: periodoFine, ...patch };
    setBarChiusoDomPom(next.bar_chiuso_domenica_pomeriggio);
    setPeriodoInizio(next.periodo_inizio); setPeriodoFine(next.periodo_fine);
    axios.post(`${API}/impostazioni-turni`, next).catch(() => {});
  };

  const caricaSettimana = (s) => axios.get(`${API}/assegnazioni-turni?settimana=${s}`).then(res => setAssegnazioni(res.data || [])).catch(() => {});
  useEffect(() => { caricaSettimana(settimana); }, [settimana]);
  useEffect(() => {
    if (!tbodyRef.current) return;
    const s = Sortable.create(tbodyRef.current, {
      handle: ".dc-drag-handle", animation: 150,
      onEnd: () => {
        const ids = Array.from(tbodyRef.current.children).map(tr => tr.getAttribute("data-id")).filter(Boolean);
        axios.post(`${API}/ordine-dipendenti`, { ordine: ids }).then(() => reload && reload());
      },
    });
    return () => s.destroy();
  }, []);

  const getAssegnazione = (dipId, giorno) => assegnazioni.find(a => a.dipendente_id === dipId && a.giorno === giorno);
  const getTurno = (turnoId) => turni.find(t => t.id === turnoId);
  const idTurno = (nome) => (turni.find(t => t.nome === nome) || {}).id;
  const nomeTurno = (id) => (turni.find(t => t.id === id) || {}).nome;

  // Squadra produzione (per nome di battesimo): su questi agisce il motore.
  const TEAM = ["luigi", "angela", "giuliano", "liliana", "carmine", "mario"];
  const isTeam = (dip) => TEAM.includes((dip.nome || "").trim().toLowerCase());
  const UNICI = ["Lunga", "Riposo"]; // un solo turno di questo tipo per giorno
  // Dipendenti da NON mostrare nei turni (richiesta titolare)
  const NASCOSTI = [["antonella","ceraldi"],["marina","liuzza"],["vincenzo","ceraldi"],["valerio","ceraldi"]];
  const isNascosto = (d) => { const f = `${d.nome||""} ${d.cognome||""}`.toLowerCase(); return NASCOSTI.some(([a,b]) => f.includes(a) && f.includes(b)); };
  // Sempre presente tutti i giorni (amministratrice)
  const isSemprePresente = (d) => { const f = `${d.nome||""} ${d.cognome||""}`.toLowerCase(); return f.includes("antonietta") && f.includes("ceraldi"); };
  const dipTurni = dipendenti.filter(d => !isNascosto(d));

  const salva = async (updates) => {
    setBusy(true);
    try {
      for (const u of updates) await axios.post(`${API}/assegnazioni-turni`, { ...u, settimana });
      await caricaSettimana(settimana);
    } finally { setBusy(false); }
  };

  // Onomastici (gestiti nel modale unico "Configura turni"); qui solo il riepilogo settimanale.
  const [onomSett, setOnomSett] = useState([]);
  useEffect(() => { axios.get(`${API}/onomastici/settimana?settimana=${settimana}`).then(r => setOnomSett(r.data || [])).catch(() => setOnomSett([])); }, [settimana]);
  const mettiRiposoOnom = async (o) => {
    const idR = idTurno("Riposo");
    if (!idR) { alert("Manca il turno 'Riposo' tra i tipi di turno."); return; }
    await salva([{ dipendente_id: o.dipendente_id, giorno: o.giorno_nome, turno_id: idR, motivo: "onomastico" }]);
  };
  // Precompilazione automatica: nel giorno dell'onomastico → Riposo (se la cella è
  // libera; un'assegnazione manuale dell'admin ha la precedenza = copertura).
  useEffect(() => {
    if (!onomSett.length) return;
    const idR = idTurno("Riposo");
    if (!idR) return;
    const mancanti = onomSett.filter(o => !assegnazioni.some(a => a.dipendente_id === o.dipendente_id && a.giorno === o.giorno_nome));
    if (!mancanti.length) return;
    (async () => {
      for (const o of mancanti) await axios.post(`${API}/assegnazioni-turni`, { dipendente_id: o.dipendente_id, giorno: o.giorno_nome, turno_id: idR, settimana, motivo: "onomastico" });
      caricaSettimana(settimana);
    })();
  }, [onomSett, assegnazioni, turni, settimana]);

  // Config turni per dipendente (turno abituale + giorno di riposo fisso) + ferie
  const [turniCfg, setTurniCfg] = useState([]);     // [{dipendente_id, turno_id, riposo_giorno}]
  const [ferieTurni, setFerieTurni] = useState([]); // ferie/permessi per overlay
  const [showCfg, setShowCfg] = useState(false);
  const [cfgRows, setCfgRows] = useState([]);
  const isoT = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const caricaCfg = () => axios.get(`${API}/turni-config`).then(r => setTurniCfg(r.data || [])).catch(() => {});
  useEffect(() => { caricaCfg(); axios.get(`${API}/ferie`).then(r => setFerieTurni(r.data || [])).catch(() => {}); }, []);
  const cfgDi = (dipId) => turniCfg.find(c => c.dipendente_id === dipId) || {};
  const ferieDataT = (dipId, dStr) => ferieTurni.find(f => f.dipendente_id === dipId
    && (f.stato === 'approvata' || !f.stato)
    && f.data_inizio <= dStr && (f.data_fine || f.data_inizio) >= dStr);
  const LUNGA_GIORNI = ["Venerdì", "Sabato", "Domenica"];  // giorni in cui si può fissare la Lunga
  const apriCfg = async () => {
    let onom = [];
    try { onom = (await axios.get(`${API}/onomastici`)).data || []; } catch {}
    const om = {}; onom.forEach(o => { om[o.dipendente_id] = o; });
    setCfgRows(dipTurni.map(d => { const c = cfgDi(d.id); const o = om[d.id] || {}; const lg = c.lunga_giorni || []; return {
      dipendente_id: d.id, nome: `${d.cognome || ''} ${d.nome || ''}`.trim() || d.nome,
      turno_id: c.turno_id || '', riposo_giorno: c.riposo_giorno || '', rotazione: c.rotazione || '', sala: !!c.sala,
      lunga1: lg[0] || '', lunga2: lg[1] || '', doppia: lg.length > 1,
      onom_mese: o.mese ?? '', onom_giorno: o.giorno ?? '', onom_attivo: o.attivo ?? false, straniero: o.straniero || false }; }));
    setShowCfg(true);
  };
  const setCfgRow = (i, k, v) => setCfgRows(rows => rows.map((r, j) => {
    if (j !== i) return r;
    const nr = { ...r, [k]: v };
    if (k === "doppia" && !v) nr.lunga2 = "";   // tolgo il 2° giorno se disattivo la doppia
    return nr;
  }));
  // Da lunga1/lunga2/doppia costruisco l'array lunga_giorni (1 di default, 2 solo se doppia spuntata)
  const lungaGiorniDi = (r) => {
    const out = [];
    if (r.lunga1) out.push(r.lunga1);
    if (r.doppia && r.lunga2 && r.lunga2 !== r.lunga1) out.push(r.lunga2);
    return out;
  };
  const salvaCfg = async () => {
    await axios.post(`${API}/turni-config`, { voci: cfgRows.map(r => ({ dipendente_id: r.dipendente_id, turno_id: r.turno_id || null, riposo_giorno: r.riposo_giorno || null, lunga_giorni: lungaGiorniDi(r), rotazione: r.rotazione || null, sala: !!r.sala })) });
    await axios.post(`${API}/onomastici`, { voci: cfgRows.map(r => ({ dipendente_id: r.dipendente_id, mese: r.onom_mese ? Number(r.onom_mese) : null, giorno: r.onom_giorno ? Number(r.onom_giorno) : null, attivo: r.onom_attivo })) });
    await caricaCfg();
    axios.get(`${API}/onomastici/settimana?settimana=${settimana}`).then(r => setOnomSett(r.data || []));
    setShowCfg(false);
  };

  // Riequilibrio automatico: se assegno una Lunga o un Riposo a una persona della
  // produzione, chi aveva quel turno quel giorno si scambia il turno con lei,
  // così il giorno resta sempre con una sola lunga e un solo riposo.
  const handleAssegna = async (dip, giorno, nuovoId) => {
    const updates = [{ dipendente_id: dip.id, giorno, turno_id: nuovoId || null }];
    const nuovoNome = nomeTurno(nuovoId);
    if (isTeam(dip) && UNICI.includes(nuovoNome)) {
      const vecchioId = (getAssegnazione(dip.id, giorno) || {}).turno_id || null;
      const altro = dipendenti.find(d =>
        d.id !== dip.id && isTeam(d) && (getAssegnazione(d.id, giorno) || {}).turno_id === nuovoId);
      if (altro) updates.push({ dipendente_id: altro.id, giorno, turno_id: vecchioId });
    }
    await salva(updates);
  };

  // Genera la settimana della squadra produzione secondo le regole.
  // Genera la settimana dai DATI: per ogni dipendente configurato usa il suo turno
  // abituale, mette Riposo nel giorno di riposo fisso e nell'onomastico, e mette
  // Ferie nei giorni di ferie/permesso approvati. Niente più nomi cablati.
  const generaProduzione = async () => {
    const idRiposo = idTurno("Riposo");
    const idFerie = idTurno("Ferie");
    const updates = [];
    const idLunga = idTurno("Lunga");
    // Rotazione bar: una settimana mattina, una pomeriggio. settimanaPari decide la fase.
    const idBarMattina = idTurno("Bar 6:30-15"), idBarPom = idTurno("Bar 15-21");
    // Ricarica le ferie fresche: una ferie appena approvata viene subito considerata.
    let ferieFresh = ferieTurni;
    try { ferieFresh = (await axios.get(`${API}/ferie`)).data || []; setFerieTurni(ferieFresh); } catch { /* uso lo stato attuale */ }
    const ferieIn = (dipId, dStr) => ferieFresh.find(f => f.dipendente_id === dipId
      && (f.stato === 'approvata' || !f.stato)
      && (((f.data_inizio || f.data) <= dStr && (f.data_fine || f.data_inizio || f.data) >= dStr)));
    // Turni "sala" per la rotazione camerieri
    const idSalaMatt = idTurno("Mattina 8-16") || idTurno("Mattina 7-15");
    const idSalaPom = idTurno("Pomeriggio");
    // Camerieri in rotazione bilanciata: 2 Lunga, 2 Mattina, 2 Pomeriggio, 1 Riposo.
    // Riposo nei giorni feriali (Lun-Gio) → ven/sab/dom restano pieni (più copertura weekend).
    const camerieri = dipTurni.filter(d => cfgDi(d.id).sala).map(d => d.id);
    const FERIALI_RIPOSO = [0, 1, 2, 3]; // Lun,Mar,Mer,Gio
    let tocco = 0;
    dipTurni.forEach(dip => {
      const c = cfgDi(dip.id);

      // ===== CAMERIERE (rotazione sala) =====
      if (c.sala) {
        const k = Math.max(0, camerieri.indexOf(dip.id));
        // giorno di riposo: quello fisso se feriale, altrimenti distribuito Lun-Gio per coprire il weekend
        let riposoIdx = c.riposo_giorno ? giorni.indexOf(c.riposo_giorno) : -1;
        if (riposoIdx < 0 || riposoIdx > 4) riposoIdx = FERIALI_RIPOSO[k % 4];
        // sequenza interlacciata (2 Lunga, 2 Mattina, 2 Pomeriggio) ruotata per persona → fasce sfalsate
        const base = [idTurno("Lunga"), idSalaMatt, idSalaPom, idTurno("Lunga"), idSalaMatt, idSalaPom];
        const off = k % 6;
        const seq = base.slice(off).concat(base.slice(0, off));
        let si = 0;
        for (let gi = 0; gi < 7; gi++) {
          const date = new Date(lunedi); date.setDate(lunedi.getDate() + gi);
          const dStr = isoT(date); const giorno = giorni[gi];
          let target;
          if (ferieIn(dip.id, dStr)) target = idFerie || idRiposo;
          else if (onomSett.some(o => o.dipendente_id === dip.id && o.giorno_nome === giorno)) target = idRiposo;
          else if (gi === riposoIdx) target = idRiposo;
          else { target = seq[si % 6] || null; si++; }
          updates.push({ dipendente_id: dip.id, giorno, turno_id: target || null }); tocco++;
        }
        return;
      }

      // ===== ALTRI (turno fisso / rotazione bar) =====
      const configurato = !!(c.turno_id || c.riposo_giorno || (c.lunga_giorni || []).length || c.rotazione);
      // turno "di lavoro" della settimana: se in rotazione bar, alterna mattina/pomeriggio
      let turnoLavoro = c.turno_id || null;
      if (c.rotazione) {
        const iniziaMattina = c.rotazione === "mattina";
        const mattinaQuestaSett = settimanaPari ? iniziaMattina : !iniziaMattina;
        turnoLavoro = mattinaQuestaSett ? idBarMattina : idBarPom;
      }
      for (let gi = 0; gi < 7; gi++) {
        const date = new Date(lunedi); date.setDate(lunedi.getDate() + gi);
        const dStr = isoT(date);
        const giorno = giorni[gi];
        let target;  // undefined = nessuna opinione (lascio la cella com'è)
        if (ferieIn(dip.id, dStr)) target = idFerie || idRiposo;                       // ferie approvata (vale per TUTTI)
        else if (onomSett.some(o => o.dipendente_id === dip.id && o.giorno_nome === giorno)) target = idRiposo; // onomastico
        else if (configurato) {
          if (c.riposo_giorno && c.riposo_giorno === giorno) target = idRiposo;        // riposo fisso settimanale
          else if ((c.lunga_giorni || []).includes(giorno)) target = idLunga || turnoLavoro || null; // Lunga (ven/sab/dom)
          else target = turnoLavoro || null;                                            // turno abituale / rotazione bar
        }
        if (target !== undefined) {
          updates.push({ dipendente_id: dip.id, giorno, turno_id: target || null }); tocco++;
        } else {
          // non configurato e nessuna ferie/onomastico: pulisco solo una "Ferie" rimasta
          // (così se cancello la ferie e rigenero, il turno non resta bloccato su Ferie).
          const cur = getAssegnazione(dip.id, giorno);
          if (cur && nomeTurno(cur.turno_id) === "Ferie") { updates.push({ dipendente_id: dip.id, giorno, turno_id: null }); tocco++; }
        }
      }
    });
    // === REGOLA: chi fa la sera non fa la mattina successiva (forzata) ===
    // Ricostruisco l'orario effettivo della settimana (esistente + modifiche appena calcolate)
    // e, se trovo "mattina" subito dopo una "sera/pomeriggio", sposto la mattina al pomeriggio.
    const isSera = (id) => { const n = nomeTurno(id) || ""; return /pomerig|15-21|sera/i.test(n); };
    const isMattina = (id) => { const n = nomeTurno(id) || ""; return /mattin|6:30|7-15|8-16/i.test(n); };
    const pomeriggioPer = (id) => {
      const n = nomeTurno(id) || "";
      if (/bar|6:30|15/i.test(n)) return idTurno("Bar 15-21") || idTurno("Pomeriggio");
      return idTurno("Pomeriggio") || idTurno("Bar 15-21");
    };
    const sched = {};
    dipTurni.forEach(d => { sched[d.id] = giorni.map(g => (getAssegnazione(d.id, g) || {}).turno_id || null); });
    updates.forEach(u => { const gi = giorni.indexOf(u.giorno); if (sched[u.dipendente_id] && gi >= 0) sched[u.dipendente_id][gi] = u.turno_id; });
    dipTurni.forEach(d => {
      for (let gi = 1; gi < 7; gi++) {
        const ieri = sched[d.id][gi - 1], oggi = sched[d.id][gi];
        if (isSera(ieri) && isMattina(oggi)) {
          const nuovo = pomeriggioPer(oggi);
          if (nuovo && nuovo !== oggi) {
            sched[d.id][gi] = nuovo;
            updates.push({ dipendente_id: d.id, giorno: giorni[gi], turno_id: nuovo, motivo: "regola sera→mattina" });
            tocco++;
          }
        }
      }
    });
    if (!tocco) { alert("Niente da generare. Apri \"Configura turni\" e imposta turno/riposo (o spunta Sala per i camerieri), oppure verifica che ci siano ferie approvate."); return; }
    if (updates.length) await salva(updates);
  };

  // === SOSTITUZIONE D'EMERGENZA (malattia/assenza) ===
  // L'assente va a Riposo (con motivo); il sostituto prende il turno scelto (di default Lunga = doppia).
  const apriSost = () => {
    setSost({ assente: "", giorno: giorni[(new Date().getDay() + 6) % 7], motivo: "malattia",
              sostituto: "", turnoSost: idTurno("Lunga") || "" });
    setShowSost(true);
  };
  const confermaSost = async () => {
    if (!sost.assente || !sost.giorno) { alert("Scegli il dipendente assente e il giorno."); return; }
    const ups = [{ dipendente_id: sost.assente, giorno: sost.giorno, turno_id: idTurno("Riposo") || null, motivo: sost.motivo || "assenza" }];
    if (sost.sostituto && sost.turnoSost) {
      if (sost.sostituto === sost.assente) { alert("Il sostituto deve essere un'altra persona."); return; }
      ups.push({ dipendente_id: sost.sostituto, giorno: sost.giorno, turno_id: sost.turnoSost, motivo: "sostituzione" });
    }
    await salva(ups);
    setShowSost(false);
  };

  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <div>
          <h1>Gestione Turni</h1>
          <p>Assegnazione turni settimanali · la squadra produzione si riequilibra da sola</p>
        </div>
        <div className="dc-turni-legend">
          {turni.map(t => {
            const haOrario = /\d/.test(t.nome);
            const sel = evid === t.id;
            return (
              <span key={t.id} onClick={() => setEvid(sel ? null : t.id)}
                className="dc-turno-badge"
                title="Clicca per evidenziare chi fa questo turno"
                style={{ backgroundColor: t.colore, cursor: "pointer", outline: sel ? "3px solid #5b7a6b" : "none", opacity: evid && !sel ? 0.45 : 1 }}>
                {t.nome}{!haOrario && t.orario_inizio ? `: ${t.orario_inizio}-${t.orario_fine}` : ""}
              </span>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => setLunedi(d => { const n = new Date(d); n.setDate(d.getDate() - 7); return n; })} className="dc-btn">‹</button>
        <strong style={{ minWidth: 150, textAlign: "center" }}>{meseLabel}{settimanaPari ? "" : " · bar invertito"}</strong>
        <button onClick={() => setLunedi(d => { const n = new Date(d); n.setDate(d.getDate() + 7); return n; })} className="dc-btn">›</button>
        <button onClick={() => setLunedi(lunOggi)} className="dc-btn" style={{ fontSize: 12 }}>Oggi</button>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#3b4a40", cursor: "pointer" }}>
          <input type="checkbox" checked={barChiusoDomPom} onChange={(e) => salvaImpostazione({ bar_chiuso_domenica_pomeriggio: e.target.checked })} />
          Bar chiuso la domenica pomeriggio
        </label>
        {barChiusoDomPom && (
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#3b4a40" }}>
            dal <input type="date" value={periodoInizio} onChange={(e) => salvaImpostazione({ periodo_inizio: e.target.value })} style={{ border: "1px solid #cdd8d0", borderRadius: 6, padding: "3px 6px", fontSize: 12 }} />
            al <input type="date" value={periodoFine} onChange={(e) => salvaImpostazione({ periodo_fine: e.target.value })} style={{ border: "1px solid #cdd8d0", borderRadius: 6, padding: "3px 6px", fontSize: 12 }} />
          </span>
        )}
        <button onClick={apriCfg} className="dc-btn"
          style={{ marginLeft: "auto", padding: "10px 16px", borderRadius: 10, fontWeight: 600 }}>
          ⚙️ Configura turni
        </button>
        <button onClick={apriSost} disabled={busy} className="dc-btn"
          style={{ padding: "10px 16px", borderRadius: 10, fontWeight: 600 }} title="Sostituzione d'emergenza: malattia/assenza e chi copre">
          🚨 Sostituzione
        </button>
        <button onClick={generaProduzione} disabled={busy}
          style={{ background: "#5b7a6b", color: "#fff", border: "none", padding: "10px 18px", borderRadius: 10, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Attendi…" : "Genera settimana"}
        </button>
      </div>

      {showCfg && (
        <div onClick={() => setShowCfg(false)} style={{ position: "fixed", inset: 0, background: "rgba(42,51,41,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, zIndex: 50, overflow: "auto" }}>
          <div onClick={e => e.stopPropagation()} className="dc-card" style={{ maxWidth: 920, width: "100%", marginTop: 20 }}>
            <h3 style={{ marginTop: 0 }}>⚙️ Configura turni dipendenti</h3>
            <p className="dc-muted" style={{ fontSize: 13, marginTop: 0 }}>Punto unico dei turni. Per ognuno scegli UNA modalità: <b>Sala</b> (cameriere → rotazione automatica 2 Lunga / 2 Mattina / 2 Pomeriggio / 1 Riposo, riposi nei feriali per coprire il weekend), oppure <b>turno abituale</b>, oppure <b>rotazione bar</b> (mattina ↔ pomeriggio ogni settimana). In più: <b>riposo fisso</b>, la <b>Lunga</b> (1 a settimana, Ven/Sab/Dom; spunta <b>doppia</b> per chi la fa due volte) e l’<b>onomastico</b>. “Genera settimana” mette sempre Ferie nei giorni approvati e Riposo nell’onomastico. Le celle restano modificabili a mano. Salva su database (MongoDB Atlas).</p>
            <div style={{ maxHeight: "60vh", overflow: "auto" }}>
            <table className="dc-table">
              <thead><tr><th>Dipendente</th><th>Sala<br/><span style={{fontWeight:400,fontSize:11}}>cameriere</span></th><th>Turno abituale</th><th>Rotazione bar<br/><span style={{fontWeight:400,fontSize:11}}>mattina ↔ pom</span></th><th>Riposo fisso</th><th>Lunga<br/><span style={{fontWeight:400,fontSize:11}}>1/sett · doppia</span></th><th>Onomastico<br/><span style={{fontWeight:400,fontSize:11}}>gg / mm · attivo</span></th></tr></thead>
              <tbody>
                {cfgRows.map((r, i) => (
                  <tr key={r.dipendente_id}>
                    <td>{r.nome}{r.straniero ? <span className="dc-muted"> · straniero</span> : ""}</td>
                    <td style={{ textAlign: "center" }}>
                      <input type="checkbox" checked={!!r.sala} title="Cameriere: rotazione automatica 2 Lunga / 2 Mattina / 2 Pomeriggio / 1 Riposo" onChange={e => setCfgRow(i, "sala", e.target.checked)} />
                    </td>
                    <td>
                      <select className="dc-input" value={r.turno_id} onChange={e => setCfgRow(i, "turno_id", e.target.value)} disabled={!!r.rotazione || !!r.sala} title={r.sala ? "In rotazione sala: i turni sono assegnati in automatico" : (r.rotazione ? "In rotazione bar: il turno è alternato automaticamente" : "")}>
                        <option value="">— nessuno —</option>
                        {turni.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="dc-input" value={r.rotazione} onChange={e => setCfgRow(i, "rotazione", e.target.value)} disabled={!!r.sala} title="Alterna ogni settimana mattina e pomeriggio bar">
                        <option value="">— no —</option>
                        <option value="mattina">Inizia mattina</option>
                        <option value="pomeriggio">Inizia pomeriggio</option>
                      </select>
                    </td>
                    <td>
                      <select className="dc-input" value={r.riposo_giorno} onChange={e => setCfgRow(i, "riposo_giorno", e.target.value)}>
                        <option value="">— nessuno —</option>
                        {giorni.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <select className="dc-input" style={{ width: 95, display: "inline-block" }} value={r.lunga1} onChange={e => setCfgRow(i, "lunga1", e.target.value)} title="Giorno della Lunga (1 a settimana)">
                        <option value="">— no —</option>
                        {LUNGA_GIORNI.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                      <label style={{ marginLeft: 6, fontSize: 12 }} title="Spunta se questo dipendente fa la Lunga due volte a settimana">
                        <input type="checkbox" checked={!!r.doppia} disabled={!r.lunga1} onChange={e => setCfgRow(i, "doppia", e.target.checked)} /> doppia
                      </label>
                      {r.doppia && (
                        <select className="dc-input" style={{ width: 95, display: "inline-block", marginLeft: 6 }} value={r.lunga2} onChange={e => setCfgRow(i, "lunga2", e.target.value)} title="2° giorno di Lunga">
                          <option value="">— 2° giorno —</option>
                          {LUNGA_GIORNI.filter(g => g !== r.lunga1).map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <input className="dc-input" style={{ width: 48, display: "inline-block" }} type="number" min="1" max="31" value={r.onom_giorno ?? ""} onChange={e => setCfgRow(i, "onom_giorno", e.target.value)} />
                      <span> / </span>
                      <input className="dc-input" style={{ width: 48, display: "inline-block" }} type="number" min="1" max="12" value={r.onom_mese ?? ""} onChange={e => setCfgRow(i, "onom_mese", e.target.value)} />
                      <input type="checkbox" style={{ marginLeft: 6 }} title="Riposo onomastico attivo" checked={!!r.onom_attivo} onChange={e => setCfgRow(i, "onom_attivo", e.target.checked)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button className="dc-btn" onClick={() => setShowCfg(false)}>Chiudi</button>
              <button className="dc-btn-primary" onClick={salvaCfg}>Salva</button>
            </div>
          </div>
        </div>
      )}

      {showSost && (
        <div onClick={() => setShowSost(false)} style={{ position: "fixed", inset: 0, background: "rgba(42,51,41,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, zIndex: 50, overflow: "auto" }}>
          <div onClick={e => e.stopPropagation()} className="dc-card" style={{ maxWidth: 520, width: "100%", marginTop: 40 }}>
            <h3 style={{ marginTop: 0 }}>🚨 Sostituzione d'emergenza</h3>
            <p className="dc-muted" style={{ fontSize: 13, marginTop: 0 }}>
              Segna chi è assente (malattia/ferie/assenza): va a <b>Riposo</b>. Poi scegli chi lo copre: gli assegno il turno scelto (di default la <b>Lunga</b> = doppia) in quel giorno.
            </p>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#3b4a40" }}>Dipendente assente</label>
                <select className="dc-input" style={{ width: "100%" }} value={sost.assente} onChange={e => setSost(s => ({ ...s, assente: e.target.value }))}>
                  <option value="">— scegli —</option>
                  {dipTurni.map(d => <option key={d.id} value={d.id}>{`${d.cognome || ''} ${d.nome || ''}`.trim() || d.nome}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#3b4a40" }}>Giorno</label>
                  <select className="dc-input" style={{ width: "100%" }} value={sost.giorno} onChange={e => setSost(s => ({ ...s, giorno: e.target.value }))}>
                    {giorni.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#3b4a40" }}>Motivo</label>
                  <select className="dc-input" style={{ width: "100%" }} value={sost.motivo} onChange={e => setSost(s => ({ ...s, motivo: e.target.value }))}>
                    <option value="malattia">Malattia</option>
                    <option value="assenza">Assenza</option>
                    <option value="ferie">Ferie</option>
                    <option value="permesso">Permesso</option>
                  </select>
                </div>
              </div>
              {sost.assente && sost.giorno && (() => {
                const cur = getAssegnazione(sost.assente, sost.giorno);
                const n = cur && nomeTurno(cur.turno_id);
                return <div className="dc-muted" style={{ fontSize: 12 }}>Turno attuale di quel giorno: <b>{n || "—"}</b></div>;
              })()}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#3b4a40" }}>Chi lo copre (sostituto)</label>
                <select className="dc-input" style={{ width: "100%" }} value={sost.sostituto} onChange={e => setSost(s => ({ ...s, sostituto: e.target.value }))}>
                  <option value="">— nessuno (lascio scoperto) —</option>
                  {dipTurni.filter(d => d.id !== sost.assente).map(d => <option key={d.id} value={d.id}>{`${d.cognome || ''} ${d.nome || ''}`.trim() || d.nome}</option>)}
                </select>
              </div>
              {sost.sostituto && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#3b4a40" }}>Turno del sostituto</label>
                  <select className="dc-input" style={{ width: "100%" }} value={sost.turnoSost} onChange={e => setSost(s => ({ ...s, turnoSost: e.target.value }))}>
                    {turni.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button className="dc-btn" onClick={() => setShowSost(false)}>Annulla</button>
              <button className="dc-btn-primary" onClick={confermaSost} disabled={busy}>Conferma sostituzione</button>
            </div>
          </div>
        </div>
      )}

      <div className="dc-card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>🎂 Onomastici di questa settimana</h3>
          <button className="dc-btn" onClick={apriCfg}>Gestisci (turni & onomastici)</button>
        </div>
        {onomSett.length === 0
          ? <p className="dc-muted" style={{ marginBottom: 0, marginTop: 8 }}>Nessun onomastico nei giorni lavorativi di questa settimana.</p>
          : (
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {onomSett.map((o, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderTop: "1px solid #eee", paddingTop: 8, flexWrap: "wrap" }}>
                  <span>🎂 <b>{o.nome}</b> · {o.giorno_nome} {o.data_label} — a riposo</span>
                  <button className="dc-btn" disabled={busy} onClick={() => mettiRiposoOnom(o)}>Rimetti a riposo</button>
                </div>
              ))}
            </div>
          )}
        <p className="dc-muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>Il riposo è impostato automaticamente nel giorno dell'onomastico (marcato 🎂 nella griglia). Se ti serve copertura, basta riassegnare un turno in quella cella: la tua scelta ha la precedenza.</p>
      </div>

      <div className="dc-card dc-scroll-x">
        <table className="dc-table dc-turni-table">
          <thead>
            <tr>
              <th style={{ width: 24 }}></th>
              <th>DIPENDENTE</th>
              {giorni.map((g, i) => <th key={g}>{g} {dataDi(i)}</th>)}
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
            {dipTurni.map(dip => (
              <tr key={dip.id} data-id={dip.id}>
                <td className="dc-drag-handle" style={{ cursor: "grab", color: "#94a3b8", textAlign: "center", userSelect: "none", touchAction: "none" }} title="Trascina per riordinare">⠿</td>
                <td>
                  <div className="dc-table-user">
                    <Avatar nome={dip.nome} cognome={dip.cognome} size="sm" />
                    <span>{dip.cognome ? `${dip.cognome} ${dip.nome?.[0] || ''}.` : dip.nome}</span>
                  </div>
                </td>
                {giorni.map(g => {
                  const ass = getAssegnazione(dip.id, g);
                  const turno = ass ? getTurno(ass.turno_id) : null;
                  return (
                    <td key={g} style={{ position: "relative" }}>
                      {ass?.motivo === "onomastico" && <span title="Riposo per onomastico" style={{ position: "absolute", top: 0, right: 2, fontSize: 11, zIndex: 1 }}>🎂</span>}
                      <select
                        value={ass?.turno_id || ""}
                        onChange={e => handleAssegna(dip, g, e.target.value)}
                        className="dc-turno-select"
                        style={{
                          ...(turno ? { backgroundColor: turno.colore + '30', borderColor: turno.colore } : {}),
                          ...(evid ? (ass?.turno_id === evid
                            ? { outline: "3px solid " + ((getTurno(evid) || {}).colore || "#5b7a6b"), opacity: 1 }
                            : { opacity: 0.2 }) : {})
                        }}
                      >
                        <option value="">-</option>
                        {turni.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Buste Paga Page
function BustePagaPage({ dipendenti, reload, getDipendente }) {
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [mese, setMese] = useState(new Date().getMonth() + 1);
  const [righe, setRighe] = useState({});
  const [salvato, setSalvato] = useState({});
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState(null);
  const fileRef = useRef(null);
  const excelRef = useRef(null);
  const [pnMsg, setPnMsg] = useState(null);
  const [soloMancanti, setSoloMancanti] = useState(false);
  const [vistaAnno, setVistaAnno] = useState(false);
  const [annoMatrix, setAnnoMatrix] = useState(null);
  const [cercaQ, setCercaQ] = useState("");
  const [cercaRes, setCercaRes] = useState(null);
  const [cercaBusy, setCercaBusy] = useState(false);
  const [rescanMsg, setRescanMsg] = useState("");
  const mesi = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

  const vuota = () => ({ importo_busta: "", bonifico_ricevuto: false, bonifico_importo: "", bonifico_data: "", acconti: [] });

  const load = async () => {
    const res = await axios.get(`${API}/paghe?anno=${anno}&mese=${mese}`);
    const map = {};
    (res.data || []).forEach(p => { map[p.dipendente_id] = {
      importo_busta: p.importo_busta ?? "",
      bonifico_ricevuto: !!p.bonifico_ricevuto,
      bonifico_importo: p.bonifico_importo ?? "",
      bonifico_data: p.bonifico_data ?? "",
      acconti: (p.acconti || []).map(a => ({ importo: a.importo ?? "", data: a.data ?? "" })),
      busta_riconciliata: !!p.busta_riconciliata,
      bonifico_riconciliato: !!p.bonifico_riconciliato,
      bonifico_pdf: p.bonifico_pdf || "",
      bonifico_causale: p.bonifico_causale || "",
      busta_da_lul: !!p.busta_da_lul,
      prestito_importo: p.prestito_importo ?? "",
      prestito_saldo: p.prestito_saldo ?? "",
      tfr_anticipo_importo: p.tfr_anticipo_importo ?? "",
      acconto_cedolino: p.acconto_cedolino ?? "",
      saldo_residuo: p.saldo_residuo ?? "",
    }; });
    setRighe(map);
  };
  useEffect(() => { load(); }, [anno, mese]);

  const get = (id) => righe[id] || vuota();
  const upd = (id, patch) => setRighe(r => ({ ...r, [id]: { ...get(id), ...patch } }));
  const setAcc = (id, idx, patch) => { const acc = [...(get(id).acconti || [])]; acc[idx] = { ...(acc[idx] || { importo: "", data: "" }), ...patch }; upd(id, { acconti: acc }); };
  const addAcc = (id) => { const acc = [...(get(id).acconti || [])]; if (acc.length < 3) { acc.push({ importo: "", data: "" }); upd(id, { acconti: acc }); } };
  const delAcc = (id, idx) => { const acc = [...(get(id).acconti || [])]; acc.splice(idx, 1); upd(id, { acconti: acc }); };

  const salva = async (id) => {
    const d = get(id);
    const payload = {
      dipendente_id: id, anno, mese,
      importo_busta: d.importo_busta === "" ? null : parseFloat(d.importo_busta),
      bonifico_ricevuto: d.bonifico_ricevuto,
      bonifico_importo: d.bonifico_importo === "" ? null : parseFloat(d.bonifico_importo),
      bonifico_data: d.bonifico_data || null,
      acconti: (d.acconti || []).filter(a => a.importo !== "" && a.importo != null).map(a => ({ importo: parseFloat(a.importo), data: a.data || null })),
    };
    try { await axios.post(`${API}/paghe`, payload); setSalvato(s => ({ ...s, [id]: true })); setTimeout(() => setSalvato(s => ({ ...s, [id]: false })), 1500); } catch (e) { console.error(e); alert("Errore salvataggio"); }
  };

  const eur = (n) => (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Stato pagamento di una paga: ok / parziale / manca / bonifico-senza-busta / null
  const statoPaga = (p) => {
    if (!p) return null;
    const busta = parseFloat(p.importo_busta) || 0;
    const bon = parseFloat(p.bonifico_importo) || 0;
    const acc = (p.acconti || []).reduce((a, x) => a + (parseFloat(x.importo) || 0), 0);
    if (busta <= 0 && bon <= 0 && acc <= 0) return null;
    const pagato = bon + acc;
    if (busta <= 0 && bon > 0) return "bonifico";
    if (pagato + 0.5 >= busta) return "ok";
    if (pagato > 0) return "parziale";
    return "manca";
  };

  // Vista annuale: carica i 12 mesi dell'anno selezionato
  useEffect(() => {
    if (!vistaAnno) return;
    let vivo = true;
    (async () => {
      const res = await Promise.all([1,2,3,4,5,6,7,8,9,10,11,12].map(m =>
        axios.get(`${API}/paghe?anno=${anno}&mese=${m}`).then(r => [m, r.data || []]).catch(() => [m, []])));
      if (!vivo) return;
      const mtx = {};
      res.forEach(([m, rows]) => { mtx[m] = {}; rows.forEach(p => { mtx[m][p.dipendente_id] = p; }); });
      setAnnoMatrix(mtx);
    })();
    return () => { vivo = false; };
  }, [vistaAnno, anno]);

  const cercaVoce = async () => {
    const q = cercaQ.trim();
    if (!q) return;
    setCercaBusy(true); setCercaRes(null);
    const isCode = /^[A-Za-z]\d{3,5}$/.test(q);
    const params = isCode ? `codice=${encodeURIComponent(q.toUpperCase())}` : `testo=${encodeURIComponent(q)}`;
    try {
      const r = await axios.get(`${API}/cedolini/cerca-voce?${params}`);
      setCercaRes(r.data);
    } catch (e) {
      setCercaRes({ risultati: [], totale: 0, errore: e?.response?.data?.detail || "Errore ricerca" });
    } finally { setCercaBusy(false); }
  };

  const riscansiona = async () => {
    if (!window.confirm("Riscansiona i cedolini storici con PDF salvato? Può richiedere fino a un minuto.")) return;
    setRescanMsg("Riscansione in corso…");
    try {
      const r = await axios.post(`${API}/cedolini/riscansiona`);
      setRescanMsg(`✓ Riscansione completata: ${r.data.aggiornati} cedolini aggiornati, ${r.data.errori} senza PDF/errore.`);
    } catch (e) { setRescanMsg("⚠ " + (e?.response?.data?.detail || "Errore riscansione")); }
  };

  const handleImportLul = async (e) => {
    const fs = Array.from(e.target.files || []);
    if (!fs.length) return;
    setImporting(true); setImportMsg(null);
    try {
      const fd = new FormData();
      fs.forEach(f => fd.append("files", f));
      const res = await axios.post(`${API}/paghe/importa-lul`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      const r = res.data;
      setImportMsg(r);
      if (r.mesi?.length) { const u = r.mesi[r.mesi.length - 1]; setMese(u.mese); setAnno(u.anno); }
      await load();
    } catch (err) {
      setImportMsg({ errore: err.response?.data?.detail || "Errore durante l'import" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const handleImportEmail = async () => {
    setImporting(true); setImportMsg(null);
    try {
      const res = await axios.post(`${API}/paghe/importa-email`);
      const r = res.data;
      setImportMsg(r);
      if (r.mesi?.length) { const u = r.mesi[r.mesi.length - 1]; setMese(u.mese); setAnno(u.anno); }
      await load();
    } catch (err) {
      setImportMsg({ errore: err.response?.data?.detail || "Errore durante l'import da email" });
    } finally {
      setImporting(false);
    }
  };
  const handleImportPrimaNota = async (e) => {
    const fl = (e.target.files || [])[0];
    if (!fl) return;
    setImporting(true); setPnMsg(null);
    try {
      const fd = new FormData(); fd.append("file", fl);
      const r = await axios.post(`${API}/paghe/importa-prima-nota`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPnMsg(r.data);
      await load();
      if (vistaAnno) { setVistaAnno(false); setTimeout(() => setVistaAnno(true), 50); }
    } catch (err) {
      setPnMsg({ errore: err?.response?.data?.detail || "Errore import Prima Nota" });
    } finally {
      setImporting(false);
      if (excelRef.current) excelRef.current.value = "";
    }
  };
  const csvRef = useRef(null);
  const [csvMsg, setCsvMsg] = useState(null);
  const [pnDett, setPnDett] = useState(null);
  const handleImportPagamenti = async (e) => {
    const fl = (e.target.files || [])[0];
    if (!fl) return;
    setImporting(true); setCsvMsg(null);
    try {
      const fd = new FormData(); fd.append("file", fl);
      const r = await axios.post(`${API}/paghe/importa-pagamenti`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setCsvMsg(r.data); await load();
      if (vistaAnno) { setVistaAnno(false); setTimeout(() => setVistaAnno(true), 50); }
    } catch (err) { setCsvMsg({ errore: err?.response?.data?.detail || "Errore import pagamenti" }); }
    finally { setImporting(false); if (csvRef.current) csvRef.current.value = ""; }
  };
  const apriPrimaNota = async (dipId, nome) => {
    setPnDett({ nome, loading: true });
    try {
      const r = await axios.get(`${API}/paghe/prima-nota?dipendente_id=${dipId}`);
      setPnDett({ nome, righe: r.data.righe || [], saldo_finale: r.data.saldo_finale });
    } catch { setPnDett({ nome, righe: [], errore: true }); }
  };
  const totBuste = dipendenti.reduce((s, d) => s + (parseFloat(get(d.id).importo_busta) || 0), 0);
  const totBonifici = dipendenti.reduce((s, d) => s + (parseFloat(get(d.id).bonifico_importo) || 0), 0);
  const totAcconti = dipendenti.reduce((s, d) => s + (get(d.id).acconti || []).reduce((a, x) => a + (parseFloat(x.importo) || 0), 0), 0);
  const inp = { border: "1px solid #d1d5db", borderRadius: 8, padding: "7px 9px", fontSize: 14, width: "100%", boxSizing: "border-box" };

  const [showImport, setShowImport] = useState(false);
  const [showCerca, setShowCerca] = useState(false);
  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <div>
          <h1>Buste Paga</h1>
          <p>Importo busta, bonifico ricevuto e acconti · tutto salvato sul database</p>
        </div>
        <div className="dc-page-actions" style={{ position: "relative" }}>
          <input ref={fileRef} type="file" accept=".pdf,.zip,application/pdf,application/zip,application/x-zip-compressed" multiple onChange={handleImportLul} style={{ display: "none" }} />
          <input ref={excelRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleImportPrimaNota} style={{ display: "none" }} />
          <input ref={csvRef} type="file" accept=".csv,text/csv" onChange={handleImportPagamenti} style={{ display: "none" }} />
          <button onClick={() => setShowImport(s => !s)} disabled={importing}
            style={{ background: "#5b7a6b", color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 700, cursor: importing ? "default" : "pointer", opacity: importing ? 0.6 : 1 }}>
            {importing ? "Importo…" : "⤵ Importa  ▾"}
          </button>
          {showImport && (
            <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 6, background: "#fffefb", border: "1px solid #e6e0d4", borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,.12)", zIndex: 30, minWidth: 250, overflow: "hidden" }}>
              {[["Libro Unico (PDF/ZIP)", () => fileRef.current?.click()],
                ["Buste da email", handleImportEmail],
                ["Prima Nota (Excel)", () => excelRef.current?.click()],
                ["Pagamenti banca (CSV)", () => csvRef.current?.click()]].map(([label, fn], i) => (
                <button key={i} onClick={() => { setShowImport(false); fn(); }}
                  style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: i < 3 ? "1px solid #f0ebe0" : "none", padding: "11px 14px", fontSize: 14, cursor: "pointer", color: "#2a3329" }}>{label}</button>
              ))}
            </div>
          )}
          <select value={mese} onChange={e => setMese(+e.target.value)} className="dc-select">
            {mesi.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={anno} onChange={e => setAnno(+e.target.value)} className="dc-select">
            {[2022, 2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {pnMsg && (
        <div className="dc-card" style={{ marginBottom: 16, borderLeft: `4px solid ${pnMsg.errore ? '#d35f4e' : '#3d8168'}` }}>
          {pnMsg.errore ? <div style={{ color: "#d35f4e", fontWeight: 600 }}>⚠ {pnMsg.errore}</div> : (
            <div>
              <div style={{ fontWeight: 700 }}>✓ Prima Nota importata: {pnMsg.aggiornati} mesi/dipendente aggiornati su {pnMsg.righe_aggregate} totali.</div>
              {pnMsg.non_trovati > 0 && (
                <div style={{ marginTop: 6, fontSize: 13, color: "#7d5526" }}>
                  ⚠ {pnMsg.non_trovati} voci con dipendente non in anagrafica (non importate): {(pnMsg.nomi_non_trovati || []).join(", ")}
                </div>
              )}
              {pnMsg.discrepanze?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#7d5526" }}>Differenze importo busta (app vs Excel) — {pnMsg.discrepanze.length}:</div>
                  <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
                    {pnMsg.discrepanze.slice(0, 60).map((x, i) => (
                      <span key={i}>{x.dipendente} · {mesi[x.mese - 1]} {x.anno}: app € {eur(x.busta_app)} · Excel € {eur(x.busta_excel)}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {csvMsg && (
        <div className="dc-card" style={{ marginBottom: 16, borderLeft: `4px solid ${csvMsg.errore ? '#d35f4e' : '#3d8168'}` }}>
          {csvMsg.errore ? <div style={{ color: "#d35f4e", fontWeight: 600 }}>⚠ {csvMsg.errore}</div> : (
            <div style={{ fontSize: 14 }}>
              <div style={{ fontWeight: 700 }}>✓ Pagamenti importati: {csvMsg.importati} · {csvMsg.mesi_aggiornati} mesi aggiornati.</div>
              {csvMsg.non_trovati?.length > 0 && <div style={{ marginTop: 6, fontSize: 13, color: "#7d5526" }}>⚠ Beneficiari non trovati in anagrafica: {csvMsg.non_trovati.join(", ")}</div>}
            </div>
          )}
        </div>
      )}

      {pnDett && (
        <div onClick={() => setPnDett(null)} style={{ position: "fixed", inset: 0, background: "rgba(42,51,41,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, zIndex: 50, overflow: "auto" }}>
          <div onClick={e => e.stopPropagation()} className="dc-card" style={{ maxWidth: 640, width: "100%", marginTop: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Prima nota — {pnDett.nome}</h3>
              <button className="dc-btn" onClick={() => setPnDett(null)}>Chiudi</button>
            </div>
            {pnDett.loading ? <p className="dc-muted">Carico…</p> : !pnDett.righe?.length ? <p className="dc-muted" style={{ marginTop: 12 }}>Nessun dato.</p> : (
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table className="dc-table" style={{ minWidth: 520, whiteSpace: "nowrap" }}>
                  <thead><tr><th>Periodo</th><th style={{ textAlign: "right" }}>Busta €</th><th style={{ textAlign: "right" }}>Erogato €</th><th style={{ textAlign: "right" }}>Saldo progressivo €</th></tr></thead>
                  <tbody>
                    {pnDett.righe.map((x, i) => (
                      <tr key={i}>
                        <td>{mesi[x.mese - 1]} {x.anno}</td>
                        <td style={{ textAlign: "right" }}>{x.busta ? eur(x.busta) : "—"}</td>
                        <td style={{ textAlign: "right" }}>{x.erogato ? eur(x.erogato) : "—"}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: x.saldo_progressivo > 0.5 ? "#d35f4e" : x.saldo_progressivo < -0.5 ? "#7d5526" : "#3d8168" }}>{eur(x.saldo_progressivo)}</td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 700, borderTop: "2px solid #e6e0d4" }}>
                      <td colSpan={3}>Saldo finale (positivo = ancora da pagare)</td>
                      <td style={{ textAlign: "right", color: pnDett.saldo_finale > 0.5 ? "#d35f4e" : "#3d8168" }}>{eur(pnDett.saldo_finale)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Motore di ricerca voci cedolino + riscansione storico (a scomparsa) */}
      <div className="dc-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, marginBottom: showCerca ? undefined : 0, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }} onClick={() => setShowCerca(s => !s)}>
          <span>🔎 Cerca nelle buste (qualsiasi voce)</span>
          <span className="dc-muted" style={{ fontSize: 14 }}>{showCerca ? "▲" : "▼"}</span>
        </h3>
        {showCerca && (<>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className="dc-input" style={{ flex: "1 1 240px" }} placeholder="Codice (es. F09081) o testo (es. 730, 13ma, L.207)"
            value={cercaQ} onChange={e => setCercaQ(e.target.value)} onKeyDown={e => e.key === "Enter" && cercaVoce()} />
          <button className="dc-btn-primary" disabled={cercaBusy} onClick={cercaVoce}>{cercaBusy ? "Cerco…" : "Cerca"}</button>
          <button className="dc-btn" onClick={riscansiona} title="Rilegge i PDF dei cedolini già caricati per popolare la ricerca sullo storico">Riscansiona storico</button>
        </div>
        {rescanMsg && <div className="dc-muted" style={{ marginTop: 8 }}>{rescanMsg}</div>}
        {cercaRes && (
          <div style={{ marginTop: 10, overflowX: "auto" }}>
            {cercaRes.errore ? <div className="dc-muted">⚠ {cercaRes.errore}</div>
              : cercaRes.totale === 0 ? <div className="dc-muted">Nessun risultato. Per lo storico premi prima “Riscansiona storico”.</div>
              : <table className="dc-table" style={{ minWidth: 560, whiteSpace: "nowrap" }}>
                  <thead><tr><th>Dipendente</th><th>Periodo</th><th>Codice</th><th>Descrizione</th><th style={{ textAlign: "right" }}>Importo</th></tr></thead>
                  <tbody>
                    {cercaRes.risultati.map((x, i) => (
                      <tr key={i}><td>{x.dipendente}</td><td>{mesi[(x.mese || 1) - 1]} {x.anno}</td><td>{x.codice}</td><td>{x.descrizione}</td><td style={{ textAlign: "right" }}>{x.importo || "—"}</td></tr>
                    ))}
                  </tbody>
                </table>}
            {cercaRes.totale > 0 && <p className="dc-muted" style={{ fontSize: 12, marginTop: 6 }}>{cercaRes.totale} risultati.</p>}
          </div>
        )}
        </>)}
      </div>

      {/* Riepilogo busta vs bonifico — mensile o annuale */}
      <div className="dc-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>{vistaAnno ? `Riepilogo anno ${anno}` : `Riepilogo ${mesi[mese - 1]} ${anno}`} — busta vs bonifico</h3>
          <div style={{ display: "flex", gap: 14, fontSize: 13 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}><input type="checkbox" checked={soloMancanti} onChange={e => setSoloMancanti(e.target.checked)} /> Solo chi manca</label>
            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}><input type="checkbox" checked={vistaAnno} onChange={e => setVistaAnno(e.target.checked)} /> Vista annuale</label>
          </div>
        </div>

        {!vistaAnno && (
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table className="dc-table" style={{ minWidth: 580, whiteSpace: "nowrap" }}>
              <thead><tr><th>Dipendente</th><th style={{ textAlign: "right" }}>Busta €</th><th style={{ textAlign: "right" }}>Acconti €</th><th style={{ textAlign: "right" }}>Bonifico €</th><th style={{ textAlign: "right" }}>Differenza</th><th>Stato</th></tr></thead>
              <tbody>
                {dipendenti.map(d => {
                  const r = get(d.id);
                  const busta = parseFloat(r.importo_busta) || 0;
                  const bon = parseFloat(r.bonifico_importo) || 0;
                  const acc = (r.acconti || []).reduce((a, x) => a + (parseFloat(x.importo) || 0), 0);
                  const cat = statoPaga(r);
                  if (!cat) return null;
                  if (soloMancanti && cat === "ok") return null;
                  const pagato = bon + acc;
                  const diff = pagato - busta;  // <0 manca, >0 eccedenza
                  const diffCell = busta <= 0 ? <span className="dc-muted">—</span>
                    : diff < -0.5 ? <span style={{ color: "#d35f4e", fontWeight: 700 }}>manca € {eur(-diff)}</span>
                    : diff > 0.5 ? <span style={{ color: "#7d5526", fontWeight: 700 }}>+€ {eur(diff)}</span>
                    : <span style={{ color: "#3d8168", fontWeight: 700 }}>0,00</span>;
                  const stato = cat === "bonifico" ? <Badge variant="warning">bonifico senza busta</Badge>
                    : cat === "ok" ? <Badge variant="success">✓ pagato</Badge>
                    : cat === "parziale" ? <Badge variant="warning">parziale</Badge>
                    : <Badge variant="danger">⚠ da pagare</Badge>;
                  return (
                    <tr key={d.id}>
                      <td><button onClick={() => apriPrimaNota(d.id, d.cognome ? `${d.cognome} ${d.nome || ''}`.trim() : d.nome)} title="Apri prima nota / saldo progressivo" style={{ background: "none", border: "none", color: "#5b7a6b", cursor: "pointer", textDecoration: "underline", padding: 0, font: "inherit" }}>{d.cognome ? `${d.cognome} ${d.nome?.[0] || ''}.` : d.nome}</button></td>
                      <td style={{ textAlign: "right" }}>{busta ? eur(busta) : "—"}</td>
                      <td style={{ textAlign: "right" }}>{acc ? eur(acc) : "—"}</td>
                      <td style={{ textAlign: "right" }}>{bon ? eur(bon) : "—"}</td>
                      <td style={{ textAlign: "right" }}>{diffCell}</td>
                      <td>{stato}</td>
                    </tr>
                  );
                })}
                {!soloMancanti && (
                  <tr style={{ fontWeight: 700, borderTop: "2px solid #e6e0d4" }}>
                    <td>Totale</td>
                    <td style={{ textAlign: "right" }}>{eur(totBuste)}</td>
                    <td style={{ textAlign: "right" }}>{eur(totAcconti)}</td>
                    <td style={{ textAlign: "right" }}>{eur(totBonifici)}</td>
                    <td style={{ textAlign: "right" }}>{eur(totBonifici + totAcconti - totBuste)}</td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="dc-muted" style={{ fontSize: 12, marginTop: 8 }}>“Pagato” = bonifico emesso + acconti ≥ importo busta.</p>
          </div>
        )}

        {vistaAnno && (
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            {!annoMatrix ? <div className="dc-muted">Carico l'anno…</div> : (
              <table className="dc-table" style={{ minWidth: 1280, whiteSpace: "nowrap", fontSize: 12 }}>
                <thead><tr><th>Dipendente</th>{mesi.map((m, i) => <th key={i} title={m} style={{ textAlign: "center" }}>{m.slice(0, 3)}</th>)}<th style={{ textAlign: "right" }}>Tot Busta</th><th style={{ textAlign: "right" }}>Tot Bonifici</th><th style={{ textAlign: "right" }}>Differenza</th></tr></thead>
                <tbody>
                  {dipendenti.map(d => {
                    const paghe = mesi.map((_, i) => (annoMatrix[i + 1] || {})[d.id]);
                    const celle = paghe.map(p => statoPaga(p));
                    if (soloMancanti && !celle.some(c => c && c !== "ok")) return null;
                    if (!soloMancanti && celle.every(c => !c)) return null;
                    const tb = paghe.reduce((s, p) => s + (parseFloat(p?.importo_busta) || 0), 0);
                    const tbon = paghe.reduce((s, p) => s + (parseFloat(p?.bonifico_importo) || 0), 0);
                    const tacc = paghe.reduce((s, p) => s + ((p?.acconti || []).reduce((a, x) => a + (parseFloat(x.importo) || 0), 0)), 0);
                    const tdiff = (tbon + tacc) - tb;
                    return (
                      <tr key={d.id}>
                        <td><button onClick={() => apriPrimaNota(d.id, d.cognome ? `${d.cognome} ${d.nome || ''}`.trim() : d.nome)} title="Apri prima nota / saldo progressivo" style={{ background: "none", border: "none", color: "#5b7a6b", cursor: "pointer", textDecoration: "underline", padding: 0, font: "inherit" }}>{d.cognome ? `${d.cognome} ${d.nome?.[0] || ''}.` : d.nome}</button></td>
                        {celle.map((c, i) => {
                          const p = paghe[i];
                          const bm = parseFloat(p?.importo_busta) || 0;
                          const em = (parseFloat(p?.bonifico_importo) || 0) + ((p?.acconti || []).reduce((a, x) => a + (parseFloat(x.importo) || 0), 0));
                          const manca = bm - em;
                          let txt, col, title;
                          if (!c) { txt = "·"; col = "#cbd2c9"; title = `${mesi[i]}: nessun dato`; }
                          else if (c === "ok") { txt = "✓"; col = "#3d8168"; title = `${mesi[i]}: pagato (busta € ${eur(bm)})`; }
                          else if (c === "bonifico") { txt = "+" + eur(em); col = "#7d5526"; title = `${mesi[i]}: bonifico € ${eur(em)} senza busta`; }
                          else if (manca > 0.5) { txt = eur(manca); col = "#d35f4e"; title = `${mesi[i]}: manca € ${eur(manca)} (busta € ${eur(bm)}, erogato € ${eur(em)})`; }
                          else { txt = "+" + eur(-manca); col = "#7d5526"; title = `${mesi[i]}: eccedenza € ${eur(-manca)}`; }
                          return <td key={i} style={{ textAlign: "right", color: col, fontWeight: 700, fontSize: 12 }} title={title}>{txt}</td>;
                        })}
                        <td style={{ textAlign: "right" }}>{tb ? eur(tb) : "—"}</td>
                        <td style={{ textAlign: "right" }}>{tbon ? eur(tbon) : "—"}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: tb <= 0 ? "#94a3b8" : tdiff < -0.5 ? "#d35f4e" : tdiff > 0.5 ? "#7d5526" : "#3d8168" }}>
                          {tb <= 0 ? "—" : tdiff < -0.5 ? `manca € ${eur(-tdiff)}` : tdiff > 0.5 ? `+€ ${eur(tdiff)}` : "0,00"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="dc-muted" style={{ fontSize: 12, marginTop: 8 }}>In ogni mese: <b style={{ color: "#d35f4e" }}>importo rosso</b> = quanto manca · <b style={{ color: "#7d5526" }}>+importo</b> = eccedenza · <b style={{ color: "#3d8168" }}>✓</b> = pagato · · = nessun dato. Importi in euro (es. 1.000,00). Scorri in orizzontale per vedere tutti i mesi.</p>
          </div>
        )}
      </div>

      {importMsg && (
        <div className="dc-card" style={{ marginBottom: 16, padding: 14, borderLeft: `4px solid ${importMsg.errore ? '#d35f4e' : '#3d8168'}` }}>
          {importMsg.errore ? (
            <div style={{ color: "#d35f4e", fontWeight: 600 }}>⚠ {importMsg.errore}</div>
          ) : (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                ✓ Elaborati {importMsg.file_pdf} documenti · {importMsg.totale_associati} buste{importMsg.bonifici?.length ? ` · ${importMsg.bonifici.length} bonifici` : ""}{importMsg.prestiti?.length ? ` · ${importMsg.prestiti.length} prestiti` : ""}{importMsg.presenze?.length ? ` · ${importMsg.presenze.length} presenze` : ""}
              </div>
              {importMsg.mesi?.length > 0 && (
                <div style={{ fontSize: 13, marginBottom: 6, color: "#2a3329" }}>
                  Mesi importati: {importMsg.mesi.map(mm => `${mesi[mm.mese - 1]} ${mm.anno} (${mm.n})`).join(" · ")}
                </div>
              )}
              <div style={{ fontSize: 13, color: "#6b7669", display: "flex", flexWrap: "wrap", gap: "2px 14px" }}>
                {importMsg.associati?.map((a, i) => (
                  <span key={i}>{a.dipendente}: € {eur(a.netto)}{importMsg.mesi?.length > 1 ? ` (${a.mese}/${a.anno})` : ""}{a.metodo !== "codice fiscale" ? " ⚠" : ""}</span>
                ))}
              </div>
              {importMsg.bonifici?.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: "#234d3d" }}>Bonifici associati ({importMsg.bonifici.length})</div>
                  <div style={{ fontSize: 13, color: "#2a3329", display: "flex", flexDirection: "column", gap: 2 }}>
                    {importMsg.bonifici.map((b, i) => (
                      <span key={i}>
                        {b.dipendente}: € {eur(b.importo)} → {mesi[b.mese - 1]} {b.anno}
                        <span style={{ color: "#6b7669" }}> [{b.fonte}]</span>
                        <span style={{ color: "#234d3d", fontWeight: 700 }}> · ✓ riconciliato PDF</span>
                        {b.discrepanza != null && <span style={{ color: "#7d5526" }}> (Excel attendeva € {eur(b.discrepanza)})</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {importMsg.tfr?.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: "#56442d" }}>Anticipi TFR ({importMsg.tfr.length}) — fuori dal saldo stipendi</div>
                  <div style={{ fontSize: 13, color: "#2a3329", display: "flex", flexDirection: "column", gap: 2 }}>
                    {importMsg.tfr.map((t, i) => (
                      <span key={i}>{t.dipendente}: € {eur(t.importo)} → {mesi[t.mese - 1]} {t.anno}</span>
                    ))}
                  </div>
                </div>
              )}
              {importMsg.prestiti?.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: "#6a4a86" }}>Prestiti ({importMsg.prestiti.length}) — mastrino separato dalle buste</div>
                  <div style={{ fontSize: 13, color: "#2a3329", display: "flex", flexDirection: "column", gap: 2 }}>
                    {importMsg.prestiti.map((p, i) => (
                      <span key={i}>{p.dipendente}: € {eur(p.importo)} → {mesi[p.mese - 1]} {p.anno} · <strong>saldo prestito € {eur(p.saldo)}</strong></span>
                    ))}
                  </div>
                </div>
              )}
              {importMsg.cartelle_lette?.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#6b7669" }}>
                  Cartelle email lette: {importMsg.cartelle_lette.map(c => `${c.cartella} (${c.messaggi})`).join(" · ")}
                </div>
              )}
              {importMsg.presenze?.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 13, color: "#56442d" }}>
                  Fogli presenze riconosciuti (non sono buste): {importMsg.presenze.map(p => `${p.dipendente}${p.mese ? ` ${mesi[p.mese - 1]} ${p.anno}` : ""}`).join("; ")}
                </div>
              )}
              {importMsg.duplicati?.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 13, color: "#8a6f47", background: "#f3ead9", border: "1px solid #e7d6b9", borderRadius: 8, padding: "6px 10px" }}>
                  🔁 Duplicati scartati automaticamente ({importMsg.duplicati.length}): {importMsg.duplicati.map(x => `${x.file} — ${x.motivo}`).join("; ")}
                </div>
              )}
              {importMsg.da_controllare?.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 13, color: "#7d5526" }}>
                  Da controllare: {importMsg.da_controllare.map(x => `${x.nome || x.cf} (${x.motivo})`).join("; ")}
                </div>
              )}
              {importMsg.errori?.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 12, color: "#8f3829" }}>
                  Avvisi: {importMsg.errori.join("; ")}
                </div>
              )}
              <button onClick={() => setImportMsg(null)} style={{ marginTop: 8, border: "none", background: "transparent", color: "#6b7669", textDecoration: "underline", cursor: "pointer", fontSize: 12 }}>chiudi</button>
            </div>
          )}
        </div>
      )}

      <div className="dc-buste-stats" style={{ marginBottom: 16 }}>
        <div className="dc-buste-stat dc-buste-stat-blue"><span className="dc-buste-stat-label">TOTALE BUSTE</span><span className="dc-buste-stat-value">€ {eur(totBuste)}</span></div>
        <div className="dc-buste-stat dc-buste-stat-green"><span className="dc-buste-stat-label">BONIFICI</span><span className="dc-buste-stat-value">€ {eur(totBonifici)}</span></div>
        <div className="dc-buste-stat dc-buste-stat-cyan"><span className="dc-buste-stat-label">ACCONTI</span><span className="dc-buste-stat-value">€ {eur(totAcconti)}</span></div>
        <div className="dc-buste-stat"><span className="dc-buste-stat-label">DIPENDENTI</span><span className="dc-buste-stat-value">{dipendenti.length}</span></div>
      </div>

      <h3 style={{ margin: "4px 0 10px" }}>✏️ Inserimento / modifica per dipendente <span className="dc-muted" style={{ fontWeight: 400, fontSize: 14 }}>· {mesi[mese - 1]} {anno}</span></h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {dipendenti.map(dip => {
          const d = get(dip.id);
          const acc = d.acconti || [];
          return (
            <div key={dip.id} className="dc-card" style={{ padding: 14 }}>
              <div className="dc-busta-row">
                <div className="dc-table-user dc-busta-user">
                  <Avatar nome={dip.nome} cognome={dip.cognome} size="sm" />
                  <span style={{ fontWeight: 600 }}>{dip.cognome ? `${dip.cognome} ${dip.nome || ''}` : dip.nome}</span>
                </div>

                <div className="dc-busta-field">
                  <label style={{ fontSize: 11, color: "#6b7669", fontWeight: 600, display: "flex", gap: 6, alignItems: "center" }}>
                    IMPORTO BUSTA €
                    {d.busta_riconciliata && <span style={{ background: "#e2efe8", color: "#234d3d", border: "1px solid #c2ddd0", borderRadius: 6, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>✓ riconciliata PDF</span>}
                  </label>
                  <input type="number" step="0.01" value={d.importo_busta} onChange={e => upd(dip.id, { importo_busta: e.target.value })} placeholder="0,00" style={{ ...inp, width: 120 }} />
                </div>

                <div className="dc-busta-field">
                  <label style={{ fontSize: 11, color: "#6b7669", fontWeight: 600, display: "flex", gap: 6, alignItems: "center" }}>
                    BONIFICO
                    {d.bonifico_riconciliato
                      ? <span title={d.bonifico_causale} style={{ background: "#e2efe8", color: "#234d3d", border: "1px solid #c2ddd0", borderRadius: 6, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>✓ riconciliato PDF</span>
                      : (d.bonifico_pdf ? <span title={d.bonifico_causale} style={{ background: "#f3ead9", color: "#56442d", border: "1px solid #e7d6b9", borderRadius: 6, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>PDF allegato</span> : null)}
                  </label>
                  <div className="dc-busta-inputs" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
                      <input type="checkbox" checked={d.bonifico_ricevuto} onChange={e => upd(dip.id, { bonifico_ricevuto: e.target.checked })} />
                      ricevuto
                    </label>
                    <input type="number" step="0.01" value={d.bonifico_importo} onChange={e => upd(dip.id, { bonifico_importo: e.target.value })} placeholder="€" style={{ ...inp, width: 100 }} />
                    <input type="date" value={d.bonifico_data || ""} onChange={e => upd(dip.id, { bonifico_data: e.target.value })} style={{ ...inp, width: 150 }} />
                  </div>
                </div>

                <div className="dc-busta-field dc-busta-acconti">
                  <label style={{ fontSize: 11, color: "#6b7669", fontWeight: 600 }}>ACCONTI (max 3)</label>
                  <div className="dc-busta-inputs" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    {acc.map((a, i) => (
                      <div key={i} className="dc-busta-acconto" style={{ display: "flex", alignItems: "center", gap: 4, background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 8, padding: "4px 6px" }}>
                        <input type="number" step="0.01" value={a.importo} onChange={e => setAcc(dip.id, i, { importo: e.target.value })} placeholder="€" style={{ ...inp, width: 80, padding: "5px 7px" }} />
                        <input type="date" value={a.data || ""} onChange={e => setAcc(dip.id, i, { data: e.target.value })} style={{ ...inp, width: 140, padding: "5px 7px" }} />
                        <button type="button" onClick={() => delAcc(dip.id, i)} title="Rimuovi acconto" style={{ border: "none", background: "transparent", color: "#d35f4e", cursor: "pointer", fontWeight: 700, fontSize: 16 }}>×</button>
                      </div>
                    ))}
                    {acc.length < 3 && <button type="button" onClick={() => addAcc(dip.id)} style={{ border: "1px dashed #9ca3af", background: "#fff", color: "#5b7a6b", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>+ acconto</button>}
                  </div>
                </div>

                <button type="button" onClick={() => salva(dip.id)} className="dc-busta-salva" style={{ background: salvato[dip.id] ? "#3d8168" : "#5b7a6b", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {salvato[dip.id] ? "✓ Salvato" : "Salva"}
                </button>
              </div>
              {(Number(d.acconto_cedolino) > 0 || Number(d.prestito_importo) > 0 || Number(d.tfr_anticipo_importo) > 0) && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTop: "1px dashed #e6e0d4" }}>
                  {Number(d.acconto_cedolino) > 0 && (
                    <span style={{ background: "#e8efe9", color: "#2a4d3a", border: "1px solid #cfe0d4", borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                      Acconto dal cedolino: € {eur(d.acconto_cedolino)}{Number(d.saldo_residuo) ? ` · saldo da pagare € ${eur(d.saldo_residuo)}` : ""}
                    </span>
                  )}
                  {Number(d.prestito_importo) > 0 && (
                    <span style={{ background: "#f3ead9", color: "#56442d", border: "1px solid #e7d6b9", borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                      Prestito {mesi[mese - 1]}: € {eur(d.prestito_importo)} · saldo € {eur(d.prestito_saldo)}
                    </span>
                  )}
                  {Number(d.tfr_anticipo_importo) > 0 && (
                    <span style={{ background: "#f3ead9", color: "#56442d", border: "1px solid #e7d6b9", borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                      Anticipo TFR: € {eur(d.tfr_anticipo_importo)} (fuori dal saldo)
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Cedolini & Bonifici — vista unica associazione busta ↔ bonifico pagato
function PagheBonificiPage() {
  const mesi = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  const annoCorr = new Date().getFullYear();
  const [anno, setAnno] = useState(annoCorr);
  const [mese, setMese] = useState(0); // 0 = tutto l'anno
  const [filtroStato, setFiltroStato] = useState("");
  const [data, setData] = useState({ righe: [], totali: {}, count: 0 });
  const [loading, setLoading] = useState(false);
  const [aperta, setAperta] = useState(null); // chiave riga espansa
  const [busy, setBusy] = useState(null);

  const eur = (n) => (Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const keyOf = (r) => `${r.dipendente_id}_${r.anno}_${r.mese}`;

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (anno) params.set("anno", anno);
      if (mese) params.set("mese", mese);
      if (filtroStato) params.set("stato", filtroStato);
      const r = await axios.get(`${API}/paghe/associazioni-bonifici?${params.toString()}`);
      setData(r.data || { righe: [], totali: {}, count: 0 });
    } catch (e) {
      console.error(e);
      setData({ righe: [], totali: {}, count: 0 });
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [anno, mese, filtroStato]);

  const conferma = async (r, val) => {
    setBusy(keyOf(r));
    try {
      await axios.post(`${API}/paghe/conferma-associazione`, {
        dipendente_id: r.dipendente_id, anno: r.anno, mese: r.mese, riconciliato: val,
      });
      await load();
    } catch (e) { alert(e?.response?.data?.detail || "Errore conferma"); }
    finally { setBusy(null); }
  };

  const t = data.totali || {};
  const STATI = {
    pagato: { label: "✓ Pagato", variant: "success" },
    parziale: { label: "Parziale", variant: "warning" },
    da_pagare: { label: "Da pagare", variant: "danger" },
    bonifico_senza_busta: { label: "Bonifico senza busta", variant: "info" },
  };
  const QUALITA = {
    esatto: { txt: "Match esatto", col: "#234d3d", bg: "#e2efe8", bd: "#c2ddd0" },
    per_importo: { txt: "Match per importo", col: "#234d3d", bg: "#e2efe8", bd: "#c2ddd0" },
    aggregato: { txt: "Più bonifici", col: "#56442d", bg: "#f3ead9", bd: "#e7d6b9" },
    da_verificare: { txt: "Da verificare", col: "#7a3b32", bg: "#f6e4e1", bd: "#e8c5bf" },
  };
  const FONTI = { banca: "Estratto/CSV banca", prima_nota: "Prima nota", manuale: "Inserito a mano" };

  const cardWrap = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 };
  const card = { background: "#fffefb", border: "1px solid #e6e0d4", borderRadius: 12, padding: "12px 14px" };
  const lbl = { fontSize: 11, color: "#7a8576", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700 };
  const val = { fontSize: 20, fontWeight: 800, color: "#2a3329", marginTop: 4 };
  const sel = { border: "1px solid #e6e0d4", borderRadius: 8, padding: "7px 10px", fontSize: 14, background: "#fffefb", color: "#2a3329" };
  const th = { textAlign: "left", padding: "10px 12px", fontSize: 11, color: "#7a8576", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700, borderBottom: "2px solid #e6e0d4", whiteSpace: "nowrap" };
  const td = { padding: "10px 12px", fontSize: 14, color: "#2a3329", borderBottom: "1px solid #efe9dd", verticalAlign: "top" };

  return (
    <div style={{ maxWidth: 1280 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: "#2a3329" }}>Cedolini &amp; Bonifici</h2>
        <p className="dc-muted" style={{ marginTop: 4 }}>
          Per ogni busta vedi se il <b>bonifico è stato effettuato</b> e a quale cedolino è associato.
          Dati dal sistema unico paghe (busta) + pagamenti reali della banca (bonifici).
        </p>
      </div>

      {/* Filtri */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <select style={sel} value={anno} onChange={e => setAnno(Number(e.target.value))}>
          {Array.from({ length: 8 }, (_, i) => annoCorr - i).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select style={sel} value={mese} onChange={e => setMese(Number(e.target.value))}>
          <option value={0}>Tutto l'anno</option>
          {mesi.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select style={sel} value={filtroStato} onChange={e => setFiltroStato(e.target.value)}>
          <option value="">Tutti gli stati</option>
          <option value="pagato">Pagati</option>
          <option value="parziale">Parziali</option>
          <option value="da_pagare">Da pagare</option>
          <option value="bonifico_senza_busta">Bonifico senza busta</option>
        </select>
        <button className="dc-btn" onClick={load} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={15} /> Aggiorna
        </button>
      </div>

      {/* Riepilogo */}
      <div style={cardWrap}>
        <div style={card}><div style={lbl}>Totale buste</div><div style={val}>€ {eur(t.buste)}</div></div>
        <div style={card}><div style={lbl}>Bonifici</div><div style={{ ...val, color: "#3d8168" }}>€ {eur(t.bonifici)}</div></div>
        <div style={card}><div style={lbl}>Saldo da pagare</div><div style={{ ...val, color: (t.saldo > 0.5 ? "#b04a3a" : "#3d8168") }}>€ {eur(t.saldo)}</div></div>
        <div style={card}><div style={lbl}>Pagati</div><div style={{ ...val, color: "#3d8168" }}>{t.pagati || 0}</div></div>
        <div style={card}><div style={lbl}>Da pagare</div><div style={{ ...val, color: "#b04a3a" }}>{t.da_pagare || 0}</div></div>
        <div style={card}><div style={lbl}>Da verificare</div><div style={{ ...val, color: "#7a3b32" }}>{t.da_verificare || 0}</div></div>
      </div>

      {/* Tabella */}
      <div style={{ background: "#fffefb", border: "1px solid #e6e0d4", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Dipendente</th>
                <th style={th}>Periodo</th>
                <th style={{ ...th, textAlign: "right" }}>Busta</th>
                <th style={{ ...th, textAlign: "right" }}>Bonifico</th>
                <th style={{ ...th, textAlign: "right" }}>Saldo</th>
                <th style={th}>Stato</th>
                <th style={th}>Associazione</th>
                <th style={th}>Cedolino</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td style={td} colSpan={9}>Caricamento…</td></tr>}
              {!loading && data.righe.length === 0 && <tr><td style={td} colSpan={9}>Nessuna busta per il periodo selezionato.</td></tr>}
              {!loading && data.righe.map(r => {
                const k = keyOf(r);
                const exp = aperta === k;
                const stInfo = STATI[r.stato] || { label: r.stato, variant: "default" };
                const qInfo = r.qualita ? QUALITA[r.qualita] : null;
                const periodoLbl = (r.mese >= 1 && r.mese <= 12) ? `${mesi[r.mese - 1]} ${r.anno}` : `${r.mese}/${r.anno}`;
                return (
                  <Fragment key={k}>
                    <tr style={{ background: exp ? "#f7f4ec" : "transparent" }}>
                      <td style={{ ...td, fontWeight: 600 }}>{r.dipendente}</td>
                      <td style={td}>{periodoLbl}</td>
                      <td style={{ ...td, textAlign: "right" }}>{r.busta > 0 ? `€ ${eur(r.busta)}` : "—"}</td>
                      <td style={{ ...td, textAlign: "right", color: r.bonifico > 0 ? "#3d8168" : "#9aa295", fontWeight: 600 }}>
                        {r.bonifico > 0 ? `€ ${eur(r.bonifico)}` : "—"}
                        {r.fonte && <div style={{ fontSize: 10, color: "#9aa295", fontWeight: 400 }}>{FONTI[r.fonte] || r.fonte}</div>}
                      </td>
                      <td style={{ ...td, textAlign: "right", color: r.saldo > 0.5 ? "#b04a3a" : "#3d8168" }}>
                        {Math.abs(r.saldo) > 0.5 ? `€ ${eur(r.saldo)}` : "✓"}
                      </td>
                      <td style={td}><Badge variant={stInfo.variant}>{stInfo.label}</Badge></td>
                      <td style={td}>
                        {r.riconciliato
                          ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#234d3d", fontWeight: 700, fontSize: 12 }}><CheckCircle2 size={14} /> Confermata</span>
                          : qInfo
                            ? <span style={{ background: qInfo.bg, color: qInfo.col, border: `1px solid ${qInfo.bd}`, borderRadius: 6, padding: "2px 7px", fontSize: 11, fontWeight: 700 }}>{qInfo.txt}</span>
                            : <span style={{ color: "#9aa295", fontSize: 12 }}>—</span>}
                      </td>
                      <td style={td}>
                        {r.cedolino_pdf
                          ? <span style={{ color: "#234d3d", fontSize: 12, fontWeight: 600 }}>PDF ✓</span>
                          : <span style={{ color: "#9aa295", fontSize: 12 }}>no PDF</span>}
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        {(r.n_bonifici > 0) && (
                          <button className="dc-btn" onClick={() => setAperta(exp ? null : k)} style={{ fontSize: 12, padding: "4px 8px" }}>
                            {exp ? "Nascondi" : `Dettagli (${r.n_bonifici})`}
                          </button>
                        )}
                        {(r.bonifico > 0 || r.stato === "bonifico_senza_busta") && (
                          r.riconciliato
                            ? <button className="dc-btn" disabled={busy === k} onClick={() => conferma(r, false)} style={{ fontSize: 12, padding: "4px 8px", marginLeft: 6 }}>Annulla</button>
                            : <button className="dc-btn" disabled={busy === k} onClick={() => conferma(r, true)} style={{ fontSize: 12, padding: "4px 8px", marginLeft: 6 }}>Conferma</button>
                        )}
                      </td>
                    </tr>
                    {exp && r.bonifici.length > 0 && (
                      <tr>
                        <td style={{ ...td, background: "#f7f4ec" }} colSpan={9}>
                          <div style={{ fontSize: 11, color: "#7a8576", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Bonifici realmente pagati</div>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr>
                                <th style={{ ...th, borderBottom: "1px solid #e6e0d4" }}>Data</th>
                                <th style={{ ...th, borderBottom: "1px solid #e6e0d4", textAlign: "right" }}>Importo</th>
                                <th style={{ ...th, borderBottom: "1px solid #e6e0d4" }}>Causale</th>
                                <th style={{ ...th, borderBottom: "1px solid #e6e0d4" }}>Beneficiario</th>
                                <th style={{ ...th, borderBottom: "1px solid #e6e0d4" }}>Riferimento</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.bonifici.map((b, i) => (
                                <tr key={i}>
                                  <td style={{ ...td, borderBottom: "none" }}>{b.data || "—"}</td>
                                  <td style={{ ...td, borderBottom: "none", textAlign: "right", color: "#3d8168", fontWeight: 600 }}>€ {eur(b.importo)}</td>
                                  <td style={{ ...td, borderBottom: "none", fontSize: 13 }}>{b.causale || "—"}</td>
                                  <td style={{ ...td, borderBottom: "none", fontSize: 13 }}>{b.beneficiario || "—"}</td>
                                  <td style={{ ...td, borderBottom: "none", fontSize: 12, color: "#7a8576" }}>{b.riferimento || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="dc-muted" style={{ fontSize: 12, marginTop: 10 }}>
        <b>Match esatto/per importo</b> = il bonifico combacia con la busta. <b>Da verificare</b> = importo presente senza prova bancaria (inserito a mano o da prima nota): controlla e premi <b>Conferma</b> per associarlo definitivamente al cedolino.
      </p>
    </div>
  );
}

// Missioni Page
function MissioniPage({ dipendenti, missioni, reload, getDipendente }) {
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    dipendente_id: "", destinazione: "", data_inizio: "", data_fine: "", scopo: "", rimborso: 0
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    await axios.post(`${API}/missioni`, formData);
    setShowModal(false);
    reload();
  };

  const handleApprova = async (id) => {
    await axios.put(`${API}/missioni/${id}/approva`);
    reload();
  };

  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <div>
          <h1>Missioni & Trasferte</h1>
          <p>Gestione missioni e trasferte dipendenti</p>
        </div>
        <button onClick={() => setShowModal(true)} className="dc-btn dc-btn-primary">
          <Plus size={18} /> Nuova Missione
        </button>
      </div>

      <div className="dc-card">
        <table className="dc-table dc-table--cards">
          <thead>
            <tr>
              <th>DIPENDENTE</th>
              <th>DESTINAZIONE</th>
              <th>PERIODO</th>
              <th>RIMBORSO</th>
              <th>STATO</th>
              <th>AZIONI</th>
            </tr>
          </thead>
          <tbody>
            {missioni.map((m) => {
              const dip = getDipendente(m.dipendente_id);
              return (
                <tr key={m.id}>
                  <td>
                    <div className="dc-table-user">
                      <Avatar nome={dip?.nome} cognome={dip?.cognome} size="sm" />
                      <span>{dip?.nome} {dip?.cognome}</span>
                    </div>
                  </td>
                  <td data-label="Destinazione">{m.destinazione}</td>
                  <td data-label="Periodo">{formatDate(m.data_inizio)} - {formatDate(m.data_fine)}</td>
                  <td data-label="Rimborso">€ {m.rimborso?.toFixed(2)}</td>
                  <td data-label="Stato"><Badge variant={m.stato === 'approvata' ? 'success' : 'warning'}>{m.stato}</Badge></td>
                  <td data-label="Azioni" className="dc-table-actions">
                    {m.stato === 'in_attesa' && (
                      <button onClick={() => handleApprova(m.id)} className="dc-btn-icon dc-btn-success"><Check size={16} /></button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="dc-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="dc-modal" onClick={e => e.stopPropagation()}>
            <div className="dc-modal-header">
              <h3>Nuova Missione</h3>
              <button onClick={() => setShowModal(false)} className="dc-modal-close"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="dc-modal-body">
              <div className="dc-form-group">
                <label>Dipendente *</label>
                <select required value={formData.dipendente_id} onChange={e => setFormData({...formData, dipendente_id: e.target.value})}>
                  <option value="">Seleziona...</option>
                  {dipendenti.map(d => <option key={d.id} value={d.id}>{d.nome} {d.cognome}</option>)}
                </select>
              </div>
              <div className="dc-form-group">
                <label>Destinazione *</label>
                <input required value={formData.destinazione} onChange={e => setFormData({...formData, destinazione: e.target.value})} />
              </div>
              <div className="dc-form-row">
                <div className="dc-form-group">
                  <label>Data Inizio</label>
                  <input type="date" required value={formData.data_inizio} onChange={e => setFormData({...formData, data_inizio: e.target.value})} />
                </div>
                <div className="dc-form-group">
                  <label>Data Fine</label>
                  <input type="date" required value={formData.data_fine} onChange={e => setFormData({...formData, data_fine: e.target.value})} />
                </div>
              </div>
              <div className="dc-form-group">
                <label>Scopo</label>
                <input value={formData.scopo} onChange={e => setFormData({...formData, scopo: e.target.value})} />
              </div>
              <div className="dc-form-group">
                <label>Rimborso €</label>
                <input type="number" min="0" value={formData.rimborso} onChange={e => setFormData({...formData, rimborso: +e.target.value})} />
              </div>
              <div className="dc-modal-footer">
                <button type="button" onClick={() => setShowModal(false)} className="dc-btn">Annulla</button>
                <button type="submit" className="dc-btn dc-btn-primary">Crea Missione</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Documenti Page
function DocumentiPage({ dipendenti, documenti, reload, getDipendente }) {
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    dipendente_id: "", titolo: "", tipo: "Contratto", scadenza: ""
  });
  const massRef = useRef(null);
  const [massBusy, setMassBusy] = useState(false);
  const [massMsg, setMassMsg] = useState(null);
  const ETICHETTA = { UNILAV: "Unilav", CERTIFICAZIONE_UNICA: "Certificazione Unica (CU)", CONTRATTO: "Contratti", BONIFICO: "Bonifici", CODICE_FISCALE: "Codice fiscale / Tessera sanitaria", CARTA_IDENTITA: "Carta d'identità", BUSTA_PAGA: "Buste paga", ALTRO: "Da classificare" };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await axios.post(`${API}/documenti`, formData);
    setShowModal(false);
    reload();
  };

  const handleMassUpload = async (e) => {
    const fs = Array.from(e.target.files || []);
    if (!fs.length) return;
    setMassBusy(true); setMassMsg(null);
    try {
      const fd = new FormData();
      fs.forEach(f => fd.append("files", f));
      const r = await axios.post(`${API}/documenti/upload-massivo`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setMassMsg(r.data);
      reload();
    } catch (err) {
      setMassMsg({ errore: err?.response?.data?.detail || "Errore upload" });
    } finally {
      setMassBusy(false);
      if (massRef.current) massRef.current.value = "";
    }
  };

  const apriDoc = async (doc) => {
    try {
      const r = await axios.get(`${API}/documenti/${doc.id}/file`, { responseType: "blob" });
      window.open(URL.createObjectURL(r.data), "_blank");
    } catch { alert("Impossibile aprire il documento (file non disponibile)."); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Eliminare questo documento?")) return;
    await axios.delete(`${API}/documenti/${id}`);
    reload();
  };

  // Raggruppa i documenti in cartelle per tipo (categoria)
  const cartelle = {};
  (documenti || []).forEach(d => { const k = d.categoria || d.tipo || "ALTRO"; (cartelle[k] = cartelle[k] || []).push(d); });

  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <div>
          <h1>Documenti Dipendenti</h1>
          <p>Archivio documenti e certificati</p>
        </div>
        <div className="dc-page-actions">
          <input ref={massRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.zip,.docx" onChange={handleMassUpload} style={{ display: "none" }} />
          <button onClick={() => massRef.current?.click()} disabled={massBusy} className="dc-btn dc-btn-primary" title="Carica più documenti: l'app riconosce il tipo e li mette nella cartella del dipendente">
            {massBusy ? "Carico…" : "📂 Carica documenti (auto)"}
          </button>
          <button onClick={() => setShowModal(true)} className="dc-btn">
            <Plus size={18} /> Nuovo Documento
          </button>
        </div>
      </div>

      {massMsg && (
        <div className="dc-card" style={{ marginBottom: 16, borderLeft: `4px solid ${massMsg.errore ? '#d35f4e' : '#3d8168'}` }}>
          {massMsg.errore ? <div style={{ color: "#d35f4e", fontWeight: 600 }}>⚠ {massMsg.errore}</div> : (
            <div style={{ fontSize: 14 }}>
              <div style={{ fontWeight: 700 }}>✓ Caricati {massMsg.caricati} documenti{massMsg.duplicati?.length ? ` · ${massMsg.duplicati.length} duplicati saltati` : ""}{massMsg.non_assegnati?.length ? ` · ${massMsg.non_assegnati.length} senza dipendente` : ""}</div>
              <div style={{ marginTop: 6, color: "#6b7669" }}>Per tipo: {Object.entries(massMsg.per_categoria || {}).map(([k, v]) => `${ETICHETTA[k] || k} (${v})`).join(" · ")}</div>
              {massMsg.non_assegnati?.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 13, color: "#7d5526" }}>⚠ Da assegnare a mano (nessun codice fiscale/nome riconosciuto): {massMsg.non_assegnati.map(x => x.file).join(", ")}</div>
              )}
            </div>
          )}
        </div>
      )}

      {Object.keys(cartelle).length === 0 && (
        <div className="dc-card dc-muted">Nessun documento. Usa “📂 Carica documenti (auto)” per caricarne in blocco: l'app riconosce il tipo e li smista nelle cartelle dei dipendenti.</div>
      )}
      {Object.keys(cartelle).sort((a, b) => (a === "ALTRO" ? 1 : b === "ALTRO" ? -1 : a.localeCompare(b))).map(cat => (
        <div key={cat} className="dc-card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>📁 {ETICHETTA[cat] || cat} <span className="dc-muted" style={{ fontWeight: 400 }}>· {cartelle[cat].length}</span></h3>
          <div style={{ overflowX: "auto" }}>
            <table className="dc-table" style={{ minWidth: 520 }}>
              <thead><tr><th>Documento</th><th>Dipendente</th><th>Caricato</th><th></th></tr></thead>
              <tbody>
                {cartelle[cat].map(doc => {
                  const dip = getDipendente(doc.dipendente_id);
                  const nome = doc.dipendente_nome || (dip ? `${dip.cognome || ''} ${dip.nome || ''}`.trim() : null);
                  return (
                    <tr key={doc.id}>
                      <td>{doc.titolo || doc.filename}</td>
                      <td>{nome || <span className="dc-muted">⚠ non assegnato</span>}</td>
                      <td className="dc-muted">{doc.data_caricamento ? formatDate(doc.data_caricamento) : "—"}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {doc.file_data || doc.hash ? <button onClick={() => apriDoc(doc)} className="dc-btn" style={{ padding: "4px 10px" }}>Apri</button> : null}
                        <button onClick={() => handleDelete(doc.id)} className="dc-btn-icon dc-btn-danger" style={{ marginLeft: 6 }}><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {showModal && (
        <div className="dc-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="dc-modal" onClick={e => e.stopPropagation()}>
            <div className="dc-modal-header">
              <h3>Nuovo Documento</h3>
              <button onClick={() => setShowModal(false)} className="dc-modal-close"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="dc-modal-body">
              <div className="dc-form-group">
                <label>Dipendente *</label>
                <select required value={formData.dipendente_id} onChange={e => setFormData({...formData, dipendente_id: e.target.value})}>
                  <option value="">Seleziona...</option>
                  {dipendenti.map(d => <option key={d.id} value={d.id}>{d.nome} {d.cognome}</option>)}
                </select>
              </div>
              <div className="dc-form-group">
                <label>Titolo *</label>
                <input required value={formData.titolo} onChange={e => setFormData({...formData, titolo: e.target.value})} />
              </div>
              <div className="dc-form-group">
                <label>Tipo</label>
                <select value={formData.tipo} onChange={e => setFormData({...formData, tipo: e.target.value})}>
                  <option>Contratto</option>
                  <option>CUD</option>
                  <option>Certificato</option>
                  <option>Altro</option>
                </select>
              </div>
              <div className="dc-form-group">
                <label>Scadenza</label>
                <input type="date" value={formData.scadenza} onChange={e => setFormData({...formData, scadenza: e.target.value})} />
              </div>
              <div className="dc-modal-footer">
                <button type="button" onClick={() => setShowModal(false)} className="dc-btn">Annulla</button>
                <button type="submit" className="dc-btn dc-btn-primary">Salva Documento</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Assunzione & Contratti =====
function AssunzionePage({ dipendenti, reload }) {
  const C = "/api/contracts";
  const [tipi, setTipi] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [dipId, setDipId] = useState("");
  const [tipo, setTipo] = useState("");
  const [extra, setExtra] = useState({
    indirizzo: "", luogo_nascita: "", data_nascita: "", codice_fiscale: "",
    mansione: "", livello: "", qualifica: "", stipendio_orario: "", data_inizio: "", data_fine: "",
    ore_settimanali: "40", periodo_prova: "", ferie_giorni: "26",
    tredicesima: true, quattordicesima: true, ticket_buono: false, ticket_importo: "",
  });
  const MANSIONI = ["Barista", "Banconista", "Cameriere", "Aiuto Cameriere", "Cassiere",
    "Pasticciere", "Aiuto Pasticciere", "Rosticciere", "Cuoco", "Aiuto Cuoco",
    "Lavapiatti", "Addetto alle pulizie", "Magazziniere", "Operaio"];
  const [contratti, setContratti] = useState([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [bulkRes, setBulkRes] = useState(null);
  const [showAssumi, setShowAssumi] = useState(false);
  const NUOVO0 = {
    nome: "", cognome: "", codice_fiscale: "", data_nascita: "", luogo_nascita: "",
    indirizzo: "", email: "", telefono: "", data_assunzione: "", contract_type: "indeterminato",
    mansione: "", qualifica: "", livello: "", stipendio_orario: "", ore_settimanali: "40",
    periodo_prova: "", ferie_giorni: "26", data_fine: "",
  };
  const [nuovo, setNuovo] = useState(NUOVO0);
  const setN = (k, v) => setNuovo(n => ({ ...n, [k]: v }));

  const loadTemplates = () => axios.get(`${C}/templates`).then(r => setTemplates(r.data || [])).catch(() => {});
  useEffect(() => {
    axios.get(`${C}/types`).then(r => { setTipi(r.data || []); if (r.data?.[0]) setTipo(r.data[0].id); }).catch(() => {});
    loadTemplates();
  }, []);
  const loadContratti = (id) => { if (id) axios.get(`${C}/employee/${id}`).then(r => setContratti(r.data || [])).catch(() => setContratti([])); else setContratti([]); };
  useEffect(() => {
    loadContratti(dipId);
    // Precompila i dati anagrafici dal dipendente selezionato (così l'indirizzo
    // o la data di nascita già presenti compaiono e i campi mancanti si vedono).
    const d = dipendenti.find(x => x.id === dipId);
    if (d) setExtra(e => ({
      ...e,
      indirizzo: d.indirizzo || d.residenza || "",
      luogo_nascita: d.luogo_nascita || d.comune_nascita || d.citta_nascita || "",
      data_nascita: (d.data_nascita || "").slice(0, 10),
      codice_fiscale: d.codice_fiscale || d.cf || "",
      mansione: d.mansione || d.qualifica || "",
      qualifica: d.qualifica || d.mansione || "",
      livello: d.livello || e.livello,
      stipendio_orario: d.stipendio_orario || d.salary || e.stipendio_orario,
    }));
  }, [dipId]);

  const dispTemplate = (id) => (templates.find(t => t.id === id) || {}).available;

  const uploadTemplate = async (tid, ev) => {
    const file = ev.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    setBusy("tpl-" + tid);
    try { await axios.post(`${C}/template/${tid}`, fd, { headers: { "Content-Type": "multipart/form-data" } }); await loadTemplates(); setMsg("Template caricato."); }
    catch (e) { setMsg(e?.response?.data?.detail || "Errore caricamento template"); }
    setBusy(""); ev.target.value = "";
  };
  const genera = async () => {
    if (!dipId || !tipo) { setMsg("Seleziona dipendente e tipo contratto."); return; }
    if (!dispTemplate(tipo)) { setMsg("Carica prima il template di questo tipo."); return; }
    setBusy("gen"); setMsg("");
    try {
      const r = await axios.post(`${C}/generate/${dipId}`, { contract_type: tipo, additional_data: extra });
      const m = r.data?.stipendio_mensile;
      setMsg(m != null ? `Contratto generato. Lordo mensile teorico: € ${Number(m).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.` : "Contratto generato.");
      const acc = (r.data?.accessori_mancanti || []);
      const note = m != null ? ` Lordo mensile: € ${Number(m).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.` : "";
      const warn = acc.length ? ` ⚠ Template accessori mancanti: ${acc.join(", ")}.` : " Generati anche regolamento, privacy e informativa.";
      setMsg(`Contratto generato.${note}${warn}`);
      loadContratti(dipId);
    } catch (e) { setMsg(e?.response?.data?.detail || "Errore generazione"); }
    setBusy("");
  };
  const generaMassivo = async () => {
    if (!window.confirm("Genero i contratti (bozze) per tutti i dipendenti in forza, deducendo tipo e dati dalle buste paga? Chi ha già un contratto viene saltato. Nessun invio.")) return;
    setBusy("bulk"); setMsg(""); setBulkRes(null);
    try {
      const r = await axios.post(`${C}/genera-massivo`, {});
      setBulkRes(r.data);
      setMsg(`Generati ${r.data.generati}, saltati ${r.data.saltati}.`);
      reload && reload();
    } catch (e) { setMsg(e?.response?.data?.detail || "Errore generazione massiva"); }
    setBusy("");
  };
  const creaAssumi = async () => {
    if (!nuovo.nome || !nuovo.cognome) { setMsg("Nome e cognome sono obbligatori."); return; }
    if (!dispTemplate(nuovo.contract_type)) { setMsg("Carica prima il template di questo tipo di contratto."); return; }
    setBusy("assumi"); setMsg("");
    try {
      const dipPayload = {
        nome: nuovo.nome, cognome: nuovo.cognome, codice_fiscale: nuovo.codice_fiscale || null,
        data_nascita: nuovo.data_nascita || null, indirizzo: nuovo.indirizzo || null,
        email: nuovo.email || null, telefono: nuovo.telefono || null,
        data_assunzione: nuovo.data_assunzione || null, ruolo: nuovo.mansione || null,
        contratto: nuovo.contract_type.includes("determinato") && !nuovo.contract_type.includes("ind") ? "Determinato" : "Indeterminato",
        data_fine_contratto: nuovo.data_fine || null,
      };
      const cr = await axios.post(`${API}/dipendenti`, dipPayload);
      const newId = cr.data?.id || cr.data?.dipendente?.id || cr.data?._id;
      if (!newId) throw new Error("ID nuovo dipendente non disponibile");
      const additional = {
        indirizzo: nuovo.indirizzo, luogo_nascita: nuovo.luogo_nascita, data_nascita: nuovo.data_nascita,
        codice_fiscale: nuovo.codice_fiscale, mansione: nuovo.mansione, qualifica: nuovo.qualifica || nuovo.mansione,
        livello: nuovo.livello, stipendio_orario: nuovo.stipendio_orario, ore_settimanali: nuovo.ore_settimanali,
        periodo_prova: nuovo.periodo_prova, ferie_giorni: nuovo.ferie_giorni,
        data_inizio: nuovo.data_assunzione, data_fine: nuovo.data_fine,
      };
      const gr = await axios.post(`${C}/generate/${newId}`, { contract_type: nuovo.contract_type, additional_data: additional });
      const acc = (gr.data?.accessori_mancanti || []);
      setShowAssumi(false); setNuovo(NUOVO0);
      setMsg(`Dipendente assunto e contratto generato.${acc.length ? ` ⚠ Template accessori mancanti: ${acc.join(", ")}.` : " Con regolamento, privacy e informativa."}`);
      reload && reload();
    } catch (e) { setMsg(e?.response?.data?.detail || e.message || "Errore in fase di assunzione"); }
    setBusy("");
  };
  const scarica = async (cid, fname) => {
    try { const r = await axios.get(`${C}/download/${cid}`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data); const a = document.createElement("a"); a.href = url; a.download = fname || "contratto.docx"; a.click(); URL.revokeObjectURL(url);
    } catch { setMsg("Download non disponibile"); }
  };
  const invia = async (cid) => {
    setBusy("send-" + cid); setMsg("");
    try { const r = await axios.post(`${C}/send/${cid}`, {});
      const miss = (r.data.accessori_mancanti || []);
      const avviso = miss.length ? ` ⚠ Non ancora generati per questo dipendente: ${miss.join(", ")}.` : "";
      setMsg(`Inviato a ${r.data.inviato_a}: ${(r.data.documenti || []).join(", ")}.${avviso}`); loadContratti(dipId);
    } catch (e) { setMsg(e?.response?.data?.detail || "Errore invio email"); }
    setBusy("");
  };
  const caricaFirmato = async (cid, ev) => {
    const file = ev.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    setBusy("cf-" + cid); setMsg("");
    try { await axios.post(`${C}/carica-firmato/${cid}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setMsg("Contratto firmato dal dipendente caricato. Ora controfirma e invia il definitivo."); loadContratti(dipId);
    } catch (e) { setMsg(e?.response?.data?.detail || "Errore caricamento firmato"); }
    setBusy(""); ev.target.value = "";
  };
  const finalizza = async (cid, ev) => {
    const file = ev?.target?.files?.[0];
    if (!file && !window.confirm("Finalizzare usando il PDF firmato dal dipendente come definitivo (senza un file controfirmato separato)?")) return;
    const fd = new FormData(); if (file) fd.append("file", file);
    setBusy("fz-" + cid); setMsg("");
    try { const r = await axios.post(`${C}/finalizza/${cid}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      const dest = (r.data.inviato_a || []).join(", ");
      setMsg(`Contratto definitivo archiviato nel fascicolo${dest ? ` e inviato a ${dest}` : ""}.`); loadContratti(dipId); reload && reload();
    } catch (e) { setMsg(e?.response?.data?.detail || "Errore finalizzazione"); }
    setBusy(""); if (ev?.target) ev.target.value = "";
  };
  const scaricaPdf = async (cid, versione) => {
    try { const r = await axios.get(`${C}/pdf/${cid}/${versione}`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data); const a = document.createElement("a"); a.href = url; a.download = `contratto_${versione}.pdf`; a.click(); URL.revokeObjectURL(url);
    } catch { setMsg("PDF non disponibile"); }
  };
  const ITER = {
    bozza: ["Bozza", "#6b7669", "#eef1ec"],
    inviata: ["Inviata al dipendente", "#c4894a", "#fdf0dd"],
    firmato_dipendente: ["Firmata dal dipendente", "#3d8168", "#e7f6ec"],
    definitivo: ["Definitivo · in fascicolo", "#2a3329", "#dfeede"],
  };

  const dip = dipendenti.find(d => d.id === dipId);
  const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? null : n; };
  const orario = num(extra.stipendio_orario), ore = num(extra.ore_settimanali);
  const mensile = (orario != null && ore != null) ? (orario * ore * 52 / 12) : null;
  const mensileFmt = mensile != null ? mensile.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
  const set = (k, v) => setExtra(e => ({ ...e, [k]: v }));
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, alignItems: "end" };
  const lbl = { display: "flex", flexDirection: "column", gap: 5, fontSize: 13, fontWeight: 600, color: "#2a3329" };
  const secTitle = { gridColumn: "1 / -1", margin: "12px 0 -2px", fontSize: 12, fontWeight: 800, color: "#5b7a6b", textTransform: "uppercase", letterSpacing: ".05em" };
  const full = { ...lbl, gridColumn: "1 / -1" };
  return (
    <div className="dc-page">
      <div className="dc-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div><h1>Assunzione & Contratti</h1>
          <p>Carica i modelli, genera il contratto (con regolamento, privacy e informativa) e invialo</p></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="dc-btn-primary" onClick={() => { setNuovo(NUOVO0); setShowAssumi(true); }}>+ Assumi dipendente</button>
          <button className="dc-btn" disabled={busy === "bulk"} onClick={generaMassivo}>{busy === "bulk" ? "Genero…" : "Genera per i dipendenti in forza"}</button>
        </div>
      </div>

      {msg && <div style={{ background: "#eef3ef", border: "1px solid #d9e4dc", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>{msg}</div>}

      {bulkRes && (
        <div className="dc-card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Generazione massiva — generati {bulkRes.generati}, saltati {bulkRes.saltati}</h3>
          {(bulkRes.dettaglio || []).length > 0 && (
            <div style={{ fontSize: 13 }}>{bulkRes.dettaglio.map((d, i) => (
              <div key={i} style={{ borderTop: "1px solid #eee", padding: "4px 0" }}>✓ <b>{d.dipendente}</b> · {d.tipo}{d.dati_da_busta ? " · dati da busta" : " · dati anagrafica"}{(d.accessori_mancanti || []).length ? ` · ⚠ accessori mancanti: ${d.accessori_mancanti.join(", ")}` : ""}</div>
            ))}</div>
          )}
          {(bulkRes.non_generati || []).length > 0 && (
            <div style={{ fontSize: 13, marginTop: 8 }}>{bulkRes.non_generati.map((d, i) => (
              <div key={i} style={{ borderTop: "1px solid #eee", padding: "4px 0", color: "#9a6b4a" }}>— {d.dipendente}: {d.motivo}</div>
            ))}</div>
          )}
        </div>
      )}

      {showAssumi && (
        <div onClick={() => setShowAssumi(false)} style={{ position: "fixed", inset: 0, background: "rgba(42,51,41,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, zIndex: 50, overflow: "auto" }}>
          <div onClick={e => e.stopPropagation()} className="dc-card" style={{ maxWidth: 720, width: "100%", marginTop: 20 }}>
            <h3 style={{ marginTop: 0 }}>Assumi dipendente</h3>
            <p className="dc-muted" style={{ fontSize: 13, marginTop: 0 }}>Crea l'anagrafica e genera subito contratto + regolamento + privacy + informativa (nessun invio automatico).</p>
            <div style={grid}>
              <label style={lbl}>Nome *<input className="dc-input" value={nuovo.nome} onChange={e => setN("nome", e.target.value)} /></label>
              <label style={lbl}>Cognome *<input className="dc-input" value={nuovo.cognome} onChange={e => setN("cognome", e.target.value)} /></label>
              <label style={lbl}>Codice fiscale<input className="dc-input" value={nuovo.codice_fiscale} onChange={e => setN("codice_fiscale", e.target.value.toUpperCase())} /></label>
              <label style={lbl}>Luogo di nascita<input className="dc-input" value={nuovo.luogo_nascita} onChange={e => setN("luogo_nascita", e.target.value)} /></label>
              <label style={lbl}>Data di nascita<input type="date" className="dc-input" value={nuovo.data_nascita} onChange={e => setN("data_nascita", e.target.value)} /></label>
              <label style={full}>Indirizzo di residenza<input className="dc-input" value={nuovo.indirizzo} onChange={e => setN("indirizzo", e.target.value)} placeholder="Via/Piazza, n., CAP, Comune" /></label>
              <label style={lbl}>Email<input className="dc-input" value={nuovo.email} onChange={e => setN("email", e.target.value)} /></label>
              <label style={lbl}>Telefono<input className="dc-input" value={nuovo.telefono} onChange={e => setN("telefono", e.target.value)} /></label>

              <div style={secTitle}>Contratto</div>
              <label style={lbl}>Tipo contratto
                <select className="dc-input" value={nuovo.contract_type} onChange={e => setN("contract_type", e.target.value)}>
                  {tipi.filter(t => ["indeterminato", "determinato", "part_time_det", "part_time_ind"].includes(t.id)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select></label>
              <label style={lbl}>Mansione<input list="mansioni-list" className="dc-input" value={nuovo.mansione} onChange={e => setN("mansione", e.target.value)} placeholder="scegli o scrivi" /></label>
              <label style={lbl}>Qualifica<input className="dc-input" value={nuovo.qualifica} onChange={e => setN("qualifica", e.target.value)} /></label>
              <label style={lbl}>Livello CCNL<input className="dc-input" value={nuovo.livello} onChange={e => setN("livello", e.target.value)} /></label>
              <label style={lbl}>Paga oraria (€)<input className="dc-input" value={nuovo.stipendio_orario} onChange={e => setN("stipendio_orario", e.target.value)} placeholder="es. 8,50" /></label>
              <label style={lbl}>Ore settimanali<input type="number" min="1" max="48" className="dc-input" value={nuovo.ore_settimanali} onChange={e => setN("ore_settimanali", e.target.value)} /></label>
              <label style={lbl}>Periodo di prova (giorni)<input className="dc-input" value={nuovo.periodo_prova} onChange={e => setN("periodo_prova", e.target.value)} /></label>
              <label style={lbl}>Data assunzione<input type="date" className="dc-input" value={nuovo.data_assunzione} onChange={e => setN("data_assunzione", e.target.value)} /></label>
              <label style={lbl}>Data fine (se determinato)<input type="date" className="dc-input" value={nuovo.data_fine} onChange={e => setN("data_fine", e.target.value)} /></label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
              <button className="dc-btn" onClick={() => setShowAssumi(false)}>Annulla</button>
              <button className="dc-btn-primary" disabled={busy === "assumi"} onClick={creaAssumi}>{busy === "assumi" ? "Assumo…" : "Crea e genera contratto"}</button>
            </div>
          </div>
        </div>
      )}

      <div className="dc-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Modelli contratto (.docx)</h3>
        <p className="dc-muted" style={{ fontSize: 13 }}>Caricali una volta: restano salvati. I segnaposto (…) vengono compilati con i dati del dipendente.</p>
        <div style={{ display: "grid", gap: 8 }}>
          {tipi.map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", borderTop: "1px solid #eee", paddingTop: 8 }}>
              <span>{dispTemplate(t.id) ? "✓" : "—"} {t.name}</span>
              <label className="dc-btn" style={{ cursor: "pointer", fontSize: 13 }}>
                {busy === "tpl-" + t.id ? "Carico…" : (dispTemplate(t.id) ? "Sostituisci" : "Carica")}
                <input type="file" accept=".docx" style={{ display: "none" }} onChange={(e) => uploadTemplate(t.id, e)} />
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="dc-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Genera contratto</h3>
        <datalist id="mansioni-list">{MANSIONI.map(m => <option key={m} value={m} />)}</datalist>
        <div style={grid}>
          <label style={lbl}>Dipendente
            <select value={dipId} onChange={(e) => setDipId(e.target.value)} className="dc-input">
              <option value="">— seleziona —</option>
              {dipendenti.map(d => <option key={d.id} value={d.id}>{d.cognome} {d.nome}</option>)}
            </select></label>
          <label style={lbl}>Tipo contratto
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="dc-input">
              {tipi.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></label>

          <div style={secTitle}>Dati anagrafici</div>
          <label style={lbl}>Codice fiscale<input className="dc-input" value={extra.codice_fiscale} onChange={(e) => set("codice_fiscale", e.target.value.toUpperCase())} /></label>
          <label style={lbl}>Luogo di nascita<input className="dc-input" value={extra.luogo_nascita} onChange={(e) => set("luogo_nascita", e.target.value)} placeholder="Comune" /></label>
          <label style={lbl}>Data di nascita<input type="date" className="dc-input" value={extra.data_nascita} onChange={(e) => set("data_nascita", e.target.value)} /></label>
          <label style={full}>Indirizzo di residenza<input className="dc-input" value={extra.indirizzo} onChange={(e) => set("indirizzo", e.target.value)} placeholder="Via/Piazza, n. civico, CAP, Comune" /></label>

          <div style={secTitle}>Inquadramento</div>
          <label style={lbl}>Mansione<input list="mansioni-list" className="dc-input" value={extra.mansione} onChange={(e) => set("mansione", e.target.value)} placeholder="scegli o scrivi" /></label>
          <label style={lbl}>Qualifica<input className="dc-input" value={extra.qualifica} onChange={(e) => set("qualifica", e.target.value)} placeholder="se diversa dalla mansione" /></label>
          <label style={lbl}>Livello CCNL<input className="dc-input" value={extra.livello} onChange={(e) => set("livello", e.target.value)} /></label>
          <label style={lbl}>Periodo di prova (giorni)
            <input className="dc-input" value={extra.periodo_prova} onChange={(e) => set("periodo_prova", e.target.value)} placeholder="per livello CCNL" />
            <span className="dc-muted" style={{ fontSize: 11, fontWeight: 400 }}>varia per livello — conferma col consulente</span>
          </label>

          <div style={secTitle}>Trattamento economico</div>
          <label style={lbl}>Paga oraria (€)<input className="dc-input" value={extra.stipendio_orario} onChange={(e) => set("stipendio_orario", e.target.value)} placeholder="es. 8,50" /></label>
          <label style={lbl}>Ore settimanali<input type="number" min="1" max="48" className="dc-input" value={extra.ore_settimanali} onChange={(e) => set("ore_settimanali", e.target.value)} /></label>
          <label style={lbl}>Lordo mensile (calcolato)<input className="dc-input" value={mensile != null ? `€ ${mensileFmt}` : ""} readOnly placeholder="oraria × ore × 52 / 12" style={{ background: "#f4f1ea" }} /></label>
          <label style={lbl}>Giorni di ferie / anno<input className="dc-input" value={extra.ferie_giorni} onChange={(e) => set("ferie_giorni", e.target.value)} placeholder="26" /></label>

          <div style={secTitle}>Decorrenza</div>
          <label style={lbl}>Data inizio<input type="date" className="dc-input" value={extra.data_inizio} onChange={(e) => set("data_inizio", e.target.value)} /></label>
          <label style={lbl}>Data fine (solo se determinato)<input type="date" className="dc-input" value={extra.data_fine} onChange={(e) => set("data_fine", e.target.value)} /></label>
        </div>

        <div style={secTitle}>Istituti contrattuali</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 8, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, margin: 0, fontWeight: 600 }}>
            <input type="checkbox" checked={extra.tredicesima} onChange={(e) => set("tredicesima", e.target.checked)} /> 13ª (dicembre)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, margin: 0, fontWeight: 600 }}>
            <input type="checkbox" checked={extra.quattordicesima} onChange={(e) => set("quattordicesima", e.target.checked)} /> 14ª (luglio)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, margin: 0, fontWeight: 600 }}>
            <input type="checkbox" checked={extra.ticket_buono} onChange={(e) => set("ticket_buono", e.target.checked)} /> Buono pasto (dopo 1 anno)
          </label>
          {extra.ticket_buono && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, margin: 0, fontWeight: 600 }}>
              Importo €/giorno
              <input className="dc-input" style={{ width: 90 }} value={extra.ticket_importo} onChange={(e) => set("ticket_importo", e.target.value)} />
            </label>
          )}
        </div>
        {dip && !dip.email && <p className="dc-muted" style={{ fontSize: 12, marginTop: 8 }}>⚠ Questo dipendente non ha email in anagrafica: non potrai inviare il contratto.</p>}
        <button onClick={genera} disabled={busy === "gen"} className="dc-btn-primary" style={{ marginTop: 12 }}>
          {busy === "gen" ? "Genero…" : "Genera contratto"}
        </button>
      </div>

      {dipId && (
        <div className="dc-card">
          <h3 style={{ marginTop: 0 }}>Contratti di {dip?.cognome} {dip?.nome}</h3>
          {contratti.length === 0 ? <p className="dc-muted">Nessun contratto generato.</p> :
            contratti.map(c => {
              const st = c.iter_stato || "bozza";
              const badge = ITER[st] || ITER.bozza;
              return (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", borderTop: "1px solid #eee", padding: "8px 0", flexWrap: "wrap" }}>
                <div>
                  <b>{c.contract_name}</b>
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, color: badge[1], background: badge[2] }}>{badge[0]}</span>
                  <div className="dc-muted" style={{ fontSize: 12 }}>{c.filename}{c.inviato_a ? ` · inviato a ${c.inviato_a}` : ""}{c.stipendio_mensile != null ? ` · €/mese ${Number(c.stipendio_mensile).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="dc-btn" onClick={() => scarica(c.id, c.filename)}>Scarica bozza</button>
                  {(st === "bozza") && (
                    <button className="dc-btn-primary" disabled={busy === "send-" + c.id} onClick={() => invia(c.id)}>{busy === "send-" + c.id ? "Invio…" : "Invia bozza per firma"}</button>
                  )}
                  {st === "inviata" && (
                    <label className="dc-btn-primary" style={{ cursor: "pointer" }}>
                      {busy === "cf-" + c.id ? "Carico…" : "Carica firmato dal dipendente"}
                      <input type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => caricaFirmato(c.id, e)} />
                    </label>
                  )}
                  {st === "firmato_dipendente" && (<>
                    <button className="dc-btn" onClick={() => scaricaPdf(c.id, "firmato")}>Scarica firmato</button>
                    <label className="dc-btn-primary" style={{ cursor: "pointer" }}>
                      {busy === "fz-" + c.id ? "Finalizzo…" : "Controfirma e invia definitivo"}
                      <input type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => finalizza(c.id, e)} />
                    </label>
                  </>)}
                  {st === "definitivo" && (
                    <button className="dc-btn" onClick={() => scaricaPdf(c.id, "definitivo")}>Scarica definitivo</button>
                  )}
                  {st !== "bozza" && st !== "definitivo" && st !== "inviata" && st !== "firmato_dipendente" && (
                    <button className="dc-btn-primary" disabled={busy === "send-" + c.id} onClick={() => invia(c.id)}>{busy === "send-" + c.id ? "Invio…" : "Invia bozza per firma"}</button>
                  )}
                </div>
              </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ===== Timbrature & Sede =====
function TimbraturePage({ dipendenti, getDipendente }) {
  const T = "/api/timbrature";
  const [sede, setSede] = useState({ nome: "Ceraldi Caffè", indirizzo: "Piazza Carità, 14 — 80134 Napoli", lat: 40.842949, lng: 14.2489, raggio_m: 200, blocca_fuori_sede: true });
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [timb, setTimb] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [sedeOk, setSedeOk] = useState(null); // true = sede salvata sul server (geofencing attivo)

  useEffect(() => { axios.get(`${T}/sede`).then(r => { const ok = !!(r.data && r.data.lat != null); setSedeOk(ok); if (ok) setSede(s => ({ ...s, ...r.data })); }).catch(() => setSedeOk(false)); }, []);
  const loadTimb = () => axios.get(`${T}?data=${data}`).then(r => setTimb(r.data.timbrature || [])).catch(() => setTimb([]));
  useEffect(() => { loadTimb(); }, [data]);

  // Turni pianificati per il giorno selezionato (stessi endpoint della pagina Presenze)
  const [tipiTurno, setTipiTurno] = useState([]);
  const [assegn, setAssegn] = useState([]);
  const NOMI_G = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  const lunISOdi = (ymd) => { const d = new Date(ymd + "T12:00:00"); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); return d.toISOString().slice(0, 10); };
  const giornoNomeDi = (ymd) => NOMI_G[new Date(ymd + "T12:00:00").getDay()];
  useEffect(() => { axios.get("/api/dipendenti-cloud/turni").then(r => setTipiTurno(r.data || [])).catch(() => {}); }, []);
  useEffect(() => { axios.get(`/api/dipendenti-cloud/assegnazioni-turni?settimana=${lunISOdi(data)}`).then(r => setAssegn(r.data || [])).catch(() => setAssegn([])); }, [data]);
  const [riepilogo, setRiepilogo] = useState([]);
  useEffect(() => {
    const [a, m] = data.split("-");
    axios.get(`${T}/riepilogo?anno=${a}&mese=${parseInt(m)}`).then(r => setRiepilogo(r.data.riepilogo || [])).catch(() => setRiepilogo([]));
  }, [data]);
  const nomeTurno = (id) => (tipiTurno.find(t => t.id === id) || {}).nome;
  const pianificatoDi = (dipId) => {
    const a = assegn.find(x => x.dipendente_id === dipId && x.settimana === lunISOdi(data) && x.giorno === giornoNomeDi(data));
    return a ? (nomeTurno(a.turno_id) || null) : null;
  };
  const lavorativo = (n) => n && !["Riposo", "Ferie"].includes(n);

  const salvaSede = async () => {
    setBusy("sede"); setMsg("");
    try { await axios.post(`${T}/sede`, { ...sede, lat: parseFloat(sede.lat), lng: parseFloat(sede.lng), raggio_m: parseInt(sede.raggio_m) || 200 });
      setSedeOk(true); setMsg("Sede salvata."); } catch (e) { setMsg(e?.response?.data?.detail || "Errore salvataggio sede"); }
    setBusy("");
  };
  const usaPosizione = () => {
    if (!navigator.geolocation) { setMsg("Geolocalizzazione non disponibile."); return; }
    navigator.geolocation.getCurrentPosition(
      p => { setSede(s => ({ ...s, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) })); setMsg("Posizione attuale inserita: salva per confermare."); },
      () => setMsg("Impossibile ottenere la posizione."), { enableHighAccuracy: true, timeout: 10000 });
  };

  // Confronto atteso vs effettivo: unione di chi ha timbrato e di chi era
  // pianificato a lavorare quel giorno (così emergono anche le assenze).
  const perDip = (() => {
    const m = {};
    const ensure = (k, nome) => { if (!m[k]) m[k] = { dipId: k, nome: nome || "", entrata: null, uscita: null, fuori: false }; return m[k]; };
    for (const t of timb) {
      const g = ensure(t.dipendente_id, t.dipendente_nome);
      if (t.tipo === "entrata" && !g.entrata) g.entrata = t;
      if (t.tipo === "uscita") g.uscita = t;
      if (t.fuori_sede) g.fuori = true;
    }
    // aggiungi i pianificati a lavorare che non hanno (ancora) timbrato
    for (const a of assegn) {
      if (a.settimana !== lunISOdi(data) || a.giorno !== giornoNomeDi(data)) continue;
      if (!lavorativo(nomeTurno(a.turno_id))) continue;
      const d = getDipendente ? getDipendente(a.dipendente_id) : null;
      ensure(a.dipendente_id, d ? `${d.cognome || ""} ${d.nome || ""}`.trim() : a.dipendente_id);
    }
    return Object.values(m).map(g => {
      let ore = null;
      if (g.entrata && g.uscita) {
        const [h1, mi1] = g.entrata.ora.split(":").map(Number); const [h2, mi2] = g.uscita.ora.split(":").map(Number);
        ore = Math.round(((h2 * 60 + mi2) - (h1 * 60 + mi1)) / 6) / 10;
      }
      const pian = pianificatoDi(g.dipId);
      let stato = ["—", "default"];
      if (lavorativo(pian) && !g.entrata) stato = ["Assente", "danger"];
      else if (!lavorativo(pian) && g.entrata) stato = [pian ? `Extra (${pian})` : "Extra (non in turno)", "warning"];
      else if (g.entrata && g.uscita) stato = ["OK", "success"];
      else if (g.entrata) stato = ["In corso", "info"];
      // Presenza validata: entrata+uscita in sede e permanenza ≥ 1 ora
      const validata = !!(g.entrata && g.uscita && !g.fuori && ore != null && ore >= 1);
      return { ...g, ore, pian, stato, validata };
    }).sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  })();

  const set = (k, v) => setSede(s => ({ ...s, [k]: v }));
  const lbl = { display: "flex", flexDirection: "column", gap: 5, fontSize: 13, fontWeight: 600 };

  return (
    <div className="dc-page">
      <div className="dc-page-header"><div><h1>Timbrature</h1>
        <p>Timbratura dei dipendenti dal portale (solo in sede) e confronto con i turni</p></div></div>

      {msg && <div style={{ background: "#eef3ef", border: "1px solid #d9e4dc", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>{msg}</div>}

      {sedeOk === false && (
        <div className="dc-card" style={{ marginBottom: 14, borderLeft: "4px solid #d35f4e" }}>
          <b>⚠ Sede non impostata — controllo “fuori sede” DISATTIVO.</b> Finché non salvi la sede, le timbrature non vengono verificate (nessuna risulta “fuori sede”). Nel pannello qui sotto, <b>stando al bar</b>, premi “Usa la mia posizione attuale” e poi “Salva sede”.
        </div>
      )}

      <div className="dc-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Sede di lavoro (geofencing)</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, alignItems: "end" }}>
          <label style={lbl}>Nome sede<input className="dc-input" value={sede.nome || ""} onChange={e => set("nome", e.target.value)} /></label>
          <label style={{ ...lbl, gridColumn: "span 2" }}>Indirizzo<input className="dc-input" value={sede.indirizzo || ""} onChange={e => set("indirizzo", e.target.value)} /></label>
          <label style={lbl}>Latitudine<input className="dc-input" value={sede.lat ?? ""} onChange={e => set("lat", e.target.value)} /></label>
          <label style={lbl}>Longitudine<input className="dc-input" value={sede.lng ?? ""} onChange={e => set("lng", e.target.value)} /></label>
          <label style={lbl}>Raggio ammesso (m)<input type="number" className="dc-input" value={sede.raggio_m ?? 200} onChange={e => set("raggio_m", e.target.value)} /></label>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, margin: 0 }}>
            <input type="checkbox" checked={!!sede.blocca_fuori_sede} onChange={e => set("blocca_fuori_sede", e.target.checked)} /> Consenti la timbratura solo in sede
          </label>
          <button className="dc-btn" onClick={usaPosizione}>Usa la mia posizione attuale</button>
          <button className="dc-btn-primary" disabled={busy === "sede"} onClick={salvaSede}>{busy === "sede" ? "Salvo…" : "Salva sede"}</button>
        </div>
      </div>

      <div className="dc-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Timbrature del giorno</h3>
          <input type="date" className="dc-input" style={{ width: "auto" }} value={data} onChange={e => setData(e.target.value)} />
        </div>
        {perDip.length === 0 ? <p className="dc-muted" style={{ marginTop: 12 }}>Nessuna timbratura per questa data.</p> : (
          <div style={{ overflowX: "auto", marginTop: 12, WebkitOverflowScrolling: "touch" }}>
          <table className="dc-table" style={{ minWidth: 720, whiteSpace: "nowrap" }}>
            <thead><tr><th>Dipendente</th><th>Turno pianificato</th><th>Entrata</th><th>Uscita</th><th>Ore</th><th>Sede</th><th>Validata</th><th>Esito</th></tr></thead>
            <tbody>
              {perDip.map((g, i) => (
                <tr key={i}>
                  <td>{g.nome}</td>
                  <td>{g.pian || "—"}</td>
                  <td>{g.entrata?.ora || "—"}</td>
                  <td>{g.uscita?.ora || (g.entrata ? "in corso" : "—")}</td>
                  <td>{g.ore != null ? `${g.ore} h` : "—"}</td>
                  <td>{(() => {
                    const recs = [g.entrata, g.uscita].filter(Boolean);
                    if (!recs.length) return "—";
                    if (recs.some(r => r.fuori_sede)) { const ds = recs.map(r => r.distanza_m).filter(x => x != null); return <Badge variant="danger">fuori sede{ds.length ? ` · ${Math.max(...ds)} m` : ""}</Badge>; }
                    if (recs.every(r => r.lat == null)) return <Badge variant="warning">no GPS</Badge>;
                    if (sedeOk === false) return <Badge variant="warning">n/d · sede non impostata</Badge>;
                    return <Badge variant="success">in sede</Badge>;
                  })()}</td>
                  <td>{!g.entrata ? "—" : (g.uscita ? (g.validata ? <Badge variant="success">✓ valida</Badge> : <Badge variant="warning">da verificare</Badge>) : <Badge variant="info">in corso</Badge>)}</td>
                  <td><Badge variant={g.stato[1]}>{g.stato[0]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        <p className="dc-muted" style={{ fontSize: 12, marginTop: 10 }}>Confronta queste presenze reali con i turni pianificati nella pagina Presenze (il calendario sovrappone già i turni).</p>
      </div>

      <div className="dc-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Riepilogo ore del mese ({data.slice(5, 7)}/{data.slice(0, 4)})</h3>
        {riepilogo.length === 0 ? <p className="dc-muted">Nessuna ora timbrata in questo mese.</p> : (
          <table className="dc-table">
            <thead><tr><th>Dipendente</th><th>Giorni</th><th>Ore totali</th></tr></thead>
            <tbody>
              {riepilogo.map((r, i) => (
                <tr key={i}><td>{r.nome}</td><td>{r.giorni}</td><td><b>{r.ore} h</b></td></tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="dc-muted" style={{ fontSize: 12, marginTop: 10 }}>Ore calcolate dalle timbrature (entrata→uscita). Utile per il controllo delle buste paga.</p>
      </div>
    </div>
  );
}

// ==================== CONTABILITÀ / GESTIONE PAGAMENTI ====================
// Fase 1: viste in sola lettura su fatture passive, fornitori e documenti
// fiscali (PEC). Dati recuperati dall'app esterna Gestione Pagamenti e
// importati nelle collezioni invoices / fornitori / documents_inbox.
const CONTAB = "/api/contabilita";
const eurFmt = (n) => (Number(n) || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TIPI_DOC = ["PAGHE_F24", "COMMERCIALISTA", "AGENZIA_RISCOSSIONE", "INPS", "INAIL", "TARI", "PAGOPA_NAPOLI", "RICEVUTA_PAGOPA"];

function ContabilitaDashboardPage({ navigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await axios.get(`${CONTAB}/dashboard`);
      setData(r.data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const importa = async () => {
    if (!confirm("Importare lo snapshot della Gestione Pagamenti (fatture, fornitori, documenti)?")) return;
    try {
      setImporting(true); setMsg("");
      const r = await axios.post(`${CONTAB}/importa-snapshot`);
      const c = r.data?.risultati || {};
      setMsg(`✓ Import: ${c.invoices?.totale || 0} fatture, ${c.fornitori?.totale || 0} fornitori, ${c.documents_inbox?.totale || 0} documenti.`);
      await load();
    } catch (e) {
      setMsg(e?.response?.data?.detail || "Errore durante l'import");
    } finally { setImporting(false); }
  };

  if (loading) return <div className="dc-page"><div className="dc-empty">Caricamento…</div></div>;
  const f = data?.fatture || {}, doc = data?.documenti || {}, forn = data?.fornitori || {};
  const vuoto = (f.totale || 0) + (doc.totale || 0) + (forn.totale || 0) === 0;

  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <h1>Pagamenti & Contabilità</h1>
        <p>Fatture passive, fornitori e documenti fiscali (PEC). Recuperati dalla Gestione Pagamenti.</p>
      </div>

      {vuoto && (
        <div className="dc-card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Nessun dato presente</h3>
          <p className="dc-muted">Importa lo snapshot recuperato dalla Gestione Pagamenti per popolare fatture, fornitori e documenti.</p>
          <button className="dc-btn dc-btn-primary" onClick={importa} disabled={importing}>
            {importing ? "Import in corso…" : "Importa snapshot"}
          </button>
        </div>
      )}
      {msg && <div className="dc-card" style={{ marginBottom: 16 }}>{msg}</div>}

      <div className="dc-stats-grid">
        <div className="dc-stat-card dc-stat-yellow" onClick={() => navigate("/dipendenti/fatture")} style={{ cursor: "pointer" }}>
          <div className="dc-stat-icon"><Receipt size={24} /></div>
          <div className="dc-stat-content">
            <span className="dc-stat-label">FATTURE DA PAGARE</span>
            <span className="dc-stat-value">{f.da_pagare || 0}</span>
            <span className="dc-stat-sub">su {f.totale || 0} totali</span>
          </div>
        </div>
        <div className="dc-stat-card dc-stat-yellow">
          <div className="dc-stat-icon"><Euro size={24} /></div>
          <div className="dc-stat-content">
            <span className="dc-stat-label">IMPORTO DA PAGARE</span>
            <span className="dc-stat-value">€ {eurFmt(f.importo_da_pagare)}</span>
          </div>
        </div>
        <div className="dc-stat-card dc-stat-yellow" onClick={() => navigate("/dipendenti/da-pagare")} style={{ cursor: "pointer" }}>
          <div className="dc-stat-icon"><AlertTriangle size={24} /></div>
          <div className="dc-stat-content">
            <span className="dc-stat-label">DOCUMENTI URGENTI</span>
            <span className="dc-stat-value">{doc.da_pagare || 0}</span>
            <span className="dc-stat-sub">su {doc.totale || 0} documenti</span>
          </div>
        </div>
        <div className="dc-stat-card dc-stat-green" onClick={() => navigate("/dipendenti/fornitori")} style={{ cursor: "pointer" }}>
          <div className="dc-stat-icon"><Building2 size={24} /></div>
          <div className="dc-stat-content">
            <span className="dc-stat-label">FORNITORI</span>
            <span className="dc-stat-value">{forn.totale || 0}</span>
          </div>
        </div>
      </div>

      {doc.per_tipo && Object.keys(doc.per_tipo).length > 0 && (
        <div className="dc-card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Documenti urgenti per tipo</h3>
          <table className="dc-table">
            <thead><tr><th>Tipo</th><th>Documenti</th></tr></thead>
            <tbody>
              {Object.entries(doc.per_tipo).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                <tr key={t}><td>{t.replace(/_/g, " ")}</td><td><b>{n}</b></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DaPagarePage() {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (q) => {
    try {
      setLoading(true);
      const r = await axios.get(`${CONTAB}/da-pagare`, { params: q ? { search: q } : {} });
      setData(r.data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);
  useEffect(() => { const t = setTimeout(() => load(search), 300); return () => clearTimeout(t); }, [search, load]);

  const gruppi = data?.gruppi || {};
  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <h1>Da Pagare</h1>
        <p>Documenti fiscali ad alta priorità da pagare o regolarizzare.</p>
      </div>
      <div className="dc-stats-grid">
        <div className="dc-stat-card dc-stat-yellow">
          <div className="dc-stat-icon"><AlertTriangle size={24} /></div>
          <div className="dc-stat-content">
            <span className="dc-stat-label">DOCUMENTI URGENTI</span>
            <span className="dc-stat-value">{data?.totale_documenti || 0}</span>
          </div>
        </div>
        <div className="dc-stat-card dc-stat-yellow">
          <div className="dc-stat-icon"><Receipt size={24} /></div>
          <div className="dc-stat-content">
            <span className="dc-stat-label">FATTURE DA PAGARE</span>
            <span className="dc-stat-value">{data?.fatture_da_pagare || 0}</span>
          </div>
        </div>
      </div>
      <div style={{ margin: "16px 0", position: "relative", maxWidth: 360 }}>
        <input className="dc-select" style={{ width: "100%" }} placeholder="Cerca per oggetto o mittente…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {loading ? <div className="dc-empty">Caricamento…</div> :
        Object.keys(gruppi).length === 0 ? <div className="dc-empty">Nessun documento da pagare.</div> :
          Object.entries(gruppi).sort((a, b) => b[1].length - a[1].length).map(([tipo, items]) => (
            <div key={tipo} className="dc-card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>{tipo.replace(/_/g, " ")} ({items.length})</h3>
              <table className="dc-table dc-table--cards">
                <thead><tr><th>Data</th><th>Oggetto</th><th>Mittente</th><th>Importo</th></tr></thead>
                <tbody>
                  {items.map((d) => (
                    <tr key={d.id}>
                      <td data-label="Data">{formatDate(d.data)}</td>
                      <td data-label="Oggetto">{d.oggetto}</td>
                      <td data-label="Mittente" className="dc-muted">{d.mittente}</td>
                      <td data-label="Importo">{d.importo ? `€ ${eurFmt(d.importo)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
    </div>
  );
}

function FatturePage() {
  const [data, setData] = useState({ items: [], totale: 0 });
  const [loading, setLoading] = useState(true);
  const [stato, setStato] = useState("");
  const [anno, setAnno] = useState("");
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (stato) params.stato = stato;
      if (anno) params.anno = anno;
      if (search) params.search = search;
      const r = await axios.get(`${CONTAB}/fatture`, { params });
      setData(r.data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [stato, anno, search]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const importaXml = async (e) => {
    const files = e.target.files;
    if (!files || !files.length) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    try {
      setMsg("Import in corso…");
      const r = await axios.post(`${CONTAB}/fatture/importa-xml`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setMsg(`✓ ${r.data.nuove} nuove, ${r.data.duplicate} già presenti, ${r.data.ignorati || 0} metadati ignorati, ${r.data.errori} errori.`);
      await load();
    } catch (err) {
      setMsg(err?.response?.data?.detail || "Errore import XML");
    } finally { if (fileRef.current) fileRef.current.value = ""; }
  };

  const paga = async (f) => {
    try {
      if (f.stato_pagamento === "pagato") await axios.post(`${CONTAB}/fatture/${encodeURIComponent(f.id)}/riapri`);
      else await axios.post(`${CONTAB}/fatture/${encodeURIComponent(f.id)}/paga`);
      await load();
    } catch (e) { console.error(e); }
  };

  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <h1>Fatture</h1>
        <p>Fatture passive dei fornitori. {data.totale} risultati.</p>
        <div className="dc-page-actions">
          <input ref={fileRef} type="file" accept=".xml,.p7m,.zip" multiple onChange={importaXml} style={{ display: "none" }} />
          <button className="dc-btn dc-btn-primary" onClick={() => fileRef.current?.click()}>
            <Download size={16} /> Importa XML
          </button>
        </div>
      </div>
      {msg && <div className="dc-card" style={{ marginBottom: 12 }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 16px" }}>
        <select className="dc-select" value={stato} onChange={(e) => setStato(e.target.value)}>
          <option value="">Tutti gli stati</option>
          <option value="da_pagare">Da pagare</option>
          <option value="pagato">Pagate</option>
        </select>
        <select className="dc-select" value={anno} onChange={(e) => setAnno(e.target.value)}>
          <option value="">Tutti gli anni</option>
          {[2026, 2025, 2024].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input className="dc-select" style={{ flex: 1, minWidth: 200 }} placeholder="Cerca fornitore, numero, P.IVA…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {loading ? <div className="dc-empty">Caricamento…</div> :
        data.items.length === 0 ? <div className="dc-empty">Nessuna fattura.</div> : (
          <div className="dc-card">
            <table className="dc-table dc-table--cards">
              <thead><tr><th>Data</th><th>Numero</th><th>Fornitore</th><th>Imponibile</th><th>IVA</th><th>Totale</th><th>Stato</th><th>Azioni</th></tr></thead>
              <tbody>
                {data.items.map((f) => (
                  <tr key={f.id}>
                    <td data-label="Data">{formatDate(f.data)}</td>
                    <td data-label="Numero">{f.numero}</td>
                    <td data-label="Fornitore">{f.fornitore}</td>
                    <td data-label="Imponibile">€ {eurFmt(f.imponibile)}</td>
                    <td data-label="IVA">€ {eurFmt(f.iva)}</td>
                    <td data-label="Totale"><b>€ {eurFmt(f.totale)}</b></td>
                    <td data-label="Stato">
                      {f.stato_pagamento === "pagato"
                        ? <Badge variant="success">pagata</Badge>
                        : <Badge variant="warning">da pagare</Badge>}
                    </td>
                    <td data-label="Azioni">
                      <button className="dc-btn" onClick={() => paga(f)}>
                        {f.stato_pagamento === "pagato" ? "Riapri" : "Segna pagata"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

function FornitoriPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // _id in modifica
  const [form, setForm] = useState({ iban: "", metodo_pagamento: "" });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await axios.get(`${CONTAB}/fornitori`, { params: search ? { search } : {} });
      setItems(r.data?.items || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [search]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const [open, setOpen] = useState(null);     // _id espanso
  const [detail, setDetail] = useState(null); // { fatture, bonifici }
  const [detLoading, setDetLoading] = useState(false);

  const apriEdit = (f) => { setEditing(f._id); setForm({ iban: f.iban || "", metodo_pagamento: f.metodo_pagamento || "" }); };
  const salva = async (f) => {
    try {
      await axios.put(`${CONTAB}/fornitori/${encodeURIComponent(f._id)}`, form);
      setEditing(null);
      await load();
    } catch (e) { console.error(e); }
  };

  const toggle = async (f) => {
    if (open === f._id) { setOpen(null); setDetail(null); return; }
    setOpen(f._id); setDetail(null); setDetLoading(true);
    try {
      const r = await axios.get(`${CONTAB}/fornitori/${encodeURIComponent(f._id)}`);
      setDetail(r.data);
    } catch (e) { console.error(e); } finally { setDetLoading(false); }
  };
  const pagaFattura = async (fid) => {
    try { await axios.post(`${CONTAB}/fatture/${encodeURIComponent(fid)}/paga`); const f = { _id: open }; setOpen(null); await toggle(f); }
    catch (e) { console.error(e); }
  };

  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <h1>Fornitori</h1>
        <p>{items.length} fornitori.</p>
      </div>
      <div style={{ margin: "0 0 16px", maxWidth: 360 }}>
        <input className="dc-select" style={{ width: "100%" }} placeholder="Cerca fornitore…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {loading ? <div className="dc-empty">Caricamento…</div> :
        items.length === 0 ? <div className="dc-empty">Nessun fornitore.</div> : (
          <div className="dc-card">
            <table className="dc-table dc-table--cards">
              <thead><tr><th>Fornitore</th><th>P.IVA</th><th>IBAN</th><th>Metodo</th><th>Fatture</th><th>Azioni</th></tr></thead>
              <tbody>
                {items.map((f) => (
                  <Fragment key={f._id}>
                  <tr>
                    <td data-label="Fornitore">
                      <button className="dc-link" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: "inherit", textAlign: "left" }}
                        onClick={() => toggle(f)}>
                        {open === f._id ? "▾ " : "▸ "}{f.nome}
                      </button>
                    </td>
                    <td data-label="P.IVA" className="dc-muted">{f.piva || "—"}</td>
                    <td data-label="IBAN" className="dc-muted">
                      {editing === f._id
                        ? <input className="dc-select" style={{ minWidth: 220 }} value={form.iban}
                            onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="IBAN" />
                        : (f.iban || "—")}
                    </td>
                    <td data-label="Metodo">
                      {editing === f._id
                        ? <select className="dc-select" value={form.metodo_pagamento}
                            onChange={(e) => setForm({ ...form, metodo_pagamento: e.target.value })}>
                            <option value="">—</option>
                            <option value="bonifico">Bonifico</option>
                            <option value="rid">RID/SDD</option>
                            <option value="contanti">Contanti</option>
                            <option value="paypal">PayPal</option>
                          </select>
                        : (f.metodo_pagamento || "—")}
                    </td>
                    <td data-label="Fatture">{f.tot_fatture ?? (f.fatture?.length || 0)}</td>
                    <td data-label="Azioni">
                      {editing === f._id
                        ? <><button className="dc-btn dc-btn-success" onClick={() => salva(f)}>Salva</button>{" "}
                            <button className="dc-btn" onClick={() => setEditing(null)}>Annulla</button></>
                        : <button className="dc-btn" onClick={() => apriEdit(f)}>Modifica</button>}
                    </td>
                  </tr>
                  {open === f._id && (
                    <tr>
                      <td colSpan={6} style={{ background: "#faf7f0" }}>
                        {detLoading ? <div className="dc-muted">Caricamento…</div> : !detail ? null : (
                          <div style={{ display: "grid", gap: 14 }}>
                            <div>
                              <b>Fatture ({detail.fatture?.length || 0})</b>
                              {(!detail.fatture || detail.fatture.length === 0)
                                ? <div className="dc-muted" style={{ fontSize: 13 }}>Nessuna fattura collegata.</div>
                                : (
                                  <table className="dc-table" style={{ marginTop: 6 }}>
                                    <thead><tr><th>Data</th><th>Numero</th><th>Totale</th><th>Stato</th><th></th></tr></thead>
                                    <tbody>
                                      {detail.fatture.map((ft) => (
                                        <tr key={ft.id}>
                                          <td>{formatDate(ft.data)}</td>
                                          <td>{ft.numero}</td>
                                          <td>€ {eurFmt(ft.totale)}</td>
                                          <td>{ft.stato_pagamento === "pagato" ? <Badge variant="success">pagata</Badge> : <Badge variant="warning">da pagare</Badge>}</td>
                                          <td>{ft.stato_pagamento !== "pagato" && <button className="dc-btn dc-btn-success" onClick={() => pagaFattura(ft.id)}>Segna pagata</button>}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                            </div>
                            <div>
                              <b>Bonifici ({detail.bonifici?.length || 0})</b>
                              {(!detail.bonifici || detail.bonifici.length === 0)
                                ? <div className="dc-muted" style={{ fontSize: 13 }}>Nessun bonifico collegato.</div>
                                : (
                                  <table className="dc-table" style={{ marginTop: 6 }}>
                                    <thead><tr><th>Data</th><th>Causale</th><th>Importo</th><th>Fattura</th></tr></thead>
                                    <tbody>
                                      {detail.bonifici.map((b) => (
                                        <tr key={b._id}>
                                          <td>{formatDate(b.data)}</td>
                                          <td>{b.causale}</td>
                                          <td>€ {eurFmt(b.importo)}</td>
                                          <td>{b.fattura_id ? <Badge variant="success">collegato</Badge> : <Badge variant="default">—</Badge>}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

function DocumentiFiscaliPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tipo, setTipo] = useState("");
  const [priorita, setPriorita] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (tipo) params.tipo = tipo;
      if (priorita) params.priorita = priorita;
      if (search) params.search = search;
      const r = await axios.get(`${CONTAB}/documenti`, { params });
      setItems(r.data?.items || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [tipo, priorita, search]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <h1>Documenti fiscali</h1>
        <p>Documenti ricevuti via PEC/email (Agenzia Riscossione, INPS, INAIL, TARI, PagoPA, commercialista). {items.length} risultati.</p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 16px" }}>
        <select className="dc-select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Tutti i tipi</option>
          {TIPI_DOC.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
        <select className="dc-select" value={priorita} onChange={(e) => setPriorita(e.target.value)}>
          <option value="">Tutte le priorità</option>
          <option value="HIGH">Alta</option>
          <option value="NORMAL">Normale</option>
        </select>
        <input className="dc-select" style={{ flex: 1, minWidth: 200 }} placeholder="Cerca oggetto o mittente…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {loading ? <div className="dc-empty">Caricamento…</div> :
        items.length === 0 ? <div className="dc-empty">Nessun documento.</div> : (
          <div className="dc-card">
            <table className="dc-table dc-table--cards">
              <thead><tr><th>Data</th><th>Tipo</th><th>Oggetto</th><th>Mittente</th><th>Priorità</th></tr></thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id}>
                    <td data-label="Data">{formatDate(d.data)}</td>
                    <td data-label="Tipo">{(d.tipo || "").replace(/_/g, " ")}</td>
                    <td data-label="Oggetto">{d.oggetto}</td>
                    <td data-label="Mittente" className="dc-muted">{d.mittente}</td>
                    <td data-label="Priorità">
                      {d.priorita === "HIGH" ? <Badge variant="danger">alta</Badge> : <Badge variant="default">{(d.priorita || "").toLowerCase()}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

function BonificiContabPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoria, setCategoria] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (categoria) params.categoria = categoria;
      if (search) params.search = search;
      const r = await axios.get(`${CONTAB}/bonifici`, { params });
      setItems(r.data?.items || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [categoria, search]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const catBadge = (c) => ({ DIPENDENTE: "info", FORNITORE: "warning", SOCIO: "default", ENTE_PUBBLICO: "danger" }[c] || "default");

  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <h1>Bonifici</h1>
        <p>Movimenti bancari in uscita. {items.length} risultati.</p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 16px" }}>
        <select className="dc-select" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Tutte le categorie</option>
          {["DIPENDENTE", "FORNITORE", "SOCIO", "ENTE_PUBBLICO"].map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
        </select>
        <input className="dc-select" style={{ flex: 1, minWidth: 200 }} placeholder="Cerca beneficiario o causale…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {loading ? <div className="dc-empty">Caricamento…</div> :
        items.length === 0 ? <div className="dc-empty">Nessun bonifico.</div> : (
          <div className="dc-card">
            <table className="dc-table dc-table--cards">
              <thead><tr><th>Data</th><th>Competenza</th><th>Beneficiario</th><th>Causale</th><th>Categoria</th><th>Importo</th><th>Stato</th></tr></thead>
              <tbody>
                {items.map((b) => (
                  <tr key={b._id}>
                    <td data-label="Data">{formatDate(b.data)}</td>
                    <td data-label="Competenza" className="dc-muted">{b.mese_competenza || "—"}</td>
                    <td data-label="Beneficiario">{b.beneficiario}</td>
                    <td data-label="Causale" className="dc-muted">{b.causale}</td>
                    <td data-label="Categoria"><Badge variant={catBadge(b.categoria)}>{(b.categoria || "").replace(/_/g, " ").toLowerCase()}</Badge></td>
                    <td data-label="Importo"><b>€ {eurFmt(b.importo)}</b></td>
                    <td data-label="Stato">{b.fattura_id ? <Badge variant="success">riconciliato</Badge> : <Badge variant="default">—</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

function RiconciliazionePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await axios.get(`${CONTAB}/riconciliazione`);
      setItems(r.data?.items || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const assegna = async (bonifico_id, fattura_id) => {
    try {
      await axios.post(`${CONTAB}/bonifici/${encodeURIComponent(bonifico_id)}/assegna`, { fattura_id });
      await load();
    } catch (e) { console.error(e); }
  };

  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <h1>Da Verificare</h1>
        <p>Bonifici a fornitori senza fattura collegata. Conferma l'abbinamento suggerito.</p>
      </div>
      {loading ? <div className="dc-empty">Caricamento…</div> :
        items.length === 0 ? <div className="dc-empty">Nessun bonifico da verificare.</div> :
          items.map(({ bonifico, suggerimenti }) => (
            <div key={bonifico._id} className="dc-card" style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <b>{bonifico.beneficiario}</b> · {formatDate(bonifico.data)} · <b>€ {eurFmt(bonifico.importo)}</b>
                  <div className="dc-muted" style={{ fontSize: 12 }}>{bonifico.causale}</div>
                </div>
              </div>
              {suggerimenti.length === 0
                ? <p className="dc-muted" style={{ fontSize: 13, marginBottom: 0 }}>Nessun suggerimento automatico.</p>
                : (
                  <table className="dc-table" style={{ marginTop: 10 }}>
                    <thead><tr><th>Fattura</th><th>Fornitore</th><th>Totale</th><th>Match</th><th></th></tr></thead>
                    <tbody>
                      {suggerimenti.map((s) => (
                        <tr key={s.fattura_id}>
                          <td>{s.numero}</td>
                          <td>{s.fornitore}</td>
                          <td>€ {eurFmt(s.totale)}</td>
                          <td><Badge variant={s.motivo === "importo" ? "success" : "info"}>{s.motivo}</Badge></td>
                          <td><button className="dc-btn dc-btn-success" onClick={() => assegna(bonifico._id, s.fattura_id)}>Abbina</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>
          ))}
    </div>
  );
}

function CalendarioPagamentiPage() {
  const oggi = new Date();
  const [mese, setMese] = useState(`${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, "0")}`);
  const [eventi, setEventi] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await axios.get(`${CONTAB}/calendario`, { params: { mese } });
      setEventi(r.data?.eventi || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [mese]);
  useEffect(() => { load(); }, [load]);

  const giorni = {};
  eventi.forEach((e) => { (giorni[e.data] = giorni[e.data] || []).push(e); });
  const totale = eventi.reduce((s, e) => s + (Number(e.importo) || 0), 0);

  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <h1>Calendario pagamenti</h1>
        <p>Scadenze di fatture e documenti da pagare.</p>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 16px" }}>
        <input type="month" className="dc-select" value={mese} onChange={(e) => setMese(e.target.value)} />
        <span className="dc-muted">{eventi.length} scadenze · totale € {eurFmt(totale)}</span>
      </div>
      {loading ? <div className="dc-empty">Caricamento…</div> :
        Object.keys(giorni).length === 0 ? <div className="dc-empty">Nessuna scadenza nel mese.</div> :
          Object.entries(giorni).sort().map(([g, evs]) => (
            <div key={g} className="dc-card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>{formatDate(g)}</h3>
              <table className="dc-table dc-table--cards">
                <thead><tr><th>Tipo</th><th>Descrizione</th><th>Importo</th></tr></thead>
                <tbody>
                  {evs.map((e, i) => (
                    <tr key={i}>
                      <td data-label="Tipo"><Badge variant={e.tipo === "fattura" ? "warning" : "danger"}>{e.tipo}</Badge></td>
                      <td data-label="Descrizione">{e.titolo}</td>
                      <td data-label="Importo">{e.importo ? `€ ${eurFmt(e.importo)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
    </div>
  );
}

function PayPalPage() {
  const oggi = new Date();
  const primo = new Date(oggi.getFullYear(), oggi.getMonth(), 1);
  const iso = (d) => d.toISOString().slice(0, 10);
  const [start, setStart] = useState(iso(primo));
  const [end, setEnd] = useState(iso(oggi));
  const [tx, setTx] = useState([]);
  const [stato, setStato] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    axios.get(`${CONTAB}/paypal/status`).then((r) => setStato(r.data)).catch(() => setStato({ configurato: false }));
  }, []);

  const carica = async () => {
    try {
      setLoading(true); setMsg("");
      const r = await axios.get(`${CONTAB}/paypal/transactions`, { params: { start_date: start, end_date: end } });
      setTx(r.data?.transazioni || []);
    } catch (e) {
      setMsg(e?.response?.data?.detail || "Errore PayPal");
      setTx([]);
    } finally { setLoading(false); }
  };

  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <h1>PayPal</h1>
        <p>Transazioni del conto PayPal aziendale.</p>
      </div>
      {stato && !stato.configurato && (
        <div className="dc-card" style={{ marginBottom: 16 }}>
          PayPal non è configurato. Imposta <code>PAYPAL_CLIENT_ID</code> e <code>PAYPAL_CLIENT_SECRET</code> nelle env di Render.
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "0 0 16px" }}>
        <input type="date" className="dc-select" value={start} onChange={(e) => setStart(e.target.value)} />
        <input type="date" className="dc-select" value={end} onChange={(e) => setEnd(e.target.value)} />
        <button className="dc-btn dc-btn-primary" onClick={carica} disabled={loading || (stato && !stato.configurato)}>
          {loading ? "Carico…" : "Carica transazioni"}
        </button>
      </div>
      {msg && <div className="dc-card" style={{ marginBottom: 12 }}>{msg}</div>}
      {tx.length > 0 && (
        <div className="dc-card">
          <table className="dc-table dc-table--cards">
            <thead><tr><th>Data</th><th>Controparte</th><th>Nota</th><th>Importo</th><th>Stato</th></tr></thead>
            <tbody>
              {tx.map((t) => (
                <tr key={t.id}>
                  <td data-label="Data">{formatDate(t.data)}</td>
                  <td data-label="Controparte">{t.controparte || "—"}</td>
                  <td data-label="Nota" className="dc-muted">{t.nota || "—"}</td>
                  <td data-label="Importo"><b>{t.importo} {t.valuta}</b></td>
                  <td data-label="Stato">{t.stato}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
