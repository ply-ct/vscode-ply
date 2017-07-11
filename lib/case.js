'use strict';

const path = require('path');
const defaults = require('defaults');
const jsYaml = require('js-yaml');
const Logger = require('./logger').Logger;
const run = require('./run');
const compare = require('./compare');
const subst = require('./subst');
const storage = require('./storage');

const defaultOptions = {
  prettyIndent: 2,
  location: path.dirname(process.argv[1]),
  resultLocation: './test/results',
  logLocation: './test/results',
  debug: false,
  retainLog: false,
  overwrite: false
};

var NoExpectedResult = exports.NoExpectedResult = function(msg) {
  this.name = 'NoExpectedResult';
  this.message = msg || 'No expected result found';
  this.stack = (new Error()).stack;
};

var Case = exports.Case = function(name, options) {
  if (typeof name === 'object') {
    options = name;
    name = path.basename(process.argv[1], path.extname(process.argv[1]));
  }
  this.name = name;
  this.options = defaults(options, defaultOptions);
  
  this.expectedResultStorage = new (storage.Storage)(this.options.location, this.name + '.yaml');
  this.actualResultStorage = new (storage.Storage)(this.options.resultLocation, this.name + '.yaml');
  if (!this.options.retainResult) {
    this.actualResultStorage.remove();
  }
  if (this.options.overwrite) {
    this.expectedResultStorage.remove();
  }
  
  this.logger = new Logger({
      level: this.options.debug ? 'debug' : 'info',
      location: this.options.logLocation,
      name: this.name + '.log', 
      retain: this.options.retainLog
    });
};

Case.prototype.run = function(test, values, callback) {
  if (typeof values === 'function') {
    callback = values;
    values = null;
  }  
  
  this.result = null;
  try {
    this.logger.info(this.name + ' @' + new Date());
    const testRun = run.create(this.name);
    this.logger.info('Running test ' + test.group + ': ' + test.request.method + ' ' + test.name);
    
    if (values)
      this.logger.debug('Values: ' + this.jsonString(values));
    
    var req = test.getRequest(values);
    this.logger.debug('Request: ' + this.jsonString(req));
    
    testRun.execute(req, (resp, error) => {
      if (error)
        this.handleError(error);
      try {
        if (resp)
          this.logger.debug('Response: ' + this.jsonString(resp));
        
        // save yaml results
        var actualYaml = this.yamlString(testRun);
        this.actualResultStorage.append(actualYaml);
        
        if (!error) {
          if (this.options.overwrite) {
            this.logger.info('Writing expected result: ' + this.expectedResultStorage);
            this.expectedResultStorage.append(actualYaml);
          }
        }
        
        if (callback)
          callback(resp, error);
      }
      catch (err) {
        this.handleError(err);
        if (callback)
          callback(resp, error);
      }
    });
    return testRun;
  }
  catch (err) {
    this.handleError(err);
    if (callback)
      callback(null, res, err);
  }
};

Case.prototype.verify = function(values) {
  if (this.error) {
    return {status: 'Errored', message: this.error.message};
  }
  if (!this.expectedResultStorage.exists())
    throw new Error('Expected result not found: ' + this.expectedResultStorage);
  if (!this.actualResultStorage.exists())
    throw new Error('Result not found: ' + this.actualResultStorage);
  this.logger.debug('Comparing: ' + this.expectedResultStorage + '\n  with: ' + this.actualResultStorage);
  var expected = this.expectedResultStorage.read();
  var expectedYaml = subst.trimComments(expected);
  var actual = this.actualResultStorage.read();
  var actualYaml = subst.trimComments(actual);
  var diffs = compare.diffLines(subst.extractCode(expectedYaml), subst.extractCode(actualYaml), values, {
    newlineIsToken: false, 
    ignoreWhitespace: false
  });
  var firstDiffLine = 0;
  var diffMsg = '';
  if (diffs) {
    let line = 1;
    let actLine = 1;
    var i = 0;
    for (let i = 0; i < diffs.length; i++) {
      var diff = diffs[i];
      if (diff.removed) {
        var correspondingAdd = (i < diffs.length - 1 && diffs[i + 1].added) ? diffs[i + 1] : null;
        if (!diff.ignored) {
          if (!firstDiffLine)
            firstDiffLine = line;
          diffMsg += line;
          if (diff.count > 1)
            diffMsg += '-' + (line + diff.count - 1);
          diffMsg += '\n';
          diffMsg += subst.prefix(diff.value, '- ', expectedYaml, line - 1);
          if (correspondingAdd) {
            diffMsg += subst.prefix(correspondingAdd.value, '+ ', actualYaml, actLine - 1);
          }
          diffMsg += '===\n';
        }
        line += diff.count;
        if (correspondingAdd) {
          i++; // corresponding add already covered
          actLine += correspondingAdd.count;
        }
      }
      else if (diff.added) {
        if (!diff.ignored) {
          // added with no corresponding remove
          if (!firstDiffLine)
            firstDiffLine = line;
          diffMsg += line + '\n';
          diffMsg += subst.prefix(diff.value, '+ ', actualYaml, actLine - 1);
          diffMsg += '===\n';
        }
        actLine += diff.count; 
      }
      else {
        line += diff.count;
        actLine += diff.count;
      }
    }
  }
  if (firstDiffLine) {
    this.logger.error('Case "' + this.name + '" FAILED: Results differ from line ' + firstDiffLine + ':\n' + diffMsg);
    return {status: 'Failed', message: 'Results differ from line ' + firstDiffLine};
  }
  else {
    this.logger.info('Case "' + this.name + '" PASSED');
    return {status: 'Passed', message: 'Test succeeded'};
  }
};

Case.prototype.handleError = function(error) {
  this.error = error;
  if (error.stack)
    this.logger.error(error.stack);
  else
    this.logger.error(error);
  this.result = { 
      status: 'Errored', 
      message: error.toString()
  };
};

Case.prototype.jsonString = function(obj) {
  return JSON.stringify(obj, null, this.options.prettyIndent);
};

Case.prototype.yamlString = function(obj) {
  return jsYaml.safeDump(obj, {noCompatMode: true, skipInvalid: true});
};
