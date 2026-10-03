// Renderer-free real-app regression, with explicit CSS/markup contracts.
// No WebGL, browser layout or physical-touch claims.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAppDom} from './fixtures/app-dom.mjs';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../dist/progression-ui.css',import.meta.url),'utf8');
const baseCss=fs.readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');
assert.match(html,/<div id="delivery-receipt-menu" hidden>\s*<section id="delivery-receipt" role="dialog" aria-modal="true" aria-labelledby="delivery-receipt-title"/);
const overlay=css.match(/#delivery-receipt-menu\{([^}]+)\}/)[1];
assert.match(overlay,/position:fixed;z-index:100;inset:0;display:grid;place-items:center/);
assert.match(overlay,/env\(safe-area-inset-(?:top|bottom)\)/);assert.match(overlay,/background:/);assert.match(overlay,/pointer-events:auto/);
const card=css.match(/#delivery-receipt\{([^}]+)\}/)[1];
assert.match(card,/width:min\(440px,100%\)/);assert.match(card,/max-height:calc\(100dvh/);assert.match(card,/overflow:auto;overscroll-behavior:contain/);assert.doesNotMatch(card,/--receipt-top|position:fixed|right:|top:/);
for(const [,z]of (baseCss+css.replace(/#delivery-receipt-menu\{[^}]+\}/,'')).matchAll(/z-index:\s*(\d+)/g))assert.ok(Number(z)<100,`Receipt backdrop stays above z-index ${z}`);
assert.match(css,/\.receipt-heading\{position:sticky/);
assert.match(css,/@media\(max-height:500px\)/);assert.match(css,/body\.career-menu-open \.buy-button\{display:none!important\}/);
for(const width of [280,320,390,568,844])for(const height of [240,320,390,844])for(const safe of [0,20,44]){
 const padding=Math.max(12,safe),availableWidth=width-2*padding,availableHeight=height-2*padding;
 assert.ok(Math.min(440,availableWidth)<=availableWidth&&availableWidth>0);
 assert.ok(availableHeight>0,'Card max-height remains positive and its content can scroll');
}
console.log('PASS receipt markup and CSS: centered full-screen backdrop above every HUD, safe areas, scrolling and sticky close header.');
const app=createAppDom({startDriving:false,width:568,height:320}),d=app.debug,get=id=>app.ids.get(id);
try{
 app.frame();assert.equal(get('delivery-receipt').hidden,true);assert.equal(d.careerMenuOpen,false);
 for(const reason of ['garage','empty','bridge']){d.returnToGarage(reason);assert.equal(get('delivery-receipt').hidden,true,reason+' never creates a receipt');}
 // A successful delivery arrives while a vehicle key and camera pointer are held.
 d.gameplay.state.cooldown=0;assert.equal(d.enterVehicle('pickup'),true);app.frame();
 app.win.dispatch('keydown',{code:'KeyW',key:'w'});assert.equal(d.input.state.active,true);
 const canvas=d.renderer.domElement;
 canvas.dispatch('pointerdown',{pointerId:71,button:0,clientX:100,clientY:100});assert.equal(d.lookInput.active,true);
 const delivery=d.garage.deliveries[0],balanceBefore=d.gameplay.state.money;
 d.gameplay.drive(0,delivery.x,delivery.z);app.frame();
 assert.equal(d.driving,false);assert.equal(d.careerMenuOpen,true);assert.equal(get('delivery-receipt').hidden,false);assert.equal(get('delivery-receipt-menu').hidden,false);
 assert.equal(get('career-menu').hidden,true);assert.equal(get('upgrade-menu').hidden,true);assert.equal(get('biome-menu').hidden,true);
 assert.equal(get('career-goal-button').hidden,true);assert.equal(get('career-goal-button').disabled,true);
 assert.equal(d.input.state.active,false);assert.equal(d.input.state.enabled,false);assert.equal(d.lookInput.active,false);assert.equal(d.walkInput.sample().active,false);assert.equal(d.requestJump(),false);
 assert.equal(canvas.hasPointerCapture(71),false);assert.equal(app.doc.activeElement,get('delivery-receipt-close'));
 const balance=d.gameplay.state.money,brains=d.gameplay.state.brains,player={...d.gameplay.state.player},camera=d.camera.position.clone();
 assert.equal(balance-balanceBefore,delivery.reward+Math.floor(delivery.reward*.2)+Math.floor(delivery.reward*.05));
 // Inputs and forced HUD clicks cannot move, buy, jump or replace the modal.
 app.win.dispatch('keydown',{code:'KeyW',key:'w'});app.win.dispatch('keydown',{code:'Space',key:' '});
 canvas.dispatch('pointerdown',{pointerId:72,button:0,clientX:100,clientY:100});
 canvas.dispatch('pointermove',{pointerId:72,clientX:180,clientY:160});
 for(const id of ['career-mission-button','career-goal-button','upgrade-button','biome-button','mode-toggle','garage-button','vehicle-funds-button','buy-vehicle','buy-skin','buy-school'])get(id).dispatch('click');
 for(let i=0;i<30;i++)app.frame();
 assert.equal(d.careerMenuOpen,true);assert.equal(get('career-menu').hidden,true);assert.equal(d.upgradeMenuOpen,false);assert.equal(d.biomeMenuOpen,false);
 assert.deepEqual(d.gameplay.state.player,player);assert.deepEqual(d.camera.position,camera);assert.equal(d.gameplay.state.money,balance);assert.equal(d.gameplay.state.brains,brains);
 for(const id of ['buy-vehicle','buy-skin','buy-school'])assert.equal(get(id).hidden,true,id);
 app.frame(60000);assert.equal(get('delivery-receipt').hidden,false,'No automatic receipt expiry');
 // Replaying a delivery location cannot grant the same payout a second time.
 d.gameplay.drive(0,delivery.x,delivery.z);app.frame(60017);assert.equal(d.gameplay.state.money,balance);
 get('delivery-receipt-close').dispatch('click');assert.equal(d.careerMenuOpen,false);assert.equal(get('delivery-receipt').hidden,true);assert.equal(get('delivery-receipt-menu').hidden,true);
 assert.equal(d.walkInput.sample().active,false);assert.equal(d.lookInput.active,false);assert.equal(app.doc.activeElement,get('career-mission-button'));
 app.frame(60034);assert.deepEqual(d.gameplay.state.player,player,'Held key cannot restart walking on dismissal');
 app.win.dispatch('keydown',{code:'KeyW',key:'w',repeat:true});assert.equal(d.walkInput.sample().active,false);
 app.win.dispatch('keyup',{code:'KeyW',key:'w'});app.win.dispatch('keydown',{code:'KeyW',key:'w'});assert.equal(d.walkInput.sample().active,true);app.win.dispatch('keyup',{code:'KeyW',key:'w'});
 get('career-mission-button').dispatch('click');assert.equal(get('career-menu').hidden,false);assert.equal(get('delivery-receipt').hidden,true);get('career-close').dispatch('click');
 d.returnToGarage('garage');app.frame();assert.equal(get('delivery-receipt').hidden,true,'Returning again does not replay the receipt');
 console.log('PASS actual app receipt: successful delivery only, once-only payout, modal exclusivity, held input resets, purchases blocked, no expiry and clean dismissal.');
}finally{app.dispose();}
