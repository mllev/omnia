var cluster = require('cluster');
var domain = require('domain');
var fs = require('fs');
var http = require('http');

var cpuCount = require('os').cpus().length;

var omnia = {};

omnia.modules = {};
omnia.pending = [];

omnia.run = function (fn, port) {
  register(function (err) {
    if (err) {
      throw new Error(err);
    }
    var server = http.createServer(function (req, res) {
      var d = domain.create();
      d.on('error', function(e) {
        console.error(e.stack);
        server.close();
        cluster.worker.disconnect();
        res.status(500).json({
          status: "Server Error",
          message: "Server error. Instance disconnected."
        });
        process.exit(1);
      });
      d.add(req);
      d.add(res);
      d.run(function() {
        fn(req, res);
      });
    });
    if (cluster.isMaster) {
      for (var i = 0; i < cpuCount; i++) {
        cluster.fork();
      }
      cluster.on('disconnect', function(worker) {
        cluster.fork();
      });
      return;
    }
    server.listen(port || 3000);
  });
};

omnia.define = function (name, deps, fn) {
  if ("function" === typeof deps) {
    fn = deps;
    deps = [];
  }
  omnia.pending.push({
    name: name,
    deps: deps,
    fn: fn
  });
  return this;
};

omnia.register = function (name, obj) {
  omnia.modules[name] = obj;
  
  return this;
};

function register (done) {
  var max = omnia.pending.length;
  (function load (index) {
    if (index >= max) {
      done();
      return;
    }
    var def = omnia.pending[index];
    var name = def.name;
    var fn = def.fn;
    var deps = {};
    var args = [];
    def.deps.forEach(function (dep) {
      if (omnia.modules[dep] === undefined) {
        try {
          omnia.modules[dep] = require(dep);
        } catch (e) {
          done(dep + " is not a module or is not yet initialized.");
        }
      }
      args.push(omnia.modules[dep]);
    });

    args.push(function (module) {
      omnia.modules[name] = module;
      if (index <= max - 1) {
        load(index + 1);
      }
    });
    fn.apply({}, args);
  })(0);
};

omnia.initialize = (function (path, done) {
  var modulesPath = path + (path[path.length - 1] === '/' ? '' : '/') + 'index.json';
  var moduleTree = JSON.parse(fs.readFileSync(modulesPath));
  for (var module in moduleTree) {
    this.define(module, moduleTree[module].dependencies, require(path + module));
  }
  if (done && "function" === typeof done) {
    register(function (err) {
      if (err) {
        throw new Error(err);
      }
      done();
    });
  }

}).bind(omnia);

module.exports = omnia;
