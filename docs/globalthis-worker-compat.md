# `globalThis` Migration — Full Web Worker Compatibility

## Overview

All modules in `lib/` have been migrated from `window` to `globalThis` as the universal global reference. This makes GUN's entire library layer runnable in **Web Workers**, **Service Workers**, **Node.js**, and any other JavaScript environment — not just the browser main thread.

---

## Why `window` Was a Problem

`window` is defined only in the browser main thread. Accessing it in any other context throws or evaluates to `undefined`:

| Environment | `window` | `globalThis` |
|---|---|---|
| Browser main thread | ✅ defined | ✅ defined |
| Web Worker (`Worker`) | ❌ undefined | ✅ `WorkerGlobalScope` |
| Service Worker | ❌ undefined | ✅ `ServiceWorkerGlobalScope` |
| Node.js | ❌ undefined | ✅ `global` |
| Deno / Bun | ❌ undefined | ✅ defined |

Before this migration, loading any `lib/*.js` module inside a Web Worker would silently break — environment detection failed, storage adapters couldn't initialise, and the `Gun` class couldn't be resolved from the global scope.

---

## What Changed

Every occurrence of `window` in `lib/*.js` has been replaced with `globalThis`. The affected categories:

### 1. Module bootstrapping (`Gun` resolution)
All adapters and extensions detect whether they're running in browser or Node.js by checking the global scope. The pattern changed from:

```js
// Before
var Gun = (typeof window !== "undefined") ? window.Gun : require('../gun');
```
```js
// After
var Gun = (typeof globalThis !== "undefined") ? globalThis.Gun : require('../gun');
```

Affected files: `axe.js`, `bye.js`, `erase.js`, `evict.js`, `forget.js`, `fork.js`, `lex.js`, `load.js`, `mix.js`, `multicast.js`, `not.js`, `open.js`, `path.js`, `promise.js`, `shim.js`, `space.js`, `stats.js`, `store.js`, `webrtc.js`, and more.

### 2. Storage adapters — self-registration
Adapters previously registered themselves on `window` so the bundled browser build could find them. Now they register on `globalThis`:

```js
// Before (rindexed.js, rls.js)
(Store.window = window).RindexedDB = Store;
Store.indexedDB = window.indexedDB;

// After
(Store.globalThis = globalThis).RindexedDB = Store;
Store.indexedDB = globalThis.indexedDB;
```

Affected: `rindexed.js`, `rls.js`, `radisk.js`, `radisk2.js`, `radix.js`, `radix2.js`.

### 3. Radix / RAD storage engine
Environment detection in `radix.js` and `radisk.js`:

```js
// After
if (typeof globalThis !== "undefined") {
    globalThis[name] = globalThis[name] || exports;
}
```

### 4. DOM shim (`dom.js`)
The jQuery-compatible shim registers itself on `globalThis.$` instead of `window.$`:

```js
// After
if (globalThis.$) { return }
($ = globalThis.$ = function(q, tag, I, u){ ... })
```

> Note: This module still requires a real DOM (`document`) to function — it is not intended for headless Worker use. The change only removes the hard `window` dependency at the registration level.

### 5. Utility / helper modules
`fun.js`, `ison.js`, `les.js`, `level.js`, `meta.js`, `monotype.js`, `nomem.js`, `rmem.js`, `role.js` — all global variable assignments and environment guards now use `globalThis`.

---

## `Gun.window` — The Internal Browser Flag

The `src/root.js` bootstrap code (which generates `gun.js`) sets `Gun.window` as a browser-environment sentinel. This property is **not `window` itself** — it is set to `globalThis` when running in a Web Worker, or to the real `window` when on the main thread:

```js
// src/root.js (unchanged logic, illustrative)
if (typeof globalThis !== "undefined" && typeof window === "undefined" && typeof WorkerGlobalScope !== "undefined") {
    // Web Worker: register on globalThis, set Gun.window = globalThis
    (globalThis.GUN = globalThis.Gun = Gun).window = globalThis;
} else if (typeof window !== "undefined") {
    // Main thread: register on window, set Gun.window = window
    (window.GUN = window.Gun = Gun).window = window;
}
```

Internally, GUN uses `Gun.window` to decide whether it is running in any browser-like context (main thread *or* worker). Code in `src/` that checks `Gun.window` continues to work correctly in workers.

---

## Using GUN Inside a Web Worker

With this migration you can now use GUN (including storage adapters) directly inside a Worker:

```js
// worker.js  (type: "module")
import Gun from '/gun.js'
import '/lib/opfs.js'      // OPFS — Worker-safe where supported
import '/lib/radisk.js'    // RAD storage — now Worker-safe
import '/lib/rindexed.js'  // IndexedDB — now Worker-safe

const gun = Gun({ peers: ['https://relay.example.com/gun'] })

gun.get('~').map().once((data, key) => {
    // scan tilde shard from inside a worker
    postMessage({ key, data })
})
```

```js
// main.js
const worker = new Worker('/worker.js', { type: 'module' })
worker.onmessage = ({ data }) => console.log(data)
```

Storage adapters that depend on browser-only APIs (`localStorage`, `indexedDB`, `navigator.storage`) are already available inside Workers in modern browsers where those APIs exist — the `globalThis` migration ensures GUN can reach them.

---

## APIs Not Available in Workers

The following `lib/` modules reference DOM APIs that genuinely do not exist in Workers. They are safe to import in a Worker (no crash), but will silently do nothing when the DOM is absent:

| Module | DOM dependency | Worker behaviour |
|---|---|---|
| `dom.js` | `document`, DOM queries | No-op (safely skips) |
| `fun.js` | DOM element creation | No-op |
| `meta.js` | `document`, pointer events | No-op |
| `monotype.js` | `document.createElement` | No-op |

All network transports (`rindexed.js`, `radisk.js`, WebSocket) and the core graph engine function normally in Workers.

---

## Compatibility

`globalThis` is natively supported in all modern JavaScript environments:

| Environment | `globalThis` support |
|---|---|
| Chrome / Edge 71+ | ✅ |
| Firefox 65+ | ✅ |
| Safari 12.1+ | ✅ |
| Node.js 12+ | ✅ |
| Deno (all) | ✅ |
| Web Workers (all major browsers) | ✅ |

For environments older than the above, a one-line polyfill covers the gap:

```js
if (typeof globalThis === "undefined") { (function(){ return this })().globalThis = (function(){ return this })() }
```

---

## Related Changes in This Fork

- **[Tilde Shard Index](./tilde-shard.md)** — discovery network that runs inside the `discovery` Web Worker thread
- **[WebAuthn Integration](./webauthn.md)** — `sea.js` uses `globalThis.crypto` for consistent WebCrypto access across environments
