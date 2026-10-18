import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createInitialPlayerState} from '../dist/online-protocol.js';
import {createRecordingCanvasContext} from './fixtures/classroom-canvas.mjs';

const implementation=await import('../dist/classroom-board.js').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
const {createClassroomBoard,createBoardProjection}=implementation;
function documentFixture(){
 const canvases=[];
 const doc={createElement(){
  const ctx=createRecordingCanvasContext();
  const canvas={width:0,height:0,getContext:()=>ctx,ctx};canvases.push(canvas);return canvas;
 }};
 return {doc,canvases};
}
const player=(id,number,x,z,seq=1,teleportId=0)=>({id,number,state:{...createInitialPlayerState(),seq,position:[x,0,z],teleportId}});
const room=(players,driftLeaderboard=[])=>({roomId:'room-one',selfId:'self',players,driftLeaderboard});
function fixture(){
 assert.equal(typeof createClassroomBoard,'function','the classroom board renderer is available');
 const document=documentFixture(),parent=new THREE.Group();
 const board=createClassroomBoard(THREE,{document:document.doc,parent});
 return {board,parent,canvas:board.mesh.material.map.image,ctx:board.mesh.material.map.image.ctx};
}
test('map projection keeps a room position on its real road and preserves the two world axes',()=>{
 assert.equal(typeof createBoardProjection,'function');
 const map=createBoardProjection([{x:0,z:0},{x:0,z:-100},{x:20,z:-50}],{x:0,y:0,width:200,height:100},0);
 assert.deepEqual(map({x:0,z:0}),{x:0,y:30});
 assert.deepEqual(map({x:0,z:-100}),{x:200,y:30});
 assert.deepEqual(map({x:20,z:-50}),{x:100,y:70});
});
test('the actual board texture shows other room players, hides self on maps and uses the received ranking',()=>{
 const {board,parent,ctx}=fixture();
 try{
  const snapshot=room([player('self',1,-41,47),player('peer',2,700,-400)], [{playerId:'peer',number:2,score:12345,durationMs:90000}]);
  board.update({now:0,anchor:{x:-41,z:47},snapshot,language:'ru'});
  assert.equal(board.mesh.parent,parent);assert.equal(board.mesh.material.map.colorSpace,THREE.SRGBColorSpace);
  assert.ok(ctx.texts.some(t=>t.text==='Игрок 2'));assert.ok(ctx.texts.some(t=>t.text.replace(/\s/g,'')==='12345'));
  assert.ok(!ctx.texts.some(t=>t.text==='Вы'),'the observer has no map label');
  const colors=new Set(ctx.dots.map(d=>d.color));assert.ok(!colors.has('#ffd36b'));assert.ok(colors.has('#5fe0dc'));
  const version=board.mesh.material.map.version;
  board.update({now:1000,anchor:{x:500,z:-500},snapshot:room([player('self',1,1500,-400)]),language:'en'});
  assert.equal(board.mesh.material.map.version,version,'distant players do not upload the board texture');
 }finally{board.dispose();}
});
test('moving only the observer does not repaint the room map or hide their drift result',()=>{
 const {board,ctx}=fixture(),anchor={x:-41,z:47};
 try{
  const standings=[{playerId:'self',score:2500}];
  board.update({now:0,anchor,snapshot:room([player('self',1,-41,47)],standings)});
  assert.equal(ctx.dots.length,0,'the observer is absent from both maps');
  assert.ok(ctx.texts.some(t=>t.text==='Вы'&&t.x===1415),'the personal result stays in the ranking');
  const version=board.mesh.material.map.version;
  board.update({now:1000,anchor,snapshot:room([player('self',1,-36,40,2)],standings)});
  assert.equal(board.mesh.material.map.version,version,'walking toward the board does not upload unchanged map content');
 }finally{board.dispose();}
});
test('room dots interpolate but a teleport, room switch or returning from afar snaps to the new pose',()=>{
 const {board,ctx}=fixture(),anchor={x:-41,z:47};
 const peerDot=()=>ctx.dots.filter(d=>d.color==='#5fe0dc').at(-1);
 try{
  board.update({now:0,anchor,snapshot:room([player('peer',2,500,-400)])});const start=peerDot().x;
  const moving=room([player('peer',2,1000,-400,2)]);
  board.update({now:120,anchor,snapshot:moving});
  board.update({now:240,anchor,snapshot:moving});const middle=peerDot().x;
  board.update({now:400,anchor,snapshot:moving});const end=peerDot().x;
  assert.ok(start<middle&&middle<end,`${start} < ${middle} < ${end}: movement is interpolated`);
  const settled=board.mesh.material.map.version;
  board.update({now:500,anchor,snapshot:moving});assert.equal(board.mesh.material.map.version,settled,'stationary dots do not repaint');
  board.update({now:600,anchor,snapshot:room([player('peer',2,1200,-400,3,1)])});assert.ok(peerDot().x>end,'teleports do not sweep across the map');
  board.update({now:720,anchor,snapshot:{...room([player('peer',2,300,-400)]),roomId:'another-room'}});assert.ok(peerDot().x<start,'a new room has no old interpolation history');
  const distant=room([player('peer',2,900,-400)]);board.update({now:1000,anchor:{x:500,z:-500},snapshot:distant});
  board.update({now:1200,anchor,snapshot:distant});assert.ok(peerDot().x>middle,'returning to class shows the latest room state immediately');
 }finally{board.dispose();}
});
test('lost connections remove room dots and results and disposal releases every board resource once',()=>{
 const {board,ctx,parent}=fixture(),anchor={x:-41,z:47};
 const resourceDisposals={geometry:0,material:0,texture:0};
 board.mesh.geometry.addEventListener('dispose',()=>resourceDisposals.geometry++);
 board.mesh.material.addEventListener('dispose',()=>resourceDisposals.material++);
 board.mesh.material.map.addEventListener('dispose',()=>resourceDisposals.texture++);
 board.update({now:0,anchor,snapshot:room([player('peer',2,700,-400)],[{playerId:'peer',number:2,score:12345}])});
 ctx.texts.length=0;ctx.dots.length=0;
 board.update({now:1000,anchor,snapshot:null,language:'en'});
 assert.ok(ctx.texts.some(t=>/connect|offline/i.test(t.text)));assert.ok(!ctx.texts.some(t=>t.text.includes('12345')));
 assert.equal(ctx.dots.filter(d=>d.color==='#5fe0dc').length,0);
 board.dispose();board.dispose();assert.deepEqual(resourceDisposals,{geometry:1,material:1,texture:1});assert.equal(parent.children.length,0);
});
test('a player outside the first ten results still sees their own rank and score',()=>{
 const {board,ctx}=fixture();
 try{
  const players=Array.from({length:12},(_,i)=>player(i===11?'self':`peer-${i}`,i+1,500+i*20,-400));
  const standings=players.map((p,i)=>({playerId:p.id,number:p.number,score:12000-i*100}));
  ctx.texts.length=0;
  board.update({now:0,anchor:{x:-41,z:47},snapshot:room(players,standings)});
  const rank=ctx.texts.find(t=>t.text==='12'&&t.x===1350);assert.ok(rank);
  assert.ok(ctx.texts.some(t=>t.text==='Вы'&&t.y===rank.y));
  assert.ok(ctx.texts.some(t=>t.text.replace(/\s/g,'')==='10900'&&t.y===rank.y));
  assert.equal(ctx.texts.filter(t=>t.x===1350&&/^\d+$/.test(t.text)).length,10);
 }finally{board.dispose();}
});
