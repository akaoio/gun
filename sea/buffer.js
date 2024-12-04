;(function(){

    require('./base64');
    // This is Buffer implementation used in SEA. Functionality is mostly
    // compatible with NodeJS 'safe-buffer' and is used for encoding conversions
    // between binary and 'hex' | 'utf8' | 'base64'
    // See documentation and validation for safe implementation in:
    // https://github.com/feross/safe-buffer#update
    var SeaArray = require('./array');
    function SafeBuffer(...props) {
      console.warn('new SafeBuffer() is depreciated, please use SafeBuffer.from()')
      return SafeBuffer.from(...props)
    }
    SafeBuffer.prototype = Object.create(Array.prototype)
    Object.assign(SafeBuffer, {
      // (data, enc) where typeof data === 'string' then enc === 'utf8'|'hex'|'base64'
      from() {
        if (!Object.keys(arguments).length || arguments[0] == null) {
          throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
        }
        var input = arguments[0]
        var buf
        if (typeof input === 'string') {
          var enc = arguments[1] || 'utf8';

          switch (enc) {
            case 'hex':
              var bytes = (input.match(/([\da-fA-F]{2})/g) || []).map(byte => parseInt(byte, 16));
              if (!bytes.length) throw new TypeError('Invalid first argument for type \'hex\'.');
              buf = SeaArray.from(bytes);
              break;

            case 'utf8':
            case 'binary':
              var words = new Uint16Array(input.length);
              Array.from({ length: input.length }, (_, i) => words[i] = input.charCodeAt(i));
              buf = SeaArray.from(words);
              break;

            case 'base64':
              var dec = atob(input);
              var bytesBase64 = new Uint8Array(dec.length);
              Array.from({ length: dec.length }, (_, i) => bytesBase64[i] = dec.charCodeAt(i));
              buf = SeaArray.from(bytesBase64);
              break;

            default:
              console.info('SafeBuffer.from unknown encoding:', enc);
          }

          return buf;
        }        
        var byteLength = input.byteLength // what is going on here? FOR MARTTI
        var length = input.byteLength ? input.byteLength : input.length
        if (length) {
          var buf
          if (input instanceof ArrayBuffer) {
            buf = new Uint8Array(input)
          }
          return SeaArray.from(buf || input)
        }
      },
      // This is 'safe-buffer.alloc' sans encoding support
      alloc(length, fill = 0 /*, enc*/) {
        return SeaArray.from(new Uint8Array(Array.from({ length: length }, () => fill)))
      },
      // This is normal UNSAFE 'buffer.alloc' or 'new Buffer(length)' - don't use!
      allocUnsafe(length) {
        return SeaArray.from(new Uint8Array(Array.from({ length: length })))
      },
      // This puts together array of array like members
      concat(arr) { // octet array
        if (!Array.isArray(arr)) {
          throw new TypeError('First argument must be Array containing ArrayBuffer or Uint8Array instances.')
        }
        return SeaArray.from(arr.reduce((ret, item) => ret.concat(Array.from(item)), []))
      }
    })
    SafeBuffer.prototype.from = SafeBuffer.from
    SafeBuffer.prototype.toString = SeaArray.prototype.toString

    module.exports = SafeBuffer;
  
}());