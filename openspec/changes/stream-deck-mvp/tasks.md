## 1. Project scaffold

- [x] 1.1 Create repo layout: `server/` (Node.js) and `client/` (PWA), with `server/package.json` and a root README
- [x] 1.2 Add server dependencies: `ws`, an HTTP static server, an mDNS/bonjour library, `node-hid`
- [ ] 1.3 Verify `node-hid` builds/installs on the target Windows + Node version (pin a version with prebuilt binaries) — needs to run on the actual Windows PC
- [ ] 1.4 Confirm PowerShell prerequisites: `AudioDeviceCmdlets` module installed; SMTC WinRT query runs from PowerShell — needs to run on the actual Windows PC (verified the script fails with a clear, actionable error when the module is missing, rather than crashing)

## 2. Control server: transport, auth, discovery

- [x] 2.1 Stand up an HTTP server that statically serves the `client/` bundle
- [x] 2.2 Add a WebSocket endpoint alongside the HTTP server
- [x] 2.3 Generate + persist a pairing token on first run; print it to the console
- [x] 2.4 Implement the WS handshake: require the token, mark the connection authenticated, reject commands otherwise — verified end-to-end with a test client (wrong token rejected, pre-auth command ignored, correct token accepted)
- [x] 2.5 Advertise the server via mDNS (`_streamdeck._tcp`) with host/port/instance name (server-side only — browsers can't consume mDNS, so this doesn't give the PWA discovery; see design.md)
- [x] 2.6 Implement typed command-envelope dispatch (`{type, payload}`) with unknown-type handled safely — verified: unknown type returns a clean error, connection stays open
- [x] 2.7 Implement state broadcast: full snapshot on connect, per-card deltas on change — snapshot-on-connect verified with a test client

## 3. Capability: media controls (SMTC + media keys)

- [x] 3.1 Write a PowerShell query that returns SMTC now-playing (title/artist/play-state, art if available) as JSON
- [x] 3.2 Wire a Node media service that polls the SMTC query (~1–2s) and emits now-playing deltas
- [x] 3.3 Implement album-art transport as inline base64 in the now-playing payload
- [x] 3.4 Write a PowerShell `Send-MediaKey.ps1` (`user32.dll` `keybd_event` P/Invoke) and wire play/pause/next/prev commands to it
- [x] 3.5 Handle the no-media-session case (idle now-playing state)

## 4. Capability: audio devices

- [x] 4.1 Write a PowerShell wrapper over `Get-AudioDevice -List` returning devices + current defaults as JSON
- [x] 4.2 Node audio service: poll devices (few seconds / on client wake), emit deltas on change
- [x] 4.3 Implement `set default output` and `set default input` commands via `Set-AudioDevice`
- [x] 4.4 Handle invalid/missing device references with an error result, leaving defaults unchanged

## 5. Capability: controller battery (DualSense over Bluetooth)

- [x] 5.1 Detect the DualSense HID device by VID/PID (`054C`/`0CE6`); report connected/disconnected
- [x] 5.2 Read input reports and parse battery level + charge state using the Bluetooth report layout
- [ ] 5.3 Confirm the battery byte offset/encoding empirically against the actual controller; document it — needs the real DualSense on Windows; run `npm run calibrate-controller`
- [x] 5.4 Poll on a low-frequency interval (~15–30s); broadcast only on change; degrade to "unknown" on parse failure — hardened during implementation: HID enumeration failures are now caught so they can't crash the poll loop (found by actually running the server without a working HID backend)

## 6. Client PWA

- [x] 6.1 Create the PWA shell: HTML, `manifest.json` (standalone/fullscreen, name, icon), service worker
- [x] 6.2 Implement the WebSocket client with saved-server + saved-token persistence and auto-reconnect
- [x] 6.3 Build the connection/pairing screen (manual server + token entry) and a disconnected-state indicator
- [x] 6.4 Build the card layout container that renders a state snapshot and updates cards in place
- [x] 6.5 Now-playing card: art/title/artist + prev/play-pause/next buttons wired to commands
- [x] 6.6 Audio card: show current output/input; tap to open a device picker that sends switch commands
- [x] 6.7 Controller card: connected state + battery % + charging indicator

## 7. Integration & verification

- [ ] 7.1 End-to-end: install the PWA on the iPhone, pair, and confirm all three cards render live — needs the real iPhone + Windows PC
- [ ] 7.2 Verify each command path (play/pause/skip, switch output, switch input) affects the PC — needs the real Windows PC
- [ ] 7.3 Verify auto-reconnect after the phone backgrounds/foregrounds and after the server restarts — needs the real iPhone + Windows PC
- [x] 7.4 Verify an unpaired device on the LAN cannot issue commands — verified with a test client: wrong-token connection's command was not executed and no state was sent until re-authenticating
- [x] 7.5 Write README run instructions (start server, install PWA, pairing, dependency prerequisites)
