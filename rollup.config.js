import nodeResolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';
import json from 'rollup-plugin-json';

export default {

    input: 'src/worker/main.ts',

    output: {
        file: 'out/worker/bundle.js',
        format: 'cjs',
        sourcemap: true
    },

    external: [ 'fs', 'util', 'event', 'path', 'net', 'stream', 'buffer', 'string_decoder' ],

    plugins: [
        nodeResolve(),
        commonjs(),
        typescript({
            tsconfigOverride: { compilerOptions: { module: 'es2015' } }
        }),
        json({
            compact: true
        })
    ]
};
