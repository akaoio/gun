;(function(){

    var shim = require('./shim');
    module.exports = function (d, o) {
      return ((typeof d == 'string') ? Promise.resolve(d) : shim.stringify(d))
        .then(function(t){ return shim.subtle.digest({ name: o || 'SHA-256' }, new shim.TextEncoder().encode(t)) })
        .then(function(hash){ return shim.Buffer.from(hash) });
    }
  
}());
