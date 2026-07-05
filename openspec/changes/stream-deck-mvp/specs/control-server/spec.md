## ADDED Requirements

### Requirement: LAN advertisement

The server SHALL advertise itself on the local network via mDNS, so that any mDNS-capable tool on the LAN can resolve it without a hardcoded IP. Note: standard web browsers have no API for browsing mDNS/Bonjour services, so this does not by itself give a browser-based client zero-config discovery — see the `client-app` capability for how the PWA actually connects (manual entry of address + pairing token).

#### Scenario: Server advertises on startup

- **WHEN** the server process starts
- **THEN** it registers an mDNS service (e.g. `_streamdeck._tcp`) advertising its host, port, and a stable instance name

#### Scenario: Non-browser client resolves server without configuration

- **WHEN** an mDNS-capable client (e.g. a native app, a CLI tool) on the same LAN browses for the `_streamdeck._tcp` service
- **THEN** it receives the server's address and port and can open a connection without a hardcoded IP

### Requirement: Pairing and authentication

The server SHALL require every client to present a valid shared secret before any command is accepted, so that other devices on the LAN cannot control the PC.

#### Scenario: First-run token generation

- **WHEN** the server starts for the first time and no pairing token exists
- **THEN** it generates a random token, persists it locally, and displays it (e.g. console / QR) for the user to enter on the phone

#### Scenario: Authenticated client accepted

- **WHEN** a client connects and presents the correct token during the handshake
- **THEN** the server marks the connection authenticated and begins accepting commands and sending state updates

#### Scenario: Unauthenticated command rejected

- **WHEN** a connection that has not presented a valid token sends any command
- **THEN** the server rejects the command and does not execute the requested action

### Requirement: WebSocket transport and command dispatch

The server SHALL expose a WebSocket endpoint that receives typed command messages from authenticated clients and routes each to the correct handler.

#### Scenario: Known command dispatched

- **WHEN** an authenticated client sends a message with a recognized command type and payload
- **THEN** the server invokes the corresponding handler and returns an acknowledgement or error result for that message

#### Scenario: Unknown command handled safely

- **WHEN** an authenticated client sends a message with an unrecognized command type
- **THEN** the server responds with an error and does not crash or affect other connections

### Requirement: Periodic state polling and broadcast

The server SHALL periodically gather device state (controller battery, audio devices, media metadata) and broadcast changes to all authenticated clients.

#### Scenario: State pushed to connected clients

- **WHEN** polled state changes (e.g. battery level drops, default audio device changes, track changes)
- **THEN** the server broadcasts the updated state to every authenticated client

#### Scenario: State sent on connect

- **WHEN** a client completes authentication
- **THEN** the server sends the current full state snapshot so the UI can render immediately without waiting for the next poll

### Requirement: Static hosting of the client app

The server SHALL serve the PWA client assets over HTTP so the phone can install the app from the PC without a separate web server.

#### Scenario: Phone loads the client

- **WHEN** the phone browser requests the server's HTTP root
- **THEN** the server returns the PWA's HTML, manifest, service worker, and assets
