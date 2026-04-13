// Generates .esm.js ESM companion files for lib/*.js plugin files.
// Each IIFE lib file already runs safely in browser ESM context (require() calls
// are guarded by typeof checks and never executed in the browser). This script
// just appends an `export default` statement so callers can import the value
// instead of reading it from globalThis.
var fs = require('fs')
var path = require('path')
var dir = path.join(__dirname, '../lib')

var exports = {
    'radix.js':    'globalThis.Radix',
    'radisk.js':   'globalThis.Radisk',
    'opfs.js':     'globalThis.ROPFS',
    'rindexed.js': 'globalThis.RindexedDB',
    'store.js':    null, // side-effect only — registers Gun storage plugin
    'pen.js':      'globalThis.pen',
}

Object.keys(exports).forEach(function(file) {
    var src  = path.join(dir, file)
    var dest = path.join(dir, file.replace('.js', '.esm.js'))
    var content = fs.readFileSync(src, 'utf8')
    var global = exports[file]
    content += global
        ? '\nexport default ' + global + ';\n'
        : '\nexport {};\n'
    fs.writeFileSync(dest, content)
    console.log('Created:', path.relative(process.cwd(), dest))
})
