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
      if (!soul || !key) { return }

      // Handle faith-based (trusted) puts - these bypass normal verification
      if ((msg._ || '').faith && (at.opt || '').faith && 'function' == typeof msg._) {
        SEA.opt.pack(put, function (raw) {
          SEA.verify(raw, false, function (data) { // this is synchronous if false
            put['='] = SEA.opt.unpack(data);
            eve.to.next(msg);
          })
        })
        return
      }

      // Error handler for security violations
      var no = function (why) { at.on('in', { '@': id, err: msg.err = why }) }; // exploit internal relay stun for now, maybe violates spec, but testing for now. // Note: this may be only the sharded message, not original batch.
      //var no = function(why){ msg.ack(why) };
      (msg._ || '').DBG && ((msg._ || '').DBG.c = +new Date);

      // Handle data expiration/forgetting
      if (0 <= soul.indexOf('<?')) { // special case for "do not sync data X old" forget
        // 'a~pub.key/b<?9'
        tmp = parseFloat(soul.split('<?')[1] || '');
        if (tmp && (state < (Gun.state() - (tmp * 1000)))) { // sec to ms
          (tmp = msg._) && (tmp.stun) && (tmp.stun--); // THIS IS BAD CODE! It assumes GUN internals do something that will probably change in future, but hacking in now.
          return; // omit!
        }
      }

      // Handle system data - alias list verification
      if ('~@' === soul) {  // special case for shared system data, the list of aliases.
        check.alias(eve, msg, val, key, soul, at, no); return;
      }

      // Handle public key list verification
      if ('~@' === soul.slice(0, 2)) { // special case for shared system data, the list of public keys for an alias.
        check.pubs(eve, msg, val, key, soul, at, no); return;
      }

      // Handle user account data verification
      if (tmp = SEA.opt.pub(soul)) { // special case, account data for a public key.
        check.pub(eve, msg, val, key, soul, at, no, at.user || '', tmp); return;
      }

      // Handle content-addressed data verification
      if (0 <= soul.indexOf('#')) { // special case for content addressing immutable hashed data.
        check.hash(eve, msg, val, key, soul, at, no); return;
      }

      // Default verification for unsigned data
      check.any(eve, msg, val, key, soul, at, no, at.user || ''); return;
      eve.to.next(msg); // not handled
    }

    function hexToBase64(data) {
      var result = "";
      for (var i = 0; i < data.length; i++) {
        result += !(i - 1 & 1) ? String.fromCharCode(parseInt(data.substring(i - 1, i + 1), 16)) : ""
      }
      return btoa(result);
    }

    function base64ToHex(data) {
      // Decode the base64 string into a binary string
      var binaryStr = atob(data);
    
      // Convert each character in the binary string to its hex equivalent
      var result = "";
      for (var i = 0; i < binaryStr.length; i++) {
        var hex = binaryStr.charCodeAt(i).toString(16);
        // Ensure each hex is two characters (e.g., '0f' instead of 'f')
        result += hex.length === 1 ? "0" + hex : hex;
      }
      return result;
    }

    // Verify content-addressed data matches its hash
    check.hash = function (eve, msg, val, key, soul, at, no) { // mark unbuilt @i001962 's epic hex contrib!
      var hash = key.split('#').slice(-1)[0]
      SEA.work(val, null, function (b64hash) {
        var b64slice = b64hash.slice(-20)
        var hexhash = base64ToHex(b64hash)
        var hexslice = hexhash.slice(-20)
        if (hash && ((hash === b64hash) || (hash === b64slice) || (hash === hexhash) || (hash === hexslice))) { return eve.to.next(msg) }
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
            if (u !== data && u !== data.e && msg.put['>'] && msg.put['>'] > parseFloat(data.e)) return no("Certificate expired.") // certificate expired
            // "data.c" = a list of certificants/certified users
            // "data.w" = lex WRITE permission, in the future, there will be "data.r" which means lex READ permission
            if (u !== data && data.c && data.w && (data.c === certificant || data.c.indexOf('*') > -1 || data.c.indexOf(certificant) > -1)) {
              // ok, now "certificant" is in the "certificants" list, but is "path" allowed? Check path
              var path = soul.indexOf('/') > -1 ? soul.replace(soul.substring(0, soul.indexOf('/') + 1), '') : ''
              String.match = String.match || Gun.text.match
              var w = Array.isArray(data.w) ? data.w : typeof data.w === 'object' || typeof data.w === 'string' ? [data.w] : []
              for (var lex of w) {
                if ((String.match(path, lex['#']) && String.match(key, lex['.'])) || (!lex['.'] && String.match(path, lex['#'])) || (!lex['#'] && String.match(key, lex['.'])) || String.match((path ? path + '/' + key : key), lex['#'] || lex)) {
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
      if ((tmp = user.is) && tmp.pub && !raw['*'] && !raw['+'] && (pub === tmp.pub || (pub !== tmp.pub && ((msg._.msg || {}).opt || {}).cert))) {
        SEA.opt.pack(msg.put, packed => {
          SEA.sign(packed, (user._).sea, async function (data) {
            if (u === data) return no(SEA.err || 'Signature fail.')
            msg.put[':'] = { ':': tmp = SEA.opt.unpack(data.m), '~': data.s }
            msg.put['='] = tmp

            // if writing to own graph, just allow it
            if (pub === user.is.pub) {
              if (tmp = link_is(val)) (at.sea.own[tmp] = at.sea.own[tmp] || {})[pub] = 1
              JSON.stringifyAsync(msg.put[':'], function (err, s) {
                if (err) { return no(err || "Stringify error.") }
                msg.put[':'] = s;
                return eve.to.next(msg);
              })
              return
            }

            // if writing to other's graph, check if cert exists then try to inject cert into put
            if (pub !== user.is.pub && ((msg._.msg || {}).opt || {}).cert) {
              var cert = await S.parse(msg._.msg.opt.cert)
              // even if cert exists, we must verify it
              if (cert && cert.m && cert.s)
                verify(cert, user.is.pub, _ => {
                  msg.put[':']['+'] = cert // '+' is a certificate
                  msg.put[':']['*'] = user.is.pub // '*' is pub of the user who puts
                  JSON.stringifyAsync(msg.put[':'], function (err, s) {
                    if (err) { return no(err || "Stringify error.") }
                    msg.put[':'] = s;
                    return eve.to.next(msg);
                  })
                  return
                })
            }
          }, { raw: 1 })
        })
        return;
      }

      // Handle signed but unauthenticated writes
      if ((tmp == user.is) && !tmp && !raw['*'] && raw['m'] && raw['s']) {
        SEA.opt.pack(msg.put, packed => {
          SEA.verify(packed, pub, async function (data) {
            if (u === data) return no("Unverified data.")
            if (data == raw['m']) {
              msg.put[':'] = JSON.stringify({ ':': raw['m'], '~': raw['s'] })
              msg.put['='] = data;
              return eve.to.next(msg);
            }
          });
        });
      }

      // Handle general data verification
      SEA.opt.pack(msg.put, packed => {
        SEA.verify(packed, raw['*'] || pub, function (data) {
          var tmp;
          data = SEA.opt.unpack(data);
          if (u === data) return no("Unverified data.") // make sure the signature matches the account it claims to be on. // reject any updates that are signed with a mismatched account.
          if ((tmp = link_is(data)) && pub === SEA.opt.pub(tmp)) (at.sea.own[tmp] = at.sea.own[tmp] || {})[pub] = 1

          // check if cert ('+') and putter's pub ('*') exist
          if (raw['+'] && raw['+']['m'] && raw['+']['s'] && raw['*'])
            // now verify certificate
            verify(raw['+'], raw['*'], _ => {
              msg.put['='] = data;
              return eve.to.next(msg);
            })
          else {
            msg.put['='] = data;
            return eve.to.next(msg);
          }
        });
      })
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
    SEA.opt.unpack = function (d, k, n) {
      var tmp;
      if (u === d) { return }
      if (d && (u !== (tmp = d[':']))) { return tmp }
      k = k || O.fall_key; if (!n && O.fall_val) { n = {}; n[k] = O.fall_val }
      if (!k || !n) { return }
      if (d === n[k]) { return d }
      if (!SEA.opt.check(n[k])) { return d }
      var soul = (n && n._ && n._['#']) || O.fall_soul, s = Gun.state.is(n, k) || O.fall_state;
      if (d && 4 === d.length && soul === d[0] && k === d[1] && fl(s) === fl(d[3])) {
        return d[2];
      }
      if (s < SEA.opt.shuffle_attack) {
        return d;
      }
    }

    // Security constants
    SEA.opt.shuffle_attack = 1546329600000; // Jan 1, 2019
    var fl = Math.floor; // TODO: Still need to fix inconsistent state issue.
    // TODO: Potential bug? If pub/priv key starts with `-`? IDK how possible.
  
}());