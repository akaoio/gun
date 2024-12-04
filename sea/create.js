;(function(){

    var User = require('./user'), SEA = User.SEA, Gun = User.GUN, noop = function () { };

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
  
}());