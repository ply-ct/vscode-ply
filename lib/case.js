'use strict';

const fs = require('fs-extra');
const path = require('path');
const winston = require('winston');
const defaults = require('defaults');
const sanitize = require('sanitize-filename');
const diff = require('diff');
const jsYaml = require('js-yaml');
const run = require('./run');

const defaultOptions = {
  prettyIndent: 2,
  caseDir: path.dirname(process.argv[1]),
  resultDir: './test/results',
  logDir: './test/results',
  debug: false,
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
  
  fs.mkdirsSync(this.options.resultDir);
  const resultFile = this.getActualResultFile();
  if (fs.existsSync(resultFile))
    fs.unlinkSync(resultFile);

  if (this.options.overwrite) {
    const expectedFile = this.getExpectedResultFile();
    if (fs.existsSync(expectedFile))
      fs.unlinkSync(expectedFile);
  }
  
  // TODO logger options (or pass)
  fs.mkdirsSync(this.options.logDir);
  const logFile = this.options.logDir + path.sep + baseName + '.log';
  if (fs.existsSync(logFile))
    fs.unlinkSync(logFile);
  this.logger = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)({
        level: this.options.debug ? 'debug' : 'info',
        colorize: true,
        humanReadableUnhandledException: true,
        handleExceptions: true
      }),
      new (winston.transports.File)({
        filename: logFile, 
        level: this.options.debug ? 'debug' : 'info',
        json: false,
        humanReadableUnhandledException: true,
        handleExceptions: true,
        formatter: function(options) {
          return options.message ? options.message : '';
        }
      })
    ]
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
    this.logger.info('Running test ' + test.group + ': ' + test.method + ' ' + test.name + ' (id: ' + testRun.id + ')');
    var req = test.getRequest(values);
    this.logger.debug('Request:\n' + this.jsonString(req));
    
    testRun.execute(req, (resp, error) => {
      if (error)
        this.handleError(error);
      try {
        if (resp)
          this.logger.debug('Response:\n' + this.jsonString(resp));
        
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
    console.log('STACK: ' + e.stack);
    this.logger.error(e.stack);
    var res = { 
        status: 'Errored', 
        message: e.toString()
    };
    if (callback)
      callback(null, res, e);
  }
};

Case.prototype.verify = function() {
  var expectedFile = this.getExpectedResultFile();
  if (!fs.existsSync(expectedFile))
    throw new Error('Expected result file not found: ' + expectedFile);
  var actualFile = this.getActualResultFile();
  if (!fs.existsSync(actualFile))
    throw new Error('Result file not found: ' + expectedFile);
  this.logger.debug('Comparing: ' + expectedFile + '\n  with: ' + actualFile);
  var expectedYaml = fs.readFileSync(expectedFile, 'utf-8');
  var actualYaml = fs.readFileSync(actualFile, 'utf-8');
  var changes = diff.diffLines(expectedYaml, actualYaml, {newlineIsToken: false, ignoreWhitespace: false});
  if (changes) {
    console.log("CHANGES:");
    changes.forEach(change => {
      console.log(" =>" + JSON.stringify(change));
    });
    
    var result = { 
      status: 'Failed', 
      message: 'DIFF: ' + changes
    };
  }
  else {
    result = {status: 'Passed', message: 'Test succeeded' };
  }
  return result;
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
