"""Offline SVG diagnostic. Reuses runtime paths; does not render a browser UI."""
from pathlib import Path
import ctypes as C
import ctypes.util
import html
import json
import re
from PIL import ImageFont

HERE = Path(__file__).resolve().parent
SITE = HERE.parent.parent
state = json.loads((HERE / 'progression-hud-state.json').read_text())
source = (SITE / 'dist/index.html').read_text()
symbols = dict(re.findall(r'<symbol\b[^>]*id="([^"]+)"[^>]*>(.*?)</symbol>', source, re.S))
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="1000" viewBox="0 0 1120 1000">']

def rect(x,y,w,h,fill,rx=0,stroke='none',sw=0):
    svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" rx="{rx}" stroke="{stroke}" stroke-width="{sw}"/>')
def text(x,y,s,size=14,fill='#fffdf3',anchor='start',outline=False):
    stroke=' stroke="#14213d" stroke-width="2" paint-order="stroke fill"' if outline else ''
    svg.append(f'<text x="{x}" y="{y}" font-family="DejaVu Sans" font-weight="bold" font-size="{size}" fill="{fill}" text-anchor="{anchor}"{stroke}>{html.escape(str(s))}</text>')
def icon(name,x,y,size):
    svg.append(f'<g transform="translate({x} {y}) scale({size/64})">{symbols["hud-"+name]}</g>')
def wrapped(x,y,s,width,size=11,fill='#fffdf3',line=15,anchor='start'):
    font=ImageFont.truetype(FONT,size)
    lines=[]; current=''
    for word in s.split():
        candidate=(current+' '+word).strip()
        if font.getlength(candidate)>width and current: lines.append(current); current=word
        else: current=candidate
    if current: lines.append(current)
    for i,row in enumerate(lines):text(x,y+i*line,row,size,fill,anchor)
    return len(lines)*line

rect(0,0,1120,1000,'#152b48')
text(32,42,'PROGRESSION / NATIVE SVG SPECIMEN',25)
text(32,67,'Offline diagnostic: runtime SVG paths and actual app-fixture state. Illustrative layout.',13,'#a8c3e7')
text(32,90,'Not a browser screenshot. No GPU, Android, or physical-touchscreen verification.',12,'#a8c3e7')
rect(30,115,1060,240,'#254969',17)
text(48,142,'Five school labels',15)
text(735,141,'Brain HUD',13,'#a8c3e7')
icon('brain',865,119,65);text(940,164,state['brains'],36,outline=True)
notes=['Free / owned','Purchased / owned','Locked / affordable','Locked / insufficient','Locked / insufficient']
for i,school in enumerate(state['schools']):
    x=135+i*211;y=178
    icon('school',x-29,y,58)
    rate_width=ImageFont.truetype(FONT,18).getlength(school['rateText'])
    unit_width=ImageFont.truetype(FONT,13.2).getlength('/сек')
    start=x-(34+3+rate_width+3+unit_width)/2
    icon('brain',start,y+61,34)
    text(start+37,y+85,school['rateText'],18,outline=True)
    text(start+40+rate_width,y+84,'/сек',13.2,outline=True)
    color='#ffe380' if school['affordable'] else '#ff9b92'
    if not school['owned']:
        price_width=ImageFont.truetype(FONT,12).getlength(school['priceText'])
        start=x-(21+3+21+3+price_width)/2
        icon('lock',start,y+95,21);icon('money',start+24,y+95,21)
        text(start+48,y+112,school['priceText'],12,color,outline=True)
    text(x,340,notes[i],10,'#aec9df','middle')

text(35,390,'Desktop card states / 610 px panel',15)
rect(35,406,610,373,'#5143ac',22,'#14213d',4)
text(340,438,'Улучшения машины',24,anchor='middle',outline=True)
text(340,463,state['car'],17,'#fff188','middle')
text(340,483,'Покупка за мозги. Улучшается только эта машина.',12,anchor='middle')
for i,upgrade in enumerate(state['upgrades']):
    x=53+i*194; y=502; w=186
    rect(x,y,w,196,'#183d83',15,'#14213d',3)
    icon(upgrade['id'],x+w/2-22,y+10,44)
    text(x+w/2,y+73,upgrade['name'],15,anchor='middle')
    text(x+w/2,y+93,upgrade['level'],12,'#bfd4ff','middle')
    text(x+w/2,y+114,upgrade['value'],15,'#fbf2bd','middle')
    wrapped(x+w/2,y+132,upgrade['description'],w-18,10,line=13,anchor='middle')
    rect(x+10,y+161,w-20,28,'#566473' if upgrade['disabled'] else '#209c50',10,'#14213d',3)
    icon('brain',x+w/2-29,y+160,29);text(x+w/2+5,y+182,upgrade['price'],16,'#d2d9e2' if upgrade['disabled'] else '#fff')
rect(53,718,574,46,'#db5367',13,'#14213d',3);text(340,748,'Закрыть',16,anchor='middle',outline=True)
text(45,804,'MAX / insufficient brains / available',12,'#a8c3e7')
text(45,825,'Purchased school access rows disappear on the next app frame.',12,'#a8c3e7')

text(725,390,'Narrow card study / 320 px',15)
rect(725,406,320,449,'#5143ac',22,'#14213d',4)
text(885,437,'Улучшения машины',20,anchor='middle',outline=True)
text(885,462,state['car'],17,'#fff188','middle')
wrapped(885,481,'Покупка за мозги. Улучшается только эта машина.',284,11,line=14,anchor='middle')
for i,upgrade in enumerate(state['upgrades']):
    x=743;y=518+i*91;w=284
    rect(x,y,w,83,'#183d83',15,'#14213d',3)
    icon(upgrade['id'],x+8,y+21,38)
    text(x+53,y+18,upgrade['name'],12)
    text(x+w-50,y+18,upgrade['level'],11,'#bfd4ff','middle')
    wrapped(x+53,y+37,upgrade['value'],125,13,'#fbf2bd',line=15)
    wrapped(x+53,y+67,upgrade['description'],125,8,line=10)
    rect(x+w-93,y+25,85,50,'#566473' if upgrade['disabled'] else '#209c50',13,'#14213d',3)
    price_width=ImageFont.truetype(FONT,13).getlength(upgrade['price'])
    start=x+w-50.5-(23+3+price_width)/2
    icon('brain',start,y+38,23);text(start+26,y+55,upgrade['price'],13,'#d2d9e2' if upgrade['disabled'] else '#fff')
rect(743,802,284,40,'#db5367',13,'#14213d',3);text(885,828,'Закрыть',15,anchor='middle',outline=True)

text(35,878,'Source symbols at 47 px',14)
for i,name in enumerate(['school','brain','lock','money','upgrade','speed','handling','grip']):
    x=59+i*138;icon(name,x,895,47);text(x+23.5,962,name,11,'#a8c3e7','middle')
text(35,989,'Generated from dist/index.html plus qa/learning/progression-hud-state.json. Static native librsvg rasterization.',11,'#8eafcf')
svg.append('</svg>')
output=('\n'.join(svg)).encode()
(HERE/'progression-hud-specimen.svg').write_bytes(output)

# CPU-only native SVG rasterization. No browser, network, server, or GPU needed.
rsvg=C.CDLL(ctypes.util.find_library('rsvg-2'))
cairo=C.CDLL(ctypes.util.find_library('cairo'))
gobj=C.CDLL(ctypes.util.find_library('gobject-2.0'))
rsvg.rsvg_handle_new_from_data.argtypes=[C.c_void_p,C.c_size_t,C.POINTER(C.c_void_p)]
rsvg.rsvg_handle_new_from_data.restype=C.c_void_p
rsvg.rsvg_handle_render_cairo.argtypes=[C.c_void_p,C.c_void_p]
rsvg.rsvg_handle_render_cairo.restype=C.c_int
cairo.cairo_image_surface_create.argtypes=[C.c_int,C.c_int,C.c_int]
cairo.cairo_image_surface_create.restype=C.c_void_p
cairo.cairo_create.argtypes=[C.c_void_p];cairo.cairo_create.restype=C.c_void_p
cairo.cairo_surface_write_to_png.argtypes=[C.c_void_p,C.c_char_p]
cairo.cairo_surface_write_to_png.restype=C.c_int
cairo.cairo_destroy.argtypes=[C.c_void_p]
cairo.cairo_surface_destroy.argtypes=[C.c_void_p]
gobj.g_object_unref.argtypes=[C.c_void_p]
err=C.c_void_p();data=C.create_string_buffer(output)
handle=rsvg.rsvg_handle_new_from_data(data,len(output),C.byref(err))
assert handle,'Native SVG parser failed'
surface=cairo.cairo_image_surface_create(0,1120,1000);context=cairo.cairo_create(surface)
assert rsvg.rsvg_handle_render_cairo(handle,context),'Native SVG renderer failed'
assert cairo.cairo_surface_write_to_png(surface,str(HERE/'progression-hud-specimen.png').encode())==0
cairo.cairo_destroy(context);cairo.cairo_surface_destroy(surface);gobj.g_object_unref(handle)
print(HERE/'progression-hud-specimen.png')
