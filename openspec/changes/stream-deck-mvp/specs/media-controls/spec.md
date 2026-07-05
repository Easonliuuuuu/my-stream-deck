## ADDED Requirements

### Requirement: Report now-playing metadata via SMTC

The server SHALL read now-playing metadata from Windows System Media Transport Controls and report it to clients, so the phone shows what is currently playing regardless of which app it is.

#### Scenario: Track metadata reported

- **WHEN** a media app (e.g. Spotify) is playing and exposes a media session to SMTC
- **THEN** the server reports the title, artist, and play/pause state to clients

#### Scenario: Album art reported when available

- **WHEN** the current media session exposes album art via SMTC
- **THEN** the server includes the art (encoded for transport) in the now-playing state, or omits it gracefully when unavailable

#### Scenario: No media session

- **WHEN** no app is currently exposing a media session
- **THEN** the server reports an idle now-playing state and the client shows an empty/placeholder now-playing card

### Requirement: Media transport control via media keys

The server SHALL execute play/pause, next, and previous by simulating the system media keys, so transport control works for any media application.

#### Scenario: Play/pause

- **WHEN** an authenticated client sends a play/pause command
- **THEN** the server simulates the play/pause media key and the active media app toggles playback

#### Scenario: Skip track

- **WHEN** an authenticated client sends a next or previous command
- **THEN** the server simulates the corresponding media key and the active media app changes track

### Requirement: Responsive now-playing updates

The server SHALL poll SMTC frequently enough that play/pause state and track changes appear promptly on the phone.

#### Scenario: Prompt state reflection

- **WHEN** the play state or track changes on the PC
- **THEN** the change is reflected in the client's now-playing card within a couple of seconds
