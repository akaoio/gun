;(function(){

    var u, root = (typeof globalThis !== "undefined") ? globalThis : (typeof global !== "undefined" ? global : (typeof window !== "undefined" ? window : this));
    var native = {}
    native.btoa = (u+'' != typeof root.btoa) && root.btoa;
    native.atob = (u+'' != typeof root.atob) && root.atob;
    if(u+'' == typeof Buffer){
      if(u+'' != typeof require){
        try{ root.Buffer = require("buffer", 1).Buffer }catch(e){ console.log("Please `npm install buffer` or add it to your package.json !") }
      }
    }
    if(u+'' != typeof Buffer){
      root.btoa = function(data){ return Buffer.from(data, "binary").toString("base64").replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');};
      root.atob = function(data){
        var tmp = data.replace(/-/g, '+').replace(/_/g, '/')
        while(tmp.length % 4){ tmp += '=' }
        return Buffer.from(tmp, "base64").toString("binary");
      };
      return;
    }
    if(native.btoa){
      root.btoa = function(data){ return native.btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); };
    }
    if(native.atob){
      root.atob = function(data){
        var tmp = data.replace(/-/g, '+').replace(/_/g, '/')
        while(tmp.length % 4){ tmp += '=' }
        return native.atob(tmp);
      };
    }
  
}());