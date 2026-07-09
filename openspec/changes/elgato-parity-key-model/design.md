## Context

`stream-deck-mvp` delivered a working LAN control surface: a Node server on Windows owning all privileged capability, a PWA on the phone rendering pushed state. Its design goal said "structure the server so new cards/capabilities can be added without reworking transport or state plumbing." Transport and state plumbing were indeed left alone — but *everything else* has to change per capability.

The concrete coupling, as built:

```
keys.json  nav:"audio" ─────┐
                            ├──▶ all three must agree on the literal string "audio"
client/index.html  <section data-id="audio">
client/app.js      renderAudio() → querySelector('.audio-summary')
server/wsHub.js    broadcastCard('audio')
```

A key cannot introduce a screen, an icon, or a command. It can only name one that a human already wrote. That is the wall this change removes.

The reference model is Elgato's Stream Deck SDK, whose relevant primitives are the [manifest](https://docs.elgato.com/streamdeck/sdk/references/manifest/) (actions declare `UUID`, `Name`, `Icon`, `States`) and the [plugin WebSocket protocol](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/) (`willAppear`/`keyDown`/`willDisappear` in; `setTitle`/`setImage`/`setState` out, each addressed by `context`).

## Goals / Non-Goals

**Goals:**
- Adding a capability touches exactly one new directory under `server/actions/` and zero core files.
- The client renders keys without knowing what any key does.
- A key can be a toggle (two states) with distinct imagery per state.
- Grid position is data (`col,row`), not array index — so grid dimensions become a config value rather than a layout assumption.
- Shape the action-module interface so a process boundary can be added later behind a single adapter.

**Non-Goals:**
- No process isolation for action modules in this change; they run in-process, fully trusted.
- No multi-actions, dials, or property-inspector webviews.
- No server-side image rasterization (see Decisions).
- No change to how the underlying services reach Windows (PowerShell, `node-hid`) — those are wrapped, not rewritten.

## Decisions

### `context` is the unit of addressing, replacing `card`

The server currently broadcasts `{type:'state', card:'audio', payload}` and the client dispatches on `card` into a bespoke render function. Instead, each key instance on screen gets an opaque `context` id, and the server emits `{type:'render', context, title?, subtitle?, image?, state?}`.

An action module receives `onWillAppear(ctx)` when its instance becomes visible, subscribes to whatever source it wants, and calls `ctx.setTitle(...)` / `ctx.setState(...)`. `onWillDisappear(ctx)` unsubscribes. The client applies render messages to the key holding that context and has no branch per capability.

This is what makes plugins possible at all: a plugin can never ship a `<section>` into `index.html`, but it can always push a title and an image.

**Alternative considered — keep `card` and add a `cards` registry.** Rejected: it preserves the assumption that a capability owns *one* singleton display, which forbids two keys bound to the same action with different settings (two audio devices, two lights). `context` is per-instance; `card` is per-capability.

### Hybrid: keys get the Elgato model, but panels survive

A purist reading says delete detail screens entirely. Elgato has no "card" and no drill-in screen — it has keys with dynamic images, folders, and profiles. The audio picker would become a folder of one key per device; the battery ring would become a key whose image is a canvas-rendered ring.

**We are not doing that.** Elgato's model is shaped by a hardware constraint we do not have: their keys are 72×72px LCDs with nothing around them. A phone has a whole screen. The landscape layout in `index.html:124` — a persistent now-playing strip and live CPU/GPU alongside the grid — is *better* than Elgato precisely because it refuses to pretend the screen is fifteen tiny squares. Mimicking the constraint rather than the capability would be a downgrade.

So: an action module may optionally contribute a **panel** — a drill-in detail view — declared as a descriptor rather than hand-written HTML:

```js
panel: {
  title: 'Audio',
  widgets: [
    { type: 'picker', source: 'audio.outputs', current: 'audio.output.id', onSelect: 'setOutput' },
    { type: 'picker', source: 'audio.inputs',  current: 'audio.input.id',  onSelect: 'setInput'  },
  ],
}
```

**Risk, stated plainly:** a widget descriptor is an ad-hoc UI DSL, and ad-hoc UI DSLs grow without bound. Mitigation: ship exactly three widget types — `row` (label/value), `picker` (list with a current selection), and `gauge` (labelled bar) — because those three are precisely what the existing `.d-row`, `.picker`, and `.load-bar` markup already implement. Adding a fourth widget type requires a design note explaining why the existing three cannot express it. If the DSL starts sprawling anyway, that is the signal to reconsider the purist path.

### Dynamic key imagery is composed on the client, not rasterized on the server

Elgato plugins draw to a canvas, base64 the PNG, and `setImage`. Doing that on the server means `node-canvas` on Windows, which means a compiled toolchain — directly contradicting an existing project constraint ("no compiled C#/C++ helper projects"; `node-hid` is the sole exception, and it ships prebuilt binaries).

Instead `setImage` accepts **either** a data URI (for genuinely arbitrary imagery, e.g. album art, which the server already sends as base64) **or** a structured badge descriptor the client renders:

```js
ctx.setImage({ icon: 'controller', badge: { kind: 'ring', pct: 62 } })
ctx.setImage({ icon: 'performance', badge: { kind: 'text', value: '47%' } })
```

This keeps "the client is a dumb renderer" *almost* true — the client knows how to draw a ring and a text badge, but not what a ring means. That is a real compromise, and it is the right one: it costs one small abstraction and saves a native build dependency on the user's PC. The data-URI escape hatch means no capability is foreclosed.

### Folders only; no pages

Elgato has both folders (a key opens a nested grid) and pages (swipe between grids at the same level). They coexist for historical reasons. Folders subsume pages for our purposes: a page is a folder you reach by swiping rather than tapping, and we do not have Elgato's constraint of a fixed physical key count forcing overflow onto pages.

Ship folders. If swipe-between-grids is wanted later, it is a navigation affordance over the same folder tree, not a second data structure.

### Settings are schema-declared, not HTML

Elgato loads a per-action HTML `PropertyInspectorPath` in a webview. That is heavy and it is a script-injection surface in a PWA that already holds a bearer token in `localStorage`.

Each action declares a `settingsSchema`; the client auto-renders the form. This reuses the form-building code already present in `buildEditHTML`, and it means the editor gains support for a new action for free.

**Consequence, and it is load-bearing:** settings values now originate client-side and flow into action modules that shell out to PowerShell. `server/services/psRunner.js` already exists as the choke point. Schema validation on write is a security control, not input hygiene — it must reject unknown keys and enforce declared types, and `optionsFrom`-sourced values must be validated against the live option list at *use* time, not merely at write time.

### In-tree registry now, process boundary later

Action modules are plain CommonJS objects registered at startup. No IPC, no manifest discovery, no sandbox.

But the handler interface is deliberately shaped exactly like Elgato's lifecycle (`onWillAppear` / `onKeyDown` / `onWillDisappear` receiving a `ctx` exposing `setTitle`/`setImage`/`setState`/`settings`). When third-party plugins are wanted, one adapter module implements that same interface by proxying each call over a WebSocket to a child process. The process boundary becomes an implementation detail of a single module instead of a rewrite of every call site.

This is the central bet of the change: **80% of the flexibility for 10% of the work**, with the remaining 90% deferred behind an interface that already has the right shape.

## Data model

```
layout.json
{
  "schemaVersion": 2,
  "grid": { "cols": 3, "rows": 3 },
  "root": "folder-root",
  "folders": {
    "folder-root": {
      "name": "Home",
      "keys": {
        "0,0": { "context": "ctx-a1", "action": "com.streamdeck.core.openPanel",
                 "settings": { "panelOf": "com.streamdeck.audio.devices" }, "state": 0 },
        "1,0": { "context": "ctx-b2", "action": "com.streamdeck.system.launchApp",
                 "settings": { "appId": "spotify" }, "state": 0,
                 "title": "Spotify" }
      }
    }
  }
}
```

`context` is generated at instance creation and is stable for the instance's life. `title` present on the instance overrides the action's default; absent means the action controls it.

## Migration

`keys.json` → `layout.json`, executed once on server start when `schemaVersion` is absent:

| Legacy | Becomes |
|---|---|
| `{action:'nav', payload:'audio'}` | `com.streamdeck.core.openPanel`, `{panelOf:'com.streamdeck.audio.devices'}` |
| `{action:'nav', payload:'controller'}` | `com.streamdeck.core.openPanel`, `{panelOf:'com.streamdeck.controller.battery'}` |
| `{action:'nav', payload:'performance'}` | `com.streamdeck.core.openPanel`, `{panelOf:'com.streamdeck.system.load'}` |
| `{action:'launch', payload:'spotify'}` | `com.streamdeck.system.launchApp`, `{appId:'spotify'}` |
| `{action:'system', payload:'lock'}` | `com.streamdeck.system.action`, `{action:'lock'}` |

Array index `i` maps to `col = i % cols`, `row = floor(i / cols)`. The legacy `color` field is preserved verbatim on the instance. The legacy file is renamed to `keys.json.bak` rather than deleted, so a failed migration is recoverable by hand.

The `_settings` key is currently synthesized client-side and appended to every grid (`app.js:38`, `app.js:73`). It becomes a real registered action, `com.streamdeck.core.settings`, occupying a real coordinate — removing a special case that would otherwise have to be taught about folders.

## Risks

- **Big-bang rewrite of `app.js`.** ~515 lines, most of it touched. Mitigation: land the server-side registry and render protocol first behind the existing wire format (an adapter emitting `card`-shaped messages), then swap the client. Two reviewable steps instead of one unreviewable one.
- **The widget DSL sprawls.** Covered above: three widget types, and a design note required to add a fourth.
- **Settings validation is now a security boundary.** Previously `payload` was a string handed to a fixed set of verbs. Now it is an object reaching arbitrary modules that shell out. This is called out in tasks as a distinct hardening item with its own tests, not folded into "implement the registry."
- **No compatibility window.** The wire protocol breaks. Acceptable: server and client are served from the same process and ship together. Worth confirming the PWA's service worker (`client/sw.js`) does not serve a stale `app.js` against a new server — a cache-bust on `schemaVersion` may be needed.

## Open Questions

- Should `com.streamdeck.core.settings` be relocatable/deletable like any other key, or pinned? Pinning it prevents a user from locking themselves out of the editor with no way back.
- Does the landscape info-panel become an action-contributed surface too, or stay hardcoded? It is currently the strongest part of the UI and has no Elgato analogue; leaving it hardcoded for now is defensible but leaves one static coupling standing.
