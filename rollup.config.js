import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';

export default [
    {
        // worker
        input: 'src/worker/main.ts',
        output: {
            file: 'out/worker/bundle.js',
            format: 'cjs',
            sourcemap: true
        },
        external: [ 'fs', 'util', 'event', 'path', 'net', 'stream', 'buffer', 'string_decoder' ],
        plugins: [
            resolve(),
            commonjs(),
            typescript({
                tsconfigOverride: { compilerOptions: { module: 'es2015' } }
            })
        ]
    },
    {
        // webviews
        input: 'media/workflow.ts',
        output: {
            file: 'media/out/bundle.js',
            format: 'umd'
        },
        plugins: [
            resolve(),
            commonjs(),
            typescript({
                tsconfigOverride: { compilerOptions: { module: 'es2015' } }
            })
        ]
    }
];
