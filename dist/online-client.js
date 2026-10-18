import {PROTOCOL_VERSION,ROOM_CAPACITY,SEAT_IDS,STATE_HEARTBEAT_MS,createInitialPlayerState,sanitizePlayerState,
  encodeValidatedStatePacket,decodeDeltaPacket,sameMovement,isImmediateStateChange,nextPacketSequence} from './online-protocol.js';

export function createOnlineClient({url,WebSocketClass=globalThis.WebSocket,getState=()=>null,
  onSnapshot=()=>{},onStatus=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let socket=null,stopped=false,connected=false,id=null,roomId=null,seatId=null;
  let players=[],seats={},roomSnapshot=null,retry=null,handshake=null,resyncTimer=null,attempt=0,clock=0,seq=0,requestSeq=0;
  let wireSequence=0,awaitingResync=false,lastPacket=null,lastState=null,lastSend=-Infinity,stationary=true,suppressSeat=false;
  const roster=new Map(),pending=new Map();
  const status=value=>onStatus({state:value,connected,id,roomId,count:connected?roster.size:0});
  const validId=value=>typeof value==='string'&&value.length>0&&value.length<=160;
  function validatePlayer(player){
    if(!player||!validId(player.id)||!Number.isInteger(player.slot)||player.slot<0||player.slot>=ROOM_CAPACITY||!Number.isSafeInteger(player.number)||player.number<1||![100,500].includes(player.cadenceMs))return null;
    const state=sanitizePlayerState(player.state,{seatId:player.state?.seatId});
    return state?{id:player.id,slot:player.slot,number:player.number,cadenceMs:player.cadenceMs,state}:null;
  }
  function validateSeats(value,members){
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>SEAT_IDS.length)return null;
    const ids=new Set([...members.values()].map(player=>player.id)),owners=new Set();
    for(const [seat,owner]of Object.entries(value)){if(!SEAT_IDS.includes(seat)||!ids.has(owner)||owners.has(owner))return null;owners.add(owner);}
    for(const player of members.values())if(player.state.seatId&&value[player.state.seatId]!==player.id)return null;
    return {...value};
  }
  function publish(time){
    const all=[...roster.values()].sort((a,b)=>a.number-b.number);
    players=all.filter(player=>player.id!==id);
    seatId=suppressSeat?null:all.find(player=>player.id===id)?.state.seatId??null;
    roomSnapshot={roomId,selfId:id,time,players:all,seats};
    onSnapshot({type:'snapshot',roomId,players,seats,time});status('connected');
  }
  function send(message){
    if(socket?.readyState!==1||socket.bufferedAmount>65536)return false;
    try{socket.send(message instanceof Uint8Array?message:JSON.stringify(message));return true;}catch{return false;}
  }
  function requestResync(){
    if(!connected||awaitingResync)return;
    awaitingResync=true;
    if(!send({type:'resync'})){socket?.close();return;}
    resyncTimer=setTimer(()=>{if(awaitingResync)socket?.close();},5000);
  }
  function applyFull(message,welcome=false){
    if(message.version!==PROTOCOL_VERSION||!Number.isInteger(message.sequence)||message.sequence<0||message.sequence>0xffffffff||!Number.isFinite(message.time)||!Array.isArray(message.players)||message.players.length>ROOM_CAPACITY||!validId(message.id)||!validId(message.roomId))return false;
    if(!welcome&&(message.id!==id||message.roomId!==roomId))return false;
    const next=new Map(),ids=new Set();
    for(const raw of message.players){const player=validatePlayer(raw);if(!player||next.has(player.slot)||ids.has(player.id))return false;next.set(player.slot,player);ids.add(player.id);}
    if(!ids.has(message.id))return false;
    const nextSeats=validateSeats(message.seats,next);if(!nextSeats)return false;
    id=message.id;roomId=message.roomId;roster.clear();for(const [slot,player]of next)roster.set(slot,player);seats=nextSeats;
    wireSequence=message.sequence;awaitingResync=false;clearTimer(resyncTimer);resyncTimer=null;
    if(welcome){clearTimer(handshake);handshake=null;connected=true;attempt=0;seq=0;lastPacket=null;lastState=null;lastSend=-Infinity;stationary=true;}
    publish(message.time);return true;
  }
  function applyUpdate(message){
    if(awaitingResync)return;
    if(message.sequence!==nextPacketSequence(wireSequence)){requestResync();return;}
    const next=new Map(roster);
    if(message.type==='delta'){
      for(const update of message.players){
        const previous=next.get(update.slot);if(!previous){requestResync();return;}
        // The binary decoder already validates and normalizes all dynamic fields.
        // Static fields come only from previously validated control/full snapshots.
        const state={...previous.state,...update.state};
        if(state.seq<previous.state.seq||state.mode==='driving'&&!state.vehicleId||state.mode==='studying'&&!state.seatId){requestResync();return;}
        next.set(update.slot,{...previous,cadenceMs:update.cadenceMs,state});
      }
    }else{
      if(!['roster','seats'].includes(message.type)||!Number.isFinite(message.time)){requestResync();return;}
      if(message.left!==undefined&&!Array.isArray(message.left)||message.players!==undefined&&!Array.isArray(message.players)){requestResync();return;}
      for(const player of message.left||[]){
        if(next.get(player.slot)?.id!==player.id||player.id===id){requestResync();return;}next.delete(player.slot);
      }
      for(const raw of message.players||[]){
        const player=validatePlayer(raw),old=player&&next.get(player.slot);
        if(!player||(old&&old.id!==player.id)||[...next.values()].some(p=>p.id===player.id&&p.slot!==player.slot)){requestResync();return;}
        next.set(player.slot,player);
      }
      if(next.size>ROOM_CAPACITY){requestResync();return;}
    }
    const nextSeats=message.type==='delta'?seats:validateSeats(message.seats??seats,next);if(!nextSeats){requestResync();return;}
    wireSequence=message.sequence;roster.clear();for(const [slot,player]of next)roster.set(slot,player);seats=nextSeats;publish(message.time);
  }
  function settlePending(value=null){for(const entry of [...pending.values()])entry.finish(value);}
  function disconnect(){
    connected=false;id=null;roomId=null;seatId=null;players=[];seats={};roomSnapshot=null;clock=0;roster.clear();
    lastPacket=null;lastState=null;lastSend=-Infinity;stationary=true;awaitingResync=false;suppressSeat=false;
    clearTimer(handshake);handshake=null;clearTimer(resyncTimer);resyncTimer=null;settlePending();
    onSnapshot({players:[],seats:{},time:0});
  }
  function schedule(){
    if(stopped||!url||retry!==null)return;status('reconnecting');
    retry=setTimer(()=>{retry=null;connect();},Math.min(15000,1000*2**Math.min(attempt++,4)));
  }
  function connect(){
    if(stopped||!url||!WebSocketClass){status('offline');return;}status('connecting');
    let current;try{current=new WebSocketClass(url);}catch{schedule();return;}socket=current;current.binaryType='arraybuffer';
    current.onopen=()=>{
      if(stopped||socket!==current)return;
      if(!send({type:'join',version:PROTOCOL_VERSION})){current.close();return;}
      handshake=setTimer(()=>{if(!connected&&socket===current)current.close();},10000);
    };
    current.onmessage=event=>{
      if(stopped||socket!==current)return;
      let message;
      if(typeof event.data==='string'){
        try{message=JSON.parse(event.data);}catch{requestResync();return;}
        if(!message||typeof message!=='object'||Array.isArray(message)||message.type==='delta'){requestResync();return;}
      }else{message=decodeDeltaPacket(event.data);if(!message){requestResync();return;}}
      if(message.type==='welcome'){
        if(connected||!applyFull(message,true)){current.close(1008,'Invalid welcome');return;}
      }else if(message.type==='snapshot'&&connected){if(!applyFull(message))current.close(1008,'Invalid resync');}
      else if(['delta','roster','seats'].includes(message.type)&&connected)applyUpdate(message);
      else if(message.type==='seat:result'&&connected){
        const entry=pending.get(message.requestId);if(!entry)return;
        const claimed=message.ok===true&&SEAT_IDS.includes(message.seatId)?message.seatId:null;
        seatId=claimed;entry.finish(claimed);
      }
    };
    current.onclose=()=>{if(socket!==current)return;socket=null;disconnect();if(!stopped)schedule();};
    current.onerror=()=>{if(socket===current&&current.readyState!==3)current.close();};
  }
  return {
    start(){if(!socket&&!stopped&&retry===null)connect();},
    update(dt){
      if(!connected)return;clock+=Math.max(0,Number(dt)||0)*1000;
      if(seq===0xffffffff){socket?.close(1000,'Sequence renewed');return;}
      const raw=getState();if(!raw)return;
      // Inspect discrete transitions every render frame, but quantize normal moving
      // samples only when their10Hz send window is due. Idle resumes bypass this gate.
      if(lastState&&!stationary&&!isImmediateStateChange(lastState,raw)&&clock-lastSend<100-1e-6)return;
      const state=sanitizePlayerState({...raw,seq:seq+1},{seatId});if(!state)return;
      const packet=encodeValidatedStatePacket(state),changed=!sameMovement(packet,lastPacket);
      const profile=!lastState?state.characterId!==createInitialPlayerState().characterId||state.vehicleId!==null:state.characterId!==lastState.characterId||state.vehicleId!==lastState.vehicleId;
      const immediate=profile||isImmediateStateChange(lastState,state)||(stationary&&changed);
      const age=clock-lastSend;
      if(!changed&&!profile){if(age>=150)stationary=true;if(age<STATE_HEARTBEAT_MS-1e-6)return;}
      else if(!immediate&&age<100-1e-6)return;
      if(send(profile?{type:'profile',state}:packet)){seq++;lastPacket=packet;lastState=state;lastSend=clock;if(changed)stationary=false;}
    },
    claimSeat(){
      if(!connected)return Promise.resolve(null);if(seatId)return Promise.resolve(seatId);
      if(pending.size)return pending.values().next().value.promise;
      suppressSeat=false;const requestId=String(++requestSeq);let resolve;
      const promise=new Promise(done=>{resolve=done;});
      const entry={promise,timer:null,finish(value){if(!pending.delete(requestId))return;clearTimer(entry.timer);resolve(value);}};
      pending.set(requestId,entry);
      // A lost claim response may still reserve a desk: close rather than strand it.
      entry.timer=setTimer(()=>{entry.finish(null);socket?.close();},8000);
      if(!send({type:'seat:claim',requestId}))entry.finish(null);return promise;
    },
    releaseSeat(){
      suppressSeat=true;seatId=null;settlePending();
      if(connected&&!send({type:'seat:release'}))socket?.close();
    },
    dispose(){stopped=true;clearTimer(retry);retry=null;clearTimer(handshake);socket?.close();socket=null;disconnect();status('offline');},
    get connected(){return connected;},get id(){return id;},get roomId(){return roomId;},
    get seatId(){return seatId;},get players(){return players;},get seats(){return seats;},get roomSnapshot(){return roomSnapshot;},
  };
}
