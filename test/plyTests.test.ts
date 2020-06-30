import * as assert from 'assert';
import { PlyRoot } from '../src/plyRoots';
import * as help from './help';

describe('vs-code ply tests', function () {

    it('should be grouped', async function() {
        let plyRoot = new PlyRoot(help.workspaceFolderUri, 'requests', 'Requests');
        let plyableUris = [
            plyRoot.toUri('src/test/ply/up-here.request.yaml#oneUp'),
            plyRoot.toUri('src/test/ply/requests/create-movie.request.yaml#createMovie'),
            plyRoot.toUri('src/test/ply/requests/delete-movie.request.yaml#deleteMovie'),
            plyRoot.toUri('src/test/plyables/x.request.yaml#reqX1'),
            plyRoot.toUri('src/test/plyables/x.request.yaml#reqX2'),
            plyRoot.toUri('src/test/plyables/y.request.yaml#reqY'),
            plyRoot.toUri('test/ply/requests/a.request.yaml#reqA'),
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

    it('should be cool', async function() {
        console.log("I'm cool");
        assert.equal("ain't cool", 'cool');
    });

    it('should fail', async function() {
        console.log('Be cool');
        assert.equal('not cool', 'cool');
    });

});
