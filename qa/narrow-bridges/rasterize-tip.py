"""Rasterize the generated offline SVG using Pillow, without a browser/GPU."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import xml.etree.ElementTree as E
folder=Path(__file__).parent
root=E.parse(folder/'directional-tip-poses.svg').getroot()
im=Image.new('RGB',(1800,1160),'white'); d=ImageDraw.Draw(im)
for e in root.iter():
 t=e.tag.split('}')[-1];a=e.attrib
 if t=='rect':d.rectangle((float(a.get('x',0)),float(a.get('y',0)),float(a.get('x',0))+float(a['width']),float(a.get('y',0))+float(a['height'])),fill=a.get('fill','black'))
 if t=='polygon':d.polygon([tuple(map(float,v.split(','))) for v in a['points'].split()],fill=a['fill'])
 if t=='text':d.text((float(a['x']),float(a['y'])-float(a.get('font-size',16))),e.text,fill='black',font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',int(a.get('font-size',16))))
im.save(folder/'directional-tip-poses.png')
