;(function(){
var W = window, D = document, SW = screen.width, SH = screen.height, ON = 'addEventListener', HI = 'createElement', ID = 'getElementById', U, DEV = ('file://'===location.origin);
;(function(){ if(screen.width > screen.height){ return } // phone only debug
  var add = function(){ if(console.view){ return } (console.view = document[HI]('textarea')).style="position:fixed; z-index:99999; inset:0; width:100%; height:4em; padding: 0; background:rgba(100%,100%,100%,0.8); color:black; transition: 0.5s all; white-space: pre-wrap; overflow-wrap: break-word; word-break: break-all;"; console.view.readOnly = 1; setTimeout(function(){D.body.appendChild(console.view);},99); console.view.onclick = function(eve){ console.view.style.height = ('4em'==console.view.style.height)?'50vh':'4em' ; console.view.select(); D.execCommand('copy'); navigator.clipboard.writeText(console.view.value) } }
  console.log = console.warn = console.error = function(...args){ if(console.off){ return } add(); console.view.value += JSON.stringify(args).slice(1,-1); console.view.scrollTop = console.view.scrollHeight; }
  window.onerror = window.onunhandledrejection = console.log;
}());
var tmp = D[HI]('meta'); tmp.name = 'viewport'; tmp.content = 'width=device-width, initial-scale=1, interactive-widget=resizes-content'; D.head.appendChild(tmp);
//(tmp=D[HI]('link')).rel="stylesheet"; tmp.href=((D.currentScript||'').src||'').replace('.js','.css'); D.head.appendChild(tmp); // auto-add CSS?
W.parent === W && ((tmp = D.head.parentNode.style)['overscroll-behavior-y'] = 'contain') && (tmp['background-color'] = 'var(--fill)');
function LOAD(src, h, s){ (s = D[HI]('script')).onload = h; s.src = src; D.head.appendChild(s) };
function MAP(scroll, screen){ return (scroll / screen)>>0 }; // scroll, screen
kit = function(){};
// dip, dive, into, eat, lid, tin, key, face
kit.ear = function(h,e,v){ (v=v||W)[ON](e=(h.call?(h.where=e):(e.where=h,(h=e).where))||'',h); h.off = function(){ v.removeEventListener(e,h) }; W===v&&kit.up(e,'ear'); return h; };
kit.say = function(d,e,v,s){ (v=v||W).dispatchEvent(new CustomEvent(e=e||'',{detail:d,bubbles:true})); !s&&(W===v)&&kit.up(d,e) };
kit.up = function up(data,type,tmp){
  if(W === W.parent){ return }
  if(U === data){ return } // TODO: BUG? maybe allow?
  if('message' == type){ return }
  //console.log(location.pathname.split('/').slice(-1)[0], "SENDING UP", type, data);
  W.parent.postMessage({detail:data,type:type,wrap:1},DEV?'*':location.origin);
}
W[ON]('message',function(eve,data,i,tmp){
  if(W === eve.source){ return }
  if(eve.origin !== (DEV?'null':location.origin)){//.replace('file://','')||'null')){
    eve.preventDefault();
    eve.stopImmediatePropagation();
    eve.stopPropagation();
    return;
  }
  if(U === (data = eve.data||eve.detail)){ return } // TODO: BUG? maybe allow?
  if(!(i = kit.views.get(eve.source))){ // no iframe view? then message coming down to us from above.
    //console.log(location.pathname.split('/').slice(-1)[0], "GOT FROM ABOVE:", eve);
    kit.say(data.data||data.detail,data.type,0,1);
    return;
  }
  if('ear'==data.type){ kit.ear(data.detail||data.data,function hear(eve){ if(!(i||'').contentWindow){hear.off(); return } i.contentWindow.postMessage({data:eve.detail||eve.data,type:eve.type,wrap:-1}, DEV?'*':location.origin) }); return; }
  kit.say(data.data||data.detail,data.type,i);
});
kit.views = new Map;
(kit.watch = new MutationObserver(function(eve,b,low){eve.forEach(function(changes){changes.addedNodes.forEach(function(node){ //console.log("observed change on", node);
  node.dispatchEvent(new CustomEvent('join '+node.nodeName.toLowerCase(), {bubbles:true}));
  node.dispatchEvent(new CustomEvent('join', {bubbles:true}));
  //low = kit.watch.low(node, low); 
})});
  //console.log(location.pathname.split('/').slice(-1)[0], "LOWEST", low, kit.watch.low(D.body), D.body.scrollHeight);
  kit.up({height:D.body.scrollHeight,width:D.body.scrollWidth},'style');
})).observe(D.documentElement||D,{childList:true,subtree:true,characterData:true});

kit.watch.low = function(v,l,f){ f='getBoundingClientRect'; return Math.max(((v[f]?v[f]():'').bottom||0) + (W.pageYOffset || D.documentElement.scrollTop),l||0) }
kit.ear('join iframe',kit.add=function(eve){
  //console.log(location.pathname.split('/').slice(-1)[0], "JOIN");
  kit.views.set(eve.target.contentWindow, eve.target);
});
kit.ear('style',function(eve,i){
  if(!eve.target || !eve.target.style){ return }
  //console.log(location.pathname.split('/').slice(-1)[0], "resize:", eve.target, eve.detail);
  var h = (eve.detail||'').height; if(h) eve.target.style.height = isNaN(h) ? h : h+'px';
  var w = (eve.detail||'').width; if(w) eve.target.style.width = isNaN(w) ? w : w+'px';
},document);
kit.http = {createServer: function(h){
  h.listen = function(port,ip,cb){cb&&cb()};
  return kit.server = h;
},serve: function(req, res){ if(W.parent !== W){ return }
  kit.fs.createReadStream(req.url).pipe(res);
},req:function(path,body){ return this._last={url:path,
  method:body?'POST':'GET',body:body,
  headers:{},rawHeaders:[],rawTrailers:[],
  socket:tmp={},client:tmp,connection:tmp,
  resume: function(){},
  pause: function(){},
  isPaused: function(){}
}},res:function(end){ return {_req:this._last,
  end: end||kit.http.end,
  getHeader: function(){},
  setHeader: function(name, value){},
  writeHead: function(statusCode,headers){},
  write: function(data){},
  pipe: function(){}
}},end:function(data,id,i){
  id = this._req.url.replace(location.__dirname,'').replace('file://','')/*.replace('.html','')*/.split('#')[0];
  //console.log("http.end", id, data, 'URL:', this._req.url);
  //(i = ((data||'').src? data : (D[ID](id) || D[HI]('iframe')))).id || (i.id = id);
  (i = D[ID](id) || D[HI]('iframe')).id || (i.id = id);
  D.querySelectorAll('.main').forEach(function(e){ e.classList.remove('main') });
  i.className = 'main page'; i.src||(i===D.body)||(i.srcdoc = data, D.body.appendChild(i)); location.hash = i.id; // TODO: BUG? Prevent double hash change
}};
W[ON]('submit', function(eve, act){ eve.preventDefault();
  act = (eve.target.action||'').replace(location.__dirname+'/','').split('#')[0];
  //console.log(location.pathname.split('/').slice(-1)[0], 'submit', act);
  (kit.server||kit.http.serve)(
    kit.http.req(act,Object.fromEntries(new FormData(eve.target))),
    kit.http.res()
  );
});
location.__dirname = location.href.split('/').slice(0,-1).join('/');
Object.defineProperty(location, 'path', {
  get(){ return kit.path },
  set(path){ if(!path){ return }
    path = path.replace(location.__dirname,'');
    if('.' == path[0]){ path = path.slice(1) }
    if('/' == path[0]){  path = path.slice(1) }
    //console.log(location.pathname.split('/').slice(-1)[0], 'path=', path, kit.path);
    if(kit.path === (kit.path = path)){ return }
    (kit.server||kit.http.serve)(kit.http.req(path),kit.http.res());
  }
});
kit.querystring = {
  parse: function(qs){ return Object.fromEntries((new URLSearchParams(qs)).entries()) }
}
kit.fs = {files:{},
  createReadStream(url){ url = (url||'').replace(location.__dirname+'/','').split('#')[0];
    //console.log("fs.cRS:", url);
    var data = this.files[url], end = 0, tmp;
    return {_:{},
      on(eve,cb){ this._[eve] = cb; 'open'==eve&&setTimeout(cb, 0); return this }, // fake immediate open
      pipe(dest){ var rs = this, i;
        if(end){ return dest } end = 1;
        function load(){ (data = i).onload = 0;;
          if(!data){ return (tmp=rs._.error)&&tmp({code:'ENOENT'}) }
          (tmp=rs._.data)&&tmp(data);
          (tmp=rs._.end)&&tmp();
          dest.end(data);
        };
        if(i = D[ID](url)){ setTimeout(load,0) }
        else {
          (i = D[HI]('iframe')).onload = load
          i.id = (i.src = url)/*.replace('.html','')*/; D.body.appendChild(i);
        }
        //setTimeout(i.onload,0);
        return dest;
      }
    };
  }, readFileSync: function(path){

  }, readFile: function(path,opt,cb){

  }, writeFileSync: function(path,data){

  }, writeFile: function(path,data,opt,cb){

  }, createWriteStream: function(path,opt){

  }, readdir: function(path,cb){

  }
};
W[ON]('DOMContentLoaded',function(m){
  //m = D[HI]('main'); while(D.body.firstChild){ m.appendChild(D.body.firstChild) } D.body.appendChild(m);
  m=D.body;m.className = 'main page'; m.id = (kit.path = location.href.replace(location.__dirname+'/','').split('#')[0])/*.replace('.html','')*/;
  //console.log(location.pathname.split('/').slice(-1)[0], "kit hash add!");
  (function(){ function change(eve){ eve = eve||''; eve = eve.detail||eve.data||eve;
    var hash = (eve.newURL||'').split('#')[1]||'';
    if('.' == hash[0]){ location.hash = hash.slice(1); return; }
    if('/' == hash[0]){ location.hash = hash.slice(1); return; }
    //console.log(location.pathname.split('/').slice(-1)[0], "kit hashchange", hash, 'eve:', eve);
    if(!eve && !hash){ return }
    location.path = hash;
    eve && kit.up({newURL: eve.newURL, oldURL: eve.oldURL},'hashchange');
  }; W[ON]('hashchange',change) }());
  kit.up('','load');
  return;
  //if(location.hash){ kit.say('','hashchange') }
});
}());
