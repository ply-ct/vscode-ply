'use strict';

// example limberest-js test case
const limberest = require('./lib/limberest');
const testLoc = '../limberest-demo/test';
const caseLoc = testLoc + '/cases';
const resultsLoc = testLoc + '/results'; 
  
var env = limberest.env(testLoc + '/localhost.env');
env.resultsDir = resultsLoc;

var group = limberest.group(testLoc + '/limberest-demo.postman');

var test = group.test('PUT', 'movies/{id}');
var values = Object.assign({}, env);
values.id = '5c0a01b6';
var testRun = test.run(values, (response, result) => {
  console.log("RESP:\n" + JSON.stringify(response, null, 2));
  console.log("RES:\n" + JSON.stringify(result, null, 2));
  console.log("RUN:\n" + JSON.stringify(testRun, null, 2));
});
