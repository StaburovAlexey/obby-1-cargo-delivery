export function createRecordingCanvasContext(){
 return {texts:[],dots:[],paths:[],currentPath:[],clearRect(){},fillRect(){},strokeRect(){},beginPath(){this.currentPath=[];},moveTo(x,y){this.currentPath.push({x,y});},lineTo(x,y){this.currentPath.push({x,y});},stroke(){this.paths.push({color:this.strokeStyle,points:[...this.currentPath]});},save(){},restore(){},rect(){},clip(){},setLineDash(){},drawImage(){},
  measureText:text=>({width:String(text).length*16}),fillText(text,x,y){this.texts.push({text:String(text),x,y,color:this.fillStyle});},
  arc(x,y,radius){this.currentDot={x,y,radius};},fill(){if(this.currentDot){this.dots.push({...this.currentDot,color:this.fillStyle});this.currentDot=null;}}};
}
