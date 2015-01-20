var omnia = require('../lib/omnia');
var http = require('http');

omnia.initialize(__dirname + '/modules/');

//http.createServer(omnia).listen(5000);
omnia.run(5000);