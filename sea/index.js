;(function(){

    var SEA = require('./sea'), S = require('./settings'), noop = function () { }, u;
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
        SEA.opt.pack(put, raw => {
          SEA.verify(raw, false, data => {
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
      SEA.work(val, null, (b64hash) => {
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
    check.pub = async function (eve, msg, val, key, soul, at, no, user, pub) {
      var tmp // Example: {_:#~asdf, hello:'world'~fdsa}}
      var raw = await S.parse(val) || {}

      // Certificate verification helper function
      var verify = (certificate, certificant, cb) => {
        if (certificate.m && certificate.s && certificant && pub)
          // Verify certificate authenticity and permissions
          return SEA.verify(certificate, pub, data => { // check if "pub" (of the graph owner) really issued this cert
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
                    return root.get(data.wb).get(certificant).once(value => { // TODO: INTENT TO DEPRECATE.
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
        SEA.opt.pack(msg.put, packed => {
          SEA.sign(packed, user._.sea, async data => {
            if (u === data) return no(SEA.err || 'Signature fail.');

            msg.put[':'] = { ':': tmp = SEA.opt.unpack(data.m), '~': data.s };
            msg.put['='] = tmp;

            // If writing to own graph
            if (pub === user.is.pub) {
              if (tmp = link_is(val)) at.sea.own[tmp] = at.sea.own[tmp] || {};
              return JSON.stringifyAsync(msg.put[':'], (err, s) => err ? no(err || "Stringify error.") : (msg.put[':'] = s, eve.to.next(msg)));
            }

            // If writing to other's graph, check cert and inject
            if (pub !== user.is.pub && (((msg._ || {}).msg || {}).opt || {}).cert) {
              var cert = await S.parse(msg._.msg.opt.cert);
              if ((cert || {}).m && (cert || {}).s) {
                verify(cert, user.is.pub, () => {
                  msg.put[':']['+'] = cert;
                  msg.put[':']['*'] = user.is.pub;
                  return JSON.stringifyAsync(msg.put[':'], (err, s) => err ? no(err || "Stringify error.") : (msg.put[':'] = s, eve.to.next(msg)));
                });
              }
            }
          }, { raw: 1 });
        });
        return;
      }

      // Handle signed but unauthenticated writes
      if (tmp == user.is && !tmp && !raw['*'] && raw['m'] && raw['s']) {
        SEA.opt.pack(msg.put, packed => {
          SEA.verify(packed, pub, data => {
            if (u === data || data !== raw['m']) return;
            msg.put[':'] = JSON.stringify({ ':': raw['m'], '~': raw['s'] });
            msg.put['='] = data;
            return eve.to.next(msg);
          });
        });
      }      

      // Handle general data verification
      SEA.opt.pack(msg.put, packed => {
        SEA.verify(packed, raw['*'] || pub, data => {
          data = SEA.opt.unpack(data);
          if (u === data) return no("Unverified data.");
          if (link_is(data) && pub === SEA.opt.pub(link_is(data))) at.sea.own[link_is(data)] = { [pub]: 1 };

          var cert = raw['+'];
          if (cert && cert['m'] && cert['s'] && raw['*']) {
            verify(cert, raw['*'], () => { msg.put['='] = data; return eve.to.next(msg); });
          } else {
            msg.put['='] = data;
            return eve.to.next(msg);
          }
        });
      });      
      return
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
  
}());