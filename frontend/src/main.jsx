import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App.jsx'
import PortaleDipendente from './PortaleDipendente.jsx'
import Landing from './Landing.jsx'
import './index.css'

// L'area gestione è riservata all'admin. Eccezione: il responsabile turni può
// entrare SOLO nella pagina Turni dell'azienda (nient'altro).
function RequireRole({ children, roles }) {
  const role = typeof window !== 'undefined' ? localStorage.getItem('pt_role') : null
  if (!roles.includes(role)) return <Navigate to="/portale" replace />
  return children
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/portale" element={<PortaleDipendente />} />
      <Route path="/dipendenti/turni" element={<RequireRole roles={['admin','responsabile_turni']}><App page="turni" /></RequireRole>} />
      <Route path="/dipendenti" element={<RequireRole roles={['admin']}><App page="dashboard" /></RequireRole>} />
      <Route path="/dipendenti/:page" element={<RequireRole roles={['admin']}><App /></RequireRole>} />
    </Routes>
  </BrowserRouter>
)
