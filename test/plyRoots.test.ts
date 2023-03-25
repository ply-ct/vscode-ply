import * as path from 'path';
import * as assert from 'assert';
import * as ply from '@ply-ct/ply';
import { URI as Uri } from 'vscode-uri';
import { PlyRoots, PlyRoot } from '../src/plyRoots';
import * as help from './help';

const movieQueries = 'test/requests/movie-queries.ply.yaml';
const movieQueriesUri = Uri.file(path.normalize(path.resolve(movieQueries))).toString();
const moviesApi = 'test/requests/movies-api.ply.yaml';
const moviesApiUri = Uri.file(path.normalize(path.resolve(moviesApi))).toString();

const movieCrud = path.resolve('test/cases/movieCrud.ply.ts');
const movieCrudUri = Uri.file(path.normalize(path.resolve(movieCrud))).toString();

describe('ply roots', function () {
    it('should know parents', async () => {
        const plyRoots = new PlyRoots(Uri.file('.'));
        const p = new ply.Ply();
        const requestSuites = await p.loadRequests(movieQueries, moviesApi);
        const requests = new Map<Uri, ply.Suite<ply.Request>>();
        requestSuites.forEach((requestSuite) => {
            requests.set(Uri.file(path.normalize(path.resolve(requestSuite.path))), requestSuite);
        });

        const caseSuites = await p.loadCases(movieCrud);
        const cases = new Map<Uri, ply.Suite<ply.Case>>();
        caseSuites.forEach((caseSuite) => {
            cases.set(Uri.file(path.normalize(path.resolve(caseSuite.path))), caseSuite);
        });

        plyRoots.build(requests, cases, new Map<Uri, ply.Suite<ply.Step>>());

        const moviesByYearAndRating = plyRoots.requestsRoot.find(
            (t) => t.id === `${movieQueriesUri}#moviesByYearAndRating`
        );
        assert.ok(moviesByYearAndRating);
        let parent = plyRoots.getParent(moviesByYearAndRating!.id);
        assert.ok(parent);
        assert.strictEqual(
            plyRoots.getParent(plyRoots.getParent(parent!.id)!.id)!.id,
            plyRoots.requestsRoot.id
        );

        const createMovie = plyRoots.requestsRoot.find(
            (t) => t.id === `${moviesApiUri}#createMovie`
        );
        assert.ok(createMovie);
        parent = plyRoots.getParent(createMovie!.id);
        assert.ok(parent);
        assert.strictEqual(
            plyRoots.getParent(plyRoots.getParent(parent!.id)!.id)!.id,
            plyRoots.requestsRoot.id
        );

        const addNewMovie = plyRoots.casesRoot.find(
            (t) => t.id === `${movieCrudUri}#add new movie`
        );
        assert.ok(addNewMovie);
        parent = plyRoots.getParent(addNewMovie!.id);
        assert.ok(parent);
        assert.strictEqual(
            plyRoots.getParent(plyRoots.getParent(parent!.id)!.id)!.id,
            plyRoots.casesRoot.id
        );
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

        assert.strictEqual(
            plyRoot.toString(),
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
});
