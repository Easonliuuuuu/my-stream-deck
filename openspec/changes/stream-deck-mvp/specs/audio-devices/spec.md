## ADDED Requirements

### Requirement: List audio devices and identify defaults

The server SHALL enumerate the system's playback and recording devices and identify which are currently the default output and input.

#### Scenario: Enumerate devices

- **WHEN** the server queries audio devices
- **THEN** it returns the available playback and recording devices, each flagged with whether it is the current default

#### Scenario: Report active devices to client

- **WHEN** the client renders the audio card
- **THEN** it shows the current default output device and default input device by name

### Requirement: Switch the default device

The server SHALL set a selected device as the default when the user chooses it, and reflect the change back to clients.

#### Scenario: Switch output device

- **WHEN** an authenticated client sends a command to set a specific playback device as default
- **THEN** the server sets that device as the default output and broadcasts the updated audio state

#### Scenario: Switch input device

- **WHEN** an authenticated client sends a command to set a specific recording device as default
- **THEN** the server sets that device as the default input and broadcasts the updated audio state

#### Scenario: Invalid device handled

- **WHEN** a switch command references a device that no longer exists
- **THEN** the server returns an error and leaves the current defaults unchanged

### Requirement: Refresh device state

The server SHALL keep the reported audio device state reasonably current so the phone reflects changes made elsewhere on the PC.

#### Scenario: External change reflected

- **WHEN** the default device is changed by another application or by Windows itself
- **THEN** the server detects the change on its next poll and broadcasts the updated defaults to clients
