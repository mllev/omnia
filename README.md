## Omnia

Omnia is a lightweight, high performance framework for building very large Node.js applications. 

### Core Features

* A lightweight router
* Built in clustering/crash protection
* A module system 

#### Installation
```sh
$ npm install omnia
```
#### Basic Usage
Getting started with Omnia is basically the same as with any other Express-esque tool.
```javascript
var omnia = require('omnia');

var router = omnia.router;

router.get('/hello/:name', function (req, res) {
  res.end("Hello, " + req.params.name + "!");
});

omnia.listen(5000);
```
#### Router
As mentioned above, Omnia's router is very similar to Express's. What distinguishes it, however, is its lack of bells and whistles, and its usage of data structures that have more predictable performance. It's more of a lightweight layer on top of vanilla javascript, that aids in the creation of RESTful web services. 
```javascript
var omnia = require('omnia');

var router = omnia.router;

router.get('/hello/:name', function (req, res) {
  res.end("Hello, " + req.params.name + "!");
});

router.put('/hello', function (req, res) {
  res.end("Hello, " + req.body.name + "!");
});

omnia.listen(5000);
```
#### Module System
Building large Node.js apps is hard. The larger they grow, the more difficult it becomes to not throw yourself from your 4th story office window onto the delicious mediterranean food truck below. This is where the module system comes in.

It's quite simple. Create a folder that will contain your modules. Each module is a single file that looks like this.
```javascript
module.exports = function (omnia, register) {
  // module code here
};
```
You could, for instance, have 2 modules in your `modules` folder.
```javascript
// dogs
module.exports = function (omnia, register) {
  var router = omnia.router;

  router.put('/dogs/:name', function (req, res) {
    var dogName = req.params.name;
    var dogData = req.body.dogData;

    // add dog to dog database

    res.end(200);
  });

  register();
};
```
`register()` must be called to register the module with Omnia. 
```javascript
// cats
module.exports = function (omnia, register) {
  var router = omnia.router;

  router.put('/cats/:name', function (req, res) {
    var catName = req.params.name;
    var catData = req.body.catData;

    // add cat to cat database

    res.end(200);
  });

  register();
};
```
You `modules` folder must contain an `index.json` file that looks like this:
```json
{
  "cats": {
    "dependencies": []
  },
  "dogs": {
    "dependencies": []
  }
}
```
And finally, your main `server.js` (or whatever you typically name this file) will look something like this:
```javascript
var omnia = require('omnia');

omnia.initialize(__dirname + '/modules/');

omnia.listen(5000);
```