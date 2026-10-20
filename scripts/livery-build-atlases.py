from PIL import Image,ImageOps
from pathlib import Path
import json,hashlib,shutil
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'dist/assets/liveries';render=ROOT/'renders';render.mkdir(exist_ok=True)
cars=list(zip(['pickup','citycourier','rover','foresthauler','van','desertscout','snowgrip','snowrunner','lavacrawler','ashhauler','bmwreward'],['coupe','police','jeep','van','kamaro','ghini','rally','armor','lamb','fenyr','bmw-g80-m3']))
BANDS=[[0,221,444,666,887],[0,221,447,665,887],[0,221,481,667,887],[0,200,469,668,887],[0,222,446,665,887],[0,205,447,615,793],[0,221,446,665,887],[0,200,425,593,793],[0,239,502,700,941],[0,221,458,674,887],[0,197,407,587,793]]
EXTENTS={'bmwreward': [3.1434353477769816, 2.1085488628630866, 7.947018540648664], 'ashhauler': [3.9171799261680924, 1.6771565428052995, 8.64], 'lavacrawler': [3.866636491127901, 2.0801339142332727, 8.457390272001804], 'snowrunner': [4.149532847370322, 2.867493330707057, 8.560571398488047], 'snowgrip': [4.242324486496386, 2.853539255430704, 8.542034875678526], 'desertscout': [3.2665243090104066, 1.445796821549537, 8.487957360099806], 'van': [3.5641289143802712, 2.022542080432614, 8.477717653391291], 'foresthauler': [3.613555601170251, 2.4257229852478663, 8.584561095710704], 'rover': [3.541052377590009, 2.777618688952367, 7.641902859890664], 'citycourier': [2.9042432593367358, 1.9199258750775574, 8.15568017590795], 'pickup': [3.282318517140334, 2.3575826142865637, 8.637481466087337]}
layout={'left':[0,0,1024,256],'right':[0,256,1024,256],'top':[0,512,512,512],'front':[512,512,512,256],'rear':[512,768,512,256]}
m={'schemaVersion':1,'size':[1024,1024],'variants':['neon','anime','racing','biome'],'layout':layout,'notes':['44 individually illustrated designs. English text only. Original fictional characters. Existing runtime UVs and paint masks retained.'],'files':[]}
for i,(car,model) in enumerate(cars,1):
 extent=EXTENTS[car]
 sheet=Image.open(ROOT/f'scripts/livery-source-art/{i:02}.png').convert('RGB');sw,sh=sheet.size
 for j,variant in enumerate(m['variants']):
  band=sheet.crop((0,BANDS[i-1][j]+3,sw,BANDS[i-1][j+1]-3))
  if car=='ashhauler' and variant=='racing':
   # Select clean authored regions, excluding overlapping anime torso.
   left=band.crop((0,0,500,band.height));right=band.crop((1050,0,sw,band.height))
   band=Image.new('RGB',(left.width+right.width,band.height));band.paste(left,(0,0));band.paste(right,(left.width,0))
  bw=band.width
  atlas=Image.new('RGB',(1024,1024))
  for name,(x,y,w,h) in layout.items():
   if name in ('left','right'):
    if variant in ('anime','racing'):
     # Keep character proportions and put artwork below the window line.
     bg=band.crop((0,0,int(bw*(.12 if variant=='racing' else .22)),band.height));tile=bg.resize((w,h),Image.Resampling.LANCZOS)
     ah=round(band.height/bw*w*(extent[2]/extent[1])/4)
     safe_words=car in ('citycourier','snowrunner','foresthauler') and variant=='racing'
     aw=(480 if safe_words else 640) if variant=='racing' else w
     if aw!=w:ah=round(ah*aw/w)
     art=band.resize((aw,ah),Image.Resampling.LANCZOS);tile.paste(art,((w-aw)//2,h-ah-(64 if safe_words else 32) if aw!=w else h-ah))
    else:tile=band.resize((w,h),Image.Resampling.LANCZOS)
   elif name=='top':
    # Hood graphics have their own placement; no mirrored glyphs.
    bg=band.crop((0,0,int(bw*(.12 if variant=='racing' else .24)),band.height));tile=ImageOps.fit(bg,(w,h))
    crop=band.crop((bw*.31,0,bw*.69,band.height))
    art=crop.resize((w,90 if variant=='anime' else 180),Image.Resampling.LANCZOS)
    if variant!='racing':tile.paste(art,(0,h-art.height-22))
   else:
    # Lamps/grilles never repeat a face or racing wordmark.
    edge=band.crop((0,0,int(bw*(.12 if variant=='racing' else .20)),band.height));tile=edge.resize((w,h),Image.Resampling.LANCZOS)
   atlas.paste(tile,(x,y))
  p=OUT/car/f'{variant}.webp';p.parent.mkdir(parents=True,exist_ok=True);atlas.save(p,'WEBP',quality=90,method=6)
  atlas.save(render/f'{car}-{variant}.png')
  data=p.read_bytes();m['files'].append({'vehicleId':car,'model':model,'variant':variant,'file':str(p.relative_to(OUT)),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
for p in Path('/tmp/livery-render').glob('*.json'):shutil.copy2(p,render/p.name)
(OUT/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
print(len(m['files']),sum(f['bytes'] for f in m['files']))
