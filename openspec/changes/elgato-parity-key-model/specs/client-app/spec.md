## MODIFIED Requirements

### Requirement: Card-based control surface

The client SHALL render a grid of key instances from the layout document, applying context-addressed render messages without interpreting any action's meaning. The client SHALL NOT contain per-capability render functions, nor static detail sections keyed to capability names.

Detail views SHALL be rendered from action-supplied panel descriptors. The persistent landscape information panel (now-playing, CPU/GPU, focused app) is retained as a deliberate divergence from the reference model — see design.md.

#### Scenario: Grid renders from coordinates

- **WHEN** the client receives a layout with keys at coordinates within a declared grid
- **THEN** each key renders in its declared cell, and empty cells render as empty slots

#### Scenario: Client has no capability-specific render code

- **WHEN** a new action is registered on the server and bound to a key
- **THEN** the key renders its title, imagery, and state correctly with no change to the client

#### Scenario: Panel renders from a descriptor

- **WHEN** the user activates a key that opens a panel
- **THEN** the client renders the panel's widgets from the descriptor, with no static section corresponding to that panel in the document

#### Scenario: Stale state is not shown as live

- **WHEN** the connection to the server is lost
- **THEN** the UI indicates a disconnected state rather than showing stale key titles and states as if live

### Requirement: Key configuration UI

The client SHALL let the user add, edit, remove, and position keys. The editor's action list SHALL be populated from the server's registered actions, and each key's settings form SHALL be generated from the selected action's `settingsSchema`. The editor SHALL NOT hardcode the set of available actions, icons, or payload shapes.

#### Scenario: Action list comes from the server

- **WHEN** the user opens the editor to add a key
- **THEN** the selectable actions are exactly those registered on the server, each shown with its declared name and icon

#### Scenario: Settings form follows the selected action

- **WHEN** the user changes the selected action for a key
- **THEN** the settings form is regenerated from the newly selected action's schema, and values from the previous action's schema are discarded

#### Scenario: Key is positioned within the grid

- **WHEN** the user moves a key to an unoccupied cell
- **THEN** the key's coordinate is updated and the change is reflected in the grid immediately

#### Scenario: Layout is persisted on save

- **WHEN** the user saves an edited layout
- **THEN** the layout is written to the server, and a failed write is surfaced to the user rather than silently discarded

#### Scenario: Rejected layout is surfaced

- **WHEN** the server rejects a layout write because a setting fails schema validation
- **THEN** the client reports the rejection and does not present the layout as saved

### Requirement: Folder navigation

The client SHALL support navigating into a folder and returning to its parent. Navigation SHALL be driven by the layout's folder tree, not by static screen identifiers.

#### Scenario: Navigate into and out of a folder

- **WHEN** the user activates a key bound to the open-folder action and then activates the return affordance
- **THEN** the grid renders the target folder's keys and then the parent folder's keys

#### Scenario: Lifecycle follows navigation

- **WHEN** the user navigates between folders
- **THEN** the client informs the server which key contexts became visible and which ceased to be visible
