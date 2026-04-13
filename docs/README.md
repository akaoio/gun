# Advanced Features Documentation

This documentation covers the advanced features and improvements in this GunDB fork that go beyond the original implementation.

## 🎯 Overview

This fork includes several major enhancements to GunDB's Security, Encryption, and Authorization (SEA) system:

1. **[Seed-Based Key Generation](./seed-based-keys.md)** - Deterministic key pair generation from seeds
2. **[Additive Key Derivation](./additive-derivation.md)** - Hierarchical deterministic (HD) wallet capabilities
3. **[WebAuthn Integration](./webauthn.md)** - Hardware security keys and biometric authentication
4. **[External Authenticators](./external-authenticators.md)** - Custom signing mechanisms and stateless operations
5. **[OPFS Storage Adapter](./opfs.md)** - Origin Private File System persistence for RAD in modern browsers
6. **[`globalThis` Migration](./globalthis-worker-compat.md)** - Full Web Worker / Service Worker compatibility across all `lib/` modules

These features work together to provide enterprise-grade security, enhanced privacy, and modern authentication options.

---

## 🔑 Key Format — Full Base62

**This fork changes ALL key material from base64url to base62 (`[A-Za-z0-9]` only).**

### `pub` / `epub` (public keys)

| | Old format | New format |
|---|---|---|
| Encoding | base64url (URL-safe base64) | base62 (`[A-Za-z0-9]` only) |
| Chars | `x.y` — two 43-char values joined by `.` | `xy` — two 44-char values concatenated |
| Total length | **87** | **88** |
| Characters used | `A-Za-z0-9_-` + `.` separator | `A-Za-z0-9` only |

### `priv` / `epriv` (private keys)

| | Old format | New format |
|---|---|---|
| Encoding | base64url (JWK `.d` field) | base62 (`[A-Za-z0-9]` only) |
| Total length | **43** | **44** |
| Characters used | `A-Za-z0-9_-` | `A-Za-z0-9` only |

Private keys are never written to the graph, but now use the same base62 alphabet for consistency — no more `-` / `_` characters in any key material.

**Backward compatibility:**
- `SEA.sign`, `SEA.secret` — accept **both** old (43-char base64url) and new (44-char base62) `priv`/`epriv` transparently.
- `SEA.verify`, `SEA.sign`, `SEA.secret` — accept **both** old (87-char) and new (88-char) `pub`/`epub` transparently.
- `gun.user().auth()` / `gun.user().create()` — continues to work; old user nodes at `~oldPub` are routed correctly.
- **Tilde shard (`~/...`)** — **strictly requires base62 pub** (shard segment `bad` regex is `/[^0-9a-zA-Z]/`). Old-format pubs cannot be registered in shard paths.

**Detection:**
```javascript
// pub/epub
// Old:  pub.length === 87 && pub[43] === '.'
// New:  pub.length === 88 && /^[A-Za-z0-9]{88}$/.test(pub)

// priv/epriv
// Old:  priv.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(priv)
// New:  priv.length === 44 && /^[A-Za-z0-9]{44}$/.test(priv)
```

**`SEA.base62` utility (exposed by `sea.js`):**
```javascript
// 32-byte Uint8Array → 44-char base62 (useful for WebAuthn raw coordinates)
SEA.base62.bufToB62(uint8array)   // → "44charBase62String"

// Convert between base64url ↔ base62 (for JWK interop)
SEA.base62.b64ToB62(base64urlStr) // → 44-char base62
SEA.base62.b62ToB64(b62str)       // → 43-char base64url  (WebCrypto JWK input)

// Parse either format → { x, y } base64url (for WebCrypto JWK import)
SEA.base62.pubToJwkXY(pub)        // accepts both 87-char and 88-char pub
```

---

### Protocol & Architecture Drafts

7. **[Hashgraph Layer on GunDB (Draft)](./hashgraph-layer.md)** - Event DAG, voting/finality, and execution bridge design
8. **[Tilde Shard Index](./tilde-shard.md)** - Sharded public-key index under the `~` namespace with SEA-enforced write rules
9. **[`globalThis` Migration — Web Worker Compat](./globalthis-worker-compat.md)** - All `lib/` modules migrated from `window` to `globalThis` for universal environment support

---

## 🔬 PEN — Predicate-Embedded Namespace (Binary VM)

**Design doc: [PEN](./pen.md)**

PEN is a **standalone embedded programming language** that compiles logic programs to the smallest
possible base62 strings. Future plans: Zig port, separate `akaoio/pen` repo.

### Layered Architecture

```
Tầng 2: Application (akao/shop) — order/trade schemas using sea.pen()
Tầng 1: GUN-PEN Bridge (sea/pen.js) — register conventions, policy opcodes, sea.pen() compiler
Tầng 0: PEN Core (lib/pen.js) — pure VM, no GUN, no timestamps, no network
```

**PEN Core** is environment-agnostic — it receives `(bytecode, registers[])` and returns a boolean.
The GUN layer injects registers (R[0]=key, R[1]=val, R[4]=Date.now(), etc.) before calling the core.

### Encoding

```
bytecode (N bytes)
  → prepend 0x01 sentinel
  → interpret as BigInt (big-endian)
  → variable-length base62 — ceil((N+1)×8 / log₂62) chars
  → soul = '$' + base62
```

No padding, no chunking. This is the theoretical lower bound for base62 encoding.

### PEN Core ISA v1 — Generic Operations

| Category | Opcodes |
|----------|---------|
| Constants | null, bool, uint8/16/32, int32, float64, string |
| Register | REG(n) — host provides R[0..127], LET uses R[128..255] |
| Logic | AND(n), OR(n), NOT, PASS, FAIL |
| Comparison | EQ, NE, LT, GT, LTE, GTE |
| Arithmetic | ADD, SUB, MUL, DIVU (floor div), MOD, DIVF, ABS, NEG |
| String | LEN, SLICE, SEG (split+index), TONUM, TOSTR, CONCAT, PRE, SUF, INCLUDES, REGEX, UPPER, LOWER |
| Type | ISS, ISN, ISX, ISB, LNG |
| Binding | LET(n, def, body) — local variable binding |
| Control | IF(cond, then, else) |

No temporal, no PoW, no GUN-specific concepts in core.

*Candle epoch, window validation, PoW — all expressible using generic arithmetic on host-injected registers.*

### Temporal (Candle) — via arithmetic, not special opcodes

Candle number = `Math.floor(timestamp_ms / size_ms)` — a small integer (~7 digits), not a 13-digit timestamp.

```js
// Helper in GUN bridge layer (not in PEN core):
sea.candle({ seg: 0, sep: "_", size: 300000, back: 100, fwd: 2 })
// Compiles to: LET(current_candle = DIVU(R[4], 300000),
//               LET(key_candle = TONUM(SEG(R[0],'_',0)),
//                 AND(GTE(key_candle, current-100), LTE(key_candle, current+2))))
```

### Host Extension Opcodes (GUN layer only, 0xC0–0xC4)

`0xC0` = SGN (signature required), `0xC1` = CRT(pub), `0xC3` = NOA (open), `0xC4` = POW(difficulty).
PEN core throws "unknown opcode" on these — GUN bridge handles them before/after core evaluation.

### Size comparison

| Schema | JSON-string | PEN Binary VM |
|--------|-------------|---------------|
| prefix + sign | ~48 chars | ~15 chars |
| order with candle + window + direction + sign | ~288 chars | ~100 chars |

---

## 📚 Feature Documentation

### 1. Seed-Based Key Generation

**Generate deterministic key pairs from a seed value**

Instead of random key generation, you can create reproducible keys from a passphrase or seed. Perfect for:
- Account recovery without storing private keys
- Deterministic testing
- Cross-device synchronization
- Mnemonic-based wallets

```javascript
// Same seed always produces the same keys
const pair1 = await SEA.pair(null, { seed: "my secret passphrase" });
const pair2 = await SEA.pair(null, { seed: "my secret passphrase" });
console.log(pair1.pub === pair2.pub); // true
```

📖 **[Read full documentation →](./seed-based-keys.md)**

**Key features:**
- String and ArrayBuffer seed support
- High entropy validation
- Compatible with all SEA functions
- Security best practices included

---

### 2. Additive Key Derivation

**Create hierarchical key structures from a master key**

Derive child keys from parent keys using additive elliptic curve operations. Enables:
- Hierarchical deterministic (HD) wallets
- Privacy-enhanced multi-identity systems
- Key rotation without identity loss
- Shared public key derivation

```javascript
const master = await SEA.pair();
const child = await SEA.pair(null, { 
    priv: master.priv, 
    seed: "child-1" 
});

// Multiple parties can derive the same public key independently
const aliceView = await SEA.pair(null, { 
    pub: master.pub, 
    seed: "child-1" 
});
console.log(child.pub === aliceView.pub); // true
```

📖 **[Read full documentation →](./additive-derivation.md)**

**Key features:**
- BIP44-style derivation paths
- Partial derivation (pub-only or priv-only)
- Curve validation and security checks
- Works with both signing and encryption keys

---

### 3. WebAuthn Integration

**Use hardware authenticators and biometric authentication**

Native support for WebAuthn/FIDO2 allows GunDB to leverage:
- Hardware security keys (YubiKey, Google Titan, etc.)
- Platform authenticators (Touch ID, Face ID, Windows Hello)
- Phishing-resistant authentication
- Hardware-backed private keys

```javascript
// Create a passkey
const credential = await navigator.credentials.create({
    publicKey: {
        challenge: new Uint8Array(16),
        rp: { id: "localhost", name: "My App" },
        user: { id: userId, name: username, displayName: displayName },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }]
    }
});

// Use it to sign GunDB operations
gun.get(`~${pub}`).get('data').put('hello', null, { 
    opt: { authenticator: webAuthnAuthenticator } 
});
```

📖 **[Read full documentation →](./webauthn.md)**

**Key features:**
- P-256 curve compatibility with SEA
- Automatic signature normalization
- Biometric authentication support
- Cross-platform compatibility

---

### 4. External Authenticators

**Integrate custom signing mechanisms and stateless operations**

Bring your own key management system or signing service:
- Hardware Security Modules (HSM)
- Cloud Key Management Services (AWS KMS, Google Cloud KMS, Azure Key Vault)
- Custom signing backends
- Stateless authentication flows

```javascript
// Use any key pair without maintaining a session
const pair = await SEA.pair();
gun.get(`~${pair.pub}`).get('data').put(
    'Hello World',
    null,
    { opt: { authenticator: pair } }
);

// Or provide a custom signing function
const customAuth = async (data) => {
    return await mySigningService.sign(data);
};
gun.get(`~${pub}`).get('data').put('value', null, { 
    opt: { authenticator: customAuth } 
});
```

📖 **[Read full documentation →](./external-authenticators.md)**

**Key features:**
- Session-less operations
- Multi-identity per operation
- Custom signing backends
- Full certificate support

---

### 5. Hashgraph Layer on GunDB (Draft)

**Design sketch for a Hashgraph-inspired consensus/event layer on top of GunDB**

Focus areas:
- `!hg/...` protocol namespace layout
- SEA-compatible symbolic key conventions
- Event DAG model and canonical hashing/signing
- Validator voting and finality checkpoints
- Future deterministic execution bridge

📖 **[Read full documentation →](./hashgraph-layer.md)**

---

### 6. Tilde Shard Index

**Write-protected public-key index sharded under the `~/` namespace**

SEA firewall rules that let anyone build a peer-discoverable index of public keys without any central authority:
- Root node (`~`) and intermediate shard nodes must be exact links to their canonical child soul
- **Intermediate writes require an `authenticator`** whose pub key starts with the path prefix — prevents spam; signature is bound to the Gun state timestamp via `SEA.opt.pack` so pre-signed writes are rejected
- Leaf nodes hold a signed scalar payload that must equal the reconstructed public key
- Standard authenticator support: `SEA.pair` object or async signing function
- When using a function authenticator on an **intermediate** node, pass `opt.pub` explicitly (a function has no `.pub` property)
- Configurable via `check.$sh` — chunk size, max depth, pub length, etc.

```javascript
// Write a first-level intermediate node
const pair = await SEA.pair();
const key = pair.pub.slice(0, 2);
gun.get('~').get(key).put({'#': '~/' + key}, null, { opt: { authenticator: pair } });

// Write the leaf for your own public key
const chunks = pair.pub.match(/.{1,2}/g) || [];
const leafKey = chunks.pop();
const leafSoul = chunks.length ? '~/' + chunks.join('/') : '~';
gun.get(leafSoul).get(leafKey).put(pair.pub, null, { opt: { authenticator: pair } });
```

📖 **[Read full documentation →](./tilde-shard.md)**

---

### 7. `globalThis` Migration — Web Worker Compatibility

**All `lib/` modules now use `globalThis` instead of `window`**

This makes GUN's entire library layer runnable in Web Workers, Service Workers, Node.js, and any non-browser JavaScript environment:
- Every `window` reference in `lib/*.js` replaced with `globalThis`
- Storage adapters (`opfs.js`, `rindexed.js`, `radisk.js`, `rls.js`) self-register on `globalThis` — discoverable inside Workers
- `Gun` class resolution from global scope works in all environments
- `Gun.window` property retained as an internal sentential — set to `globalThis` when running in a Worker
- DOM-dependent helpers (`dom.js`, `fun.js`) silently no-op in headless environments

```javascript
// worker.js — GUN now works fully inside a Web Worker
import Gun from '/gun.js'
import '/lib/opfs.js'       // OPFS — Worker-safe where supported
import '/lib/rindexed.js'   // IndexedDB — Worker-safe

const gun = Gun({ peers: ['https://relay.example.com/gun'] })
gun.get('~').map().once((data, key) => {
    postMessage({ key, data })  // send discovered pubs to main thread
})
```

📖 **[Read full documentation →](./globalthis-worker-compat.md)**

---

## 🔗 Feature Combinations

These features are designed to work together seamlessly:

### Example 1: Deterministic HD Wallet with Recovery

```javascript
// Master key from mnemonic
const master = await SEA.pair(null, { 
    seed: "correct horse battery staple quantum entropy" 
});

// Derive child keys for different purposes
const account0 = await SEA.pair(null, { 
    priv: master.priv, 
    seed: "m/44'/0'/0'/0" 
});

const account1 = await SEA.pair(null, { 
    priv: master.priv, 
    seed: "m/44'/0'/1'/0" 
});

// Use each account independently
gun.get(`~${account0.pub}`).get('finance').put(data, null, {
    opt: { authenticator: account0 }
});
```

### Example 2: WebAuthn with Derived Keys

```javascript
// Create WebAuthn credential
const { credential, pub, authenticator } = await setupWebAuthn();

// Derive context-specific keys from WebAuthn base
const workKey = await SEA.pair(null, { 
    pub: pub, 
    seed: "work-context" 
});

const personalKey = await SEA.pair(null, { 
    pub: pub, 
    seed: "personal-context" 
});

// Separate identity contexts, one hardware key
```

### Example 3: Multi-Device Sync with Seed Recovery

```javascript
// On Device 1: Generate and use keys
const pair = await SEA.pair(null, { seed: userPassphrase });
gun.get(`~${pair.pub}`).get('data').put('from device 1', null, {
    opt: { authenticator: pair }
});

// On Device 2: Recover same keys
const recoveredPair = await SEA.pair(null, { seed: userPassphrase });
console.log(recoveredPair.pub === pair.pub); // true
gun.get(`~${recoveredPair.pub}`).get('data').once(data => {
    console.log(data); // "from device 1"
});
```

---

## 🚀 Quick Start

### Installation

This fork is fully compatible with standard GunDB:

```bash
npm install gun
```

Or use directly in browser:

```html
<script src="https://cdn.jsdelivr.net/npm/gun/gun.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gun/sea.js"></script>
```

### Basic Usage

```javascript
// Initialize Gun
const gun = Gun();

// Create deterministic keys
const pair = await SEA.pair(null, { seed: "my-recovery-phrase" });

// Write data with external authenticator
gun.get(`~${pair.pub}`).get('profile').put(
    { name: "Alice", bio: "Hello World" },
    null,
    { opt: { authenticator: pair } }
);

// Read data
gun.get(`~${pair.pub}`).get('profile').once(profile => {
    console.log(profile); // { name: "Alice", bio: "Hello World" }
});
```

---

## 🔐 Security Considerations

### Seed Strength
- **Use high-entropy seeds**: At least 128 bits of entropy
- **Never hardcode seeds**: Load from secure storage
- **Consider BIP39**: Use standardized mnemonic phrases

### Key Management
- **Backup master keys**: Losing seed = losing access
- **Rotate derived keys**: Regular rotation for sensitive operations
- **Use hardware when possible**: WebAuthn for maximum security

### Certificate Validation
- **Always verify certs**: When writing to others' graphs
- **Limit permissions**: Use specific paths in certificates
- **Set expiration**: Time-limit certificate validity

---

## 📊 Comparison Table

| Feature | Original GunDB | This Fork |
|---------|----------------|-----------|
| Random key generation | ✅ | ✅ |
| Seed-based keys | ❌ | ✅ |
| HD wallets / key derivation | ❌ | ✅ |
| WebAuthn / passkeys | ❌ | ✅ |
| External authenticators | ❌ | ✅ |
| Stateless operations | ❌ | ✅ |
| HSM / KMS integration | ❌ | ✅ |
| Multi-identity per session | ❌ | ✅ |

---

## 🧪 Testing

All features are thoroughly tested:

```bash
# Run all tests
npm test

# Run SEA-specific tests
npm test test/sea/sea.js
```

See [test/sea/sea.js](../test/sea/sea.js) for comprehensive test coverage including:
- Seed-based key generation tests
- Additive derivation tests  
- External authenticator tests
- Edge cases and security validation

---

## 🛠️ Examples

Working examples are provided in the `examples/` directory:

- **[webauthn.html](../examples/webauthn.html)** - Complete WebAuthn integration demo
- **[webauthn.js](../examples/webauthn.js)** - WebAuthn with GunDB implementation

---

## 📖 API Reference

### `SEA.pair(callback, options)`

Generate a cryptographic key pair.

**Options:**
- `seed` (string | ArrayBuffer): Seed for deterministic generation
- `priv` (string): Private signing key for derivation
- `pub` (string): Public signing key for derivation
- `epriv` (string): Private encryption key for derivation
- `epub` (string): Public encryption key for derivation

**Returns:** `Promise<KeyPair>`

```javascript
// Random generation (original)
const pair1 = await SEA.pair();

// Seed-based generation (new)
const pair2 = await SEA.pair(null, { seed: "my-seed" });

// Additive derivation (new)
const pair3 = await SEA.pair(null, { 
    priv: pair1.priv, 
    seed: "child" 
});
```

### External Authenticator Options

When using `gun.get().put(data, ack, options)`:

**`options.opt.authenticator`:**
- `SEA.pair` object: Use key pair directly
- `Function`: Custom signing function `(data) => Promise<Signature>`
- `WebAuthn Response`: WebAuthn assertion response

**`options.opt.pub`:**
- Required when writing to another user's graph with external authenticator
- The public key of the authenticator

**`options.opt.cert`:**
- Certificate from graph owner when writing to their graph

```javascript
// Own graph - just authenticator
gun.get(`~${pub}`).put(data, null, { 
    opt: { authenticator: pair } 
});

// Other's graph - need pub and cert
gun.get(`~${ownerPub}`).put(data, null, { 
    opt: { 
        authenticator: myPair,
        pub: myPair.pub,
        cert: certFromOwner 
    } 
});
```

---

## 🤝 Contributing

Contributions are welcome! Areas of focus:

1. Additional key derivation schemes (BIP32, SLIP-0010)
2. More authenticator examples (mobile, hardware)
3. Performance optimizations
4. Security audits
5. Documentation improvements

---

## 📄 License

Same as GunDB - see [LICENSE.md](../LICENSE.md)

---

## 🔗 Resources

- [GunDB Main Documentation](https://gun.eco/docs/)
- [SEA Documentation](https://gun.eco/docs/SEA)
- [WebAuthn Specification](https://www.w3.org/TR/webauthn-2/)
- [BIP32 - Hierarchical Deterministic Wallets](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki)
- [BIP39 - Mnemonic Phrases](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki)

---

## 📮 Support

For questions, issues, or discussions:
- GitHub Issues: Report bugs or request features
- GitHub Discussions: Ask questions or share ideas
- Community: Join the GunDB community

---

**Happy coding! 🎉**
