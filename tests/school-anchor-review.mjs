

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {freshCareer} from '../dist/career-save.js';
import {SCHOOL_CONFIG,SKIN_CONFIG} from '../dist/progression-config.js';
import {CLASSROOM_ENTRIES,CLASSROOM_DESKS} from '../dist/garage-scene.js';
import {updateProgressionWorldLabels,WORLD_LABEL_DROP,schoolLabelScale} from '../dist/progression-hud.js';

const root=new URL('../',import.meta.url),qa=new URL('qa/school-anchors/',root);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
const contract=JSON.parse(fs.readFileSync(new URL('baseline-contract.json',qa),'utf8'));
const widths=[[320,480],[360,780],[390,844],[430,932],[568,320],[768,900],[844,390],[1440,900]];
const results=[],specimens=[];let assertionCount=0;
const near=(a,b,label,tolerance=1e-7)=>{assertionCount++;assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tolerance,`${label}: ${a} != ${b}`);};
const check=(name,run)=>{try{const detail=run();results.push({name,status:'PASS',...(detail?{detail}:{})});console.log('PASS '+name);}catch(error){results.push({name,status:'FAIL',error:error.stack});console.error('FAIL '+name+'\n'+error.stack);}};
const withApp=(run,options={})=>{const app=createAppDom({startDriving:false,...options});try{return run(app);}finally{app.dispose();}};




const heldOptions={deferCharacters:true,career:{...freshCareer(),characterId:'pack1',ownedSkinIds:['bacon','pack1']}};
const held=(run,options={})=>withApp(run,{...heldOptions,...options});
const el=(app,id)=>app.ids.get(id);
const labels=app=>CLASSROOM_ENTRIES.map((_,i)=>el(app,`school-label-${i+1}`));
const anchors=CLASSROOM_ENTRIES.map(e=>new THREE.Vector3(e.labelAnchor.x,e.labelAnchor.y-WORLD_LABEL_DROP,e.labelAnchor.z));
const center=anchors[2].clone();
const orbit=(app,yaw,pitch=0,distance=35)=>{
  const a=yaw*Math.PI/180,p=pitch*Math.PI/180,c=app.debug.camera;
  c.position.set(center.x+Math.sin(a)*Math.cos(p)*distance,center.y+Math.sin(p)*distance,center.z+Math.cos(a)*Math.cos(p)*distance);
  c.lookAt(center);c.updateMatrixWorld();return c;
};


const oracle=(camera,point,width,height,maxDistance=65)=>{
  const view=new THREE.Vector4(point.x,point.y,point.z,1).applyMatrix4(camera.matrixWorldInverse);
  const clip=view.clone().applyMatrix4(camera.projectionMatrix),ndc={x:clip.x/clip.w,y:clip.y/clip.w,z:clip.z/clip.w};
  const hidden=!(view.z<0)||-view.z<camera.near-1e-10||-view.z>camera.far+1e-10||camera.position.distanceToSquared(point)>maxDistance**2||Math.abs(ndc.x)>1.08||Math.abs(ndc.y)>1.08;
  return {hidden,x:(ndc.x+1)*width/2,y:(1-ndc.y)*height/2,depth:-view.z,ndc};
};
const capture=(app,width,height,tag)=>{
  const expected=anchors.map(a=>oracle(app.debug.camera,a,width,height)),visible=[];
  for(const [i,element]of labels(app).entries()){
    const want=expected[i];assert.equal(element.hidden,want.hidden,`${tag}: school-${i+1} visibility`);
    if(want.hidden)continue;
    near(parseFloat(element.style.left),want.x,`${tag}: school-${i+1} exact X`);
    near(parseFloat(element.style.top),want.y,`${tag}: school-${i+1} exact Y`);
    near(+element.style.getPropertyValue('--school-scale'),Math.max(.5,Math.min(1,(width-40)/600)),`${tag}: viewport-only scale`);
    assert.ok(Number.isInteger(+element.style.zIndex)&&+element.style.zIndex>0,`${tag}: z-index`);
    assert.ok(!element.style.transform||!/(?:rotate|skew|perspective|scaleX\(-)/.test(element.style.transform),`${tag}: no artwork rotation or mirroring`);
    visible.push({school:i+1,x:want.x,y:want.y,depth:want.depth,zIndex:+element.style.zIndex});
  }
  for(const a of visible)for(const b of visible)if(a.depth<b.depth-1e-8)assert.ok(a.zIndex>b.zIndex,`${tag}: nearer school-${a.school} must cover school-${b.school}`);
  assert.equal(new Set(visible.map(a=>a.zIndex)).size,visible.length,`${tag}: unique stacking ranks`);
  return visible;
};
const frameAt=(app,width,height,yaw,pitch=0,distance=35)=>{orbit(app,yaw,pitch,distance);app.frame();return capture(app,width,height,`${width}x${height}/${yaw}/${pitch}/${distance}`);};
const stateOf=app=>labels(app).map(e=>({hidden:e.hidden,left:e.style.left,top:e.style.top,scale:e.style.getPropertyValue('--school-scale'),zIndex:e.style.zIndex}));

check('School UI, controls, characters and shared assets stay unchanged through the authorized route expansion and strong-turn assist',()=>{
  const routeScope=new Set(['biome-surfaces.js','driving-model.js','biome-travel.js','city-driving.js','driving-ground.js','economy-config.js','gameplay.js','garage-scene.js','index.html','road-hazards.js','road-hazards-scene.js','road-layout.js','road-material.js','scene.js','wheel-particles.js']);
  let unchanged=0;for(const [path,digest]of Object.entries(contract.unchangedFiles)){if(routeScope.has(path.split('/').at(-1)))continue;assert.equal(hash(fs.readFileSync(new URL(path,root))),digest,path);unchanged++;}
  assert.match(read('dist/app.js'),/return labelProjection\.z;/);
  assert.equal(hash(read('dist/progression-ui.css')),contract.cssAfterAuthorizedTransitionRemovalSha256,'CSS scope');
  const hud=read('dist/progression-hud.js');
  assert.equal(hash(hud.slice(hud.indexOf('const descriptions='),hud.indexOf('export function updateProgressionWorldLabels'))),contract.hudNonWorldLabelLogicSha256,'non-world-label HUD logic');
  assert.equal(hash(hud.slice(hud.indexOf('  for(const [i,stand]of garage.stands.entries())'))),contract.skinLabelLoopSha256,'skin projection loop');
  assert.equal(WORLD_LABEL_DROP,.4);assert.equal(CLASSROOM_DESKS.length,20);
  assert.deepEqual(SCHOOL_CONFIG.map(s=>[s.price,s.rate]),[[0,1.5],[500,2],[1500,3],[3500,4.5],[7000,6]]);
  return {unchangedRuntimeAndAssetFiles:unchanged,sharedDesks:20,baseline:contract.baseline};
});

check('120 by 128 composition remains bottom-centered and camera-facing; inner bob is retained without X/Y lag',()=>{
  const css=read('dist/progression-ui.css'),html=read('dist/index.html');
  assert.match(css,/\.learning-world-label\{width:120px;height:128px;transform:translate\(-50%,-100%\) scale\(var\(--school-scale,1\)\);transform-origin:bottom center\}/);
  assert.doesNotMatch(css,/transition:[^}]*\b(?:left|top)\b/);
  assert.match(css,/\.school-content\{position:relative;width:120px;height:128px;animation:school-float 2\.8s ease-in-out infinite/);
  assert.match(css,/@keyframes school-float\{0%,100%\{transform:translateY\(0\)\}50%\{transform:translateY\(-4px\)\}\}/);
  assert.match(read('dist/style.css'),/#world-labels\s*\{[^}]*z-index:\s*2;[^}]*overflow:\s*hidden/);
  for(let i=1;i<=5;i++)assert.match(html,new RegExp(`id="school-label-${i}"[^>]*><div class="school-content"`));
  return {artworkWidth:120,artworkHeight:128,bobPx:4,worldLabelLayer:2};
});

check('Actual app frames match independent anchor and depth oracle for full 360-degree yaw, four pitches/distances and eight viewports',()=>{
  let poses=0,visibleLabels=0,overlappingPairs=0,maxAnchorErrorPx=0;
  const summaries=[];
  for(const [width,height]of widths)held(app=>{
    let count=0;assert.equal(app.debug.characterReady,false,'held fixture leaves asset pending');
    for(const distance of [2,18,35,60])for(const pitch of [0,20,55,80])for(let yaw=0;yaw<360;yaw+=15){
      const row=frameAt(app,width,height,yaw,pitch,distance);poses++;count+=row.length;
      for(const a of row){const element=el(app,`school-label-${a.school}`);maxAnchorErrorPx=Math.max(maxAnchorErrorPx,Math.abs(parseFloat(element.style.left)-a.x),Math.abs(parseFloat(element.style.top)-a.y));}
      for(let a=0;a<row.length;a++)for(let b=a+1;b<row.length;b++)if(Math.abs(row[a].x-row[b].x)<120*schoolLabelScale(width)&&Math.abs(row[a].y-row[b].y)<128*schoolLabelScale(width))overlappingPairs++;
    }
    summaries.push({width,height,poses:384,visibleLabels:count});visibleLabels+=count;
  },{width,height});
  assert.ok(overlappingPairs>100,'overlap must actually be exercised');
  return {poses,visibleLabels,overlappingPairs,maxAnchorErrorPx,viewports:summaries};
});

check('Front/back projection order reverses; side-on anchors coincide and nearest label reverses across a 180-degree orbit',()=>held(app=>{
  const width=390,height=844,samples={};
  for(const [name,yaw]of [['front',0],['east-side',90],['back',180],['west-side',270]]){
    const row=frameAt(app,width,height,yaw);assert.equal(row.length,5);
    samples[name]=row;specimens.push({name,width,height,scale:schoolLabelScale(width),rows:row});
  }
  assert.ok(samples.front[0].x<samples.front[4].x);assert.ok(samples.back[0].x>samples.back[4].x);
  for(const name of ['east-side','west-side']){
    const row=samples[name];assert.ok(Math.max(...row.map(a=>a.x))-Math.min(...row.map(a=>a.x))<1e-8,'side view must collapse to the true common X');
    assert.ok(Math.max(...row.map(a=>a.y))-Math.min(...row.map(a=>a.y))<1e-8,'level side view must share true Y');
  }
  const top=name=>samples[name].reduce((a,b)=>a.zIndex>b.zIndex?a:b).school;
  assert.equal(top('east-side'),5);assert.equal(top('west-side'),1);
  const before=stateOf(app);app.debug.camera.rotateY(Math.PI);app.frame();assert.ok(labels(app).every(e=>e.hidden),'turning away hides all schools');
  frameAt(app,width,height,270);assert.deepEqual(stateOf(app),before,'returning restores exact positions and depth ranks');
  return {eastNearest:top('east-side'),westNearest:top('west-side'),sideSpanPx:Math.max(...samples['east-side'].map(a=>a.x))-Math.min(...samples['east-side'].map(a=>a.x))};
}));

check('Near-camera and partially offscreen anchors are never clamped or spread; beyond-frustum, near-plane and distance culling remain intact',()=>{
  let cases=0,outsideCenters=0;
  for(const [width,height]of widths)held(app=>{
    const c=app.debug.camera;
    for(const depth of [.51,.6,2,18])for(const nx of [-1.04,1.04])for(const ny of [0,-1.04,1.04]){
      const halfY=Math.tan(c.fov*Math.PI/360)*depth,halfX=halfY*c.aspect;
      c.position.set(center.x-nx*halfX,center.y-ny*halfY,center.z+depth);c.lookAt(c.position.x,c.position.y,c.position.z-1);c.updateMatrixWorld();app.frame();
      const row=capture(app,width,height,`edge ${width}/${depth}/${nx}/${ny}`),target=row.find(r=>r.school===3);assert.ok(target,'partly offscreen target remains within culling margin');
      near(target.x,(nx+1)*width/2,'no edge clamp');near(target.y,(1-ny)*height/2,'no vertical clamp');assert.ok(target.x<0||target.x>width);outsideCenters++;cases++;
    }
    for(const [depth,nx,ny,reason]of [[35,1.081,0,'horizontal frustum'],[35,0,1.081,'vertical frustum'],[.49,0,0,'near plane'],[65.01,0,0,'range']]){
      const halfY=Math.tan(c.fov*Math.PI/360)*depth;
      c.position.set(center.x-nx*halfY*c.aspect,center.y-ny*halfY,center.z+depth);c.lookAt(c.position.x,c.position.y,c.position.z-1);c.updateMatrixWorld();app.frame();
      capture(app,width,height,reason);assert.equal(el(app,'school-label-3').hidden,true,reason);cases++;
    }
  },{width,height});
  return {cameraCases:cases,retainedOffscreenCenters:outsideCenters};
});

check('Live ready-character follow camera retains exact projected school positions during repeated full turns',()=>{
  let frames=0,visible=0;
  for(const [width,height]of [[320,480],[390,844],[844,390],[1440,900]])withApp(app=>{
    assert.equal(app.debug.characterReady,true);
    for(const position of [{x:-41,z:72},{x:-22,z:65.5},{x:-55,z:64}])for(let yaw=0;yaw<720;yaw+=10){
      Object.assign(app.debug.gameplay.state.player,{...position,heading:yaw*Math.PI/180});
      app.debug.followCharacter(0,true);app.frame();visible+=capture(app,width,height,`live follow ${width}/${yaw}`).length;frames++;
    }
  },{width,height});
  assert.ok(visible>200);return {frames,visibleLabels:visible,completeTurns:24};
});

check('School ownership changes preserve identical projected anchors, block size and depth order; all rates/access rows survive reload',()=>held(app=>{
  const g=app.debug.gameplay;g.state.money=1_000_000;
  frameAt(app,390,844,90);const geometry=stateOf(app);
  for(const [i,school]of SCHOOL_CONFIG.entries()){
    assert.equal(el(app,`school-rate-${i+1}`).textContent,['1,5','2','3','4,5','6'][i]);
    if(i){const entrance=CLASSROOM_ENTRIES[i];g.state.player={x:entrance.x,z:entrance.z,heading:0};const money=g.state.money;assert.equal(g.buySchool(school.id),true);assert.equal(g.state.money,money-school.price);assert.equal(g.buySchool(school.id),false);}
    app.frame();assert.deepEqual(stateOf(app),geometry,'purchase must not move or resize labels');
    for(const part of ['access','lock','dollar'])assert.equal(el(app,`school-${part}-${i+1}`).hidden,true);
    assert.equal(el(app,`school-price-${i+1}`).textContent,'');
  }
  const career=g.snapshot();held(reloaded=>{frameAt(reloaded,390,844,90);assert.deepEqual(stateOf(reloaded),geometry);for(let i=1;i<=5;i++)assert.equal(el(reloaded,`school-access-${i}`).hidden,true);},{career});
  return {schools:5,purchases:4,reloadedOwnedLabels:5};
}));

check('Actual school button denies insufficient funds, buys once, seats separately and retains five rates on the shared 20-seat pool',()=>withApp(app=>{
  const g=app.debug.gameplay;let paid=0;
  for(const [i,school]of SCHOOL_CONFIG.entries()){
    const entry=CLASSROOM_ENTRIES[i];app.debug.returnToGarage();Object.assign(g.state.player,{x:entry.x,z:entry.z,heading:0});g.state.schoolPurchaseCandidateId=school.id;g.state.cooldown=0;g.state.interactionCooldown=0;app.frame();
    if(i){g.state.money=0;el(app,'buy-school').dispatch('click');app.frame();assert.equal(g.isSchoolOwned(school.id),false);assert.equal(el(app,`school-price-${i+1}`).textContent,String(school.price));assert.equal(el(app,`school-lock-${i+1}`).hidden,false);
      g.state.money=school.price+123;el(app,'buy-school').dispatch('click');assert.equal(g.state.money,123);assert.equal(g.state.seatedId,null);app.frame();assert.equal(el(app,`school-access-${i+1}`).hidden,true);paid++;
    }
    const occupied=CLASSROOM_DESKS.slice(0,19).map(d=>d.id);g.setOccupiedSeatIds(occupied);el(app,'buy-school').dispatch('click');assert.equal(g.state.seatedId,'desk-20');assert.equal(g.state.seatedSchoolId,school.id);
    el(app,'buy-school').dispatch('click');assert.equal(g.state.seatedId,'desk-20');
    const start=g.state.brains;for(let frame=0;frame<60;frame++)app.frame();near(g.state.brains-start,school.rate,'exact study rate',1e-6);
    app.debug.standCharacter();assert.equal(g.state.seatedId,null);g.setOccupiedSeatIds([]);
  }
  g.state.cooldown=0;assert.equal(app.debug.enterVehicle('pickup'),true);app.frame();assert.ok(labels(app).every(e=>e.hidden));app.debug.returnToGarage();app.debug.setDriving(false);app.frame();assert.ok(labels(app).every(e=>e.hidden));
  return {paidSchools:paid,selectedRates:5,sharedFallbackSeat:'desk-20',hiddenInDrivingAndOverview:true};
},{career:{...freshCareer(),money:0}}));

check('Car and skin label coordinates/culling retain their production projection contract across cameras',()=>held(app=>{
  let visibleCars=0,visibleSkins=0;
  for(const target of [new THREE.Vector3(24,5.7,50),new THREE.Vector3(-13,4.6,85)])for(const yaw of [0,45,90,135,180,225,270,315]){
    const c=app.debug.camera,a=yaw*Math.PI/180;c.position.set(target.x+Math.sin(a)*20,target.y+3,target.z+Math.cos(a)*20);c.lookAt(target);c.updateMatrixWorld();app.frame();
    for(const [i,stand]of app.debug.garage.stands.entries()){
      const e=el(app,`skin-label-${i+1}`),expected=oracle(c,new THREE.Vector3(stand.x,5-WORLD_LABEL_DROP,stand.z),390,844,45),owned=app.debug.gameplay.isSkinOwned(SKIN_CONFIG[i].id);
      assert.equal(e.hidden,owned||expected.hidden);assert.equal(el(app,`skin-price-${i+1}`).textContent,String(SKIN_CONFIG[i].price));assert.ok(!e.style.zIndex,'school-only stacking');
      if(!e.hidden){near(parseFloat(e.style.left),expected.x,'skin X');near(parseFloat(e.style.top),expected.y,'skin Y');visibleSkins++;}
    }
    for(const [i,v]of app.debug.garage.vehicles.entries()){
      assert.ok(v.priceAnchor,'authored vehicle anchor');const a=v.priceAnchor,e=el(app,`vehicle-price-${i+1}`),expected=oracle(c,new THREE.Vector3(a.x,a.y-WORLD_LABEL_DROP,a.z),390,844,45),owned=app.debug.gameplay.isOwned(v.id);
      assert.equal(e.hidden,owned||expected.hidden);assert.ok(!e.style.zIndex,'school-only stacking');if(!e.hidden){near(parseFloat(e.style.left),expected.x,'car X');near(parseFloat(e.style.top),expected.y,'car Y');visibleCars++;}
    }
  }
  assert.ok(visibleCars>0&&visibleSkins>0);return {poses:16,visibleCars,visibleSkins};
}));



const oldSource=fs.readFileSync(new URL('baseline-progression-hud.js.txt',qa),'utf8').replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${new URL('dist/'+p.slice(2),root).href}'`);
const oldHud=await import('data:text/javascript;base64,'+Buffer.from(oldSource).toString('base64'));
check('Regression witness: Site32 artificially spread coincident side-on anchors; current code preserves them with depth ordering',()=>held(app=>{
  const current=frameAt(app,390,844,90),expected=anchors.map(a=>oracle(app.debug.camera,a,390,844)),map=new Map();
  const oldElement=id=>{if(!map.has(id)){const props=new Map();map.set(id,{id,hidden:false,dataset:{},style:{setProperty:(k,v)=>props.set(k,v),getPropertyValue:k=>props.get(k)||''}});}return map.get(id);};
  oldHud.updateProgressionWorldLabels({getElementById:oldElement},{gameplay:app.debug.gameplay,garage:app.debug.garage,playing:true,viewportWidth:390,project:(e,x,y,z,visible,max)=>{const want=oracle(app.debug.camera,new THREE.Vector3(x,y,z),390,844,max);e.hidden=!visible||want.hidden;if(e.hidden)return;e.style.left=want.x+'px';e.style.top=want.y+'px';return want.ndc.z;}});
  const old=CLASSROOM_ENTRIES.map((_,i)=>({school:i+1,x:parseFloat(oldElement(`school-label-${i+1}`).style.left),y:parseFloat(oldElement(`school-label-${i+1}`).style.top)}));
  const drift=Math.max(...old.map((r,i)=>Math.abs(r.x-expected[i].x))),spread=Math.max(...old.map(r=>r.x))-Math.min(...old.map(r=>r.x));
  assert.ok(drift>100,'published baseline must fail exact anchoring');assert.ok(spread>250,'published baseline must visibly fan out');assert.ok(current.every(r=>Math.abs(r.x-195)<1e-7));
  specimens.push({name:'published32-east-side',width:390,height:844,scale:schoolLabelScale(390),rows:old});
  return {baselineMaximumAnchorDriftPx:drift,baselineHorizontalSpreadPx:spread,currentMaximumAnchorDriftPx:Math.max(...current.map((r,i)=>Math.abs(r.x-expected[i].x)))};
}));

const report={generated:new Date().toISOString(),baseline:contract.baseline,scope:'Real production app frames and Three.js with a mock DOM/renderer. No browser launch, CSS-layout raster test, WebGL, Android, physical touch or world-geometry occlusion claim.',runtimeSha256:Object.fromEntries(['dist/app.js','dist/progression-hud.js','dist/progression-ui.css'].map(p=>[p,hash(read(p))])),assertionCount,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results};
fs.writeFileSync(new URL('independent-results.json',qa),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(new URL('projection-specimens.json',qa),JSON.stringify(specimens,null,2)+'\n');
console.log(`${report.passed}/${results.length} independent review groups passed. Renderer-free only.`);
if(report.failed)process.exitCode=1;
