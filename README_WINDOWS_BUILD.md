# F.R.I.D.A.Y. — Windows Desktop & Web Quick Reference

See **[WINDOWS_SETUP.md](./WINDOWS_SETUP.md)** for complete Windows 10/11 setup, Ollama installation, microphone/shortcut configuration, and NSIS installer instructions, and **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the local-first AI and security architecture.

## Quick Commands (Windows PowerShell)
```powershell
npm install
npm run dev                  # Starts Command Center on http://localhost:3000

# Build & Launch Desktop Shell (after npm install -D electron electron-builder)
npm run build
npm run electron:compile
npx electron .

# Package Windows NSIS Installer
npx electron-builder --win
```
