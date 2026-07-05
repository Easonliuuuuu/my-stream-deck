## Why

Commercial stream deck / companion-screen apps charge recurring subscription fees for functionality that is fundamentally a LAN-connected button grid. A spare iPhone can serve the same role for free, letting the user control their Windows PC (media, audio devices) and monitor status (controller battery, active audio devices) without exiting a fullscreen game or app to reach Windows settings.

## What Changes

- Introduce a **Node.js server** that runs on the Windows PC, exposing a WebSocket API over the LAN and executing all privileged actions locally (media keys, audio device switching, HID reads, media metadata).
- Introduce an **installable PWA client** served to the iPhone (Add to Home Screen), rendering a card-based control surface and communicating with the server over WebSocket.
- Provide **DualSense (PS5 controller) battery monitoring** over Bluetooth by reading and parsing raw HID input reports.
- Provide **audio device visibility and switching** — display the current default playback and recording devices and allow switching by tapping an alternative.
- Provide **now-playing display and media transport controls** — title/artist/art and play/pause/skip for whatever app is playing, sourced from Windows System Media Transport Controls (SMTC).
- Provide **LAN discovery and a shared-secret pairing token** so the phone can find the server and unauthorized devices on the network cannot issue commands.

## Capabilities

### New Capabilities
- `control-server`: The PC-side Node.js service — WebSocket transport, LAN discovery (mDNS), pairing/authentication, command dispatch, and periodic state polling/broadcast.
- `client-app`: The iPhone PWA — installable manifest, WebSocket client, connection/pairing UX, and the card-based control surface layout.
- `controller-battery`: Reading and parsing DualSense battery/charge status over Bluetooth HID and surfacing connected state.
- `audio-devices`: Listing default playback/recording devices, reporting the active ones, and switching the default device.
- `media-controls`: Now-playing metadata (title/artist/art/play state) via SMTC and transport control via simulated media keys.

### Modified Capabilities
<!-- None — this is a greenfield project with no existing specs. -->

## Impact

- **New codebase** (greenfield): `server/` (Node.js) and `client/` (PWA) — no existing code affected.
- **Server dependencies**: Node.js runtime; `ws` (WebSocket), an HTTP server for the PWA, an mDNS/bonjour library, `node-hid` (native module) for controller reads.
- **External toolchain**: PowerShell, invoked from Node for audio device control (`AudioDeviceCmdlets` module) and SMTC media metadata (WinRT via PowerShell).
- **Privileges & platform**: Windows-only; `node-hid` requires the DualSense to be reachable over Bluetooth HID. Audio-device and media queries run under the current user (no elevation expected for the v1 feature set).
- **Security surface**: Server listens on the LAN — introduces a pairing token / shared secret to gate commands.
