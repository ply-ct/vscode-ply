[![Limberest Logo](https://limberest.github.io/limberest/img/logo.png)](https://limberest.io)

## REST API Automated Testing

## Install
```bash
npm install --save limberest
```

## Usage
Path-Style Locations:
 - If using Node, point to file system directories. 
 - If in browser, point to local storage paths.
 
URL-Style Locations:
(For options.location, options.expectedResultLocation)
 - Point to GitHub repository relative location.
 
## Example :
```javascript
const limberest = require('../lib/limberest');

// Note testsLoc on file system allows synchronous reads.
const testsLoc = '../../limberest-demo/test';
var values = limberest.loadValuesSync(testsLoc + '/limberest.io.values');
var group = limberest.loadGroupSync(testsLoc + '/movies-api.postman');

var test = group.getTest('GET', 'movies?{query}');

values = Object.assign({}, values);
values.query = 'year=1935&rating=5';

var options = {
  location: testsLoc,
  expectedResultLocation: testsLoc + '/results/expected',
  resultLocation: testsLoc + '/results/actual',
  debug: true,
  responseHeaders: ['content-type']
};

test.run(options, values, (error, response) => {
  test.verify(values, (err, result) => {
    if (err)
      console.log(err);
  });
});
```
