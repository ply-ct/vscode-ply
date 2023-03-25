import * as vscode from 'vscode';

/**
 * The ID of the Test Explorer extension. Use it to get the `TestHub` API like this:
 * ```
   const testHub = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId).exports; ```
 * Don't forget to add an `extensionDependencies` entry to your `package.json`:
 * ```
   "extensionDependencies": [ "hbenl.vscode-test-explorer" ] ```
 */
export const testExplorerExtensionId = 'hbenl.vscode-test-explorer';

/**
 * This is the interface offered by the Test Explorer extension for registering
 * and unregistering Test Adapters and Test Controllers.
 */
export interface TestHub {
    registerTestAdapter(adapter: TestAdapter): void;
    unregisterTestAdapter(adapter: TestAdapter): void;
    registerTestController(controller: TestController): void;
    unregisterTestController(controller: TestController): void;
}

/**
 * This is the interface that must be implemented by Test Adapters.
 */
export interface TestAdapter {
    /**
     * The workspace folder that this test adapter is associated with (if any).
     * There is usually one test adapter per workspace folder and testing framework.
     */
    workspaceFolder?: vscode.WorkspaceFolder;

    /**
     * Start loading the definitions of tests and test suites.
     * Note that the Test Adapter should also watch source files and the configuration for changes and
     * automatically reload the test definitions if necessary (without waiting for a call to this method).
     * @returns A promise that is resolved when the adapter finished loading the test definitions.
     */
    load(): Promise<void>;

    /**
     * Run the specified tests.
     * @param tests An array of test or suite IDs. For every suite ID, all tests in that suite are run.
     * @returns A promise that is resolved when the test run is completed.
     */
    run(tests: string[]): Promise<void>;

    /**
     * Run the specified tests in the debugger.
     * @param tests An array of test or suite IDs. For every suite ID, all tests in that suite are run.
     * @returns A promise that is resolved when the test run is completed.
     */
    debug?(tests: string[]): Promise<void>;

    /**
     * Stop the current test run.
     */
    cancel(): void;

    /**
     * This event is used by the adapter to inform the Test Explorer (and other Test Controllers)
     * that it started or finished loading the test definitions.
     */
    readonly tests: vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent>;

    /**
     * This event is used by the adapter during a test run to inform the Test Explorer
     * (and other Test Controllers) about a test run and tests and suites being started or completed.
     * For example, if there is one test suite with ID `suite1` containing one test with ID `test1`,
     * a successful test run would emit the following events:
     * ```
     * { type: 'started', tests: ['suite1'] }
     * { type: 'suite', suite: 'suite1', state: 'running' }
     * { type: 'test', test: 'test1', state: 'running' }
     * { type: 'test', test: 'test1', state: 'passed' }
     * { type: 'suite', suite: 'suite1', state: 'completed' }
     * { type: 'finished' } ```
     */
    readonly testStates: vscode.Event<
        TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent
    >;

    /**
     * This event can be used by the adapter to inform the Test Explorer about tests whose states
     * are outdated.
     * This is usually sent directly after a `TestLoadFinishedEvent` to specify which tests may
     * have changed. Furthermore, it should be sent when the source files for the application
     * under test have changed.
     * This will also trigger a test run for those tests that have been set to "autorun" by the
     * user and which are retired by this event.
     * If the adapter does not implement this event then the Test Explorer will automatically
     * retire (and possibly autorun) all tests after each `TestLoadFinishedEvent`.
     */
    readonly retire?: vscode.Event<RetireEvent>;

    /**
     * @deprecated This event is deprecated, use the `retire` event instead.
     * For backwards compatibility, `autorun.fire()` calls have the same effect as `retire.fire({})`.
     */
    readonly autorun?: vscode.Event<void>;
}

/**
 * This is the interface that must be implemented by Test Controllers
 */
export interface TestController {
    /**
     * Register the given Test Adapter. The Test Controller should subscribe to the `adapter.tests`
     * event source immediately in order to receive the test definitions.
     */
    registerTestAdapter(adapter: TestAdapter): void;

    unregisterTestAdapter(adapter: TestAdapter): void;
}

/**
 * This event is sent by a Test Adapter when it starts loading the test definitions.
 */
export interface TestLoadStartedEvent {
    type: 'started';
}

/**
 * This event is sent by a Test Adapter when it finished loading the test definitions.
 */
export interface TestLoadFinishedEvent {
    type: 'finished';

    /** The test definitions that have just been loaded */
    suite?: TestSuiteInfo;

    /** If loading the tests failed, this should contain the reason for the failure */
    errorMessage?: string;
}

/**
 * This event is sent by a Test Adapter when it starts a test run.
 */
export interface TestRunStartedEvent {
    type: 'started';

    /**
     * The test(s) that will be run, this should be the same as the `tests` argument from the call
     * to `run(tests)` or `debug(tests)` that started the test run.
     */
    tests: string[];

    /**
     * A Test Adapter should generate a unique ID for every test run and add that ID to all events
     * for that test run. This is necessary so that Test Controllers can link the events if multiple
     * test runs are running in parallel.
     */
    testRunId?: string;
}

/**
 * This event is sent by a Test Adapter when it finished a test run.
 */
export interface TestRunFinishedEvent {
    type: 'finished';

    /**
     * The ID of the test run that was finished.
     */
    testRunId?: string;
}

/**
 * Information about a test suite.
 */
export interface TestSuiteInfo {
    type: 'suite';

    id: string;

    /** The label to be displayed by the Test Explorer for this suite. */
    label: string;

    /** The description to be displayed next to the label. */
    description?: string;

    /** The tooltip text to be displayed by the Test Explorer when you hover over this suite. */
    tooltip?: string;

    /**
     * The file containing this suite (if known).
     * This can either be an absolute path (if it is a local file) or a URI.
     * Note that this should never contain a `file://` URI.
     */
    file?: string;

    /** The line within the specified file where the suite definition starts (if known). */
    line?: number;

    /** Set this to `false` if Test Explorer shouldn't offer debugging this suite. */
    debuggable?: boolean;

    children: (TestSuiteInfo | TestInfo)[];

    /** Set this to `true` if there was an error while loading the suite */
    errored?: boolean;

    /**
     * This message will be displayed by the Test Explorer when the user selects the suite.
     * It is usually used for information about why the suite was set to errored.
     */
    message?: string;
}

/**
 * Information about a test.
 */
export interface TestInfo {
    type: 'test';

    id: string;

    /** The label to be displayed by the Test Explorer for this test. */
    label: string;

    /** The description to be displayed next to the label. */
    description?: string;

    /** The tooltip text to be displayed by the Test Explorer when you hover over this test. */
    tooltip?: string;

    /**
     * The file containing this test (if known).
     * This can either be an absolute path (if it is a local file) or a URI.
     * Note that this should never contain a `file://` URI.
     */
    file?: string;

    /** The line within the specified file where the test definition starts (if known). */
    line?: number;

    /** Indicates whether this test will be skipped during test runs */
    skipped?: boolean;

    /** Set this to `false` if Test Explorer shouldn't offer debugging this test. */
    debuggable?: boolean;

    /** Set this to `true` if there was an error while loading the test */
    errored?: boolean;

    /**
     * This message will be displayed by the Test Explorer when the user selects the test.
     * It is usually used for information about why the test was set to errored.
     */
    message?: string;
}

/**
 * Information about a suite being started or completed during a test run.
 */
export interface TestSuiteEvent {
    type: 'suite';

    /**
     * The suite that is being started or completed. This field usually contains the ID of the
     * suite, but it may also contain the full information about a suite that is started if that
     * suite had not been sent to the Test Explorer yet.
     */
    suite: string | TestSuiteInfo;

    state: 'running' | 'completed' | 'errored';

    /**
     * This message will be displayed by the Test Explorer when the user selects the suite.
     * It is usually used for information about why the suite was set to errored.
     */
    message?: string;

    /**
     * This property allows you to update the description of the suite in the Test Explorer.
     * When the test states are reset, the description will change back to the one from `TestSuiteInfo`.
     */
    description?: string;

    /**
     * This property allows you to update the tooltip of the suite in the Test Explorer.
     * When the test states are reset, the tooltip will change back to the one from `TestSuiteInfo`.
     */
    tooltip?: string;

    /**
     * This property allows you to update the file of the suite in the Test Explorer.
     * When the test states are reset, the file property will change back to the one from `TestSuiteInfo`.
     */
    file?: string;

    /**
     * This property allows you to update the line of the suite in the Test Explorer.
     * When the test states are reset, the line property will change back to the one from `TestSuiteInfo`.
     */
    line?: number;

    /**
     * The ID of the test run that this event is part of.
     */
    testRunId?: string;
}

/**
 * Information about a test being started, completed or skipped during a test run.
 */
export interface TestEvent {
    type: 'test';

    /**
     * The test that is being started, completed or skipped. This field usually contains
     * the ID of the test, but it may also contain the full information about a test that is
     * started if that test had not been sent to the Test Explorer yet.
     */
    test: string | TestInfo;

    state: 'running' | 'passed' | 'failed' | 'skipped' | 'errored';

    /**
     * This message will be displayed by the Test Explorer when the user selects the test.
     * It is usually used for information about why a test has failed.
     */
    message?: string;

    /**
     * These messages will be shown as decorations for the given lines in the editor.
     * They are usually used to show information about a test failure at the location of that failure.
     */
    decorations?: TestDecoration[];

    /**
     * This property allows you to update the description of the test in the Test Explorer.
     * When the test states are reset, the description will change back to the one from `TestInfo`.
     */
    description?: string;

    /**
     * This property allows you to update the tooltip of the test in the Test Explorer.
     * When the test states are reset, the tooltip will change back to the one from `TestInfo`.
     */
    tooltip?: string;

    /**
     * This property allows you to update the file of the test in the Test Explorer.
     * When the test states are reset, the file property will change back to the one from `TestInfo`.
     */
    file?: string;

    /**
     * This property allows you to update the line of the test in the Test Explorer.
     * When the test states are reset, the line property will change back to the one from `TestInfo`.
     */
    line?: number;

    /**
     * The ID of the test run that this event is part of.
     */
    testRunId?: string;
}

export interface TestDecoration {
    /**
     * The line for which the decoration should be shown
     */
    line: number;

    /**
     * The file in which the decoration should be shown. If this is not set, the decoration will
     * be shown in the file containing the test referenced by the TestEvent containing this decoration
     * (so in most cases there is no need to set this property).
     */
    file?: string;

    /**
     * The message to show in the decoration. This must be a single line of text.
     */
    message: string;

    /**
     * This text is shown when the user hovers over the decoration's message.
     * If this isn't defined then the hover will show the test's log.
     */
    hover?: string;
}

export interface RetireEvent {
    /**
     * An array of test or suite IDs. For every suite ID, all tests in that suite will be retired.
     * If this isn't defined then all tests will be retired.
     */
    tests?: string[];
}
