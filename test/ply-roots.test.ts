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
        [requestRoot.toUri('test/ply/requests/a.request.yaml#reqA'), 0]
    ];

    const flowRoot = new PlyRoot(help.workspaceFolderUri, 'flows', 'Flows');
    const flowUris: [Uri, number][] = [
        [flowRoot.toUri('src/test/ply/flow-here.ply.flow'), 0],
        [flowRoot.toUri('src/test/ply/flows/create-movies.ply.flow#s2'), 0],
        [flowRoot.toUri('src/test/ply/flows/delete-movie.ply.flow'), 0],
        [flowRoot.toUri('src/test/plyables/a.ply.flow'), 0],
        [flowRoot.toUri('src/test/plyables/a.ply.flow#s3'), 0],
        [flowRoot.toUri('src/test/plyables/y.ply.flow'), 0],
        [flowRoot.toUri('src/test/plyables/y.ply.flow#s4'), 0],
        [flowRoot.toUri('test/ply/requests/in-requests.ply.flow'), 0]
    ];

    it('should be grouped by location', () => {
        requestRoot.build(requestUris);
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
    test/ply/requests
        a.request.yaml
            - reqA
`
        );
    });

    it('should merge children across roots', () => {
        const plyRoots = new PlyRoots(help.workspaceFolderUri);
        // requestRoot.build(requestUris);

        flowUris.sort((u1, u2) => {
            const segs1 = u1[0].path.split('/');
            const segs2 = u2[0].path.split('/');
            return segs1.length - segs2.length;
        });

        flowRoot.build(flowUris);

        console.log('flowRoot: ' + flowRoot.toString());

        // plyRoots.rootSuite.children = [];
        // plyRoots.merge(plyRoots.rootSuite, requestRoot.baseSuite.children);
        // plyRoots.merge(plyRoots.rootSuite, flowRoot.baseSuite.children);

        // plyRoots.sort(plyRoots.rootSuite);

        // console.log('MERGED: ' + plyRoots.toString());
    });
});
