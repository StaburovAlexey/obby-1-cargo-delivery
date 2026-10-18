export function createRecordingCanvasContext(){
 return {texts:[],dots:[],clearRect(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},save(){},restore(){},rect(){},clip(){},setLineDash(){},drawImage(){},
  measureText:text=>({width:String(text).length*16}),fillText(text,x,y){this.texts.push({text:String(text),x,y,color:this.fillStyle});},
  arc(x,y,radius){this.currentDot={x,y,radius};},fill(){if(this.currentDot){this.dots.push({...this.currentDot,color:this.fillStyle});this.currentDot=null;}}};
}
