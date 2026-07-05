## ADDED Requirements

### Requirement: Detect DualSense connection over Bluetooth

The server SHALL detect whether a DualSense controller is currently reachable over Bluetooth HID and report its connected/disconnected state to clients.

#### Scenario: Controller connected

- **WHEN** a DualSense (Sony vendor `054C`, product `0CE6`) is present as a Bluetooth HID device
- **THEN** the server reports the controller as connected

#### Scenario: Controller absent

- **WHEN** no DualSense HID device is present
- **THEN** the server reports the controller as disconnected and does not report a stale battery value

### Requirement: Read battery and charge status over Bluetooth

The server SHALL read the DualSense's raw HID input reports and parse the battery level and charging state, accounting for the Bluetooth report format.

#### Scenario: Parse Bluetooth input report

- **WHEN** the controller is connected over Bluetooth and an input report is received
- **THEN** the server parses the battery byte using the Bluetooth report layout (accounting for the leading report-ID offset) and derives a battery percentage and charging flag

#### Scenario: Battery reported to client

- **WHEN** a battery level and charge state have been parsed
- **THEN** the server includes them in the controller card state sent to clients

### Requirement: Poll battery at a low frequency

The server SHALL poll controller battery on an interval appropriate to a slowly-changing value rather than continuously.

#### Scenario: Periodic battery poll

- **WHEN** the controller is connected
- **THEN** the server samples battery on an interval on the order of tens of seconds and broadcasts only when the value or charge state changes
