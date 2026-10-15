"""Independent roof-support and physical-contact comparison for uniform imports."""
exec(open(__file__.replace('measure-fit.py','source-review.py')).read().split('rows=[]')[0])
results=[]
for name in MODELS:
 j,b=load(SOURCE/(name+'.glb'));ns=j['nodes']; worlds={};pos_all=[];body_tris=[];wheels=[]
 def walk(i,p):
  worlds[i]=p@local(ns[i])
  for c in ns[i].get('children',[]):walk(c,worlds[i])
 for i in j['scenes'][0]['nodes']:walk(i,np.eye(4))
 for ni,n in enumerate(ns):
  if 'mesh' not in n:continue
  ps=[]
  for pr in j['meshes'][n['mesh']]['primitives']:
   pos=acc(j,b,pr['attributes']['POSITION']);wp=(np.c_[pos,np.ones(len(pos))]@worlds[ni].T)[:,:3];idx=acc(j,b,pr['indices']).reshape(-1,3);ps.append(wp);pos_all.append(wp)
   if 'wheel' not in n['name']:body_tris.extend(wp[idx].tolist())
  if 'wheel' in n['name']:
   p=np.concatenate(ps);wheels.append({'name':n['name'],'center':(p.max(0)+p.min(0))/2,'bounds':np.array([p.min(0),p.max(0)])})
 pos_all=np.concatenate(pos_all);lo=pos_all.min(0);hi=pos_all.max(0);sc=min(3.1/(hi-lo)[0],5.76/(hi-lo)[2]);center=(lo+hi)/2
 def norm(p):
  p=(p-center)*sc;p[...,0]*=-1;p[...,2]*=-1;p[...,1]+=(hi[1]-lo[1])/2*sc+.05;return p
 ts=norm(np.array(body_tris));xs=ts[:,:,0];zs=ts[:,:,2];ys=ts[:,:,1]
 den=(zs[:,1]-zs[:,2])*(xs[:,0]-xs[:,2])+(xs[:,2]-xs[:,1])*(zs[:,0]-zs[:,2]);valid=np.abs(den)>1e-10
 def surface(x,z):
  d=den[valid];xx=xs[valid];zz=zs[valid];yy=ys[valid]
  u=((zz[:,1]-zz[:,2])*(x-xx[:,2])+(xx[:,2]-xx[:,1])*(z-zz[:,2]))/d
  v=((zz[:,2]-zz[:,0])*(x-xx[:,2])+(xx[:,0]-xx[:,2])*(z-zz[:,2]))/d;w=1-u-v;hit=(u>=-1e-8)&(v>=-1e-8)&(w>=-1e-8)
  return float(np.max((u[:,None]*yy[:,0:1]+v[:,None]*yy[:,1:2]+w[:,None]*yy[:,2:3])[hit])) if hit.any() else None
 candidates=[]
 for z in np.arange(-1.5,1.501,.025):
  samples=[surface(x,z+dz) for x in [-.59,-.295,0,.295,.59] for dz in [-.59,-.295,0,.295,.59]]
  if None in samples:continue
  mn=min(samples);mx=max(samples)
  candidates.append({'z':round(float(z),3),'bottom':mx+.02,'lowestSupport':mn,'spread':mx-mn,'score':mn-.5*(mx-mn)})
 best=sorted(candidates,key=lambda c:-c['score'])[:3]

 alternatives=sorted([c for c in candidates if abs(c['z'])>.55],key=lambda c:-c['score'])[:4] if name=='police' else []
 wheel_report=[]
 for w in wheels:
  c=norm(w['center'].copy());bb=norm(w['bounds'].copy());blo=bb.min(0);bhi=bb.max(0)
  wheel_report.append({'name':w['name'],'center':c.tolist(),'outerX':float(max(abs(blo[0]),abs(bhi[0]))),'radiusY':float((bhi[1]-blo[1])/2),'front':bool(c[2]<0),'zDelta':float(c[2]-(-1.63 if c[2]<0 else 1.73)),'xDelta':float(abs(c[0])-1.32)})
 r={'model':name,'scale':float(sc),'size':((hi-lo)*sc).tolist(),'wheels':wheel_report,'cargoCandidates':best,'policeAlternatives':alternatives};results.append(r)
 print(name,'scale',round(sc,4),'size',np.round(r['size'],3).tolist(),'wheel X',round(abs(wheel_report[0]['center'][0]),3),'outerX',round(max(w['outerX'] for w in wheel_report),3),'wheelZ',sorted(set(round(w['center'][2],3) for w in wheel_report)),'cargo',[(c['z'],round(c['bottom'],3),round(c['spread'],3)) for c in best],'alternatives',[(c['z'],round(c['bottom'],3),round(c['spread'],3)) for c in alternatives])
(ROOT/'qa/cosmo-fit/normalization-review.json').write_text(json.dumps(results,indent=2)+'\n')
