;(function(){

    var SEA = require('./root');
    var shim = require('./shim');
    var S = require('./settings');
    var sha = require('./sha256');
    var u;

    SEA.verify = SEA.verify || (async (data, pair, cb, opt) => {
      try {
        var json = await S.parse(data);

        // If verification is skipped (pair is false), directly parse and return the message
        if (false === pair) {
          var raw = await S.parse(json.m);
          if (cb) { 
            try { 
              cb(raw); 
            } catch (e) { 
              console.log(e); 
            } 
          }
          return raw;
        }

        opt = opt || {};

        // Get the public key
        var pub = pair.pub || pair;
        var key;

        // Import the public key using slow_leak or use a more direct method
        if (SEA.opt.slow_leak) {
          key = await SEA.opt.slow_leak(pub);
        } else {
          key = await (shim.ossl || shim.subtle).importKey(
            'jwk', 
            S.jwk(pub), 
            { name: 'ECDSA', namedCurve: 'P-256' },
            false, 
            ['verify']
          );
        }

        // Compute the hash of the message
        var hash = await sha(json.m);

        // Initialize variables for the signature and verification
        var buf, sig, check;
        try {
          // Decode the signature and verify it using ECDSA
          buf = shim.Buffer.from(json.s, opt.encode || 'base64');
          sig = new Uint8Array(buf);
          check = await (shim.ossl || shim.subtle).verify(
            { name: 'ECDSA', hash: { name: 'SHA-256' } },
            key, 
            sig, 
            new Uint8Array(hash)
          );
          if (!check) throw "Signature did not match.";
        } catch (e) {
          // If verification fails and fallback is enabled, try the fallback method
          if (SEA.opt.fallback) {
            return await SEA.opt.fall_verify(data, pair, cb, opt);
          }
        }

        // If signature verification succeeds, parse the message
        var r = check ? await S.parse(json.m) : undefined;

        // If a callback is provided, execute it with the result
        if (cb) { 
          try { 
            cb(r); 
          } catch (e) { 
            console.log(e); 
          }
        }

        return r;
      } catch (e) {
        console.log(e); // Error handling (e.g., mismatched owner)
        SEA.err = e;
        if (SEA.throw) { throw e; }
        if (cb) { cb(); }
        return;
      }
    });    

    module.exports = SEA.verify;
    // legacy & ossl memory leak mitigation:

    var knownKeys = {};
    var keyForPair = SEA.opt.slow_leak = pair => {
      if (knownKeys[pair]) return knownKeys[pair];
      var jwk = S.jwk(pair);
      knownKeys[pair] = (shim.ossl || shim.subtle).importKey("jwk", jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ["verify"]);
      return knownKeys[pair];
    };

    var O = SEA.opt;
    SEA.opt.fall_verify = async function (data, pair, cb, opt, f) {
      if (f === SEA.opt.fallback) { throw "Signature did not match"; }
      f = f || 1;

      // Default to empty string if data is not provided
      var tmp = data || '';
      data = SEA.opt.unpack(data) || data;

      var json = await S.parse(data);
      var pub = pair.pub || pair;
      var key = await SEA.opt.slow_leak(pub);

      // Compatibility handling for old versions
      var hash;
      try {
        hash = (f <= SEA.opt.fallback)
          ? shim.Buffer.from(await shim.subtle.digest({ name: 'SHA-256' }, new shim.TextEncoder().encode(await S.parse(json.m))))
          : await sha(json.m);
      } catch (error) {
        console.log("Error calculating hash:", error);
        throw "Hash calculation failed";
      }

      // Verify the signature
      var buf;
      var sig;
      var check;
      try {
        buf = shim.Buffer.from(json.s, opt.encode || 'base64'); // NEW DEFAULT
        sig = new Uint8Array(buf);
        check = await (shim.ossl || shim.subtle).verify(
          { name: 'ECDSA', hash: { name: 'SHA-256' } },
          key, sig, new Uint8Array(hash)
        );

        if (!check) throw "Signature did not match.";
      } catch (e) {
        try {
          // Auto fallback for old UTF8 encoded data
          buf = shim.Buffer.from(json.s, 'utf8');
          sig = new Uint8Array(buf);
          check = await (shim.ossl || shim.subtle).verify(
            { name: 'ECDSA', hash: { name: 'SHA-256' } },
            key, sig, new Uint8Array(hash)
          );
        } catch (e) {
          if (!check) throw "Signature did not match.";
        }
      }

      // Parse the original message if the signature matches
      var r = check ? await S.parse(json.m) : undefined;

      // Storing additional metadata for fallback purposes
      O.fall_soul = tmp['#'];
      O.fall_key = tmp['.'];
      O.fall_val = data;
      O.fall_state = tmp['>'];

      // Callback handling
      if (cb) {
        try {
          cb(r);
        } catch (e) {
          console.log(e);
        }
      }

      return r;
    };

    SEA.opt.fallback = 2;
  
}());