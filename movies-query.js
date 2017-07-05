'use strict';

const limberest = require('./lib/limberest');

const testLoc = '../limberest-demo/test';
  
var env = limberest.env(testLoc + '/localhost.env');

var group = limberest.group(testLoc + '/limberest-demo.postman');

var test = group.test('GET', 'movies?{query}', {
  logDir: testLoc + '/results',
  debug: true,
  overwrite: true
});

var values = Object.assign({}, env);
values.query = 'year=1935&rating=5';
var testRun = test.run(values, (response, result) => {
  console.log("RESP:\n" + JSON.stringify(response, null, 2));
  console.log("RES:\n" + JSON.stringify(result, null, 2));
  console.log("RUN:\n" + JSON.stringify(testRun, null, 2));
});
