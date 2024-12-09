;(function(){
  var SEA = require('./root'), shim = require('./shim');
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
}());
