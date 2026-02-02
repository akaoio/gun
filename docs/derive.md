# SEA Derive (Additive)

## Overview

The **additive derive** feature enables:
- **Alice** to derive public keys from Bob’s `pub/epub` + `seed`.
- **Bob** to derive private+public from `priv/epriv` + `seed`.

This design is **offline-first** and requires no interaction between Alice/Bob.
## Inputs (`SEA.pair`)

All use **existing names**: `priv/epriv/pub/epub/seed`.

- `opt.priv`: signing private key (base64url)
- `opt.epriv`: encryption private key (base64url)
- `opt.pub`: signing public key (`x.y`, base64url)
- `opt.epub`: encryption public key (`x.y`, base64url)
- `opt.seed`: public seed (string/ArrayBuffer)
## Outputs (depend on inputs)

| Input | Output | Notes |
|------|--------|--------|
| `priv + seed` | `priv,pub` | derive signing only |
| `epriv + seed` | `epriv,epub` | derive encryption only |
| `priv + epriv + seed` | `priv,pub,epriv,epub` | derive both |
| `pub + seed` | `pub` | public-only signing |
| `epub + seed` | `epub` | public-only encryption |
| `pub + epub + seed` | `pub,epub` | public-only both |
## Formulas (Additive Derivation)

### Hash-to-Scalar
- SHA-256 + rejected resampling into $[1, n)$
- Domain separation:
  - `SEA.DERIVE|sign|seed`
  - `SEA.DERIVE|encrypt|seed`
### Derive private (Bob)
$$
x = (priv + H2S(seed)) \bmod n
$$

### Derive public (Alice/Bob)
$$
X = pub + H2S(seed) \cdot G
$$
## Examples

### 1) Bob derive (full pair)
```javascript
const base = await SEA.pair();
const derived = await SEA.pair(null, {
  priv: base.priv,
  epriv: base.epriv,
  seed: "voucher:123"
});
// derived: { priv, pub, epriv, epub }
```

### 2) Alice derive (public-only)
```javascript
const derived = await SEA.pair(null, {
  pub: bob.pub,
  epub: bob.epub,
  seed: "voucher:123"
});
// derived: { pub, epub }
```

### 3) Alice only needs signing
```javascript
const derived = await SEA.pair(null, {
  pub: bob.pub,
  seed: "voucher:123"
});
// derived: { pub }
```

## Security Trade-off (Required)

- **No forward/sibling secrecy**.
- If `derivedPriv` leaks, `priv` can be recovered:
  $$ priv = derivedPriv - H2S(seed) $$

This trade-off is **required** so Alice can derive public keys from public keys.
## Backward Compatibility

- `SEA.pair({ seed })`, `SEA.pair({ priv })`, `SEA.pair({ epriv })` keep existing behavior.
- Derive only activates when `seed` is provided **with** `priv/epriv/pub/epub`.
## Validation & Edge Cases

The implementation includes hardened validation:
- **Private key range:** Rejects `priv/epriv` if $\le 0$ or $\ge n$.
- **Public key range:** Rejects `pub/epub` if $x \ge P$ or $y \ge P$ (non-canonical encoding).
- **On-curve check:** All public keys validated via curve equation $y^2 = x^3 + ax + b \pmod{P}$.
- **Zero-derived key retry:** If $derivedPriv = 0$ or $derivedPub = \infty$, automatically re-derives with counter suffix (`|0`, `|1`, ...) until valid. Alice and Bob converge on the same counter.

## Test Coverage (added)

Main tests (in `test/sea/sea.js`):
- Determinism
- Alice/Bob consistency (sign + encrypt)
- Partial outputs
- Invalid pub format / point not on curve
- Public key coordinates out of range
- Private key out of range / zero