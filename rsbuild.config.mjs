import { fileURLToPath } from 'node:url';
import { defineConfig } from '@rsbuild/core';

export default defineConfig(({env})=>({
  source: {
    entry: { index: './scripts/rsbuild-entry.js' },
    assetsInclude: /\.glb$/,
    define: {
      __URBAN_DEVELOPMENT__: JSON.stringify(env==='development'||process.env.PUBLIC_YANDEX_DEVELOPMENT==='1'),
      __MULTIPLAYER_URL__: process.env.PUBLIC_MULTIPLAYER_URL
        ? JSON.stringify(process.env.PUBLIC_MULTIPLAYER_URL)
        : env==='development'
          ? "(location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws'"
          : JSON.stringify(''),
    },
  },
  resolve: {

    alias: { three: fileURLToPath(new URL('./dist/vendor/three.module.js', import.meta.url)) },
  },
  html: { template: './dist/index.html' },
  output: {

    distPath: { root: 'build' },
    assetPrefix: './',
    copy: [


      { from: './dist/assets', to: 'assets', globOptions: { ignore: ['**/*.glb'] } },
      { from: './dist/vendor/THREE-LICENSE.txt', to: 'licenses/THREE-LICENSE.txt' },
    ],
  },
  server: {
    host: '127.0.0.1', port: 8083, strictPort: true,
    proxy: { '/ws': { target: `http://127.0.0.1:${process.env.PORT||8082}`, ws: true } },
  },
  plugins: [{
    name: 'urban-route-html',
    setup(api) {
      api.modifyHTML(html => html

        .replace(/\s*<link rel="stylesheet" href="\.\/(?:style|vehicle-controls|progression-ui|settings-menu|online-ui)\.css"\s*\/>/g, '')
        .replace(/\s*<script type="importmap">[\s\S]*?<\/script>/g, '')
        .replace(/\s*<script type="module">[\s\S]*?<\/script>/g, ''));
    },
  }],
}));
