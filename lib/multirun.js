'use strict';

function Multirun(options) {
}

Multirun.prototype.runRequests = function(requests) {
  console.log("REQUESTS");
  
};

Multirun.prototype.runCases = function(cases) {
  console.log("CASES");
};


module.exports = Multirun;