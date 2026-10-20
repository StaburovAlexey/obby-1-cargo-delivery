#!/usr/bin/env python3
"""Decode the unchanged GLB palette and shipping WebPs for Blender QA input."""
from pathlib import Path
from io import BytesIO
from PIL import Image
import struct,json,sys
root=Path(__file__).resolve().parents[1]
out=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/tmp/livery-render');out.mkdir(parents=True,exist_ok=True)
blob=(root/'dist/assets/vehicles/cosmo/coupe.glb').read_bytes();size=struct.unpack_from('<I',blob,12)[0]
gltf=json.loads(blob[20:20+size]);binary=blob[28+size:]
view=gltf['bufferViews'][gltf['images'][0]['bufferView']];start=view.get('byteOffset',0)
palette=Image.open(BytesIO(binary[start:start+view['byteLength']])).convert('RGB')
assert palette.size==(1000,720)
(out/'palette.json').write_text(json.dumps([[palette.getpixel((x*40+20,y*40+20)) for x in range(25)]for y in range(18)]))
count=0
for source in (root/'dist/assets/liveries').glob('*/*.webp'):
 image=Image.open(source);assert image.size==(1024,1024)
 image.save(out/f'{source.parent.name}-{source.stem}.png');count+=1
assert count==44,f'Expected 44 runtime atlases, found {count}'
print(f'Prepared original palette + {count} atlas PNGs in {out}')
