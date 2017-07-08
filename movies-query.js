'use strict';

const limberest = require('./lib/limberest');

// Locations can be on the file system, at a url, or in html5 local storage.
// The second option works seamlessly for file system or local storage.
// const testsLoc = 'https://github.com/limberest/limberest-demo/tree/master/test';
const testsLoc = '../limberest-demo/test';
  
var env = limberest.env(testsLoc + '/localhost.env');

var group = limberest.group(testsLoc + '/limberest-demo.postman');

var options = {
  location: testsLoc,
  resultLocation: './results',
  logLocation: './results',
  debug: true,
};

var test = group.test('GET', 'movies?{query}');

var values = Object.assign({}, env);
values.query = 'year=1935&rating=5';

test.run(values, options, (response, result, error) => {
  console.log("RES:\n" + JSON.stringify(result, null, 2));
});
