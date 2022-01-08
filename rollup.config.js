import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import typescript from 'rollup-plugin-typescript2';

export default [
    {
        // ply worker
        input: 'src/worker/main.ts',

        output: {
            file: 'out/worker/bundle.js',
            format: 'cjs',
            sourcemap: true
        },

        external: ['fs', 'util', 'event', 'path', 'net', 'stream', 'buffer', 'string_decoder'],

        plugins: [
            resolve(),
            commonjs(),
            typescript({
                tsconfigOverride: { compilerOptions: { module: 'es2015' } }
            }),
            json({
                compact: true
            })
        ]
    },
    {
        // flow webview
        input: 'media/src/main.ts',
        output: {
            name: 'flow',
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
