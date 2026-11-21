# F.R.I.D.A.Y. — Windows Desktop & Web Architecture Guide

## Environment Variables
Configure the following in `.env` (never commit secrets):
- `GEMINI_API_KEY`: Server-side Gemini API key (`@google/genai` SDK).
- `PORT`: Command server port (default `3000`).
- `FRIDAY_FULLSCREEN`: `true` or `false` for Electron launch mode.
- `FRIDAY_REOPEN_SHORTCUT`: Global shortcut to restore F.R.I.D.A.Y. after pressing `ESC` (default `CommandOrControl+Space`).

## Running Locally (Full-Stack Command Center)
```bash
npm install
npm run dev
```
Open `http://localhost:3000`.

## Packaging for Windows Desktop (Electron)
1. Build the production frontend bundle:
   ```bash
   npm run build
   ```
2. Install Electron & builder tools on Windows:
   ```bash
   npm install -D electron electron-builder
   ```
3. Launch the backend service (`npm run start`) and point `electron/main.ts` to `http://localhost:3000` (or bundle `server.ts` as a child process).
4. Package an NSIS `.exe` installer with `electron-builder --win`.
