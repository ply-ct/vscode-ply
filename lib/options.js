'use strict';

const path = require('path');
const defaults = require('defaults');

var Options = function(options) {
  this.options = defaults(options, Options.defaultOptions);
  if (!this.options.expectedResultLocation) {
    this.options.expectedResultLocation = this.options.location;
  }
  if (!this.options.logLocation) {
    this.options.logLocation = this.options.resultLocation;
  }
  if (this.options.expectedResultLocation
      && this.options.expectedResultLocation.startsWith('https://github.com/')) {
    this.options.expectedResultLocation = 'https://raw.githubusercontent.com/'
        + this.options.expectedResultLocation.substring(19);
  }
};

Options.prototype.get = function(name) {
  return this.options[name];
};

Options.defaultOptions = {
  location: path.dirname(process.argv[1]),
  // extensions: (eg: ['.postman']
  // expectedResultLocation: (same as 'location')
  resultLocation: 'results',
  // logLocation: (same as 'resultLocation'),
  // localLocation: (indicates local override possible)
  debug: false,
  retainLog: false,  // accumulate for multiple runs
  captureResult: true,
  retainResult: false,
  prettifyResult: true,
  prettyIndent: 2,
  qualifyLocations: true, // result and log paths prefixed by group
  overwriteExpected: false
};

exports.Options = Options;