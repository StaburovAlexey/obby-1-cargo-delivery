"""Offline, independent GLB source measurements; no renderer or network."""
import json,struct,pathlib,io,collections,hashlib
import numpy as np
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[2]
SOURCE=ROOT.parent/'car_pack_audit/lowpoly/lowpoly_cars_free/GLTF'
MODELS=['coupe','police','jeep','van','kamaro','ghini','rally','armor','lamb','fenyr']
TYPES={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}
SIZE={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def load(p):
 data=p.read_bytes();magic,v,ln=struct.unpack_from('<4sII',data);assert magic==b'glTF' and v==2 and ln==len(data)
 pos=12;chunks={}
 while pos<len(data):
  n,t=struct.unpack_from('<II',data,pos);chunks[t]=data[pos+8:pos+8+n];pos+=n+8
 return json.loads(chunks[0x4e4f534a]),chunks[0x004e4942]
def acc(j,b,i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];dt=np.dtype(TYPES[a['componentType']]);n=SIZE[a['type']];off=a.get('byteOffset',0)+v.get('byteOffset',0)
 return np.ndarray((a['count'],n),dtype=dt,buffer=b,offset=off,strides=(v.get('byteStride',n*dt.itemsize),dt.itemsize))
def local(n):
 if 'matrix' in n:return np.array(n['matrix']).reshape(4,4).T
 m=np.eye(4);x,y,z,w=n.get('rotation',[0,0,0,1]);m[:3,:3]=np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],[2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],[2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]])@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0]);return m
rows=[]
for name in MODELS:
 p=SOURCE/(name+'.glb');j,b=load(p);ns=j['nodes'];worlds={};images=[]
 for im in j['images']:
  v=j['bufferViews'][im['bufferView']];images.append(np.array(Image.open(io.BytesIO(b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])).convert('RGB')))
 def walk(i,parent):
  worlds[i]=parent@local(ns[i])
  for c in ns[i].get('children',[]):walk(c,worlds[i])
 for i in j['scenes'][j.get('scene',0)]['nodes']:walk(i,np.eye(4))
 lights=collections.defaultdict(list);body=[];wheels=[];roof=[];allpos=[];triangle_count=0;primitive_count=0
 for ni,n in enumerate(ns):
  if 'mesh' not in n:continue
  positions=[]
  for pr in j['meshes'][n['mesh']]['primitives']:
   pos=acc(j,b,pr['attributes']['POSITION']);wp=(np.c_[pos,np.ones(len(pos))]@worlds[ni].T)[:,:3];positions.append(wp);allpos.append(wp)
   idx=acc(j,b,pr['indices']).reshape(-1,3) if 'indices' in pr else np.arange(len(pos)).reshape(-1,3);triangle_count+=len(idx);primitive_count+=1
   mat=j['materials'][pr['material']]
   if 'wheel' not in n['name']:
    normals=acc(j,b,pr['attributes']['NORMAL'])@worlds[ni][:3,:3].T
    roof.extend(wp[normals[:,1]>.85].tolist())
   if mat['name']=='light':
    uv=acc(j,b,pr['attributes']['TEXCOORD_0']);im=images[j['textures'][mat['emissiveTexture']['index']]['source']]
    coords=np.round(np.mean(uv[idx],axis=1)*[im.shape[1]-1,im.shape[0]-1]).astype(int);coords[:,0]=np.clip(coords[:,0],0,im.shape[1]-1);coords[:,1]=np.clip(coords[:,1],0,im.shape[0]-1)
    rgb=im[coords[:,1],coords[:,0]]
    for c,tri in zip(rgb,wp[idx]):lights[','.join(map(str,c))].append(tri.mean(0).tolist())
  positions=np.concatenate(positions)
  if 'wheel' in n['name']:wheels.append({'name':n['name'],'origin':worlds[ni][:3,3].tolist(),'center':((positions.min(0)+positions.max(0))/2).tolist(),'size':(positions.max(0)-positions.min(0)).tolist(),'axis':worlds[ni][:3,0].tolist()})
  else:body.extend(positions.tolist())
 allpos=np.concatenate(allpos);body=np.array(body);roof=np.array(roof);upper=roof[roof[:,1]>np.quantile(roof[:,1],.9)]
 r={'model':name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size,'triangles':triangle_count,'primitives':primitive_count,'bounds':[allpos.min(0).tolist(),allpos.max(0).tolist()], 'wheels':wheels,'lights':{c:{'triangles':len(ps),'centroid':np.mean(ps,axis=0).tolist(),'min':np.min(ps,axis=0).tolist(),'max':np.max(ps,axis=0).tolist()} for c,ps in lights.items()},'highestUpwardSurfaceBounds':[upper.min(0).tolist(),upper.max(0).tolist()]}
 rows.append(r)
 print(name,'lights',json.dumps(r['lights']),'upper',r['highestUpwardSurfaceBounds'])
(ROOT/'qa/cosmo-fit/source-review.json').write_text(json.dumps(rows,indent=2)+'\n')
