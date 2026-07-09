## MODIFIED Requirements

### Requirement: Typed command dispatch

The server SHALL dispatch commands by looking up the target key instance's `context`, resolving its bound action from the registry, and invoking that action's handler. The server SHALL NOT contain a hardcoded branch per command verb.

#### Scenario: Command routes to the bound action

- **WHEN** an authenticated client sends a key-activation command for a known context
- **THEN** the server resolves the instance's action and invokes its `onKeyDown` handler with that instance's settings

#### Scenario: Unknown context is refused

- **WHEN** a client sends a command naming a context that does not exist in the current layout
- **THEN** the server returns an error and does not invoke any action handler

#### Scenario: Unauthenticated commands are dropped

- **WHEN** a client that has not authenticated sends a key-activation command
- **THEN** the server ignores it and invokes no action handler

#### Scenario: Adding a capability requires no transport change

- **WHEN** a new action module is registered
- **THEN** its commands dispatch correctly with no edit to the WebSocket message handler

### Requirement: State broadcast

The server SHALL send the client the current layout and the state of every visible key on authentication, and thereafter SHALL send context-addressed render messages as actions push updates. The server SHALL NOT broadcast fixed per-capability payloads.

#### Scenario: Snapshot on connect

- **WHEN** a client authenticates
- **THEN** it receives the layout document and a render message for each currently visible key, so the UI renders fully populated without waiting for a poll

#### Scenario: Renders reach only authenticated clients

- **WHEN** an action pushes a render update
- **THEN** it is sent only to authenticated clients

#### Scenario: Unchanged values are not re-sent

- **WHEN** an action's polled source yields a value identical to the last one pushed for a context
- **THEN** no render message is emitted for that context

## ADDED Requirements

### Requirement: Layout write validation

The server SHALL validate a submitted layout before persisting it, rejecting coordinates outside the declared grid, folder cycles, references to unregistered actions, and settings that fail their action's schema. A rejected write SHALL leave the persisted layout unchanged.

#### Scenario: Layout referencing an unregistered action is rejected

- **WHEN** a client submits a layout containing a key bound to an action `uuid` that is not registered
- **THEN** the write is rejected with an error naming the unknown action, and the persisted layout is unchanged

#### Scenario: Partial failure does not partially persist

- **WHEN** a submitted layout contains one valid key and one key failing validation
- **THEN** neither key is persisted and the previous layout remains in effect

#### Scenario: Layout writes require authentication

- **WHEN** an unauthenticated request attempts to write the layout
- **THEN** it is refused and the persisted layout is unchanged
