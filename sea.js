;(function(){

  /* UNBUILD */
  function USE(arg, req){
    return req? require(arg) : arg.slice? USE[R(arg)] : function(mod, path){
      arg(mod = {exports: {}});
      USE[R(path)] = mod.exports;
    }
    function R(p){
      return p.split('/').slice(-1).toString().replace('.js','');
    }
  }
  if(typeof module !== "undefined"){ var MODULE = module }
  /* UNBUILD */

  ;USE(function(module){
    // Security, Encryption, and Authorization: SEA.js
    // MANDATORY READING: https://gun.eco/explainers/data/security.html
    // IT IS IMPLEMENTED IN A POLYFILL/SHIM APPROACH.
    // THIS IS AN EARLY ALPHA!

    if (typeof self !== "undefined") { module.window = self } // should be safe for at least browser/worker/nodejs, need to check other envs like RN etc.
    if (typeof window !== "undefined") { module.window = window }

    var tmp = module.window || module, u;
    var SEA = tmp.SEA || {};

    if (SEA.window = module.window) { SEA.window.SEA = SEA }

    try { if (u + '' !== typeof MODULE) { MODULE.exports = SEA } } catch (e) { }
    module.exports = SEA;
  })(USE, './root');

  ;USE(function(module){
    var SEA = USE('./root');
    try {
      if (SEA.window && location.protocol.indexOf('s') < 0 && !/^(localhost|127\.\d+\.\d+\.\d+|blob:|file:|null)$/.test(location.hostname)) {
        console.warn('HTTPS needed for WebCrypto in SEA, redirecting...');
        location.protocol = 'https:'; // WebCrypto does NOT work without HTTPS!
      }      
    } catch (e) { }
  })(USE, './https');

  ;USE(function(module){
    var u;
    if (u + '' == typeof btoa) {
      if (u + '' == typeof Buffer) {
        try { global.Buffer = require("buffer", 1).Buffer } catch (e) { console.log("Please `npm install buffer` or add it to your package.json !") }
      }
      global.btoa = function (data) { return Buffer.from(data, "binary").toString("base64") };
      global.atob = function (data) { return Buffer.from(data, "base64").toString("binary") };
    }
  })(USE, './base64');

  ;USE(function(module){
    USE('./base64');
    // This is Array extended to have .toString(['utf8'|'hex'|'base64'])
    function SeaArray() { }
    Object.assign(SeaArray, { from: Array.from })
    SeaArray.prototype = Object.create(Array.prototype)
    SeaArray.prototype.toString = function (enc = 'utf8', start = 0, end = this.length) {
      var length = this.length;
      var slice = this.slice(start, end);

      switch (enc) {
        case 'hex':
          return Array.from(slice)
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');

        case 'utf8':
          return String.fromCharCode(...slice);

        case 'base64':
          return btoa(String.fromCharCode(...slice));

        default:
          throw new Error('Unsupported encoding: ' + enc);
      }
    };    
    module.exports = SeaArray;
  })(USE, './array');

  ;USE(function(module){
    USE('./base64');
    // This is Buffer implementation used in SEA. Functionality is mostly
    // compatible with NodeJS 'safe-buffer' and is used for encoding conversions
    // between binary and 'hex' | 'utf8' | 'base64'
    // See documentation and validation for safe implementation in:
    // https://github.com/feross/safe-buffer#update
    var SeaArray = USE('./array');
    function SafeBuffer(...props) {
      console.warn('new SafeBuffer() is depreciated, please use SafeBuffer.from()')
      return SafeBuffer.from(...props)
    }
    SafeBuffer.prototype = Object.create(Array.prototype)
    Object.assign(SafeBuffer, {
      // (data, enc) where typeof data === 'string' then enc === 'utf8'|'hex'|'base64'
      from() {
        if (!Object.keys(arguments).length || arguments[0] == null) {
          throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
        }
        var input = arguments[0]
        var buf
        if (typeof input === 'string') {
          var enc = arguments[1] || 'utf8';

          switch (enc) {
            case 'hex':
              var bytes = (input.match(/([\da-fA-F]{2})/g) || []).map(byte => parseInt(byte, 16));
              if (!bytes.length) throw new TypeError('Invalid first argument for type \'hex\'.');
              buf = SeaArray.from(bytes);
              break;

            case 'utf8':
            case 'binary':
              var words = new Uint16Array(input.length);
              Array.from({ length: input.length }, (_, i) => words[i] = input.charCodeAt(i));
              buf = SeaArray.from(words);
              break;

            case 'base64':
              var dec = atob(input);
              var bytesBase64 = new Uint8Array(dec.length);
              Array.from({ length: dec.length }, (_, i) => bytesBase64[i] = dec.charCodeAt(i));
              buf = SeaArray.from(bytesBase64);
              break;

            default:
              console.info('SafeBuffer.from unknown encoding:', enc);
          }

          return buf;
        }        
        var byteLength = input.byteLength // what is going on here? FOR MARTTI
        var length = input.byteLength ? input.byteLength : input.length
        if (length) {
          var buf
          if (input instanceof ArrayBuffer) {
            buf = new Uint8Array(input)
          }
          return SeaArray.from(buf || input)
        }
      },
      // This is 'safe-buffer.alloc' sans encoding support
      alloc(length, fill = 0 /*, enc*/) {
        return SeaArray.from(new Uint8Array(Array.from({ length: length }, () => fill)))
      },
      // This is normal UNSAFE 'buffer.alloc' or 'new Buffer(length)' - don't use!
      allocUnsafe(length) {
        return SeaArray.from(new Uint8Array(Array.from({ length: length })))
      },
      // This puts together array of array like members
      concat(arr) { // octet array
        if (!Array.isArray(arr)) {
          throw new TypeError('First argument must be Array containing ArrayBuffer or Uint8Array instances.')
        }
        return SeaArray.from(arr.reduce((ret, item) => ret.concat(Array.from(item)), []))
      }
    })
    SafeBuffer.prototype.from = SafeBuffer.from
    SafeBuffer.prototype.toString = SeaArray.prototype.toString

    module.exports = SafeBuffer;
  })(USE, './buffer');

  ;USE(function(module){
    var SEA = USE('./root')
    var api = { Buffer: USE('./buffer') }
    var o = {}, u;

    // ideally we can move away from JSON entirely? unlikely due to compatibility issues... oh well.
    JSON.parseAsync = JSON.parseAsync || function (t, cb, r) { var u; try { cb(u, JSON.parse(t, r)) } catch (e) { cb(e) } }
    JSON.stringifyAsync = JSON.stringifyAsync || function (v, cb, r, s) { var u; try { cb(u, JSON.stringify(v, r, s)) } catch (e) { cb(e) } }

    api.parse = function (t, r) {
      return new Promise(function (res, rej) {
        JSON.parseAsync(t, function (err, raw) { err ? rej(err) : res(raw) }, r);
      })
    }
    api.stringify = function (v, r, s) {
      return new Promise(function (res, rej) {
        JSON.stringifyAsync(v, function (err, raw) { err ? rej(err) : res(raw) }, r, s);
      })
    }

    if (SEA.window) {
      api.crypto = SEA.window.crypto || SEA.window.msCrypto
      api.subtle = (api.crypto || o).subtle || (api.crypto || o).webkitSubtle;
      api.TextEncoder = SEA.window.TextEncoder;
      api.TextDecoder = SEA.window.TextDecoder;
      api.random = (len) => api.Buffer.from(api.crypto.getRandomValues(new Uint8Array(api.Buffer.alloc(len))));
    }
    if (!api.TextDecoder) {
      var { TextEncoder, TextDecoder } = require((u + '' == typeof MODULE ? '.' : '') + './lib/text-encoding', 1);
      api.TextDecoder = TextDecoder;
      api.TextEncoder = TextEncoder;
    }
    if (!api.crypto) {
      try {
        var crypto = require('crypto', 1);
        Object.assign(api, {
          crypto,
          random: (len) => api.Buffer.from(crypto.randomBytes(len))
        });
        var { Crypto: WebCrypto } = require('@peculiar/webcrypto', 1);
        api.ossl = api.subtle = new WebCrypto({ directory: 'ossl' }).subtle // ECDH
      }
      catch (e) {
        console.log("Please `npm install @peculiar/webcrypto` or add it to your package.json !");
      }
    }

    module.exports = api
  })(USE, './shim');

  ;USE(function(module){
    var SEA = USE('./root');
    var shim = USE('./shim');
    var s = {};
    s.pbkdf2 = { hash: { name: 'SHA-256' }, iter: 100000, ks: 64 };
    s.ecdsa = {
      pair: { name: 'ECDSA', namedCurve: 'P-256' },
      sign: { name: 'ECDSA', hash: { name: 'SHA-256' } }
    };
    s.ecdh = { name: 'ECDH', namedCurve: 'P-256' };

    // This creates Web Cryptography API compliant JWK for sign/verify purposes
    s.jwk = function (pub, d) {  // d === priv
      pub = pub.split('.');
      var x = pub[0], y = pub[1];
      var jwk = { kty: "EC", crv: "P-256", x: x, y: y, ext: true };
      jwk.key_ops = d ? ['sign'] : ['verify'];
      if (d) { jwk.d = d }
      return jwk;
    };

    s.keyToJwk = function (keyBytes) {
      var keyB64 = keyBytes.toString('base64');
      var k = keyB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/\=/g, '');
      return { kty: 'oct', k: k, ext: false, alg: 'A256GCM' };
    }

    s.recall = {
      validity: 12 * 60 * 60, // internally in seconds : 12 hours
      hook: function (props) { return props } // { iat, exp, alias, remember } // or return new Promise((resolve, reject) => resolve(props)
    };

    s.check = function (t) { return (typeof t == 'string') && ('SEA{' === t.slice(0, 4)) }
    s.parse = t => Promise.resolve(typeof t == 'string' ? shim.parse('SEA{' === t.slice(0, 4) ? t.slice(3) : t) : t).catch(() => t);

    SEA.opt = s;
    module.exports = s
  })(USE, './settings');

  ;USE(function(module){
    var shim = USE('./shim');
    module.exports = function (d, o) {
      return ((typeof d == 'string') ? Promise.resolve(d) : shim.stringify(d))
        .then(function(t){ return shim.subtle.digest({ name: o || 'SHA-256' }, new shim.TextEncoder().encode(t)) })
        .then(function(hash){ return shim.Buffer.from(hash) });
    }
  })(USE, './sha256');

  ;USE(function(module){
    // This internal func returns SHA-1 hashed data for KeyID generation
    var __shim = USE('./shim')
    var subtle = __shim.subtle
    var ossl = __shim.ossl ? __shim.ossl : subtle
    var sha1hash = (b) => ossl.digest({ name: 'SHA-1' }, new ArrayBuffer(b))
    module.exports = sha1hash
  })(USE, './sha1');

  ;USE(function(module){
    var SEA = USE('./root');
    var shim = USE('./shim');
    var S = USE('./settings');
    var sha = USE('./sha256');
    var u;

    SEA.work = SEA.work || function(data, pair, cb, opt){
      var salt = (pair||{}).epub||pair; opt = opt||{};
      if(salt instanceof Function){cb = salt; salt = u}
      return ((typeof data === 'string')? Promise.resolve(data) : shim.stringify(data))
      .then(function(d){return ('sha' === (opt.name||'').slice(0,3).toLowerCase())?
        sha(d, opt.name).then(function(hash){var r = shim.Buffer.from(hash,'binary').toString(opt.encode||'base64'); if(cb)cb(r); return r}) :
        (salt = salt||shim.random(9), (shim.ossl||shim.subtle).importKey('raw', new shim.TextEncoder().encode(d),
        {name:opt.name||'PBKDF2'}, false, ['deriveBits'])
        .then(function(key){return (shim.ossl||shim.subtle).deriveBits({name:opt.name||'PBKDF2',iterations:opt.iterations||S.pbkdf2.iter,
        salt:new shim.TextEncoder().encode(opt.salt||salt),hash:opt.hash||S.pbkdf2.hash},key,opt.length||(S.pbkdf2.ks*8))})
        .then(function(work){d=shim.random(d.length); var r=shim.Buffer.from(work,'binary').toString(opt.encode||'base64'); if(cb)cb(r); return r}))})
      .catch(function(e){console.log(e); SEA.err=e; if(SEA.throw)throw e; if(cb)cb()});
    };

    module.exports = SEA.work;
  })(USE, './work');

  ;USE(function(module){
    var SEA = USE('./root'), shim = USE('./shim');
    SEA.name = function(cb){ return new Promise(function(r){ cb && cb(); r() }).catch(function(e){ console.log(e); cb && cb() }) };
    SEA.pair = function(cb, opt){
      return new Promise(function(done){
        var r = {}, s = shim.subtle;
        function b64(b){ return shim.Buffer.from(b).toString('base64').replace(/[+/=]/g,function(c){ return ({'+':'-','/':'_','=':''})[c] }) }
        function fin(r){ cb && cb(r); done(r) }
        if(opt && opt.seed){
          var e = new shim.TextEncoder();
          s.digest('SHA-256',e.encode(opt.seed+'-sign')).then(function(h){
            r.priv = b64(new Uint8Array(h)).slice(0,43);
            return Promise.all([s.digest('SHA-256',e.encode(r.priv+'-x')),s.digest('SHA-256',e.encode(r.priv+'-y')),s.digest('SHA-256',e.encode(opt.seed+'-encrypt'))]);
          }).then(function(a){
            r.pub = b64(new Uint8Array(a[0])).slice(0,43)+'.'+b64(new Uint8Array(a[1])).slice(0,43);
            r.epriv = b64(new Uint8Array(a[2])).slice(0,43);
            return Promise.all([s.digest('SHA-256',e.encode(r.epriv+'-x')),s.digest('SHA-256',e.encode(r.epriv+'-y'))]);
          }).then(function(a){
            r.epub = b64(new Uint8Array(a[0])).slice(0,43)+'.'+b64(new Uint8Array(a[1])).slice(0,43);
            fin(r);
          });
          return;
        }
        s.generateKey({name:'ECDSA',namedCurve:'P-256'},1,['sign']).then(function(k){
          return Promise.all([s.exportKey('jwk',k.publicKey),s.exportKey('jwk',k.privateKey)]);
        }).then(function(a){
          r.pub = a[0].x+'.'+a[0].y; r.priv = a[1].d;
          return (shim.ossl||s).generateKey({name:'ECDH',namedCurve:'P-256'},1,['deriveKey']);
        }).then(function(k){
          return Promise.all([s.exportKey('jwk',k.publicKey),s.exportKey('jwk',k.privateKey)]);
        }).then(function(a){
          r.epub = a[0].x+'.'+a[0].y; r.epriv = a[1].d;
          fin(r);
        }).catch(function(e){ console.log(e); fin(r) });
      }).catch(function(e){ console.log(e); cb && cb() });
    };
    module.exports = SEA.pair;
  })(USE, './pair');

  ;USE(function(module){
    var SEA = USE('./root');
    var shim = USE('./shim');
    var S = USE('./settings');
    var sha = USE('./sha256');
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
  })(USE, './sign');

  ;USE(function(module){
    var SEA = USE('./root');
    var shim = USE('./shim');
    var S = USE('./settings');
    var sha = USE('./sha256');
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
  })(USE, './verify');

  ;USE(function(module){
    var shim = USE('./shim');
    var S = USE('./settings');
    var sha256hash = USE('./sha256');

    var importGen = async (key, salt, opt = {}) => {
      // Generate the combination of the key and salt (or random value)
      var combo = key + (salt || shim.random(8)).toString('utf8');

      // Hash the combination using SHA-256
      var hash = shim.Buffer.from(await sha256hash(combo), 'binary');

      // Convert the hash to a JWK key
      var jwkKey = S.keyToJwk(hash);

      // Import the key for AES-GCM encryption/decryption
      return await shim.subtle.importKey('jwk', jwkKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    };    
    module.exports = importGen;
  })(USE, './aeskey');

  ;USE(function(module){
    var SEA = USE('./root');
    var shim = USE('./shim');
    var S = USE('./settings');
    var aeskey = USE('./aeskey');
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
  })(USE, './encrypt');

  ;USE(function(module){
    var SEA = USE('./root');
    var shim = USE('./shim');
    var S = USE('./settings');
    var aeskey = USE('./aeskey');

    SEA.decrypt = SEA.decrypt || (async (data, pair, cb, opt) => {
      try {
        opt = opt || {};
        var key = (pair || opt).epriv || pair;
        if (!key) {
          if (!SEA.I) { throw 'No decryption key.' }
          pair = await SEA.I(null, { what: data, how: 'decrypt', why: opt.why });
          key = pair.epriv || pair;
        }
        var json = await S.parse(data);
        var buf, bufiv, bufct; try {
          buf = shim.Buffer.from(json.s, opt.encode || 'base64');
          bufiv = shim.Buffer.from(json.iv, opt.encode || 'base64');
          bufct = shim.Buffer.from(json.ct, opt.encode || 'base64');
          var ct = await aeskey(key, buf, opt).then((aes) => (/*shim.ossl ||*/ shim.subtle).decrypt({  // Keeping aesKey scope as private as possible...
            name: opt.name || 'AES-GCM', iv: new Uint8Array(bufiv), tagLength: 128
          }, aes, new Uint8Array(bufct)));
        } catch (e) {
          if ('utf8' === opt.encode) { throw "Could not decrypt" }
          if (SEA.opt.fallback) {
            opt.encode = 'utf8';
            return await SEA.decrypt(data, pair, cb, opt);
          }
        }
        var r = await S.parse(new shim.TextDecoder('utf8').decode(ct));
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

    module.exports = SEA.decrypt;
  })(USE, './decrypt');

  ;USE(function(module){
    var SEA = USE('./root');
    var shim = USE('./shim');
    var S = USE('./settings');
    // Derive shared secret from other's pub and my epub/epriv 
    SEA.secret = SEA.secret || (async (key, pair, cb, opt) => {
      try {
        opt = opt || {};
        if (!pair || !pair.epriv || !pair.epub) {
          if (!SEA.I) { throw 'No secret mix.' }
          pair = await SEA.I(null, { what: key, how: 'secret', why: opt.why });
        }
        var pub = key.epub || key;
        var epub = pair.epub;
        var epriv = pair.epriv;
        var ecdhSubtle = shim.ossl || shim.subtle;
        var pubKeyData = keysToEcdhJwk(pub);
        var props = Object.assign({ public: await ecdhSubtle.importKey(...pubKeyData, true, []) }, { name: 'ECDH', namedCurve: 'P-256' }); // Thanks to @sirpy !
        var privKeyData = keysToEcdhJwk(epub, epriv);
        var derived = await ecdhSubtle.importKey(...privKeyData, false, ['deriveBits']).then(async (privKey) => {
          // privateKey scope doesn't leak out from here!
          var derivedBits = await ecdhSubtle.deriveBits(props, privKey, 256);
          var rawBits = new Uint8Array(derivedBits);
          var derivedKey = await ecdhSubtle.importKey('raw', rawBits, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
          return ecdhSubtle.exportKey('jwk', derivedKey).then(({ k }) => k);
        })
        var r = derived;
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

    // can this be replaced with settings.jwk?
    var keysToEcdhJwk = (pub, d) => { // d === priv
      //var [ x, y ] = shim.Buffer.from(pub, 'base64').toString('utf8').split(':') // old
      var [x, y] = pub.split('.') // new
      var jwk = d ? { d: d } : {}
      return [  // Use with spread returned value...
        'jwk',
        Object.assign(
          jwk,
          { x: x, y: y, kty: 'EC', crv: 'P-256', ext: true }
        ), // ??? refactor
        { name: 'ECDH', namedCurve: 'P-256' }
      ]
    }

    module.exports = SEA.secret;
  })(USE, './secret');

  ;USE(function(module){
    var SEA = USE('./root');
    /*
        The Certify Protocol was made out of love by a Vietnamese code enthusiast. Vietnamese people around the world deserve respect!
        IMPORTANT: A Certificate is like a Signature. No one knows who (authority) created/signed a cert until you put it into their graph.
        "certificants": '*' or a String (Bob.pub) || an Object that contains "pub" as a key || an array of [object || string]. These people will have the rights.
        "policy": A string ('inbox'), or a RAD/LEX object {'*': 'inbox'}, or an Array of RAD/LEX objects or strings. RAD/LEX object can contain key "?" with indexOf("*") > -1 to force key equals certificant pub. This rule is used to check against soul+'/'+key using Gun.text.match or String.match.
        "authority": Key pair or priv of the certificate authority.
        "cb": A callback function after all things are done.
        "opt": If opt.expiry (a timestamp) is set, SEA won't sync data after opt.expiry. If opt.block is set, SEA will look for block before syncing.
    */
    SEA.certify = SEA.certify || (async (certs, policy = {}, auth, cb, opt = {}) => {
      try {
        var proc = c => {
          if (!c) return null;
          if (typeof c === 'string' || (Array.isArray(c) && c.includes('*'))) return '*';
          if (typeof c === 'string') return c;
          if (typeof c === 'object' && c.pub) return c.pub;
          if (Array.isArray(c)) {
            if (c.length === 1) return c[0] && (typeof c[0] === 'object' ? c[0].pub : typeof c[0] === 'string' ? c[0] : null);
            return c.reduce((a, c) => { typeof c === 'string' ? a.push(c) : (c || {}).pub && a.push(c.pub); return a; }, []);
          }
          return null;
        };

        var c = proc(certs);
        if (!c) { console.log("No certificant found."); return; }

        var exp = opt.expiry ? parseFloat(opt.expiry) : null;
        var rpol = (policy || {}).read;
        var wpol = (policy || {}).write || (typeof policy === 'string' || Array.isArray(policy) || policy["+"] || policy["#"] || policy["."] || policy["="] || policy["*"] || policy[">"] || policy["<"]) ? policy : null;
        if (!rpol && !wpol) { console.log("No policy found."); return; }

        var blk = opt.block || opt.blacklist || opt.ban || {};
        var rblk = blk.read && (typeof blk.read === 'string' || (blk.read || {})['#']) ? blk.read : null;
        var wblk = typeof blk === 'string' ? blk : (blk.write && (typeof blk.write === 'string' || blk.write['#']) ? blk.write : null);

        var data = {
          c,
          ...(exp && { e: exp }),
          ...(rpol && { r: rpol }),
          ...(wpol && { w: wpol }),
          ...(rblk && { rb: rblk }),
          ...(wblk && { wb: wblk })
        };

        var cert = await SEA.sign(JSON.stringify(data), auth, null, { raw: 1 });
        var r = opt.raw ? cert : 'SEA' + JSON.stringify(cert);
        if (cb) { try { cb(r); } catch (e) { console.log(e); } }
        return r;
      } catch (e) {
        SEA.err = e;
        if (SEA.throw) throw e;
        if (cb) cb();
        return;
      }
    });
    module.exports = SEA.certify;
  })(USE, './certify');

  ;USE(function(module){
    var shim = USE('./shim');
    // Practical examples about usage found in tests.
    var SEA = USE('./root');
    SEA.work = USE('./work');
    SEA.sign = USE('./sign');
    SEA.verify = USE('./verify');
    SEA.encrypt = USE('./encrypt');
    SEA.decrypt = USE('./decrypt');
    SEA.certify = USE('./certify');
    //SEA.opt.aeskey = USE('./aeskey'); // not official! // this causes problems in latest WebCrypto.

    SEA.random = SEA.random || shim.random;

    // This is Buffer used in SEA and usable from Gun/SEA application also.
    // For documentation see https://nodejs.org/api/buffer.html
    SEA.Buffer = SEA.Buffer || USE('./buffer');

    // These SEA functions support now ony Promises or
    // async/await (compatible) code, use those like Promises.
    //
    // Creates a wrapper library around Web Crypto API
    // for various AES, ECDSA, PBKDF2 functions we called above.
    // Calculate public key KeyID aka PGPv4 (result: 8 bytes as hex string)
    SEA.keyid = SEA.keyid || (async (pub) => {
      try {
        // base64('base64(x):base64(y)') => shim.Buffer(xy)
        var pb = shim.Buffer.concat(
          pub.replace(/-/g, '+').replace(/_/g, '/').split('.')
            .map((t) => shim.Buffer.from(t, 'base64'))
        )
        // id is PGPv4 compliant raw key
        var id = shim.Buffer.concat([
          shim.Buffer.from([0x99, pb.length / 0x100, pb.length % 0x100]), pb
        ])
        var sha1 = await sha1hash(id)
        var hash = shim.Buffer.from(sha1, 'binary')
        return hash.toString('hex', hash.length - 8)  // 16-bit ID as hex
      } catch (e) {
        console.log(e)
        throw e
      }
    });
    // all done!
    // Obviously it is missing MANY necessary features. This is only an alpha release.
    // Please experiment with it, audit what I've done so far, and complain about what needs to be added.
    // SEA should be a full suite that is easy and seamless to use.
    // Again, scroll naer the top, where I provide an EXAMPLE of how to create a user and sign in.
    // Once logged in, the rest of the code you just read handled automatically signing/validating data.
    // But all other behavior needs to be equally easy, like opinionated ways of
    // Adding friends (trusted public keys), sending private messages, etc.
    // Cheers! Tell me what you think.
    ((SEA.window || {}).GUN || {}).SEA = SEA;

    module.exports = SEA
    // -------------- END SEA MODULES --------------------
    // -- BEGIN SEA+GUN MODULES: BUNDLED BY DEFAULT UNTIL OTHERS USE SEA ON OWN -------
  })(USE, './sea');

  ;USE(function(module){
    var SEA = USE('./sea'), Gun, u;
    if (SEA.window) {
      Gun = SEA.window.GUN || { chain: {} };
    } else {
      Gun = require((u + '' == typeof MODULE ? '.' : '') + './gun', 1);
    }
    SEA.GUN = Gun;

    function User(root) {
      this._ = { $: this };
    }
    User.prototype = (function () { function F() { }; F.prototype = Gun.chain; return new F() }()) // Object.create polyfill
    User.prototype.constructor = User;

    // let's extend the gun chain with a `user` function.
    // only one user can be logged in at a time, per gun instance.
    Gun.chain.user = function (pub) {
      var gun = this, root = gun.back(-1), user;
      if (pub) {
        pub = SEA.opt.pub((pub._ || '')['#']) || pub;
        return root.get('~' + pub);
      }
      if (user = root.back('user')) { return user }
      var root = (root._), at = root, uuid = at.opt.uuid || lex;
      (at = (user = at.user = gun.chain(new User))._).opt = {};
      at.opt.uuid = function (cb) {
        var id = uuid(), pub = root.user;
        if (!pub || !(pub = pub.is) || !(pub = pub.pub)) { return id }
        id = '~' + pub + '/' + id;
        if (cb && cb.call) { cb(null, id) }
        return id;
      }
      return user;
    }
    function lex() { return Gun.state().toString(36).replace('.', '') }
    Gun.User = User;
    User.GUN = Gun;
    User.SEA = Gun.SEA = SEA;
    module.exports = User;
  })(USE, './user');

  ;USE(function(module){
    var u, Gun = ('' + u != typeof GUN) ? (GUN || { chain: {} }) : require(('' + u === typeof MODULE ? '.' : '') + './gun', 1);
    Gun.chain.then = function (cb, opt) {
      var gun = this, p = (new Promise(function (res, rej) {
        gun.once(res, opt);
      }));
      return cb ? p.then(cb) : p;
    }
  })(USE, './then');

  ;USE(function(module){
    var User = USE('./user'), SEA = User.SEA, Gun = User.GUN, noop = function () { };

    // Well first we have to actually create a user. That is what this function does.
    User.prototype.create = function (...args) {
      var first = args[0], second = args[1], rest = args.slice(2);
      var pair = (first && (first.pub || first.epub)) || (second && (second.pub || second.epub)) || null;
      var alias = pair ? pair.pub || pair.epub : (typeof first === 'string' ? first : null);
      var pass = pair || (alias && typeof second === 'string' ? second : null);
      var cb = null;
      var opt = {};
      var retries = 9;

      // Iterate over arguments to get callback and options
      for (var i = 0; i < rest.length; i++) {
          if (typeof rest[i] === 'function') {
              cb = rest[i];
              break;
          }
          if (i === rest.length - 1 && typeof rest[i] === 'object') {
              opt = rest[i];
              retries = opt.retries || retries;
          }
      }

      var gun = this, cat = gun._, root = gun.back(-1);
      cb = cb || noop;
      opt = opt || {};

      if (false !== opt.check) {
          var err;
          if (!alias) err = "No user.";
          if ((pass || '').length < 8) err = "Password too short!";
          if (err) {
              cb({ err: Gun.log(err) });
              return gun;
          }
      }

      if (cat.ing) {
          (cb || noop)({ err: Gun.log("User is already being created or authenticated!"), wait: true });
          return gun;
      }

      cat.ing = true;

      var act = {};
      act.a = function (pubs) {
          act.pubs = pubs;
          if (pubs && !opt.already) {
              var ack = { err: Gun.log('User already created!') };
              cat.ing = false;
              (cb || noop)(ack);
              gun.leave();
              return;
          }
          act.salt = String.random(64); // pseudo-randomly create a salt
          SEA.work(pass, act.salt, act.b);
      };

      act.b = function (proof) {
          act.proof = proof;
          pair ? act.c(pair) : SEA.pair(act.c);
      };

      act.c = function (pair) {
          var tmp;
          act.pair = pair || {};
          if (tmp = cat.root.user) {
              tmp._.sea = pair;
              tmp.is = { pub: pair.pub, epub: pair.epub, alias: alias };
          }
          act.data = { pub: pair.pub };
          act.d();
      };

      act.d = function () {
          act.data.alias = alias;
          act.e();
      };

      act.e = function () {
          act.data.epub = act.pair.epub;
          SEA.encrypt({ priv: act.pair.priv, epriv: act.pair.epriv }, act.proof, act.f, { raw: 1 });
      };

      act.f = function (auth) {
          act.data.auth = JSON.stringify({ ek: auth, s: act.salt });
          act.g(act.data.auth);
      };

      act.g = function (auth) {
          var tmp;
          act.data.auth = act.data.auth || auth;
          root.get(tmp = '~' + act.pair.pub).put(act.data).on(act.h);
          var link = {}; link[tmp] = { '#': tmp };
          root.get('~@' + alias).put(link).get(tmp).on(act.i);
      };

      act.h = function (data, key, msg, eve) {
          eve.off();
          act.h.ok = 1;
          act.i();
      };

      act.i = function (data, key, msg, eve) {
          if (eve) { act.i.ok = 1; eve.off(); }
          if (!act.h.ok || !act.i.ok) return;
          cat.ing = false;
          cb({ ok: 0, pub: act.pair.pub });
          if (noop === cb) { pair ? gun.auth(pair) : gun.auth(alias, pass); }
      };

      root.get('~@' + alias).once(act.a);
      return gun;
    };
    User.prototype.leave = function (opt, cb) {
      var gun = this, user = (gun.back(-1)._).user;
      if (user) {
        delete user.is;
        delete user._.is;
        delete user._.sea;
      }
      if (SEA.window) {
        try {
          var sS = {};
          sS = SEA.window.sessionStorage;
          delete sS.recall;
          delete sS.pair;
        } catch (e) { };
      }
      return gun;
    }
  })(USE, './create');

  ;USE(function(module){
    var User = USE('./user'), SEA = User.SEA, Gun = User.GUN, noop = function () { };

    // Authentication function for Gun users
    // Supports three authentication methods:
    // 1. Using existing key pair: gun.user().auth({pub, priv, epub, epriv})
    // 2. Using alias/password: gun.user().auth('alice', 'password123')
    // 3. Using SEA.name for custom authentication
    User.prototype.auth = function (...args) {
      // Parse authentication parameters
      var pair = (args[0] && (args[0].pub || args[0].epub)) || (args[1] && (args[1].pub || args[1].epub)) ? args[0] || args[1] : null;
      var alias = !pair && typeof args[0] === 'string' ? args[0] : null;
      var pass = (alias || (pair && !(pair.priv && pair.epriv))) && typeof args[1] === 'string' ? args[1] : null;
      var cb = null;
      var opt = {};
      var retries = 9;

      // Iterate through arguments just once to extract the necessary values
      for (var i = 0; i < args.length; i++) {
          if (typeof args[i] === 'function' && !cb) {
              cb = args[i];
          } else if (i === args.length - 1 && typeof args[i] === 'object') {
              opt = args[i];
              retries = opt.retries || retries;
          }
      }

      var gun = this, cat = (gun._), root = gun.back(-1);

      // Prevent concurrent authentication attempts
      if (cat.ing) {
        (cb || noop)({ err: Gun.log("User is already being created or authenticated!"), wait: true });
        return gun;
      }
      cat.ing = true;

      // Authentication state machine
      var act = {}, u;

      // Step 1: Handle initial data retrieval
      act.a = function (data) {
        if (!data) { return act.b() } // No data found, try alternatives
        if (!data.pub) { // No public key, collect all non-internal keys
          var tmp = []; Object.keys(data).forEach(function (k) { if ('_' == k) { return } tmp.push(data[k]) })
          return act.b(tmp);
        }
        if (act.name) { return act.f(data) } // If using SEA.name, go to pair finalization
        act.c((act.data = data).auth); // Process authentication data
      }

      // Step 2: Handle user lookup and retries
      act.b = function (list) {
        var get = (act.list = (act.list || []).concat(list || [])).shift();
        if (u === get) {
          if (act.name) { return act.err('Your user account is not published for dApps to access, please consider syncing it online, or allowing local access by adding your device as a peer.') }
          if (alias && retries--) { // Retry alias lookup if attempts remain
            root.get('~@' + alias).once(act.a);
            return;
          }
          return act.err('Wrong user or password.')
        }
        root.get(get).once(act.a);
      }

      // Step 3: Process authentication data
      act.c = function (auth) {
        if (u === auth) { return act.b() }
        if ('string' == typeof auth) { return act.c(obj_ify(auth)) } // Handle legacy string format
        // Perform proof of work to slow down brute force attempts
        SEA.work(pass, (act.auth = auth).s, act.d, act.enc);
      }

      // Step 4: Decrypt authentication data
      act.d = function (proof) {
        SEA.decrypt(act.auth.ek, proof, act.e, act.enc);
      }

      // Step 5: Process decrypted data
      act.e = function (half) {
        if (u === half) {
          if (!act.enc) { // Try legacy UTF8 format
            act.enc = { encode: 'utf8' };
            return act.c(act.auth);
          }
          act.enc = null; // End backwards compatibility
          return act.b();
        }
        act.half = half;
        act.f(act.data);
      }

      // Step 6: Construct final key pair
      act.f = function (pair) {
        var half = act.half || {}, data = act.data || {};
        // Combine decrypted private keys with public keys
        act.g(act.lol = {
          pub: pair.pub || data.pub,
          epub: pair.epub || data.epub,
          priv: pair.priv || half.priv,
          epriv: pair.epriv || half.epriv
        });
      }

      // Step 7: Finalize authentication
      act.g = function (pair) {
        if (!pair || !pair.pub || !pair.epub) { return act.b() }
        act.pair = pair;
        var user = (root._).user, at = (user._);
        var tmp = at.tag;
        var upt = at.opt;
        at = user._ = root.get('~' + pair.pub)._;
        at.opt = upt;

        // Store credentials in memory
        user.is = { pub: pair.pub, epub: pair.epub, alias: alias || pair.pub };
        at.sea = act.pair;
        cat.ing = false;

        // Check if password migration is needed
        try { if (pass && u == (obj_ify(cat.root.graph['~' + pair.pub].auth) || '')[':']) { opt.shuffle = opt.change = pass; } } catch (e) { }

        // Handle password change if requested
        opt.change ? act.z() : (cb || noop)(at);

        // Store authentication in session if remember option enabled
        if (SEA.window && ((gun.back('user')._).opt || opt).remember) {
          try {
            var sS = {};
            sS = SEA.window.sessionStorage;
            sS.recall = true;
            sS.pair = JSON.stringify(pair); // Store full pair for reliable auth
          } catch (e) { }
        }

        // Emit authentication event
        try {
          if (root._.tag.auth) { (root._).on('auth', at) }
          else { setTimeout(function () { (root._).on('auth', at) }, 1) }
        } catch (e) {
          Gun.log("Your 'auth' callback crashed with:", e);
        }
      }

      // Handle direct pair authentication
      act.h = function (data) {
        if (!data) { return act.b() }
        alias = data.alias
        if (!alias)
          alias = data.alias = "~" + pair.pub
        if (!data.auth) {
          return act.g(pair);
        }
        pair = null;
        act.c((act.data = data).auth);
      }

      // Password change handlers
      act.z = function () {
        // Generate new salt for password change
        act.salt = String.random(64);
        SEA.work(opt.change, act.salt, act.y);
      }

      act.y = function (proof) {
        // Encrypt private keys with new password
        SEA.encrypt({ priv: act.pair.priv, epriv: act.pair.epriv }, proof, act.x, { raw: 1 });
      }

      act.x = function (auth) {
        act.w(JSON.stringify({ ek: auth, s: act.salt }));
      }

      act.w = function (auth) {
        if (opt.shuffle) { // Legacy migration handler
          console.log('migrate core account from UTF8 & shuffle');
          var tmp = {}; Object.keys(act.data).forEach(function (k) { tmp[k] = act.data[k] });
          delete tmp._;
          tmp.auth = auth;
          root.get('~' + act.pair.pub).put(tmp);
        }
        // Store new auth data
        root.get('~' + act.pair.pub).get('auth').put(auth, cb || noop);
      }

      // Error handler
      act.err = function (e) {
        var ack = { err: Gun.log(e || 'User cannot be found!') };
        cat.ing = false;
        (cb || noop)(ack);
      }

      // Plugin authentication handler
      act.plugin = function (name) {
        if (!(act.name = name)) { return act.err() }
        var tmp = [name];
        if ('~' !== name[0]) {
          tmp[1] = '~' + name;
          tmp[2] = '~@' + name;
        }
        act.b(tmp);
      }

      // Initialize authentication flow based on provided credentials
      if (pair) {
        if (pair.priv && pair.epriv)
          act.g(pair); // Direct pair authentication
        else
          root.get('~' + pair.pub).once(act.h); // Lookup pair data
      } else
        if (alias) {
          root.get('~@' + alias).once(act.a); // Alias authentication
        } else
          if (!alias && !pass) {
            SEA.name(act.plugin); // Plugin authentication
          }
      return gun;
    }

    // Helper function to safely parse JSON
    function obj_ify(o) {
      if ('string' != typeof o) { return o }
      try {
        o = JSON.parse(o);
      } catch (e) { o = {} };
      return o;
    }
  })(USE, './auth');

  ;USE(function(module){
    var User = USE('./user'), SEA = User.SEA, Gun = User.GUN;
    User.prototype.recall = function (opt, cb) {
      var gun = this, root = gun.back(-1), sS;
      opt = opt || {};
      if (opt.sessionStorage && SEA.window) {
        try {
          sS = SEA.window.sessionStorage || {};
          if (sS.recall || sS.pair) {
            root._.opt.remember = true;
            (gun.back('user')._).opt.remember = true;
            root.user().auth(JSON.parse(sS.pair), cb); // pair is more reliable than alias/pass
          }
        } catch (e) {}
      }
      return gun;
    }
  })(USE, './recall');

  ;USE(function(module){
    var User = USE('./user'), SEA = User.SEA, Gun = User.GUN, noop = function () { };
    User.prototype.pair = function () {
      var user = this, proxy; // undeprecated, hiding with proxies.
      try {
        proxy = new Proxy({ DANGER: '\u2620' }, {
          get: function (t, p, r) {
            if (!user.is || !(user._ || '').sea) { return }
            return user._.sea[p];
          }
        })
      } catch (e) { }
      return proxy;
    }
    // If authenticated user wants to delete his/her account, let's support it!
    User.prototype.delete = async function (alias, pass, cb) {
      console.log("user.delete() IS DEPRECATED AND WILL BE MOVED TO A MODULE!!!");
      var gun = this, root = gun.back(-1), user = gun.back('user');
      try {
        user.auth(alias, pass, function (ack) {
          var pub = (user.is || {}).pub;
          // Delete user data
          user.map().once(function () { this.put(null) });
          // Wipe user data from memory
          user.leave();
          (cb || noop)({ ok: 0 });
        });
      } catch (e) {
        Gun.log('User.delete failed! Error:', e);
      }
      return gun;
    }
    User.prototype.alive = async function () {
      console.log("user.alive() IS DEPRECATED!!!");
      var gunRoot = this.back(-1)
      try {
        // All is good. Should we do something more with actual recalled data?
        await authRecall(gunRoot)
        return gunRoot._.user._
      } catch (e) {
        var err = 'No session!'
        Gun.log(err)
        throw { err }
      }
    }
    User.prototype.trust = async function (user) {
      console.log("`.trust` API MAY BE DELETED OR CHANGED OR RENAMED, DO NOT USE!");
      // TODO: BUG!!! SEA `node` read listener needs to be async, which means core needs to be async too.
      //gun.get('alice').get('age').trust(bob);
      if (Gun.is(user)) {
        user.get('pub').get((ctx, ev) => {
          console.log(ctx, ev)
        })
      }
      user.get('trust').get(path).put(theirPubkey);

      // do a lookup on this gun chain directly (that gets bob's copy of the data)
      // do a lookup on the metadata trust table for this path (that gets all the pubkeys allowed to write on this path)
      // do a lookup on each of those pubKeys ON the path (to get the collab data "layers")
      // THEN you perform Jachen's mix operation
      // and return the result of that to...
    }
    User.prototype.grant = function (to, cb) {
      console.log("`.grant` API MAY BE DELETED OR CHANGED OR RENAMED, DO NOT USE!");
      var gun = this, user = gun.back(-1).user(), pair = user._.sea, path = '';
      gun.back(function (at) { if (at.is) { return } path += (at.get || '') });
      (async function () {
        var enc, sec = await user.get('grant').get(pair.pub).get(path).then();
        sec = await SEA.decrypt(sec, pair);
        if (!sec) {
          sec = SEA.random(16).toString();
          enc = await SEA.encrypt(sec, pair);
          user.get('grant').get(pair.pub).get(path).put(enc);
        }
        var pub = to.get('pub').then();
        var epub = to.get('epub').then();
        pub = await pub; epub = await epub;
        var dh = await SEA.secret(epub, pair);
        enc = await SEA.encrypt(sec, dh);
        user.get('grant').get(pub).get(path).put(enc, cb);
      }());
      return gun;
    }
    User.prototype.secret = function (data, cb) {
      console.log("`.secret` API MAY BE DELETED OR CHANGED OR RENAMED, DO NOT USE!");
      var gun = this, user = gun.back(-1).user(), pair = user.pair(), path = '';
      gun.back(function (at) { if (at.is) { return } path += (at.get || '') });
      (async function () {
        var enc, sec = await user.get('trust').get(pair.pub).get(path).then();
        sec = await SEA.decrypt(sec, pair);
        if (!sec) {
          sec = SEA.random(16).toString();
          enc = await SEA.encrypt(sec, pair);
          user.get('trust').get(pair.pub).get(path).put(enc);
        }
        enc = await SEA.encrypt(data, sec);
        gun.put(enc, cb);
      }());
      return gun;
    }

    /**
     * returns the decrypted value, encrypted by secret
     * @returns {Promise<any>}
     // Mark needs to review 1st before officially supported
    User.prototype.decrypt = function(cb) {
      var gun = this,
        path = ''
      gun.back(function(at) {
        if (at.is) {
          return
        }
        path += at.get || ''
      })
      return gun
        .then(async data => {
          if (data == null) {
            return
          }
          var user = gun.back(-1).user()
          var pair = user.pair()
          var sec = await user
            .get('trust')
            .get(pair.pub)
            .get(path)
          sec = await SEA.decrypt(sec, pair)
          if (!sec) {
            return data
          }
          var decrypted = await SEA.decrypt(data, sec)
          return decrypted
        })
        .then(res => {
          cb && cb(res)
          return res
        })
    }
    */
    module.exports = User
  })(USE, './share');

  ;USE(function(module){
    var SEA = USE('./sea'), S = USE('./settings'), noop = function () { }, u;
    var Gun = (SEA.window || '').GUN || require(('' + u === typeof MODULE ? '.' : '') + './gun', 1);
    // After we have a GUN extension to make user registration/login easy, we then need to handle everything else.

    // We do this with a GUN adapter, we first listen to when a gun instance is created (and when its options change)
    // This sets up the security middleware for each Gun instance
    Gun.on('opt', function (at) {
      if (!at.sea) { // only add SEA once per instance, on the "at" context.
        at.sea = { own: {} };
        at.on('put', check, at); // SEA now runs its firewall on HAM diffs, not all i/o.
      }
      this.to.next(at); // make sure to call the "next" middleware adapter.
    });

    // Alright, this next adapter gets run at the per node level in the graph database.
    // correction: 2020 it gets run on each key/value pair in a node upon a HAM diff.
    // This will var us verify that every property on a node has a value signed by a public key we trust.
    // If the signature does not match, the data is just `undefined` so it doesn't get passed on.
    // If it does match, then we transform the in-memory "view" of the data into its plain value (without the signature).
    // Now NOTE! Some data is "system" data, not user data. Example: List of public keys, aliases, etc.
    // This data is self-enforced (the value can only match its ID), but that is handled in the `security` function.
    // From the self-enforced data, we can see all the edges in the graph that belong to a public key.
    // Example: ~ASDF is the ID of a node with ASDF as its public key, signed alias and salt, and
    // its encrypted private key, but it might also have other signed values on it like `profile = <ID>` edge.
    // Using that directed edge's ID, we can then track (in memory) which IDs belong to which keys.
    // Here is a problem: Multiple public keys can "claim" any node's ID, so this is dangerous!
    // This means we should ONLY trust our "friends" (our key ring) public keys, not any ones.
    // I have not yet added that to SEA yet in this alpha release. That is coming soon, but beware in the meanwhile!

    // Main security check function - verifies data integrity and authenticity
    function check(msg) { // REVISE / IMPROVE, NO NEED TO PASS MSG/EVE EACH SUB?
      var eve = this, at = eve.as, put = msg.put, soul = put['#'], key = put['.'], val = put[':'], state = put['>'], id = msg['#'], tmp;

      if (!soul || !key) { return; }

      // Faith-based puts bypass normal verification
      if ((msg._ || '').faith && (at.opt || '').faith && typeof msg._ === 'function') {
        SEA.opt.pack(put, function (raw) {
          SEA.verify(raw, false, function (data) {
            put['='] = SEA.opt.unpack(data);
            eve.to.next(msg);
          });
        });
        return;
      }      

      // Error handler for security violations
      var no = function (why) {
        at.on('in', { '@': id, err: msg.err = why });
      };

      // Data expiration handling
      if (soul.includes('<?')) { // Handle expiration
        var expiration = parseFloat(soul.split('<?')[1]);
        if (expiration && state < (Gun.state() - expiration * 1000)) {
          if ((msg._ || {}).stun) msg._.stun--;
          return; // Omit expired data
        }
      }      

      // Handler mappings based on soul patterns
      if (soul === '~@') { // Shared system data aliases
        check.alias(eve, msg, val, key, soul, at, no);
      } else if (soul.slice(0, 2) === '~@') { // Public key lists
        check.pubs(eve, msg, val, key, soul, at, no);
      } else if (SEA.opt.pub(soul)) { // User account data
        var pub = SEA.opt.pub(soul);
        check.pub(eve, msg, val, key, soul, at, no, at.user || '', pub);
      } else if (soul.indexOf('#') >= 0) { // Content-addressed data
        check.hash(eve, msg, val, key, soul, at, no);
      } else { // Default verification for unsigned data
        check.any(eve, msg, val, key, soul, at, no, at.user || '');
      }
    }

    function hexToBase64(data) {
      if (data.length & 1) data = "0" + data;
      var a = [];
      for (var i = 0; i < data.length; i += 2)
        a.push(String.fromCharCode(parseInt(data.substr(i, 2), 16)));
      return btoa(a.join(""));
    }

    function base64ToHex(data) {
      var binaryStr = atob(data);
      var a = [];
      for (var i = 0; i < binaryStr.length; i++) {
        var hex = binaryStr.charCodeAt(i).toString(16);
        a.push(hex.length === 1 ? "0" + hex : hex);
      }
      return a.join("");
    }

    // Verify content-addressed data matches its hash
    check.hash = function (eve, msg, val, key, soul, at, no) {
      var hash = key.split('#').pop();
      SEA.work(val, null, function (b64hash) {
        var hexhash = base64ToHex(b64hash), b64slice = b64hash.slice(-20), hexslice = hexhash.slice(-20);
        if ([b64hash, b64slice, hexhash, hexslice].includes(hash)) return eve.to.next(msg);
        no("Data hash not same as hash!");
      }, { name: 'SHA-256' });
    }

    // Verify alias data matches its reference
    check.alias = function (eve, msg, val, key, soul, at, no) { // Example: {_:#~@, ~@alice: {#~@alice}}
      if (!val) { return no("Data must exist!") } // data MUST exist
      if ('~@' + key === link_is(val)) { return eve.to.next(msg) } // in fact, it must be EXACTLY equal to itself
      no("Alias not same!"); // if it isn't, reject.
    };

    // Verify public key list entries
    check.pubs = function (eve, msg, val, key, soul, at, no) { // Example: {_:#~@alice, ~asdf: {#~asdf}}
      if (!val) { return no("Alias must exist!") } // data MUST exist
      if (key === link_is(val)) { return eve.to.next(msg) } // and the ID must be EXACTLY equal to its property
      no("Alias not same!"); // that way nobody can tamper with the list of public keys.
    };

    // Complex verification for user account data including certificates
    check.pub = function (eve, msg, val, key, soul, at, no, user, pub) {
      var tmp // Example: {_:#~asdf, hello:'world'~fdsa}}

      return new Promise(function(resolve) {
        return S.parse(val).then(function(raw) {
          raw = raw || {};

          // Certificate verification helper function
          var verify = function(certificate, certificant, cb) {
            if (certificate.m && certificate.s && certificant && pub)
              // Verify certificate authenticity and permissions
              return SEA.verify(certificate, pub, function(data) { // check if "pub" (of the graph owner) really issued this cert
                if (u !== data && u !== data.e && msg.put['>'] > +data.e) return no("Certificate expired.") // certificate expired
                // "data.c" = a list of certificants/certified users
                // "data.w" = lex WRITE permission, in the future, there will be "data.r" which means lex READ permission
                if (u !== data && data.c && data.w && (data.c.includes(certificant) || data.c.includes('*'))) {
                  // ok, now "certificant" is in the "certificants" list, but is "path" allowed? Check path
                  var path = soul.split('/').slice(1).join('/');
                  String.match = String.match || Gun.text.match;
                  var w = [].concat(data.w).filter(Boolean);
                  for (var lex of w) {
                    if (String.match(path, lex['#']) && (String.match(key, lex['.']) || !lex['.']) || String.match(key, lex['.']) && !lex['#'] || String.match((path ? path + '/' + key : key), lex['#'] || lex)) {
                      // is Certificant forced to present in Path
                      if (lex['+'] && lex['+'].indexOf('*') > -1 && path && path.indexOf(certificant) == -1 && key.indexOf(certificant) == -1) return no(`Path "${path}" or key "${key}" must contain string "${certificant}".`)
                      // path is allowed, but is there any WRITE block? Check it out
                      if (data.wb && (typeof data.wb === 'string' || ((data.wb || {})['#']))) { // "data.wb" = path to the WRITE block
                        var root = eve.as.root.$.back(-1)
                        if (typeof data.wb === 'string' && '~' !== data.wb.slice(0, 1)) root = root.get('~' + pub)
                        return root.get(data.wb).get(certificant).once(function(value) { // TODO: INTENT TO DEPRECATE.
                          if (value && (value === 1 || value === true)) return no(`Certificant ${certificant} blocked.`)
                          return cb(data)
                        })
                      }
                      return cb(data)
                    }
                  }
                  return no("Certificate verification fail.")
                }
              })
            return
          }

          // Verify account public key matches
          if ('pub' === key && '~' + pub === soul) {
            if (val === pub) return eve.to.next(msg) // the account MUST match `pub` property that equals the ID of the public key.
            return no("Account not same!")
          }

          // Handle authenticated user writes
          if ((tmp = user.is) && tmp.pub && !raw['*'] && !raw['+'] && (pub === tmp.pub || (pub !== tmp.pub && (((msg._ || {}).msg || {}).opt || {}).cert))) {
            SEA.opt.pack(msg.put, function(packed) {
              SEA.sign(packed, user._.sea, function(data) {
                if (u === data) return no(SEA.err || 'Signature fail.');

                msg.put[':'] = { ':': tmp = SEA.opt.unpack(data.m), '~': data.s };
                msg.put['='] = tmp;

                // If writing to own graph
                if (pub === user.is.pub) {
                  if (tmp = link_is(val)) at.sea.own[tmp] = at.sea.own[tmp] || {};
                  return JSON.stringifyAsync(msg.put[':'], function(err, s) {
                    if (err) return no(err || "Stringify error.");
                    msg.put[':'] = s;
                    return eve.to.next(msg);
                  });
                }

                // If writing to other's graph, check cert and inject
                if (pub !== user.is.pub && (((msg._ || {}).msg || {}).opt || {}).cert) {
                  return S.parse(msg._.msg.opt.cert).then(function(cert) {
                    if ((cert || {}).m && (cert || {}).s) {
                      verify(cert, user.is.pub, function() {
                        msg.put[':']['+'] = cert;
                        msg.put[':']['*'] = user.is.pub;
                        return JSON.stringifyAsync(msg.put[':'], function(err, s) {
                          if (err) return no(err || "Stringify error.");
                          msg.put[':'] = s;
                          return eve.to.next(msg);
                        });
                      });
                    }
                  });
                }
              }, { raw: 1 });
            });
            return;
          }

          // Handle signed but unauthenticated writes
          if (tmp == user.is && !tmp && !raw['*'] && raw['m'] && raw['s']) {
            SEA.opt.pack(msg.put, function(packed) {
              SEA.verify(packed, pub, function(data) {
                if (u === data || data !== raw['m']) return;
                msg.put[':'] = JSON.stringify({ ':': raw['m'], '~': raw['s'] });
                msg.put['='] = data;
                return eve.to.next(msg);
              });
            });
          }      

          // Handle general data verification
          SEA.opt.pack(msg.put, function(packed) {
            SEA.verify(packed, raw['*'] || pub, function(data) {
              data = SEA.opt.unpack(data);
              if (u === data) return no("Unverified data.");
              if (link_is(data) && pub === SEA.opt.pub(link_is(data))) at.sea.own[link_is(data)] = { [pub]: 1 };

              var cert = raw['+'];
              if (cert && cert['m'] && cert['s'] && raw['*']) {
                verify(cert, raw['*'], function() { 
                  msg.put['='] = data; 
                  return eve.to.next(msg); 
                });
              } else {
                msg.put['='] = data;
                return eve.to.next(msg);
              }
            });
          });      
        });
      });
    };

    // Default security check for unsigned data
    check.any = function (eve, msg, val, key, soul, at, no, user) {
      var tmp, pub;
      if (at.opt.secure) { return no("Soul missing public key at '" + key + "'.") }
      // TODO: Ask community if should auto-sign non user-graph data.
      at.on('secure', function (msg) {
        this.off();
        if (!at.opt.secure) { return eve.to.next(msg) }
        no("Data cannot be changed.");
      }).on.on('secure', msg);
      return;
    }

    // Utility functions and constants
    var valid = Gun.valid, link_is = function (d, l) { return 'string' == typeof (l = valid(d)) && l }, state_ify = (Gun.state || '').ify;

    // Public key format validation regex
    var pubcut = /[^\w_-]/; // anything not alphanumeric or _ -
    SEA.opt.pub = function (s) {
      if (!s) { return }
      s = s.split('~');
      if (!s || !(s = s[1])) { return }
      s = s.split(pubcut).slice(0, 2);
      if (!s || 2 != s.length) { return }
      if ('@' === (s[0] || '')[0]) { return }
      s = s.slice(0, 2).join('.');
      return s;
    }

    // String type checking helper
    SEA.opt.stringy = function (t) {
      // TODO: encrypt etc. need to check string primitive. Make as breaking change.
    }

    // Data packing for verification
    SEA.opt.pack = function (d, cb, k, n, s) {
      var tmp, f; // pack for verifying
      if (SEA.opt.check(d)) { return cb(d) }
      if (d && d['#'] && d['.'] && d['>']) { tmp = d[':']; f = 1 }
      JSON.parseAsync(f ? tmp : d, function (err, meta) {
        var sig = ((u !== (meta || '')[':']) && (meta || '')['~']); // or just ~ check?
        if (!sig) { cb(d); return }
        cb({ m: { '#': s || d['#'], '.': k || d['.'], ':': (meta || '')[':'], '>': d['>'] || Gun.state.is(n, k) }, s: sig });
      });
    }

    // Data unpacking helper
    var O = SEA.opt;
    SEA.opt.unpack = function(d, k, n) {
      if (u === d || (d && u !== d[':'])) return d && d[':'];
      k = k || O.fall_key;
      n = n || (O.fall_val ? { [k]: O.fall_val } : {});
      if (!k || !n) return;
      if (d === n[k]) return d;
      if (!SEA.opt.check(n[k])) return d;
      var soul = (n._ && n._['#']) || O.fall_soul,
          s = Gun.state.is(n, k) || O.fall_state;
      if (Array.isArray(d) && d.length === 4 && d[0] === soul && d[1] === k && fl(s) === fl(d[3])) return d[2];
      if (s < SEA.opt.shuffle_attack) return d;
    };

    // Security constants
    SEA.opt.shuffle_attack = 1546329600000; // Jan 1, 2019
    var fl = Math.floor; // TODO: Still need to fix inconsistent state issue.
    // TODO: Potential bug? If pub/priv key starts with `-`? IDK how possible.
  })(USE, './index');

}());