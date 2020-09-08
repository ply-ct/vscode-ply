# vscode-ply
REST API Automated Testing via [Ply](https://github.com/ply-ct/ply).
To install, search for "ply" in the [VS Code Marketplace](https://marketplace.visualstudio.com/VSCode),
or in VS Code's Extensions sidebar. 

## Features
  - Test Explorer sidebar shows all Ply requests/cases/suites along with their statuses
  - CodeLense in your Ply test files for starting and debugging tests
  - Gutter decorations on your Ply test files showing tests status
  - Decorations in Ply test files indicate source line where a test failed
  - Display failed test log when a test is selected in Test Explorer
  - Diff editor for comparing expected/actual results, with smart decorations that know about runtime values

## Dependencies
Requires [Test Explorer UI](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer) extension.

## Configuration
Honors .plyrc.yml.  Values there are superseded by the following vscode settings:
Setting | Description | Default
------- | ----------- | -------
`ply.testsLocation` | Base directory (absolute or relative to workspace root) for all Ply request and case files | .
`ply.requestFiles` | Glob pattern for Ply request files | **/*.{ply.yaml,ply.yml}
`ply.caseFiles` | Glob pattern for Ply case files | **/*.ply.ts
`ply.ignore` | Glob pattern for places to ignore | \**/{node_modules,bin,dist,out}/**
`ply.skip` | Glob pattern for tests to skip |
`ply.expectedLocation` | Expected results base dir | testsLocation + '/results/expected'
`ply.actualLocation` | Actual results base dir | testsLocation + '/results/actual'
`ply.logLocation` | Log file base dir | actualLocation
`ply.logpanel` | Write detailed log output to the Ply Invoker output panel | false
`ply.valuesFiles` | JSON files containing Ply values | 
`ply.debugPort` | Port to use for debug connections | 9229
`ply.debugConfig` | Name of a launch configuration to use for debugging | (see below)
`ply.nodePath` | Path to node executable | Find on your PATH; if not found, use node shipped with VS Code
`ply.plyPath` | Path to ply package (relative to workspace folder) eg: "node_modules/ply-ct" | Use a bundled version of ply

### Custom debug configuration
You can specify a custom vscode debug configuration to use instead of the built-in default.
Do this by creating a debugging configuration in `.vscode/launch.json`.  Then specify the name of that
in setting `ply.debugConfig`.  The default built-in debug configuration looks like this:
```
{
  "name": "Ply Debugging",
  "type": "node",
  "request": "attach",
  "port": 9229,
  "protocol": "inspector",
  "timeout": 10000,
  "continueOnAttach": true
}
```

## Troubleshooting
