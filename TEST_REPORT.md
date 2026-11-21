# F.R.I.D.A.Y. — Automated Diagnostics & Windows Compatibility Test Report (`TEST_REPORT.md`)

- **Test Date:** 2026-11-21T16:01:19.161Z
- **Environment:** Ubuntu (linux/x64)
- **OS / Architecture:** Ubuntu 12 (x64)
- **Node.js Version:** v22.23.2
- **Hardware:** unknown (4 cores) · 12 GB RAM · Unavailable
- **Optimization Profile:** standard-16gb
- **Summary:** 6 Passed · 1 Warnings · 2 Unavailable · 0 Failed (Total 9)

## Test Results

| Test Name | Test Date | Environment | Expected Result | Actual Result | Status | Error Details | Fix Recommendation |
|---|---|---|---|---|---|---|---|
| Windows Target & Runtime Compatibility | 2026-11-21T16:01:15.331Z | Ubuntu (linux/x64) | Node.js >= 18, x64/arm64, Electron & Windows 10/11 target verified | Running in Ubuntu (linux/x64), Node v22.23.2 | WARNING | Current host is Linux container, not a physical Windows 10/11 laptop. | Run npm run build && Electron desktop test on physical Windows 11/10 target. |
| CPU, RAM & Storage Sensors | 2026-11-21T16:01:15.790Z | Ubuntu (linux/x64) | Live numeric CPU, RAM, and Storage readings from systeminformation | CPU 74% (4 cores) · RAM 1.2/12 GB (10%) · Disk 0% | PASS | None | None |
| GPU Utilization & Thermal Sensors | 2026-11-21T16:01:16.047Z | Ubuntu (linux/x64) | Report live GPU/thermal values or Unavailable without fabrication | GPU (Unavailable) utilization and thermal sensors report Unavailable on this host | UNAVAILABLE | None | Test on physical Windows hardware with WMI / vendor GPU drivers enabled. |
| Gemini API Connectivity & Model Health | 2026-11-21T16:01:18.858Z | Ubuntu (linux/x64) | Server-side @google/genai round-trip latency check passes | Connected (gemini-3.1-flash-lite) in 2810ms | PASS | None | None |
| Local Database Read & Integrity | 2026-11-21T16:01:18.858Z | Ubuntu (linux/x64) | Load settings, calendar, memory, workflows, and action logs cleanly | Healthy (3 events, 3 memory, 6 chats, 16 logs) | PASS | None | None |
| Permitted Folder Index & Path Traversal Block | 2026-11-21T16:01:18.865Z | Ubuntu (linux/x64) | Scan permitted folders and reject outside-sandbox & traversal paths | Indexed 48 permitted file(s); outside-sandbox & traversal paths blocked cleanly | PASS | None | None |
| Desktop Application Discovery | 2026-11-21T16:01:19.161Z | Ubuntu (linux/x64) | Check installed commands via OS path / Windows Get-StartApps | 0/8 host commands detected (Windows Start Apps unavailable in Linux container) | UNAVAILABLE | None | Run desktop discovery on Windows 10/11 host to detect Chrome, VS Code, Terminal, etc. |
| Confirmation Gate & Permission Boundary | 2026-11-21T16:01:19.161Z | Ubuntu (linux/x64) | Require explicit confirmation before destructive commands | Blocked for confirmation (sensitive_action) | PASS | None | None |
| Electron Context Isolation & Builder Config | 2026-11-21T16:01:19.161Z | Ubuntu (linux/x64) | contextIsolation: true, nodeIntegration: false, preload bridge, electron-builder.yml present | contextIsolation=true, nodeIntegration=false, IPC preload & electron-builder.yml verified | PASS | None | None |
