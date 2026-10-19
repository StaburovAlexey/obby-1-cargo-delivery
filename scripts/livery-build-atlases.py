#!/usr/bin/env python3
"""Build shipping 1024px livery atlases from authored graphics and original character art.
The PNG concept sheets are reference only; none is projected onto a car.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import math, random, json, hashlib
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/assets/liveries'
SCALE=2
W=1024
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
CARS=[
 ('pickup','coupe','CITY',['#111c2a','#04dffa','#8825ff'],['#1459f4','#ffffff','#14243d'],['#ff477f','#4ccdbd']),
 ('citycourier','police','CITY',['#211341','#05e5ed','#b3f620'],['#d82938','#ffffff','#121925'],['#ff7d24','#2860cb']),
 ('rover','jeep','FOREST',['#06c5d5','#f66c83','#d8f625'],['#fa751e','#fff6df','#202634'],['#77c5c1','#af87d8']),
 ('foresthauler','van','FOREST',['#b1ed27','#18cee9','#5629dc'],['#0bbce9','#ffffff','#18344b'],['#f19475','#b1a0d5']),
 ('van','kamaro','DESERT',['#ec31b4','#09d7e5','#cced20'],['#f44524','#fff6df','#202638'],['#91bef3','#a38bc9']),
 ('desertscout','ghini','DESERT',['#113bd8','#fa8c22','#d3ef21'],['#edc719','#ffffff','#202835'],['#b08bdb','#f5ba82']),
 ('snowgrip','rally','ICE',['#4021ac','#08cfe9','#dbf420'],['#104cd3','#f4dc25','#eef8ff'],['#fb846f','#53cfe5']),
 ('snowrunner','armor','POLAR',['#15162d','#23e2ee','#c82be7'],['#ff7b24','#edf9ff','#173458'],['#ff925c','#95cde4']),
 ('lavacrawler','lamb','LAVA',['#2a123f','#24e0ea','#c0ed26'],['#e62f25','#ffffff','#26303d'],['#fb815d','#35c7cf']),
 ('ashhauler','fenyr','ASH',['#121b4c','#17c5e9','#e14bf3'],['#e6b837','#fffdf3','#27303b'],['#f88792','#56b9bd']),
 ('bmwreward','bmw-g80-m3','GOLD',['#101923','#05d9eb','#8d28f2'],['#0ab9ba','#fffef5','#172637'],['#e53254','#1a242f'])]

def rgb(c): return tuple(int(c[i:i+2],16) for i in (1,3,5))
def blend(a,b,t): return tuple(round(x*(1-t)+y*t) for x,y in zip(rgb(a),rgb(b)))
def font(n): return ImageFont.truetype(FONT,max(1,round(n*SCALE)))
def text(draw,xy,label,size,fill,anchor='mm',stroke=0):
 draw.text(tuple(round(x*SCALE) for x in xy),label,font=font(size),fill=fill,anchor=anchor,stroke_width=round(stroke*SCALE),stroke_fill='#101924')
def poly(draw,pts,fill): draw.polygon([(round(x*SCALE),round(y*SCALE)) for x,y in pts],fill=fill)
def line(draw,pts,fill,width=1): draw.line([(round(x*SCALE),round(y*SCALE)) for x,y in pts],fill=fill,width=max(1,round(width*SCALE)),joint='curve')
def rect(draw,box,fill): draw.rectangle(tuple(round(x*SCALE) for x in box),fill=fill)
def circle(draw,x,y,r,fill,outline=None,width=1): draw.ellipse(tuple(round(v*SCALE) for v in (x-r,y-r,x+r,y+r)),fill=fill,outline=outline,width=round(width*SCALE))
def panel(w,h,base,light=None):
 im=Image.new('RGB',(w*SCALE,h*SCALE),base)
 if light:
  d=ImageDraw.Draw(im)
  for y in range(h*SCALE): d.line((0,y,w*SCALE,y),fill=blend(light,base,y/(h*SCALE-1)))
 return im

def star(d,x,y,r,color):
 pts=[]
 for i in range(8):
  angle=math.pi/4*i;rr=r if i%2==0 else r*.23;pts.append((x+math.cos(angle)*rr,y+math.sin(angle)*rr))
 poly(d,pts,color)

def shards(d,w,h,colors,seed,top=False):
 r=random.Random(seed)
 for i in range(13 if not top else 19):
  x=r.uniform(-w*.15,w);y=r.uniform(h*.12,h*.96);l=r.uniform(w*.08,w*.28);v=r.uniform(h*.025,h*.14)
  poly(d,[(x,y),(x+l,y-v*2.5),(x+l*.56,y+v*.3),(x+l*.16,y+v)],colors[i%len(colors)])

def checkers(d,x,y,s,rows=2,cols=12):
 for j in range(rows):
  for i in range(cols):
   if (i+j)%2==0: rect(d,(x+i*s,y+j*s,x+(i+1)*s,y+(j+1)*s),'#142333')

def neon(w,h,colors,seed,top=False):
 im=panel(w,h,colors[0]);d=ImageDraw.Draw(im);r=random.Random(seed)
 shards(d,w,h,[colors[1],colors[2],colors[0]],seed,top)
 for i in range(9):
  x=r.uniform(0,w*.95);y=r.uniform(h*.12,h*.92)
  pts=[(x,y),(x+w*.055,y),(x+w*.09,y-h*.13),(x+w*.20,y-h*.13),(x+w*.23,y-h*.21)]
  line(d,pts,colors[1 if i%3 else 2],2 if not top else 2.3)
  circle(d,*pts[0],2,None,colors[1],1)
  circle(d,*pts[-1],2,None,colors[1],1)
 if top:
  for x in [w*.28,w*.70]: line(d,[(x,0),(x,h*.36),(x+w*.05,h*.43),(x+w*.05,h)],colors[1],2)
 return im

def racing(w,h,colors,num,side=0,top=False):
 base,accent,dark=colors;im=panel(w,h,base);d=ImageDraw.Draw(im)
 if top:
  rect(d,(w*.32,0,w*.68,h),accent);rect(d,(w*.47,0,w*.53,h),dark)
  rect(d,(w*.28,0,w*.30,h),accent);rect(d,(w*.70,0,w*.72,h),accent)
  poly(d,[(0,h*.2),(w*.27,h*.06),(w*.27,h*.30),(0,h*.44)],dark)
  poly(d,[(w,h*.64),(w*.74,h*.8),(w*.74,h*.94),(w,h*.8)],dark)
  # Hood wordmark and number are independent of both side projections.
  rect(d,(w*.25,h*.69,w*.75,h*.94),accent);text(d,(w*.5,h*.81),num,w*.20,'#152230' if dark=='#eef8ff' else dark)
 else:
  poly(d,[(0,h*.90),(w,h*.18),(w,h),(0,h)],dark)
  poly(d,[(0,h*.71),(w,h*.02),(w,h*.27),(0,h*.96)],accent)
  center=w*(.53 if side==0 else .47);yy=h*.70
  box=(center-w*.095,yy-h*.24,center+w*.095,yy+h*.24);rect(d,box,'#f7f6eb')
  text(d,(center,yy),num,h*.34,'#152230')
  checkers(d,w*.70,h*.80,h*.048,2,9)
  text(d,(w*.80,h*.66),'APEX',h*.09,'#f5f6ed')
  text(d,(w*.78,h*.96),'MOTORSPORT',h*.045,'#f5f6ed')
 return im

def contours(d,w,h,color,seed,width=1):
 r=random.Random(seed)
 for j in range(12):
  pts=[]
  for k in range(65):
   x=k/64*w;y=h*(j/12+.055*math.sin(k/64*math.pi*3+j*.32)+.035*math.sin(k/64*math.pi*8-j*.5))
   pts.append((x,y))
  line(d,pts,color,width)

def tree(d,x,y,h,col):
 rect(d,(x-h*.025,y-h*.10,x+h*.025,y),col)
 for k in range(4):
  top=y-h+(k*h*.17);hw=h*(.11+k*.045)
  poly(d,[(x,top),(x-hw,top+h*.37),(x+hw,top+h*.37)],col)

def biome(w,h,kind,num,seed,top=False):
 r=random.Random(seed)
 if kind in ('CITY','GOLD'):
  im=panel(w,h,'#18232d','#3c454b' if kind=='CITY' else '#0f151d');d=ImageDraw.Draw(im);gold='#d4a553' if kind=='CITY' else '#e6bc5c'
  if kind=='GOLD':
   for i in range(8):
    x=i*w/7
    poly(d,[(x-w*.09,0),(x+w*.07,0),(x-w*.13,h),(x-w*.28,h)],gold if i%3==0 else '#6c5427')
  for i in range(14):
   x=r.uniform(0,w);y=r.uniform(0,h)
   line(d,[(x,y),(x+w*.10,y),(x+w*.15,y+h*.14),(x+w*.26,y+h*.14)],gold,1.3)
  if not top:
   for i in range(23):
    x=w*(.20+i*.027);bh=r.uniform(h*.08,h*.31)
    rect(d,(x,h-bh,x+w*.015,h),gold)
   text(d,(w*.5,h*.75),'CITY' if kind=='CITY' else '11',h*.24,'#eee2ba',stroke=1)
  else:
   line(d,[(w*.35,0),(w*.35,h),(w*.65,h),(w*.65,0)],gold,5)
 elif kind=='FOREST':
  im=panel(w,h,'#163f32','#326351');d=ImageDraw.Draw(im);contours(d,w,h,'#c0a46c',seed,.9)
  if not top:
   poly(d,[(0,h*.12),(w,h*.02),(w,h*.44),(0,h*.64)],'#e8dfc4')
   for i in range(16): tree(d,w*(i/15),h,r.uniform(h*.15,h*.48),'#d1b77e' if i%3 else '#092d25')
   text(d,(w*.59,h*.48),'FOREST',h*.19,'#173f32')
  else:
   tree(d,w*.5,h*.82,w*.42,'#e0cca1')
 elif kind=='DESERT':
  im=panel(w,h,'#e0bb7d','#fff0c5');d=ImageDraw.Draw(im)
  for j,c in enumerate(['#c99b60','#a9693d','#814c30','#553d30']):
   y=h*(.4+j*.15);pts=[(0,h),(w,h)]+[(w-k*w/24,y+math.sin(k*.35+j)*h*.1) for k in range(25)]
   poly(d,pts,c)
  contours(d,w,h,'#f6d69f',seed,.8)
  circle(d,w*.75,h*.28,min(w,h)*.12,'#d77b37')
  if top: rect(d,(w*.38,0,w*.62,h),'#806345');contours(d,w*.24,h,'#e3c28b',seed,.6)
 elif kind in ('ICE','POLAR'):
  im=panel(w,h,'#b9e8ec' if kind=='ICE' else '#183c54','#f4fcf5' if kind=='ICE' else '#47758a');d=ImageDraw.Draw(im)
  cols=['#e6f9f4','#96dbe9','#67bddb','#286f9d','#133e67']
  for j in range(3):
   for i in range(12):
    x=(i-.5)*w/10;y=h*(.34+j*.24);xx=x+w/10
    pts=[(x,y+r.uniform(-h*.14,h*.14)),(xx,y+r.uniform(-h*.14,h*.14)),(x+w*.05,y+h*.34)]
    poly(d,pts,cols[(i+j*2)%len(cols)]);line(d,pts+[pts[0]],'#cff3f2',.8)
  for i in range(5): star(d,r.uniform(0,w),r.uniform(0,h*.50),h*.055,'#e1f9fa')
 elif kind in ('LAVA','ASH'):
  im=panel(w,h,'#242528','#454446' if kind=='ASH' else '#10161c');d=ImageDraw.Draw(im)
  for i in range(11):
   x=r.uniform(-w*.1,w);y=r.uniform(-h*.2,h*.8);pts=[(x,y)]
   for j in range(4): x+=r.uniform(w*.02,w*.07);y+=r.uniform(h*.04,h*.14);pts.append((x,y))
   line(d,pts,'#6d3427',8);line(d,pts,'#e46a27',3);line(d,pts,'#ffd08a',.9)
   p=pts[2];line(d,[p,(p[0]-w*.05,p[1]+h*.12),(p[0]-w*.1,p[1]+h*.19)],'#e67432',1.3)
  for i in range(180):
   x=r.randrange(w);y=r.randrange(h)
   if y>h*.35:circle(d,x,y,r.choice([.5,.5,1]),r.choice(['#7e482e','#b86832','#e79740']))
 return im

character=Image.open(OUT/'source-art/original-courier.png').convert('RGBA')
def anime(w,h,colors,num,seed,side=0,top=False,tall=False):
 im=panel(w,h,'#fff8ef','#ffffff');d=ImageDraw.Draw(im)
 shards(d,w,h,[colors[0],colors[1],'#dce5ed'],seed,top)
 for k in range(7): star(d,w*(.08+k*.14),h*(.25 if k%2 else .81),h*.044,colors[k%2])
 if top:
  size=int(w*.52*SCALE);art=character.resize((size,size),Image.Resampling.LANCZOS)
  im.paste(art,(int((w*SCALE-size)/2),int(h*.63*SCALE)),art)
  text(d,(w*.5,h*.15),'NOVA',w*.10,'#182431')
 else:
  ah=h*(.88 if tall else .58);size=round(ah*SCALE)
  art=character.resize((size,size),Image.Resampling.LANCZOS)
  center=w*(.57 if side==0 else .43);yy=h*(.10 if tall else .41)
  im.paste(art,(round(center*SCALE-size*.5),round(yy*SCALE)),art)
  d=ImageDraw.Draw(im)
  tx=w*(.77 if side==0 else .22)
  text(d,(tx,h*.68),num,h*.25,'#172635')
  text(d,(tx,h*.86),'NOVA',h*.08,'#172635')
 return im

manifest={'schemaVersion':1,'size':[1024,1024],'variants':['neon','anime','racing','biome'],
 'layout':{'left':[0,0,1024,256],'right':[0,256,1024,256],'top':[0,512,512,512],'front':[512,512,512,256],'rear':[512,768,512,256]},
 'notes':['Original source palettes and base models retained.','English on-car text only.','Original fictional NOVA courier character generated for this project; no licensed character.','Texture atlases are authored for new six-sided body UVs; concept sheets are not used as texture atlases.'], 'files':[]}
for idx,(vehicle,model,kind,ncols,rcols,acols) in enumerate(CARS,1):
 num=f'{idx:02}';folder=OUT/vehicle;folder.mkdir(parents=True,exist_ok=True)
 for variant in manifest['variants']:
  atlas=Image.new('RGB',(1024*SCALE,1024*SCALE))
  for name,box in manifest['layout'].items():
   x,y,w,h=box;side=1 if name=='right' else 0;is_top=name=='top';seed=idx*137+(1 if side else 0)
   if variant=='neon': tile=neon(w,h,ncols,seed,is_top)
   elif variant=='racing':tile=racing(w,h,rcols,num,side,is_top)
   elif variant=='biome':tile=biome(w,h,kind,num,seed,is_top)
   else:tile=anime(w,h,acols,num,seed,side,is_top,vehicle=='foresthauler' and name in ('left','right'))
   # Text stays on broad hood/side panels, never chopped across narrow grilles or lamps.
   if name in ('front','rear') and variant=='racing':
    tile=panel(w,h,rcols[0]);td=ImageDraw.Draw(tile)
    poly(td,[(0,h*.60),(w,0),(w,h*.35),(0,h)],rcols[1])
    rect(td,(0,h*.82,w,h),rcols[2])
   if name in ('front','rear') and variant=='biome':
    tile=biome(w,h,kind,num,seed,True)
   # Front/rear do not repeat a portrait or door-number graphic on grille-sized surfaces.
   if name in ('front','rear') and variant=='anime':
    tile=panel(w,h,'#fff9f0');shards(ImageDraw.Draw(tile),w,h,acols,seed)
   atlas.paste(tile,(x*SCALE,y*SCALE))
  atlas=atlas.resize((1024,1024),Image.Resampling.LANCZOS)
  path=folder/f'{variant}.webp';atlas.save(path,'WEBP',quality=90,method=6)
  raw=path.read_bytes();manifest['files'].append({'vehicleId':vehicle,'model':model,'variant':variant,'file':str(path.relative_to(OUT)),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Built {len(manifest["files"])} 1024x1024 atlases: {sum(f["bytes"] for f in manifest["files"]):,} bytes')
