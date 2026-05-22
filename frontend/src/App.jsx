import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import {
  Users, Calendar, Clock, FileText, Home,
  ChevronRight, Plus, Check, X, Edit2, Trash2,
  MapPin, Euro, ChevronLeft, Grid3X3,
  User, FolderOpen,
} from "lucide-react";
import "./App.css";

const API = "/api/dipendenti-cloud";

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const getInitials = (nome, cognome) =>
  `${nome?.[0] || ""}${cognome?.[0] || ""}`.toUpperCase();

const AVATAR_COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4","#84cc16"];
const getAvatarColor = (str) => {
  let hash = 0;
  for (let i = 0; i < (str || "").length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const Badge = ({ children, variant = "default" }) => {
  const variants = {
    default: "dc-badge-default", success: "dc-badge-success",
    warning: "dc-badge-warning", danger: "dc-badge-danger", info: "dc-badge-info",
  };
  return <span className={`dc-badge ${variants[variant]}`}>{children}</span>;
};

const Avatar = ({ nome, cognome, size = "md" }) => {
  const sizes = { sm: "dc-avatar-sm", md: "dc-avatar-md", lg: "dc-avatar-lg" };
  return (
    <div className={`dc-avatar ${sizes[size]}`} style={{ backgroundColor: getAvatarColor(`${nome}${cognome}`) }}>
      {getInitials(nome, cognome)}
    </div>
  );
};

export default function App({ page: pageProp }) {
  const { page: pageParam } = useParams();
  const currentPage = pageProp || pageParam || "dashboard";

  const [dipendenti, setDipendenti] = useState([]);
  const [ferie, setFerie] = useState([]);
  const [turni, setTurni] = useState([]);
  const [bustePaga, setBustePaga] = useState([]);
  const [missioni, setMissioni] = useState([]);
  const [documenti, setDocumenti] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [dipRes, ferRes, turRes, missRes, docRes, statsRes] = await Promise.all([
        axios.get(`${API}/dipendenti`),
        axios.get(`${API}/ferie`),
        axios.get(`${API}/turni`),
        axios.get(`${API}/missioni`),
        axios.get(`${API}/documenti`),
        axios.get(`${API}/dashboard/stats`),
      ]);
      setDipendenti(dipRes.data || []);
      setFerie(ferRes.data || []);
      setTurni(turRes.data || []);
      setMissioni(missRes.data || []);
      setDocumenti(docRes.data || []);
      setStats(statsRes.data || {});
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const getDipendente = (id) => dipendenti.find((d) => d.id === id);
  const activeDipendenti = dipendenti.filter((d) => d.stato === "attivo");

  const menuItems = [
    { id: "dashboard", label: "Pannello di controllo", icon: Home, section: "GESTIONE" },
    { id: "anagrafica", label: "Anagrafica", icon: User, section: "DIPENDENTI" },
    { id: "presenze", label: "Presenze", icon: Calendar, section: "DIPENDENTI" },
    { id: "ferie-permessi", label: "Ferie & Permessi", icon: Calendar, section: "DIPENDENTI" },
    { id: "turni", label: "Turni", icon: Grid3X3, section: "DIPENDENTI" },
    { id: "buste-paga", label: "Buste Paga", icon: Euro, section: "DIPENDENTI" },
    { id: "missioni", label: "Missioni", icon: MapPin, section: "DIPENDENTI" },
    { id: "documenti", label: "Documenti", icon: FolderOpen, section: "DIPENDENTI" },
  ];

  const pageLabels = {
    dashboard: "Pannello di controllo", anagrafica: "Anagrafica",
    presenze: "Presenze", "ferie-permessi": "Ferie & Permessi",
    turni: "Turni", "buste-paga": "Buste Paga",
    missioni: "Missioni", documenti: "Documenti",
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
      case "dashboard": return <DashboardPage stats={stats} dipendenti={dipendenti} ferie={ferie} missioni={missioni} getDipendente={getDipendente} />;
      case "anagrafica": return <AnagraficaPage dipendenti={dipendenti} reload={loadData} />;
      case "presenze": return <PresenzePage dipendenti={activeDipendenti} reload={loadData} />;
      case "ferie-permessi": return <FeriePage dipendenti={activeDipendenti} ferie={ferie} reload={loadData} getDipendente={getDipendente} />;
      case "turni": return <TurniPage dipendenti={activeDipendenti} turni={turni} reload={loadData} />;
      case "buste-paga": return <BustePagaPage dipendenti={dipendenti} bustePaga={bustePaga} reload={loadData} getDipendente={getDipendente} />;
      case "missioni": return <MissioniPage dipendenti={activeDipendenti} missioni={missioni} reload={loadData} getDipendente={getDipendente} />;
      case "documenti": return <DocumentiPage dipendenti={dipendenti} documenti={documenti} reload={loadData} getDipendente={getDipendente} />;
      default: return <DashboardPage stats={stats} dipendenti={dipendenti} ferie={ferie} missioni={missioni} getDipendente={getDipendente} />;
    }
  };

  const sections = {};
  menuItems.forEach((item) => {
    if (!sections[item.section]) sections[item.section] = [];
    sections[item.section].push(item);
  });

  return (
    <div className="dc-app">
      <aside className="dc-sidebar">
        <div className="dc-sidebar-header">
          <div className="dc-sidebar-logo">
            <Users size={28} />
            <div>
              <span className="dc-logo-title">Dipendenti</span>
              <span className="dc-logo-subtitle">in Cloud</span>
            </div>
          </div>
        </div>

        <nav className="dc-sidebar-nav">
          {Object.entries(sections).map(([section, items]) => (
            <div key={section} className="dc-sidebar-section">
              <div className="dc-sidebar-section-title">{section}</div>
              {items.map((item) => (
                <Link
                  key={item.id}
                  to={`/dipendenti/${item.id}`}
                  className={`dc-sidebar-item ${currentPage === item.id ? "active" : ""}`}
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
            <div className="dc-avatar dc-avatar-sm" style={{ backgroundColor: "#10b981" }}>CG</div>
            <div className="dc-user-info">
              <span className="dc-user-name">Ceraldi Group</span>
              <span className="dc-user-role">Amministratore</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="dc-main">
        <div className="dc-breadcrumb">
          <span>Gestione</span>
          <ChevronRight size={14} />
          <span className="dc-breadcrumb-current">{pageLabels[currentPage] || currentPage}</span>
          <div className="dc-breadcrumb-company">Ceraldi Group SRL</div>
        </div>
        <div className="dc-content">{renderPage()}</div>
      </main>
    </div>
  );
}

// ==================== PAGES ====================

function DashboardPage({ stats, dipendenti, ferie, missioni, getDipendente }) {
  const attivi = dipendenti.filter((d) => d.stato === "attivo").length;
  const pendingFerie = ferie.filter((f) => f.stato === "in_attesa");
  const pendingMissioni = missioni.filter((m) => m.stato === "in_attesa");
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

function AnagraficaPage({ dipendenti, reload }) {
  const [showModal, setShowModal] = useState(false);
  const [editingDip, setEditingDip] = useState(null);
  const [formData, setFormData] = useState({ nome: "", cognome: "", ruolo: "", email: "", telefono: "", codice_fiscale: "", contratto: "Indeterminato", iban: "", stato: "attivo" });
  const [filter, setFilter] = useState("tutti");

  const filteredDipendenti = dipendenti.filter((d) => {
    if (filter === "attivi") return d.stato === "attivo";
    if (filter === "inattivi") return d.stato !== "attivo";
    return true;
  });

  const openModal = (dip = null) => {
    if (dip) { setEditingDip(dip); setFormData({ ...dip }); }
    else { setEditingDip(null); setFormData({ nome: "", cognome: "", ruolo: "", email: "", telefono: "", codice_fiscale: "", contratto: "Indeterminato", iban: "", stato: "attivo" }); }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingDip) await axios.put(`${API}/dipendenti/${editingDip.id}`, formData);
      else await axios.post(`${API}/dipendenti`, formData);
      setShowModal(false); reload();
    } catch (error) { alert("Errore nel salvataggio"); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Eliminare questo dipendente?")) return;
    await axios.delete(`${API}/dipendenti/${id}`); reload();
  };

  const attivi = dipendenti.filter((d) => d.stato === "attivo").length;

  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <div>
          <h1>Anagrafica Dipendenti</h1>
          <p>{dipendenti.length} totali, {attivi} attivi</p>
        </div>
        <div className="dc-page-actions">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="dc-select">
            <option value="tutti">Tutti ({dipendenti.length})</option>
            <option value="attivi">Attivi ({attivi})</option>
            <option value="inattivi">Inattivi ({dipendenti.length - attivi})</option>
          </select>
          <button onClick={() => openModal()} className="dc-btn dc-btn-primary"><Plus size={18} /> Nuovo Dipendente</button>
        </div>
      </div>
      <div className="dc-card">
        <table className="dc-table">
          <thead>
            <tr><th>DIPENDENTE</th><th>RUOLO</th><th>CONTRATTO</th><th>STATO</th><th>AZIONI</th></tr>
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
                <td>{dip.ruolo || "-"}</td>
                <td>{dip.contratto}</td>
                <td><Badge variant={dip.stato === "attivo" ? "success" : "default"}>{dip.stato}</Badge></td>
                <td className="dc-table-actions">
                  <button onClick={() => openModal(dip)} className="dc-btn-icon"><Edit2 size={16} /></button>
                  <button onClick={() => handleDelete(dip.id)} className="dc-btn-icon dc-btn-danger"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showModal && (
        <div className="dc-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dc-modal-header">
              <h3>{editingDip ? "Modifica Dipendente" : "Nuovo Dipendente"}</h3>
              <button onClick={() => setShowModal(false)} className="dc-modal-close"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="dc-modal-body">
              <div className="dc-form-grid">
                <div className="dc-form-group"><label>Nome *</label><input required value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} /></div>
                <div className="dc-form-group"><label>Cognome *</label><input required value={formData.cognome} onChange={(e) => setFormData({ ...formData, cognome: e.target.value })} /></div>
                <div className="dc-form-group"><label>Email</label><input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} /></div>
                <div className="dc-form-group"><label>Telefono</label><input value={formData.telefono} onChange={(e) => setFormData({ ...formData, telefono: e.target.value })} /></div>
                <div className="dc-form-group"><label>Ruolo</label><input value={formData.ruolo} onChange={(e) => setFormData({ ...formData, ruolo: e.target.value })} /></div>
                <div className="dc-form-group"><label>Codice Fiscale</label><input value={formData.codice_fiscale} onChange={(e) => setFormData({ ...formData, codice_fiscale: e.target.value.toUpperCase() })} /></div>
                <div className="dc-form-group">
                  <label>Contratto</label>
                  <select value={formData.contratto} onChange={(e) => setFormData({ ...formData, contratto: e.target.value })}>
                    <option>Indeterminato</option><option>Determinato</option><option>Part-time</option><option>Apprendistato</option>
                  </select>
                </div>
                <div className="dc-form-group">
                  <label>Stato</label>
                  <select value={formData.stato} onChange={(e) => setFormData({ ...formData, stato: e.target.value })}>
                    <option value="attivo">Attivo</option><option value="inattivo">Inattivo</option>
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

function PresenzePage({ dipendenti, reload }) {
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [mese, setMese] = useState(new Date().getMonth() + 1);
  const [presenze, setPresenze] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ dipendente_id: "", tipo: "P", data_inizio: "", data_fine: "", nota: "" });

  const mesi = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  const daysInMonth = new Date(anno, mese, 0).getDate();

  const loadPresenze = async () => {
    try {
      const res = await axios.get(`${API}/presenze?anno=${anno}&mese=${mese}`);
      setPresenze(res.data || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadPresenze(); }, [anno, mese]);

  const getPresenza = (dipId, day) => {
    const dataStr = `${anno}-${String(mese).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    return presenze.find((p) => p.dipendente_id === dipId && p.data === dataStr);
  };

  const handleTuttiPresenti = async () => {
    if (!window.confirm("Segnare tutti come presenti per oggi?")) return;
    const oggi = new Date().toISOString().split("T")[0];
    const batch = dipendenti.map((d) => ({ dipendente_id: d.id, data: oggi, stato: "presente", entrata: "09:00", uscita: "18:00" }));
    await axios.post(`${API}/presenze/batch`, batch); loadPresenze();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const start = new Date(formData.data_inizio); const end = new Date(formData.data_fine); const batch = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      batch.push({ dipendente_id: formData.dipendente_id, data: d.toISOString().split("T")[0], stato: formData.tipo === "P" ? "presente" : "giustificato", giustificativo: formData.tipo, note: formData.nota });
    }
    await axios.post(`${API}/presenze/batch`, batch); setShowModal(false); loadPresenze();
  };

  const tipiGiustificativo = [
    { code: "P", label: "Presente", color: "#10b981" }, { code: "UN", label: "Assente", color: "#ef4444" },
    { code: "F", label: "Ferie", color: "#3b82f6" }, { code: "PE", label: "Permesso", color: "#8b5cf6" },
    { code: "M", label: "Malattia", color: "#f59e0b" }, { code: "R", label: "ROL", color: "#06b6d4" },
    { code: "CH", label: "Chiuso", color: "#6b7280" }, { code: "RS", label: "Riposo Sett.", color: "#9ca3af" },
    { code: "T", label: "Trasferimento", color: "#ec4899" }, { code: "X", label: "Cessato", color: "#374151" },
    { code: "FNL", label: "Festività", color: "#a855f7" },
  ];

  const totalePresenti = presenze.filter((p) => p.stato === "presente").length;
  const totaleAssenti = presenze.filter((p) => p.stato === "assente").length;
  const prevMonth = () => { if (mese === 1) { setMese(12); setAnno(anno - 1); } else setMese(mese - 1); };
  const nextMonth = () => { if (mese === 12) { setMese(1); setAnno(anno + 1); } else setMese(mese + 1); };

  return (
    <div className="dc-page">
      <div className="dc-page-header"><h1>Presenze Mensili</h1><p>{dipendenti.length} dipendenti attivi</p></div>
      <div className="dc-presenze-stats">
        <div className="dc-presenze-stat"><span className="dc-presenze-stat-label">PRESENTI</span><span className="dc-presenze-stat-value dc-text-green">{totalePresenti}</span></div>
        <div className="dc-presenze-stat"><span className="dc-presenze-stat-label">ASSENTI</span><span className="dc-presenze-stat-value dc-text-red">{totaleAssenti}</span></div>
        <div className="dc-month-nav">
          <button onClick={prevMonth} className="dc-btn-icon"><ChevronLeft size={20} /></button>
          <span className="dc-month-label">{mesi[mese - 1]} {anno}</span>
          <button onClick={nextMonth} className="dc-btn-icon"><ChevronRight size={20} /></button>
        </div>
        <button onClick={handleTuttiPresenti} className="dc-btn dc-btn-success"><Check size={16} /> Tutti Presenti</button>
        <button onClick={() => setShowModal(true)} className="dc-btn dc-btn-primary"><Plus size={16} /> Giustificativo</button>
      </div>
      <div className="dc-card dc-presenze-grid-container">
        <table className="dc-presenze-table">
          <thead>
            <tr>
              <th className="dc-presenze-th-name">Dipendente</th>
              {Array.from({ length: daysInMonth }, (_, i) => {
                const date = new Date(anno, mese - 1, i + 1);
                const dayNames = ["D","L","M","M","G","V","S"];
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                return (
                  <th key={i} className={`dc-presenze-th-day ${isWeekend ? "weekend" : ""}`}>
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
                    <span>{dip.cognome} {dip.nome?.[0]}.</span>
                  </div>
                </td>
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const pres = getPresenza(dip.id, i + 1);
                  const date = new Date(anno, mese - 1, i + 1);
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  const tipo = tipiGiustificativo.find((t) => t.code === (pres?.giustificativo || (pres?.stato === "presente" ? "P" : "")));
                  return (
                    <td key={i} className={`dc-presenze-td-day ${isWeekend ? "weekend" : ""}`}>
                      {pres ? (
                        <span className="dc-presenza-badge" style={{ backgroundColor: tipo?.color || "#10b981" }}>
                          {pres.giustificativo || (pres.stato === "presente" ? "P" : pres.stato?.[0]?.toUpperCase())}
                        </span>
                      ) : (<span className="dc-presenza-empty">-</span>)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showModal && (
        <div className="dc-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="dc-modal dc-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="dc-modal-header">
              <h3>Nuovo Giustificativo</h3>
              <button onClick={() => setShowModal(false)} className="dc-modal-close"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="dc-modal-body">
              <div className="dc-form-group">
                <label>Dipendente *</label>
                <select required value={formData.dipendente_id} onChange={(e) => setFormData({ ...formData, dipendente_id: e.target.value })}>
                  <option value="">Seleziona dipendente...</option>
                  {dipendenti.map((d) => (<option key={d.id} value={d.id}>{d.cognome} {d.nome}</option>))}
                </select>
              </div>
              <div className="dc-form-group">
                <label>Tipo Giustificativo *</label>
                <div className="dc-giustificativo-grid">
                  {tipiGiustificativo.map((t) => (
                    <button type="button" key={t.code} onClick={() => setFormData({ ...formData, tipo: t.code })}
                      className={`dc-giustificativo-btn ${formData.tipo === t.code ? "active" : ""}`}
                      style={{ borderColor: formData.tipo === t.code ? t.color : "#e5e7eb", backgroundColor: formData.tipo === t.code ? t.color : "white", color: formData.tipo === t.code ? "white" : "#374151" }}>
                      <span className="dc-giust-code">{t.code}</span>
                      <span className="dc-giust-label">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="dc-form-row">
                <div className="dc-form-group"><label>Data Inizio *</label><input type="date" required value={formData.data_inizio} onChange={(e) => setFormData({ ...formData, data_inizio: e.target.value })} /></div>
                <div className="dc-form-group"><label>Data Fine *</label><input type="date" required value={formData.data_fine} onChange={(e) => setFormData({ ...formData, data_fine: e.target.value })} /></div>
              </div>
              <div className="dc-form-group"><label>Nota (facoltativa)</label><textarea value={formData.nota} onChange={(e) => setFormData({ ...formData, nota: e.target.value })} /></div>
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

function FeriePage({ dipendenti, ferie, reload, getDipendente }) {
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ dipendente_id: "", tipo: "Ferie", data_inizio: "", data_fine: "", giorni: 1, nota: "" });

  const handleSubmit = async (e) => { e.preventDefault(); await axios.post(`${API}/ferie`, formData); setShowModal(false); reload(); };
  const handleApprova = async (id) => { await axios.put(`${API}/ferie/${id}/approva`); reload(); };
  const handleRifiuta = async (id) => { await axios.put(`${API}/ferie/${id}/rifiuta`); reload(); };

  return (
    <div className="dc-page">
      <div className="dc-page-header"><div><h1>Ferie & Permessi</h1><p>Gestione richieste</p></div><button onClick={() => setShowModal(true)} className="dc-btn dc-btn-primary"><Plus size={18} /> Nuova Richiesta</button></div>
      <div className="dc-card">
        <table className="dc-table">
          <thead><tr><th>DIPENDENTE</th><th>TIPO</th><th>PERIODO</th><th>GIORNI</th><th>STATO</th><th>AZIONI</th></tr></thead>
          <tbody>
            {ferie.map((f) => {
              const dip = getDipendente(f.dipendente_id);
              return (
                <tr key={f.id}>
                  <td><div className="dc-table-user"><Avatar nome={dip?.nome} cognome={dip?.cognome} size="sm" /><span>{dip?.nome} {dip?.cognome}</span></div></td>
                  <td>{f.tipo}</td><td>{formatDate(f.data_inizio)} - {formatDate(f.data_fine)}</td><td>{f.giorni}</td>
                  <td><Badge variant={f.stato === "approvata" ? "success" : f.stato === "rifiutata" ? "danger" : "warning"}>{f.stato}</Badge></td>
                  <td className="dc-table-actions">
                    {f.stato === "in_attesa" && (<><button onClick={() => handleApprova(f.id)} className="dc-btn-icon dc-btn-success"><Check size={16} /></button><button onClick={() => handleRifiuta(f.id)} className="dc-btn-icon dc-btn-danger"><X size={16} /></button></>)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {showModal && (
        <div className="dc-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dc-modal-header"><h3>Nuova Richiesta</h3><button onClick={() => setShowModal(false)} className="dc-modal-close"><X size={20} /></button></div>
            <form onSubmit={handleSubmit} className="dc-modal-body">
              <div className="dc-form-group"><label>Dipendente *</label><select required value={formData.dipendente_id} onChange={(e) => setFormData({ ...formData, dipendente_id: e.target.value })}><option value="">Seleziona...</option>{dipendenti.map((d) => (<option key={d.id} value={d.id}>{d.nome} {d.cognome}</option>))}</select></div>
              <div className="dc-form-group"><label>Tipo</label><select value={formData.tipo} onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}><option>Ferie</option><option>Permesso</option><option>ROL</option><option>Malattia</option></select></div>
              <div className="dc-form-row">
                <div className="dc-form-group"><label>Data Inizio</label><input type="date" required value={formData.data_inizio} onChange={(e) => setFormData({ ...formData, data_inizio: e.target.value })} /></div>
                <div className="dc-form-group"><label>Data Fine</label><input type="date" required value={formData.data_fine} onChange={(e) => setFormData({ ...formData, data_fine: e.target.value })} /></div>
              </div>
              <div className="dc-form-group"><label>Giorni</label><input type="number" min="1" value={formData.giorni} onChange={(e) => setFormData({ ...formData, giorni: +e.target.value })} /></div>
              <div className="dc-modal-footer"><button type="button" onClick={() => setShowModal(false)} className="dc-btn">Annulla</button><button type="submit" className="dc-btn dc-btn-primary">Crea Richiesta</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TurniPage({ dipendenti, turni, reload }) {
  const [assegnazioni, setAssegnazioni] = useState([]);
  const giorni = ["Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato","Domenica"];
  useEffect(() => { axios.get(`${API}/assegnazioni-turni`).then((res) => setAssegnazioni(res.data || [])).catch(() => {}); }, []);
  const getAss = (dipId, giorno) => assegnazioni.find((a) => a.dipendente_id === dipId && a.giorno === giorno);
  const getTurno = (id) => turni.find((t) => t.id === id);
  const handleAssegna = async (dipId, giorno, turnoId) => {
    await axios.post(`${API}/assegnazioni-turni`, { dipendente_id: dipId, giorno, turno_id: turnoId || null });
    const res = await axios.get(`${API}/assegnazioni-turni`); setAssegnazioni(res.data || []);
  };
  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <div><h1>Gestione Turni</h1><p>Assegnazione turni settimanali</p></div>
        <div className="dc-turni-legend">{turni.map((t) => (<span key={t.id} className="dc-turno-badge" style={{ backgroundColor: t.colore }}>{t.nome}: {t.orario_inizio}-{t.orario_fine}</span>))}</div>
      </div>
      <div className="dc-card">
        <table className="dc-table dc-turni-table">
          <thead><tr><th>DIPENDENTE</th>{giorni.map((g) => (<th key={g}>{g}</th>))}</tr></thead>
          <tbody>
            {dipendenti.map((dip) => (
              <tr key={dip.id}>
                <td><div className="dc-table-user"><Avatar nome={dip.nome} cognome={dip.cognome} size="sm" /><span>{dip.cognome} {dip.nome?.[0]}.</span></div></td>
                {giorni.map((g) => {
                  const ass = getAss(dip.id, g); const turno = ass ? getTurno(ass.turno_id) : null;
                  return (<td key={g}><select value={ass?.turno_id || ""} onChange={(e) => handleAssegna(dip.id, g, e.target.value)} className="dc-turno-select" style={turno ? { backgroundColor: turno.colore + "30", borderColor: turno.colore } : {}}><option value="">-</option>{turni.map((t) => (<option key={t.id} value={t.id}>{t.nome}</option>))}</select></td>);
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BustePagaPage({ dipendenti, reload, getDipendente }) {
  const [bustePaga, setBustePaga] = useState([]);
  const [selectedDip, setSelectedDip] = useState("");
  const [anno, setAnno] = useState(new Date().getFullYear());
  const mesi = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  const loadBuste = async () => {
    const params = new URLSearchParams();
    if (anno) params.append("anno", anno);
    if (selectedDip) params.append("dipendente_id", selectedDip);
    const res = await axios.get(`${API}/buste-paga?${params}`); setBustePaga(res.data || []);
  };
  useEffect(() => { loadBuste(); }, [anno, selectedDip]);
  const totaleNetto = bustePaga.reduce((sum, b) => sum + (b.netto || 0), 0);
  const totaleLordo = bustePaga.reduce((sum, b) => sum + (b.lordo || 0), 0);
  return (
    <div className="dc-page">
      <div className="dc-page-header">
        <div><h1>Buste Paga</h1><p>Cedolini e retribuzioni</p></div>
        <div className="dc-page-actions">
          <select value={selectedDip} onChange={(e) => setSelectedDip(e.target.value)} className="dc-select"><option value="">Tutti i dipendenti</option>{dipendenti.map((d) => (<option key={d.id} value={d.id}>{d.cognome} {d.nome}</option>))}</select>
          <select value={anno} onChange={(e) => setAnno(+e.target.value)} className="dc-select">{[2024,2025,2026].map((y) => (<option key={y} value={y}>{y}</option>))}</select>
        </div>
      </div>
      <div className="dc-buste-stats">
        <div className="dc-buste-stat dc-buste-stat-blue"><span className="dc-buste-stat-label">CEDOLINI ANNO</span><span className="dc-buste-stat-value">{bustePaga.length}</span></div>
        <div className="dc-buste-stat dc-buste-stat-green"><span className="dc-buste-stat-label">TOTALE NETTO</span><span className="dc-buste-stat-value">€ {totaleNetto.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span></div>
        <div className="dc-buste-stat dc-buste-stat-cyan"><span className="dc-buste-stat-label">TOTALE LORDO</span><span className="dc-buste-stat-value">€ {totaleLordo.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span></div>
      </div>
      <div className="dc-card">
        <table className="dc-table">
          <thead><tr><th>DIPENDENTE</th><th>MESE</th><th>ANNO</th><th>NETTO</th><th>LORDO</th><th>STATO</th></tr></thead>
          <tbody>
            {bustePaga.map((b) => (
              <tr key={b.id}>
                <td>{b.dipendente_nome || getDipendente(b.dipendente_id)?.nome || "-"}</td>
                <td>{mesi[(b.mese || 1) - 1]}</td><td>{b.anno}</td>
                <td className="dc-text-green">€{b.netto?.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</td>
                <td>€{b.lordo?.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</td>
                <td><Badge variant={b.stato === "PAGATO" ? "success" : "warning"}>{b.stato}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MissioniPage({ dipendenti, missioni, reload, getDipendente }) {
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ dipendente_id: "", destinazione: "", data_inizio: "", data_fine: "", scopo: "", rimborso: 0 });
  const handleSubmit = async (e) => { e.preventDefault(); await axios.post(`${API}/missioni`, formData); setShowModal(false); reload(); };
  const handleApprova = async (id) => { await axios.put(`${API}/missioni/${id}/approva`); reload(); };
  return (
    <div className="dc-page">
      <div className="dc-page-header"><div><h1>Missioni & Trasferte</h1><p>Gestione missioni</p></div><button onClick={() => setShowModal(true)} className="dc-btn dc-btn-primary"><Plus size={18} /> Nuova Missione</button></div>
      <div className="dc-card">
        <table className="dc-table">
          <thead><tr><th>DIPENDENTE</th><th>DESTINAZIONE</th><th>PERIODO</th><th>RIMBORSO</th><th>STATO</th><th>AZIONI</th></tr></thead>
          <tbody>
            {missioni.map((m) => {
              const dip = getDipendente(m.dipendente_id);
              return (
                <tr key={m.id}>
                  <td><div className="dc-table-user"><Avatar nome={dip?.nome} cognome={dip?.cognome} size="sm" /><span>{dip?.nome} {dip?.cognome}</span></div></td>
                  <td>{m.destinazione}</td><td>{formatDate(m.data_inizio)} - {formatDate(m.data_fine)}</td>
                  <td>€ {m.rimborso?.toFixed(2)}</td>
                  <td><Badge variant={m.stato === "approvata" ? "success" : "warning"}>{m.stato}</Badge></td>
                  <td className="dc-table-actions">{m.stato === "in_attesa" && (<button onClick={() => handleApprova(m.id)} className="dc-btn-icon dc-btn-success"><Check size={16} /></button>)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {showModal && (
        <div className="dc-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dc-modal-header"><h3>Nuova Missione</h3><button onClick={() => setShowModal(false)} className="dc-modal-close"><X size={20} /></button></div>
            <form onSubmit={handleSubmit} className="dc-modal-body">
              <div className="dc-form-group"><label>Dipendente *</label><select required value={formData.dipendente_id} onChange={(e) => setFormData({ ...formData, dipendente_id: e.target.value })}><option value="">Seleziona...</option>{dipendenti.map((d) => (<option key={d.id} value={d.id}>{d.nome} {d.cognome}</option>))}</select></div>
              <div className="dc-form-group"><label>Destinazione *</label><input required value={formData.destinazione} onChange={(e) => setFormData({ ...formData, destinazione: e.target.value })} /></div>
              <div className="dc-form-row">
                <div className="dc-form-group"><label>Data Inizio</label><input type="date" required value={formData.data_inizio} onChange={(e) => setFormData({ ...formData, data_inizio: e.target.value })} /></div>
                <div className="dc-form-group"><label>Data Fine</label><input type="date" required value={formData.data_fine} onChange={(e) => setFormData({ ...formData, data_fine: e.target.value })} /></div>
              </div>
              <div className="dc-form-group"><label>Scopo</label><input value={formData.scopo} onChange={(e) => setFormData({ ...formData, scopo: e.target.value })} /></div>
              <div className="dc-form-group"><label>Rimborso €</label><input type="number" min="0" value={formData.rimborso} onChange={(e) => setFormData({ ...formData, rimborso: +e.target.value })} /></div>
              <div className="dc-modal-footer"><button type="button" onClick={() => setShowModal(false)} className="dc-btn">Annulla</button><button type="submit" className="dc-btn dc-btn-primary">Crea Missione</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentiPage({ dipendenti, documenti, reload, getDipendente }) {
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ dipendente_id: "", titolo: "", tipo: "Contratto", scadenza: "" });
  const handleSubmit = async (e) => { e.preventDefault(); await axios.post(`${API}/documenti`, formData); setShowModal(false); reload(); };
  const handleDelete = async (id) => { if (!window.confirm("Eliminare?")) return; await axios.delete(`${API}/documenti/${id}`); reload(); };
  return (
    <div className="dc-page">
      <div className="dc-page-header"><div><h1>Documenti Dipendenti</h1><p>Archivio documenti</p></div><button onClick={() => setShowModal(true)} className="dc-btn dc-btn-primary"><Plus size={18} /> Nuovo Documento</button></div>
      <div className="dc-documenti-grid">
        {documenti.map((doc) => {
          const dip = getDipendente(doc.dipendente_id);
          const isExpiring = doc.scadenza && new Date(doc.scadenza) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
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
                {doc.scadenza && (<span className={isExpiring ? "dc-text-red" : "dc-text-gray"}>Scade: {formatDate(doc.scadenza)}</span>)}
              </div>
            </div>
          );
        })}
      </div>
      {showModal && (
        <div className="dc-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dc-modal-header"><h3>Nuovo Documento</h3><button onClick={() => setShowModal(false)} className="dc-modal-close"><X size={20} /></button></div>
            <form onSubmit={handleSubmit} className="dc-modal-body">
              <div className="dc-form-group"><label>Dipendente *</label><select required value={formData.dipendente_id} onChange={(e) => setFormData({ ...formData, dipendente_id: e.target.value })}><option value="">Seleziona...</option>{dipendenti.map((d) => (<option key={d.id} value={d.id}>{d.nome} {d.cognome}</option>))}</select></div>
              <div className="dc-form-group"><label>Titolo *</label><input required value={formData.titolo} onChange={(e) => setFormData({ ...formData, titolo: e.target.value })} /></div>
              <div className="dc-form-group"><label>Tipo</label><select value={formData.tipo} onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}><option>Contratto</option><option>CUD</option><option>Certificato</option><option>Altro</option></select></div>
              <div className="dc-form-group"><label>Scadenza</label><input type="date" value={formData.scadenza} onChange={(e) => setFormData({ ...formData, scadenza: e.target.value })} /></div>
              <div className="dc-modal-footer"><button type="button" onClick={() => setShowModal(false)} className="dc-btn">Annulla</button><button type="submit" className="dc-btn dc-btn-primary">Salva Documento</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
