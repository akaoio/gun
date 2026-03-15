;(function(){

    var SEA = require('./root');
    var shim = require('./shim');

    // Base62 alphabet: digits → uppercase → lowercase (62 chars, a-zA-Z0-9 only)
    var ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    var ALPHA_MAP = {};
    for (var i = 0; i < ALPHA.length; i++) { ALPHA_MAP[ALPHA[i]] = i; }

    // Fixed output length for a 256-bit (32-byte) value in base62
    // 62^44 > 2^256 ✓
    var PUB_LEN = 44;

    // BigInt → base62 string, zero-padded to PUB_LEN (44 chars)
    function biToB62(n) {
        if (typeof n !== 'bigint' || n < 0n) {
            throw new Error('biToB62: input must be non-negative BigInt');
        }
        var s = '';
        var v = n;
        while (v > 0n) {
            s = ALPHA[Number(v % 62n)] + s;
            v = v / 62n;
        }
        while (s.length < PUB_LEN) { s = '0' + s; }
        if (s.length > PUB_LEN) {
            throw new Error('biToB62: value too large for ' + PUB_LEN + '-char base62');
        }
        return s;
    }

    // base62 string → BigInt (accepts exactly PUB_LEN chars)
    function b62ToBI(s) {
        if (typeof s !== 'string' || s.length !== PUB_LEN) {
            throw new Error('b62ToBI: expected ' + PUB_LEN + '-char base62 string, got ' + (s && s.length));
        }
        if (!/^[A-Za-z0-9]+$/.test(s)) {
            throw new Error('b62ToBI: invalid base62 characters');
        }
        var n = 0n;
        for (var i = 0; i < s.length; i++) {
            var c = ALPHA_MAP[s[i]];
            if (c === undefined) { throw new Error('b62ToBI: unknown char ' + s[i]); }
            n = n * 62n + BigInt(c);
        }
        return n;
    }

    // base64url string (43 chars, from JWK) → base62 (44 chars)
    function b64ToB62(s) {
        if (typeof s !== 'string' || !s) {
            throw new Error('b64ToB62: input must be non-empty string');
        }
        var hex = shim.Buffer.from(atob(s), 'binary').toString('hex');
        var n = BigInt('0x' + (hex || '0'));
        return biToB62(n);
    }

    // base62 (44 chars) → base64url string (for JWK)
    function b62ToB64(s) {
        var n = b62ToBI(s);
        var hex = n.toString(16).padStart(64, '0');
        var b64 = shim.Buffer.from(hex, 'hex').toString('base64')
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        return b64;
    }

    // Parse pub (old or new format) → { x, y } as base64url strings (for JWK importKey)
    // Old format: [43 base64url].[43 base64url]  length=87
    // New format: [44 base62][44 base62]          length=88
    function pubToJwkXY(pub) {
        if (typeof pub !== 'string') {
            throw new Error('pubToJwkXY: pub must be a string');
        }
        if (pub.length === 87 && pub[43] === '.') {
            // Old base64url format
            var parts = pub.split('.');
            if (parts.length !== 2) { throw new Error('pubToJwkXY: invalid old pub format'); }
            return { x: parts[0], y: parts[1] };
        }
        if (pub.length === 88 && /^[A-Za-z0-9]{88}$/.test(pub)) {
            // New base62 format
            return {
                x: b62ToB64(pub.slice(0, 44)),
                y: b62ToB64(pub.slice(44))
            };
        }
        throw new Error('pubToJwkXY: unrecognised pub format (length=' + pub.length + ')');
    }

    // Encode arbitrary Buffer/Uint8Array as base62: chunks into 32-byte blocks, each → 44 chars
    // e.g. SHA-256 (32B) → 44 chars, PBKDF2 (64B) → 88 chars
    function bufToB62(buf) {
        var out = '';
        for (var i = 0; i < buf.length; i += 32) {
            var end = Math.min(i + 32, buf.length);
            var hex = '';
            // left-pad short last chunk to 32 bytes
            for (var p = 0; p < 32 - (end - i); p++) { hex += '00'; }
            for (var j = i; j < end; j++) {
                hex += ('0' + buf[j].toString(16)).slice(-2);
            }
            out += biToB62(BigInt('0x' + hex));
        }
        return out;
    }

    var b62 = { biToB62: biToB62, b62ToBI: b62ToBI, b64ToB62: b64ToB62, b62ToB64: b62ToB64, pubToJwkXY: pubToJwkXY, bufToB62: bufToB62, PUB_LEN: PUB_LEN };
    SEA.base62 = b62;
    module.exports = b62;
  
}());