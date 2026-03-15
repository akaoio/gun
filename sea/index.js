;(function(){

    var SEA = require('./sea'), S = require('./settings'), noop = function() {}, u;
    var Gun = (SEA.window||'').GUN || require((''+u === typeof MODULE?'.':'')+'./gun', 1);
    // After we have a GUN extension to make user registration/login easy, we then need to handle everything else.

    // We do this with a GUN adapter, we first listen to when a gun instance is created (and when its options change)
    Gun.on('opt', function(at){
      if(!at.sea){ // only add SEA once per instance, on the "at" context.
        at.sea = {own: {}};
        at.on('put', check, at); // SEA now runs its firewall on HAM diffs, not all i/o.
      }
      this.to.next(at); // make sure to call the "next" middleware adapter.
    });

    // Alright, this next adapter gets run at the per node level in the graph database.
    // correction: 2020 it gets run on each key/value pair in a node upon a HAM diff.
    // This will let us verify that every property on a node has a value signed by a public key we trust.
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

    function check(msg){ // REVISE / IMPROVE, NO NEED TO PASS MSG/EVE EACH SUB?
      var eve = this, at = eve.as, put = msg.put, soul = put['#'], key = put['.'], val = put[':'], state = put['>'], id = msg['#'], tmp;
      if(!soul || !key){ return }
      if((msg._||'').faith && (at.opt||'').faith && 'function' == typeof msg._){
        SEA.opt.pack(put, function(raw){
        SEA.verify(raw, false, function(data){ // this is synchronous if false
          put['='] = SEA.opt.unpack(data);
          eve.to.next(msg);
        })})
        return 
      }
      var no = function(why){ at.on('in', {'@': id, err: msg.err = why}) }; // exploit internal relay stun for now, maybe violates spec, but testing for now. // Note: this may be only the sharded message, not original batch.
      //var no = function(why){ msg.ack(why) };
      (msg._||'').DBG && ((msg._||'').DBG.c = +new Date);
      if(0 <= soul.indexOf('<?')){ // special case for "do not sync data X old" forget
        // 'a~pub.key/b<?9'
        tmp = parseFloat(soul.split('<?')[1]||'');
        if(tmp && (state < (Gun.state() - (tmp * 1000)))){ // sec to ms
          (tmp = msg._) && (tmp.stun) && (tmp.stun--); // THIS IS BAD CODE! It assumes GUN internals do something that will probably change in future, but hacking in now.
          return; // omit!
        }
      }

      if('~@' === soul){  // special case for shared system data, the list of aliases.
        check.alias(eve, msg, val, key, soul, at, no); return;
      }
      if('~@' === soul.slice(0,2)){ // special case for shared system data, the list of public keys for an alias.
        check.pubs(eve, msg, val, key, soul, at, no); return;
      }
      if('~' === soul || '~/' === soul.slice(0,2)){
        check.shard(eve, msg, val, key, soul, at, no, at.user||''); return;
      }
      //if('~' === soul.slice(0,1) && 2 === (tmp = soul.slice(1)).split('.').length){ // special case, account data for a public key.
      if(tmp = SEA.opt.pub(soul)){ // special case, account data for a public key.
        check.pub(eve, msg, val, key, soul, at, no, at.user||'', tmp); return;
      }
      if(0 <= soul.indexOf('#')){ // special case for content addressing immutable hashed data.
        check.hash(eve, msg, val, key, soul, at, no); return;
      } 
      check.any(eve, msg, val, key, soul, at, no, at.user||''); return;
      eve.to.next(msg); // not handled
    }
    // Verify content-addressed data matches its hash
    check.hash = function (eve, msg, val, key, soul, at, no, yes) {
      function base64ToHex(data) {
        var binaryStr = atob(data);
        var a = [];
        for (var i = 0; i < binaryStr.length; i++) {
          var hex = binaryStr.charCodeAt(i).toString(16);
          a.push(hex.length === 1 ? "0" + hex : hex);
        }
        return a.join("");
      }
      var hash = key.split('#').pop();
      yes = yes || function(){ eve.to.next(msg) };
      if(!hash || hash === key){ return yes() }
      SEA.work(val, null, function (b64hash) {
        var hexhash = base64ToHex(b64hash), b64slice = b64hash.slice(-20), hexslice = hexhash.slice(-20);
        if ([b64hash, b64slice, hexhash, hexslice].some(item => item.endsWith(hash))) return yes();
        no("Data hash not same as hash!");
      }, { name: 'SHA-256' });
    }
    check.alias = function(eve, msg, val, key, soul, at, no){ // Example: {_:#~@, ~@alice: {#~@alice}}
      if(!val){ return no("Data must exist!") } // data MUST exist
      if('~@'+key === link_is(val)){ return eve.to.next(msg) } // in fact, it must be EXACTLY equal to itself
      no("Alias not same!"); // if it isn't, reject.
    };
    check.pubs = function(eve, msg, val, key, soul, at, no){ // Example: {_:#~@alice, ~asdf: {#~asdf}}
      if(!val){ return no("Alias must exist!") } // data MUST exist
      if(key === link_is(val)){ return eve.to.next(msg) } // and the ID must be EXACTLY equal to its property
      no("Alias not same!"); // that way nobody can tamper with the list of public keys.
    };
    check.$sh = {
      pub: 88,
      cut: 2,
      min: 1,
      root: '~',
      pre: '~/',
      bad: /[^0-9a-zA-Z]/
    }
    check.$sh.max = Math.ceil(check.$sh.pub / check.$sh.cut)
    check.$seg = function(seg, short){
      if('string' != typeof seg || !seg){ return }
      if(short){
        if(seg.length < check.$sh.min || seg.length > check.$sh.cut){ return }
      } else {
        if(seg.length !== check.$sh.cut){ return }
      }
      if(check.$sh.bad.test(seg)){ return }
      return 1
    }
    check.$path = function(soul){
      if(check.$sh.root === soul){ return [] }
      if(check.$sh.pre !== (soul||'').slice(0,2)){ return }
      if('/' === soul.slice(-1) || 0 <= soul.indexOf('//')){ return }
      var path = soul.slice(2).split('/'), i = 0, seg;
      for(i; i < path.length; i++){
        seg = path[i];
        if(!check.$seg(seg)){ return }
      }
      return path
    }
    check.$kid = function(soul, key){
      if(check.$sh.root === soul){ return check.$sh.pre + key }
      return soul + '/' + key
    }
    check.$pub = function(soul, key){
      var path = check.$path(soul);
      if(!path){ return }
      return path.join('') + key
    }
    check.$leaf = function(soul, key){
      var pub = check.$pub(soul, key);
      if(!pub || pub.length !== check.$sh.pub){ return }
      if(SEA.opt.pub('~' + pub) !== pub){ return }
      return pub
    }
    check.$sea = function(msg, user, pub){
      var ctx = (msg._.msg || {}).opt || {}
      var opt = msg._.sea || (function(){
        var o = Object.assign({}, ctx)
        try{
          Object.defineProperty(msg._, 'sea', {value: o, enumerable: false, configurable: true, writable: true})
        }catch(e){ msg._.sea = o }
        return o
      }())
      var authenticator = opt.authenticator || (user._ || {}).sea
      var upub = opt.authenticator ? (opt.pub || (user.is || {}).pub || pub) : (user.is || {}).pub
      if (!msg._.done) {
        delete ctx.authenticator; delete ctx.pub
        msg._.done = true
      }
      return {opt, authenticator, upub}
    }
    check.shard = async function(eve, msg, val, key, soul, at, no, user){
      var path = check.$path(soul), link = link_is(val), expected, leaf, raw, claim;
      if(!path){ return no("Invalid shard soul path.") }
      if(!check.$seg(key, 1)){ return no("Invalid shard key.") }
      if((path.length + 1) > check.$sh.max){ return no("Invalid shard depth.") }
      leaf = check.$leaf(soul, key)
      if(leaf){
        if(!link){ return no("Shard leaf value must be a link.") }
        if(link !== '~' + leaf){ return no("Shard leaf link must point to ~pub.") }
        // Always sign fresh — authenticator required; sig covers state, preventing pre-signed writes
        var lsec = check.$sea(msg, user, leaf)
        var lauthenticator = lsec.authenticator
        var lupub = lsec.upub || (lauthenticator||{}).pub
        if(!lauthenticator){ return no("Shard leaf requires authenticator.") }
        if(lupub !== leaf){ return no("Shard leaf authenticator pub mismatch.") }
        check.auth(msg, no, lauthenticator, function(data){
          if(link_is(data) !== link){ return no("Shard leaf signed payload mismatch.") }
          msg.put['='] = {'#': link}
          check.next(eve, msg, no)
        })
        return
      }
      // Intermediate
      expected = check.$kid(soul, key)
      var prefix = check.$pub(soul, key)
      raw = link ? {} : ((await S.parse(val)) || {})
      claim = (raw && typeof raw === 'object') ? raw['*'] : undefined
      if(!claim){
        // Fresh client write — authenticator required; SEA.opt.pack binds sig to Gun state
        if(!link){ return no("Shard intermediate value must be link.") }
        if(link !== expected){ return no("Invalid shard link target.") }
        var sec = check.$sea(msg, user)
        var authenticator = sec.authenticator
        claim = sec.upub || ((authenticator||{}).pub)
        if(!authenticator){ return no("Shard intermediate requires authenticator.") }
        if('string' !== typeof claim || claim.length !== check.$sh.pub){ return no("Invalid shard intermediate pub.") }
        if(SEA.opt.pub('~' + claim) !== claim){ return no("Invalid shard intermediate pub format.") }
        if(0 !== claim.indexOf(prefix)){ return no("Shard pub prefix mismatch.") }
        check.auth(msg, no, authenticator, function(data){
          if(link_is(data) !== expected){ return no("Shard intermediate signed payload mismatch.") }
          msg.put[':']['*'] = claim  // append fullPub to {':':link,'~':sig} set by check.auth
          msg.put['='] = {'#': expected}
          check.next(eve, msg, no)
        })
        return
      }
      // Peer re-read: stored envelope {':': link, '~': sig, '*': fullPub}
      // Skip if local graph already has a valid link for this slot — avoid redundant verify+write
      var existing = ((at.graph||{})[soul]||{})[key]
      if(existing){
        var existingParsed = await S.parse(existing)
        if(existingParsed && link_is(existingParsed[':']) === expected){
          msg.put['='] = {'#': expected}
          return eve.to.next(msg)
        }
      }
      if('string' !== typeof claim || claim.length !== check.$sh.pub){ return no("Invalid shard intermediate pub.") }
      if(SEA.opt.pub('~' + claim) !== claim){ return no("Invalid shard intermediate pub format.") }
      if(0 !== claim.indexOf(prefix)){ return no("Shard pub prefix mismatch.") }
      if(link_is(raw[':']) !== expected){ return no("Invalid shard link target.") }
      SEA.opt.pack(msg.put, function(packed){
        SEA.verify(packed, claim, function(data){
          data = SEA.opt.unpack(data)
          if(u === data){ return no("Invalid shard intermediate signature.") }
          if(link_is(data) !== expected){ return no("Shard intermediate payload mismatch.") }
          msg.put['='] = data
          eve.to.next(msg)  // val already a JSON string — forward directly
        })
      })
    };
    check.$vfy = function(eve, msg, key, soul, pub, no, certificate, certificant, cb){
      if (!(certificate||'').m || !(certificate||'').s || !certificant || !pub) { return }
      return SEA.verify(certificate, pub, data => { // check if "pub" (of the graph owner) really issued this cert
        if (u !== data && u !== data.e && msg.put['>'] && msg.put['>'] > parseFloat(data.e)) return no("Certificate expired.") // certificate expired
        // "data.c" = a list of certificants/certified users
        // "data.w" = lex WRITE permission, in the future, there will be "data.r" which means lex READ permission
        if (u !== data && data.c && data.w && (data.c === certificant || data.c.indexOf('*') > -1 || data.c.indexOf(certificant) > -1)) {
          // ok, now "certificant" is in the "certificants" list, but is "path" allowed? Check path
          var path = soul.indexOf('/') > -1 ? soul.replace(soul.substring(0, soul.indexOf('/') + 1), '') : ''
          String.match = String.match || Gun.text.match
          var w = Array.isArray(data.w) ? data.w : typeof data.w === 'object' || typeof data.w === 'string' ? [data.w] : []
          for (const lex of w) {
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
    }
    check.next = function(eve, msg, no){
      JSON.stringifyAsync(msg.put[':'], function(err,s){
        if(err){ return no(err || "Stringify error.") }
        msg.put[':'] = s;
        return eve.to.next(msg);
      })
    }
    check.guard = function(eve, msg, key, soul, at, no, data, next){
      if(0 > key.indexOf('#')){ return next() }
      check.hash(eve, msg, data, key, soul, at, no, next)
    }
    check.auth = function(msg, no, authenticator, done){
      SEA.opt.pack(msg.put, packed => {
        if (!authenticator) return no("Missing authenticator");
        SEA.sign(packed, authenticator, async function(data) {
          if (u === data) return no(SEA.err || 'Signature fail.')
          if (!data.m || !data.s) return no('Invalid signature format')
          var parsed = SEA.opt.unpack(data.m)
          msg.put[':'] = {':': parsed, '~': data.s}
          msg.put['='] = parsed
          done(parsed)
        }, {raw: 1})
      })
    }
    check.$tag = async function(msg, cert, upub, verify, next){
      const _cert = await S.parse(cert)
      if (_cert && _cert.m && _cert.s) verify(_cert, upub, _ => {
        msg.put[':']['+'] = _cert // '+' is a certificate
        msg.put[':']['*'] = upub // '*' is pub of the user who puts
        next()
        return
      })
    }
    check.pass = function(eve, msg, raw, data, verify){
      if (raw['+'] && raw['+']['m'] && raw['+']['s'] && raw['*']){
        return verify(raw['+'], raw['*'], _ => {
          msg.put['='] = data;
          return eve.to.next(msg);
        })
      }
      msg.put['='] = data;
      return eve.to.next(msg);
    }
    check.pub = async function(eve, msg, val, key, soul, at, no, user, pub, conf){ var tmp // Example: {_:#~asdf, hello:'world'~fdsa}}
      conf = conf || {}
      const verify = (certificate, certificant, cb) => check.$vfy(eve, msg, key, soul, pub, no, certificate, certificant, cb)
      const $next = () => check.next(eve, msg, no)

      // Localize auth options into message-private SEA context.
      const sec = check.$sea(msg, user, pub)
      const opt = sec.opt
      const authenticator = sec.authenticator
      const upub = sec.upub
      const cert = conf.nocert ? u : opt.cert;
      const $expect = function(data){
        if(u === conf.want){ return 1 }
        if(data === conf.want){ return 1 }
        no(conf.err || "Unexpected payload.")
      }
      const raw = await S.parse(val) || {}
      const $hash = function(data, next){
        check.guard(eve, msg, key, soul, at, no, data, next)
      }
      const $sign = async function(){
        // if writing to own graph, just allow it
        if (pub === upub) {
          if (tmp = link_is(val)) (at.sea.own[tmp] = at.sea.own[tmp] || {})[pub] = 1
          $next()
          return
        }

        // if writing to other's graph, check if cert exists then try to inject cert into put, also inject self pub so that everyone can verify the put
        if (pub !== upub && cert) {
          return check.$tag(msg, cert, upub, verify, $next)
        }
      }
      const $pass = function(data){
        return check.pass(eve, msg, raw, data, verify)
      }

      if ('pub' === key && '~' + pub === soul) {
        if (val === pub) return eve.to.next(msg) // the account MUST match `pub` property that equals the ID of the public key.
        return no("Account not same!")
      }

      if ((user.is || authenticator) && upub && !raw['*'] && !raw['+'] && (pub === upub || (pub !== upub && cert))){
        check.auth(msg, no, authenticator, function(data){
          if(!$expect(data)){ return }
          $hash(data, $sign)
        })
        return;
      }

      SEA.opt.pack(msg.put, packed => {
        SEA.verify(packed, raw['*'] || pub, function(data){ var tmp;
          data = SEA.opt.unpack(data);
          if (u === data) return no("Unverified data.") // make sure the signature matches the account it claims to be on. // reject any updates that are signed with a mismatched account.
          if(!$expect(data)){ return }
          if ((tmp = link_is(data)) && pub === SEA.opt.pub(tmp)) (at.sea.own[tmp] = at.sea.own[tmp] || {})[pub] = 1

          $hash(data, function(){ $pass(data) })
        });
      })
      return
    };
    check.any = function(eve, msg, val, key, soul, at, no, user){ var tmp, pub;
      if(at.opt.secure){ return no("Soul missing public key at '" + key + "'.") }
      // TODO: Ask community if should auto-sign non user-graph data.
      at.on('secure', function(msg){ this.off();
        if(!at.opt.secure){ return eve.to.next(msg) }
        no("Data cannot be changed.");
      }).on.on('secure', msg);
      return;
    }

    var valid = Gun.valid, link_is = function(d,l){ return 'string' == typeof (l = valid(d)) && l }, state_ify = (Gun.state||'').ify;

    var pubcut = /[^\w_-]/; // kept for old-format parsing below
    SEA.opt.pub = function(s){
      if(!s){ return }
      s = s.split('~')[1]
      if(!s){ return }
      if('@' === (s[0]||'')[0]){ return }
      // New format: 88 alphanumeric chars (base62)
      if(/^[A-Za-z0-9]{88}/.test(s)){ return s.slice(0, 88) }
      // Old format: x.y (base64url, 87 chars) — backward compat for check.pub routing
      var parts = s.split(pubcut).slice(0,2)
      if(!parts || 2 !== parts.length){ return }
      return parts.slice(0,2).join('.')
    }
    SEA.opt.stringy = function(t){
      // TODO: encrypt etc. need to check string primitive. Make as breaking change.
    }
    SEA.opt.pack = function(d,cb,k, n,s){ var tmp, f; // pack for verifying
      if(SEA.opt.check(d)){ return cb(d) }
      if(d && d['#'] && d['.'] && d['>']){ tmp = d[':']; f = 1 }
      JSON.parseAsync(f? tmp : d, function(err, meta){
        var sig = ((u !== (meta||'')[':']) && (meta||'')['~']); // or just ~ check?
        if(!sig){ cb(d); return }
        cb({m: {'#':s||d['#'],'.':k||d['.'],':':(meta||'')[':'],'>':d['>']||Gun.state.is(n, k)}, s: sig});
      });
    }
    var O = SEA.opt;
    SEA.opt.unpack = function(d, k, n){ var tmp;
      if(u === d){ return }
      if(d && (u !== (tmp = d[':']))){ return tmp }
      k = k || O.fall_key; if(!n && O.fall_val){ n = {}; n[k] = O.fall_val }
      if(!k || !n){ return }
      if(d === n[k]){ return d }
      if(!SEA.opt.check(n[k])){ return d }
      var soul = (n && n._ && n._['#']) || O.fall_soul, s = Gun.state.is(n, k) || O.fall_state;
      if(d && 4 === d.length && soul === d[0] && k === d[1] && fl(s) === fl(d[3])){
        return d[2];
      }
      if(s < SEA.opt.shuffle_attack){
        return d;
      }
    }
    SEA.opt.shuffle_attack = 1546329600000; // Jan 1, 2019
    var fl = Math.floor; // TODO: Still need to fix inconsistent state issue.
    // TODO: Potential bug? If pub/priv key starts with `-`? IDK how possible.
  
}());