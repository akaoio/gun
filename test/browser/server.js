var http = require('http');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '../..');
var files = {
  '/': path.join(__dirname, 'fixtures', 'index.html'),
  '/gun.js': path.join(root, 'gun.js'),
  '/sea.js': path.join(root, 'sea.js'),
  '/lib/opfs.js': path.join(root, 'lib', 'opfs.js'),
  '/lib/radix.js': path.join(root, 'lib', 'radix.js'),
  '/lib/radisk.js': path.join(root, 'lib', 'radisk.js'),
  '/lib/store.js': path.join(root, 'lib', 'store.js'),
  '/lib/rindexed.js': path.join(root, 'lib', 'rindexed.js')
};

function type(file) {
  if (/\.html$/.test(file)) { return 'text/html; charset=utf-8' }
  if (/\.js$/.test(file)) { return 'application/javascript; charset=utf-8' }
  return 'text/plain; charset=utf-8';
}

var server = http.createServer(function(req, res) {
  var file = files[req.url];
  if (!file) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  fs.readFile(file, function(err, data) {
    if (err) {
      res.writeHead(500);
      res.end(err.message);
      return;
    }
    res.writeHead(200, {'Content-Type': type(file), 'Cache-Control': 'no-store'});
    res.end(data);
  });
});

server.listen(8766, '127.0.0.1', function() {
  console.log('Browser test server listening on http://127.0.0.1:8766');
});
