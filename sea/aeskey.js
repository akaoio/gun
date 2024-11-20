;(function(){

    var shim = require('./shim');
    var S = require('./settings');
    var sha256hash = require('./sha256');

    var importGen = async (key, salt, opt) => {
      //var combo = shim.Buffer.concat([shim.Buffer.from(key, 'utf8'), salt || shim.random(8)]).toString('utf8') // old
      opt = opt || {};
      var combo = key + (salt || shim.random(8)).toString('utf8'); // new
      var hash = shim.Buffer.from(await sha256hash(combo), 'binary')

      var jwkKey = S.keyToJwk(hash)
      return await shim.subtle.importKey('jwk', jwkKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
    }
    module.exports = importGen;
  
}());