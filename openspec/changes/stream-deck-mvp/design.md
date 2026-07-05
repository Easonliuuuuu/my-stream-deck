## Context

This is a greenfield personal project: a self-hosted stream-deck replacement using a spare iPhone as a companion control screen for a Windows PC. The motivation (see `proposal.md`) is to avoid subscription costs and to control media/audio and monitor status without leaving a fullscreen app.

The system spans two runtimes on the same LAN:
- A **Windows PC server** that holds all the privileged capability (media keys, audio switching, HID reads, media metadata). The phone can touch none of these directly.
- An **iPhone client** that is purely a display + input surface.

Key environmental constraints:
- Windows-only for the server. Several capabilities have no clean Node-native API and must be reached through PowerShell or reverse-engineered HID parsing.
- iOS restricts background apps and native device access from Safari, so the client is deliberately a thin remote UI, not a device-aware app.
- Everything runs on a trusted home LAN, but the LAN is not fully trusted (roommates, guests), so command access must be gated.

## Goals / Non-Goals

**Goals:**
- One PC-side process that owns all capabilities and exposes a single WebSocket API.
- Low-friction connection: the phone enters the server address and a pairing token once, then reconnects automatically. (mDNS advertisement is a nice-to-have for future non-browser clients — see the note under Decisions; it does not give the PWA itself zero-config discovery.)
- A thin, installable PWA with a card-based UI (now-playing, audio devices, controller battery).
- Keep the PC toolchain minimal: Node.js + PowerShell + one native module (`node-hid`). No compiled C#/C++ helper projects.
- Structure the server so new "cards"/capabilities can be added without reworking transport or state plumbing.

**Non-Goals:**
- No native iOS (Swift) app for v1 — PWA only.
- No Spotify Web API / OAuth for v1 — media metadata comes from SMTC, transport from media keys.
- No Bluetooth device connect/disconnect toggling (deferred; not in the v1 feature list).
- No cloud/relay component — LAN only, no remote-over-internet access.
- No multi-PC or multi-user support; single PC, small number of trusted clients.

## Decisions

### Split architecture: PC server owns capability, phone is a thin client
The phone cannot access the PC's audio stack, HID devices, or media session. All capability lives in the Node server; the phone sends command messages and renders pushed state. **Alternative considered:** a native iOS app doing some work locally — rejected because none of the target capabilities are phone-local; it would still need the same PC server, at higher build cost.

### Transport: WebSocket with server-push state + command messages
A single persistent WebSocket carries two flows: client→server typed commands (play/pause, switch device) and server→client state broadcasts (battery, audio defaults, now-playing). **Alternative considered:** REST polling from the phone — rejected because now-playing/battery are naturally push-shaped and polling from the phone wastes battery and adds latency. The server already polls the OS; it fans that out over the socket.

### Message shape: typed envelopes, full snapshot on connect + deltas after
Every message has a `type` and `payload`. On auth the server sends a full state snapshot so the UI renders instantly; thereafter it sends per-card deltas only when a polled value changes. Keeps the wire quiet and the client update logic simple (replace card N).

### mDNS advertisement is server-side only; the PWA client uses manual entry
The server still advertises via mDNS (`_streamdeck._tcp`), but **this does not give the PWA zero-config discovery**: there is no Web API for a browser page to browse mDNS/Bonjour services, so Safari cannot consume it. The advertisement is kept because it costs little and would let a future native/CLI helper resolve the server automatically, but for the actual v1 client the connection UX is manual entry of the PC's address and pairing token (a one-time step; the client then persists and auto-reconnects). This correction was caught during implementation — the original design goal overstated what a browser-only client can do.

### Capability access mechanisms (the crux of the design)
- **Media metadata → SMTC via PowerShell/WinRT.** Call `GlobalSystemMediaTransportControlsSessionManager` directly from PowerShell (`ContentType=WindowsRuntime`), no compiled helper. App-agnostic (works for Spotify and anything else). **Alternative:** Spotify Web API — rejected for v1 (OAuth, app registration, Spotify-only).
- **Media transport → simulated media keys via PowerShell P/Invoke.** A small PowerShell script `Add-Type`s a `user32.dll` `keybd_event` P/Invoke and fires the virtual-key codes for play/pause/next/prev/volume. **Alternative considered:** a `robotjs`/`nut.js` native Node module — rejected to avoid a second native-module toolchain beyond `node-hid`; PowerShell shell-out is already the mechanism used for audio and SMTC, so this reuses the existing pattern instead of adding one.
- **Audio devices → `AudioDeviceCmdlets` PowerShell module.** `Get-AudioDevice -List` for enumeration + defaults; `Set-AudioDevice` to switch. No admin required. **Alternative:** native Core Audio bindings — rejected as heavier and needing a compiled module.
- **Controller battery → `node-hid` + manual report parsing.** Open the DualSense by VID/PID (`054C`/`0CE6`), read input reports, parse the battery nibble/charge bits. **Bluetooth-specific:** BT reports carry a leading report-ID byte (and trailing CRC) that shift the battery offset versus USB — the parser targets the BT layout for v1. This is reverse-engineered community knowledge, not an official API.

### PowerShell invocation strategy
The server shells out to PowerShell for audio and SMTC. To avoid per-poll process spawn cost and startup latency, prefer a small set of parameterized scripts (and consider a long-lived PowerShell process for the frequently-polled SMTC query). Parse structured output (JSON from `ConvertTo-Json`) rather than scraping text.

### Polling cadences differ per capability
- SMTC now-playing: ~1–2s (needs to feel responsive).
- Audio devices: a few seconds / on client wake (changes rarely).
- Controller battery: ~15–30s (slowly changing).
Each poller broadcasts only on change, so cadence ≠ wire traffic.

### Security: shared-secret pairing token, entered manually
Server generates a random token on first run, persists it, and prints it to the console. The user types it once into the client, which then persists it. **Alternative considered:** QR-code pairing — rejected because scanning a QR from within the PWA needs camera access (`getUserMedia`), which WebKit only grants in a secure context (HTTPS or `localhost`); the server is plain HTTP on a LAN IP, so this would require adding TLS, which is explicitly out of scope for v1. Manual entry has no such dependency. Separately, **no auth at all** was rejected because the LAN includes untrusted devices and the server can control the PC.

### Hosting: server also serves the PWA
The Node server statically serves the client bundle, so the phone installs the app straight from the PC — one thing to run, no separate web host.

### Album art transport: inline base64
Album art (when SMTC exposes it) is base64-encoded and sent inline in the now-playing payload, rather than served from a separate HTTP endpoint. SMTC thumbnails are small (typically well under 100KB), so the simplicity of one message beats the added complexity of a second fetch path. Revisit only if real-world payloads prove large enough to matter.

## Risks / Trade-offs

- **DualSense HID parsing is reverse-engineered** → battery offset/scaling may need trial-and-error against the actual controller; isolate parsing behind one module with the BT layout documented, and degrade gracefully (report "unknown" rather than crash) if reports don't match.
- **`node-hid` is a native module** → build/install friction on Windows (node-gyp toolchain). Mitigation: pin a version with prebuilt binaries for the target Node/OS; document the toolchain fallback.
- **PowerShell per-poll spawn cost/latency** → frequent SMTC polling could be sluggish. Mitigation: reuse a long-lived PS process or throttle; measure before optimizing.
- **`AudioDeviceCmdlets` is a third-party module the user must install** → first-run dependency. Mitigation: check for it at startup and print install guidance.
- **iOS PWA limitations** → the app is suspended in the background and the socket drops; media keys can't be driven from a backgrounded Safari anyway. Mitigation: robust auto-reconnect + full-snapshot-on-connect so resuming the app is instant; accept that it's a foreground control surface.
- **Token over plaintext WS on the LAN** → sniffable by an on-path device. Accepted for v1 given LAN scope; note TLS as a future hardening step.
- **Single controller assumption** → multiple DualSense devices or other pads aren't handled. Accepted; scope is one PS5 controller.

## Open Questions

- Exact DualSense BT battery byte offset/encoding for this specific controller/firmware — cannot be resolved on paper; confirmed empirically during implementation (tracked as task 5.3, with a `--calibrate` raw-report dump mode to identify it).
