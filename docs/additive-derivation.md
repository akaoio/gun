# Additive Key Derivation

## Overview

**Additive key derivation** allows you to generate new cryptographic key pairs by combining an existing key with a seed value. This is particularly useful for:

- **Hierarchical deterministic (HD) wallets**: Create child keys from parent keys
- **Key rotation**: Derive new keys without losing access to the original identity
- **Shared key derivation**: Multiple parties can independently derive the same public key
- **Privacy**: Create separate keys for different purposes from a single master key

This feature builds on top of [seed-based key generation](./seed-based-keys.md) but adds **additive** properties over the elliptic curve.

## Core Concept

Given a base key pair and a seed, you can derive a new key pair where:

```
derived_private_key = (base_private_key + seed_hash) mod n
derived_public_key = base_public_key + (seed_hash × G)
```

Where `G` is the generator point on the P-256 elliptic curve and `n` is the curve order.

**Key property**: If Bob knows the private key and Alice only knows the public key, they can both independently derive the **same public key** using the same seed.

## Basic Usage

### Derive from Private Key

```javascript
// Create a base key pair
const base = await SEA.pair();

// Derive a new key pair using the private key + seed
const derived = await SEA.pair(null, { 
  priv: base.priv, 
  seed: "child-key-1" 
});

console.log(derived);
// {
//   priv: "...",  // New private signing key
//   pub: "...",   // New public signing key
//   epriv: undefined,  // Not derived (would need base.epriv)
//   epub: undefined    // Not derived (would need base.epub)
// }
```

### Derive from Public Key

```javascript
// Alice only has Bob's public key
const bobPublicKey = base.pub;

// Alice can derive the same public key Bob derived
const aliceDerived = await SEA.pair(null, { 
  pub: bobPublicKey, 
  seed: "child-key-1" 
});

console.log(aliceDerived.pub === derived.pub); // true!
```

### Derive Encryption Keys

For encryption key derivation, use `epriv` and `epub`:

```javascript
// Derive encryption key pair from encryption private key
const derivedEncrypt = await SEA.pair(null, { 
  epriv: base.epriv, 
  seed: "encryption-child-1" 
});

// Or derive public encryption key only
const aliceEncrypt = await SEA.pair(null, { 
  epub: base.epub, 
  seed: "encryption-child-1" 
});

console.log(derivedEncrypt.epub === aliceEncrypt.epub); // true!
```

## Deterministic Derivation

Same inputs always produce the same outputs:

```javascript
const base = await SEA.pair();
const seed = "deterministic-child";

const derived1 = await SEA.pair(null, { priv: base.priv, seed });
const derived2 = await SEA.pair(null, { priv: base.priv, seed });

console.log(derived1.priv === derived2.priv); // true
console.log(derived1.pub === derived2.pub);   // true
```

## Use Cases

### 1. Hierarchical Wallets

Create a tree of keys from a single master key:

```javascript
// Master key
const master = await SEA.pair(null, { seed: "master-seed-phrase" });

// Derive account keys
const account0 = await SEA.pair(null, { priv: master.priv, seed: "account-0" });
const account1 = await SEA.pair(null, { priv: master.priv, seed: "account-1" });

// Derive sub-keys from accounts
const account0Address0 = await SEA.pair(null, { priv: account0.priv, seed: "address-0" });
const account0Address1 = await SEA.pair(null, { priv: account0.priv, seed: "address-1" });

// Each key is independent but derivable from master
```

### 2. Shared Public Key Derivation

Bob and Alice can independently derive the same public key:

```javascript
// Bob's side (has private key)
const bob = await SEA.pair();
const sharedSeed = "shared-context-2024";
const bobDerived = await SEA.pair(null, { priv: bob.priv, seed: sharedSeed });

// Bob publishes his base public key: bob.pub

// Alice's side (only has Bob's public key)
const aliceDerived = await SEA.pair(null, { pub: bob.pub, seed: sharedSeed });

// They both have the same derived public key
console.log(bobDerived.pub === aliceDerived.pub); // true

// Alice can now verify signatures made with Bob's derived key
const message = "Hello Alice";
const signature = await SEA.sign(message, bobDerived);
const verified = await SEA.verify(signature, aliceDerived.pub);
console.log(verified); // "Hello Alice"
```

### 3. Key Rotation

Rotate keys periodically without losing identity:

```javascript
async function rotateKey(currentPair, rotationPeriod) {
  const today = new Date().toISOString().split('T')[0]; // "2024-01-15"
  const seed = `rotation-${today}-${rotationPeriod}`;
  
  return await SEA.pair(null, { priv: currentPair.priv, seed });
}

// Original key
const original = await SEA.pair();

// Rotated keys (different each day/period)
const jan15Key = await rotateKey(original, "daily");
const jan16Key = await rotateKey(original, "daily");

// Each day uses a different key, but all derivable from original
```

### 4. Privacy-Enhanced Identities

Create separate identities for different contexts:

```javascript
const master = await SEA.pair(null, { seed: "my-master-identity" });

// Different identities for different purposes
const workIdentity = await SEA.pair(null, { priv: master.priv, seed: "work" });
const socialIdentity = await SEA.pair(null, { priv: master.priv, seed: "social" });
const gamingIdentity = await SEA.pair(null, { priv: master.priv, seed: "gaming" });

// Each identity is separate, but you can prove ownership of all from master
```

### 5. Derived Authentication

Create temporary or scoped authentication keys:

```javascript
// Main account
const mainAccount = await SEA.pair();

// Derive a temporary key for mobile app (expires after rotation)
const mobileKey = await SEA.pair(null, { 
  priv: mainAccount.priv, 
  seed: "mobile-app-2024-02" 
});

// Derive a read-only key for analytics
const analyticsKey = await SEA.pair(null, { 
  priv: mainAccount.priv, 
  seed: "analytics-readonly" 
});

// Each derived key can have different permissions
```

## Partial Derivation

You can derive only what you have:

```javascript
const base = await SEA.pair();

// Derive signing keys only (priv → pub)
const signOnly = await SEA.pair(null, { priv: base.priv, seed: "test" });
console.log(signOnly.pub);   // ✅ Derived
console.log(signOnly.priv);  // ✅ Derived
console.log(signOnly.epub);  // ❌ undefined (no base.epub provided)
console.log(signOnly.epriv); // ❌ undefined (no base.epriv provided)

// Derive public key only
const pubOnly = await SEA.pair(null, { pub: base.pub, seed: "test" });
console.log(pubOnly.pub);    // ✅ Derived
console.log(pubOnly.priv);   // ❌ undefined (can't derive without base.priv)

// Derive encryption keys only (epriv → epub)
const encryptOnly = await SEA.pair(null, { epriv: base.epriv, seed: "test" });
console.log(encryptOnly.epub);  // ✅ Derived
console.log(encryptOnly.epriv); // ✅ Derived
console.log(encryptOnly.pub);   // ❌ undefined (no base.priv provided)
```

## Security Validation

The implementation includes several security checks:

### 1. Invalid Public Key Format

```javascript
try {
  await SEA.pair(null, { pub: 'invalid-format', seed: 'test' });
} catch (error) {
  console.log("Error: Invalid public key format");
}
```

### 2. Point Not on Curve

```javascript
try {
  // Coordinates that don't satisfy the curve equation
  await SEA.pair(null, { pub: 'AA.AA', seed: 'test' });
} catch (error) {
  console.log("Error: Point not on curve");
}
```

### 3. Coordinates Out of Range

```javascript
try {
  // Coordinate values >= field prime P
  const P = BigInt("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff");
  const invalidPub = encodeBase64(P) + "." + encodeBase64(1n);
  await SEA.pair(null, { pub: invalidPub, seed: 'test' });
} catch (error) {
  console.log("Error: Coordinate out of range");
}
```

### 4. Private Key Out of Range

```javascript
try {
  // Private key >= curve order n
  const n = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
  const invalidPriv = encodeBase64(n);
  await SEA.pair(null, { priv: invalidPriv, seed: 'test' });
} catch (error) {
  console.log("Error: Private key out of range");
}
```

### 5. Zero Private Key

```javascript
try {
  const zeroPriv = encodeBase64(0n);
  await SEA.pair(null, { priv: zeroPriv, seed: 'test' });
} catch (error) {
  console.log("Error: Private key cannot be zero");
}
```

## Advanced: BIP44-Style Derivation

You can implement BIP44-style hierarchical paths:

```javascript
async function derivePath(master, path) {
  // path format: "m/44'/0'/0'/0/0"
  const parts = path.split('/').slice(1); // Remove 'm'
  
  let current = master;
  for (const part of parts) {
    const index = part.replace("'", ""); // Hardened indicator
    const seed = `index-${index}`;
    current = await SEA.pair(null, { priv: current.priv, seed });
  }
  
  return current;
}

// Master key
const master = await SEA.pair(null, { seed: "my mnemonic phrase" });

// Derive keys using BIP44-style paths
const account0 = await derivePath(master, "m/44'/0'/0'/0/0");
const account1 = await derivePath(master, "m/44'/0'/0'/0/1");
```

## Combining with Regular Seed Generation

You can combine both approaches:

```javascript
// Start with a seed-based master key
const master = await SEA.pair(null, { seed: "master-passphrase" });

// Derive child keys additively
const child1 = await SEA.pair(null, { priv: master.priv, seed: "child-1" });
const child2 = await SEA.pair(null, { priv: master.priv, seed: "child-2" });

// Everything is deterministic and reproducible
```

## Working with GunDB User Graphs

```javascript
const gun = Gun();

// Master identity
const master = await SEA.pair(null, { seed: "my-master-seed" });

// Derive a key for public profile
const publicProfile = await SEA.pair(null, { priv: master.priv, seed: "public" });

// Derive a key for private data
const privateData = await SEA.pair(null, { priv: master.priv, seed: "private" });

// Use different derived keys for different data
gun.get(`~${publicProfile.pub}`).get('bio').put('Hello world!', null, { 
  opt: { authenticator: publicProfile } 
});

gun.get(`~${privateData.pub}`).get('secrets').put('My secrets', null, { 
  opt: { authenticator: privateData } 
});
```

## Best Practices

1. **Document your derivation scheme**: Keep a clear record of how keys are derived
2. **Use meaningful seeds**: Make seed values descriptive (e.g., "account-0", "mobile-2024")
3. **Version your seeds**: Include version info in seeds for future compatibility
4. **Backup the master key**: Only the master key needs secure backup
5. **Test derivation**: Always verify that derived keys match expectations
6. **Validate inputs**: Check that base keys are valid before derivation
7. **Use hardened derivation**: For sensitive keys, consider additional security measures

## Performance Considerations

- Derivation involves elliptic curve point addition: ~1-5ms per derivation
- Batch derivations when possible to reduce overhead
- Cache frequently-used derived keys
- Derivation is deterministic: no need to store derived keys

## Comparison with Standard Generation

| Feature | Standard | Seed-Based | Additive Derivation |
|---------|----------|------------|---------------------|
| Reproducibility | ❌ Random | ✅ From seed | ✅ From base + seed |
| Hierarchical | ❌ No | ❌ No | ✅ Yes |
| Public derivation | ❌ No | ❌ No | ✅ Yes (pub → pub) |
| Use case | Standard | Recovery | HD wallets, privacy |

## See Also

- [Seed-Based Key Generation](./seed-based-keys.md) - Foundation for this feature
- [WebAuthn Integration](./webauthn.md) - Hardware-based signing
- [External Authenticators](./external-authenticators.md) - Custom authentication
