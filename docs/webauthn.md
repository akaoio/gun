# WebAuthn Integration

## Overview

This fork includes **native WebAuthn/Passkey integration**, allowing GunDB to use **hardware security keys, biometric authentication, and platform authenticators** for signing and verification. This brings:

- 🔐 **Hardware-backed security**: Private keys never leave the secure enclave
- 🎯 **Phishing resistance**: Cryptographic domain binding prevents credential theft
- 📱 **Biometric authentication**: Touch ID, Face ID, Windows Hello
- 🔑 **Physical security keys**: YubiKey, Google Titan, etc.
- 🚫 **No password needed**: Passwordless authentication flows

## How It Works

WebAuthn signatures are **normalized** to match SEA's signature format, allowing seamless integration with GunDB's verification system. The integration:

1. Captures WebAuthn assertion responses
2. Extracts the P-256 signature (r, s values)
3. Wraps it in SEA's expected format
4. Enables verification using the public key

## Prerequisites

WebAuthn requires:
- **HTTPS or localhost**: WebAuthn only works on secure contexts
- **User gesture**: Most authenticators require a user interaction
- **Browser support**: Modern browsers (Chrome 67+, Firefox 60+, Safari 13+)

## Setup

### 1. Create a WebAuthn Credential

```javascript
// Helper to encode/decode base64url
const base64url = {
    encode: function(buffer) {
        return btoa(String.fromCharCode(...new Uint8Array(buffer)));
    },
    decode: function(str) {
        return atob(str);
    }
};

// Create a credential (register)
const credential = await navigator.credentials.create({
    publicKey: {
        challenge: new Uint8Array(16), // Random challenge
        rp: { 
            id: "localhost",  // or your domain
            name: "My App" 
        },
        user: {
            id: new TextEncoder().encode("user-123"),
            name: "user@example.com",
            displayName: "User Name"
        },
        pubKeyCredParams: [
            { type: "public-key", alg: -7 },  // ES256 (P-256) - REQUIRED for SEA
            { type: "public-key", alg: -25 }, // ECDH (P-256) - for encryption
        ],
        authenticatorSelection: {
            userVerification: "preferred" // or "required" for stricter security
        },
        timeout: 60000,
        attestation: "none"
    }
});

console.log("Credential created:", credential);
```

### 2. Extract the Public Key

```javascript
// Get the public key from the credential
const publicKey = credential.response.getPublicKey();
const rawKey = new Uint8Array(publicKey);

// Extract X and Y coordinates (COSE format for P-256)
// Bytes 1-26: COSE header
// Bytes 27-58: X coordinate (32 bytes)
// Bytes 59-90: Y coordinate (32 bytes)
const xCoord = rawKey.slice(27, 59);
const yCoord = rawKey.slice(59, 91);

// Format as SEA-compatible public key
const pub = `${base64url.encode(xCoord)}.${base64url.encode(yCoord)}`;

console.log("Public key:", pub);
// Example: "gI8VJP8J6CRkX34eTrY-z5pK-h7BrP7CqZk3DLM4rX0.Cv3mRRoJYtT-uGLyPcqNJwH0VxJ7Q9FLLnW9r8qgZ3M"
```

## Basic Usage

### Sign Data

```javascript
// Create an authenticator function
const authenticator = async (data) => {
    const challenge = new TextEncoder().encode(data);
    
    const assertion = await navigator.credentials.get({
        publicKey: {
            challenge,
            rpId: window.location.hostname,
            userVerification: "preferred",
            allowCredentials: [{
                type: "public-key",
                id: credential.rawId  // From credential creation
            }],
            timeout: 60000
        }
    });
    
    return assertion.response;
};

// Sign data using SEA with WebAuthn
const data = "Hello, World!";
const signature = await SEA.sign(data, authenticator);

console.log("Signature:", signature);
// { m: {...}, s: "..." }
```

### Verify Signature

```javascript
// Verify using the public key
const verified = await SEA.verify(signature, pub);

console.log("Verified:", verified);
// "Hello, World!"

if (verified === data) {
    console.log("✅ Signature valid!");
} else {
    console.log("❌ Signature invalid!");
}
```

## Complete Example

Here's a full working example:

```javascript
let credential, pub, authenticator;

// 1. Create credential (registration)
async function register() {
    credential = await navigator.credentials.create({
        publicKey: {
            challenge: new Uint8Array(16),
            rp: { id: "localhost", name: "My App" },
            user: {
                id: new TextEncoder().encode("user-123"),
                name: "user@example.com",
                displayName: "User"
            },
            pubKeyCredParams: [
                { type: "public-key", alg: -7 },  // ES256 - REQUIRED
                { type: "public-key", alg: -25 }  // ECDH - optional
            ],
            authenticatorSelection: {
                userVerification: "preferred"
            },
            timeout: 60000,
            attestation: "none"
        }
    });
    
    // Extract public key
    const publicKey = credential.response.getPublicKey();
    const rawKey = new Uint8Array(publicKey);
    const xCoord = rawKey.slice(27, 59);
    const yCoord = rawKey.slice(59, 91);
    pub = `${base64url.encode(xCoord)}.${base64url.encode(yCoord)}`;
    
    // Create authenticator function
    authenticator = async (data) => {
        const challenge = new TextEncoder().encode(data);
        const assertion = await navigator.credentials.get({
            publicKey: {
                challenge,
                rpId: window.location.hostname,
                userVerification: "preferred",
                allowCredentials: [{ type: "public-key", id: credential.rawId }],
                timeout: 60000
            }
        });
        return assertion.response;
    };
    
    console.log("Registration complete!");
    console.log("Public key:", pub);
}

// 2. Sign and verify
async function signAndVerify() {
    const message = "Hello from WebAuthn!";
    
    // Sign
    const signature = await SEA.sign(message, authenticator);
    console.log("Signature:", signature);
    
    // Verify
    const verified = await SEA.verify(signature, pub);
    console.log("Verified:", verified);
    console.log("Valid:", verified === message);
}

// 3. Use with GunDB
async function useWithGun() {
    const gun = Gun();
    
    // Put data to user graph (without traditional auth)
    gun.get(`~${pub}`).get('profile').put('My profile data', null, {
        opt: { authenticator }
    });
    
    // Read data back
    setTimeout(() => {
        gun.get(`~${pub}`).get('profile').once(data => {
            console.log("Retrieved:", data);
        });
    }, 1000);
}

// Usage
await register();
await signAndVerify();
await useWithGun();
```

## Integration with GunDB

### Put Data with WebAuthn

```javascript
const gun = Gun();

// Put to your own graph
gun.get(`~${pub}`).get('test').put('hello world', null, { 
    opt: { authenticator } 
});

// Read it back
gun.get(`~${pub}`).get('test').once(data => {
    console.log(data); // "hello world"
});
```

### Put to Another User's Graph with Certificate

```javascript
// Alice's WebAuthn setup
const alicePub = "...";
const aliceAuthenticator = async (data) => { /* ... */ };

// Bob creates a certificate for Alice
const bob = await SEA.pair();
const cert = await SEA.certify(
    alicePub,  // Alice can write
    { '*': 'messages' },  // to Bob's messages path
    bob
);

// Alice writes to Bob's graph using her WebAuthn key
gun.get(`~${bob.pub}`).get('messages').get('from-alice').put(
    'Hello Bob!', 
    null, 
    { 
        opt: { 
            authenticator: aliceAuthenticator,
            pub: alicePub,  // Alice's public key
            cert: cert       // Certificate from Bob
        } 
    }
);
```

## Security Considerations

### ✅ Benefits

1. **Hardware-backed keys**: Private keys stored in secure enclaves (TPM, Secure Enclave, etc.)
2. **Phishing resistant**: Domain-bound credentials prevent use on fake sites
3. **No password vulnerabilities**: No passwords to steal, leak, or forget
4. **User verification**: Biometric or PIN ensures user presence
5. **Attestation support**: Can verify authenticator authenticity

### ⚠️ Important Notes

1. **Backup and Recovery**: WebAuthn credentials are device-specific
   - Users can lose access if device is lost/broken
   - Consider backup strategies (multiple authenticators, recovery keys)
   
2. **Browser/Platform Support**: Not all devices support WebAuthn
   - Provide fallback authentication methods
   - Test across target platforms

3. **User Experience**: Requires user interaction for each signature
   - Can't batch-sign operations
   - May require repeated biometric scans

4. **Public Key Distribution**: You must securely distribute the public key
   - Consider using Gun's alias system
   - Implement key verification mechanisms

## Advanced Usage

### Multiple Authenticators

```javascript
// Register multiple authenticators for backup
const authenticators = [];

for (let i = 0; i < 2; i++) {
    const cred = await navigator.credentials.create({
        publicKey: { /* same config */ }
    });
    
    authenticators.push({
        credential: cred,
        pub: extractPublicKey(cred),
        authenticator: createAuthenticator(cred)
    });
}

// Use any authenticator
const signature = await SEA.sign(data, authenticators[0].authenticator);
```

### Conditional UI (Autofill)

```javascript
// Use passkey autofill in login forms
const available = await PublicKeyCredential.isConditionalMediationAvailable();

if (available) {
    const credential = await navigator.credentials.get({
        publicKey: { /* ... */ },
        mediation: "conditional"  // Enables autofill
    });
}
```

### Resident Keys (Discoverable Credentials)

```javascript
// Create a resident key (stored on authenticator)
const credential = await navigator.credentials.create({
    publicKey: {
        // ... other options
        authenticatorSelection: {
            residentKey: "required",  // Store credential on device
            userVerification: "required"
        }
    }
});

// Later, discover credentials without username
const credentials = await navigator.credentials.get({
    publicKey: {
        challenge: new Uint8Array(16)
        // No allowCredentials - will show all resident keys
    }
});
```

### User Verification Levels

```javascript
// Strict: Always require biometric/PIN
const strictAuth = async (data) => {
    return await navigator.credentials.get({
        publicKey: {
            challenge: new TextEncoder().encode(data),
            userVerification: "required"  // ⬅️ Strict
            // ...
        }
    });
};

// Relaxed: Optional biometric
const relaxedAuth = async (data) => {
    return await navigator.credentials.get({
        publicKey: {
            challenge: new TextEncoder().encode(data),
            userVerification: "preferred"  // ⬅️ Relaxed
            // ...
        }
    });
};
```

## Troubleshooting

### "Not allowed to request credential"

- Ensure you're on HTTPS or localhost
- Check that user initiated the action (e.g., button click)
- Verify the RP ID matches your domain

### "No available credentials"

- Check that `allowCredentials` matches registered credentials
- Ensure credential wasn't deleted from authenticator
- Verify RP ID matches registration

### "Invalid public key format"

- Ensure algorithm is `-7` (ES256, P-256)
- Check coordinate extraction (bytes 27-58 and 59-90)
- Verify base64url encoding is correct

### "Signature verification failed"

- Confirm you're using the correct public key
- Check that authenticator data is included in signature
- Ensure challenge/data encoding is consistent

## Browser Compatibility

| Browser | Version | Notes |
|---------|---------|-------|
| Chrome | 67+ | Full support |
| Firefox | 60+ | Full support |
| Safari | 13+ | iOS 14+ for Face ID |
| Edge | 18+ | Full support |

## Platform Support

| Platform | Support | Authenticators |
|----------|---------|----------------|
| Windows | ✅ | Windows Hello, security keys |
| macOS | ✅ | Touch ID, security keys |
| iOS | ✅ | Face ID, Touch ID |
| Android | ✅ | Fingerprint, security keys |
| Linux | ⚠️ | Security keys (limited biometric) |

## Best Practices

1. **Always use HTTPS** in production
2. **Implement fallback auth** for unsupported devices
3. **Encourage multiple authenticators** for backup
4. **Test across platforms** before deployment
5. **Provide clear UX** for biometric prompts
6. **Store credential IDs** for future authentication
7. **Handle errors gracefully** with user-friendly messages
8. **Verify RP ID** matches your domain exactly

## Migration Guide

### From Traditional SEA Authentication

```javascript
// OLD: Traditional SEA auth
const user = gun.user();
await user.create("alice", "password123");
await user.auth("alice", "password123");

// NEW: WebAuthn
const { credential, pub, authenticator } = await registerWebAuthn();
gun.get(`~${pub}`).get('data').put('value', null, { 
    opt: { authenticator } 
});
```

### Hybrid Approach

```javascript
// Support both traditional and WebAuthn
async function hybridAuth(gun, username, password, useWebAuthn) {
    if (useWebAuthn) {
        const { pub, authenticator } = await webAuthnLogin(username);
        return { pub, authenticator };
    } else {
        const user = gun.user();
        await user.auth(username, password);
        return { pub: user.is.pub, authenticator: user._.sea };
    }
}
```

## Example: Complete WebAuthn Flow

See [examples/webauthn.html](../examples/webauthn.html) and [examples/webauthn.js](../examples/webauthn.js) for a complete working example with UI.

## See Also

- [External Authenticators](./external-authenticators.md) - Custom signing functions
- [Seed-Based Keys](./seed-based-keys.md) - Deterministic key generation
- [Derive (Additive)](./additive-derivation.md) - Hierarchical keys
- [WebAuthn Specification](https://www.w3.org/TR/webauthn-2/) - Official W3C spec
- [MDN WebAuthn Guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API) - Browser documentation
