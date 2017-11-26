'use strict';

const limberest = require('../lib/limberest');

const testsLoc = 'https://raw.githubusercontent.com/limberest/limberest-demo/master/test';

const options = {
  location: testsLoc,
  expectedResultLocation: testsLoc + '/results/expected',
  resultLocation: '../../limberest-demo/test/results/actual',
  debug: true,
  responseHeaders: ['content-type']
};
  
var request;
var values;

limberest.loadGroup(testsLoc + '/movies-api.postman')
.then(group => {
  request = group.getRequest('GET', 'movies?{query}');
  return limberest.loadValues(options, ['/limberest.io.values']);
})
.then(vals => {
  values = vals;
  values.query = 'year=1935&rating=5';
  return request.run(options, values);
})
.then(response => {
  request.verify(values);
})
.catch(err => {
  console.log(err);
});


