# `~` Shard Index (SEA)

This document introduces the new `~` shard behavior in SEA firewall logic.

## Why `~` shard exists

`~` shard provides a deterministic, path-based index for public keys (pub), while keeping write rules strict and verifiable.

Main goals:
- Avoid oversized single-node indexes.
- Enforce deterministic shard structure.
- Reuse SEA signing/verification flow for shard leaf writes.
- Support external authenticators (including WebAuthn-style authenticators) during `put`.

---

## Data model

Shard namespace:
- Root soul: `~`
- Shard souls: `~/...`

Config (current):
- `pub` length: `87`
- `cut` (segment size): `2`
- leaf key min/max: `1..2`
- max depth: `ceil(87 / 2) = 44`

### Path/segment constraints

A shard soul is valid only when:
- It is exactly `~`, or starts with `~/`.
- It does not contain `//`.
- It does not end with `/`.
- Each path segment uses allowed chars only: `[0-9a-zA-Z._-]`.
- Intermediate path segments are fixed length `2`.

Key constraints:
- For shard writes, key length must be `1..2`.

---

## Write rules

### 1) Root + intermediate nodes

For non-leaf shard nodes:
- Value **must be a link**.
- Link target **must equal** exact child soul.

Example:
- Write to soul `~`, key `ab` => value must be `{"#":"~/ab"}`.

### 2) Leaf node

A write is considered leaf when `path + key` reconstructs a valid pub (length 87 + pub format check).

Leaf rules:
- Value **must not** be a link.
- Leaf write reuses `check.pub` flow (pack/sign/verify/unpack), with shard-specific guard:
  - verified payload must equal leaf pub.
- Cert path is disabled for shard leaf flow (`nocert`).

---

## Authenticator support

Shard leaf writes support the same authenticator style as user graph writes:
- Pair object authenticator.
- External function authenticator (e.g. nested `SEA.sign` or WebAuthn adapter).

### Pair authenticator example

```javascript
const pair = await SEA.pair();
const chunks = pair.pub.match(/.{1,2}/g) || [];
const key = chunks.pop();
const soul = chunks.length ? '~/' + chunks.join('/') : '~';

gun.get(soul).get(key).put(pair.pub, null, {
  opt: { authenticator: pair }
});
```

### Function authenticator example

```javascript
const pair = await SEA.pair();
const auth = async (data) => SEA.sign(data, pair);

const chunks = pair.pub.match(/.{1,2}/g) || [];
const key = chunks.pop();
const soul = chunks.length ? '~/' + chunks.join('/') : '~';

gun.get(soul).get(key).put(pair.pub, null, {
  opt: { authenticator: auth }
});
```

---

## Pass/fail examples

### Pass

- Intermediate:
  - soul: `~`
  - key: `ab`
  - val: `{"#":"~/ab"}`

- Leaf:
  - soul + key reconstruct valid pub
  - val is signed payload resolving to exactly that pub

### Fail

- `Invalid shard soul path.`
  - `~/ab//cd`
  - `~/ab/cd/`

- `Invalid shard key.`
  - key length not in `1..2`

- `Invalid shard depth.`
  - path depth over max

- `Shard intermediate value must be link.`
  - intermediate val is scalar/object non-link

- `Invalid shard link target.`
  - intermediate link points to wrong child soul

- `Shard leaf cannot be link.`
  - leaf val is relation link

- `Shard leaf payload must equal pub.`
  - verified payload does not match reconstructed pub

---

## Canonicalization / graphify note

Recommended leaf input contract:
- Use scalar pub payload flow (signed through SEA pipeline at put time).
- Avoid object-shaped leaf payloads.

Reason:
- Object-shaped values may be graphified into links by GUN, which violates leaf rule (`leaf cannot be link`).

---

## Test coverage

Current SEA tests include shard checks for:
- valid/invalid intermediate links
- key/depth/path validation
- leaf link rejection
- leaf writes with pair authenticator
- leaf writes with external function authenticator

Run:

```bash
npm run buildSea
npm run testSea
```
