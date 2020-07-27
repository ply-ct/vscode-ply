import ply from 'ply-ct';
import { assert } from 'chai';
import { suite, test, before, after } from 'ply-ct';

@suite('movie-crud')
export class MovieCrud {

    movieId?: string;

    /**
     * Cleanup movie left over from previous failed tests.
     */
    @before
    async beforeAll(values: any) {
        const requestSuite = await ply.loadSuite('test/ply/requests/movies-api.ply.yaml');
        const deleteMovie = requestSuite.get('deleteMovie');
        assert.exists(deleteMovie);
        const response = await deleteMovie!.submit({...values, id: '435b30ad'});
        requestSuite.log.info('Cleanup response status code', response.status.code);
        // response status should either be 200 or 404 (we don't care which during cleanup)
        assert.ok(response.status.code === 200 || response.status.code === 404);
    }

    @test('add new movie')
    async createMovie(values: any) {
        const requestSuite = await ply.loadSuite('test/ply/requests/movies-api.ply.yaml');
        const result = await requestSuite.run('createMovie', values);
        assert.exists(result.response);
        assert.exists(result.response?.body);
        // capture movie id from response -- used in downstream values
        this.movieId = result.response?.body?.id;
        requestSuite.log.info(`Created movie: id=${this.movieId}`);
    }

    @test('update rating')
    async updateRating(values: any) {
        const requestSuite = await ply.loadSuite('test/ply/requests/movies-api.ply.yaml');
        // update movie rating -- using id returned from createMovie request
        values.id = this.movieId;
        values.rating = 4.5;
        await requestSuite.run('updateMovie', values);
        // confirm the update
        await requestSuite.run('retrieveMovie', values);
    }

    @test('remove movie')
    async deleteMovie(values: any) {
        const requestSuite = await ply.loadSuite('test/ply/requests/movies-api.ply.yaml');
        // delete movie
        await requestSuite.run('deleteMovie', values);
        // confirm the delete
        await requestSuite.run('retrieveMovie', values);
    }

    @after
    afterAll() {
    }
}
