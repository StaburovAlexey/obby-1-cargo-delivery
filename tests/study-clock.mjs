import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||'.');
const strict=true;
const {createAppDom}=await import(pathToFileURL(path.join(root,'tests/fixtures/app-dom.mjs')));
const {freshCareer}=await import(pathToFileURL(path.join(root,'dist/career-save.js')));
const {CLASSROOM_ENTRIES}=await import(pathToFileURL(path.join(root,'dist/garage-scene.js')));
const {ECONOMY_CONFIG}=await import(pathToFileURL(path.join(root,'dist/economy-config.js')));
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const rows=[];
function create(){
 const app=createAppDom({startDriving:false,career:{...freshCareer(),money:45000,ownedSchoolIds:['school-1','school-2','school-3','school-4']}}),g=app.debug.gameplay,e=CLASSROOM_ENTRIES[4];
 g.state.player={x:e.x,z:e.z+.2,heading:0};g.state.interactionCooldown=0;g.state.walked=1;g.walk(1/60,{x:0,z:-1});
 assert.equal(g.state.schoolPurchaseCandidateId,'school-5');assert.equal(g.state.seatedId,null);assert.equal(g.state.money,45000);
 app.frame(2000);app.ids.get('buy-school').dispatch('click');assert.equal(g.state.money,0);assert.equal(g.state.seatedId,null);
 app.ids.get('buy-school').dispatch('click');assert.ok(g.state.seatedId);assert.equal(g.state.seatedSchoolId,'school-5');
 return {app,g,time:2000};
}
for(const fps of [15,30,60,120,144,240]){
 const s=create();let ten;
 for(let i=1;i<=60*fps;i++){s.app.frame(s.time=2000+i*1000/fps);if(i===10*fps)ten=s.g.state.brains;}
 const sixty=s.g.state.brains,hud=s.app.ids.get('brain-value').textContent,status=s.app.ids.get('study-status').textContent;
 s.g.flushProgress();const saved=JSON.parse(s.app.storage.getItem(ECONOMY_CONFIG.saveKey));near(saved.brains,sixty,1e-6);
 assert.match(status,/Класс 5.*\+12 XP\/сек/);if(strict){near(ten,120);near(sixty,720);assert.equal(hud,'720');}
 const row={fps,seconds10:ten,seconds60:sixty,rate:sixty/60,hud,saved:saved.brains,desk:s.g.state.seatedId,status};rows.push(row);console.log(JSON.stringify(row));s.app.dispose();
}
{
 const s=create(),deltas=[.016,.075,.009,.085,.04,.1,.024,.051];let elapsed=0,expectedPhysics=0,index=0;
 while(elapsed<10-1e-9){const chosen=Math.min(deltas[index++%deltas.length],10-elapsed);elapsed+=chosen;expectedPhysics+=Math.min(.05,chosen);s.app.frame(s.time+=chosen*1000);}
 const earned=s.g.state.brains;if(strict)near(earned,120);const row={case:'jitter-valid-through-100ms',elapsed,earned,expected:120,physicsClampedExpected:expectedPhysics*12};rows.push(row);console.log(JSON.stringify(row));s.app.dispose();
}
{
 const s=create();s.app.frame(s.time+=1000/60);const before=s.g.state.brains;for(const delta of [101,250,1000,3600000])s.app.frame(s.time+=delta);near(s.g.state.brains,before);
 s.app.doc.hidden=true;s.app.doc.dispatch('visibilitychange');for(let i=0;i<120;i++)s.app.frame(s.time+=1000/60);near(s.g.state.brains,before);
 s.app.doc.hidden=false;s.app.doc.dispatch('visibilitychange');s.app.frame(s.time+=1000/60);near(s.g.state.brains,before);for(let i=0;i<60;i++)s.app.frame(s.time+=1000/60);near(s.g.state.brains-before,12);
 s.app.win.dispatch('blur');for(let i=0;i<60;i++)s.app.frame(s.time+=1000/60);const paused=s.g.state.brains;near(paused-before,12);s.app.win.dispatch('focus');s.app.frame(s.time+=1000/60);near(s.g.state.brains,paused);
 s.app.ids.get('stand-up').dispatch('click');assert.equal(s.g.state.seatedSchoolId,null);for(let i=0;i<60;i++)s.app.frame(s.time+=1000/60);near(s.g.state.brains,paused);
 s.app.win.dispatch('pagehide');const re=createAppDom({startDriving:false,storage:s.app.storage});near(re.debug.gameplay.state.brains,paused,1e-6);assert.equal(re.debug.gameplay.state.seatedSchoolId,null);assert.equal(re.debug.gameplay.state.seatedId,null);re.frame(2000);for(let i=0;i<60;i++)re.frame(2000+(i+1)*1000/60);near(re.debug.gameplay.state.brains,paused,1e-6);
 const row={case:'long-stall-hidden-blur-stand-reload',result:'PASS',saved:paused};rows.push(row);console.log(JSON.stringify(row));re.dispose();s.app.dispose();
}
const out=process.argv[3]&&!process.argv[3].startsWith('--')?path.resolve(process.argv[3]):path.join(root,'qa/shared-classroom/clock-final.json');fs.writeFileSync(out,JSON.stringify({strict,rows},null,2));
