import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App.jsx'
import PortaleDipendente from './PortaleDipendente.jsx'
import Landing from './Landing.jsx'
import './index.css'

// L'area gestione è riservata all'admin: chi non è admin loggato va al portale.
function RequireAdmin({ children }) {
  const role = typeof window !== 'undefined' ? localStorage.getItem('pt_role') : null
  if (role !== 'admin') return <Navigate to="/portale" replace />
  return children
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/portale" element={<PortaleDipendente />} />
      <Route path="/dipendenti" element={<RequireAdmin><App page="dashboard" /></RequireAdmin>} />
      <Route path="/dipendenti/:page" element={<RequireAdmin><App /></RequireAdmin>} />
    </Routes>
  </BrowserRouter>
)
