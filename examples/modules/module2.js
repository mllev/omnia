module.exports = function (omnia, register) {

  // grab the dependencies
  // by declaring them in the json, they are guaranteed to be initialized
  var module1 = omnia.modules.module1;
  
  module1.func();

  register();
};