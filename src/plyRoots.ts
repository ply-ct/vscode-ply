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
            const testUri = testUris[i][0];
            const testPath = this.relativize(testUri);
            const lastHash = testPath.lastIndexOf('#');
            const requestName = testPath.substring(lastHash + 1);

            const test: TestInfo = {
                type: 'test',
                id: testUri.toString(true),
                label: requestName,
                file: testUri.scheme === 'file' ? testUri.fsPath : testUri.toString(true),
                line: testUris[i][1]
            };

            // find suite (file)
            const lastSlash = testPath.lastIndexOf('/');
            const fileName = testPath.substring(lastSlash + 1, lastHash);
            const filePath = testPath.substring(0, lastHash);
            const fileUri = Uri.parse(this.uri.toString(true) + '/' + filePath);
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
                const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
                const dirUri = this.toUri(dirPath);
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
            for (const childSuite of start.children.filter(child => child.type === 'suite')) {
                const foundSuite = this.findSuiteFrom((childSuite as TestSuiteInfo), test);
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
            for (const child of start.children) {
                const found = this.findFrom(child, id);
                if (found) {
                    return found;
                }
            }
        }
    }

    getParent(start: TestSuiteInfo, id: string): TestSuiteInfo | undefined {
        for (const child of start.children) {
            if (child.id === id) {
                return start;
            }
            if (child.type === 'suite') {
                const parent = this.getParent(child, id);
                if (parent) {
                    return parent;
                }
            }
        }
    }

    toString() {
        const indent = '    ';
        let str = this.label + '\n';
        for (const dirSuite of this.baseSuite.children as TestSuiteInfo[]) {
            str += indent + dirSuite.label + '\n';
            for (const fileSuite of dirSuite.children as TestSuiteInfo[]) {
                str += indent + indent + fileSuite.label + '\n';
                for (const plyTest of fileSuite.children as TestInfo[]) {
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
        id: 'root: Ply',
        label: 'Ply',
        children: []
    };

    private readonly testsById = new Map<string,Test>();
    private readonly suitesByTestOrSuiteId = new Map<string,Suite<Request|Case>>();

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
            const suite = requestSuites.get(requestSuiteUri);
            if (suite) {
                this.suitesByTestOrSuiteId.set(this.requestsRoot.formSuiteId(requestSuiteUri), suite);
                for (const request of suite) {
                    const testId = requestSuiteUri.toString(true) + '#' + request.name;
                    this.testsById.set(testId, request);
                    this.suitesByTestOrSuiteId.set(testId, suite);
                    requestUris.push([Uri.parse(testId), request.start || 0]);
                }
            }
        }
        this.requestsRoot.build(requestUris);

        // cases
        const caseSuiteUris = Array.from(caseSuites.keys());
        const caseUris: [Uri, number][] = [];
        for (const caseSuiteUri of caseSuiteUris) {
            const suite = caseSuites.get(caseSuiteUri);
            if (suite) {
                this.suitesByTestOrSuiteId.set(this.casesRoot.formSuiteId(caseSuiteUri), suite);
                for (const plyCase of suite) {
                    const testId = caseSuiteUri.toString(true) + '#' + plyCase.name;
                    this.testsById.set(testId, plyCase);
                    this.suitesByTestOrSuiteId.set(testId, suite);
                    caseUris.push([Uri.parse(testId), plyCase.start || 0]);
                }
            }
        }
        this.casesRoot.build(caseUris);

        this.rootSuite.children = this.roots.map(root => root.baseSuite);
    }

    findTestOrSuiteInfo(testId: string): TestSuiteInfo | TestInfo | undefined {
        for (const plyRoot of this.roots) {
            const testOrSuite = plyRoot.find(testId);
            if (testOrSuite) {
                return testOrSuite;
            }
        }
    }

    getTest(testId: string): Test | undefined {
        return this.testsById.get(testId);
    }

    getSuiteForTest(testId: string): Suite<Request|Case> | undefined {
        return this.suitesByTestOrSuiteId.get(testId);
    }

    getSuite(suiteId: string): Suite<Request|Case> | undefined {
        return this.suitesByTestOrSuiteId.get(suiteId);
    }

    getParent(testOrSuiteId: string): TestSuiteInfo | undefined {
        for (const plyRoot of this.roots) {
            if (plyRoot.id === testOrSuiteId) {
                return this.rootSuite;
            }
            const parent = plyRoot.getParent(plyRoot.baseSuite, testOrSuiteId);
            if (parent) {
                return parent;
            }
        }
    }

    getSuiteInfo(suiteId: string): TestSuiteInfo | undefined {
        const testOrSuite = this.findTestOrSuiteInfo(suiteId);
        if (testOrSuite && testOrSuite.type === 'suite') {
            return testOrSuite;
        }
    }

    getTestInfosForSuite(suiteId: string): TestInfo[] {
        const testInfos: TestInfo[] = [];
        const suiteInfo = this.getSuiteInfo(suiteId);
        if (suiteInfo) {
            for (const child of suiteInfo.children) {
                if (child.type === 'test') {
                    testInfos.push(child);
                }
            }
        }
        return testInfos;
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