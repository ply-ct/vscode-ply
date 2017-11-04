'use strict';

const limberest = require('../lib/limberest');

const testsLoc = 'https://raw.githubusercontent.com/limberest/limberest-demo/master/test';

var options = {
  location: testsLoc,
  expectedResultLocation: testsLoc + '/results/expected',
  resultLocation: '../../limberest-demo/test/results/actual',
  debug: true,
  responseHeaders: ['content-type']
};
  
limberest.loadValues(options, ['/limberest.io.values'], function(err, vals) {
  if (err)
    throw err;
  var values = Object.assign({}, vals);
  limberest.loadGroup(testsLoc + '/movies-api.postman', function(err, group) {
    if (err)
      throw err;
    var request = group.getRequest('GET', 'movies?{query}');
    values.query = 'year=1935&rating=5';
    request.run(options, values, (error, response) => {
      request.verify(values);
    });
  });
});


