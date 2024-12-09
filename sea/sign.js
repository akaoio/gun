;(function(){

    var SEA = require('./root');
    var shim = require('./shim');
    var S = require('./settings');
    var sha = require('./sha256');
    var u;

    SEA.sign = function(data, pair, cb, opt) {
      return new Promise(function(resolve) {
        try {
          opt = opt || {};

          if (u === data) { 
            throw '`undefined` not allowed.';
          }

          function checkPair() {
            if (!(pair || opt).priv) {
              if (!SEA.I) { 
                throw 'No signing key.';
              }
              return SEA.I(null, { what: data, how: 'sign', why: opt.why })
              .then(function(key) {
                pair = key;
                return processData();
              });
            }
            return processData();
          }

          function processData() {
            return S.parse(data).then(function(json) {
              var check = opt.check = opt.check || json;

              if (SEA.verify && (SEA.opt.check(check) || (check && check.s && check.m))) {
                return SEA.verify(check, pair).then(function(ok) {
                  if (u === ok) {
                    return sign(json);
                  }
                  return S.parse(check).then(function(r) {
                    if (!opt.raw) {
                      return shim.stringify(r).then(function(r) {
                        return finish('SEA' + r);
                      });
                    }
                    return finish(r);
                  });
                });
              }
              return sign(json);
            });
          }

          function sign(json) {
            return sha(json).then(function(hash) {
              var jwk = S.jwk(pair.pub, pair.priv);
              return (shim.ossl || shim.subtle).importKey('jwk', jwk, {
                name: 'ECDSA',
                namedCurve: 'P-256'
              }, false, ['sign'])
              .then(function(key) {
                return (shim.ossl || shim.subtle).sign({
                  name: 'ECDSA',
                  hash: { name: 'SHA-256' }
                }, key, new Uint8Array(hash));
              })
              .then(function(sig) {
                var r = {
                  m: json,
                  s: shim.Buffer.from(sig, 'binary').toString(opt.encode || 'base64')
                };
                if (!opt.raw) {
                  return shim.stringify(r).then(function(r) {
                    return finish('SEA' + r);
                  });
                }
                return finish(r);
              });
            });
          }

          function finish(r) {
            if (cb) {
              try {
                cb(r);
              } catch(e) {
                console.log(e);
              }
            }
            return resolve(r);
          }

          checkPair();

        } catch(e) {
          console.log(e);
          SEA.err = e;
          if (SEA.throw) {
            throw e;
          }
          if (cb) {
            cb();
          }
          resolve();
        }
      });
    };

    module.exports = SEA.sign;
  
}());
