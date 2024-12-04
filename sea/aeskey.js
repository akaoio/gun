;(function(){

    var shim = require('./shim');
    var S = require('./settings');
    var sha256hash = require('./sha256');

    var importGen = async (key, salt, opt = {}) => {
      // Generate the combination of the key and salt (or random value)
      var combo = key + (salt || shim.random(8)).toString('utf8');

      // Hash the combination using SHA-256
      var hash = shim.Buffer.from(await sha256hash(combo), 'binary');

      // Convert the hash to a JWK key
      var jwkKey = S.keyToJwk(hash);

      // Import the key for AES-GCM encryption/decryption
      return await shim.subtle.importKey('jwk', jwkKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    };    
    module.exports = importGen;
  
}());