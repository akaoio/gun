;(function(){

    var SEA = require('./root');
    var shim = require('./shim');
    var S = require('./settings');
    var sha = require('./sha256');
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
  
}());
