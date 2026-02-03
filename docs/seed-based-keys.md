# Seed-Based Key Generation

## Overview

This feature enables **deterministic key pair generation** from a seed value. Unlike the standard random key generation, providing the same seed will always generate the same cryptographic key pair. This is useful for:

- **Account recovery**: Regenerate keys from a memorable passphrase or secure seed
- **Deterministic wallets**: Similar to BIP39/BIP44 in cryptocurrency wallets
- **Reproducible testing**: Generate consistent test keys
- **Cross-device synchronization**: Regenerate the same keys on multiple devices

## Basic Usage

### String Seed

```javascript
// Generate a key pair from a string seed
const pair = await SEA.pair(null, { seed: "my secret passphrase" });

console.log(pair);
// {
//   pub: "...",   // Public signing key
//   priv: "...",  // Private signing key
//   epub: "...",  // Public encryption key
//   epriv: "..." // Private encryption key
// }

// Same seed = same keys
const pair2 = await SEA.pair(null, { seed: "my secret passphrase" });
console.log(pair.pub === pair2.pub); // true
```

### ArrayBuffer Seed

For binary seed data (e.g., from hardware random generators or cryptographic sources):

```javascript
// Create a binary seed
const textEncoder = new TextEncoder();
const seedData = textEncoder.encode("my secret passphrase");
const seedBuffer = seedData.buffer; // ArrayBuffer

// Generate key pair from binary seed
const pair = await SEA.pair(null, { seed: seedBuffer });
```

### Different Seeds = Different Keys

```javascript
const pair1 = await SEA.pair(null, { seed: "seed one" });
const pair2 = await SEA.pair(null, { seed: "seed two" });

console.log(pair1.pub === pair2.pub); // false - different seeds produce different keys
```

## Security Considerations

### ⚠️ Seed Strength

The security of your keys depends entirely on the strength of your seed:

- **Weak seeds** (e.g., "password", "12345") can be easily brute-forced
- **Strong seeds** should have high entropy (random, long, unpredictable)
- Consider using a **passphrase** with multiple random words

```javascript
// ❌ WEAK - easily guessable
const weakPair = await SEA.pair(null, { seed: "password123" });

// ✅ STRONG - high entropy
const strongPair = await SEA.pair(null, { seed: "correct horse battery staple quantum entropy flux" });
```

### Seed Storage

- **Never hardcode seeds** in your application code
- Store seeds securely using:
  - Hardware security modules (HSM)
  - Secure enclaves
  - Encrypted storage
  - Password managers
- Consider using **key derivation functions** (KDF) to stretch weak passphrases

## Advanced Usage

### Account Recovery System

```javascript
// Registration
async function registerUser(username, passphrase) {
  // Generate deterministic key pair from passphrase
  const pair = await SEA.pair(null, { seed: passphrase });
  
  // Create user account
  const gun = Gun();
  const user = gun.user();
  await user.auth(pair);
  
  // Store username alias
  gun.get('~@').get(username).put(gun.user().is);
  
  return pair.pub;
}

// Recovery (on any device)
async function recoverUser(username, passphrase) {
  // Regenerate the same keys from passphrase
  const pair = await SEA.pair(null, { seed: passphrase });
  
  // Login with recovered keys
  const gun = Gun();
  const user = gun.user();
  await user.auth(pair);
  
  console.log("Account recovered:", user.is.pub);
  return user;
}
```

### Testing with Consistent Keys

```javascript
// In your test suite
describe('User tests', function() {
  let testUser1, testUser2;
  
  beforeEach(async function() {
    // Always use the same test keys
    testUser1 = await SEA.pair(null, { seed: "test-user-1" });
    testUser2 = await SEA.pair(null, { seed: "test-user-2" });
  });
  
  it('should send message between users', async function() {
    // Test with deterministic keys
    const message = await SEA.encrypt("hello", testUser1, testUser2.epub);
    const decrypted = await SEA.decrypt(message, testUser2);
    expect(decrypted).to.equal("hello");
  });
});
```

### Seed Types and Edge Cases

The implementation handles various seed types robustly:

```javascript
// Empty string
const pair1 = await SEA.pair(null, { seed: "" });

// Numeric strings
const pair2 = await SEA.pair(null, { seed: "12345" });

// Special characters
const pair3 = await SEA.pair(null, { seed: "!@#$%^&*()" });

// Very long strings
const pair4 = await SEA.pair(null, { seed: "a".repeat(1000) });

// Unicode/emoji
const pair5 = await SEA.pair(null, { seed: "😀🔑🔒👍" });

// All produce valid, unique key pairs
```

### Case Sensitivity

Seeds are **case-sensitive** and **whitespace-sensitive**:

```javascript
const pair1 = await SEA.pair(null, { seed: "MyPassword" });
const pair2 = await SEA.pair(null, { seed: "mypassword" });
const pair3 = await SEA.pair(null, { seed: "MyPassword " }); // trailing space

// All three produce DIFFERENT keys
console.log(pair1.pub !== pair2.pub); // true
console.log(pair1.pub !== pair3.pub); // true
```

## Working with Other SEA Functions

Keys generated from seeds work seamlessly with all SEA functions:

```javascript
const seed = "my deterministic seed";
const pair = await SEA.pair(null, { seed });

// Signing
const signature = await SEA.sign("my data", pair);
const verified = await SEA.verify(signature, pair.pub);

// Encryption
const encrypted = await SEA.encrypt("secret message", pair);
const decrypted = await SEA.decrypt(encrypted, pair);

// Work (hashing)
const proof = await SEA.work("my work", pair);

// All operations work identically to random-generated keys
```

## Comparison: Random vs Seed-Based

| Feature | Random Generation | Seed-Based Generation |
|---------|------------------|----------------------|
| Reproducibility | ❌ Different every time | ✅ Same seed = same keys |
| Security | ✅ Maximally random | ⚠️ Depends on seed strength |
| Use Case | Standard usage | Recovery, testing, deterministic apps |
| Command | `SEA.pair()` | `SEA.pair(null, { seed })` |

## Best Practices

1. **Use strong, high-entropy seeds** for production
2. **Never reuse seeds** across different applications or contexts
3. **Consider adding salt** to your seed derivation process
4. **Use BIP39 wordlists** for memorable yet secure seeds
5. **Test your recovery flow** thoroughly before production
6. **Educate users** about seed security and backup

## Migration from Random Keys

If you have existing random keys and want to migrate to seed-based:

```javascript
// Old approach (random)
const oldPair = await SEA.pair();

// You cannot "reverse engineer" a seed from existing keys
// Instead, plan a migration:

async function migrateToSeedBased(oldPair, newSeed) {
  // 1. Generate new seed-based keys
  const newPair = await SEA.pair(null, { seed: newSeed });
  
  // 2. Re-encrypt your data with new keys
  const data = await gun.get('~' + oldPair.pub).get('mydata').once();
  
  // 3. Put to new graph
  gun.get('~' + newPair.pub).get('mydata').put(data);
  
  return newPair;
}
```

## See Also

- [Derive (Additive Key Derivation)](./additive-derivation.md) - Generate child keys from parent keys
- [WebAuthn Integration](./webauthn.md) - Use hardware authenticators
- [External Authenticators](./external-authenticators.md) - Custom signing functions
