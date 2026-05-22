import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Navigate to="/dipendenti" replace />} />
      <Route path="/dipendenti" element={<App page="dashboard" />} />
      <Route path="/dipendenti/:page" element={<App />} />
    </Routes>
  </BrowserRouter>
)
