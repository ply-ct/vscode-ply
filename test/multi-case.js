'use strict';

const Multirun = require('../lib/multirun');

const testsLoc = 'https://raw.githubusercontent.com/limberest/limberest-demo/master/test';

const options = {
  location: testsLoc,
  expectedResultLocation: testsLoc + '/results/expected',
  resultLocation: '../../limberest-demo/test/results/actual',
  debug: true,
  responseHeaders: ['content-type']
};
  
var requests;
var values;

limberest.loadGroup(testsLoc + '/movies-api.postman')
.then(group => {
  request = group.getRequests();
  return limberest.loadValues(options, ['/limberest.io.values']);
})
.then(values => {
  new Multirun().runCases();
})

