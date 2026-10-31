import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {freshCareer} from '../dist/career-save.js';
import {CAREER_MISSIONS} from '../dist/career-missions.js';
import {translateGameText} from '../dist/localization.js';

test('диалог показывает все задания, готовые сверху, полученные в конце и убирает точку после получения',()=>{
 const app=createAppDom({startDriving:false,career:{...freshCareer(),completedRuns:3}});
 try{
  app.frame();const icon=app.ids.get('career-mission-button');
  assert.equal(icon.classList.contains('has-claimable-missions'),true);
  icon.dispatch('click');
  const list=app.ids.get('career-mission-list');assert.equal(list.children.length,35);
  assert.equal(list.children[0].dataset.missionId,'first-delivery');
  app.ids.get('mission-first-delivery-claim').dispatch('click');
  assert.equal(list.children.at(-1).dataset.missionId,'first-delivery');
  assert.equal(app.debug.gameplay.state.money,100);
  app.ids.get('mission-first-delivery-claim').dispatch('click');assert.equal(app.debug.gameplay.state.money,100);
  app.ids.get('career-close').dispatch('click');assert.equal(icon.classList.contains('has-claimable-missions'),true);
  icon.dispatch('click');app.ids.get('mission-deliveries-3-claim').dispatch('click');
  assert.deepEqual(list.children.slice(-2).map(node=>node.dataset.missionId),['first-delivery','deliveries-3']);
  assert.equal(icon.classList.contains('has-claimable-missions'),false);
  assert.equal(app.ids.has('career-mission-skip'),false);
 }finally{app.dispose();}
});

test('названия и условия всех заданий переводятся без названий моделей',()=>{
 for(const mission of CAREER_MISSIONS){
  for(const source of [mission.name,mission.description]){
   const translated=translateGameText(source,'en');
   assert.notEqual(translated,source,source);assert.doesNotMatch(translated,/[А-Яа-яЁё]/u);
   assert.doesNotMatch(translated,/BMW|Cadillac|Koenigsegg|Phoenix|Interceptor|E30/i);
  }
 }
 for(const source of ['Получить','Получено','В процессе','Готово к получению','Доступные награды'])assert.notEqual(translateGameText(source,'en'),source);
});
