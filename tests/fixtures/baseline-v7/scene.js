/* Urban Route — original procedural environment. No imported models.
 * Facades/roofs/road use small code-generated textures instead of repeated detail meshes.
 * Logical coordinates: (x, distance along street, height), metres.
 * Conversion to Three.js: (x, height, -distance). */
import {
  createBrickPlasticMaterial,
  createRoadMaterial,
} from "./building-material.js";

import { routeHeight, routeCenter, branchCenter, surfaceHeight, ROUTE, ROAD_SPLIT_Y } from "./road-layout.js";
import { createGroundMaterial } from "./ground-material.js";
export { routeHeight, routeCenter } from "./road-layout.js";

export function buildCity(THREE, { seed = 42 } = {}) {
  let state = seed >>> 0 || 1;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const root = new THREE.Group();
  root.name = "Urban Route • procedural city";
  const materials = {
    ivory: 0xe2dac1,
    concrete: 0x9dafa9,
    curb: 0xd0cebc,
    slate: 0x283c45,
    rubber: 0x161c20,
    glass: 0x244d63,
    glassLight: 0x4c8597,
    metal: 0x536766,
    grass: 0x789650,
    leaf: 0x548e27,
    leafLight: 0x86b63d,
    leafDark: 0x376b30,
    trunk: 0x765237,
    soil: 0x444c34,
    orange: 0xf47a12,
    orangeLight: 0xffa025,
    cream: 0xffe8b2,
    red: 0xe44331,
    teal: 0x34847f,
    coral: 0xda785b,
    mustard: 0xe4bd57,
    mint: 0x8fbb92,
    blue: 0x629fb8,
    carton: 0xb78142,
    cartonLight: 0xdca65f,
    tape: 0xf3d496,
    white: 0xf6f1da,
    yellow: 0xffc438,
    lime: 0x9afc53,
    driver: 0x246ea7,
    skin: 0xad7850,
    skyline: 0x91b3b8,
    road: 0x727a7d,
    stud: 0x899195,
  };
  const groups = {},
    batches = new Map(),
    features = [];
  const geos = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
  };
  const base = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.73,
  });
  const brickPlastic = createBrickPlasticMaterial(THREE);
  let section = "Terrain";
  const V = (x, y, z) => new THREE.Vector3(x, z, -y);
  const matColor = (name) => materials[name] ?? name;
  function group(name) {
    return (
      groups[name] ??
      (groups[name] = Object.assign(new THREE.Group(), { name }))
    );
  }
  function add(type, name, loc, size, color, rot = null, special = "solid") {
    if (
      type === "box" &&
      special === "solid" &&
      /^(Residence |Distant tower$|Teal coping$|Canopy upper lip$|Shop roof$)/.test(
        name,
      )
    )
      special = "brick";
    const key = section + "|" + type + "|" + special;
    if (!batches.has(key))
      batches.set(key, { section, type, special, items: [] });
    const o = new THREE.Object3D();
    o.position.copy(V(...loc));
    o.scale.set(size[0], size[2], size[1]);
    if (rot) {
      o.rotation.set(rot[0] || 0, rot[2] || 0, rot[1] || 0);
    }
    o.updateMatrix();
    batches.get(key).items.push({
      name,
      matrix: o.matrix.clone(),
      color: new THREE.Color(matColor(color)),
    });
    return o;
  }
  const box = (name, loc, size, color, rot) =>
    add("box", name, loc, size, color, rot);
  function cylinder(name, loc, r, depth, color, axis = "Z", type = "cylinder") {
    const rot =
      axis === "X"
        ? [0, 0, Math.PI / 2]
        : axis === "Y"
          ? [Math.PI / 2, 0, 0]
          : null;
    // Cylinder's vertical axis is native Y. Rotation order above maps logical axes.
    if (axis === "X")
      return add(type, name, loc, [r, r, depth], color, [0, Math.PI / 2, 0]);
    return add(type, name, loc, [r, r, depth], color, rot);
  }
  const junctionX = routeCenter(ROUTE.fork);
  const centers = y => y <= ROUTE.fork
    ? [routeCenter(y), routeCenter(y)]
    : [branchCenter("left", y), branchCenter("right", y)];
  const halves = y => {
    const [left, right] = centers(y), middle = y <= ROUTE.fork ? left : junctionX;
    const w = ROUTE.halfWidth;
    return [[left - w, Math.min(middle, left + w)], [Math.max(middle, right - w), right + w]];
  };
  function finishSurfaceGeometry(geometry) {
    const p=geometry.attributes.position,uv=geometry.attributes.uv,index=geometry.index.array;
    const kept=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
    for(let i=0;i<index.length;i+=3){a.fromBufferAttribute(p,index[i]);b.fromBufferAttribute(p,index[i+1]).sub(a);c.fromBufferAttribute(p,index[i+2]).sub(a);if(b.cross(c).lengthSq()>1e-14)kept.push(index[i],index[i+1],index[i+2]);}
    const remap=new Map(),positions=[],texcoords=[],compact=[];
    for(const old of kept){if(!remap.has(old)){remap.set(old,positions.length/3);positions.push(p.getX(old),p.getY(old),p.getZ(old));texcoords.push(uv.getX(old),uv.getY(old));}compact.push(remap.get(old));}
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute("uv",new THREE.Float32BufferAttribute(texcoords,2));geometry.setIndex(compact);geometry.computeVertexNormals();return geometry;
  }
  function surfaceMesh(name, ranges, start, end, material, offset = .008, step = .5) {
    const positions = [], uv = [], index = [];
    const count = Math.ceil((end-start)/step);
    const stations=Array.from({length:count+1},(_,i)=>start+(end-start)*i/count);
    for(const y of[ROUTE.fork,ROAD_SPLIT_Y,ROUTE.descentStart])if(y>start+1e-8&&y<end-1e-8&&!stations.some(v=>Math.abs(v-y)<1e-8))stations.push(y);
    stations.sort((a,b)=>a-b);const steps=stations.length-1;
    for (const range of ranges) {
      const base = positions.length / 3;
      for (let i=0; i<=steps; i++) {
        const y=stations[i], [lo,hi]=range(y);
        for(const x of [lo,hi]) {
          const v=V(x,y,surfaceHeight(x,y)+offset); positions.push(v.x,v.y,v.z); uv.push(x/2,y/2);
        }
        if(i<steps) {const a=base+i*2; index.push(a,a+1,a+2,a+1,a+3,a+2);}
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
    geometry.setIndex(index);finishSurfaceGeometry(geometry);
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.receiveShadow=true;group(section).add(mesh);return mesh;
  }
  const roadMaterial=createRoadMaterial(THREE,materials.road);
  const grassMaterial=createGroundMaterial(THREE,"grass",materials.grass);
  const paintMaterial=new THREE.MeshStandardMaterial({color:materials.white,roughness:.86,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  // One closed terrain surface. Cross-road grade is shared with the vehicle,
  // with no curb riser, planter slab, staircase, or stud geometry.
  section="Terrain";
  {
    const positions=[],uv=[],indices=[],rows=385,cols=11,start=ROUTE.start-4,end=ROUTE.end+9;
    for(let i=0;i<rows;i++) {
      const y=start+(end-start)*i/(rows-1),[lc,rc]=centers(y);
      const w=ROUTE.halfWidth,ml=Math.min(y<=ROUTE.fork?lc:junctionX,lc+w),mr=Math.max(y<=ROUTE.fork?rc:junctionX,rc-w);
      const xs=[-72,lc-w-9,lc-w,ml,ml+(mr-ml)*.25,(ml+mr)/2,ml+(mr-ml)*.75,mr,rc+w,rc+w+9,72];
      for(const x of xs){const v=V(x,y,surfaceHeight(x,y));positions.push(v.x,v.y,v.z);uv.push(x/4,y/4);}
    }
    for(let i=0;i<rows-1;i++)for(let j=0;j<cols-1;j++) {
      const a=i*cols+j,b=a+cols;
      // Coincident central columns are deliberately welded logically at the fork.
      if(Math.abs(positions[(a+1)*3]-positions[a*3])+Math.abs(positions[(b+1)*3]-positions[b*3])>1e-8)
        indices.push(a,a+1,b,a+1,b+1,b);
    }
    // Side skirts and bottom close the diorama; they are outside the drive area.
    const ring=[];for(let j=0;j<cols;j++)ring.push(j);for(let i=1;i<rows;i++)ring.push(i*cols+cols-1);for(let j=cols-2;j>=0;j--)ring.push((rows-1)*cols+j);for(let i=rows-2;i>0;i--)ring.push(i*cols);
    const bottom=[];for(const v of ring){bottom.push(positions.length/3);positions.push(positions[v*3],-1.8,positions[v*3+2]);uv.push(positions[v*3]/4,positions[v*3+2]/4);}
    for(let i=0;i<ring.length;i++){const n=(i+1)%ring.length;indices.push(ring[i],bottom[i],ring[n],ring[n],bottom[i],bottom[n]);}
    const bottomCenter=positions.length/3;positions.push(0,-1.8,-(ROUTE.start+ROUTE.end)/2);uv.push(0,15);
    for(let i=0;i<bottom.length;i++)indices.push(bottomCenter,bottom[(i+1)%bottom.length],bottom[i]);
    const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);finishSurfaceGeometry(g);
    const mesh=new THREE.Mesh(g,grassMaterial);mesh.name="Closed continuous terrain foundation";mesh.receiveShadow=true;mesh.castShadow=true;group(section).add(mesh);
  }
  section="Street";
  // Two half-strips share the wide approach and separate at an exact mesh station.
  surfaceMesh("Continuous 30m-wide road",[y=>halves(y)[0],y=>halves(y)[1]],ROUTE.start,ROUTE.end,roadMaterial);
  const w=ROUTE.halfWidth,split=ROAD_SPLIT_Y;
  // Edge markings are paint; houses directly bound the avenue without sidewalks.
  surfaceMesh("Flush painted curb",[y=>{const [l]=centers(y);return[l-w+.05,l-w+.19];},y=>{const [,r]=centers(y);return[r+w-.19,r+w-.05];}],ROUTE.start,ROUTE.end,paintMaterial,.008);
  surfaceMesh("Fork inner edge paint",[y=>{const [l]=centers(y);return[l+w-.19,l+w-.05];},y=>{const [,r]=centers(y);return[r-w+.05,r-w+.19];}],split+.2,ROUTE.end,paintMaterial,.008);
  for(const id of["main","left","right"]) {
    const start=id==="main"?ROUTE.start+3:ROUTE.fork+10,end=id==="main"?ROUTE.fork-4:ROUTE.end-3;
    for(let y=start;y<end;y+=6)surfaceMesh("Center dash",[yy=>{const x=branchCenter(id,yy);return[x-.1,x+.1];}],y,Math.min(y+2.5,end),paintMaterial,.008,1.25);
  }
  // Every residence is a single instanced cuboid. Its front follows a short
  // road-edge chord; a conservative footprint fit keeps every corner outside
  // the true curved road. Small overlap closes joints without curb geometry.
  const palette=["coral","mustard","mint","blue"];
  let buildingCount=0;
  function spanAt(polygon,y) {
    let min=Infinity,max=-Infinity;
    for(let i=0;i<4;i++) {
      const a=polygon[i],b=polygon[(i+1)%4];
      if(y<Math.min(a.y,b.y)-1e-8||y>Math.max(a.y,b.y)+1e-8)continue;
      if(Math.abs(a.y-b.y)<1e-10){min=Math.min(min,a.x,b.x);max=Math.max(max,a.x,b.x);}
      else {const x=a.x+(b.x-a.x)*(y-a.y)/(b.y-a.y);min=Math.min(min,x);max=Math.max(max,x);}
    }
    return {min,max};
  }
  const edgeAt=(id,side,y)=>branchCenter(y<=ROUTE.fork?"main":id,y)+side*w;
  function addResidence(row,id,side,from,to,depth=7.5,colorOverride) {
    const middle=(from+to)/2,edge=y=>edgeAt(id,side,y);
    const d=(edge(to)-edge(from))/(to-from),norm=Math.hypot(1,d);
    const tangent={x:d/norm,y:1/norm},normal={x:side/norm,y:-side*d/norm};
    const frontage=(to-from)*norm+.45;
    let clearance=.045,polygon,center;
    const footprint=()=> {
      center={x:edge(middle)+normal.x*(depth/2+clearance),y:middle+normal.y*(depth/2+clearance)};
      return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>({x:center.x+a*normal.x*depth/2+b*tangent.x*frontage/2,y:center.y+a*normal.y*depth/2+b*tangent.y*frontage/2}));
    };
    for(let attempt=0;attempt<12;attempt++) {
      polygon=footprint();
      const lo=Math.min(...polygon.map(p=>p.y)),hi=Math.max(...polygon.map(p=>p.y));
      let violation=0;
      const ys=polygon.map(p=>p.y),steps=Math.ceil((hi-lo)/.04);
      for(let i=0;i<=steps;i++)ys.push(lo+(hi-lo)*i/steps);
      for(const y of ys){const span=spanAt(polygon,y),front=side>0?span.min:span.max;violation=Math.max(violation,side*(edge(y)-front)+.025);}
      if(violation<=1e-8)break;
      clearance+=violation*norm+.002;
    }
    polygon=footprint();
    const floors=3+(rand()>.72?1:0),height=floors*2.8+.4;
    // Bury the bottom below the lowest adjacent surface: no daylight under
    // descending homes, while level roofs retain the simple cuboid silhouette.
    let low=Infinity,high=-Infinity;
    for(let i=0;i<4;i++)for(let j=0;j<=8;j++){
      const a=polygon[i],b=polygon[(i+1)%4],t=j/8,h=surfaceHeight(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);
      low=Math.min(low,h);high=Math.max(high,h);
    }
    const bottom=low-.15,top=high+height;
    section=row;
    const index=buildingCount++,randomColor=palette[(index+Math.floor(rand()*2))%palette.length],color=colorOverride||randomColor;
    box("Residence "+index,[center.x,center.y,(bottom+top)/2],[depth,frontage,top-bottom],color,[0,0,-Math.atan(d)]);
    features.push({type:"building",index,row,branch:id,side,from,to,footprint:polygon,position:[center.x,center.y,bottom],top,depth,frontage,color,floors,clearance});
  }
  for(const side of[-1,1]){
    const row=side<0?"West residences":"East residences",id=side<0?"left":"right";
    // Explicit fork station prevents a box straddling the change in curvature.
    for(const [start,end] of[[ROUTE.start-.25,ROUTE.fork],[ROUTE.fork,ROUTE.end+.25]]){
      const count=Math.ceil((end-start)/6);
      for(let i=0;i<count;i++)addResidence(row,id,side,start+(end-start)*i/count,start+(end-start)*(i+1)/count);
    }
  }
  // At the pointed fork there is not room for two deep houses. Low, closely
  // abutting cuboids fill the first 10m of median, then blend into its two rows.
  const noseEnd=split+10,noseStep=5/3,noseColor="mint";
  for(let from=split+.045;from<noseEnd;from+=noseStep){
    const to=Math.min(from+noseStep+.015,noseEnd),mid=(from+to)/2;
    const left=branchCenter("left",from)+w+.02,right=branchCenter("right",from)-w-.02;
    if(right<=left)continue;
    const depth=right-left,height=from<split+noseStep?1.2:8.8;
    section="Fork nose residences";
    const index=buildingCount++,color=noseColor,bottom=10.85;
    box("Residence "+index,[(left+right)/2,mid,bottom+height/2],[depth,to-from,height],color);
    features.push({type:"building",index,row:section,branch:"median",side:0,from,to,footprint:[{x:left,y:from},{x:right,y:from},{x:right,y:to},{x:left,y:to}],position:[(left+right)/2,mid,bottom],top:bottom+height,depth,frontage:to-from,color,floors:1});
  }
  for(const [id,side,row] of[["left",1,"Left fork inner residences"],["right",-1,"Right fork inner residences"]]){
    const start=split+6,end=ROUTE.end+.25,count=Math.ceil((end-start)/5);
    for(let i=0;i<count;i++){
      const from=start+(end-start)*i/count,to=start+(end-start)*(i+1)/count;
      const available=branchCenter("right",from-2)-branchCenter("left",from-2)-2*w;
      addResidence(row,id,side,from,to,Math.max(.8,Math.min(7.5,available/2-.3)),i===0?noseColor:undefined);
    }
  }
  function carton(x, y, z, w = 1, d = 0.85, hh = 0.85) {
    box(
      "Carton",
      [x, y, z + hh / 2],
      [w, d, hh],
      rand() > 0.35 ? "cartonLight" : "carton",
    );
    box(
      "Carton tape",
      [x, y, z + hh + 0.009],
      [0.16, d + 0.012, 0.015],
      "tape",
    );
    box(
      "Tape folded end",
      [x, y - d / 2 - 0.009, z + hh - 0.17],
      [0.16, 0.014, 0.34],
      "tape",
    );
    box(
      "Parcel label",
      [x + w * 0.24, y - d / 2 - 0.017, z + hh * 0.5],
      [0.22, 0.017, 0.16],
      "cream",
    );
  }
  section = "Orange delivery truck";
  const tx = 1.8,
    ty = -9.8;
  const tb = (n, p, d, c, r) => box(n, [tx + p[0], ty + p[1], p[2]], d, c, r);
  tb("Chassis", [0, 0, 0.92], [2.45, 5.15, 0.42], "slate");
  tb("Cargo bed", [0, -1.2, 1.34], [2.75, 2.85, 0.22], "orange");
  for (let s of [-1, 1]) {
    tb("Bed side", [s * 1.3, -1.19, 1.73], [0.18, 2.88, 0.62], "orange");
    tb("Upper rail", [s * 1.32, -1.19, 2.07], [0.24, 2.98, 0.1], "orangeLight");
    for (let y of [-1.95, -0.45])
      tb(
        "Cargo side rib",
        [s * 1.407, y, 1.74],
        [0.03, 0.11, 0.58],
        "orangeLight",
      );
    tb("Cab door", [s * 1.27, 1.11, 1.89], [0.15, 1.5, 0.77], "orange");
    tb(
      "Side window",
      [s * 1.29, 1.14, 2.58],
      [0.055, 1.35, 0.58],
      "glassLight",
    );
    for (let y of [1.84, 0.34])
      tb("Cab pillar", [s * 1.25, y, 2.62], [0.16, 0.16, 0.93], "orangeLight");
    tb("Door handle", [s * 1.36, 0.69, 2.04], [0.04, 0.26, 0.07], "slate");
    tb("Mirror arm", [s * 1.43, 1.81, 2.48], [0.37, 0.07, 0.07], "metal");
    tb("Mirror", [s * 1.62, 1.81, 2.5], [0.15, 0.34, 0.4], "slate");
    tb("Running board", [s * 1.4, 1.06, 1.15], [0.32, 1.67, 0.1], "metal");
    for (let y of [-1.73, 1.63]) {
      cylinder(
        "Truck tire",
        [tx + s * 1.32, ty + y, 0.73],
        0.68,
        0.43,
        "rubber",
        "X",
      );
      cylinder(
        "Wheel hub",
        [tx + s * 1.555, ty + y, 0.73],
        0.33,
        0.036,
        "metal",
        "X",
      );
      cylinder(
        "Hub center",
        [tx + s * 1.58, ty + y, 0.73],
        0.135,
        0.05,
        "orange",
        "X",
      );
      tb("Wheel arch", [s * 1.39, y, 1.33], [0.3, 1.43, 0.16], "orangeLight");
    }
  }
  tb("Tailgate", [0, -2.61, 1.73], [2.77, 0.19, 0.71], "orange");
  tb("Tailgate rail", [0, -2.63, 2.09], [2.84, 0.25, 0.11], "orangeLight");
  tb("Rear bumper", [0, -2.87, 0.84], [2.99, 0.25, 0.28], "slate");
  tb("Plate", [0, -2.83, 1.15], [0.65, 0.045, 0.23], "ivory");
  for (let s of [-1, 1]) {
    tb("Tail light", [s * 1.03, -2.8, 1.16], [0.31, 0.045, 0.26], "red");
    tb("Indicator", [s * 1.32, -2.8, 1.16], [0.18, 0.045, 0.26], "yellow");
  }
  tb("Cab rear panel", [0, 0.26, 2.11], [2.7, 0.17, 1.66], "orange");
  tb("Cab rear window", [0, 0.151, 2.62], [1.7, 0.035, 0.55], "glass");
  tb("Cab roof", [0, 1.13, 3.18], [2.81, 1.99, 0.2], "orangeLight");
  tb("Windshield", [0, 1.93, 2.68], [2.3, 0.055, 0.67], "glassLight");
  tb("Sun visor", [0, 1.99, 3.1], [2.82, 0.33, 0.12], "orange");
  tb("Front hood", [0, 2.15, 1.96], [2.65, 0.67, 0.66], "orange");
  tb("Grille", [0, 2.51, 1.69], [1.65, 0.055, 0.27], "slate");
  for (let s of [-1, 1])
    tb("Headlight", [s * 1.06, 2.513, 1.91], [0.33, 0.055, 0.29], "cream");
  tb("Front bumper", [0, 2.59, 1.33], [2.91, 0.25, 0.23], "slate");
  tb("Driver shirt", [-0.6, 0.92, 2.05], [0.63, 0.47, 0.64], "driver");
  tb("Driver head", [-0.6, 1.03, 2.6], [0.47, 0.44, 0.47], "skin");
  tb("Driver hair", [-0.6, 1, 2.83], [0.5, 0.47, 0.12], "trunk");
  for (let [x, y, z, w, d, h] of [
    [-0.67, -1.76, 1.46, 0.94, 0.86, 0.89],
    [0.44, -1.97, 1.46, 0.94, 0.83, 0.75],
    [-0.6, -0.73, 1.46, 1.02, 0.88, 0.98],
    [0.56, -0.88, 1.46, 0.87, 0.92, 0.78],
    [0.23, -1.1, 2.44, 0.73, 0.71, 0.63],
  ])
    carton(tx + x, ty + y, z, w, d, h);
  features.push({ type: "truck", position: [tx, ty, 0], length: 5.8 });
  section = "Skyline";
  for (let i = 0; i < 7; i++) {
    let x = [-27, -19, -10, 0, 11, 21, 29][i],
      y = ROUTE.end + 6 + 2 * (i % 2),
      h = [22, 29, 21, 32, 25, 28, 20][i],
      z = surfaceHeight(x,y);
    box("Distant tower", [x, y, z + h / 2], [5.4, 5, h], "skyline");

  }
  // All flat road markings share one merged draw batch.
  for(const [material,name] of[[paintMaterial,"Flush road markings"]]) {
    const sources=[];for(const g of Object.values(groups))for(const mesh of g.children)if(mesh.isMesh&&mesh.material===material)sources.push(mesh);
    if(!sources.length)continue;
    const positions=[],uv=[],index=[];
    for(const mesh of sources){const offset=positions.length/3;positions.push(...mesh.geometry.attributes.position.array);uv.push(...mesh.geometry.attributes.uv.array);index.push(...Array.from(mesh.geometry.index.array,n=>n+offset));mesh.removeFromParent();mesh.geometry.dispose();}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(index);finishSurfaceGeometry(geometry);
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.receiveShadow=true;mesh.userData.sourceNames=sources.map(o=>o.name);group("Street").add(mesh);
  }
  // Mesh instancing keeps draw calls low; original transforms stay accessible in userData.
  let instances = 0,
    triangles = 0;
  for (const [key, b] of batches) {
    const material = b.special === "brick" ? brickPlastic : base;
    const mesh = new THREE.InstancedMesh(
      geos[b.type],
      material,
      b.items.length,
    );
    mesh.name =
      b.section +
      " · " +
      b.type +
      (b.special === "solid" ? "" : " · " + b.special);
    b.items.forEach((i, n) => {
      mesh.setMatrixAt(n, i.matrix);
      mesh.setColorAt(n, i.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.userData.partNames = b.items.map((i) => i.name);
    group(b.section).add(mesh);
    instances += b.items.length;
    triangles += (geos[b.type].index.count / 3) * b.items.length;
  }
  for (const g of Object.values(groups)) root.add(g);
  let totalTriangles = 0,
    totalDrawCalls = 0;
  root.traverse((o) => {
    if (o.isMesh) {
      totalTriangles +=
        ((o.geometry.index
          ? o.geometry.index.count
          : o.geometry.attributes.position.count) /
          3) *
        (o.isInstancedMesh ? o.count : 1);
      totalDrawCalls++;
    }
  });
  const stats = {
    seed,
    instances,
    triangles: totalTriangles,
    drawCalls: totalDrawCalls,
    buildings: buildingCount,
    roadWidth: ROUTE.halfWidth * 2,
    roadsideProps: 0,
    continuousHouseRows: true,
    rampRise: 11,
    routeLength: ROUTE.end - ROUTE.start,
    roadBranches: 2,
    forkHeight: 11,
    downhillEndHeight: 0,
    levelEndHeight: 11,
    flushCurbs: true,
    studs: false,
    texturedRoad: true,
    texturedBuildings: true,
    buildingBodyTriangles: buildingCount * 12,
    importedModels: 0,
    externalTextures: 0,
    proceduralBuildingMaterial: true,
    roofStuds: [...batches.values()].reduce(
      (n, b) => n + b.items.filter((i) => i.name === "Roof stud").length,
      0,
    ),
  };
  root.userData = { stats, features };
  return {
    group: root,
    stats,
    features,
    dispose() {
      const geometries = new Set(),
        mats = new Set();
      root.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
        if (o.geometry) geometries.add(o.geometry);
        if (o.material) mats.add(o.material);
      });
      geometries.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}
