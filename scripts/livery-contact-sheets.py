#!/usr/bin/env python3
"""Create compact review sheets from real runtime-UV CPU renders. No concept images used."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import sys
source=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/tmp/livery-render')
out=Path(__file__).resolve().parents[1]/'docs/liveries';out.mkdir(parents=True,exist_ok=True)
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';bold='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def ft(n,b=False):return ImageFont.truetype(bold if b else font,n)
cars=[('pickup','01 Pickup / coupe'),('citycourier','02 City Courier / police'),('rover','03 Rover / jeep'),('foresthauler','04 Forest Hauler / van'),('van','05 Van / kamaro'),('desertscout','06 Desert Scout / ghini'),('snowgrip','07 Snow Grip / rally'),('snowrunner','08 Snow Runner / armor'),('lavacrawler','09 Lava Crawler / lamb'),('ashhauler','10 Ash Hauler / fenyr'),('bmwreward','11 BMW Reward')]
variants=['neon','anime','racing','biome'];w=320;h=227;row=h+32
for page,start in enumerate(range(0,len(cars),3),1):
 items=cars[start:start+3];sheet=Image.new('RGB',(w*4,80+row*len(items)), '#111c2b');d=ImageDraw.Draw(sheet)
 d.text((18,12),'ACTUAL MODEL + RUNTIME UV VALIDATION',font=ft(20,True),fill='#f0f4f8')
 d.text((18,39),'Blender CPU render | 1024px atlases | Source geometry, windows and wheels retained',font=ft(13),fill='#9daebe')
 for col,v in enumerate(variants):d.text((col*w+12,62),f'{chr(65+col)}  {v.upper()}',font=ft(14,True),fill='#70d4ed')
 for j,(id,label) in enumerate(items):
  y=80+j*row;d.rectangle((0,y,w*4,y+31),fill='#1b2a3c');d.text((12,y+7),label,font=ft(16,True),fill='#f2f4f7')
  for col,v in enumerate(variants):sheet.paste(Image.open(source/f'{id}-{v}-render.png').convert('RGB').resize((w,h),Image.Resampling.LANCZOS),(col*w,y+32))
 sheet.save(out/f'contact-sheet-{page:02}.jpg',quality=89,subsampling=0,optimize=True)
proof=[('bmwreward-racing-front-right-render.png','BMW right: correct 11 / APEX direction'),('foresthauler-racing-front-right-render.png','Van right: correct 04 / APEX direction'),('foresthauler-biome-front-right-render.png','Van right: FOREST reads normally'),('foresthauler-anime-front-right-unlit-render.png','Van right unlit: portrait is continuous'),('bmwreward-biome-rear-right-render.png','BMW rear-right: body and lamps preserved'),('foresthauler-biome-rear-right-render.png','Van rear-right: text and protected trim')]
w=480;h=340;sheet=Image.new('RGB',(w*2,(h+34)*3+50),'#111c2b');d=ImageDraw.Draw(sheet);d.text((16,13),'OPPOSITE-SIDE / CONTINUITY CHECKS',font=ft(21,True),fill='white')
for i,(file,label) in enumerate(proof):
 x=i%2*w;y=50+(i//2)*(h+34);d.text((x+9,y+8),label,font=ft(15),fill='#dbe8f2');sheet.paste(Image.open(source/file).convert('RGB').resize((w,h),Image.Resampling.LANCZOS),(x,y+34))
sheet.save(out/'right-side-proof.jpg',quality=91,subsampling=0,optimize=True)
print('Saved compact sheets:',*[str(p) for p in out.glob('*.jpg')],sep='\n')
