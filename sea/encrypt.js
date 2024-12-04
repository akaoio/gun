;(function(){

    var SEA = require('./root');
    var shim = require('./shim');
    var S = require('./settings');
    var aeskey = require('./aeskey');
    var u;

    SEA.encrypt = SEA.encrypt || (async (data, pair, cb, opt) => {
      try {
        opt = opt || {};
        var key = (pair || opt).epriv || pair;

        if (u === data) throw '`undefined` not allowed.';

        if (!key) {
          if (!SEA.I) throw 'No encryption key.';
          pair = await SEA.I(null, { what: data, how: 'encrypt', why: opt.why });
          key = pair.epriv || pair;
        }

        var msg = typeof data === 'string' ? data : await shim.stringify(data);
        var rand = { s: shim.random(9), iv: shim.random(15) };

        var ct = await aeskey(key, rand.s, opt).then((aes) => 
          (shim.subtle || shim.ossl).encrypt({
            name: opt.name || 'AES-GCM', 
            iv: new Uint8Array(rand.iv)
          }, aes, new shim.TextEncoder().encode(msg))
        );

        var r = {
          ct: shim.Buffer.from(ct, 'binary').toString(opt.encode || 'base64'),
          iv: rand.iv.toString(opt.encode || 'base64'),
          s: rand.s.toString(opt.encode || 'base64')
        };

        if (!opt.raw) r = 'SEA' + await shim.stringify(r);

        if (cb) { try { cb(r) } catch (e) { console.log(e) } }
        return r;
      } catch (e) {
        console.log(e);
        SEA.err = e;
        if (SEA.throw) { throw e }
        if (cb) { cb() }
        return;
      }
    });

    module.exports = SEA.encrypt;
  
}());