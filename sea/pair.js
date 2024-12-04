;(function(){

    var SEA = require('./root');
    var shim = require('./shim');
    var S = require('./settings');

    SEA.name = SEA.name || (async (cb, opt) => {
      try {
        if (cb) { try { cb() } catch (e) { console.log(e) } }
        return;
      } catch (e) {
        console.log(e);
        SEA.err = e;
        if (SEA.throw) { throw e }
        if (cb) { cb() }
        return;
      }
    });

    SEA.pair = SEA.pair || async function(cb, opt) {
      try {
        var ecdhSubtle = shim.ossl || shim.subtle;
        var r = {};

        if (opt && opt.seed) {
          var encoder = new shim.TextEncoder();
          var toBase64Url = buffer =>
            shim.Buffer.from(buffer).toString('base64')
              .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

          var signPriv = toBase64Url(new Uint8Array(await shim.subtle.digest('SHA-256', encoder.encode(opt.seed + '-sign')))).slice(0, 43);
          var encryptPriv = toBase64Url(new Uint8Array(await shim.subtle.digest('SHA-256', encoder.encode(opt.seed + '-encrypt')))).slice(0, 43);
          var signPubX = toBase64Url(await shim.subtle.digest('SHA-256', encoder.encode(signPriv + '-x'))).slice(0, 43);
          var signPubY = toBase64Url(await shim.subtle.digest('SHA-256', encoder.encode(signPriv + '-y'))).slice(0, 43);
          var encryptPubX = toBase64Url(await shim.subtle.digest('SHA-256', encoder.encode(encryptPriv + '-x'))).slice(0, 43);
          var encryptPubY = toBase64Url(await shim.subtle.digest('SHA-256', encoder.encode(encryptPriv + '-y'))).slice(0, 43);

          r = { pub: signPubX + '.' + signPubY, priv: signPriv, epub: encryptPubX + '.' + encryptPubY, epriv: encryptPriv };
        } else {
          var sa = await shim.subtle.generateKey(
            { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
          ).then(async (keys) => {
            var pub = await shim.subtle.exportKey('jwk', keys.publicKey);
            return { pub: pub.x + '.' + pub.y, priv: (await shim.subtle.exportKey('jwk', keys.privateKey)).d };
          });

          try {
            var dh = await ecdhSubtle.generateKey(
              { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']
            ).then(async (keys) => {
              var pub = await ecdhSubtle.exportKey('jwk', keys.publicKey);
              return { epub: pub.x + '.' + pub.y, epriv: (await ecdhSubtle.exportKey('jwk', keys.privateKey)).d };
            });
            r = { pub: sa.pub, priv: sa.priv, epub: dh.epub, epriv: dh.epriv };
          } catch (e) {
            console.log('ECDH not supported or error:', e);
          }
        }

        if (cb) cb(r);
        return r;
      } catch (e) {
        console.log(e);
        SEA.err = e;
        if (SEA.throw) throw e;
        if (cb) cb();
      }
    };

    module.exports = SEA.pair;
  
}());