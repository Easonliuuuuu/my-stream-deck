## ADDED Requirements

### Requirement: Self-describing action modules

An action module SHALL declare a globally unique `uuid`, a human-readable `name`, a default icon, and an ordered list of `states`. It MAY declare a `settingsSchema` and a `panel` descriptor. Registering a module SHALL be the only step required to make its capability available to keys.

#### Scenario: Registered action becomes bindable

- **WHEN** a new action module is registered at startup
- **THEN** it appears in the editor's list of available actions, and a key can be bound to it, with no edit to the client or to the transport layer

#### Scenario: Duplicate uuid is rejected

- **WHEN** two action modules declare the same `uuid`
- **THEN** startup fails with an error naming the conflicting `uuid`

### Requirement: Action lifecycle

The registry SHALL invoke `onWillAppear` when a key instance becomes visible, `onKeyDown` when it is activated, and `onWillDisappear` when it ceases to be visible. Each handler SHALL receive a context object exposing the instance's `settings`, its current `state`, and the render methods.

#### Scenario: Appear and disappear bracket a subscription

- **WHEN** a key bound to a polling action becomes visible and later is navigated away from
- **THEN** `onWillAppear` is invoked before any render for that context, and `onWillDisappear` is invoked exactly once afterwards

#### Scenario: Navigating into a folder fires lifecycle for the entered keys

- **WHEN** the user opens a folder
- **THEN** `onWillDisappear` fires for the keys leaving the screen and `onWillAppear` fires for the keys entering it

#### Scenario: Handler error does not break the connection

- **WHEN** an action's `onKeyDown` throws
- **THEN** the error is reported to the client for that context, other keys continue to render, and the WebSocket connection remains open

### Requirement: Context-addressed render protocol

An action SHALL update its keys only by calling `setTitle`, `setSubtitle`, `setImage`, or `setState` against a context it owns. The server SHALL emit render messages addressed by `context`, and the client SHALL apply them without interpreting the action's meaning.

#### Scenario: Client applies a render message it does not understand

- **WHEN** the server emits a render message for a context, carrying a title and a state index
- **THEN** the client updates that key's title and state without any branch specific to the action's identity

#### Scenario: An action cannot render into another action's key

- **WHEN** an action calls a render method with a context belonging to a different key instance
- **THEN** the call is refused and no render message is emitted

#### Scenario: Renders for invisible keys are dropped

- **WHEN** an action pushes a render for a context whose key is not currently visible
- **THEN** no message is sent to the client

### Requirement: Structured or raster key imagery

`setImage` SHALL accept either a data URI or a structured descriptor naming an icon and an optional badge. The client SHALL render structured descriptors without needing to know the action's semantics.

#### Scenario: Structured badge renders

- **WHEN** an action pushes an image descriptor naming icon `controller` and a ring badge at 62 percent
- **THEN** the key renders the controller icon overlaid with a ring at 62 percent

#### Scenario: Raster image renders

- **WHEN** an action pushes a data URI
- **THEN** the key renders that image directly

### Requirement: Schema-declared settings with validation on write and on use

Each action's `settingsSchema` SHALL drive the editor's form. The server SHALL validate settings against the declaring action's schema before persisting them, rejecting unknown keys and values of the wrong declared type. Values whose options are sourced dynamically SHALL additionally be validated against the live option list at the point of use.

#### Scenario: Editor form is generated from the schema

- **WHEN** the user binds a key to an action declaring a `select` setting sourced from a live option list
- **THEN** the editor presents a select control populated from that list, with no action-specific code in the client

#### Scenario: Unknown setting key is rejected on write

- **WHEN** a client submits settings containing a key not present in the action's schema
- **THEN** the write is rejected and the persisted layout is unchanged

#### Scenario: Wrong type is rejected on write

- **WHEN** a client submits a settings value whose type does not match the schema's declared type
- **THEN** the write is rejected and the persisted layout is unchanged

#### Scenario: Stale dynamic value is rejected at use

- **WHEN** a key's stored setting names an audio device that no longer exists, and the key is activated
- **THEN** the action refuses the operation and surfaces an error rather than passing the stale value to the underlying system command

### Requirement: Action-contributed panels

An action MAY declare a panel as a descriptor composed of `row`, `picker`, and `gauge` widgets. The client SHALL render panels from these descriptors. Panels SHALL NOT be expressed as action-supplied markup.

#### Scenario: Panel renders from a descriptor

- **WHEN** a key opens a panel declared with a picker widget bound to a live option list
- **THEN** the client renders the picker with the current selection marked, and selecting an entry invokes the declared handler

#### Scenario: Unknown widget type is refused

- **WHEN** an action declares a panel widget of a type outside the supported set
- **THEN** startup fails with an error naming the unsupported widget type

#### Scenario: Panel content is not markup

- **WHEN** an action supplies a string containing markup as a widget's label or value
- **THEN** the client renders it as text and does not interpret it as markup
