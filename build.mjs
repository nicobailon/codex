import esbuild from 'esbuild';
import { nodeExternalsPlugin } from 'esbuild-node-externals';

console.log('Starting build process...');

esbuild.build({
    entryPoints: ['src/entrypoints/cli.tsx'],
    bundle: true,
    outdir: 'dist',
    platform: 'node',
    format: 'esm',
    target: 'node18',
    sourcemap: true,
    jsx: 'automatic',
    plugins: [nodeExternalsPlugin()],
    loader: { '.node': 'copy' },
    define: {
        'process.env.NODE_ENV': '"production"',
    },
    logLevel: 'info',
}).then(result => {
    console.log('Build completed successfully.');
}).catch((err) => {
    console.error("Build failed:", err);
    process.exit(1);
});