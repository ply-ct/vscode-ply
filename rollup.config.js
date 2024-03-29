import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import typescript from 'rollup-plugin-typescript2';
import terser from '@rollup/plugin-terser';

console.log('NODE_ENV: ' + process.env.NODE_ENV);

export default [
    {
        // ply worker
        input: 'src/worker/main.ts',

        output: {
            file: 'out/worker/bundle.js',
            format: 'cjs',
            sourcemap: true
        },

        external: [
            'fs',
            'util',
            'event',
            'path',
            'net',
            'stream',
            'buffer',
            'string_decoder',
            '@cspotcode/source-map-support',
            'stacktracey'
        ],

        plugins: [
            resolve(),
            commonjs({
                ignoreDynamicRequires: true
            }),
            typescript({
                tsconfigOverride: { compilerOptions: { module: 'es2015' } }
            }),
            json({
                compact: true
            })
            // TODO: terser messes up callingCaseInfo
            // terser()
        ]
    },
    {
        // flow webview
        input: 'media/src/flow/main.ts',
        output: {
            name: 'flow',
            file: 'media/out/flow.js',
            format: 'umd',
            sourcemap: process.env.NODE_ENV === 'production' ? false : 'inline'
        },
        plugins: [
            resolve(),
            commonjs(),
            typescript({
                tsconfigOverride: { compilerOptions: { module: 'es2015' } }
            }),
            terser()
        ]
    },
    {
        // viz webview
        input: 'media/src/viz/main.ts',
        output: {
            name: 'viz',
            file: 'media/out/viz.js',
            format: 'umd',
            sourcemap: process.env.NODE_ENV === 'production' ? false : 'inline'
        },
        plugins: [
            resolve(),
            commonjs(),
            typescript({
                tsconfigOverride: { compilerOptions: { module: 'es2015' } }
            }),
            terser()
        ]
    }
];
