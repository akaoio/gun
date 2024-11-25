var fs = require('fs');
var path = require('path');
var dot = /\.\.+/g;
var slash = /\/\/+/g;

function CDN(dir) {
	return function (req, res) {
		req.url = (req.url || '').replace(dot, '').replace(slash, '/');

		// Set CORS headers first if needed
		if (res.setHeader) {
			res.setHeader('Access-Control-Allow-Origin', '*');
		}

		// Handle GUN requests first
		if (req.url && (0 <= req.url.indexOf('gun.js'))) {
			res.writeHead(200, { 'Content-Type': 'text/javascript' });
			res.end(serve.js = serve.js || require('fs').readFileSync(__dirname + '/../gun.js'));
			return;
		}

		if (req.url && (0 <= req.url.indexOf('gun/'))) {
			var gunPath = __dirname + '/../' + req.url.split('/').slice(2).join('/');
			if ('/' === gunPath.slice(-1)) {
				fs.readdir(gunPath, function (err, dir) {
					res.end((dir || (err && 404)) + '');
				});
				return;
			}
			var S = +new Date;
			var rs = fs.createReadStream(gunPath);
			rs.on('open', function () {
				console.STAT && console.STAT(S, +new Date - S, 'serve file open');
				rs.pipe(res);
			});
			rs.on('error', function (err) {
				if (!res.headersSent) {
					res.writeHead(404, { 'Content-Type': 'text/plain' });
				}
				res.end();
			});
			rs.on('end', function () {
				console.STAT && console.STAT(S, +new Date - S, 'serve file end');
			});
			return;
		}

		// If not a GUN request, handle regular file serving
		fs.stat(path.join(dir, req.url), function (error, stats) {
			if (error) {
				if (!res.headersSent) {
					res.writeHead(404, { 'Content-Type': 'text/plain' });
				}
				return res.end();
			}

			if (stats.isFile()) {
				if (!res.headersSent) {
					if (req.url.slice(-3) === '.js') {
						res.writeHead(200, { 'Content-Type': 'text/javascript' });
					}
				}
				return fs.createReadStream(path.join(dir, req.url)).pipe(res);
			}

			fs.readFile(path.join(dir, 'index.html'), function (error, tmp) {
				if (error) {
					if (!res.headersSent) {
						res.writeHead(404, { 'Content-Type': 'text/plain' });
					}
					return res.end();
				}
				try {
					if (!res.headersSent) {
						res.writeHead(200, { 'Content-Type': 'text/html' });
					}
					res.end(tmp + '');
				} catch (e) { } // or default to index
			});
		});
	}
}

function serve(req, res, next) {
	if (typeof req === 'string') {
		return CDN(req);
	}
	if (!req || !res) { return false }
	next = next || serve;
	if (!req.url) { return next() }

	var tmp;
	if ((tmp = req.socket) && (tmp = tmp.server) && (tmp = tmp.route)) {
		var url;
		if (tmp = tmp[(((req.url || '').slice(1)).split('/')[0] || '').split('.')[0]]) {
			try {
				return tmp(req, res, next);
			} catch (e) {
				console.log(req.url + ' crashed with ' + e);
			}
		}
	}
	return next();
}

module.exports = serve;
