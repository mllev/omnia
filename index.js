/**
 * omnia
 * author - matthew levenstein
 * license - MIT
 */
 
var url = require('url');
var qs = require('querystring');
var cluster = require('cluster');
var http = require('http');
var domain = require('domain');
var fs = require('fs');

/**
 * expose the app object
 **/

module.exports = app = {};

/**
 * the main app handler
 * pass as the handler to http.createServer()
 **/

app.handler = function (req, res) {
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
};

/**
 * the object of {method => {path => handler}} functions
 **/

app.handlers = {get: {}, post: {}, put: {}, del: {}};

/**
 * object for holding app modules and pending modules
 */

app.modules = {};
app.pending = [];

/**
 * this objects handles the router functions
 */

app.router = {};

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

    if (!app.handlers[method][param]) {
      continue;
    }

    handler = app.handlers[method][param];

    if (handler.totalCount == l-1 || handler.totalCount - handler.optionalCount == l-1) {
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

  if (app.handlers[method][newRoute]) {
    app.handlers[method][newRoute].fns.push(fn);
  } else {
    details.totalCount = totalCount;
    details.requiredCount = requiredCount;
    details.optionalCount = optionalCount;
    details.fns.push(fn);

    app.handlers[method][newRoute] = details;
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
  }).bind(app.router);
}

/**
 * assign callbacks to verbs and routes
 * 
 * example:
 *
 * app.router.get('/user/:name', function (req, res) {
 *   res.end(req.params.name);
 * });
 *
 **/

app.router.post = assign('post');
app.router.get = assign('get');
app.router.put = assign('put');
app.router.del = assign('del');

/**
 * use node cluster under the hood
 * listen for and handle uncaught exceptions 
 */

app.listen = function (port) {
  app.register(function (err) {
    if (err) {
      // app failed to initialize
      throw new Error(err);
    }

    if (cluster.isMaster) {
      cluster.fork();

      cluster.on('disconnect', function(worker) {
        console.error('Instance disconnected.');
        cluster.fork();
      });

      return;
    }

    var server = http.createServer(function (req, res) {
      var d = domain.create();

      d.on('error', function(e) {
        console.log(e.stack);
        try {
          server.close();
          cluster.worker.disconnect();
          res.statusCode = 500;
          res.setHeader('content-type', 'text/plain');
          res.end('Server error.');
          process.exit(1);
        } catch (e2) {
          console.error('Error sending 500.', e2.stack);
        }
      });

      d.add(req);
      d.add(res);

      d.run(function() {
        app.handler(req, res);
      });
    }).listen(port || 5000);
  });
};

/**
 * keep track of modules definitions and dependencies
 */

app.define = function (name, deps, fn) {

  if ("function" === typeof deps) {
    fn = deps;
    deps = [];
  }

  app.pending.push({
    name: name,
    deps: deps,
    fn: fn
  });

  return this;
};

/**
 * load modules and dependencies asynchronously
 */

app.register = function (done) {
  var max = app.pending.length;

  (function load (index) {
    if (index >= max) {
      done();
      return;
    }

    var def = app.pending[index];
    var name = def.name;
    var fn = def.fn;
    var deps = {};

    def.deps.forEach(function (dep) {
      if (!app.modules[dep]) {
        throw new Error(dep + " is not a module or is not yet initialized.");
      }
    });

    fn(app, function (module) {
      app.modules[name] = module;

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

app.initialize = (function (path) {
  var moduleTree = JSON.parse(fs.readFileSync(path + 'index.json'));

  for (var module in moduleTree) {
    this.define(module, moduleTree[module].dependencies, require(path + module));
  }

}).bind(app);
