'use strict';

const fs = require('fs');
const path = require('path');
const defaults = require('defaults');
const sanitize = require('sanitize-filename');
const jsYaml = require('js-yaml');
const logger = require('./logger');
const run = require('./run');
const compare = require('./compare');
const subst = require('./subst');
const mkdirsSync = require('./fs-util').mkdirsSync;

const defaultOptions = {
  prettyIndent: 2,
  caseDir: path.dirname(process.argv[1]),
  resultDir: './test/results',
  logDir: './test/results',
  debug: false,
  retainLog: false,
  overwrite: false
};

var Case = exports.Case = function(name, options) {
  if (typeof name === 'object') {
    options = name;
    name = path.basename(process.argv[1], path.extname(process.argv[1]));
  }
  this.name = name;
  this.options = defaults(options, defaultOptions);
  var baseName = this.getBaseFileName();
  
  mkdirsSync(this.options.resultDir);
  const resultFile = this.getActualResultFile();
  if (fs.existsSync(resultFile))
    fs.unlinkSync(resultFile);

  if (this.options.overwrite) {
    const expectedFile = this.getExpectedResultFile();
    if (fs.existsSync(expectedFile))
      fs.unlinkSync(expectedFile);
  }
  
  const logFile = this.options.logDir + path.sep + baseName + '.log';
  this.logger = new (logger.Logger)({
    level: this.options.debug ? 'debug' : 'info',
    file: logFile,
    retain: this.options.retainLog
  });
  console.log("LOGFILE: " + logFile);
  this.logger.info(logFile);
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
    this.logger.info('Running test ' + test.group + ': ' + test.method + ' ' + test.name);
    
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
        const actualFile = this.getActualResultFile();
        fs.appendFileSync(actualFile, actualYaml);
        
        if (!error) {
          const expectedFile = this.getExpectedResultFile();
          if (this.options.overwrite) {
            this.logger.info('Writing to expected results file: ' + expectedFile);
            fs.ensureFileSync(expectedFile);
            fs.appendFileSync(expectedFile, actualYaml);
          }
          else if (!fs.existsSync(expectedFile)) {
            throw new Error('Expected results file not found: ' + expectedFile);
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
  catch (e) {
    this.logger.error(e.stack);
    var res = { 
        status: 'Errored', 
        message: e.toString()
    };
    if (callback)
      callback(null, res, e);
  }
};

Case.prototype.verify = function(values) {
  var expectedFile = this.getExpectedResultFile();
  if (!fs.existsSync(expectedFile))
    throw new Error('Expected result file not found: ' + expectedFile);
  var actualFile = this.getActualResultFile();
  if (!fs.existsSync(actualFile))
    throw new Error('Result file not found: ' + expectedFile);
  this.logger.debug('Comparing: ' + expectedFile + '\n  with: ' + actualFile);
  var expected = fs.readFileSync(expectedFile, 'utf-8');
  var expectedYaml = subst.trimComments(expected);
  var actual = fs.readFileSync(actualFile, 'utf-8');
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
  this.logger.error(error.stack);
  this.result = { 
      status: 'Errored', 
      message: error.toString()
  };
};

Case.prototype.getBaseFileName = function() {
  return sanitize(this.name, {replacement: '_'});
};

Case.prototype.getActualResultFile = function() {
  return this.options.resultDir + path.sep + this.getBaseFileName() + '.yaml';
}

Case.prototype.getExpectedResultFile = function() {
  return this.options.caseDir + path.sep + this.getBaseFileName() + '.yaml'
}

Case.prototype.jsonString = function(obj) {
  return JSON.stringify(obj, null, this.options.prettyIndent);
};

Case.prototype.yamlString = function(obj) {
  return jsYaml.safeDump(obj, {noCompatMode: true, skipInvalid: true});
};
