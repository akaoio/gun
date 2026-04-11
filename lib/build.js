var fs = require('fs');
var nodePath = require('path');

var dir = __dirname + '/../';
var compatMarker = '/* BELOW IS TEMPORARY FOR OLD INTERNAL COMPATIBILITY';

function read(path) {
	return fs.readFileSync(nodePath.join(dir, path)).toString();
}

function write(path, data) {
	return fs.writeFileSync(nodePath.join(dir, path), data);
}

var seaModules = [
	'root',
	'https',
	'base64',
	'array',
	'buffer',
	'shim',
	'base62',
	'settings',
	'sha256',
	'sha1',
	'work',
	'pair',
	'sign',
	'verify',
	'aeskey',
	'encrypt',
	'decrypt',
	'secret',
	'certify',
	'sea',
	'user',
	'then',
	'create',
	'auth',
	'recall',
	'share',
	'index'
];

var gunModules = [
	'shim',
	'onto',
	'book',
	'valid',
	'state',
	'dup',
	'ask',
	'root',
	'back',
	'chain',
	'get',
	'put',
	'core',
	'index',
	'on',
	'map',
	'set',
	'mesh',
	'websocket',
	'localStorage'
];

var builds = {
	gun: {
		output: 'gun.js',
		baseDir: 'src',
		modules: gunModules,
		unbuildPrelude: 'src/polyfill/unbuild.js',
		trailer: function(){
			var text;
			try{ text = read('gun.js') } catch(e){ return '' }
			var i = text.indexOf(compatMarker);
			if(i < 0){ return '' }
			return '\n\n' + text.slice(i).replace(/^\s+|\s+$/g, '') + '\n';
		},
		format: {outer: '\t', inner: '\t\t'}
	},
	sea: {
		output: 'sea.js',
		baseDir: 'sea',
		modules: seaModules,
		format: {outer: '  ', inner: '    '}
	}
};

function normalizeContent(code) {
	code = code.replace(/^\s*;?\s*\(\s*function\s*\(\s*\)\s*\{/, '');
	code = code.replace(/\}\s*\(\s*\)\s*\)?\s*;?\s*$/, '');
	var lines = code.split('\n');
	var minIndent = Infinity;
	lines.forEach(function(line){
		if(line.trim().length > 0){
			var indent = (line.match(/^\s*/) || [''])[0].length;
			minIndent = Math.min(minIndent, indent);
		}
	});
	if(minIndent === Infinity){ return '' }
	return lines.map(function(line){
		if(!line.trim().length){ return '' }
		return line.slice(minIndent);
	}).join('\n').trim();
}

function replaceRequires(code) {
	var inUnbuild = false;
	return code.split('\n').map(function(line){
		if(line.indexOf('/* UNBUILD */') >= 0){
			inUnbuild = !inUnbuild;
			return line;
		}
		if(inUnbuild){ return line }
		return line.replace(/require\(/g, 'USE(');
	}).join('\n');
}

function wrapModule(code, name, format) {
	var lines = replaceRequires(normalizeContent(code)).split('\n');
	var output = format.outer + ';USE(function(module){\n';
	output += lines.map(function(line){
		return line.length ? format.inner + line : '';
	}).join('\n');
	output += '\n' + format.outer + "})(USE, './" + name + "');\n\n";
	return output;
}

function build(arg) {
	var config = builds[arg];
	if(!config){
		console.error('Supported arguments: ' + Object.keys(builds).join(', '));
		process.exit(1);
	}

	var output = ';(function(){\n\n';
	if(config.unbuildPrelude){
		output += '  /* UNBUILD */\n';
		output += read(config.unbuildPrelude).replace(/\s+$/g, '') + '\n';
		output += '  /* UNBUILD */\n\n';
	}

	config.modules.forEach(function(name){
		var code = read(nodePath.join(config.baseDir, name + '.js'));
		output += wrapModule(code, name, config.format);
	});

	output += '}());';
	if(config.trailer){ output += config.trailer() }
	write(config.output, output);
	console.log('Built ' + config.output);
}

if(require.main === module){
	build(process.argv[2]);
}

module.exports = build;
