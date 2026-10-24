/** Keep source window colors/textures, but make every car window opaque. */
export function makeVehicleWindowsOpaque(materials,{extraNames=[]}={}){
 const extra=new Set(extraNames);let count=0;
 for(const material of materials){
  if(!/glass|window/i.test(material.name)&&!extra.has(material.name)&&!(material.transmission>0))continue;
  material.transparent=false;material.opacity=1;material.alphaTest=0;material.alphaHash=false;material.depthWrite=true;
  if('transmission'in material)material.transmission=0;
  material.needsUpdate=true;count++;
 }
 return count;
}
