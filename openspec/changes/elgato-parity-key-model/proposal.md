## Why

The app's keys are a view configuration, not a program. A key is `{ id, label, icon, action, payload, color }` where `icon` is one of eight hardcoded SVGs, `action` is one of three verbs, and `payload` is a bare string. Adding one capability — say, toggling a smart light — requires edits in seven places across `client/index.html`, `client/app.js`, `server/wsHub.js`, `server/services/`, and `server/scripts/`. Worst of all, a `nav` key can only point at a screen that **already exists as static HTML** (`app.js:59` reads `key.payload` into `data-screen`, which must match a hand-written `<section data-id>`). The key config cannot create anything; it can only select from what is hardcoded.

Research into the actual Elgato feature split (Stream Deck Mobile [went free in 2023](https://www.corsair.com/newsroom/press-release/stream-deck-goes-free-elgato-announces-groundbreaking-changes-to-mobile-app)) shows the paywall is not where one would guess:

- **Free:** 6 keys, unlimited actions, plugins, folders, pages, profiles.
- **Pro:** up to 64 keys, custom grid layouts, custom backgrounds and key images.

There is no exotic *functionality* behind the paywall. "Pro" is arbitrary grid dimensions plus user-supplied images — pure data model. The hard part is all in the free tier: plugins, folders, profiles. Therefore feature parity in either direction depends on one prerequisite, and this change is that prerequisite.

The mechanism that unblocks everything is Elgato's `context`: the unit of work is not "an action" but *an action instance at a coordinate*, addressed by an opaque id. The runtime pushes `setTitle` / `setImage` / `setState` at a context; the renderer knows nothing about what the action does. Adopting it deletes `renderAudio`, `renderController`, and `renderSystemLoad` from the client and turns the client into a dumb renderer.

## What Changes

- Introduce a **key instance model**: a key is an instance of a registered action, bound to grid coordinates within a folder, carrying a settings object and a state index. Instances are addressed by a stable `context` id.
- Introduce an **action registry**: capabilities are contributed by self-describing action modules declaring a `uuid`, `name`, `states`, a `settingsSchema`, and lifecycle handlers (`onWillAppear` / `onKeyDown` / `onWillDisappear`). Registering a module is the *only* step needed to add a capability.
- Introduce a **render protocol**: action modules push `setTitle`, `setSubtitle`, `setImage`, and `setState` against a `context`. The client applies them blindly. Card-specific render functions are removed.
- Replace the array-index key ordering with **grid coordinates** (`col,row`) inside a configurable `cols × rows` grid.
- Replace the `nav` action and its static `<section>` screens with **folders** (a key that opens a nested page of keys) and **action-contributed panels** (a declarative descriptor, not hand-written HTML).
- Migrate the three existing verbs onto the registry: `launch` → `com.streamdeck.system.launchApp`, `system` → `com.streamdeck.system.action`, `nav` → `com.streamdeck.core.openFolder` / `openPanel`.
- Migrate `keys.json` forward on first load; the existing six-key layout is preserved.

## Capabilities

### New Capabilities
- `key-model`: Key instances, contexts, grid coordinates, folders, the settings object, multi-state keys, and the persisted layout document with its migration from the legacy `keys.json`.
- `action-registry`: Action module contract (manifest fields, settings schema, lifecycle handlers), registration and lookup, command dispatch by action `uuid`, and the server→client render protocol (`setTitle`/`setSubtitle`/`setImage`/`setState`).

### Modified Capabilities
- `client-app`: Becomes a dumb renderer — no per-capability render functions, no static detail sections. Grid renders from coordinates; folder navigation replaces `nav`; the key editor is driven by each action's `settingsSchema` rather than a hardcoded action/payload/icon enum.
- `control-server`: Command dispatch moves from a hardcoded `switch (msg.action)` in `wsHub.js` to registry lookup by action `uuid`. State polling moves from four fixed `refreshX` timers broadcasting fixed `card` names to action modules subscribing to sources and pushing against their own contexts.

## Impact

- **`client/app.js`** (515 lines): substantial rewrite. `renderAudio`, `renderController`, `renderSystemLoad`, `renderNowPlaying`, `handleKeyAction`, `buildPayloadField`, and the `ICONS` enum are removed or replaced. The settings editor is regenerated from schemas.
- **`client/index.html`**: the four static `<section class="screen detail">` blocks are removed; panels render from descriptors. The landscape info-panel is **retained** (see design.md — this is a deliberate divergence from Elgato).
- **`server/wsHub.js`** (147 lines): the `switch` dispatch and the four `refreshX`/`broadcastCard` functions are replaced by registry dispatch and per-context pushes.
- **`server/services/*`**: unchanged as capability providers; each gains a thin action module wrapper in a new `server/actions/` tree.
- **`server/keys.json`**: superseded by a layout document (folders, grid dims, coordinates). A one-time forward migration preserves the current six keys.
- **Wire protocol**: breaking. `{type:'state', card, payload}` is replaced by context-addressed render messages. Both ends ship together, so no compatibility window is needed.
- **No new runtime dependencies.** Dynamic key imagery is composed on the client from structured data rather than rasterized server-side, preserving the existing "no compiled toolchain beyond `node-hid`" constraint.
- **Security**: `settingsSchema` values arrive from the client and reach action modules. Schema validation on write becomes load-bearing, not cosmetic.

## Non-Goals

Deferred to named follow-up changes, in this order:

1. `profiles-and-auto-switch` — multiple layouts, swapped on focused-app change. The `activeApp` field is already polled in `systemLoad` and currently unused; this is the cheapest large feature once the key model lands.
2. `custom-key-imagery` — user-supplied key images, custom backgrounds, configurable grid dimensions up to 64 keys. This is the "Pro tier" surface, and it is nearly trivial once coordinates and image-capable keys exist.
3. `plugin-process-boundary` — third-party plugins as separate processes. This change deliberately shapes the action-module interface to match Elgato's lifecycle so that a *single* proxy module can later bridge to a child process, rather than requiring a rewrite.

Also out of scope: multi-actions (action sequences with delays), dials/encoders, and a property-inspector webview.
