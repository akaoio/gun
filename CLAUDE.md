# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GUN is a realtime, decentralized, offline-first, graph data synchronization engine. It's an ecosystem of tools for building community-run and encrypted P2P applications.

## Core Architecture

GUN is built as a modular system with the following structure:

### Entry Points
- `index.js` - Server/Node.js entry point, loads lib/server.js
- `gun.js` - Browser build with all core modules bundled  
- `browser.js` - Browser-specific entry point
- `sea.js` - Security, Encryption, Authorization module

### Core Modules (`src/`)
- `root.js` - Core GUN constructor and base functionality
- `core.js` - Core graph operations
- `mesh.js` - Peer-to-peer networking layer
- `websocket.js` - WebSocket transport
- `on.js` - Real-time subscriptions
- `map.js` - Map/reduce operations
- `set.js` - Set operations for unordered lists

### Storage Adapters (`lib/`)
- `rfs.js` - File system storage (Node.js)
- `rs3.js` - AWS S3 storage adapter
- `radisk.js` - RAD disk storage engine
- `rindexed.js` - IndexedDB storage (browser)

### Key Libraries
- `axe.js` - Automatic peering and DHT clustering
- `sea/` - Cryptographic operations and user authentication
- `lib/webrtc.js` - WebRTC peer connections

## Development Commands

```bash
# Install dependencies
npm install

# Start development server with examples
npm start

# Run with HTTPS
npm run https

# Run tests (requires mocha installed globally)
npm install -g mocha
npm test

# Run SEA tests specifically
npm run testSea

# Build browser bundles
npm run unbuild      # Build gun.js and gun.min.js
npm run unbuildSea   # Build sea.js

# Docker
npm run docker       # Build Docker image

# Clean test data
rm -rf *data* *radata*
```

## Testing

Tests use Mocha. Before running tests again, clean the data directories as tests write persistent data:
```bash
rm -rf *data* *radata*
npm test
```

For performance and stress testing:
- Check `test/panic/` directory for various stress tests
- PANIC tests include holy-grail, scale, latency tests

## Project Structure

- `/src` - Core GUN modules
- `/lib` - Storage adapters and utilities
- `/sea` - Cryptographic and user authentication modules
- `/examples` - Usage examples for various frameworks
- `/test` - Test suites
- `/types` - TypeScript definitions

## Key Implementation Notes

- GUN uses a CRDT-based conflict resolution algorithm
- The graph structure allows circular references
- Data synchronization is automatic and real-time across peers
- Storage is pluggable with adapters for file system, S3, IndexedDB, etc.
- WebSocket is the primary transport, with WebRTC as an option

## Working with GUN

When modifying GUN:
1. Core logic is in `/src` - modifications here affect all builds
2. Run `npm run unbuild` after changes to regenerate browser builds
3. Test changes with both Node.js and browser environments
4. The codebase uses a custom module system (USE function) for bundling