## ADDED Requirements

### Requirement: Key instances addressed by context

A key on screen SHALL be an instance of a registered action, identified by an opaque, stable `context` id generated when the instance is created. Two key instances MAY reference the same action with different settings.

#### Scenario: Two instances of one action coexist

- **WHEN** the layout contains two keys both bound to `com.streamdeck.system.launchApp`, one with `{appId:'spotify'}` and one with `{appId:'discord'}`
- **THEN** each receives its own `context`, and a render message addressed to one context updates only that key

#### Scenario: Context is stable across reconnects

- **WHEN** the client disconnects and reconnects without the layout changing
- **THEN** each key instance retains the `context` it had before, and the server addresses it by the same id

#### Scenario: Context is retired with the instance

- **WHEN** a key instance is deleted from the layout
- **THEN** its `context` is never reused for a subsequently created instance

### Requirement: Grid coordinates replace array ordering

A key instance SHALL carry a `col,row` coordinate within a folder, and the layout SHALL declare grid dimensions as `cols × rows`. Position SHALL NOT be derived from array index.

#### Scenario: Key placed at a coordinate

- **WHEN** a key is stored at coordinate `2,1` in a `3 × 3` grid
- **THEN** it renders in the third column of the second row regardless of its position in any serialized collection

#### Scenario: Sparse grid

- **WHEN** a folder declares a `3 × 3` grid but contains keys at only two coordinates
- **THEN** the remaining seven cells render as empty slots, and the layout is valid

#### Scenario: Coordinate outside declared grid is rejected

- **WHEN** a layout is written containing a key at `5,0` in a `3 × 3` grid
- **THEN** the write is rejected and the persisted layout is left unchanged

### Requirement: Multi-state keys

An action MAY declare two or more states. A key instance bound to such an action SHALL carry a `state` index, and the imagery rendered SHALL be that of the current state.

#### Scenario: Toggle key reflects state

- **WHEN** an action declaring two states pushes `setState(context, 1)`
- **THEN** the key renders the second state's imagery

#### Scenario: Single-state action ignores state

- **WHEN** an action declares one state
- **THEN** its instances render that state's imagery and any `state` value other than `0` is treated as `0`

### Requirement: Folders

A folder SHALL contain a coordinate-addressed collection of key instances. A key MAY open another folder, forming a tree rooted at a single root folder.

#### Scenario: Opening a folder

- **WHEN** the user activates a key bound to the open-folder action
- **THEN** the grid renders the target folder's keys, and a means of returning to the parent folder is present

#### Scenario: Folder cycles are rejected

- **WHEN** a layout is written in which a folder is reachable from itself
- **THEN** the write is rejected and the persisted layout is left unchanged

### Requirement: Layout persistence and migration

The layout SHALL be persisted as a versioned document. On startup, a legacy `keys.json` lacking a `schemaVersion` SHALL be migrated forward exactly once, preserving the user's existing keys.

#### Scenario: Legacy keys are migrated

- **WHEN** the server starts and finds a legacy `keys.json` with the six default keys and no `schemaVersion`
- **THEN** each key is converted to an action-bound instance at the coordinate implied by its former array index, and the resulting layout renders the same six keys in the same visual order

#### Scenario: Legacy file is preserved

- **WHEN** migration completes
- **THEN** the legacy file is retained under a backup name rather than deleted

#### Scenario: Migration is not repeated

- **WHEN** the server restarts after a successful migration
- **THEN** the already-migrated layout is loaded unchanged and no second migration runs

### Requirement: Settings editor entry point is a real key

The settings editor SHALL be reachable via a registered action occupying a real coordinate, not a client-synthesized key appended to every grid.

#### Scenario: Settings key is part of the layout

- **WHEN** the grid is rendered
- **THEN** the settings key appears at its stored coordinate, and no key is appended outside the layout

#### Scenario: User cannot lose access to the editor

- **WHEN** the user attempts to delete the last remaining settings key
- **THEN** the deletion is refused with an explanation, or an alternative entry point to the editor remains available
