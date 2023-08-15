import * as assert from 'assert';
import { URI as Uri } from 'vscode-uri';
import { PlyRoot, PlyRoots } from '../src/ply-roots';
import * as help from './help';

describe('ply roots', function () {
    const requestRoot = new PlyRoot(help.workspaceFolderUri, 'requests', 'Requests');
    const requestUris: [Uri, number][] = [
        [requestRoot.toUri('src/test/ply/up-here.request.yaml#oneUp'), 0],
        [requestRoot.toUri('src/test/ply/requests/create-movie.request.yaml#createMovie'), 0],
        [requestRoot.toUri('src/test/ply/requests/delete-movie.request.yaml#deleteMovie'), 0],
        [requestRoot.toUri('src/test/plyables/x.request.yaml#reqX1'), 0],
        [requestRoot.toUri('src/test/plyables/x.request.yaml#reqX2'), 0],
        [requestRoot.toUri('src/test/plyables/y.request.yaml#reqY'), 0],
        [requestRoot.toUri('src/test2/ply/requests/a.request.yaml#reqA'), 0]
    ];

    const flowRoot = new PlyRoot(help.workspaceFolderUri, 'flows', 'Flows');
    const flowUris: [Uri, number][] = [
        [flowRoot.toUri('src/test/ply/flow-here.ply.flow#s1'), 0],
        [flowRoot.toUri('src/test/ply/flow-here.ply.flow#s2'), 0],
        [flowRoot.toUri('src/test/ply/flows/create-movies.ply.flow#s1'), 0],
        [flowRoot.toUri('src/test/ply/flows/delete-movie.ply.flow#s2'), 0],
        [flowRoot.toUri('src/test/plyables/z.ply.flow#s1'), 0],
        [flowRoot.toUri('src/test/plyables/z.ply.flow#s2'), 0],
        [flowRoot.toUri('src/test/plyables/a.ply.flow#s3'), 0],
        [flowRoot.toUri('src/test/plyables/a.ply.flow#s1'), 0],
        [flowRoot.toUri('src/test2/ply/requests/in-requests.ply.flow#s1'), 0]
    ];

    it('should be grouped by location', () => {
        requestRoot.build(help.workspaceFolderUri, requestUris);
        assert.strictEqual(
            requestRoot.toString(),
            `Requests
    src/test/ply
        up-here.request.yaml
            - oneUp
    src/test/ply/requests
        create-movie.request.yaml
            - createMovie
        delete-movie.request.yaml
            - deleteMovie
    src/test/plyables
        x.request.yaml
            - reqX1
            - reqX2
        y.request.yaml
            - reqY
    src/test2/ply/requests
        a.request.yaml
            - reqA
`
        );
    });

    it('should merge children across roots', () => {
        const plyRoots = new PlyRoots(help.workspaceFolderUri);
        requestRoot.build(Uri.file(help.workspaceFolderUri.fsPath + '/src'), requestUris);
        flowRoot.build(Uri.file(help.workspaceFolderUri.fsPath + '/src'), flowUris);

        plyRoots.rootSuite.children = [];
        plyRoots.merge(plyRoots.rootSuite, requestRoot.baseSuite.children);
        plyRoots.merge(plyRoots.rootSuite, flowRoot.baseSuite.children);

        plyRoots.sort(plyRoots.rootSuite);

        console.log('ROOTS:\n' + plyRoots.toString());

        assert.strictEqual(
            plyRoots.toString(),
            `    test/ply
        flow-here.ply.flow
            - s1
            - s2
        up-here.request.yaml
            - oneUp
    test/ply/flows
        create-movies.ply.flow
            - s1
        delete-movie.ply.flow
            - s2
    test/ply/requests
        create-movie.request.yaml
            - createMovie
        delete-movie.request.yaml
            - deleteMovie
    test/plyables
        a.ply.flow
            - s3
            - s1
        x.request.yaml
            - reqX1
            - reqX2
        y.request.yaml
            - reqY
        z.ply.flow
            - s1
            - s2
    test2/ply/requests
        a.request.yaml
            - reqA
        in-requests.ply.flow
            - s1
`
        );
    });
});
