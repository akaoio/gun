# GUN Development Guide for AI Agents

## Project Overview

GUN is a realtime, decentralized, offline-first, graph data synchronization engine with CRDT-based conflict resolution. This is a production database used by Internet Archive and 100s of other apps for P2P, encrypted, local-first applications.

## Architecture & Build System

### Custom Module System (USE)
GUN uses a **custom bundler** called "USE" (not CommonJS/ESM directly):
- All modules wrapped in `USE(function(module){ ... }, './path')` pattern
- Bundler processes `/* UNBUILD */` comments to generate browser builds
- Source files in `/src`, bundled output in `gun.js` and `gun.min.js`
- After modifying `/src` files, **always run** `npm run unbuild` to regenerate builds

### Entry Points
- `index.js` → Node.js (loads `lib/server.js`)
- `browser.js` → Browser (loads `gun.js`)  
- `gun.js` → Pre-bundled browser build with all core modules
- `sea.js` → Security/Encryption/Authorization module

### Core Modules (`/src`)
- `root.js` - Core GUN constructor, `Gun.create()` initialization
- `core.js` - Graph operations and internal messaging
- `mesh.js` - P2P networking layer, peer synchronization
- `websocket.js` - WebSocket transport (primary)
- `on.js` - Real-time subscriptions and event handling
- `map.js`, `set.js` - Collection operations

### Storage Adapters (`/lib`)
- `radisk.js` - RAD (Radix Atomic Disk) storage engine - **primary persistence**
- `rfs.js` - Node.js filesystem adapter
- `rs3.js` - AWS S3 adapter
- `rindexed.js` - Browser IndexedDB adapter

## Developer Workflows

### Build & Test
```bash
npm run unbuild        # Rebuild gun.js after /src changes (CRITICAL)
npm run unbuildSea     # Rebuild sea.js after /sea changes
npm start              # Start dev server with examples on localhost
npm run https          # Start with HTTPS (required for WebCrypto/SEA)

# Testing - ALWAYS clean data between test runs
rm -rf *data* *radata*
npm test               # Requires global mocha: npm install -g mocha
npm run testSea        # SEA-specific tests
```

### PANIC Tests (Performance & Stress Testing)
Located in `test/panic/` - critical for validating changes:
- `holy-grail.js` - Core correctness test (RUN THIS FIRST)
- `scale.js` - Multi-peer load testing
- `on-recovery.js` - State recovery validation
- Always reference when making core changes

## Project-Specific Patterns

### 1. HAM (Hypothetical Amnesia Machine)
GUN's CRDT conflict resolution uses **state-based vector clocks**:
- Every value has a `>` (state) timestamp
- `Gun.state()` generates millisecond timestamps
- Conflicts resolved by: later state wins, ties preserve existing value
- Found in: `src/state.js`, validation in `src/valid.js`

### 2. Graph Node Structure
```javascript
// Every node has special metadata on the `_` property:
{
  "#": "unique-soul-id",     // Node ID (soul)
  ">": {"key": 1234567890},  // State timestamps per key
  "key": "value"             // User data
}
```

### 3. Internal Messaging Protocol
All operations flow through `universe()` in `src/root.js`:
- Messages have: `#` (message ID), `@` (reply-to), `put` (data), `get` (query)
- Deduplication via `dup.track()` and `dup.check()`
- Routing: `at.on('in')` for incoming, `at.on('out')` for outgoing
- **Never modify `msg.out`** - it tracks middleware chain

### 4. SEA (Security, Encryption, Authorization)
Located in `/sea`, extends GUN with cryptographic operations:
- `SEA.pair()` - Generate key pairs (ECDSA + ECDH)
- `SEA.sign/verify()` - Message signatures
- `SEA.encrypt/decrypt()` - AES-GCM encryption
- **WebCrypto required** - HTTPS mandatory in browsers
- Verification runs on HAM diffs (`check()` in `sea/index.js`)

### 5. Radix Storage Format
`radisk.js` uses Radix trees for efficient disk I/O:
- Batches writes (default 250ms, 10k ops)
- Each key stored as `encodeURIComponent(key)`
- Manages multiple *.radata files, auto-sharding
- **Critical**: Uses `JSON.parseAsync` to prevent UI blocking

### 6. Custom Shims & Utilities
`src/shim.js` extends JavaScript natives:
- `String.random(length)` - Generate random strings
- `String.hash(s)` - DJB2 hash for deduplication
- `setTimeout.turn(fn)` - CPU-scheduled async iteration
- `setTimeout.each(array, fn)` - Non-blocking array iteration

## Common Pitfalls

1. **Forgotten Unbuild**: Changes to `/src/*.js` don't affect browser until `npm run unbuild`
2. **Test Data Pollution**: ALWAYS `rm -rf *data* *radata*` between test runs
3. **Circular References**: GUN supports them natively - don't try to "fix" them
4. **Async Everywhere**: All storage/network ops are async, use callbacks/promises
5. **HAM Violations**: Never manually set state timestamps - use `Gun.state()`

## Integration Points

### Adding Storage Adapters
Follow `lib/rfs.js` pattern:
```javascript
Gun.on('create', function(root) {
  this.to.next(root);
  root.opt.store && (function(){
    // Implement: get(key, cb), put(key, data, cb)
  }());
});
```

### Adding Chain Methods
Extend `Gun.chain.myMethod` in a new module:
```javascript
Gun.chain.myMethod = function(data) {
  var gun = this, at = gun._;
  // Implementation using gun.get(), gun.put(), etc.
  return gun; // Enable chaining
};
```

## Advanced Features (New in this Fork)

See `/docs` for enterprise features:
- Seed-based key generation (`docs/seed-based-keys.md`)
- Hierarchical deterministic wallets (`docs/additive-derivation.md`)
- WebAuthn/passkey integration (`docs/webauthn.md`)
- External authenticators/HSM (`docs/external-authenticators.md`)

## File Naming Conventions

- `r*.js` in `/lib` = Storage adapters (rfs, radisk, rindexed, rs3)
- `*.d.ts` = TypeScript definitions (not primary source)
- `axe.js` = Automatic peering/DHT clustering
- `nts.js` = "No Time Sync" mode (timestamp-free)

---
**Before major changes**: Run `test/panic/holy-grail.js` to validate correctness.
**After any change**: `npm run unbuild && rm -rf *data* && npm test`
