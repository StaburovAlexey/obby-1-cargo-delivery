import { fileURLToPath } from 'node:url';
import { defineConfig } from '@rsbuild/core';

export default defineConfig(({env})=>{
  const platform=process.env.GAME_PLATFORM||'yandex';
  if(!['yandex','vk'].includes(platform))throw new Error('Unknown game platform: '+platform);
  const vk=platform==='vk';
  return {
  source: {
    entry: { index: './scripts/rsbuild-entry.js' },
    assetsInclude: /\.glb$/,
    define: {
      __URBAN_DEV_SERVER__: JSON.stringify(env==='development'),
      __URBAN_DEVELOPMENT__: JSON.stringify(env==='development'||process.env.PUBLIC_GAME_DEVELOPMENT==='1'||(!vk&&process.env.PUBLIC_YANDEX_DEVELOPMENT==='1')),
      __VK_API_URL__: JSON.stringify(process.env.PUBLIC_VK_API_URL||''),
      __MULTIPLAYER_URL__: process.env.PUBLIC_MULTIPLAYER_URL
        ? JSON.stringify(process.env.PUBLIC_MULTIPLAYER_URL)
        : env==='development'
          ? "(location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws'"
          : JSON.stringify(''),
    },
  },
  resolve: {

    alias: { three: fileURLToPath(new URL('./dist/vendor/three.module.js', import.meta.url)), '@game-bootstrap':fileURLToPath(new URL(vk?'./dist/bootstrap-vk.js':'./dist/bootstrap.js',import.meta.url)) },
  },
  html: { template: './dist/index.html' },
  output: {

    distPath: { root: vk?'build-vk':'build' },
    assetPrefix: 'auto',
    copy: [


      { from: './dist/assets', to: 'assets', globOptions: { ignore: ['**/*.glb', '**/liveries/**', '**/shop/*.webp', '**/shop-previews/**', '**/tracks/**', '**/smoke/*.webp', '**/decoders/**'] } },
      { from: './dist/vendor/THREE-LICENSE.txt', to: 'licenses/THREE-LICENSE.txt' },
      { from: './dist/vendor/RAPIER-LICENSE.txt', to: 'licenses/RAPIER-LICENSE.txt' },
      { from: './dist/vendor/MESHOPT-LICENSE.txt', to: 'licenses/MESHOPT-LICENSE.txt' },
      { from: './dist/vendor/BASIS-LICENSE.txt', to: 'licenses/BASIS-LICENSE.txt' },
      ...(vk?[{from:'./publishing/yandex/inapp/icons',to:'assets/inapp'}]:[]),
      ...(vk?[{from:'./node_modules/@vkontakte/vk-bridge/LICENSE',to:'licenses/VK-BRIDGE-LICENSE.txt'}]:[]),
    ],
  },
  server: {
    host: '127.0.0.1', port: vk?8084:8083, strictPort: true,
    proxy: { '/ws': { target: `http://127.0.0.1:${process.env.PORT||8082}`, ws: true },'/api/vk':{target:`http://127.0.0.1:${process.env.VK_PORT||8085}`} },
  },
  plugins: [{
    name: 'urban-route-html',
    setup(api) {
      api.modifyHTML(html => html

        .replace(/\s*<link rel="stylesheet" href="\.\/(?:style|vehicle-controls|progression-ui|settings-menu|hangar-drift-leaderboard|vehicle-livery-shop|online-ui|canyon-ui|modal-ui|ui-icons)\.css"\s*\/?>/g, '')
        .replace(/\s*<script type="importmap">[\s\S]*?<\/script>/g, '')
        .replace(/\s*<script type="module">[\s\S]*?<\/script>/g, ''));
    },
  }],
};});
