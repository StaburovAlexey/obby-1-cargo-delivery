"""Add explicit offline labels and a five-biome + rock-state contact sheet."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
HERE=Path(__file__).resolve().parent
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def font(n,b=False):return ImageFont.truetype(BOLD if b else FONT,n)
items=[('repair-static','CITY','Yellow road-repair block','Both left and right remain open'),('log-static','FOREST','Fallen cut log','Drive around the log on the open side'),('dune-static','DESERT','Shallow localized sand','Only this footprint increases drag'),('ice-static','SNOW','Clear cyan ice patch','Only this footprint reduces grip'),('rock-warning','VOLCANIC: WARNING','Rock + pulsing ground warning','4.5 seconds of visible advance warning'),('rock-falling','VOLCANIC: FALLING','Rock descends over its shadow','1.2-second drop; safe landing checks'),('rock-landed','VOLCANIC: LANDED','Persistent dark rock','Solid until the run resets; bypass stays open')]
W,H=2048,1170;out=Image.new('RGB',(W,H),'#152a3b');d=ImageDraw.Draw(out)
d.text((30,23),'Road hazards across five biomes',font=font(34,True),fill='#ffffff')
d.text((31,71),'OFFLINE SOURCE-GEOMETRY REVIEW  •  Actual final Three.js triangles; diagnostic Blender lighting',font=font(19),fill='#b2d4e8')
for i,(file,biome,title,note) in enumerate(items):
 im=Image.open(HERE/f'{file}-offline.png').convert('RGB')
 x=26+(i%4)*506;y=118+(i//4)*477
 d.rounded_rectangle((x,y,x+490,y+457),radius=14,fill='#203e54')
 thumb=im.resize((490,351),Image.Resampling.LANCZOS);out.paste(thumb,(x,y+46))
 d.text((x+14,y+11),biome,font=font(19,True),fill='#f4fcff');d.text((x+14,y+406),title,font=font(18,True),fill='#ffffff');d.text((x+14,y+432),note,font=font(12),fill='#bbdbea')

 draw=ImageDraw.Draw(im);draw.rectangle((0,0,1200,54),fill='#152a3b');draw.text((18,12),f'OFFLINE • {biome} • {title}',font=font(23,True),fill='#ffffff')
 draw.rectangle((0,826,1200,860),fill='#152a3b');draw.text((18,835),'Actual hazard geometry. Source-sampled road context. Blender lighting; no browser/WebGL/mobile validation.',font=font(14),fill='#c6dfed');im.save(HERE/f'{file}-offline.jpg',quality=90,subsampling=0,optimize=True)
x=26+3*506;y=118+477
d.rounded_rectangle((x,y,x+490,y+457),radius=14,fill='#203e54')
d.text((x+24,y+26),'Small, bounded render cost',font=font(24,True),fill='#ffffff')
for j,line in enumerate(['25 hazards; five per biome','Six shared instanced pools','Two merged soft-patch meshes','2,054 triangles while rocks idle','Existing 128 × 128 checker tile','No raised stud geometry','No external models or physics engine']):d.text((x+24,y+85+j*37),line,font=font(19),fill='#c6dfed')
d.text((31,1091),'Ground alignment, collider footprints, bounded state changes and disposal are covered by actual-Three offline tests.',font=font(20),fill='#c6dfed')
d.text((31,1127),'These are offline diagnostic views. Live browser, GPU shader, Android and frame-rate verification remain untested.',font=font(18),fill='#9bbace')
out.save(HERE/'five-biome-hazards-offline.jpg',quality=90,subsampling=0,optimize=True)
print(HERE/'five-biome-hazards-offline.jpg')
