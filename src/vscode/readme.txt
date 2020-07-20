Code here is reproduced from Microsoft vscode source to expose non-public APIs.
We reuse the same LcsDiff algorithm employed through the "vscode.diff" command,
to ensure we get the same result in order to apply decorations.

This duplication will no longer be required should either of the following
enhancement requests be implemented:
https://github.com/microsoft/vscode/issues/84981
https://github.com/microsoft/vscode/issues/87944

