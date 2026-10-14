import { fileURLToPath } from 'node:url';
import { defineConfig } from '@rsbuild/core';

export default defineConfig(({env})=>({
  source: {
    entry: { index: './scripts/rsbuild-entry.js' },
    assetsInclude: /\.glb$/,
    define: {
      __URBAN_DEVELOPMENT__: JSON.stringify(env==='development'||process.env.PUBLIC_YANDEX_DEVELOPMENT==='1'),
      __MULTIPLAYER_URL__: JSON.stringify(process.env.PUBLIC_MULTIPLAYER_URL||(env==='development'?'ws://127.0.0.1:8081/ws':'')),
    },
  },
  resolve: {
    // Use the same bundled Three.js revision as the importmap in dist/index.html.
    alias: { three: fileURLToPath(new URL('./dist/vendor/three.module.js', import.meta.url)) },
  },
  html: { template: './dist/index.html' },
  output: {
    // dist contains source files, so it must never be the build output directory.
    distPath: { root: 'build' },
    assetPrefix: './',
    copy: [
      // GLBs are emitted from literal new URL() references.
      // Keep URL-based audio/icons and asset attribution at their existing paths.
      { from: './dist/assets', to: 'assets', globOptions: { ignore: ['**/*.glb'] } },
      { from: './dist/vendor/THREE-LICENSE.txt', to: 'licenses/THREE-LICENSE.txt' },
    ],
  },
  server: { host: '127.0.0.1', port: 8080, strictPort: true },
  plugins: [{
    name: 'urban-route-html',
    setup(api) {
      api.modifyHTML(html => html
        // The entry bundles CSS and handles startup errors for the built version.
        .replace(/\s*<link rel="stylesheet" href="\.\/(?:style|vehicle-controls|progression-ui|settings-menu|online-ui)\.css"\s*\/>/g, '')
        .replace(/\s*<script type="importmap">[\s\S]*?<\/script>/g, '')
        .replace(/\s*<script type="module">[\s\S]*?<\/script>/g, ''));
    },
  }],
}));
