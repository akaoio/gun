# External Authenticators

## Overview

**External Authenticators** provide a flexible way to integrate custom signing mechanisms with GunDB. Instead of using the traditional authenticated user session (`user.auth()`), you can provide your own signing function or key pair directly in the `put` operation.

This enables:

- 🔐 **Custom signing backends**: Hardware security modules (HSM), cloud KMS, etc.
- 🌐 **Cross-platform authentication**: WebAuthn, OAuth, mobile biometrics
- 🔧 **Flexible key management**: Bring your own key storage solution
- 🚫 **Stateless operations**: No need to maintain authenticated sessions
- 🔄 **Multiple identity support**: Switch between identities per operation

## Basic Concepts

### Traditional Approach (Session-Based)

```javascript
const gun = Gun();
const user = gun.user();

// 1. Create account (stores credentials)
await user.create("alice", "password");

// 2. Login (establishes session)
await user.auth("alice", "password");

// 3. Put data (uses session)
user.get('profile').put({ name: "Alice" });
```

**Limitations:**
- Requires maintaining an authenticated session
- One identity per session
- Password-based (unless using SEA.pair recovery)
- State management complexity

### External Authenticator Approach (Stateless)

```javascript
const gun = Gun();

// 1. Have a key pair (from anywhere)
const pair = await SEA.pair();

// 2. Put data directly without session
gun.get(`~${pair.pub}`).get('profile').put(
    { name: "Alice" }, 
    null,
    { opt: { authenticator: pair } }  // ⬅️ External authenticator
);
```

**Benefits:**
- No session required
- Switch identities per operation
- Integrate any signing mechanism
- Simpler state management

## Usage Patterns

### 1. Using a SEA Key Pair

The simplest form - provide a SEA key pair:

```javascript
// Generate or load a key pair
const pair = await SEA.pair();

// Put data to the user's graph
gun.get(`~${pair.pub}`).get('data').put(
    'Hello World',
    null,
    { opt: { authenticator: pair } }
);

// Read it back
gun.get(`~${pair.pub}`).get('data').once(data => {
    console.log(data); // "Hello World"
});
```

### 2. Using a Custom Signing Function

Implement your own signing logic:

```javascript
// Custom authenticator function
const customAuthenticator = async (data) => {
    // `data` is the serialized put operation
    
    // Sign it with your custom logic
    // (e.g., call to HSM, cloud KMS, hardware wallet, etc.)
    const signature = await myCustomSigningService.sign(data);
    
    // Return in SEA signature format
    return {
        m: data,  // The message that was signed
        s: signature  // The signature
    };
};

// Use it
gun.get(`~${myPublicKey}`).get('data').put(
    'Signed by custom service',
    null,
    { opt: { authenticator: customAuthenticator } }
);
```

### 3. WebAuthn Authenticator

Use hardware security keys or biometric authentication:

```javascript
// Create WebAuthn authenticator function
const webAuthnAuth = async (data) => {
    const challenge = new TextEncoder().encode(data);
    
    const assertion = await navigator.credentials.get({
        publicKey: {
            challenge,
            rpId: window.location.hostname,
            allowCredentials: [{
                type: "public-key",
                id: credentialId  // From registration
            }]
        }
    });
    
    return assertion.response;  // SEA will normalize this
};

// Use it
gun.get(`~${webAuthnPub}`).get('data').put(
    'Signed by Touch ID',
    null,
    { opt: { authenticator: webAuthnAuth } }
);
```

## Writing to Your Own Graph

When writing to your own graph (where graph soul `~pub` matches your public key):

```javascript
const pair = await SEA.pair();

// ✅ Writing to own graph - just provide authenticator
gun.get(`~${pair.pub}`).get('profile').put(
    { bio: "I'm Alice" },
    null,
    { opt: { authenticator: pair } }
);
```

**Requirements:**
- `authenticator`: Your key pair or signing function
- That's it! No `pub` or `cert` needed

## Writing to Another User's Graph

When writing to someone else's graph, you need a certificate:

```javascript
// Alice's key pair
const alice = await SEA.pair();

// Bob's key pair
const bob = await SEA.pair();

// Bob creates a certificate allowing Alice to write
const cert = await SEA.certify(
    alice.pub,  // Alice can write
    { '*': 'messages' },  // to 'messages' path
    bob  // Certificate signed by Bob
);

// ✅ Alice writes to Bob's graph with certificate
gun.get(`~${bob.pub}`).get('messages').get('alice').put(
    'Hello Bob!',
    null,
    { 
        opt: { 
            authenticator: alice,  // Alice's keys
            pub: alice.pub,        // Alice's public key
            cert: cert             // Certificate from Bob
        } 
    }
);
```

**Requirements:**
- `authenticator`: Your key pair or signing function
- `pub`: Your public key (if authenticator is a function)
- `cert`: Certificate from the graph owner

## Advanced Patterns

### Switch Identities Per Operation

```javascript
const alicePair = await SEA.pair();
const bobPair = await SEA.pair();

// Write as Alice
gun.get(`~${alicePair.pub}`).get('post1').put(
    'Post by Alice',
    null,
    { opt: { authenticator: alicePair } }
);

// Write as Bob (different identity, no session change)
gun.get(`~${bobPair.pub}`).get('post1').put(
    'Post by Bob',
    null,
    { opt: { authenticator: bobPair } }
);
```

### Nested Signing (Delegation)

Create an authenticator that delegates to another signing mechanism:

```javascript
const masterPair = await SEA.pair();

// Create a delegated authenticator
const delegatedAuth = async (data) => {
    // First, sign with master key
    const masterSig = await SEA.sign(data, masterPair);
    
    // Then, add additional context or transform
    return masterSig;
};

// Use the delegated authenticator
gun.get(`~${masterPair.pub}`).get('data').put(
    'Delegated signature',
    null,
    { opt: { authenticator: delegatedAuth } }
);
```

### Derived Key Authenticators

Use with [additive derivation](./additive-derivation.md):

```javascript
// Master key
const master = await SEA.pair(null, { seed: "master-seed" });

// Derive child keys for different contexts
const workKey = await SEA.pair(null, { priv: master.priv, seed: "work" });
const socialKey = await SEA.pair(null, { priv: master.priv, seed: "social" });

// Use different derived keys
gun.get(`~${workKey.pub}`).get('documents').put(
    'Work document',
    null,
    { opt: { authenticator: workKey } }
);

gun.get(`~${socialKey.pub}`).get('posts').put(
    'Social post',
    null,
    { opt: { authenticator: socialKey } }
);
```

### Temporary Authenticators

Create short-lived authenticators for specific operations:

```javascript
async function createTempAuthenticator(masterPair, expiryMs) {
    const tempPair = await SEA.pair(null, {
        priv: masterPair.priv,
        seed: `temp-${Date.now()}`
    });
    
    // Auto-expire
    setTimeout(() => {
        console.log("Authenticator expired");
        // Clear from memory
    }, expiryMs);
    
    return tempPair;
}

// Use temporary authenticator
const tempAuth = await createTempAuthenticator(masterPair, 5 * 60 * 1000);
gun.get(`~${tempAuth.pub}`).get('temp-data').put(
    'Expires in 5 minutes',
    null,
    { opt: { authenticator: tempAuth } }
);
```

### Conditional Signing

Only sign if certain conditions are met:

```javascript
async function conditionalAuth(data, condition) {
    if (!condition()) {
        throw new Error("Condition not met, refusing to sign");
    }
    
    const pair = await SEA.pair();
    return await SEA.sign(data, pair);
}

// Use with condition
gun.get(`~${pub}`).get('sensitive').put(
    'Sensitive data',
    null,
    {
        opt: {
            authenticator: (data) => conditionalAuth(data, () => {
                // Only sign if user is verified
                return userIsVerified;
            })
        }
    }
);
```

### Multi-Signature Authenticator

Require multiple signatures:

```javascript
async function multiSigAuth(data, signers) {
    const signatures = [];
    
    for (const signer of signers) {
        const sig = await SEA.sign(data, signer);
        signatures.push(sig);
    }
    
    // Combine signatures (simplified example)
    return {
        m: data,
        s: signatures,
        type: 'multi-sig'
    };
}

// Require 2-of-3 signatures
const signers = [pair1, pair2, pair3];
gun.get(`~${multisigPub}`).get('vault').put(
    'Multi-sig data',
    null,
    {
        opt: {
            authenticator: (data) => multiSigAuth(data, signers.slice(0, 2))
        }
    }
);
```

## Integration Examples

### With Hardware Security Module (HSM)

```javascript
class HSMAuthenticator {
    constructor(hsmClient, keyId) {
        this.hsm = hsmClient;
        this.keyId = keyId;
    }
    
    async sign(data) {
        // Sign using HSM
        const signature = await this.hsm.sign({
            keyId: this.keyId,
            algorithm: 'ECDSA_SHA_256',
            message: data
        });
        
        return {
            m: data,
            s: signature
        };
    }
}

// Use HSM authenticator
const hsmAuth = new HSMAuthenticator(hsmClient, 'my-key-id');
gun.get(`~${hsmPub}`).get('data').put(
    'HSM-signed data',
    null,
    { opt: { authenticator: (data) => hsmAuth.sign(data) } }
);
```

### With Cloud KMS (AWS, GCP, Azure)

```javascript
// AWS KMS example
async function kmsAuthenticator(data) {
    const signature = await kmsClient.sign({
        KeyId: 'arn:aws:kms:us-east-1:123456789012:key/...',
        MessageType: 'RAW',
        SigningAlgorithm: 'ECDSA_SHA_256',
        Message: Buffer.from(data)
    }).promise();
    
    return {
        m: data,
        s: signature.Signature.toString('base64')
    };
}

gun.get(`~${kmsPub}`).get('data').put(
    'KMS-signed data',
    null,
    { opt: { authenticator: kmsAuthenticator } }
);
```

### With Mobile Biometric (React Native)

```javascript
import BiometricAuth from 'react-native-biometric';

async function biometricAuthenticator(data) {
    // Prompt for biometric
    const result = await BiometricAuth.simplePrompt({
        promptMessage: 'Sign this transaction'
    });
    
    if (!result.success) {
        throw new Error('Biometric authentication failed');
    }
    
    // Get stored key after biometric verification
    const pair = await getStoredKeyPair();
    return await SEA.sign(data, pair);
}

gun.get(`~${pub}`).get('data').put(
    'Biometric-signed data',
    null,
    { opt: { authenticator: biometricAuthenticator } }
);
```

## Authenticator Function Signature

Your authenticator function receives the serialized put operation and should return a signature:

```typescript
type Authenticator = (data: string) => Promise<Signature>;

type Signature = {
    m: any;      // The message/data that was signed
    s: string;   // The signature (base64-encoded)
};
```

Or simply return a SEA key pair, and SEA will handle signing:

```typescript
type Authenticator = SEAPair | ((data: string) => Promise<Signature>);

type SEAPair = {
    pub: string;
    priv: string;
    epub: string;
    epriv: string;
};
```

## Security Considerations

### ✅ Best Practices

1. **Validate before signing**: Check data integrity before signing
2. **Secure key storage**: Never expose private keys in logs or UI
3. **Rate limiting**: Implement rate limits to prevent abuse
4. **Audit logging**: Log all signing operations for security audits
5. **Key rotation**: Regularly rotate keys and use derived keys
6. **Scope limitation**: Use certificates to limit write permissions

### ⚠️ Common Pitfalls

1. **Don't pass private keys over network**: Sign locally, send signatures
2. **Don't reuse authenticators across contexts**: Use unique keys per purpose
3. **Don't skip certificate validation**: Always verify certificates when writing to others' graphs
4. **Don't ignore errors**: Handle signing failures gracefully

## Comparison: Session vs External Authenticator

| Feature | Session (`user.auth()`) | External Authenticator |
|---------|-------------------------|------------------------|
| Setup | Login required | No session needed |
| State | Stateful | Stateless |
| Switching identities | Logout/login | Per-operation |
| Custom signing | ❌ Not supported | ✅ Supported |
| Hardware keys | ❌ Limited | ✅ Full support |
| Complexity | Simple | More flexible |
| Use case | Traditional apps | Modern, multi-identity |

## Testing

### Unit Test Example

```javascript
describe('External Authenticators', function() {
    it('should put with external authenticator', async function() {
        const gun = Gun();
        const pair = await SEA.pair();
        
        // Put with external authenticator
        gun.get(`~${pair.pub}`).get('test').put(
            'test data',
            null,
            { opt: { authenticator: pair } }
        );
        
        // Verify
        await new Promise(resolve => {
            gun.get(`~${pair.pub}`).get('test').once(data => {
                expect(data).to.equal('test data');
                resolve();
            });
        });
    });
    
    it('should work with custom signing function', async function() {
        const gun = Gun();
        const pair = await SEA.pair();
        
        // Custom authenticator
        const customAuth = async (data) => {
            return await SEA.sign(data, pair);
        };
        
        gun.get(`~${pair.pub}`).get('custom').put(
            'custom signed',
            null,
            { opt: { authenticator: customAuth } }
        );
        
        // Verify
        await new Promise(resolve => {
            gun.get(`~${pair.pub}`).get('custom').once(data => {
                expect(data).to.equal('custom signed');
                resolve();
            });
        });
    });
});
```

## Debugging

Enable debug logging to troubleshoot authenticator issues:

```javascript
// Log authenticator calls
const debugAuth = async (data) => {
    console.log('Signing data:', data);
    
    try {
        const sig = await SEA.sign(data, pair);
        console.log('Signature:', sig);
        return sig;
    } catch (error) {
        console.error('Signing failed:', error);
        throw error;
    }
};

gun.get(`~${pub}`).get('debug').put(
    'debug data',
    null,
    { opt: { authenticator: debugAuth } }
);
```

## Migration from Session-Based Auth

### Before (Session-based)

```javascript
const gun = Gun();
const user = gun.user();

await user.create('alice', 'password');
await user.auth('alice', 'password');

user.get('profile').put({ name: 'Alice' });
```

### After (External Authenticator)

```javascript
const gun = Gun();
const pair = await SEA.pair(null, { seed: 'alice-recovery-seed' });

gun.get(`~${pair.pub}`).get('profile').put(
    { name: 'Alice' },
    null,
    { opt: { authenticator: pair } }
);
```

### Hybrid Approach

Support both for backward compatibility:

```javascript
async function hybridPut(gun, user, path, data, authenticator) {
    if (authenticator) {
        // New way: external authenticator
        const pub = authenticator.pub || user.is?.pub;
        gun.get(`~${pub}`).get(path).put(data, null, {
            opt: { authenticator }
        });
    } else {
        // Old way: authenticated session
        user.get(path).put(data);
    }
}
```

## See Also

- [WebAuthn Integration](./webauthn.md) - Hardware authenticators and biometrics
- [Seed-Based Keys](./seed-based-keys.md) - Deterministic key generation
- [Additive Derivation](./additive-derivation.md) - Hierarchical key derivation
- [SEA Certificates](https://gun.eco/docs/SEA.certify) - Permission management
