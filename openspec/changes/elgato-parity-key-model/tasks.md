## 1. Key model and layout document

- [x] 1.1 Define the layout document shape (`schemaVersion`, `grid`, `root`, `folders`, coordinate-keyed key instances) and a `context` id generator that never reuses a retired id
- [x] 1.2 Implement layout load/save with validation: coordinates within the declared grid, no folder cycles, no references to unregistered actions
- [x] 1.3 Implement the one-time `keys.json` → `layout.json` migration; map array index `i` to `col = i % cols`, `row = floor(i / cols)`; preserve the legacy `color` field; rename the legacy file to `keys.json.bak` rather than deleting it
- [x] 1.4 Unit-test migration against the current six-key `keys.json` and assert the resulting visual order is unchanged
- [x] 1.5 Unit-test rejection paths: out-of-grid coordinate, folder cycle, unknown action uuid, partial-failure atomicity

## 2. Action registry

- [x] 2.1 Define the action module contract: `uuid`, `name`, `icon`, `states[]`, optional `settingsSchema`, optional `panel`, and the `onWillAppear` / `onKeyDown` / `onWillDisappear` handlers
- [x] 2.2 Implement registration with duplicate-`uuid` detection failing startup, and lookup by `uuid`
- [x] 2.3 Implement the `ctx` object: exposes `settings`, `state`, and `setTitle` / `setSubtitle` / `setImage` / `setState`; refuses render calls for contexts the action does not own
- [x] 2.4 Implement visibility tracking so `onWillAppear` / `onWillDisappear` bracket every subscription, and renders for invisible contexts are dropped
- [x] 2.5 Ensure a throwing handler reports the error for its context without breaking the WebSocket connection or other keys
- [x] 2.6 Unit-test lifecycle bracketing across a folder navigation, and the cross-context render refusal

## 3. Settings schema and validation (security boundary — do not fold into task 2)

- [x] 3.1 Define the schema vocabulary: `text`, `select`, `select` with `optionsFrom` naming a live option source
- [x] 3.2 Validate settings on write: reject unknown keys, reject wrong declared types, reject the whole layout on any failure
- [x] 3.3 Validate `optionsFrom` values again at use time against the live option list, so a stale device id cannot reach `psRunner`
- [x] 3.4 Test that a settings object crafted with an extra key, a wrong-typed value, or a stale dynamic value never reaches a PowerShell invocation

## 4. Render protocol and server-side dispatch

- [x] 4.1 Replace `broadcastCard` with context-addressed render messages; suppress emission when the pushed value is unchanged for that context
- [x] 4.2 Replace the `switch (msg.action)` dispatch in `wsHub.js` with registry lookup by the target context's bound action; refuse unknown contexts
- [x] 4.3 Send the layout document plus a render message per visible key on authentication
- [x] 4.4 Confirm renders reach only authenticated clients
- [ ] 4.5 **De-risking step:** ship tasks 1–4 behind an adapter that still emits the legacy `{type:'state', card, payload}` wire format, so the existing client keeps working and the server change is reviewable on its own

## 5. Port existing capabilities to action modules

- [x] 5.1 `com.streamdeck.system.launchApp` — wraps `services/appLauncher`; `settingsSchema: { appId: text }`
- [x] 5.2 `com.streamdeck.system.action` — wraps `services/systemAction`; `settingsSchema: { action: select[lock, sleep] }`
- [x] 5.3 `com.streamdeck.audio.devices` — wraps `services/audioDevices`; contributes a panel with two `picker` widgets; `optionsFrom` sources the live device lists
- [x] 5.4 `com.streamdeck.controller.battery` — wraps `services/controllerBattery`; pushes a `ring` badge image and a subtitle; contributes a panel
- [x] 5.5 `com.streamdeck.system.load` — wraps `services/systemLoad`; pushes a text badge; contributes a panel with two `gauge` widgets
- [x] 5.6 `com.streamdeck.core.openFolder`, `com.streamdeck.core.openPanel`, `com.streamdeck.core.settings`
- [x] 5.7 Verify each ported module subscribes on `onWillAppear` and unsubscribes on `onWillDisappear` — no module may poll while its keys are invisible

## 6. Client: dumb renderer

- [x] 6.1 Render the grid from coordinates and the layout's grid dimensions; render empty cells as empty slots
- [x] 6.2 Apply context-addressed render messages with no branch on action identity; delete `renderAudio`, `renderController`, `renderSystemLoad`, `renderNowPlaying`
- [x] 6.3 Implement the structured image descriptor renderer: exactly `icon`, plus a `ring` or `text` badge; plus the data-URI path
- [x] 6.4 Implement folder navigation from the folder tree; delete `handleKeyAction`'s `nav` case and the static `<section class="screen detail">` blocks
- [x] 6.5 Report visibility changes to the server on navigation so lifecycle fires correctly
- [x] 6.6 Retain the landscape info-panel as-is (see design.md — deliberate divergence)
- [x] 6.7 Confirm `client/sw.js` does not serve a stale `app.js` against the new server; cache-bust on `schemaVersion` if needed

## 7. Client: panels and editor

- [x] 7.1 Implement the three panel widgets — `row`, `picker`, `gauge` — mapping to the existing `.d-row`, `.picker`, `.load-bar` markup; refuse unknown widget types at startup
- [x] 7.2 Render all panel labels and values as text, never as markup
- [x] 7.3 Populate the editor's action list from the server's registered actions
- [x] 7.4 Generate each key's settings form from the selected action's `settingsSchema`; regenerate and discard prior values when the selected action changes
- [x] 7.5 Delete the hardcoded `ICONS` enum, `COLOR_OPTIONS`, `buildPayloadField`, and the client-synthesized `SETTINGS_KEY`
- [x] 7.6 Surface a server-rejected layout write to the user instead of showing it as saved
- [x] 7.7 Prevent the user from deleting the last settings key, or guarantee an alternative route back into the editor

## 8. Cut over and verify

- [x] 8.1 N/A — the 4.5 de-risking adapter was never built. Server and client were implemented together in one pass with no external review checkpoint in between, so the direct cutover (no legacy wire format ever shipped) was taken instead, per the option proposal.md's Impact section already allowed ("no compatibility window is needed").
- [x] 8.2 Rewrote both `client/test/ui.test.js` (Playwright, now driving the context/render protocol and generic panel screen) and `server/test/wsHub.integration.test.js` (now exercising keyDown/openPanel/panelAction/setVisibleContexts) — 6/6 and included in the 57/57 server suite respectively.
- [ ] 8.3 Not done — needs the real iPhone + Windows PC. Verified instead, in this sandbox: the real migration path (`node index.js`, unmocked) run twice end-to-end against the actual default `keys.json`, producing the expected 6-key `layout.json` with icons/titles/colors/coordinates preserved (caught and fixed a real bug this way: migration was silently dropping the per-key `icon` override — see layout.js).
- [ ] 8.4 Partially done — real Windows/PowerShell/DualSense/iPhone verification still needed. Verified instead: every ported capability's dispatch, polling start/stop, and render output via `server/test/actions.integration.test.js` and `wsHub.integration.test.js` with PowerShell mocked at the `execFile` boundary (the same technique the original test suite used).
- [ ] 8.5 Partially done — real-device polling-stops-when-invisible needs the real controller; the mechanism itself (an action's poller starts on `onWillAppear`, stops on `onWillDisappear`, verified with real timers and no leaked intervals) is covered by `actions.integration.test.js`. Folder navigation itself has no nested folder in the default layout to click through by hand yet, but the client-local mechanism is implemented and exercised implicitly via `renderGrid`'s folder-stack back-tile logic.
- [x] 8.6 Verified directly: `client/test/ui.test.js` — "a new trivial action requires zero client-side changes to render correctly" — binds a key to an action the client has never seen, sets only a render cache entry, and asserts it renders correctly with no client code change. Server-side, `server/test/actions.integration.test.js` demonstrates a real ported action (audio/controller/performance) requiring only a new file under `server/actions/`.
