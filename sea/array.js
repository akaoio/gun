;(function(){

    require('./base64');
    // This is Array extended to have .toString(['utf8'|'hex'|'base64'])
    function SeaArray() { }
    Object.assign(SeaArray, { from: Array.from })
    SeaArray.prototype = Object.create(Array.prototype)
    SeaArray.prototype.toString = function (enc = 'utf8', start = 0, end = this.length) {
      var length = this.length;
      var slice = this.slice(start, end);

      switch (enc) {
        case 'hex':
          return Array.from(slice)
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');

        case 'utf8':
          return String.fromCharCode(...slice);

        case 'base64':
          return btoa(String.fromCharCode(...slice));

        default:
          throw new Error('Unsupported encoding: ' + enc);
      }
    };    
    module.exports = SeaArray;
  
}());