import * as vscode from 'vscode';
import {
    TestAdapter,
    TestController,
    TestHub as ITestHub,
    TestSuiteInfo
} from '../../test-adapter/api/index';
import { TestAdapterDelegate } from './testAdapterDelegate';

export class TestHub implements ITestHub {
    private readonly controllers = new Set<TestController>();

    private readonly adapters = new Set<TestAdapter>();
    private readonly adapterSubscriptions = new Map<TestAdapter, vscode.Disposable>();
    private readonly delegates = new Set<TestAdapterDelegate>();
    private readonly tests = new Map<TestAdapter, TestSuiteInfo | undefined>();

    registerTestController(controller: TestController): void {
        this.controllers.add(controller);

        for (const adapter of this.adapters) {
            const delegate = new TestAdapterDelegate(adapter, controller);
            this.delegates.add(delegate);
            controller.registerTestAdapter(delegate);

            delegate.testsEmitter.fire({ type: 'started' });
            if (this.tests.has(adapter)) {
                delegate.testsEmitter.fire({ type: 'finished', suite: this.tests.get(adapter) });
            }
        }
    }

    unregisterTestController(controller: TestController): void {
        this.controllers.delete(controller);

        for (const delegate of this.delegates) {
            if (delegate.controller === controller) {
                controller.unregisterTestAdapter(delegate);
                delegate.dispose();
                this.delegates.delete(delegate);
            }
        }
    }

    registerTestAdapter(adapter: TestAdapter): void {
        this.adapters.add(adapter);

        for (const controller of this.controllers) {
            const delegate = new TestAdapterDelegate(adapter, controller);
            this.delegates.add(delegate);
            controller.registerTestAdapter(delegate);
        }

        this.adapterSubscriptions.set(
            adapter,
            adapter.tests((event) => {
                if (event.type === 'started') {
                    this.tests.delete(adapter);
                } else {
                    // event.type === 'finished'
                    this.tests.set(adapter, event.suite);
                }

                for (const delegate of this.delegates) {
                    if (delegate.adapter === adapter) {
                        delegate.testsEmitter.fire(event);
                    }
                }
            })
        );

        adapter.load();
    }

    unregisterTestAdapter(adapter: TestAdapter): void {
        this.adapters.delete(adapter);

        const subscription = this.adapterSubscriptions.get(adapter);
        if (subscription) {
            subscription.dispose();
            this.adapterSubscriptions.delete(adapter);
        }

        for (const delegate of this.delegates) {
            if (delegate.adapter === adapter) {
                delegate.controller.unregisterTestAdapter(delegate);
                delegate.dispose();
                this.delegates.delete(delegate);
            }
        }

        this.tests.delete(adapter);
    }

    getTests(adapter: TestAdapter): TestSuiteInfo | undefined {
        return this.tests.get(adapter);
    }
}
