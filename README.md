# My Stream Deck

A self-hosted stream-deck replacement: a spare iPhone acts as a companion control
screen for a Windows PC over the LAN — media controls, audio device switching,
and PS5 (DualSense) controller battery status — without leaving a fullscreen app
to reach Windows settings.

See `openspec/changes/stream-deck-mvp/` for the full proposal, specs, and design.

## Requirements (on the Windows PC)

- Node.js (LTS)
- PowerShell (built into Windows)
- The `AudioDeviceCmdlets` PowerShell module:
  ```powershell
  Install-Module -Name AudioDeviceCmdlets -Scope CurrentUser
  ```
- A DualSense controller paired over Bluetooth (for the controller battery card)

## Setup

```powershell
cd server
npm install
npm start
```

On first run the server:
- Generates and prints a **pairing token** (saved to `server/.pairing.json` — do not commit this file)
- Prints a pairing URL and an ASCII **QR code** in the terminal
- Advertises itself on the LAN via mDNS as `_streamdeck._tcp` (not consumable by the PWA itself — see `openspec/changes/stream-deck-mvp/design.md`)

## Connecting the iPhone

**Scan to pair (recommended):** open the iPhone's built-in **Camera** app and point it at the QR code printed in the server's terminal. Tap the banner that appears — it opens Safari straight to the client with the pairing token already filled in, no typing required.

**Manual pairing (fallback):** open Safari, go to `http://<pc-ip>:8787`, and enter the PC's address and the pairing token printed by the server.

Either way, once connected: tap the Share icon → **Add to Home Screen** to install it as a fullscreen app.

The client remembers the server address and token and reconnects automatically.

## Calibrating the DualSense battery reading

The battery byte offset in the Bluetooth HID report is a best-known value from
community reverse-engineering and may need adjusting for your specific
controller/firmware. To calibrate:

```powershell
cd server
npm run calibrate-controller
```

This dumps raw HID report bytes. Plug/unplug the controller's charging cable and
watch which byte changes — that's the real battery byte. Update
`BATTERY_BYTE_INDEX` in `server/services/controllerBattery.js` if it differs from
the current value (55).

## Project layout

```
server/            Node.js control server (runs on the Windows PC)
  index.js         Entry point: HTTP + WebSocket + mDNS
  wsHub.js         WebSocket auth, command dispatch, state broadcast
  config.js        Ports, poll intervals, pairing token
  pairing.js        Pairing token generation/persistence
  services/        One module per capability (audio, media, controller, discovery)
  scripts/         PowerShell scripts invoked by the services

client/            Installable PWA served to the iPhone
  index.html       Card layout (now playing / audio / controller)
  app.js           WebSocket client, pairing UX, rendering
  styles.css
  manifest.json
```

## Known limitations (v1)

- Windows only.
- No Spotify-specific integration — now-playing and transport controls work via
  Windows System Media Transport Controls (SMTC) and simulated media keys, so
  they work with whatever app is currently playing.
- No Bluetooth device connect/disconnect toggle (deferred; audio device
  *switching*, not pairing management, is supported).
- LAN only, no remote/internet access; the pairing token is the only access
  control (no TLS).
