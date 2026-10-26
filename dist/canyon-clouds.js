import {CANYON_TRACK,canyonPointAt,projectCanyon} from './canyon-track.js';

const CLOUD_DEPTH=5,VEIL_LIFT=1.35,HORIZON_MARGIN=240,PROFILE_STEP=16,CORE_HALF_WIDTH=40;
const CANYON_FOG=Object.freeze({color:0xcbdfe9,near:45,far:180});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

// Bake tileable density and soft directional shading once, not per fragment.
function createCloudTexture(THREE){
 const size=128,density=new Float32Array(size*size),pixels=new Uint8Array(size*size*2);
 let seed=0x63ca10;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(const [frequency,weight]of [[8,.55],[16,.27],[32,.13],[64,.05]]){
  const lattice=Float32Array.from({length:frequency*frequency},random);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const u=x*frequency/size,v=y*frequency/size,ix=Math.floor(u),iy=Math.floor(v),fx=u-ix,fy=v-iy;
   const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),at=(dx,dy)=>lattice[((iy+dy)%frequency)*frequency+(ix+dx)%frequency];
   const a=at(0,0)*(1-sx)+at(1,0)*sx,b=at(0,1)*(1-sx)+at(1,1)*sx;
   density[y*size+x]+=(a*(1-sy)+b*sy)*weight;
  }
 }
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=y*size+x,at=(dx,dy)=>density[((y+dy+size)%size)*size+(x+dx+size)%size];
  pixels[i*2]=Math.round(density[i]*255);
  pixels[i*2+1]=Math.round(clamp(.5+(at(-2,-2)-at(2,2))*1.7,0,1)*255);
 }
 const texture=new THREE.DataTexture(pixels,size,size,THREE.RGFormat);
 texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
 texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
 texture.generateMipmaps=true;texture.needsUpdate=true;
 return texture;
}

export function createCanyonClouds(THREE){
 const group=new THREE.Group();group.name='Canyon cloud sea';group.visible=false;
 const profile=[];
 for(let s=0;s<CANYON_TRACK.length;s+=PROFILE_STEP)profile.push(canyonPointAt(s));
 profile.push(canyonPointAt(CANYON_TRACK.length));
 const first=profile[0],last=profile.at(-1);
 const rows=[{...first,x:first.x-HORIZON_MARGIN},...profile,{...last,x:last.x+HORIZON_MARGIN}];
 const minZ=Math.min(...profile.map(p=>p.z))-HORIZON_MARGIN,maxZ=Math.max(...profile.map(p=>p.z))+HORIZON_MARGIN;
 const positions=[],indices=[];
 // The narrow core follows the actual level cross-sections below both road
 // edges. Keep it below the minimum bend radius, then extend the outer edges
 // along world Z: their X is monotonic, so the broad sea cannot fold on turns.
 for(let i=0;i<rows.length;i++){
  const p=rows[i],y=p.height-CLOUD_DEPTH,leftX=p.x-p.right.x*CORE_HALF_WIDTH,rightX=p.x+p.right.x*CORE_HALF_WIDTH;
  positions.push(leftX,y,minZ,leftX,y,p.z-p.right.z*CORE_HALF_WIDTH,p.x,y,p.z,rightX,y,p.z+p.right.z*CORE_HALF_WIDTH,rightX,y,maxZ);
  if(i)for(let column=0;column<4;column++){const a=(i-1)*5+column,b=i*5+column;indices.push(a,a+1,b,a+1,b+1,b);}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeBoundingSphere();
 const texture=createCloudTexture(THREE),wind={value:new THREE.Vector2()};
 function material(veil){
  return new THREE.ShaderMaterial({
   name:veil?'Canyon soft cloud veil':'Canyon opaque cloud cover',fog:true,lights:false,toneMapped:false,
   transparent:veil,depthTest:true,depthWrite:!veil,side:THREE.DoubleSide,forceSinglePass:true,
   uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),cloudMap:{value:texture},wind,
    lift:{value:veil?VEIL_LIFT:0},patternScale:{value:veil?1.17:1},veilOpacity:{value:veil ? .18 : 1},
    shadowColor:{value:new THREE.Color(0xaec6d9)},lightColor:{value:new THREE.Color(0xf5f9fc)}},
   defines:veil?{CLOUD_VEIL:1}:{},
   vertexShader:`
    uniform float lift;
    uniform float patternScale;
    uniform vec2 wind;
    varying vec2 cloudUv;
    #include <fog_pars_vertex>
    void main(){
     cloudUv=position.xz*(patternScale/320.0)+wind;
     vec4 mvPosition=modelViewMatrix*vec4(position+vec3(0.0,lift,0.0),1.0);
     gl_Position=projectionMatrix*mvPosition;
     #include <fog_vertex>
    }`,
   fragmentShader:`
    uniform sampler2D cloudMap;
    uniform vec3 shadowColor;
    uniform vec3 lightColor;
    uniform float veilOpacity;
    varying vec2 cloudUv;
    #include <fog_pars_fragment>
    void main(){
     vec2 cloud=texture2D(cloudMap,cloudUv).rg;
     float puff=smoothstep(0.24,0.76,cloud.r);
     float light=clamp(0.24+cloud.g*0.55+puff*0.34,0.0,1.0);
     float alpha=1.0;
     #ifdef CLOUD_VEIL
      alpha=veilOpacity*smoothstep(0.28,0.72,cloud.r);
     #endif
     gl_FragColor=vec4(mix(shadowColor,lightColor,light),alpha);
     #include <colorspace_fragment>
     #include <fog_fragment>
    }`,
  });
 }
 const coverMaterial=material(false),veilMaterial=material(true);
 const cover=new THREE.Mesh(geometry,coverMaterial),veil=new THREE.Mesh(geometry,veilMaterial);
 cover.name='Canyon opaque clouds';veil.name='Canyon cloud wisps';
 // Two small, fixed meshes live outside the scenery's spatial proxy manager.
 // Only UV uniforms move; neither clouds nor their shader lift have colliders.
 cover.castShadow=cover.receiveShadow=veil.castShadow=veil.receiveShadow=false;
 // Include the shader-only lift in the shared conservative culling bound.
 geometry.boundingSphere.radius+=VEIL_LIFT;
 group.add(cover,veil);
 const skyColor=new THREE.Color(CANYON_FOG.color),cloudColor=new THREE.Color(0xdce9f2),fogColor=new THREE.Color();
 const fog={...CANYON_FOG};
 let disposed=false;
 return {group,get fog(){return group.visible?fog:null;},
  setQuality(profile){veil.visible=profile?.level!=='low'&&profile?.level!=='minimal';},
  update(dt,{active=false,paused=false,camera}={}){
   if(disposed)return;
   group.visible=active;if(!active)return;
   Object.assign(fog,CANYON_FOG);
   if(!paused){const delta=clamp(Number(dt)||0,0,.1);wind.value.x=(wind.value.x+delta*.0015)%1;wind.value.y=(wind.value.y+delta*.0009)%1;}
   // The camera can fall through the surface; local fog then hides the basin.
   // Its reference stays fixed to the road profile, never to the falling car.
   if(camera){const road=projectCanyon(camera.position.x,camera.position.z),blend=road?clamp((road.height-CLOUD_DEPTH+1.5-camera.position.y)/2,0,1):0;
    if(blend>0){fog.color=fogColor.copy(skyColor).lerp(cloudColor,blend).getHex();fog.near=CANYON_FOG.near+(1-CANYON_FOG.near)*blend;fog.far=CANYON_FOG.far+(24-CANYON_FOG.far)*blend;}
   }
  },
  dispose(){if(disposed)return;disposed=true;group.visible=false;group.removeFromParent();geometry.dispose();coverMaterial.dispose();veilMaterial.dispose();texture.dispose();},
 };
}
