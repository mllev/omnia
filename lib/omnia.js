var url = require('url');
var qs = require('querystring');
var cluster = require('cluster');
var http = require('http');
var domain = require('domain');
var fs = require('fs');
var numCPUs = require('os').cpus().length;

/**
 * the main omnia handler
 * pass as the handler to http.createServer()
 **/

function omnia (req, res) {
  if (omnia.registered) {
    handler(req, res);
    return;
  }

  register(function (err) {
    if (err) {
      throw new Error(err);
    }
    
    omnia.registered = true;
    handler(req, res);
  });
}

/**
 * the object of {method => {path => handler}} functions
 **/

omnia.handlers = {get: {}, post: {}, put: {}, del: {}};

/**
 * object for holding omnia modules and pending modules
 */

omnia.modules = {};
omnia.pending = [];

/**
 * this objects handles the router functions
 */

omnia.router = {};

function parseBody (req, body) {
  try {
    if (req.headers['content-type'].indexOf('json') !== -1) {
      req.body = JSON.parse(body);
    } else {
      req.body = qs.parse(body);
    }
  } catch (e) {
    req.body = {};
  }
}

function handler (req, res) {
  var parsed = url.parse(req.url, true);
  var query = parsed.query;
  var path = parsed.pathname;
  var resEnd = res.end.bind(res);
  var body = '';
  var method = req.method.toLowerCase();

  req.query = query || {};
  req.params = {};

  if (method === "delete") {
    method = "del";
  }

  res.end = (function (out) {
    if (!isNaN(parseFloat(out)) && isFinite(out)) {
      res.statusCode = out;
      resEnd();
    } else {
      res.statusCode = 200;
      resEnd(out);
    }
  }).bind(res);

  res.json = (function (out) {
    if ("object" !== typeof out) {
      throw new Error("Parameter must be an object.");
    }

    this.end(JSON.stringify(out, null, 2));
  }).bind(res);

  if (method === 'post' || method === 'put') {
    req.on('data', function (data) {
      body += data;

      if (body.length > 1e6) {
        req.connection.destroy();
      }
    });
    req.on('end', function () {
      parseBody(req, body);
      execHandlers(req, res, path, method);
    });
  } else {
    execHandlers(req, res, path, method);
  }
}

function execHandlers (req, res, path, method) {
  var params = path.split('/');
  var found = false;
  var handler = null;
  var param = '';

  for (var i = 0, l = params.length; i < l; i++) {
    if (param === '/') {
      param = '';
    }

    param += ('/' + params[i]);

    if (!omnia.handlers[method][param]) {
      continue;
    }

    handler = omnia.handlers[method][param];

    if (handler.totalCount !== l-1 && handler.totalCount - handler.optionalCount !== l-1) {
      continue;
    }
    
    var counter = 0;

    while (i < l - 1) {
      req.params[handler.additional[counter++].name] = params[++i];
    }

    (function (index) {
      (function next (err) {
        if (err) {
          throw new Error(err);
        }

        handler.fns[index++](req, res, next);
      })(null);
    })(0);

    found = true;
    break;
  }

  if (!found) {
    res.statusCode = 404;
    res.end("cannot " + method + " " + path);
  }
}

function parseRoute (method, route, fn) {
  var split = route.split('/');
  var newRoute = [];
  var required;
  var totalCount = 0;
  var requiredCount = 0;
  var optionalCount = 0;
  var details = {
    additional: [],
    fns: []
  };

  for (var i = 0, l = split.length; i < l; i++) {
    var param = split[i];

    if (!param) {
      continue;
    }

    totalCount++;

    if (param.indexOf(':') != 0) {
      newRoute.push(param);
      continue;
    }

    param = param.slice(1, param.length);
    required = (param.indexOf('?') != param.length - 1);

    if (!required) {
      optionalCount++;
      param = param.slice(0, -1);
    } else {
      requiredCount++;
    }

    details.additional.push({
      name: param,
      required: required
    });
  }

  newRoute = '/' + newRoute.join('/');

  if (omnia.handlers[method][newRoute]) {
    omnia.handlers[method][newRoute].fns.push(fn);
  } else {
    details.totalCount = totalCount;
    details.requiredCount = requiredCount;
    details.optionalCount = optionalCount;
    details.fns.push(fn);

    omnia.handlers[method][newRoute] = details;
  }
}

function assign (method) {
  return (function (route, fn) {
    if (!route || !fn) {
      throw new Error("This function takes 2 arguments");
    }

    if ("string" !== typeof route) {
      throw new Error("First argument must be a route.");
    }

    if ("function" !== typeof fn) {
      throw new Error("Second argument must be a callback.");
    }

    parseRoute(method, route, fn);
    return this;
  }).bind(omnia.router);
}

/**
 * assign callbacks to verbs and routes
 * 
 * example:
 *
 * omnia.router.get('/user/:name', function (req, res) {
 *   res.end(req.params.name);
 * });
 *
 **/

omnia.router.post = assign('post');
omnia.router.get = assign('get');
omnia.router.put = assign('put');
omnia.router.del = assign('del');

/**
 * use node cluster under the hood
 * listen for and handle uncaught exceptions 
 */

omnia.run = function (port) {
  register(function (err) {
    if (err) {
      // omnia failed to initialize
      throw new Error(err);
    }

    omnia.registered = true;

    var server = http.createServer(function (req, res) {
      var d = domain.create();

      d.on('error', function(e) {
        server.close();
        cluster.worker.disconnect();
        res.statusCode = 500;
        res.setHeader('content-type', 'text/plain');
        res.end('Server error.');
        process.exit(1);
      });

      d.add(req);
      d.add(res);

      d.run(function() {
        omnia(req, res);
      });
    });

    if (cluster.isMaster) {

      for (var i = 0; i < numCPUs; i++) {
        cluster.fork();
      }

      cluster.on('disconnect', function(worker) {
        console.error('Instance disconnected.');
        cluster.fork();
      });

      return;
    }

    server.listen(port || 5000);
  });
};

/**
 * keep track of modules definitions and dependencies
 */

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

/**
 * load modules and dependencies asynchronously
 */

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

    def.deps.forEach(function (dep) {
      if (!omnia.modules[dep]) {
        try {
          omnia.modules[dep] = require(dep);
        } catch (e) {
          throw new Error(dep + " is not a module or is not yet initialized.");
        }
      }
    });

    fn(omnia, function (module) {
      omnia.modules[name] = module;

      if (index <= max - 1) {
        load(index + 1);
      }
    });
  })(0);
};

/**
 * instead of defining individual modules,
 * use this function to load them from a json
 */

omnia.initialize = (function (path) {
  var modulesPath = path + (path[path.length - 1] === '/' ? '' : '/') + 'index.json';
  var moduleTree = JSON.parse(fs.readFileSync(modulesPath));

  for (var module in moduleTree) {
    this.define(module, moduleTree[module].dependencies, require(path + module));
  }

}).bind(omnia);

/**
 * expose the omnia object
 **/

module.exports = omnia;
