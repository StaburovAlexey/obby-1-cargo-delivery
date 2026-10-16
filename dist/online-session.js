import {createOnlineClient} from './online-client.js';
import {createRemotePlayers} from './remote-players.js';

export function createOnlineSession({THREE,scene,document:doc,serverUrl,pause,getContext,onSeatChange=()=>{}}={}){
  const remotes=createRemotePlayers(THREE,{scene,document:doc});
  let binding=0,connected=false,claiming=false;
  const client=createOnlineClient({url:serverUrl,getState(){
    const c=getContext(),g=c.gameplay;if(!g)return null;
    const driving=g.state.mode==='driving',root=driving?c.rig?.root:c.character?.group;
    if(!root)return null;
    const p=root.position,q=root.quaternion,m=c.model?.state||{},pose=c.rig?.pose||{};
    return {mode:driving?'driving':g.state.seatedId&&client.seatId?'studying':'walking',characterId:g.state.characterId,
      vehicleId:driving?g.state.selectedId:null,position:[p.x,p.y,p.z],quaternion:[q.x,q.y,q.z,q.w],
      heading:driving?m.heading:g.state.player.heading,speed:driving?Math.hypot(m.velocityX||0,m.velocityZ||0):c.walkSpeed||0,
      steer:m.frontWheelAngle||0,wheelSpin:m.wheelSpin||0,bodyPitch:pose.bodyPitch||0,bodyRoll:pose.bodyRoll||0,bodyBob:pose.bodyBob||0,
      braking:!!(driving&&m.braking),airborne:!driving&&g.state.jump.airborne,jumpElapsed:g.state.jump.elapsed,
      paused:!!c.paused,teleportId:c.teleportId,seatId:client.seatId};
  },onSnapshot(snapshot){
    remotes.receive(snapshot.players);
    const g=getContext().gameplay;if(g)g.setOccupiedSeatIds(Object.entries(snapshot.seats).filter(([,owner])=>owner!==client.id).map(([seat])=>seat));
  },onStatus(status){
    const element=doc?.getElementById('online-status');
    if(element)element.textContent=status.connected?`Онлайн: ${status.count}/20`:serverUrl?'Подключение к комнате…':'Одиночный режим';
    if(status.connected&&!connected){
      connected=true;const g=getContext().gameplay;
      if(g?.state.seatedId){const epoch=binding;pause.set('seat-sync',true);client.claimSeat().then(seat=>{
        if(epoch!==binding)return;
        if(seat&&client.connected)g.reassignSeat(seat);else g.stand();
        onSeatChange();
      }).finally(()=>pause.set('seat-sync',false));}
    }else if(!status.connected){connected=false;pause.set('seat-sync',false);}
  }});
  return {
    start:()=>client.start(),
    bindGameplay(g){
      binding++;claiming=false;client.releaseSeat();
      const sit=g.sitAtSchool.bind(g),stand=g.stand.bind(g),garage=g.returnToGarage.bind(g);
      g.sitAtSchool=id=>{
        if(!client.connected)return sit(id);
        if(claiming)return false;
        claiming=true;const epoch=binding,connectionId=client.id;
        client.claimSeat().then(seat=>{
          if(epoch!==binding||client.id!==connectionId)return;
          if(!seat||getContext().paused||!sit(id,seat))client.releaseSeat();
          else onSeatChange();
        }).finally(()=>{if(epoch===binding)claiming=false;});return false;
      };
      g.stand=()=>{const result=stand();if(result)client.releaseSeat();return result;};
      g.returnToGarage=(...args)=>{client.releaseSeat();return garage(...args);};
    },
    update(dt){client.update(dt);},
    render(dt,options){remotes.update(dt,options);},
    dispose(){binding++;client.dispose();remotes.dispose();pause.set('seat-sync',false);},
    get client(){return client;},get remotes(){return remotes;},
  };
}
