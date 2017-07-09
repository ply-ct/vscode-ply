'use strict';

const limberest = require('./lib/limberest');

//var loc = 'https://github.com/limberest/limberest-demo';
var loc = '../limberest-demo';

var options = {
    location: loc,
    path: 'test',
    extensions: ['.postman']
}
limberest.retrieveTestGroups(options, function(err, groups) {
  console.log(JSON.stringify(groups, null, 2));  
});
