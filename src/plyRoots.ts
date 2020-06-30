import { URI as Uri } from 'vscode-uri';
import { TestSuiteInfo, TestInfo } from 'vscode-test-adapter-api';
import { Suite, Request, Case, Test } from 'ply-ct';

/**
 * A root test suite for plyees.
 * Child suites all have ids of the form <root-id>|<file-or-folder-uri>.
 * Tests all have ids that are their plyee's non-encoded uri string.
 */
export class PlyRoot {

    public readonly baseSuite: TestSuiteInfo;

    /**
     * @param uri workspaceFolder uri for local fs; url for remote
     * @param id qualifier (should not contain '/', '#' or '|' characters)
     * @param label for ui
     */
    constructor(public readonly uri: Uri, public readonly id: string, public readonly label: string) {
        this.baseSuite = {
            type: 'suite',
            id: this.id,
            label: this.label,
            children: []
        };
    }

    /**
     * Creates the test/suite hierarchy.
     * Relies on Uris coming in already sorted by shortest segment count first, then alpha.
     * Within files requests/cases should be sorted by the order they appear in the file (TODO: or alpha?).
     */
    build(testUris: [Uri, number][]) {

        // clear children in case reload
        this.baseSuite.children = [];

        for (let i = 0; i < testUris.length; i++) {
            let testUri = testUris[i][0];
            let testPath = this.relativize(testUri);
            let lastHash = testPath.lastIndexOf('#');
            let requestName = testPath.substring(lastHash + 1);

            let test: TestInfo = {
                type: 'test',
                id: testUri.toString(true),
                label: requestName,
                file: testUri.scheme === 'file' ? testUri.fsPath : testUri.toString(true),
                line: testUris[i][1]
            };

            // find suite (file)
            let lastSlash = testPath.lastIndexOf('/');
            let fileName = testPath.substring(lastSlash + 1, lastHash);
            let filePath = testPath.substring(0, lastHash);
            let fileUri = Uri.parse(this.uri.toString(true) + '/' + filePath);
            let suite = this.findSuite(suite => suite.id === this.formSuiteId(fileUri));
            if (suite) {
                suite.children.push(test);
            }
            else {
                suite = {
                    type: 'suite',
                    id: this.formSuiteId(fileUri),
                    label: fileName,
                    file: fileUri.scheme === 'file' ? fileUri.fsPath : fileUri.toString(true),
                    line: 0,
                    children: []
                };
                suite.children.push(test);

                // find parent suite (dir)
                let dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
                let dirUri = this.toUri(dirPath);
                let parentSuite = this.findSuite(suite => suite.id === this.formSuiteId(dirUri));
                if (!parentSuite) {
                    parentSuite = {
                        type: 'suite',
                        id: this.formSuiteId(dirUri),
                        label: dirPath,
                        children: [],
                    };
                    this.baseSuite.children.push(parentSuite);
                }
                parentSuite.children.push(suite);
            }
        }
    }

    formSuiteId(uri: Uri): string {
        return this.id + '|' + uri.toString(true);
    }

    toUri(path: string): Uri {
        return Uri.parse(this.uri.toString(true) + '/' + path);
    }

    /**
     * Uri path relative to base uri.
     */
    relativize(uri: Uri): string {
        return uri.toString(true).substring(this.uri.toString(true).length + 1);
    }

    findSuite(test: (suite: TestSuiteInfo) => boolean): TestSuiteInfo | undefined {
        return this.findSuiteFrom(this.baseSuite, test);
    }

    findSuiteFrom(start: TestSuiteInfo, test: (suite: TestSuiteInfo) => boolean): TestSuiteInfo | undefined {
        if (test(start)) {
            return start;
        }
        else {
            for (let childSuite of start.children.filter(child => child.type === 'suite')) {
                let foundSuite = this.findSuiteFrom((childSuite as TestSuiteInfo), test);
                if (foundSuite) {
                    return foundSuite;
                }
            }
        }
    }

    // find suite or test with id
    find(id: string): TestSuiteInfo | TestInfo | undefined {
        return this.findFrom(this.baseSuite, id);
    }

    findFrom(start: TestSuiteInfo | TestInfo, id: string): TestSuiteInfo | TestInfo | undefined {
        if (start.id === id) {
            return start;
        }
        else if (start.type === 'suite') {
            for (let child of start.children) {
                let found = this.findFrom(child, id);
                if (found) {
                    return found;
                }
            }
        }
    }

    toString() {
        let indent = '    ';
        let str = this.label + '\n';
        for (let dirSuite of this.baseSuite.children as TestSuiteInfo[]) {
            str += indent + dirSuite.label + '\n';
            for (let fileSuite of dirSuite.children as TestSuiteInfo[]) {
                str += indent + indent + fileSuite.label + '\n';
                for (let plyTest of fileSuite.children as TestInfo[]) {
                    str += indent + indent + indent + '- ' + plyTest.label + '\n';
                }
            }
        }
        return str;
    }
}

/**
 * Per one workspace folder.  Currently only has local requests.
 * Later we'll have another root with id = 'remoteRequests'.
 */
export class PlyRoots {

    public readonly roots: PlyRoot[] = [];
    public readonly requestsRoot: PlyRoot;
    public readonly casesRoot: PlyRoot;
    public readonly rootSuite: TestSuiteInfo = {
        type: 'suite',
        id: 'root',
        label: 'Ply',
        children: []
    };
    private readonly testsById = new Map<string,Test>();

    /**
     * @param uri workspaceFolder uri for local fs; url for remote
     */
    constructor(public readonly uri: Uri) {
        this.requestsRoot = new PlyRoot(uri, 'requests', 'Requests');
        this.roots.push(this.requestsRoot);
        this.casesRoot = new PlyRoot(uri, 'cases', 'Cases');
        this.roots.push(this.casesRoot);
    }

    build(requestSuites: Map<Uri,Suite<Request>>, caseSuites: Map<Uri,Suite<Case>>) {
        // requests
        const requestSuiteUris = Array.from(requestSuites.keys());
        const requestUris: [Uri, number][] = [];
        for (const requestSuiteUri of requestSuiteUris) {
            let suite = requestSuites.get(requestSuiteUri);
            if (suite) {
                for (const request of suite) {
                    let testId = requestSuiteUri.toString(true) + '#' + request.name;
                    this.testsById.set(testId, request);
                    requestUris.push([Uri.parse(testId), request.start || 0]);
                }
            }
        }
        this.requestsRoot.build(requestUris);

        // cases
        const caseSuiteUris = Array.from(caseSuites.keys());
        const caseUris: [Uri, number][] = [];
        for (const caseSuiteUri of caseSuiteUris) {
            let suite = caseSuites.get(caseSuiteUri);
            if (suite) {
                for (const plyCase of suite) {
                    let testId = caseSuiteUri.toString(true) + '#' + plyCase.name;
                    this.testsById.set(testId, plyCase);
                    caseUris.push([Uri.parse(testId), plyCase.start || 0]);
                }
            }
        }
        this.casesRoot.build(caseUris);

        this.rootSuite.children = this.roots.map(root => root.baseSuite);
    }

    findTestOrSuiteInfo(testId: string): TestSuiteInfo | TestInfo | undefined {
        for (const plyRoot of this.roots) {
            let testOrSuite = plyRoot.find(testId);
            if (testOrSuite) {
                return testOrSuite;
            }
        }
    }

    getTest(testId: string): Test | undefined {
        return this.testsById.get(testId);
    }

    findFirstTestInfo(suiteId: string): TestInfo | undefined {
        const testOrSuite = this.findTestOrSuiteInfo(suiteId);
        if (testOrSuite && testOrSuite.type === 'suite') {
            for (const child of testOrSuite.children) {
                if (child.type === 'test') {
                    return child;
                }
                else {
                    let first = this.findFirstTestInfo(child.id);
                    if (first) {
                        return first;
                    }
                }
            }
        }
    }

    static toUri(testId: string): Uri {
        const pipe = testId.indexOf('|');
        if (pipe > 0) {
            // ply root designator
            testId = testId.substring(pipe + 1);
        }
        return Uri.parse(testId);
    }
}