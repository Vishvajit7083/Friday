# F.R.I.D.A.Y. — Automated Diagnostics & Windows Compatibility Test Report (`TEST_REPORT.md`)

- **Test Date:** 2026-11-21T17:22:14.043Z
- **Environment:** Ubuntu (linux/x64)
- **OS / Architecture:** Ubuntu 12 (x64)
- **Node.js Version:** v22.23.2
- **Hardware:** unknown (4 cores) · 12 GB RAM · Unavailable
- **Optimization Profile:** standard-16gb
- **Summary:** 8 Passed · 1 Warnings · 3 Unavailable · 0 Failed (Total 12)

## Test Results

| Test Name | Test Date | Environment | Expected Result | Actual Result | Status | Error Details | Fix Recommendation |
|---|---|---|---|---|---|---|---|
| Windows Target & Runtime Compatibility | 2026-11-21T17:22:13.199Z | Ubuntu (linux/x64) | Node.js >= 18, x64/arm64, Electron & Windows 10/11 target verified | Running in Ubuntu (linux/x64), Node v22.23.2 | WARNING | Current host is Linux container, not a physical Windows 10/11 laptop. | Run npm run build && Electron desktop test on physical Windows 11/10 target. |
| CPU, RAM & Storage Sensors | 2026-11-21T17:22:13.360Z | Ubuntu (linux/x64) | Live numeric CPU, RAM, and Storage readings from systeminformation | CPU 70% (4 cores) · RAM 1.7/12 GB (14%) · Disk 0% | PASS | None | None |
| GPU Utilization & Thermal Sensors | 2026-11-21T17:22:13.510Z | Ubuntu (linux/x64) | Report live GPU/thermal values or Unavailable without fabrication | GPU (Unavailable) utilization and thermal sensors report Unavailable on this host | UNAVAILABLE | None | Test on physical Windows hardware with WMI / vendor GPU drivers enabled. |
| Local-First AI Engine & Zero-Key Readiness | 2026-11-21T17:22:13.512Z | Ubuntu (linux/x64) | Assistant connects and operates cleanly without a paid cloud API key | F.R.I.D.A.Y. Local Core + Free Web (local-core-v2) active in 2ms · Paid key required: No | PASS | None | None |
| Ollama Local LLM Runtime (Optional Enhanced Reasoning) | 2026-11-21T17:22:13.513Z | Ubuntu (linux/x64) | Detect local Ollama server (127.0.0.1:11434) and pulled models | Ollama not detected at http://127.0.0.1:11434; deterministic Local Core active | UNAVAILABLE | None | Install Ollama on Windows and run "ollama pull llama3.2" for full local LLM streaming. |
| Free Direct Web Research (No Paid API Key) | 2026-11-21T17:22:14.033Z | Ubuntu (linux/x64) | Retrieve public search snippets and Wikipedia/DuckDuckGo links without API keys | Retrieved 8 live result(s) with verified links without paid API key | PASS | None | None |
| Pipeline Stage Latency Telemetry | 2026-11-21T17:22:14.034Z | Ubuntu (linux/x64) | Track intent, tool, first-token, and total response timing cleanly | Latest (local-core): intent 1ms · tools 209ms · first-token 212ms · total 212ms | PASS | None | None |
| Local Database Read & Integrity | 2026-11-21T17:22:14.034Z | Ubuntu (linux/x64) | Load settings, calendar, memory, workflows, and action logs cleanly | Healthy (3 events, 3 memory, 14 chats, 30 logs) | PASS | None | None |
| Permitted Folder Index & Path Traversal Block | 2026-11-21T17:22:14.043Z | Ubuntu (linux/x64) | Scan permitted folders and reject outside-sandbox & traversal paths | Indexed 56 permitted file(s); outside-sandbox & traversal paths blocked cleanly | PASS | None | None |
| Desktop Application Discovery | 2026-11-21T17:22:14.043Z | Ubuntu (linux/x64) | Check installed commands via OS path / Windows Get-StartApps | 0/8 host commands detected (Windows Start Apps unavailable in Linux container) | UNAVAILABLE | None | Run desktop discovery on Windows 10/11 host to detect Chrome, VS Code, Terminal, etc. |
| Confirmation Gate & Permission Boundary | 2026-11-21T17:22:14.043Z | Ubuntu (linux/x64) | Require explicit confirmation before destructive commands | Blocked for confirmation (sensitive_action) | PASS | None | None |
| Electron Context Isolation & Builder Config | 2026-11-21T17:22:14.043Z | Ubuntu (linux/x64) | contextIsolation: true, nodeIntegration: false, preload bridge, electron-builder.yml present | contextIsolation=true, nodeIntegration=false, IPC preload & electron-builder.yml verified | PASS | None | None |
