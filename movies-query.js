'use strict';

const limberest = require('./lib/limberest');

// Locations can be on the file system, at a url, or in html5 local storage.
// The second option works seamlessly for file system or local storage.
// const testsLoc = 'https://github.com/limberest/limberest-demo/tree/master/test';
const testsLoc = '../limberest-demo/test';
  
// var env = limberest.env(testsLoc + '/localhost.env');
var env = limberest.env(testsLoc + '/limberest.io.env');

var group = limberest.group(testsLoc + '/limberest-demo.postman');

var options = {
  location: testsLoc,
  expectedResultLocation: testsLoc + '/results/expected',
  resultLocation: testsLoc + '/results/actual',
  debug: true,
  responseHeaders: ['content-type']
};

var test = group.test('GET', 'movies?{query}');

var values = Object.assign({}, env);
values.query = 'year=1935&rating=5';

test.run(options, values, (response, error) => {
  test.verify(values);
});
