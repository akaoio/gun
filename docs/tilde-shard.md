# `~` Shard Index (SEA)

This document introduces the `~` shard behavior in SEA firewall logic.

## Why `~` shard exists

`~` shard provides a deterministic, path-based index for public keys (pub), while keeping write rules strict and verifiable.

Main goals:
- Avoid oversized single-node indexes.
- Enforce deterministic shard structure.
- Reuse SEA signing/verification flow for shard leaf writes.
- Support external authenticators (including WebAuthn-style authenticators) during `put`.
- Prevent spam: intermediate shard nodes require an authenticator whose public key is a valid owner of that path.

---

## Data model

Shard namespace:
- Root soul: `~`
- Shard souls: `~/...`

Config (current):
- `pub` length: `88`
- `cut` (segment size): `2`
- leaf key min/max: `1..2`
- max depth: `ceil(88 / 2) = 44`

> **New pub format (base62):** `pub` and `epub` are now **88 alphanumeric chars** (`[A-Za-z0-9]`), two concatenated 44-char base62 values (one per P-256 coordinate). The old format was `[43 base64url].[43 base64url]` = 87 chars with a `.` separator and `+/=` substitutions. Peer nodes still route old-format souls (`~oldPub`) for backward compatibility, but the shard namespace strictly requires the new format.

### Path/segment constraints

A shard soul is valid only when:
- It is exactly `~`, or starts with `~/`.
- It does not contain `//`.
- It does not end with `/`.
- Each path segment uses allowed chars only: `[0-9a-zA-Z]` (strict alphanumeric — no `.`, `_`, or `-`).
- Intermediate path segments are fixed length `2`.

Key constraints:
- For shard writes, key length must be `1..2`.

---

## Write rules

### 1) Root + intermediate nodes

For non-leaf shard nodes:
- Value **must be a link**.
- Link target **must equal** exact child soul (`check.$kid(soul, key)`).
- An `authenticator` is **required**.
- The authenticator's public key must have the correct prefix matching the key path — i.e. `pub.startsWith(path.join('') + key)`. This ensures only the key owner can claim a shard slot.
- The signature is generated fresh by `check.auth` via `SEA.opt.pack`, which embeds the Gun state timestamp into the signed message. Pre-signed proofs are not accepted.

**Stored envelope for intermediate nodes:**
```json
{ ":":  {"#": "~/ab"}, "~": "<sig>", "*": "<fullPub88chars>" }
```
The outer object is stored as a JSON string in the graph. `':'` holds the link, `'~'` holds the state-bound ECDSA signature, `'*'` holds the signer's full public key.

Example:
- Write to soul `~`, key `ab` => link must be `{"#":"~/ab"}` + `opt.authenticator` whose `.pub` starts with `ab`.

**Peer re-read optimization:**  
When a peer propagates an intermediate node that already exists locally with the correct link, the node is forwarded without re-running crypto verification (skip-if-same).

### 2) Leaf node

A write is considered leaf when `path + key` reconstructs a valid pub (length 88, base62 alphanumeric).

Leaf rules:
- Value **must not** be a link.
- Leaf write reuses `check.pub` flow (pack/sign/verify/unpack), with shard-specific guard:
  - verified payload must equal leaf pub.
- Cert path is disabled for shard leaf flow (`nocert`).
- Signature is always created fresh at write time (state-bound). Pre-signed values are rejected.

---

## Authenticator support

Both intermediate and leaf shard writes require an authenticator. Two styles are supported:

### 1. Pair object authenticator

The simplest form. `pub` is read directly from the pair:

```javascript
const pair = await SEA.pair();

// --- Intermediate node ---
const key = pair.pub.slice(0, 2);  // first 2-char segment
gun.get('~').get(key).put({'#': '~/' + key}, null, {
  opt: { authenticator: pair }  // pair.pub starts with key ✓
});

// --- Leaf node ---
const chunks = pair.pub.match(/.{1,2}/g) || [];
const leafKey = chunks.pop();
const leafSoul = chunks.length ? '~/' + chunks.join('/') : '~';
gun.get(leafSoul).get(leafKey).put(pair.pub, null, {
  opt: { authenticator: pair }
});
```

### 2. External function authenticator

A custom async signing function (WebAuthn adapter, HSM, etc.).

**Important:** A function has no `.pub` property. For **intermediate** nodes you must also pass `opt.pub` explicitly so the firewall can derive the owner and check the path prefix. Leaf nodes do not need `opt.pub` (the pub is reconstructed from the soul path).

```javascript
const pair = await SEA.pair();
const auth = async (data) => SEA.sign(data, pair);

// --- Intermediate node — opt.pub is REQUIRED ---
const key = pair.pub.slice(0, 2);
gun.get('~').get(key).put({'#': '~/' + key}, null, {
  opt: { authenticator: auth, pub: pair.pub }  // opt.pub required for function auth
});

// --- Leaf node — opt.pub not needed ---
const chunks = pair.pub.match(/.{1,2}/g) || [];
const leafKey = chunks.pop();
const leafSoul = chunks.length ? '~/' + chunks.join('/') : '~';
gun.get(leafSoul).get(leafKey).put(pair.pub, null, {
  opt: { authenticator: auth }  // pub derived from soul+key
});
```

---

## Pass/fail examples

### Pass

- Intermediate (pair authenticator):
  - soul: `~`, key: `ab`, val: `{"#":"~/ab"}`, `opt.authenticator: pair` where `pair.pub.startsWith('ab')`

- Intermediate (function authenticator):
  - same as above but `opt.authenticator: fn` + `opt.pub: pair.pub`

- Leaf:
  - soul + key reconstruct valid pub, val is signed payload resolving to exactly that pub

### Fail

- `Invalid shard soul path.` — `~/ab//cd`, `~/ab/cd/`

- `Invalid shard key.` — key length not in `1..2`

- `Invalid shard depth.` — path depth over max

- `Shard intermediate value must be link.` — intermediate val is scalar/object non-link

- `Invalid shard link target.` — intermediate link points to wrong child soul

- `Shard intermediate requires authenticator.` — no `opt.authenticator` supplied

- `Invalid shard intermediate pub.` — `opt.pub` is missing or wrong length when using function authenticator

- `Shard pub prefix mismatch.` — authenticator pub does not start with the expected path prefix for this key

- `Shard intermediate signed payload mismatch.` — signature verified but inner value does not equal expected child soul link

- `Shard leaf cannot be link.` — leaf val is a relation link

- `Shard leaf payload must equal pub.` — verified payload does not match reconstructed pub

---

## Canonicalization / graphify note

Recommended leaf input contract:
- Use scalar pub payload flow (signed through SEA pipeline at put time).
- Avoid object-shaped leaf payloads.

Reason:
- Object-shaped values may be graphified into links by GUN, which violates leaf rule (`leaf cannot be link`).

---

## Test coverage

Current SEA tests (77 passing) include shard checks for:

**Intermediate node writes:**
- Accept with pair authenticator (link matches child soul)
- Accept with external async function authenticator + `opt.pub`
- Reject link target mismatch
- Reject non-link value
- Reject missing authenticator
- Reject function authenticator without `opt.pub`
- Reject wrong pub prefix (authenticator pub does not start with key)

**Validation:**
- Reject invalid key length (not 1–2 chars)
- Reject depth exceeding max (44 segments)
- Reject invalid soul path (double slash, trailing slash)

**Leaf node writes:**
- Reject link value
- Reject pre-signed proof without authenticator
- Accept with pair authenticator (and verify read-back)
- Accept with external async function authenticator (and verify read-back)

Run:

```bash
npm run buildSea
npm run testSea
```
