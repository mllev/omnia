module.exports = function (app, register) {

  app.get('/users/:name?', function (req, res, next) {
    if (req.params.name === "matt")
      throw new Error("Ew");
    next();
  });

  app.get('/users/:name?', function (req, res) {
    console.log(req.params.name);
    res.end("Hello " + req.params.name + "!");
  });

  app.post('/:one/:two/:three', function (req, res) {
    res.json(req.body);
  });

  register({
    func: function () {
      console.log('Module func.');
    }
  });
};