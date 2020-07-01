# vscode-ply
REST API Automated Testing via [Ply](https://github.com/ply-ct/ply#readme).

## Features
  - Test Explorer sidebar shows all detected tests and suites and their statuses
  - CodeLense in your Ply test files for starting and debugging tests
  - Gutter decorations on your test files showing tests status
  - Decoration in Ply test file indicates source line where a test failed
  - Display failed test log when the test is selected in Test Explorer
  - Choose suites or tests in Test Explorer to run automatically after each file change

## Dependencies
Requires [Test Explorer UI](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer) extension.

## Configuration
Honors .plyrc.yml.  Values there are superseded by the following vscode settings:
Setting | Description | Default
------- | ----------- | -------
`ply.testsLocation` | Base directory (absolute or relative to workspace root) for all Ply request and case files | .
`ply.requestFiles` | Glob pattern for Ply request files | **/*.{ply.yaml,ply.yml}
`ply.caseFiles` | Glob pattern for Ply case files | **/*.ply.ts
`ply.excludes` | Glob pattern for places to exclude | \**/{node_modules,bin,dist,out}/**
`ply.expectedLocation` | Expected results base dir | testsLocation + '/results/expected'
`ply.actualLocation` | Actual results base dir | testsLocation + '/results/actual'
`ply.logLocation` | Log file base dir | actualLocation
`ply.logpanel` | Write detailed log output to the Ply Invoker output panel | false
`ply.debugPort` | Port to use for debug connections | 9229
`ply.nodePath` | Path to node executable | Find on your PATH; if not found, use node shipped with VS Code
`ply.plyPath` | Path to ply package (relative to workspace folder) eg: "node_modules/ply-ct" | Use a bundled version of ply

## Troubleshooting
