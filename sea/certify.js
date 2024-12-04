;(function(){

    var SEA = require('./root');
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
            return c.reduce((a, c) => { typeof c === 'string' ? a.push(c) : c?.pub && a.push(c.pub); return a; }, []);
          }
          return null;
        };

        var c = proc(certs);
        if (!c) { console.log("No certificant found."); return; }

        var exp = opt.expiry ? parseFloat(opt.expiry) : null;
        var rpol = policy?.read;
        var wpol = policy?.write || (typeof policy === 'string' || Array.isArray(policy) || policy["+"] || policy["#"] || policy["."] || policy["="] || policy["*"] || policy[">"] || policy["<"]) ? policy : null;
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
  
}());