## Omnia

Omnia is a lightweight module system for building very large Node.js applications. 

### Core Features 

* Built in clustering/crash protection
* A module system 

#### Installation
```sh
$ npm install omnia
```
#### Module System
Building large Node.js apps is hard. The larger they grow, the more difficult it becomes to not throw yourself from your 4th story office window onto the delicious mediterranean food truck below. This is where the module system comes in.

It's quite simple. Create a folder that will contain your modules. Each module is a single file that looks like this.
```javascript
module.exports = function (app, register) {
  // module code here
};
```
You could, for instance, have 2 modules in your `modules` folder.
```javascript
// cats
module.exports = function (app, register) {

  app.put('/cats/:name', function (req, res) {
    var catName = req.params.name;
    var catData = req.body.catData;

    // add cat to cat database

    res.end(200);
  });

  function speak () {
    console.log("meow!");
  }


  register({
    speak: speak
  });
};
```
`register()` must be called to register the module with Omnia. 
```javascript
// dogs
module.exports = function (app, cats, register) {

  app.put('/dogs/:name', function (req, res) {
    var dogName = req.params.name;
    var dogData = req.body.dogData;

    // add dog to dog database

    res.end(200);
  });

  // access to dependencies
  cats.speak();

  register();
};
```
You `modules` folder must contain an `index.json` file that looks like this:
```json
{
  "cats": {
    "dependencies": ["app"]
  },
  "dogs": {
    "dependencies": ["app", "cats"]
  }
}
```
And finally, your main `server.js` (or whatever you typically name this file) will look something like this:
```javascript
var omnia = require('omnia');
var express = require('express');

var app = express();

omnia.register("app", app); // this is how you register arbitrary objects so modules have access to them
omnia.initialize(__dirname + '/modules/'); // trailing slash is optional

omnia.run(app, 5000); // omnia.run takes a callback of the form function (req, res) { . . . }
```
#### Module Directory Structure
This describes the above example.
```sh
/app
 |-- server.js
 |-- app/modules
      |-- cats.js
      |-- dogs.js
      |-- index.json
```
#### Clustering
Clustering is built into Omnia. When using environments like Heroku (like we do), it's difficult (impossible) to use tools like Forever or PM2.
```javascript
omnia.run(app, 5000);
```
Calling this will start your application on all available cores, and will keep at least a single instance alive in the event of a crash or an exception. If you have no need for this, you can simply pass a callback to `omnia.initialize` which will execute once omnia has finished initializing.
```javascript
var http = require('http');
var omnia = require('omnia');
var express = require('express');

var app = express();

omnia.register("app", app);
omnia.initialize(__dirname + '/modules/', function () {
    http.createServer(app).listen(5000);
});
```