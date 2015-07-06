var omnia = require('../lib/omnia');
var http = require('http');
var express = require('express');
var app = express();

omnia.register("app", app);
omnia.initialize(__dirname + '/modules/');

omnia.run(app, 5000); 