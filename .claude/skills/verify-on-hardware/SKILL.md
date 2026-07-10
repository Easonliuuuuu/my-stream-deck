---
name: verify-on-hardware
description: Verify server-side/PowerShell changes (audio, media keys, now-playing, controller battery, system load, launching apps) directly against the real deployed Windows machine instead of asking the user to redeploy and test through the phone app. Use whenever server/scripts/*.ps1 or server/services/*.js touching those scripts changes, or when a bug report is about something PowerShell-backed misbehaving on real hardware.
license: MIT
metadata:
  author: local
  version: "1.0"
---

This machine's coding sandbox runs under WSL2 **on the user's actual Windows PC** — the same PC the my-stream-deck server is deployed and running on. `powershell.exe` is reachable directly from this shell via WSL interop, and the Windows filesystem is mounted at `/mnt/c`. This means most server-side bugs (audio device switching, volume/mute, now-playing, controller battery, system load, app launching — anything that shells out to a `.ps1` script) can be reproduced and fixed **without asking the user to redeploy, scan a QR code, or test on their phone.**

Reach for the phone/QR-scan loop only for things that are genuinely phone-only: PWA rendering/CSS, touch interaction, service-worker caching, or anything where the actual iPhone client matters. For everything upstream of the WebSocket wire protocol, verify here first.

## Finding the deployed install

The installed copy lives under the user's `AppData\Local`, mounted from WSL at:
```
/mnt/c/Users/<username>/AppData/Local/my-stream-deck
```
If unsure of the exact path or username, check `whoami.exe` or look for a directory containing `server/index.js` and `install.ps1` under `/mnt/c/Users/*/AppData/Local/`. This is very likely a **separate git checkout** from the sandbox's own repo working directory — changes made in the sandbox repo do not automatically appear there. To test a fix before it's even committed, copy the specific file(s) over:
```bash
cp path/to/sandbox/repo/server/scripts/Foo.ps1 "/mnt/c/Users/<user>/AppData/Local/my-stream-deck/server/scripts/Foo.ps1"
```
`install.ps1` does `git reset --hard origin/<branch>` on every run, so any such manual copy is automatically overwritten/reconciled the next time the user redeploys — no cleanup needed on that front.

## Running PowerShell scripts directly

Run scripts with a real, absolute Windows path and **forward slashes** (backslashes get eaten by the bash layer before reaching `powershell.exe`):
```bash
cd "/mnt/c/Users/<user>/AppData/Local/my-stream-deck/server"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts/Set-Volume.ps1" -Action Up
```
For anything beyond a trivial one-liner, **write a temp `.ps1` file and run it with `-File`** rather than inlining logic via `-Command` with escaped `$` and quotes — two layers of shell escaping (bash → PowerShell) compounds fast and produces silently-wrong results (seen firsthand: an interpolated `$stream.Size` inside a heredoc-escaped `-Command` string printed blank without erroring, wasting a diagnostic cycle before switching to a temp file). Delete temp/probe scripts from the deployed directory when done — don't leave scratch files in the user's install.

Check whether `AudioDeviceCmdlets` (or any required module) is actually installed and where, since Windows PowerShell 5.1 and PowerShell 7 (`pwsh`) have **separate module paths** — a module installed under one won't be visible to the other:
```bash
powershell.exe -NoProfile -Command "Get-Module -ListAvailable AudioDeviceCmdlets | Format-List Name,Version,ModuleBase"
```
`server/services/psRunner.js` always spawns `powershell.exe` (Windows PowerShell 5.1), not `pwsh` — verify against that specific host.

## Checking the running server process

```bash
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,CommandLine | Format-List"
```
Confirms whether `node index.js` is actually running and from where, before assuming a code change is even live.

## Talking to the live server directly (bypassing the phone)

The server listens on `0.0.0.0:8787`. Plain `curl http://localhost:8787` from WSL may fail depending on WSL2's localhost-forwarding state — if so, get the real LAN IP and use that instead:
```bash
powershell.exe -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {\$_.InterfaceAlias -notmatch 'Loopback|vEthernet.*WSL'}).IPAddress"
curl -s -m 5 http://<lan-ip>:8787/ -o /dev/null -w "%{http_code}\n"
```
(The server's own startup log also prints this same LAN IP in its pairing URL.)

To verify the full pipeline end-to-end — not just one script in isolation, but what actually gets broadcast over the WebSocket the phone consumes — write a small Node probe script that connects, authenticates, and logs messages. **Never `cat`/print the pairing token file (`server/.pairing.json`) directly** — it's a live credential and would leak into the tool transcript. Have the probe script read it internally instead:
```js
// _wsprobe.js — read token internally, never print it
const fs = require('fs'), path = require('path');
const WebSocket = require('ws');
const { token } = JSON.parse(fs.readFileSync(path.join(__dirname, '.pairing.json'), 'utf8'));
const ws = new WebSocket('ws://localhost:8787');
ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
ws.on('message', (raw) => console.log(JSON.parse(raw)));
```
Run it with the deployed install's own `node.exe` so `require('ws')` resolves against its `node_modules`:
```bash
cd "/mnt/c/Users/<user>/AppData/Local/my-stream-deck/server"
"/mnt/c/Program Files/nodejs/node.exe" _wsprobe.js
```
Delete the probe script afterward.

## When a bug turns out to be a flaky/intermittent API, not a hang or exception

Not every "silently returns nothing" bug is an error being swallowed — some Windows APIs are just unreliable by design (e.g. `GlobalSystemMediaTransportControlsSessionManager.GetCurrentSession()` returning `null` on ~90% of polls even with active playback, because it's a heuristic over multiple sessions, not a deterministic query). Confirm this empirically by running the script several times in a tight loop (`for i in 1 2 3...; do powershell.exe -File ...; sleep 1.5; done`) before assuming a single-shot test result (success or failure) is representative.

## What this doesn't replace

- Actual UI/rendering verification still needs a browser or the real client (Playwright E2E suite covers most of this already — see `client/test/ui.test.js`).
- Real hardware peripherals this sandbox can't see (DualSense controller battery, specific audio interfaces) still need the user's confirmation of behavior, even if the *script* can be exercised directly.
- Don't assume this WSL-is-the-same-machine relationship holds in a different repo or a different user's setup — confirm the install directory actually exists under `/mnt/c` before relying on any of this.
