'use strict';

const limberest = require('./lib/limberest');

// Note testsLoc on file system allows synchronous reads.
const testsLoc = '../limberest-demo/test';
var options = {
  location: testsLoc,
  expectedResultLocation: testsLoc + '/results/expected',
  resultLocation: testsLoc + '/results/actual',
  debug: true,
  responseHeaders: ['content-type']
};
  
var env = limberest.loadEnvSync(testsLoc + '/limberest.io.env');
var group = limberest.loadGroupSync(testsLoc + '/limberest-demo.postman');

var test = group.getTest('GET', 'movies?{query}');

var values = Object.assign({}, env);
values.query = 'year=1935&rating=5';

test.run(options, values, (error, response) => {
  test.verify(values);
});
