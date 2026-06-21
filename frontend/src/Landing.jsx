import React from "react";
import { useNavigate } from "react-router-dom";
import { Users, Briefcase, ChevronRight } from "lucide-react";

const wrap = {
  minHeight: "100vh", background: "#faf7f0", display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", padding: 24,
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: "#3f5a4e",
};
const logo = {
  width: 64, height: 64, borderRadius: 18, margin: "0 auto 14px",
  background: "linear-gradient(135deg,#5b7a6b,#3f5a4e)", display: "flex",
  alignItems: "center", justifyContent: "center", color: "#fff",
};
const card = {
  width: "100%", maxWidth: 460, background: "#fff", border: "1px solid #e6e0d4",
  borderRadius: 16, boxShadow: "0 4px 18px rgba(63,90,78,.10)", padding: 18,
  marginTop: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 14,
};
const iconBox = (c) => ({
  width: 46, height: 46, borderRadius: 12, background: c, display: "flex",
  alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0,
});

export default function Landing() {
  const nav = useNavigate();
  return (
    <div style={wrap}>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={logo}><Users size={30} /></div>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Dipendenti Ceraldi</h1>
        <div style={{ color: "#6b7669", fontSize: 14, marginTop: 2 }}>Scegli come entrare</div>
      </div>

      <div style={card} onClick={() => nav("/portale")}>
        <div style={iconBox("linear-gradient(135deg,#5b7a6b,#3f5a4e)")}><Users size={24} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Portale dipendente</div>
          <div style={{ color: "#6b7669", fontSize: 13 }}>Turni, buste paga, richieste, avvisi — accesso con PIN</div>
        </div>
        <ChevronRight size={20} color="#6b7669" />
      </div>

      <div style={card} onClick={() => nav("/dipendenti")}>
        <div style={iconBox("linear-gradient(135deg,#3f5a4e,#5b7a6b)")}><Briefcase size={24} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Gestione ufficio</div>
          <div style={{ color: "#6b7669", fontSize: 13 }}>Anagrafica, presenze, ferie, turni, buste, missioni, documenti</div>
        </div>
        <ChevronRight size={20} color="#6b7669" />
      </div>
    </div>
  );
}
