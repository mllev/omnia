module.exports = function (app, register) {
  var module1 = app.modules.module1;
  
  module1.func();

  register();
};