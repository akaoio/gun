;(function(){

    var SEA = require('./root');
    try {
      if (SEA.window && location.protocol.indexOf('s') < 0 && !/^(localhost|127\.\d+\.\d+\.\d+|blob:|file:|null)$/.test(location.hostname)) {
        console.warn('HTTPS needed for WebCrypto in SEA, redirecting...');
        location.protocol = 'https:'; // WebCrypto does NOT work without HTTPS!
      }      
    } catch (e) { }
  
}());