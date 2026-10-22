import assert from 'node:assert/strict';
import test from 'node:test';
import {createDriftScore} from '../dist/drift-score.js';
import {canyonPointAt} from '../dist/canyon-track.js';

function run(extra){
 const score=createDriftScore(),start=canyonPointAt(5);assert.ok(score.start(start));
 for(let s=6;s<60;s++){
  const p=canyonPointAt(s),h=p.heading+.45;
  score.update(.05,{...p,heading:h,velocityX:-Math.sin(p.heading)*20,velocityZ:-Math.cos(p.heading)*20,...extra});
 }
 return score.state;
}
test('supported upright drift earns points; flight and overturn cannot earn points',()=>{
 assert.ok(run({grounded:true,upY:1}).score>0);
 assert.equal(run({grounded:false,airborne:true,upY:1}).score,0);
 assert.equal(run({grounded:true,upY:-1}).score,0);
});
