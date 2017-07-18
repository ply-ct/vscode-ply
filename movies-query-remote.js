'use strict';

const limberest = require('./lib/limberest');

const testsLoc = 'https://raw.githubusercontent.com/limberest/limberest-demo/master/test';
// const testsLoc = '../limberest-demo/test'; // uncomment this for async local

var options = {
  location: testsLoc,
  expectedResultLocation: testsLoc + '/results/expected',
  resultLocation: '../limberest-demo/test/results/actual',
  debug: true,
  responseHeaders: ['content-type']
};
  
limberest.loadEnv(testsLoc + '/limberest.io.env', function(err, env) {
  if (err)
    throw err;
  var values = Object.assign({}, env);
  limberest.loadGroup(testsLoc + '/limberest-demo.postman', function(err, group) {
    if (err)
      throw err;
    var test = group.getTest('GET', 'movies?{query}');
    values.query = 'year=1935&rating=5';
    test.run(options, values, (error, response) => {
      test.verify(values);
    });
  });
});


