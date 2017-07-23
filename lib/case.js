'use strict';

const path = require('path');
const jsYaml = require('js-yaml');
const Options = require('./options').Options;
const Logger = require('./logger').Logger;
const run = require('./run');
const compare = require('./compare');
const subst = require('./subst');
const Storage = require('./storage').Storage;
const Retrieval = require('./retrieval').Retrieval;

var Case = exports.Case = function(name, options) {
  if (typeof name === 'object') {
    options = name;
    name = path.basename(process.argv[1], path.extname(process.argv[1]));
  }
  this.name = name;
  this.options = new Options(options).options;
  
  this.expectedResultRetrieval = new Retrieval(this.options.expectedResultLocation, this.name + '.yaml');

  if (this.options.resultLocation.startsWith('https://') || 
      this.options.resultLocation.startsWith('http://')) {
    throw new Error('Unsupported result location: ' + this.options.resultLocation);
  }
  
  this.actualResultStorage = new Storage(this.options.resultLocation, this.name + '.yaml');
  if (!this.options.retainResult) {
    this.actualResultStorage.remove();
    if (this.options.overwriteExpected) {
      if (this.expectedResultRetrieval.storage)
        this.expectedResultRetrieval.storage.remove();
      else
        throw new Error('Overwrite not supported for expectedResultLocation: ' + this.options.expectedResultLocation);
    }
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
    
    testRun.execute(req, (error, resp) => {
      if (error)
        this.handleError(error);
      try {
        if (resp) 
          this.logger.debug('Response: ' + this.jsonString(resp));

        if (this.options.captureResult) {
          var allHeaders;
          var time;
          
          if (resp) {
            allHeaders = resp.headers;
            // clear unwanted headers
            if (this.options.responseHeaders && resp.headers) {
              var wanted = this.options.responseHeaders; // array
              var respHeaders = {};
              Object.keys(resp.headers).forEach(hdrKey => {
                if (wanted.find(wantedKey => wantedKey.toLowerCase() == hdrKey.toLowerCase()))
                  respHeaders[hdrKey] = resp.headers[hdrKey];
              });
              resp.headers = respHeaders;
            }
            // remove time by default
            time = resp.time;
            if (!this.options.responseTime)
              delete resp.time;
          }
          
          // save yaml results
          var actualYaml = this.yamlString(this.options.prettifyResult ? testRun.prettify(this.options.prettyIndent) : testRun);
          this.actualResultStorage.append(actualYaml);
          if (!error) {
            if (this.options.overwriteExpected) {
              this.logger.info('Writing expected result: ' + this.expectedResultRetrieval.storage);
              this.expectedResultRetrieval.storage.append(actualYaml);
            }
          }
          
          if (resp) {
            // restore for programmatic access
            resp.headers = allHeaders;
            resp.time = time;
          }
        }
        
        if (callback)
          callback(error, resp);
      }
      catch (err) {
        this.handleError(err);
        if (callback)
          callback(error, resp);
      }
    });
    return testRun;
  }
  catch (err) {
    this.handleError(err);
    if (callback)
      callback(err);
  }
};

Case.prototype.verify = function(values, callback) {
  if (this.error) {
    this.handleError(this.error);
    return;
  }
  try {
    var thisCase = this;
    var expected = this.expectedResultRetrieval.load(function(err, data) {
      var result;
      if (data)
          result = thisCase.verifyResult(data, values);
      if (callback)
        callback(err, result);
    });
  }
  catch (err) {
    this.handleError(err);
  }
};

Case.prototype.verifySync = function(values) {
  if (this.error) {
    this.handleError(this.error);
    return;
  }
  try {
    var expected = this.expectedResultRetrieval.loadSync();
    return this.verifyResult(expected, values);
  }
  catch (err) {
    this.handleError(err);
  }
};

// verify with preloaded result
Case.prototype.verifyResult = function(expected, values) {
  var expectedYaml = subst.trimComments(expected.replace(/\r/g, ''));
  if (!this.actualResultStorage.exists())
    throw new Error('Result not found: ' + this.actualResultStorage);
  this.logger.debug('Comparing: ' + this.expectedResultRetrieval + '\n  with: ' + this.actualResultStorage);
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
