import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App.jsx'
import PortaleDipendente from './PortaleDipendente.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Navigate to="/dipendenti" replace />} />
      <Route path="/portale" element={<PortaleDipendente />} />
      <Route path="/dipendenti" element={<App page="dashboard" />} />
      <Route path="/dipendenti/:page" element={<App />} />
    </Routes>
  </BrowserRouter>
)
