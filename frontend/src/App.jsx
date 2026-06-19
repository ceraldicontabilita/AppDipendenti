/**
 * Dipendenti in Cloud - Modulo HR completo con sidebar dedicata
 * Layout originale con sidebar blu scuro e navigazione tramite URL
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import Sortable from "sortablejs";
import { 
  Users, Calendar, Clock, FileText, Briefcase, Home, 
  ChevronRight, Plus, Check, X, Edit2, Trash2, 
  MapPin, Euro, Download, RefreshCw, ChevronLeft, Grid3X3,
  User, FolderOpen, Settings, LogOut, ArrowLeft
} from "lucide-react";
import "./App.css";

const API = '/api/dipendenti-cloud';

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
    { id: "buste-paga", label: "Buste Paga", icon: Euro, section: "DIPENDENTI" },
    { id: "documenti", label: "Documenti", icon: FolderOpen, section: "DIPENDENTI" },
  ];

  const pageLabels = {
    dashboard: "Pannello di controllo",
    anagrafica: "Anagrafica",
    presenze: "Presenze",
    "ferie-permessi": "Ferie & Permessi",
    turni: "Turni",
    "buste-paga": "Buste Paga",
    missioni: "Missioni",
    documenti: "Documenti",
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
      case "buste-paga":
        return <BustePagaPage dipendenti={activeDipendenti} reload={loadData} getDipendente={getDipendente} />;
      case "missioni":
        return <MissioniPage dipendenti={activeDipendenti} missioni={missioni} reload={loadData} getDipendente={getDipendente} />;
      case "documenti":
        return <DocumentiPage dipendenti={dipendenti} documenti={documenti} reload={loadData} getDipendente={getDipendente} />;
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
      </div>

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
  const codiceDerivato = (dipId, day) => {
    const pres = getPresenza(dipId, day);
    if (pres) return pres.giustificativo || (pres.stato === 'presente' ? 'P' : pres.stato === 'assente' ? 'AS' : null);
    const date = new Date(anno, mese - 1, day);
    const fer = ferieDi(dipId, isoD(date));
    if (fer) return fer.tipo === 'Permesso' ? 'PE' : fer.tipo === 'Malattia' ? 'M' : fer.tipo === 'ROL' ? 'R' : 'F';
    const t = turnoDi(dipId, date);
    if (t) { const n = nomeTurnoId(t.turno_id); return n === 'Riposo' ? 'RS' : n === 'Ferie' ? 'F' : n ? 'P' : null; }
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
    const oggi = new Date().toISOString().split('T')[0];
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
        data: d.toISOString().split('T')[0],
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
              style={{ border: penna === t.code ? "3px solid #1E1B4B" : "1px solid #e5e7eb", background: penna === t.code ? t.color : "#fff", color: penna === t.code ? "#fff" : "#374151", borderRadius: 8, padding: "6px 10px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
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

  const salva = async (updates) => {
    setBusy(true);
    try {
      for (const u of updates) await axios.post(`${API}/assegnazioni-turni`, { ...u, settimana });
      await caricaSettimana(settimana);
    } finally { setBusy(false); }
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
  const generaProduzione = async () => {
    const BASE = {
      luigi:    ["Riposo","Mattina 7-15","Mattina 7-15","Mattina 7-15","Mattina 7-15","Lunga","Mattina 7-15"],
      angela:   ["Mattina 7-15","Mattina 8-16","Mattina 8-16","Riposo","Lunga","Mattina 7-15","Mattina 7-15"],
      giuliano: ["Lunga","Pomeriggio","Riposo","Mattina 8-16","Pomeriggio","Mattina 8-16","Mattina 8-16"],
      liliana:  ["Mattina 8-16","Lunga","Pomeriggio","Mattina 7-15","Riposo","Pomeriggio","Pomeriggio"],
      carmine:  ["Pomeriggio","Riposo","Lunga","Pomeriggio","Mattina 8-16","Mattina 7-15","Pomeriggio"],
      mario:    ["Mattina 7-15","Mattina 8-16","Mattina 7-15","Lunga","Mattina 7-15","Pomeriggio","Riposo"],
    };
    const updates = [];
    dipendenti.filter(isTeam).forEach(dip => {
      const row = BASE[(dip.nome || "").trim().toLowerCase()];
      if (row) row.forEach((nome, gi) => updates.push({ dipendente_id: dip.id, giorno: giorni[gi], turno_id: idTurno(nome) || null }));
    });
    // Bar: due gruppi che si alternano mattina/pomeriggio a settimane alterne
    const setBar = (cognomi, turnoNome) => {
      dipendenti.filter(d => cognomi.some(c => (d.cognome || "").toLowerCase().includes(c))).forEach(dip => {
        for (let gi = 0; gi < 6; gi++) updates.push({ dipendente_id: dip.id, giorno: giorni[gi], turno_id: idTurno(turnoNome) || null });
        updates.push({ dipendente_id: dip.id, giorno: "Domenica", turno_id: idTurno("Riposo") || null });
      });
    };
    const g1 = ["vespa", "capezzuto"], g2 = ["parisi", "moscato"];
    if (settimanaPari) { setBar(g1, "Bar 6:30-15"); setBar(g2, "Bar 15-21"); }
    else { setBar(g1, "Bar 15-21"); setBar(g2, "Bar 6:30-15"); }
    if (updates.length) await salva(updates);
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
                style={{ backgroundColor: t.colore, cursor: "pointer", outline: sel ? "3px solid #1E1B4B" : "none", opacity: evid && !sel ? 0.45 : 1 }}>
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
        <button onClick={generaProduzione} disabled={busy}
          style={{ marginLeft: "auto", background: "#5b7a6b", color: "#fff", border: "none", padding: "10px 18px", borderRadius: 10, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Attendi…" : "Genera settimana"}
        </button>
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
            {dipendenti.map(dip => (
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
                    <td key={g}>
                      <select
                        value={ass?.turno_id || ""}
                        onChange={e => handleAssegna(dip, g, e.target.value)}
                        className="dc-turno-select"
                        style={{
                          ...(turno ? { backgroundColor: turno.colore + '30', borderColor: turno.colore } : {}),
                          ...(evid ? (ass?.turno_id === evid
                            ? { outline: "3px solid " + ((getTurno(evid) || {}).colore || "#1E1B4B"), opacity: 1 }
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
  const totBuste = dipendenti.reduce((s, d) => s + (parseFloat(get(d.id).importo_busta) || 0), 0);
  const totBonifici = dipendenti.reduce((s, d) => s + (parseFloat(get(d.id).bonifico_importo) || 0), 0);
  const totAcconti = dipendenti.reduce((s, d) => s + (get(d.id).acconti || []).reduce((a, x) => a + (parseFloat(x.importo) || 0), 0), 0);
  const inp = { border: "1px solid #d1d5db", borderRadius: 8, padding: "7px 9px", fontSize: 14, width: "100%", boxSizing: "border-box" };

  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <div>
          <h1>Buste Paga</h1>
          <p>Importo busta, bonifico ricevuto e acconti · tutto salvato sul database</p>
        </div>
        <div className="dc-page-actions">
          <input ref={fileRef} type="file" accept=".pdf,.zip,application/pdf,application/zip,application/x-zip-compressed" multiple onChange={handleImportLul} style={{ display: "none" }} />
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            style={{ background: "#5b7a6b", color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 700, cursor: importing ? "default" : "pointer", opacity: importing ? 0.6 : 1 }}>
            {importing ? "Importo…" : "Importa tutti i documenti"}
          </button>
          <button onClick={handleImportEmail} disabled={importing} title="Scarica gli allegati PDF dalla casella di posta (inbox e cartelle)"
            style={{ background: "#3f5a4e", color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 700, cursor: importing ? "default" : "pointer", opacity: importing ? 0.6 : 1 }}>
            {importing ? "…" : "Importa da email"}
          </button>
          <select value={mese} onChange={e => setMese(+e.target.value)} className="dc-select">
            {mesi.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={anno} onChange={e => setAnno(+e.target.value)} className="dc-select">
            {[2022, 2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
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
              {(d.prestito_importo !== "" || d.tfr_anticipo_importo !== "" || d.acconto_cedolino !== "") && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTop: "1px dashed #e6e0d4" }}>
                  {d.acconto_cedolino !== "" && (
                    <span style={{ background: "#e8efe9", color: "#2a4d3a", border: "1px solid #cfe0d4", borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                      Acconto dal cedolino: € {eur(d.acconto_cedolino)}{d.saldo_residuo !== "" ? ` · saldo da pagare € ${eur(d.saldo_residuo)}` : ""}
                    </span>
                  )}
                    <span style={{ background: "#efe9f6", color: "#6a4a86", border: "1px solid #ddd0ec", borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                      Prestito {mesi[mese - 1]}: € {eur(d.prestito_importo)} · saldo € {eur(d.prestito_saldo)}
                    </span>
                  )}
                  {d.tfr_anticipo_importo !== "" && (
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    await axios.post(`${API}/documenti`, formData);
    setShowModal(false);
    reload();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Eliminare questo documento?")) return;
    await axios.delete(`${API}/documenti/${id}`);
    reload();
  };

  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <div>
          <h1>Documenti Dipendenti</h1>
          <p>Archivio documenti e certificati</p>
        </div>
        <button onClick={() => setShowModal(true)} className="dc-btn dc-btn-primary">
          <Plus size={18} /> Nuovo Documento
        </button>
      </div>

      <div className="dc-documenti-grid">
        {documenti.map((doc) => {
          const dip = getDipendente(doc.dipendente_id);
          const isExpiring = doc.scadenza && new Date(doc.scadenza) < new Date(Date.now() + 30*24*60*60*1000);
          return (
            <div key={doc.id} className="dc-documento-card">
              <div className="dc-documento-header">
                <div className="dc-documento-icon"><FileText size={24} /></div>
                <button onClick={() => handleDelete(doc.id)} className="dc-btn-icon dc-btn-danger"><Trash2 size={16} /></button>
              </div>
              <h4>{doc.titolo}</h4>
              <p className="dc-documento-user">{dip?.nome} {dip?.cognome}</p>
              <div className="dc-documento-footer">
                <Badge>{doc.tipo}</Badge>
                {doc.scadenza && (
                  <span className={isExpiring ? "dc-text-red" : "dc-text-gray"}>
                    Scade: {formatDate(doc.scadenza)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

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
