# Advanced Features Documentation

This documentation covers the advanced features and improvements in this GunDB fork that go beyond the original implementation.

## 🎯 Overview

This fork includes several major enhancements to GunDB's Security, Encryption, and Authorization (SEA) system:

1. **[Seed-Based Key Generation](./seed-based-keys.md)** - Deterministic key pair generation from seeds
2. **[Additive Key Derivation](./additive-derivation.md)** - Hierarchical deterministic (HD) wallet capabilities
3. **[WebAuthn Integration](./webauthn.md)** - Hardware security keys and biometric authentication
4. **[External Authenticators](./external-authenticators.md)** - Custom signing mechanisms and stateless operations

These features work together to provide enterprise-grade security, enhanced privacy, and modern authentication options.

### Protocol & Architecture Drafts

5. **[Hashgraph Layer on GunDB (Draft)](./hashgraph-layer.md)** - Event DAG, voting/finality, and execution bridge design

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
