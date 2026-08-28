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
- **🔒 REGOLA FISSA (decisa dal titolare): TUTTO va portato su `main`.** Si sviluppa e si
  pusha **DIRETTAMENTE su `main`**, niente branch. Se una sessione/agent lavora su un branch
  (es. Claude Code web), al termine **fai sempre il merge su `main` e pusha `main`** — il
  lavoro non è "consegnato" finché non è su `main` (Render fa deploy solo da `main`).
  Vale per ogni sessione e ogni agente, sempre.
- **🔒 REGOLA FISSA: a fine di OGNI sessione, manda sempre il link Render**
  → **https://appdipendenti.onrender.com** (così il titolare verifica subito in produzione).

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
- **Login dipendente = cognome + PIN** (POST `/api/auth/pin-login` con `{nome, pin}`):
  NESSUN elenco di nomi esposto prima dell'autenticazione (rimosso il vecchio
  GET `/auth/dipendenti-login`); tra gli omonimi passa solo chi verifica il PIN,
  se ambiguo l'accesso è negato. I nomi di tutti restano solo in Gestione (admin).
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
  per dipendente `turni_config` (collezione) = modalità Sala (cameriere: rotazione
  automatica 2 Lunga/2 Mattina/2 Pomeriggio/1 Riposo, riposi nei feriali per coprire il
  weekend) | turno abituale | rotazione bar (mattina↔pom); + giorno di riposo fisso +
  giorni di Lunga (Ven/Sab/Dom); + onomastico (`onomastici`). "Genera settimana"
  (`generaProduzione` in App.jsx) assegna: turno abituale, Lunga nei giorni spuntati,
  Riposo nel giorno fisso e nell'onomastico, Ferie nei giorni di ferie APPROVATE.
  Niente più nomi cablati. Celle sempre modificabili a mano.
- **Turni — Vista semplice** (predefinita in pagina Turni, toggle "📋 Vista griglia"):
  una riga per dipendente, 7 caselle colorate; un click = turno successivo tra le
  "sponde" del dipendente (i soli turni che può fare dalla sua `turni_config`, poi
  Riposo, Ferie, vuoto). Intestazione con copertura giornaliera ☀️ mattina / 🌆
  pomeriggio (Lunga conta per entrambi, rosso = scoperto). Salvataggio ottimistico
  immediato. Pennello e riordino a trascinamento restano solo nella vista griglia.
  (Eliminato il vecchio doppione `impostazioni-turni` / checkbox "Bar chiuso la
  domenica pomeriggio": il sistema unico è `turni-chiusura-pomeridiana` nel modale.)
- **Turni nel portale + preferenze riposo**: il tab Turni del portale legge la STESSA
  settimana della gestione (GET `/api/turni/azienda/settimana`, sola lettura: i miei
  turni + tabella di tutti i colleghi; eliminata la vecchia "griglia pubblicata"
  `turni_griglia` con squadra cablata). Ogni dipendente imposta la **preferenza del
  giorno di riposo** per la prossima settimana (GET/POST `/api/turni/preferenza-riposo`,
  collezione `turni_preferenze_riposo`); il responsabile turni riceve una notifica e
  le vede in pagina Turni (pannello 💤 + marcatore sulle caselle, GET staff
  `/api/dipendenti-cloud/turni-preferenze?settimana=`). "Genera settimana" usa la
  preferenza come giorno di riposo (vince sul riposo fisso per quella settimana).
- **Sostituzioni bar**: flag `sostituto_bar` in `turni_config` (spunta "🆘 può coprire
  il bar" nel modale, pensata per Taiano e Russo ma senza nomi cablati). Chi ha il
  flag vede nel portale il riquadro "🆘 Copro il bar" (dal/al + fascia mattina o
  pomeriggio + "al posto di" = barista assente → POST `/api/turni/disponibilita-bar`,
  collezione `turni_disponibilita_bar`, notifica al responsabile; se indicato,
  "Genera settimana" svuota le celle dell'assente nei giorni coperti → la coppia
  diventa es. Vespa+Taiano). Modale a card RAGGRUPPATE per ruolo (sezioni ☕ Baristi /
  🍽 Camerieri / 🕐 Turno fisso, badge ruolo in card, pillole modalità dentro
  "cambia modalità"). In gestione: pannello 🆘 in
  pagina Turni (GET staff `/turni-disponibilita-bar?settimana=`) e "Genera settimana"
  mette il sostituto al bar nella fascia scelta; se era in squadra sala copre il buco
  con una Lunga al cameriere con meno Lunghe (conferma via window.confirm prima di
  annullare un riposo). Card del modale per ruolo: barista (rotazione) senza
  Lunga/flag; la rotazione bar è ancorata (`rotazione_ancora` = lunedì della
  settimana in cui si imposta "ora mattina/pomeriggio", inversione automatica ogni
  lunedì, per dipendente).
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
  docx→PDF: servizio unico `services/docx_converter.py` → **ConvertAPI** in produzione
  (env `CONVERTAPI_TOKEN`; OpenAPI.com non offre docx→PDF), **LibreOffice** come
  fallback solo in locale. L'iter manuale via upload PDF non richiede conversione.
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
- `documenti_cloud`: archivio documenti dipendente. Upload massivo POST `/api/dipendenti-cloud/documenti/upload-massivo`: classifica il tipo (UNILAV/CERTIFICAZIONE_UNICA/CONTRATTO/BONIFICO/CODICE_FISCALE/BUSTA_PAGA/ALTRO) da regole sul testo, trova il dipendente dal codice fiscale/nome nel PDF, dedup per hash, salva file_data. Pagina Documenti = vista a cartelle per tipo + download (`/documenti/{id}/file`).
- Import: anagrafica da Excel (`POST /dipendenti/importa-anagrafica`); pagamenti bonifici
  da CSV banca (`POST /paghe/importa-pagamenti` → collezione `pagamenti_esiti`, ricalcola
  bonifico mese); Prima Nota Excel (`/paghe/importa-prima-nota`); bonifici stipendi da PDF
  su Google Drive (`POST /paghe/importa-bonifici-drive`, service account già usato per i
  cedolini — cartella linkata nel bottone "📁 Cartella Drive bonifici" in Cedolini &
  Bonifici, stessa del link in `DRIVE_BONIFICI_URL` in App.jsx): legge beneficiario/
  importo/mese dal PDF, entra in `pagamenti_esiti` se il dipendente è univoco, altrimenti
  coda "Bonifici da associare" (mai indovinato). Export Excel (dipendente, periodo
  cedolino, importo cedolino, importo bonifico, stato): `GET
  /paghe/associazioni-bonifici/export-excel`. Prima nota con saldo
  progressivo: `GET /paghe/prima-nota?dipendente_id=` (cumulato busta − erogato). Upload
  massivo documenti accetta anche ZIP (estrae) e categoria RIDUZIONE_ORARIO.
- `cedolini`: oltre a netto/pdf salva `voci` (tutti i codici busta) + dati chiave
  (rateo 13ª/14ª, Indennità L.207/24 + cng ann, Trattam. integ. L.21/2020, Rimborso 730,
  ore/giorni lavorati). Motore ricerca: GET `/api/dipendenti-cloud/cedolini/cerca-voce`
  (codice/testo); backfill storico: POST `/cedolini/riscansiona` (riusa il PDF salvato).

## Bug noti / da fare
- Buste paga "foglio bianco": `portale_buste.py::scarica_pdf` genera un riepilogo se
  il cedolino non ha `pdf_data` (buste da Libro Unico senza PDF).
- OpenAPI: il token esposto in chat va rigenerato; testare in sandbox prima della prod.
  I payload eSignature/marca temporale/PEC vanno validati contro console.openapi.com.
- docx→PDF firma automatica: serve `CONVERTAPI_TOKEN` nelle env di Render (ConvertAPI);
  senza token l'endpoint risponde 503. LibreOffice resta solo come fallback locale.
- **[REFACTOR 28/08/2026, branch `claude/cedolini-refactor-debug-08k03g`]** Rimosso
  `backend/app/routers/bonifici_stipendi.py` (email IMAP + `prima_nota_salari` +
  `estratto_conto_movimenti`): era un sistema di riconciliazione bonifici↔stipendi
  parallelo a quello vivo (`paghe_mensili` + `pagamenti_esiti` in
  `dipendenti_cloud/__init__.py`), montato in `main.py` ma **nessuna pagina frontend
  lo chiamava mai** — codice morto, in violazione della regola "un solo sistema per
  funzione". Le note sui bug di omonimia in quel file (fix del 29/07/2026) non si
  applicano più: sono andate via col file. Il match per nome del sistema vivo
  (`_indici_dipendenti`, riusato ovunque: import CSV/Drive, upload documenti) ha
  sempre avuto la stessa protezione (match univoco o nessun match, mai indovinato).
- **[FIX 28/08/2026]** `POST /bonifici-da-associare/{id}/associa` (coda manuale
  "Bonifici da associare"): scriveva il bonifico assegnato solo nella collezione
  `bonifici`, ma la pagina "Cedolini & Bonifici" e lo stato paga (`stato_pagamento`
  sulla busta) leggono `pagamenti_esiti`/`paghe_mensili` — un bonifico confermato a
  mano da quella coda non risultava mai pagato da nessun'altra parte dell'app. Ora
  l'associazione manuale scrive anche in `pagamenti_esiti` e ricalcola lo stato con
  `_ricalcola_stato_paga` (lo stesso motore unico di tutti gli altri ingressi).
- **[NUOVO 28/08/2026]** `POST /paghe/importa-bonifici-drive`: prima la cartella Drive
  "Bonifici" (linkata da tempo nel bottone "📁 Cartella Drive bonifici", mai letta da
  nessun codice) non alimentava nulla — i bonifici bancari andavano importati a mano
  via CSV/Prima Nota. Ora un PDF nuovo nella cartella viene letto ed entra da solo
  nei pagamenti reali, se il dipendente è univoco; altrimenti finisce nella coda
  "Bonifici da associare" già esistente (mai indovinato). Va testato con l'archivio
  reale di bonifici (~44 PDF "Distinta Stipendi" più vecchi bonifici in formato
  diverso) per verificare la qualità dell'estrazione automatica prima di fidarsene
  senza controllare la coda dopo ogni import.
