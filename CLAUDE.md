# AppDipendenti — Ceraldi Group S.r.l.

App HR di **Ceraldi Group** (Napoli, titolare Enzo/Vincenzo Ceraldi). Attività:
**bar / pasticceria** (Ceraldi Caffè, Piazza Carità 14, Napoli).

> Questo file è la memoria di progetto: leggilo a inizio sessione per non perdere
> il focus. Aggiornalo quando aggiungi funzioni importanti.

## Stack & deploy
- Backend **FastAPI + Motor + MongoDB** (DB `Gestionale`) in `backend/app`.
- Frontend **React + Vite** in `frontend/src` (`App.jsx` = gestione desktop,
  `PortaleDipendente.jsx` = portale mobile dipendenti).
- Deploy su **Render** (`appdipendenti.onrender.com`), auto-deploy dal branch **`main`**.
- ⚠️ **Render NON builda il frontend**: serve `frontend/dist/` **committata in git**.
  Quindi ad ogni modifica frontend: `cd frontend && npm run build`, poi committa
  `dist/` + `src/`. Senza ricommittare `dist`, in produzione non cambia nulla.
- **Workflow git (deciso dal titolare): si sviluppa e si pusha DIRETTAMENTE su `main`,
  niente branch.**

## Regole canoniche del titolare (sempre valide)
- Niente doppioni / codice morto / sistemi paralleli: **un solo sistema per funzione**.
- Tutte le credenziali (token, PIN, password, chiavi) **SOLO nelle env di Render**,
  mai in codice/chat. (`render.yaml` le elenca con `sync: false`.)
- Design **sage** (`#5b7a6b`) su **cream** (`#faf7f0`); card `#fffefb`, sidebar
  `#3f5a4e`, ink `#2a3329`, bordi sand `#e6e0d4`. **Vietati blu/indigo/viola.**
- Rispondere e ragionare in **italiano**, stile risultati-prima.
- Importi/dati reali: non inventare numeri tabellari (CCNL, prezzi) — vanno validati.

## CCNL
**Pubblici Esercizi, Ristorazione Collettiva e Commerciale e Turismo**
(Confcommercio-FIPE), codice CNEL **H05Y**, rinnovo 5/6/2024. NON è il Terziario.
40 ore/sett, 14 mensilità (13ª dic, 14ª lug), 26 gg ferie, enti EBNT/EBT,
Fondo EST (sanitario), Fon.Te. (previdenza compl.).

## Autenticazione
- Ingresso da `/portale` con **PIN** → JWT in `localStorage.pt_token` (+ `pt_role`,
  `pt_name`). Header `Authorization: Bearer`.
- Login admin: dalla schermata PIN → **"Accesso amministratore"** (PIN = env `PIN_CODE`),
  NON dalla scheda di un dipendente.
- Sessione admin **2 ore** (`ADMIN_TOKEN_EXPIRE_MINUTES`).
- Backend strict: `require_admin` / `require_staff` in `utils/dependencies.py`
  (fail-closed: senza token valido → 401, nessun "admin di default"). Protetti:
  `/api/contracts`, `/api/cedolini`, `/api/tfr`, `/api/paghe`, `/api/bonifici`,
  `/api/salari-v2`, `/api/dimissioni` = admin; `/api/dipendenti-cloud`,
  `/api/dipendenti`, `/api/fascicolo`, `/api/giustificativi`, `/api/shifts`,
  `/api/attendance` = staff (admin o responsabile_turni). Portale: `get_identity`/
  `require_roles` per-endpoint. CORS senza wildcard; segreto JWT mai literal.
- Frontend: `App.jsx` allega il token e su 401/403 riporta al PIN; `main.jsx`
  `RequireRole` valida ruolo + scadenza token.

## Architettura automazioni (event-driven)
- `services/event_bus.py` (propagate_event + EventTypes), `services/alert_engine.py`
  (genera_alert/risolvi_alert, catalogo `ALERT_CATALOG`), handler in
  `services/handlers/`. `APScheduler` per i job periodici.
- Catene A→B attive: ferie approvata→indisponibilità turni + record Ferie&Permessi
  (→ visibile in Presenze); acconto/anticipo→partita; contestazione→alert;
  cedolino→partita+notifica+TFR progressivi; missione→rimborso+notifica;
  contratto finalizzato→aggiorna anagrafica; cessazione (pulsante)→handler completo;
  scadenzario (contratti/prova)→alert; timbratura→presenze reali.
- Alert visibili nel **Pannello di controllo** (pannello "Avvisi & Scadenze").
- **Turni data-driven** (pagina Turni, modale "⚙️ Configura turni" = punto unico):
  per dipendente `turni_config` (collezione) = turno abituale + giorno di riposo fisso
  + giorni di Lunga (Ven/Sab/Dom); + onomastico (`onomastici`). "Genera settimana"
  (`generaProduzione` in App.jsx) assegna: turno abituale, Lunga nei giorni spuntati,
  Riposo nel giorno fisso e nell'onomastico, Ferie nei giorni di ferie APPROVATE.
  Niente più nomi cablati. Celle sempre modificabili a mano.
- **Onomastici** (`dipendenti_cloud`: ONOMASTICI_DEFAULT + collezione `onomastici`):
  gestiti nel modale "Configura turni"; nella pagina Turni un pannello mostra gli
  onomastici della settimana (solo giorni lavorativi, esclusi stranieri/disattivati e
  i non-turnisti). Date prefillate e modificabili.

## Moduli chiave
- **Assunzione & Contratti** (`App.jsx` AssunzionePage + `routers/employees/employee_contracts.py`):
  template .docx su MongoDB (collezione `contract_templates`), segnaposto nominali
  `{{chiave}}` + puntini legacy compilati da `fill_contract_template`. Genera contratto
  + accessori (regolamento/privacy/informativa 152). Pulsante "Assumi dipendente"
  (crea anagrafica + genera) e generazione massiva (dati da buste paga).
  **Iter firma**: bozza → invia bozza → carica firmato dal dipendente → controfirma
  e invia definitivo → archiviazione nel fascicolo (`contratti_dipendenti`).
  Firma digitale OpenAPI.com (OAuth V2 + marca temporale + eSignature + PEC) in
  `services/openapi_signature.py` (env `OPENAPI_CLIENT_ID/SECRET`, `OPENAPI_ENV`).
  docx→PDF richiede **LibreOffice** su Render (l'iter manuale via upload PDF no).
- **Timbrature** (`routers/timbrature.py` + portale tab "Timbra" + gestione "Timbrature"):
  entrata/uscita geolocalizzata, **solo in sede** (geofencing, sede in `impostazioni`/
  `sede_lavoro`: Ceraldi Caffè, Piazza Carità 14 ≈ 40.842949, 14.2489, raggio 200m).
  Alimenta `presenze_cloud`. Vista admin: atteso (turno) vs effettivo + riepilogo ore mensile.
- **Modelli documenti**: `modelli/` (script generatori .docx corretti CCNL Turismo:
  4 contratti + informativa 152). Da caricare in Assunzione → Modelli.

## File chiave
- `frontend/src/App.jsx` — gestione (Dashboard, Anagrafica, Presenze, Ferie, Turni,
  Timbrature, Buste, Documenti, Assunzione, Missioni).
- `frontend/src/PortaleDipendente.jsx` — portale mobile (Timbra, Turni, Buste,
  Documenti, Richieste, Avvisi, Gestione).
- `backend/app/main.py` — registrazione router + lifespan (scheduler).
- `backend/app/routers/dipendenti_cloud/__init__.py` — CRUD HR (prefix `/api/dipendenti-cloud`),
  cessa dipendente, alerts, dashboard stats.
- `render.yaml` — config deploy + env (`sync: false`).

## Collezioni MongoDB principali
`dipendenti` (anagrafica), `cedolini` (buste), `presenze_cloud` (presenze manuali/
timbrature), `presenze` (LUL), `ferie_cloud`, `turni_settimane` + assegnazioni,
`turni_indisponibilita`, `richieste`, `notifiche`, `timbrature`, `impostazioni`,
`employee_contracts`, `contratti_dipendenti` (fascicolo), `alerts`, `partite_aperte`,
`missioni_cloud`, `assegnazioni_turni_cloud`, `turni_config` (turno/riposo/Lunga per
dipendente), `onomastici`.

## Bug noti / da fare
- Buste paga "foglio bianco": `portale_buste.py::scarica_pdf` genera un riepilogo se
  il cedolino non ha `pdf_data` (buste da Libro Unico senza PDF).
- OpenAPI: il token esposto in chat va rigenerato; testare in sandbox prima della prod.
- LibreOffice non presente su Render (serve per docx→PDF firma automatica).
