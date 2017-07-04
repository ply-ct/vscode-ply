'use strict';

// example limberest-js test case
var limberest = require('./lib/limberest');
var testLoc = '../limberest-demo/test';
var caseLoc = testLoc + '/cases';

var env = limberest.env(testLoc + '/limberest.io.env');
console.log("ENV: " + limberest.stringify(env));

var group = limberest.group(testLoc + '/limberest-demo.postman');
console.log("GROUP: " + limberest.stringify(group));

var test = group.test('PUT', 'movies/{id}');
console.log("TEST: " + limberest.stringify(test));

var values = Object.assign({}, env);
values.id = '5c0a01b6';
test.run(values);
