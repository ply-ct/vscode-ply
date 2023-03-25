<a href="https://ply-ct.org/">
  <img src="https://raw.githubusercontent.com/ply-ct/vscode-ply/master/docs/images/logo.png" width="64" alt="ply" />
</a>
<h2>API Automated Testing
<div>
<a href="https://ply-ct.org/">
  <img src="https://raw.githubusercontent.com/ply-ct/vscode-ply/master/docs/images/wares.png" width="128" alt="Ply your wares" />
</a>
</div>
</h2>

![GitHub Workflow Status](https://github.com/ply-ct/vscode-ply/workflows/Build/badge.svg) ![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/ply-ct.vscode-ply?color=blue&label=VS%20Code%20Marketplace&logo=visual-studio-code) ![CodeQL](https://github.com/ply-ct/vscode-ply/workflows/CodeQL/badge.svg)

[Ply](https://ply-ct.org/) is simply a more intuitive way of autotesting your REST and GraphQL APIs. Create and run HTTP requests
using Ply's visual request editor.

![request-recording](docs/images/request-recording.gif)

Then reuse your requests in Ply's graphical flow builder.

![flow-recording](docs/images/flow-recording.gif)

Or edit raw YAML describing your request sequence. Run Ply to submit these requests 
and compare actual results against expected, with [template literal](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals) 
placeholders for dynamic values.

The Ply extension gives you a side-by-side diff view so you can compare results at a glance.

![diff](docs/images/diff.png)

Checkmarks indicate diff lines that're okay, such as substituted values or comments; whereas Xs indicate
significant differences causing test failure(s).

When you need even greater control, Ply [cases](https://ply-ct.github.io/ply/topics/cases) give you
programmatic access via TypeScript to supplement this built-in expected/actual verification.

## Features
  - Visual HTTP request editor for sending REST and GraphQL requests
  - Graphical flow builder makes it easy to sequence requests
  - Side-by-side diff view compares expected/actual results, with smart decorations aware of runtime values
  - Auto-generate result files by capturing actual good responses
  - Reference env values and/or upstream response props using template expressions
  - Ply Explorer sidebar shows all Ply flow/request/case suites along with their statuses
  - CodeLens links in your Ply test files for running and debugging tests
  - Built-in GraphQL support providing the same intuitive workflow as REST
  - Decorations on your Ply test flows and files showing test statuses and results
  - Test log displayed in Output view when a test is selected in Ply Explorer
  - Import Ply requests from [Postman](https://www.postman.com/) collections

## Dependencies
Requires [Test Explorer UI](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer) extension.

## Configuration
Ply configuration is read from [plyconfig.json/yaml](https://ply-ct.github.io/ply/topics/config).
Other values are configured through vscode settings:

Setting | Description | Default
------- | ----------- | -------
`ply.logpanel` | Write detailed log output to the Ply Invoker output panel | false
`ply.websocketPort` | WebSocket port for Ply flow live updates (0 to disable). Modify in **Workspace** settings to avoid conflicts. | 9351
`ply.customSteps` | Glob pattern for step descriptor JSON files, relative to workspace folder
`ply.debugPort` | Port to use for debug connections | 9229
`ply.debugConfig` | Name of a launch configuration to use for debugging | (see below)
`ply.nodePath` | Path to node executable | Find on your PATH; if not found, use node shipped with VS Code
`ply.plyPath` | Path to ply package (relative to workspace folder) eg: "node_modules/@ply-ct/ply" | Use a bundled version of ply
`ply.cwd` | Working directory for Ply test execution (relative to workspace folder) | Workspace folder root
`ply.env` | Environment variables to apply for Ply test execution |
`ply.saveBeforeRun` | Automatically save dirty test editor documents before running | true
`ply.openRequestsAndFlowsWhenRun` | Automatically open requests/flows in custom editor when executing from Ply Explorer | If Single (running a single suite)
`ply.plyExplorerUseRequestEditor` | When opening individual requests within flow/request suites from Ply Explorer, open in request editor | true
`ply.useDist` | TODO | false
`ply.requireTsNode` | TODO | false
`ply.previewEnabled` | Enable Ply preview features | false

### Custom debug configuration
You can specify a custom vscode debug configuration to use for Ply cases instead of the built-in default.
Do this by creating a debugging configuration in `.vscode/launch.json`. Then specify the name of that
in setting `ply.debugConfig`. The default built-in debug configuration looks like this:
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
If your Ply tests are not displayed or not executing correctly, you can diagnose problems by turning
on logging to "Ply Invoker" in Output view through this VS Code setting:
 - `ply.logpanel`
