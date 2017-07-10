'use strict';

const limberest = require('./lib/limberest');

const testLoc = '../mdw6/mdw-workflow/assets/com/centurylink/mdw/tests/services';
  
var env = limberest.env(testLoc + '/localhost.env');
var group = limberest.group(testLoc + '/admin-apis.postman');

var options = {
  location: testLoc,
  resultLocation: '../mdw6/mdw-workflow/testResults/com.centurylink.mdw.tests.services',
  logLocation: '../mdw6/mdw-workflow/testResults/com.centurylink.mdw.tests.services',
  debug: true
};

// run one test
var test = group.test('GET', 'workgroups/{group-name}');

var values = Object.assign({}, env);
values['group-name'] = 'GroupA';

test.run(options, values, (response, error) => {
  console.log("RESP:\n" + JSON.stringify(response, null, 2));
  var result = test.verify(values);
  console.log("RES:\n" + JSON.stringify(result, null, 2));
});


// run a case with multiple tests
//var testCase = new (limberest.Case)(options);
//testCase.run(test, values, (response, error) => {
//  console.log("RESP: " + JSON.stringify(response, null, 2));
//  var result = testCase.verify(values);
//  console.log("RES: " + JSON.stringify(result, null, 2));
//});