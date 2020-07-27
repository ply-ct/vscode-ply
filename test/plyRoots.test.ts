import * as assert from 'assert';
import * as ply from 'ply-ct';
import { URI as Uri } from 'vscode-uri';
import { PlyRoots, PlyRoot } from '../src/plyRoots';
import * as help from './help';

describe('ply roots', function () {

    it('should know parents', async () => {
        const plyRoot = new PlyRoot(help.workspaceFolderUri, 'requests', 'Requests');
        //        const p = new ply.Ply();
    //    const plyRoots = new PlyRoots(Uri.file('.'));
    //     const p = new ply.Ply();
    //     const requestSuites = await p.loadRequests(
    //         'test/requests/movie-queries.ply.yaml',
    //         'test/requests/movies-api.ply.yaml'
    //     );
    //     const requests = new Map<Uri,ply.Suite<ply.Request>>();
    //     requestSuites.forEach(requestSuite => {
    //         requests.set(Uri.file(requestSuite.path), requestSuite);
    //     });

    //     const caseSuites = await p.loadCases(
    //         'test/cases/movieCrud.ply.ts'
    //     );
    //     const cases = new Map<Uri,ply.Suite<ply.Case>>();
    //     caseSuites.forEach(caseSuite => {
    //         cases.set(Uri.file(caseSuite.path), caseSuite);
    //     });

    //     plyRoots.build(requests, cases);
    //     assert.equal(plyRoots.requestsRoot.baseSuite.children.length, 1);

    //     // plyRoots.requestsRoot.find('file:///Users/donald/ply/ply/test/ply/requests/movie-queries.ply.yaml#moviesByYearAndRating')
    });

    it('should be grouped', async () => {


        const plyRoot = new PlyRoot(help.workspaceFolderUri, 'requests', 'Requests');
        const plyableUris: [Uri, number][] = [
            [plyRoot.toUri('src/test/ply/up-here.request.yaml#oneUp'), 0],
            [plyRoot.toUri('src/test/ply/requests/create-movie.request.yaml#createMovie'), 0],
            [plyRoot.toUri('src/test/ply/requests/delete-movie.request.yaml#deleteMovie'), 0],
            [plyRoot.toUri('src/test/plyables/x.request.yaml#reqX1'), 0],
            [plyRoot.toUri('src/test/plyables/x.request.yaml#reqX2'), 0],
            [plyRoot.toUri('src/test/plyables/y.request.yaml#reqY'), 0],
            [plyRoot.toUri('test/ply/requests/a.request.yaml#reqA'), 0]
        ];
        plyRoot.build(plyableUris);

        assert.equal(plyRoot.toString(),
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
`);
    });

});
