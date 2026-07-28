# Istruzioni GitHub Copilot

Leggi prima `CLAUDE.md` e il codice coinvolto. Queste istruzioni prevalgono sulle indicazioni storiche che chiedono push diretto o deploy automatici.

- Lavora sempre su un branch dedicato e proponi una pull request. Non modificare direttamente `main`.
- Non eseguire deploy, non cambiare Render e non toccare variabili ambiente senza richiesta esplicita.
- Il backend è in `backend/app/`; il frontend React/Vite è in `frontend/`.
- Conserva i contratti API e le collezioni MongoDB condivise. Non rinominare o migrare dati usati da altre applicazioni senza piano, test e rollback.
- Tratta cedolini, presenze, documenti e anagrafiche come dati sensibili. Non aggiungere file reali, credenziali, log con dati personali o esempi riconducibili a dipendenti.
- Mantieni l'autenticazione chiusa in caso di configurazione mancante. Non introdurre scorciatoie o dati dimostrativi in produzione.
- Prima di consegnare esegui almeno la compilazione Python e il build frontend; esegui anche i test presenti e segnala quelli non disponibili.
- Per modifiche visibili verifica desktop e smartphone, accessibilità di base e stati di caricamento/errore.

Ogni PR deve spiegare effetto sui dati condivisi, configurazione richiesta, test eseguiti e rollback.
