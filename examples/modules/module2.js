module.exports = function (omnia, module1, register) {

  // grab the dependencies
  // by declaring them in the json, they are guaranteed to be initialized
  
  module1.func();

  register();
};