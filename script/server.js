#!/usr/bin/env node

// Custom GUN server with flexible HTTPS port support
// Usage: node script/server.js [port]

'use strict';

// Security: Validate Node.js version
const nodeVersion = process.versions.node.split('.').map(Number);
if (nodeVersion[0] < 14) {
    console.error('ERROR: Node.js 14+ required. Current version:', process.version);
    process.exit(1);
}

// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully');
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

const cluster = require('cluster');
if(cluster.isMaster){
    console.log(`Master process ${process.pid} starting...`);
    
    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
        
        // Don't restart on configuration errors (exit code 1)
        if (code === 1) {
            console.error('Worker died due to configuration error, not restarting');
            process.exit(1);
        }
        
        // Restart worker unless it's an intentional shutdown
        if (code !== 0 && !worker.exitedAfterDisconnect) {
            console.log('Restarting worker...');
            cluster.fork();
        }
    });
    
    const worker = cluster.fork();
    
    // Handle graceful shutdown
    process.on('SIGTERM', () => {
        console.log('Master received SIGTERM, shutting down workers...');
        worker.disconnect();
        setTimeout(() => {
            worker.kill();
        }, 5000);
    });
    
    return;
}

const fs = require('fs');
const path = require('path');
const env = process.env;

// Input validation functions
function validatePort(port) {
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        throw new Error(`Invalid port: ${port}. Must be between 1-65535`);
    }
    return portNum;
}

function validateFilePath(filePath) {
    // Security: Prevent path traversal
    if (filePath.includes('../') || filePath.includes('..\\')) {
        throw new Error(`Path traversal detected: ${filePath}`);
    }
    
    // Ensure absolute path for security files
    if (!path.isAbsolute(filePath)) {
        throw new Error(`Absolute path required for security files: ${filePath}`);
    }
    
    return filePath;
}

function validatePeers(peers) {
    if (!peers) return [];
    
    return peers.split(',').map(peer => {
        const trimmed = peer.trim();
        // Basic URL validation
        if (!/^https?:\/\/[\w.-]+([:\/].*)?$/i.test(trimmed)) {
            throw new Error(`Invalid peer URL: ${trimmed}`);
        }
        return trimmed;
    });
}

// Validate and sanitize inputs
let port, httpsPort, peers;
try {
    port = validatePort(env.PORT || process.argv[2] || 8765);
    httpsPort = env.HTTPS_PORT ? validatePort(env.HTTPS_PORT) : null;
    peers = validatePeers(env.PEERS);
} catch (err) {
    console.error('Configuration Error:', err.message);
    process.exit(1);
}

const opt = {
    port: port,
    peers: peers
};

// Load GUN with error handling
let GUN;
try {
    GUN = require('../');
} catch (err) {
    console.error('Failed to load GUN:', err.message);
    console.error('Make sure you are running this from the GUN project directory');
    process.exit(1);
}

// Check for SSL certificates with validation
const homeDir = require('os').homedir();
const defaultKeyFile = path.join(homeDir, 'key.pem');
const defaultCertFile = path.join(homeDir, 'cert.pem');

// Validate SSL file paths if provided
if (env.HTTPS_KEY) {
    try {
        env.HTTPS_KEY = validateFilePath(env.HTTPS_KEY);
    } catch (err) {
        console.error('HTTPS_KEY validation failed:', err.message);
        process.exit(1);
    }
}

if (env.HTTPS_CERT) {
    try {
        env.HTTPS_CERT = validateFilePath(env.HTTPS_CERT);
    } catch (err) {
        console.error('HTTPS_CERT validation failed:', err.message);
        process.exit(1);
    }
}

// Set defaults if certificates exist
if (fs.existsSync(defaultCertFile)) {
    env.HTTPS_KEY = env.HTTPS_KEY || defaultKeyFile;
    env.HTTPS_CERT = env.HTTPS_CERT || defaultCertFile;
}

// Configure HTTPS server with enhanced security
if(env.HTTPS_KEY && fs.existsSync(env.HTTPS_KEY) && fs.existsSync(env.HTTPS_CERT)){
    // Use validated HTTPS port
    const actualHttpsPort = httpsPort || opt.port || 443;
    const httpPort = env.HTTP_PORT ? validatePort(env.HTTP_PORT) : 80;
    
    console.log('SSL certificates found, enabling HTTPS...');
    
    // Read and validate certificate files
    let keyData, certData;
    try {
        keyData = fs.readFileSync(env.HTTPS_KEY, 'utf8');
        certData = fs.readFileSync(env.HTTPS_CERT, 'utf8');
        
        // Basic certificate validation
        if (!keyData.includes('BEGIN') || !keyData.includes('PRIVATE KEY')) {
            throw new Error('Invalid private key format');
        }
        if (!certData.includes('BEGIN CERTIFICATE')) {
            throw new Error('Invalid certificate format');
        }
        
        opt.key = keyData;
        opt.cert = certData;
        
    } catch (err) {
        console.error('SSL Certificate Error:', err.message);
        process.exit(1);
    }
    opt.server = require('https').createServer(opt, GUN.serve(__dirname));
    
    // Create HTTP redirect server only if:
    // 1. Using standard port 443, OR
    // 2. HTTP_REDIRECT environment variable is set to true
    if(httpsPort == 443 || env.HTTP_REDIRECT === 'true'){
        try {
            require('http').createServer(function(req, res){
                const redirectUrl = `https://${req.headers['host'].replace(':' + httpPort, ':' + httpsPort)}${req.url}`;
                res.writeHead(301, {"Location": redirectUrl});
                res.end();
            }).listen(httpPort);
            console.log(`HTTP redirect server started on port ${httpPort} -> HTTPS ${httpsPort}`);
        } catch(e) {
            console.log(`Warning: Could not start HTTP redirect server on port ${httpPort}: ${e.message}`);
        }
    }
    
    opt.port = httpsPort;
    console.log(`HTTPS server will start on port ${httpsPort}`);
} else {
    // HTTP only
    opt.server = require('http').createServer(GUN.serve(__dirname));
    console.log(`HTTP server will start on port ${opt.port}`);
}

// Start GUN
const gun = GUN({web: opt.server.listen(opt.port), peers: opt.peers});
console.log(`Relay peer started on port ${opt.port} with /gun`);

module.exports = gun;