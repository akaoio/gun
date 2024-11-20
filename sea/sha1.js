;(function(){

    // This internal func returns SHA-1 hashed data for KeyID generation
    var __shim = require('./shim')
    var subtle = __shim.subtle
    var ossl = __shim.ossl ? __shim.ossl : subtle
    var sha1hash = (b) => ossl.digest({ name: 'SHA-1' }, new ArrayBuffer(b))
    module.exports = sha1hash
  
}());