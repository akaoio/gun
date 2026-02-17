# Hashgraph Layer on GunDB (Draft)

## Overview

This document sketches a **Hashgraph-inspired consensus/event layer** built on top of GunDB + SEA.
The goal is to keep Gun's realtime graph sync model while adding:

- deterministic event ordering for contract/runtime execution,
- stronger finality semantics for financial/accounting use cases,
- cryptographic auditability of event ancestry and votes.

This is a **discussion draft** for future iterations.

## Goals

- Keep compatibility with Gun's graph-first replication model.
- Reuse SEA signing and verification flows already used in `~pub` data.
- Use compact symbolic keys consistent with SEA conventions (`~`, `#`, `.`, `:`, `>`, `+`, `*`).
- Reserve `!` prefix for protocol/system namespaces (not user business data).
- Support browser and Node peers with role differences only by capability (validator, observer, relay).

## Non-goals (for first phase)

- Replacing HAM globally.
- Building a full EVM-equivalent VM.
- Introducing chain-only data model constraints.

## Layered Architecture

1. **Transport/Gossip Layer (existing Gun mesh)**
   - Event propagation, anti-entropy, peer discovery.
2. **Event DAG Layer (`!hg/...`)**
   - Immutable events with parent references and metadata.
3. **Voting/Finality Layer**
   - Validator attestations, round/epoch checkpoints, finality rules.
4. **Execution Layer (future)**
   - Deterministic state transition from finalized event stream.

## Namespace & Keying Conventions

Protocol data uses `!`-prefixed souls, for example:

- `!hg/e/<eventId>`: event node
- `!hg/v/<eventId>/<validatorPub>`: vote/attestation
- `!hg/r/<roundId>`: round metadata
- `!hg/f/<epochId>`: finalized checkpoint
- `!hg/s/<shardOrScope>`: summary/state commitments

Use SEA-style symbolic field keys where possible:

- `#`: id/link/hash anchor
- `.`: field/key selector context
- `:`: value payload
- `>`: state/time marker
- `~`: signature marker / signer identity context
- `+`: certificate payload (optional delegated authority)
- `*`: submitter/actor pub (when needed)

Avoid `$` as persisted protocol graph key to prevent ambiguity with runtime/internal metadata.

## Event Model (Draft)

Each hashgraph event stores:

- creator pub,
- parent references (self-parent + other-parent),
- logical/physical time hints,
- payload hash or payload link,
- signature.

Example conceptual shape (illustrative):

```javascript
{
  "_": {"#": "!hg/e/<eventId>", ">": {"c": 1730000000000}},
  "c": "<creatorPub>",
  "sp": {"#": "!hg/e/<selfParentId>"},
  "op": {"#": "!hg/e/<otherParentId>"},
  "p#": "<payloadHashSuffixOrFull>",
  "t": 1730000000000,
  "~": "<signature>"
}
```

Notes:

- Field names are intentionally short for storage/bandwidth efficiency.
- Event ID can be content-addressed from canonical event bytes.
- Signature verification is mandatory before event acceptance.

## Canonicalization & Hashing

To avoid cross-platform mismatch:

- Canonical serialize event body (excluding signature field) before hashing.
- Use fixed hash function (`SHA-256`) and clear encoding rules.
- Validate hash fragment when a `#` suffix rule is used.
- Reuse SEA hash verification principles already applied in signed writes.

## Finality Strategy (Draft)

Potential staged approach:

1. **Witness selection per round** (deterministic by prior finalized checkpoint).
2. **Vote graph accumulation** under `!hg/v/...`.
3. **Strong seeing / threshold rule** to mark event final.
4. **Epoch checkpoint** persisted at `!hg/f/<epochId>` with commitment root.

Threshold policy can be configured (e.g., 2/3 weighted stake) and must be encoded as protocol params under `!hg/p/...`.

## Validator Identity & Authorization

- Validator identities are SEA public keys.
- Membership and weights stored in protocol namespace (`!hg/p/validators`).
- Optional delegation via SEA certificates (`+`) with explicit scope and expiry.
- Every vote must bind:
  - validator pub,
  - target event/round,
  - protocol version,
  - signature.

## Conflict & Replay Rules

Reject when:

- signature invalid,
- parent references missing/invalid format,
- duplicate vote by same validator for mutually exclusive outcomes,
- stale epoch writes after finalized checkpoint transition,
- cert expired or scope mismatch.

## Execution Bridge (Future Contract Layer)

Once finality exists, execution reads **finalized ordered events** only:

- input: finalized event stream,
- output: deterministic state diff + commitment,
- storage: commitment roots under `!hg/s/...` and app-level state in app namespace.

This allows contract semantics without requiring full chain replacement.

## Minimal Implementation Plan (MVP)

1. Define canonical event schema and hash/sign rules.
2. Add event ingest + validation module (Node + browser-compatible).
3. Add vote schema + basic threshold finality.
4. Persist finalized checkpoints.
5. Add replay tool to reconstruct finalized order from graph.

## Open Questions for Next Discussion

- Finality algorithm choice: pure hashgraph virtual voting vs simplified BFT overlay?
- Stake weighting model and validator rotation cadence.
- Canonical ordering tie-breakers for same-round finalized events.
- How much protocol metadata should be compacted vs human-readable?
- Should payload live inline, linked, or both depending on size?

## Security Considerations

- Do not trust local clock alone for finality; use protocol round/epoch transitions.
- Keep deterministic logic isolated from non-deterministic APIs.
- Treat certificate parsing and signature verification as consensus-critical code paths.
- Add fuzz/property tests for canonicalization and replay invariants.

## Suggested File/Module Direction (Future)

- `src/hashgraph.js` (core DAG + validation)
- `src/hashgraph-finality.js` (vote/finality)
- `src/hashgraph-order.js` (deterministic ordering/replay)
- `test/hashgraph/*.js` (conformance + adversarial scenarios)

---

Status: **Draft v0** — scope and data model are intentionally compact and discussion-friendly.
