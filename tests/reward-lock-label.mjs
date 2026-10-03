import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {earnedRewardCareer} from './fixtures/reward-career.mjs';
for(const options of [{},{search:'?dev=1'},{career:earnedRewardCareer()}]){
 const f=createAppDom({startDriving:false,...options});try{const label=f.ids.get('vehicle-price-11'),value=f.ids.get('vehicle-price-value-11');assert.equal(value.textContent,'Заблокировано');if(options.search||options.career)assert(label.hidden);else assert(!f.debug.gameplay.isOwned('bmwreward'));assert(!f.debug.gameplay.state.purchaseCandidateId);f.frame();if(options.search||options.career)assert(label.hidden);f.ids.get('regenerate').dispatch('click');assert.equal(value.textContent,'Заблокировано');if(options.search||options.career)assert(label.hidden);}finally{f.dispose()}
}
console.log('PASS locked reward exact label; legitimate saved unlock and dev availability hide it through frame and rebuild.');
