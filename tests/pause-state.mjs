import assert from 'node:assert/strict';
import {createPauseState} from '../dist/pause-state.js';
const p=createPauseState();p.set('ad',true);p.set('menu',true);p.set('ad',false);assert(p.paused);
p.set('menu',false);assert(!p.paused);let count=0;p.subscribe(()=>count++);p.set('sdk',true);p.set('sdk',true);assert.equal(count,1);
console.log('PASS independent pause reasons and idempotent transitions.');
