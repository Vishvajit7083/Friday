# F.R.I.D.A.Y. — Windows 10/11 Setup & Deployment Guide (`WINDOWS_SETUP.md`)

This guide walks you through running, testing, and packaging **F.R.I.D.A.Y.** natively on Windows 10 / Windows 11 with **zero paid cloud API keys**.

---

## 1. Prerequisites on Windows

1. **Node.js 22+ (LTS recommended)** and npm:
   ```powershell
   node -v
   npm -v
   ```
2. **Ollama (Recommended Local AI Engine — Free & Private)**:
   - Download and install Ollama for Windows: `https://ollama.com/download/windows`
   - Pull a fast local model (recommended for laptops with 8–16 GB RAM):
     ```powershell
     ollama pull llama3.2
     ```
   - Verify Ollama is serving locally (`http://127.0.0.1:11434`):
     ```powershell
     ollama list
     ```
   - *(Note: Even if Ollama is stopped, F.R.I.D.A.Y. stays online using its instant Local Core & Free Web Research tools.)*

---

## 2. Project Installation (`D:\Friday-main`)

Open **Windows PowerShell** in your project folder:

```powershell
cd D:\Friday-main
npm install
```

Create your local `.env` file from `.env.example` (no `GEMINI_API_KEY` required):

```powershell
Copy-Item .env.example .env
```

Default `.env` values:
```env
OLLAMA_HOST="http://127.0.0.1:11434"
OLLAMA_MODEL=""
PORT="3000"
FRIDAY_FULLSCREEN="true"
FRIDAY_REOPEN_SHORTCUT="CommandOrControl+Shift+Space"
```

---

## 3. Running F.R.I.D.A.Y. Locally

### Option A: Web / Command Center Mode (Fastest Dev Loop)
```powershell
npm run dev
```
Open **`http://localhost:3000`** in Microsoft Edge or Google Chrome (recommended for Web Speech API microphone recognition and Windows neural SpeechSynthesis voices).

### Option B: Desktop Electron Window (Full Native Controls & Tray)
1. Install Electron tooling once as dev dependencies:
   ```powershell
   npm install -D electron electron-builder
   ```
2. Build frontend + compile Electron TypeScript shell:
   ```powershell
   npm run build
   npm run electron:compile
   ```
3. Launch the desktop app (Electron automatically starts the embedded backend server on port `3000` if it isn't already running):
   ```powershell
   npx electron .
   ```

---

## 4. Packaging a Windows `.exe` Installer (NSIS)

Run in PowerShell from `D:\Friday-main`:

```powershell
npm run build
npm run electron:compile
npx electron-builder --win
```

Output installer location:
- `D:\Friday-main\release\FRIDAY-Setup-1.0.0.exe`

---

## 5. Microphone, Voice, Shortcuts & Folder Permissions

- **Microphone & Wake Word**:
  - Allow microphone permission when Windows / Edge / Electron prompts.
  - Default wake phrase: **`Hey Friday`**. Say **`"Hey Friday, check laptop performance"`** or click the center Mic button for direct dictation.
  - To interrupt F.R.I.D.A.Y. mid-sentence, say **`"stop"`**, **`"Friday, stop talking"`**, **`"quiet"`**, or **`"cancel"`**.
- **Desktop Shortcuts (Electron Mode)**:
  - **`ESC`**: Hides F.R.I.D.A.Y. cleanly to the Windows system tray.
  - **`Ctrl + Shift + Space`**: Reopens / focuses F.R.I.D.A.Y. from anywhere on Windows (customizable in **Settings**).
- **Permitted Folders**:
  - Automatically covers `Downloads`, `Desktop`, `Documents`, `Pictures`, `Videos`, and `Music`. Add or remove folders anytime under **Settings** or **File Explorer**.
- **Verification Commands**:
  ```powershell
  npx tsx --test src/core/intentEngine.test.ts
  npm run lint
  npm run electron:compile
  npm run build
  ```
