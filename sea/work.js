;(function(){

    var SEA = require('./root');
    var shim = require('./shim');
    var S = require('./settings');
    var sha = require('./sha256');
    var u;

    SEA.work = SEA.work || async function(data, pair, cb, opt) {
      try {
        var salt = (pair || {}).epub || pair;
        opt = opt || {};
        if (salt instanceof Function) {
          cb = salt;
          salt = undefined;
        }
        data = (typeof data === 'string') ? data : await shim.stringify(data);

        if ('sha' === (opt.name || '').slice(0, 3).toLowerCase()) {
          var rsha = shim.Buffer.from(await sha(data, opt.name), 'binary').toString(opt.encode || 'base64');
          if (cb) try { cb(rsha) } catch (e) { console.log(e); }
          return rsha;
        }

        salt = salt || shim.random(9);
        var key = await (shim.ossl || shim.subtle).importKey('raw', new shim.TextEncoder().encode(data), { name: opt.name || 'PBKDF2' }, false, ['deriveBits']);
        var work = await (shim.ossl || shim.subtle).deriveBits({
          name: opt.name || 'PBKDF2',
          iterations: opt.iterations || S.pbkdf2.iter,
          salt: new shim.TextEncoder().encode(opt.salt || salt),
          hash: opt.hash || S.pbkdf2.hash,
        }, key, opt.length || (S.pbkdf2.ks * 8));

        data = shim.random(data.length); // Clear data in case of passphrase
        var r = shim.Buffer.from(work, 'binary').toString(opt.encode || 'base64');

        if (cb) try { cb(r) } catch (e) { console.log(e); }
        return r;
      } catch (e) {
        console.log(e);
        SEA.err = e;
        if (SEA.throw) throw e;
        if (cb) cb();
      }
    };    

    module.exports = SEA.work;
  
}());