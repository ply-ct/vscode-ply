import { URI as Uri } from 'vscode-uri';
import { TestSuiteInfo, TestInfo } from 'vscode-test-adapter-api';
import { Suite, Request, Case, Step, Test } from '@ply-ct/ply';

export type Info = TestInfo | TestSuiteInfo;

/**
 * A root test suite for plyees.
 * Child suites all have ids of the form <root-id>|<file-or-folder-uri>.
 * Tests all have ids that are their plyee's non-encoded uri string.
 */
export class PlyRoot {
    readonly baseSuite: TestSuiteInfo;

    /**
     * @param uri workspaceFolder uri for local fs; url for remote
     * @param id qualifier (should not contain '/', '#' or '|' characters)
     * @param label for ui
     */
    constructor(
        readonly uri: Uri,
        readonly id: string,
        readonly label: string,
        readonly debuggable = false
    ) {
        this.baseSuite = {
            type: 'suite',
            id: this.id,
            label: '',
            description: this.label,
            debuggable,
            children: []
        };
    }

    /**
     * Creates the test/suite hierarchy.
     * Relies on Uris coming in already sorted by shortest segment count first, then alpha.
     * Within files requests/cases should be sorted by the order they appear in the file.
     */
    build(
        testUris: [Uri, number][],
        customSchemes?: boolean,
        suiteLabeler?: (suiteId: string) => string,
        testLabeler?: (suiteId: string) => string
    ) {
        // clear children in case reload
        this.baseSuite.children = [];

        for (let i = 0; i < testUris.length; i++) {
            const query = testUris[i][0].query;
            const testUri = testUris[i][0].with({ query: '' });
            const testPath = this.relativize(testUri);
            const lastHash = testPath.lastIndexOf('#');
            const testName = testPath.substring(lastHash + 1);

            const testId = testUri.toString(true);
            const test: TestInfo = {
                type: 'test',
                id: testId,
                label: testLabeler ? testLabeler(testId) : testName,
                line: testUris[i][1],
                debuggable: testUri.path.endsWith('.ts') || testUri.path.endsWith('.flow')
            };
            if (this.id === 'requests' && customSchemes && testUri.scheme === 'file') {
                // request files should be open in request editor
                test.file = testUri.with({ scheme: 'ply-dummy' }).toString(true);
            } else if (this.id === 'flows' && customSchemes && testUri.scheme === 'file') {
                // flows should not be opened in text editor
                test.file = testUri.with({ scheme: 'ply-dummy', query }).toString(true);
            } else {
                test.file = testUri.scheme === 'file' ? testUri.fsPath : testUri.toString(true);
            }
            if (testLabeler) {
                test.description = testName;
            }

            // find suite (file)
            const lastSlash = testPath.lastIndexOf('/');
            const fileName = testPath.substring(lastSlash + 1, lastHash);
            const filePath = testPath.substring(0, lastHash);
            const fileUri = Uri.parse(this.uri.toString(true) + '/' + filePath);
            let suite = this.findSuite((suite) => suite.id === this.formSuiteId(fileUri));
            if (suite) {
                suite.children.push(test);
            } else {
                const suiteId = this.formSuiteId(fileUri);
                suite = {
                    type: 'suite',
                    id: suiteId,
                    label: suiteLabeler ? suiteLabeler(suiteId) : fileName,
                    debuggable: filePath.endsWith('.ts') || filePath.endsWith('.flow'),
                    line: 0,
                    children: []
                };
                if (this.id === 'flows' && fileUri.scheme === 'file') {
                    // flows should not be opened in text editor
                    suite.file = testUri.with({ scheme: 'ply-dummy' }).toString(true);
                } else {
                    suite.file =
                        fileUri.scheme === 'file' ? fileUri.fsPath : fileUri.toString(true);
                }
                if (suiteLabeler) {
                    suite.description = fileName;
                }
                if (!suite.file.endsWith('.ply')) {
                    suite.children.push(test);
                }

                // find parent suite (dir)
                const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
                const dirUri = this.toUri(dirPath);
                let parentSuite: TestSuiteInfo | undefined;
                if (dirPath === '') {
                    parentSuite = this.baseSuite;
                } else {
                    parentSuite = this.findSuite((suite) => suite.id === this.formSuiteId(dirUri));
                }
                if (!parentSuite) {
                    parentSuite = {
                        type: 'suite',
                        id: this.formSuiteId(dirUri),
                        label: dirPath,
                        debuggable: false,
                        children: []
                    };
                    this.baseSuite.children.push(parentSuite);
                }
                if (suite.file.endsWith('.ply')) {
                    let filename = Uri.file(suite.file).path;
                    const lastSlash = filename.lastIndexOf('/');
                    if (lastSlash >= 0) {
                        filename = filename.substring(lastSlash + 1);
                    }
                    test.description = filename;
                    parentSuite.children.push(test);
                } else {
                    parentSuite.children.push(suite);
                }
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

    findSuiteFrom(
        start: TestSuiteInfo,
        test: (suite: TestSuiteInfo) => boolean
    ): TestSuiteInfo | undefined {
        if (test(start)) {
            return start;
        } else {
            for (const childSuite of start.children.filter((child) => child.type === 'suite')) {
                const foundSuite = this.findSuiteFrom(childSuite as TestSuiteInfo, test);
                if (foundSuite) {
                    return foundSuite;
                }
            }
        }
    }

    // find suite or test with id
    find(test: (testOrSuiteInfo: Info) => boolean): Info | undefined {
        return this.findFrom(this.baseSuite, test);
    }

    findFrom(start: Info, test: (testOrSuiteInfo: Info) => boolean): Info | undefined {
        if (test(start)) {
            return start;
        } else if (start.type === 'suite') {
            for (const child of start.children) {
                const found = this.findFrom(child, test);
                if (found) {
                    return found;
                }
            }
        }
    }

    filter(test: (testOrSuiteInfo: Info) => boolean): Info[] {
        return this.filterFrom(this.baseSuite, test);
    }

    filterFrom(start: Info, test: (testOrSuiteInfo: Info) => boolean): Info[] {
        let infos: Info[] = [];
        if (test(start)) {
            infos.push(start);
        } else if (start.type === 'suite') {
            for (const child of start.children) {
                infos = [...infos, ...this.filterFrom(child, test)];
            }
        }
        return infos;
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
            for (const fileSuiteOrTest of dirSuite.children as TestSuiteInfo[] | TestInfo[]) {
                if (fileSuiteOrTest.type === 'suite') {
                    str += indent + indent + fileSuiteOrTest.label + '\n';
                    for (const plyTest of fileSuiteOrTest.children as TestInfo[]) {
                        str += indent + indent + indent + '- ' + plyTest.label + '\n';
                    }
                } else {
                    str += indent + indent + '- ' + fileSuiteOrTest.label + '\n';
                }
            }
        }
        return str;
    }
}

/**
 * Per one workspace folder.  Currently only has local requests.
 */
export class PlyRoots {
    readonly roots: PlyRoot[] = [];
    readonly requestsRoot: PlyRoot;
    readonly casesRoot: PlyRoot;
    readonly flowsRoot: PlyRoot;
    readonly rootSuite: TestSuiteInfo;
    requestsScheme = true;

    private readonly testsById = new Map<string, Test>();
    private readonly suitesByTestOrSuiteId = new Map<string, Suite<Request | Case | Step>>();
    private readonly suiteIdsByExpectedResultUri = new Map<string, string>();
    private readonly suiteIdsByActualResultUri = new Map<string, string>();

    /**
     * @param uri workspaceFolder uri for local fs; url for remote
     */
    constructor(readonly uri: Uri) {
        this.rootSuite = {
            type: 'suite',
            id: `Ply:${uri.toString(true)}`,
            label: 'Ply',
            debuggable: false,
            children: []
        };
        this.requestsRoot = new PlyRoot(uri, 'requests', 'Requests');
        this.roots.push(this.requestsRoot);
        this.casesRoot = new PlyRoot(uri, 'cases', 'Cases', true);
        this.roots.push(this.casesRoot);
        this.flowsRoot = new PlyRoot(uri, 'flows', 'Flows', true);
        this.roots.push(this.flowsRoot);
    }

    build(
        requestSuites: Map<Uri, Suite<Request>>,
        caseSuites: Map<Uri, Suite<Case>>,
        flowSuites: Map<Uri, Suite<Step>>,
        customSchemes: boolean
    ) {
        this.testsById.clear();
        this.suitesByTestOrSuiteId.clear();
        this.suiteIdsByExpectedResultUri.clear();
        this.suiteIdsByActualResultUri.clear();

        // requests
        const requestSuiteUris = Array.from(requestSuites.keys());
        const requestUris: [Uri, number][] = [];
        for (const requestSuiteUri of requestSuiteUris) {
            const suite = requestSuites.get(requestSuiteUri);
            if (suite) {
                const suiteId = this.requestsRoot.formSuiteId(requestSuiteUri);
                this.suitesByTestOrSuiteId.set(suiteId, suite);
                this.suiteIdsByExpectedResultUri.set(
                    Uri.file(suite.runtime.results.expected.location.absolute).toString(),
                    suiteId
                );
                this.suiteIdsByActualResultUri.set(
                    Uri.file(suite.runtime.results.actual.location.absolute).toString(),
                    suiteId
                );
                for (const request of suite) {
                    const testId = requestSuiteUri.toString(true) + '#' + request.name;
                    this.testsById.set(testId, request);
                    this.suitesByTestOrSuiteId.set(testId, suite);
                    requestUris.push([Uri.parse(testId), request.start || 0]);
                }
            }
        }
        this.requestsRoot.build(requestUris, customSchemes);

        // cases
        const caseSuiteUris = Array.from(caseSuites.keys());
        const caseUris: [Uri, number][] = [];
        for (const caseSuiteUri of caseSuiteUris) {
            const suite = caseSuites.get(caseSuiteUri);
            if (suite) {
                const suiteId = this.casesRoot.formSuiteId(caseSuiteUri);
                this.suitesByTestOrSuiteId.set(suiteId, suite);
                this.suiteIdsByExpectedResultUri.set(
                    Uri.file(suite.runtime.results.expected.location.absolute).toString(),
                    suiteId
                );
                this.suiteIdsByActualResultUri.set(
                    Uri.file(suite.runtime.results.actual.location.absolute).toString(),
                    suiteId
                );
                for (const plyCase of suite) {
                    const testId = caseSuiteUri.toString(true) + '#' + plyCase.name;
                    this.testsById.set(testId, plyCase);
                    this.suitesByTestOrSuiteId.set(testId, suite);
                    caseUris.push([Uri.parse(testId), plyCase.start || 0]);
                }
            }
        }
        this.casesRoot.build(
            caseUris,
            false,
            (suiteId) => this.suitesByTestOrSuiteId.get(suiteId)!.name
        );

        // flows
        const flowSuiteUris = Array.from(flowSuites.keys());
        const flowUris: [Uri, number][] = [];
        for (const flowSuiteUri of flowSuiteUris) {
            const suite = flowSuites.get(flowSuiteUri);
            if (suite) {
                const suiteId = this.flowsRoot.formSuiteId(flowSuiteUri);
                this.suitesByTestOrSuiteId.set(suiteId, suite);
                this.suiteIdsByExpectedResultUri.set(
                    Uri.file(suite.runtime.results.expected.location.absolute).toString(),
                    suiteId
                );
                this.suiteIdsByActualResultUri.set(
                    Uri.file(suite.runtime.results.actual.location.absolute).toString(),
                    suiteId
                );
                for (const plyStep of suite) {
                    const testId = flowSuiteUri.toString(true) + '#' + plyStep.name;
                    this.testsById.set(testId, plyStep);
                    this.suitesByTestOrSuiteId.set(testId, suite);
                    let stepUri = Uri.parse(testId);
                    if (plyStep.step.path === 'request') {
                        stepUri = stepUri.with({ query: 'request' });
                    }
                    flowUris.push([stepUri, plyStep.start || 0]);
                }
            }
        }
        this.flowsRoot.build(flowUris, customSchemes, undefined, (testId) => {
            const test = this.testsById.get(testId) as Step;
            return (
                (test.subflow ? `${test.subflow.name} → ` : '') +
                test.step.name.replace(/\r?\n/g, ' ')
            );
        });

        this.rootSuite.children = this.roots.map((root) => root.baseSuite);
    }

    find(test: (testOrSuiteInfo: Info) => boolean): Info | undefined {
        if (test(this.rootSuite)) {
            return this.rootSuite;
        }
        for (const plyRoot of this.roots) {
            const testOrSuite = plyRoot.find(test);
            if (testOrSuite) {
                return testOrSuite;
            }
        }
    }

    findForFile(file: string): Info | undefined {
        return this.find((info) => {
            if (info.file) {
                const f = Uri.parse(info.file).with({ scheme: 'file', fragment: null });
                return f.fsPath === file;
            } else {
                return false;
            }
        });
    }

    filter(test: (testOrSuiteInfo: Info) => boolean): Info[] {
        let infos: Info[] = [];
        if (test(this.rootSuite)) {
            infos.push(this.rootSuite);
        }
        for (const plyRoot of this.roots) {
            infos = [...infos, ...plyRoot.filter(test)];
        }
        return infos;
    }

    findInfo(id: string): Info | undefined {
        if (id === this.rootSuite.id) {
            return this.rootSuite;
        }
        for (const plyRoot of this.roots) {
            const testOrSuite = plyRoot.find((t) => t.id === id);
            if (testOrSuite) {
                return testOrSuite;
            }
        }
    }

    getTest(testId: string): Test | undefined {
        return this.testsById.get(testId);
    }

    getSuite(testOrSuiteId: string): Suite<Request | Case | Step> | undefined {
        return this.suitesByTestOrSuiteId.get(testOrSuiteId);
    }

    getSuiteIdForExpectedResult(resultUri: Uri): string | undefined {
        return this.suiteIdsByExpectedResultUri.get(resultUri.toString());
    }

    getSuiteIdForActualResult(resultUri: Uri): string | undefined {
        return this.suiteIdsByActualResultUri.get(resultUri.toString());
    }

    getParent(testOrSuiteId: string): TestSuiteInfo | undefined {
        if (testOrSuiteId === this.rootSuite.id) {
            return undefined;
        }
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

    /**
     * Get unique list of (not skipped) suite files for testOrSuiteIds.
     * Includes .ply files as test infos.
     * @param testOrSuiteIds
     */
    getFileInfos(testOrSuiteIds: string[], infos: Info[] = []): Info[] {
        for (const testOrSuiteId of testOrSuiteIds) {
            const testOrSuite = this.find((i) => i.id === testOrSuiteId);
            if (testOrSuite) {
                if (testOrSuite.type === 'suite') {
                    if (testOrSuite.file && !infos.find((suite) => suite.id === testOrSuite.id)) {
                        infos.push(testOrSuite);
                    } else {
                        const childSuites = this.getFileInfos(
                            testOrSuite.children.map((c) => c.id)
                        ).filter((s) => {
                            // honor skip when executing from parent suite (not explicitly running test or suite)
                            const suite = this.getSuite(s.id);
                            return suite && !suite.skip;
                        });
                        infos = [...infos, ...childSuites];
                    }
                } else if (testOrSuite.type === 'test') {
                    if (testOrSuite.id.startsWith('file:')) {
                        infos.push(testOrSuite);
                    } else {
                        const suite = this.getParent(testOrSuiteId);
                        if (suite && !infos.find((suite) => suite.id === testOrSuite.id)) {
                            infos.push(suite);
                        }
                    }
                }
            }
        }
        return infos;
    }

    /**
     * Unique array of test parent suites (excluding direct parent).
     */
    getAncestorSuites(testInfos: TestInfo[]): TestSuiteInfo[] {
        const ancestors: TestSuiteInfo[] = [];
        for (const testInfo of testInfos) {
            const parent = this.getParent(testInfo.id);
            if (parent) {
                let ancestor = this.getParent(parent.id);
                while (ancestor) {
                    if (!ancestors.find((a) => a.id === ancestor!.id)) {
                        ancestors.push(ancestor);
                    }
                    ancestor = this.getParent(ancestor.id);
                }
            }
        }
        return ancestors;
    }

    getSuiteInfo(suiteId: string): TestSuiteInfo | undefined {
        const testOrSuite = this.find((i) => i.id === suiteId);
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

    dispose() {
        this.testsById.clear();
        this.suitesByTestOrSuiteId.clear();
        this.suiteIdsByExpectedResultUri.clear();
        this.suiteIdsByActualResultUri.clear();
        for (const root of this.roots) {
            root.baseSuite.children = [];
        }
    }

    static toUri(infoId: string): Uri {
        const pipe = infoId.indexOf('|');
        if (pipe > 0) {
            // ply root designator
            infoId = infoId.substring(pipe + 1);
        }
        return Uri.parse(infoId);
    }

    static fromUri(uri: Uri): string {
        const rootId = uri.path.endsWith('.flow')
            ? 'flows'
            : uri.path.endsWith('.ts')
            ? 'cases'
            : 'requests';
        return `${rootId}|${uri.toString(true)}`;
    }
}
