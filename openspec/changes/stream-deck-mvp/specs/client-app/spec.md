## ADDED Requirements

### Requirement: Installable PWA

The client SHALL be installable to the iPhone home screen and run fullscreen without browser chrome.

#### Scenario: Add to Home Screen

- **WHEN** the user opens the client URL in Safari and chooses "Add to Home Screen"
- **THEN** the app installs with its name, icon, and a manifest configured for `display: standalone` (or fullscreen)

#### Scenario: Launch from home screen

- **WHEN** the user taps the installed app icon
- **THEN** the app launches fullscreen with no Safari address bar or navigation chrome

### Requirement: Connection and pairing UX

The client SHALL support pairing via a QR code scanned by the phone's native camera, and SHALL persist the connection so it reconnects automatically. Manual entry of the PC's address and pairing token SHALL remain available as a fallback.

#### Scenario: Pairing via QR scan

- **WHEN** the user scans the server-printed QR code with the iPhone's Camera app and opens the resulting link
- **THEN** Safari opens the client with the pairing token in the URL, and the client reads it and connects automatically without the user typing anything

#### Scenario: Manual first connection

- **WHEN** the app runs for the first time with no saved server or token and no token was supplied via URL
- **THEN** it prompts the user to manually enter the PC's address and the pairing token

#### Scenario: Automatic reconnect

- **WHEN** the app has previously paired and is launched again, or the connection drops
- **THEN** it reconnects to the saved server using the saved token without re-prompting the user

#### Scenario: Connection status visible

- **WHEN** the connection to the server is lost
- **THEN** the UI clearly indicates a disconnected state rather than showing stale controls as if live

### Requirement: Card-based control surface

The client SHALL render the control surface as distinct cards (now-playing, audio devices, controller) laid out for touch, and SHALL update each card in place as state arrives.

#### Scenario: Render state snapshot

- **WHEN** the client receives a full state snapshot from the server
- **THEN** it renders the now-playing, audio-devices, and controller cards reflecting that state

#### Scenario: Live card updates

- **WHEN** the client receives a state update for a single card (e.g. new track, battery change)
- **THEN** it updates only the affected card without disrupting the rest of the layout

#### Scenario: Button press sends command

- **WHEN** the user taps a control on a card (e.g. play/pause, switch audio device)
- **THEN** the client sends the corresponding command message to the server over the WebSocket
