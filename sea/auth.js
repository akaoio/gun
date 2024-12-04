;(function(){

    var User = require('./user'), SEA = User.SEA, Gun = User.GUN, noop = function () { };

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
  
}());