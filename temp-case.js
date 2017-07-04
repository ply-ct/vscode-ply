'use strict';

// example limberest-js test case
var limberest = require('./lib/limberest');
var testLoc = '../limberest-demo/test';
var caseLoc = testLoc + '/cases';

var env = limberest.env(testLoc + '/limberest.io.env');
console.log("ENV: " + limberest.stringify(env));

var group = limberest.group(testLoc + '/limberest-demo.postman');
console.log("GROUP: " + limberest.stringify(group));

var test = group.test('api-docs', 'GET');
console.log("TEST: " + limberest.stringify(test));

test.run(env);
