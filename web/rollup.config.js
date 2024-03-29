import vue from 'rollup-plugin-vue';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import esbuild from 'rollup-plugin-esbuild';
import postcss from 'rollup-plugin-postcss';
import replace from '@rollup/plugin-replace';
import json from '@rollup/plugin-json';

console.log('NODE_ENV: ' + process.env.NODE_ENV);

export default {
    input: 'src/main.ts',
    output: {
        file: 'out/bundle.js',
        format: 'es',
        sourcemap: process.env.NODE_ENV === 'production' ? false : 'inline',
        inlineDynamicImports: true
    },
    plugins: [
        vue(),
        resolve(),
        commonjs(),
        esbuild({
            minify: true
        }),
        postcss({
            extract: true
        }),
        replace({
            preventAssignment: true,
            'process.env.NODE_ENV': JSON.stringify('production')
        }),
        json({
            compact: true
        })
        // serve() // for testing
    ],
    onwarn(warning, warn) {
        // monaco-editor causes: `this` has been rewritten to `undefined`
        if (warning.code === 'THIS_IS_UNDEFINED') return;
        warn(warning);
    }
};
