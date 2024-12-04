;(function(){

    var SEA = require('./root');
    var shim = require('./shim');
    var S = require('./settings');
    var sha = require('./sha256');
    var u;

    SEA.sign = SEA.sign || (async (data, pair, cb, opt) => {
      try {
        // Ensure options are initialized
        opt = opt || {};

        // Check if the private key is available, if not, retrieve it
        if (!(pair || opt).priv) {
          if (!SEA.I) { throw 'No signing key.' }
          pair = await SEA.I(null, { what: data, how: 'sign', why: opt.why });
        }

        // Validate the data
        if (u === data) { throw '`undefined` not allowed.' }

        // Parse the data
        var json = await S.parse(data);

        // Set the check option, defaulting to the parsed data
        var check = opt.check = opt.check || json;

        // If the data is already signed, return the signed data
        if (SEA.verify && (SEA.opt.check(check) || (check && check.s && check.m))
          && u !== await SEA.verify(check, pair)) {
          var r = await S.parse(check);
          if (!opt.raw) { r = 'SEA' + await shim.stringify(r); }
          if (cb) { 
            try { 
              cb(r); 
            } catch (e) { 
              console.log(e); 
            } 
          }
          return r;
        }

        // Prepare the public and private keys
        var pub = pair.pub;
        var priv = pair.priv;
        var jwk = S.jwk(pub, priv);

        // Hash the data and sign it
        var hash = await sha(json);
        var sig = await (shim.ossl || shim.subtle).importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
          .then((key) => (shim.ossl || shim.subtle).sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, key, new Uint8Array(hash)));

        // Create the result object
        var r = { m: json, s: shim.Buffer.from(sig, 'binary').toString(opt.encode || 'base64') };
        if (!opt.raw) { r = 'SEA' + await shim.stringify(r); }

        // Execute the callback if provided
        if (cb) { 
          try { 
            cb(r); 
          } catch (e) { 
            console.log(e); 
          } 
        }

        return r;
      } catch (e) {
        console.log(e);
        SEA.err = e;
        if (SEA.throw) { throw e; }
        if (cb) { cb(); }
        return;
      }
    });    

    module.exports = SEA.sign;
  
}());