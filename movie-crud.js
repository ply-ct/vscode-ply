'use strict';

// TODO: this is not remotely useable at the moment
const limberest = require('./lib/limberest');
const Case = require('./lib/limberest').Case;

// Locations can be on the file system, at a url, or in html5 local storage.
// The second option works seamlessly for file system or local storage.
// const testsLoc = 'https://github.com/limberest/limberest-demo/tree/master/test';
const testsLoc = '../limberest-demo/test';
  
var values = limberest.loadValuesSync(testsLoc + '/localhost.env');

var group = limberest.loadGroupSync(testsLoc + '/limberest-demo.postman');

var options = {
  location: testsLoc,
  resultLocation: './results',
  logLocation: './results',
  debug: true,
};

var movie = {
  title: 'Hello'  
};

var vals = Object.assign({query: 'title=' + movie.title}, values);

var testCase = new Case('movieCrud', options);
testCase.run(group.getTest('GET', 'movies?{query}'), vals, (response, error) => {
  if (testCase.verify()) {
    testCase.run(group.getTest('DEL', 'movies/{id}'), values);
  }
});
