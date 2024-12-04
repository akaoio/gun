;(function(){

    var User = require('./user'), SEA = User.SEA, Gun = User.GUN;
    User.prototype.recall = function (opt, cb) {
      var gun = this, root = gun.back(-1), sS;
      opt = opt || {};
      if (opt.sessionStorage && SEA.window) {
        try {
          sS = SEA.window.sessionStorage || {};
          if (sS.recall || sS.pair) {
            root._.opt.remember = true;
            (gun.back('user')._).opt.remember = true;
            root.user().auth(JSON.parse(sS.pair), cb); // pair is more reliable than alias/pass
          }
        } catch (e) {}
      }
      return gun;
    }
  
}());