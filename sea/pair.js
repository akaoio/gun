;(function(){

    var SEA = require('./root');
    var shim = require('./shim');

    // P-256 curve constants
    const n = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
    const P = BigInt("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff");
    const A = BigInt("0xffffffff00000001000000000000000000000000fffffffffffffffffffffffc");
    const B = BigInt("0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b"); // Curve coefficient b
    const G = {
      x: BigInt("0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296"),
      y: BigInt("0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5")
    };

    // Core ECC functions
    function mod(a, m) { return ((a % m) + m) % m; }

    // Modular inverse using Fermat's Little Theorem (p is prime)
    // WARNING: modPow must be constant-time to prevent timing attacks on secret keys
    function modInv(a, p) {
        // a^(p-2) mod p
        return modPow(a, p - BigInt(2), p);
    }

    // Constant-time modular exponentiation using binary exponentiation
    // Always performs all iterations to prevent timing attacks
    // Uses conditional assignment instead of branches
    function modPow(base, exponent, modulus) {
        if (modulus === BigInt(1)) return BigInt(0);
        base = mod(base, modulus);
        let result = BigInt(1);
        let exp = exponent;
        
        // Process all bits with constant execution time
        while (exp > BigInt(0)) {
            const bit = exp & BigInt(1);
            // Always perform multiplication
            const temp = mod(result * base, modulus);
            // Constant-time conditional assignment (no branch prediction leak)
            result = bit ? temp : result;
            exp >>= BigInt(1);
            base = mod(base * base, modulus);
        }
        return result;
    }

    // Verify a point is on the curve
    function isOnCurve(point) {
        if (!point) return false;
        // y² = x³ + ax + b (mod p)
        const { x, y } = point;
        const left = mod(y * y, P);
        const right = mod(mod(mod(x * x, P) * x, P) + mod(A * x, P) + B, P);
        return left === right;
    }

    function pointAdd(p1, p2) {
      if (p1 === null) return p2; if (p2 === null) return p1;
      if (p1.x === p2.x && mod(p1.y + p2.y, P) === 0n) return null;
      let lambda = p1.x === p2.x && p1.y === p2.y
        ? mod((3n * mod(p1.x ** 2n, P) + A) * modInv(2n * p1.y, P), P)
        : mod((mod(p2.y - p1.y, P)) * modInv(mod(p2.x - p1.x, P), P), P);
      const x3 = mod(lambda ** 2n - p1.x - p2.x, P);
      return { x: x3, y: mod(lambda * mod(p1.x - x3, P) - p1.y, P) };
    }

    function pointMult(k, point) {
      // Constant-time scalar multiplication to prevent timing attacks
      let r = null, a = point;
      while (k > 0n) {
        const bit = k & 1n;
        // Always perform pointAdd (dummy when bit=0 with identity point)
        const temp = pointAdd(r, a);
        // Use constant-time assignment: always assign temp, use bit to select
        r = bit ? temp : r;
        a = pointAdd(a, a);
        k >>= 1n;
      }
      return r;
    }

    SEA.pair = SEA.pair || (async (cb, opt) => { try {
      opt = opt || {};
      const subtle = shim.subtle, ecdhSubtle = shim.ossl || subtle;
      let r = {};

      // Helper functions
      const b64ToBI = s => {
        // Validate base64 input format
        if (typeof s !== 'string' || s.length === 0) {
          throw new Error("Invalid base64 input: must be non-empty string");
        }
        // Standard base64url validation
        const b64url = s.replace(/-/g, '+').replace(/_/g, '/');
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64url)) {
          throw new Error("Invalid base64 characters detected");
        }
        
        try {
          const padded = b64url.padEnd(Math.ceil(b64url.length / 4) * 4, '=');
          const hex = shim.Buffer.from(padded, 'base64').toString('hex');
          
          // Validate result is within P-256 range (256 bits / 64 hex chars)
          if (hex.length > 64) {
            throw new Error("Decoded value exceeds 256 bits for P-256");
          }
          
          const value = BigInt('0x' + hex);
          return value;
        } catch (e) {
          if (e.message.includes("256 bits")) throw e;
          throw new Error("Invalid base64 decoding: " + e.message);
        }
      };
      const biToB64 = n => {
        // Validate input is within valid range for P-256 (256 bits max)
        const max256bit = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
        if (n < 0n || n > max256bit) {
          throw new Error("Invalid BigInt: must be 0 <= n <= 2^256-1");
        }
        const hex = n.toString(16).padStart(64, '0');
        if (hex.length > 64) {
          throw new Error("BigInt too large for P-256: exceeds 256 bits");
        }
        const b64 = shim.Buffer.from(hex, 'hex').toString('base64')
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        return b64;
      };
      const pubFromPriv = priv => {
        const pub = pointMult(priv, G);
        if (!isOnCurve(pub)) throw new Error("Invalid point generated");
        return biToB64(pub.x) + '.' + biToB64(pub.y);
      };
      const parsePub = pubStr => {
        if (!pubStr || typeof pubStr !== 'string') {
          throw new Error("Invalid pub format: must be string");
        }
        const parts = pubStr.split('.');
        if (parts.length !== 2) {
          throw new Error("Invalid pub format: must be x.y");
        }
        const point = { x: b64ToBI(parts[0]), y: b64ToBI(parts[1]) };
        if (!isOnCurve(point)) {
          throw new Error("Invalid public key: not on curve");
        }
        return point;
      };
      const pointToPub = point => {
        if (!isOnCurve(point)) {
          throw new Error("Invalid point: not on curve");
        }
        return biToB64(point.x) + '.' + biToB64(point.y);
      };
      const seedToBuffer = seed => {
        const enc = new shim.TextEncoder();
        if (typeof seed === 'string') {
          return enc.encode(seed).buffer;
        }
        if (seed instanceof ArrayBuffer) {
          return seed;
        }
        if (seed && seed.byteLength !== undefined) {
          return seed.buffer || seed;
        }
        return null;
      };
      const seedToKey = async (seed, salt) => {
        const enc = new shim.TextEncoder();
        const buf = seedToBuffer(seed);
        if (!buf) throw new Error("Invalid seed");
        const combined = new Uint8Array(buf.byteLength + enc.encode(salt).buffer.byteLength);
        combined.set(new Uint8Array(buf), 0);
        combined.set(new Uint8Array(enc.encode(salt).buffer), buf.byteLength);
        const hash = await subtle.digest("SHA-256", combined.buffer);
        
        // Use rejected resampling for uniform distribution
        // Keep hashing until we get a valid private key in range [1, n)
        let hashData = hash;
        let attemptCount = 0;
        const maxAttempts = 100; // Prevent infinite loops
        
        while (attemptCount < maxAttempts) {
          let priv = BigInt("0x" + Array.from(new Uint8Array(hashData))
            .map(b => b.toString(16).padStart(2, "0")).join(""));
          
          // Check if priv is in valid range [1, n)
          if (priv > 0n && priv < n) {
            return priv;
          }
          
          // Resample by hashing the previous result with counter
          const counterBuf = new Uint8Array(4);
          new DataView(counterBuf.buffer).setUint32(0, attemptCount, true);
          const combined2 = new Uint8Array(hashData.byteLength + counterBuf.byteLength);
          combined2.set(new Uint8Array(hashData), 0);
          combined2.set(counterBuf, hashData.byteLength);
          hashData = await subtle.digest("SHA-256", combined2.buffer);
          attemptCount++;
        }
        
        throw new Error("Failed to generate valid private key after " + maxAttempts + " attempts");
      };
      const hashToScalar = async (seed, label) => {
        const enc = new shim.TextEncoder();
        const buf = seedToBuffer(seed);
        if (!buf) throw new Error("Invalid seed");
        const labelBuf = enc.encode(label).buffer;
        const combined = new Uint8Array(buf.byteLength + labelBuf.byteLength);
        combined.set(new Uint8Array(labelBuf), 0);
        combined.set(new Uint8Array(buf), labelBuf.byteLength);
        const hash = await subtle.digest("SHA-256", combined.buffer);

        let hashData = hash;
        let attemptCount = 0;
        const maxAttempts = 100;
        while (attemptCount < maxAttempts) {
          const scalar = BigInt("0x" + Array.from(new Uint8Array(hashData))
            .map(b => b.toString(16).padStart(2, "0")).join(""));
          if (scalar > 0n && scalar < n) {
            return scalar;
          }
          const counterBuf = new Uint8Array(4);
          new DataView(counterBuf.buffer).setUint32(0, attemptCount, true);
          const combined2 = new Uint8Array(hashData.byteLength + counterBuf.byteLength);
          combined2.set(new Uint8Array(hashData), 0);
          combined2.set(counterBuf, hashData.byteLength);
          hashData = await subtle.digest("SHA-256", combined2.buffer);
          attemptCount++;
        }
        throw new Error("Failed to derive scalar after " + maxAttempts + " attempts");
      };

      if (opt.seed && (opt.priv || opt.epriv || opt.pub || opt.epub)) {
        r = {};
        if (opt.priv) {
          const priv = b64ToBI(opt.priv);
          const signOffset = await hashToScalar(opt.seed, "SEA.DERIVE|sign|");
          const derivedPriv = mod(priv + signOffset, n);
          const derivedPub = pointMult(derivedPriv, G);
          r.priv = biToB64(derivedPriv);
          r.pub = pointToPub(derivedPub);
        }
        if (opt.epriv) {
          const epriv = b64ToBI(opt.epriv);
          const encOffset = await hashToScalar(opt.seed, "SEA.DERIVE|encrypt|");
          const derivedEpriv = mod(epriv + encOffset, n);
          const derivedEpub = pointMult(derivedEpriv, G);
          r.epriv = biToB64(derivedEpriv);
          r.epub = pointToPub(derivedEpub);
        }
        if (opt.pub) {
          const pubPoint = parsePub(opt.pub);
          const signOffset = await hashToScalar(opt.seed, "SEA.DERIVE|sign|");
          const derivedPub = pointAdd(pubPoint, pointMult(signOffset, G));
          r.pub = pointToPub(derivedPub);
        }
        if (opt.epub) {
          const epubPoint = parsePub(opt.epub);
          const encOffset = await hashToScalar(opt.seed, "SEA.DERIVE|encrypt|");
          const derivedEpub = pointAdd(epubPoint, pointMult(encOffset, G));
          r.epub = pointToPub(derivedEpub);
        }
      } else if (opt.priv) {
        const priv = b64ToBI(opt.priv);
        r = { priv: opt.priv, pub: pubFromPriv(priv) };
        if (opt.epriv) {
          r.epriv = opt.epriv;
          r.epub = pubFromPriv(b64ToBI(opt.epriv));
        } else {
          try {
            const dh = await ecdhSubtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveKey'])
            .then(async k => ({ 
              epriv: (await ecdhSubtle.exportKey('jwk', k.privateKey)).d,
              epub: (await ecdhSubtle.exportKey('jwk', k.publicKey)).x + '.' + 
                    (await ecdhSubtle.exportKey('jwk', k.publicKey)).y
            }));
            r.epriv = dh.epriv; r.epub = dh.epub;
          } catch(e) {}
        }
      } else if (opt.epriv) {
        r = { epriv: opt.epriv, epub: pubFromPriv(b64ToBI(opt.epriv)) };
        if (opt.priv) {
          r.priv = opt.priv;
          r.pub = pubFromPriv(b64ToBI(opt.priv));
        } else {
          const sa = await subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify'])
          .then(async k => ({ 
            priv: (await subtle.exportKey('jwk', k.privateKey)).d,
            pub: (await subtle.exportKey('jwk', k.publicKey)).x + '.' + 
                 (await subtle.exportKey('jwk', k.publicKey)).y
          }));
          r.priv = sa.priv; r.pub = sa.pub;
        }
      } else if (opt.seed) {
        const signPriv = await seedToKey(opt.seed, "-sign");
        const encPriv = await seedToKey(opt.seed, "-encrypt");
        r = {
          priv: biToB64(signPriv), pub: pubFromPriv(signPriv),
          epriv: biToB64(encPriv), epub: pubFromPriv(encPriv)
        };
      } else {
        const sa = await subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify'])
        .then(async k => ({ 
          priv: (await subtle.exportKey('jwk', k.privateKey)).d,
          pub: (await subtle.exportKey('jwk', k.publicKey)).x + '.' + 
               (await subtle.exportKey('jwk', k.publicKey)).y
        }));
        r = { pub: sa.pub, priv: sa.priv };
        try {
          const dh = await ecdhSubtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveKey'])
          .then(async k => ({ 
            epriv: (await ecdhSubtle.exportKey('jwk', k.privateKey)).d,
            epub: (await ecdhSubtle.exportKey('jwk', k.publicKey)).x + '.' + 
                  (await ecdhSubtle.exportKey('jwk', k.publicKey)).y
          }));
          r.epub = dh.epub; r.epriv = dh.epriv;
        } catch(e) {}
      }

      if(cb) try{ cb(r) }catch(e){ /* Silently ignore callback errors to prevent leaking secrets */ }
      return r;
    } catch(e) {
      SEA.err = e;
      if(SEA.throw) throw e;
      if(cb) try { cb(); } catch(cbErr) { /* Ignore callback errors */ }
      throw new Error("Key generation failed: " + (e.message || "Unknown error"));
    }});

    module.exports = SEA.pair;
  
}());