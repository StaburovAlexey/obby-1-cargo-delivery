/** Transport only: remote players never become local gameplay entities. */
export function createOnlineClient({url,WebSocketClass=globalThis.WebSocket,getState=()=>null,
  onSnapshot=()=>{},onStatus=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let socket=null,stopped=false,connected=false,id=null,roomId=null,seatId=null;
  let players=[],seats={},retry=null,handshake=null,attempt=0,elapsed=0,seq=0,requestSeq=0;
  const pending=new Map();
  const status=value=>onStatus({state:value,connected,id,roomId,count:connected?players.length+1:0});
  function publish(message){
    players=(Array.isArray(message.players)?message.players:[]).filter(p=>p.id!==id).slice(0,19);
    seats=message.seats&&typeof message.seats==='object'?message.seats:{};
    if(seatId&&seats[seatId]!==id)seatId=null;
    onSnapshot({...message,players,seats});status('connected');
  }
  function send(message){
    if(socket?.readyState!==1||socket.bufferedAmount>65536)return false;
    try{socket.send(JSON.stringify(message));return true;}catch{return false;}
  }
  function disconnect(){
    connected=false;id=null;roomId=null;seatId=null;players=[];seats={};elapsed=0;
    clearTimer(handshake);handshake=null;
    for(const resolve of pending.values())resolve(null);pending.clear();
    onSnapshot({players:[],seats:{},time:0});
  }
  function schedule(){
    if(stopped||!url||retry!==null)return;
    status('reconnecting');
    retry=setTimer(()=>{retry=null;connect();},Math.min(15000,1000*2**Math.min(attempt++,4)));
  }
  function connect(){
    if(stopped||!url||!WebSocketClass){status('offline');return;}
    status('connecting');
    let current;
    try{current=new WebSocketClass(url);}catch{schedule();return;}
    socket=current;
    current.onopen=()=>{
      if(stopped||socket!==current)return;
      send({type:'join',version:1});
      handshake=setTimer(()=>{if(!connected&&socket===current)current.close();},10000);
    };
    current.onmessage=event=>{
      if(stopped||socket!==current)return;
      let message;try{message=JSON.parse(event.data);}catch{return;}
      if(message.type==='welcome'){
        clearTimer(handshake);handshake=null;connected=true;attempt=0;seq=0;
        id=message.id;roomId=message.roomId;publish(message);
      }else if(message.type==='snapshot'&&connected)publish(message);
      else if(message.type==='seat:result'){
        const resolve=pending.get(message.requestId);if(!resolve)return;
        pending.delete(message.requestId);seatId=message.ok?message.seatId:null;resolve(seatId);
      }
    };
    current.onclose=()=>{if(socket!==current)return;socket=null;disconnect();if(!stopped)schedule();};
    current.onerror=()=>{if(socket===current&&current.readyState!==3)current.close();};
  }
  return {
    start(){if(!socket&&!stopped)connect();},
    update(dt){
      if(!connected)return;
      elapsed+=Math.max(0,Number(dt)||0);if(elapsed+1e-9<.1)return;elapsed=Math.max(0,elapsed-.1*Math.floor((elapsed+1e-9)/.1));
      const state=getState();if(state)send({type:'state',state:{...state,seq:++seq}});
    },
    claimSeat(){
      if(!connected)return Promise.resolve(null);
      if(seatId)return Promise.resolve(seatId);
      // One outstanding claim per client; callers share its completion.
      if(pending.size)return new Promise(resolve=>{
        const [key,original]=pending.entries().next().value;pending.set(key,value=>{original(value);resolve(value);});
      });
      const requestId=String(++requestSeq);
      return new Promise(resolve=>{
        pending.set(requestId,resolve);
        if(!send({type:'seat:claim',requestId})){pending.delete(requestId);resolve(null);}
      });
    },
    releaseSeat(){
      seatId=null;for(const resolve of pending.values())resolve(null);pending.clear();
      if(connected&&!send({type:'seat:release'}))socket?.close();
    },
    dispose(){stopped=true;clearTimer(retry);retry=null;clearTimer(handshake);socket?.close();socket=null;disconnect();status('offline');},
    get connected(){return connected;},get id(){return id;},get roomId(){return roomId;},
    get seatId(){return seatId;},get players(){return players;},get seats(){return seats;},
  };
}
