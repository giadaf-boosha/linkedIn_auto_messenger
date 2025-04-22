# LinkedIn Auto Messenger

App minimal per inviare messaggi personalizzati su LinkedIn tramite AI.

## Setup locale
1. Clona il repository
2. Crea il file `.env.local` in root con:
   ```
   OPENAI_API_KEY=tuachiaveopenai
   ```
3. Installa le dipendenze:
   ```bash
   npm install
   ```
4. Avvia in modalità sviluppo:
   ```bash
   npm run dev
   ```
L'accesso a LinkedIn avviene tramite l'import dei cookie in JSON dal form.

## Deploy su Vercel
1. Collega il repository a Vercel
2. Imposta la variabile di ambiente `OPENAI_API_KEY` nelle impostazioni del progetto
3. Esegui il deploy

## Utilizzo
1. Nella pagina principale, inserisci:
   - Cookie LinkedIn (JSON)
   - Criteri di ricerca (keywords)
   - Template del messaggio commerciale
   - Flag "Require confirmation before sending" (attivo di default)
2. Clicca su "Generate Preview" per ottenere la lista di profili trovati e dei messaggi generati
3. (Se la conferma è attiva) Modifica i messaggi, aggiungi nuovi profili, seleziona/deseleziona i destinatari
4. Clicca su "Send Selected Messages" per inviare i messaggi
   (Se la conferma è disattivata, i messaggi verranno inviati automaticamente dopo la preview)
5. Consulta il report finale con lo stato di invio e, se necessario, premi "Start Over" per ricominciare

## Note
- Limite profili: 5 per batch di default
- Verifica che i cookie siano validi e non scaduti
- Controlla i log su Vercel in caso di errori