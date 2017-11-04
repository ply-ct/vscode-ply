'use strict';

const limberest = require('../lib/limberest');

// Note testsLoc on file system allows synchronous reads.
const testsLoc = '../../limberest-demo/test';
var values = limberest.loadValuesSync(testsLoc + '/limberest.io.values');
var group = limberest.loadGroupSync(testsLoc + '/movies-api.postman');

var request = group.getRequest('GET', 'movies?{query}');

values = Object.assign({}, values);
values.query = 'year=1935&rating=5';

var options = {
  location: testsLoc,
  expectedResultLocation: testsLoc + '/results/expected',
  resultLocation: testsLoc + '/results/actual',
  debug: true,
  responseHeaders: ['content-type']
};
    
request.run(options, values, (error, response) => {
  request.verify(values, (err, result) => {
    if (err)
      console.log(err);
  });
});
