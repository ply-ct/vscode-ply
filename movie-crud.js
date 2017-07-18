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

var movie = {
  title: 'Hello'  
};

var values = Object.assign({}, env);

var testCase = new Case('movieCrud', options);
testCase.run(group.test('GET', 'movies?{query}'), Object.assign({query: 'title=' + movie.title}, env), (response, error) => {
  if (testCase.verify()) {
    testCase.run(group.test('DEL', 'movies/{id}'), values);
  }
});


test.run(values, options, (error, response) => {
  console.log("RES:\n" + JSON.stringify(result, null, 2));
});
