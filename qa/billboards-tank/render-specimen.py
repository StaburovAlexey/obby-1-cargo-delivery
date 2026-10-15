"""Offline native SVG specimen using the actual runtime symbols. Not a browser frame."""
from pathlib import Path
import re, html, ctypes as C, ctypes.util
HERE=Path(__file__).resolve().parent
source=(HERE.parent.parent/'dist/index.html').read_text()
symbols=dict(re.findall(r'<symbol\b[^>]*id="([^"]+)"[^>]*>(.*?)</symbol>',source,re.S))
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="650" viewBox="0 0 1200 650">']
def rect(x,y,w,h,fill,rx=0):svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"/>')
def text(x,y,t,size=18,c='#fff',anchor='start'):svg.append(f'<text x="{x}" y="{y}" fill="{c}" font-family="DejaVu Sans" font-size="{size}" font-weight="bold" text-anchor="{anchor}">{html.escape(str(t))}</text>')
def icon(name,x,y,size):svg.append(f'<g transform="translate({x} {y}) scale({size/64})">{symbols['hud-'+name]}</g>')
rect(0,0,1200,650,'#162d49');text(28,40,'STABLE BILLBOARDS + TANK UPGRADE',26)
text(28,68,'Offline native SVG diagnostic. Actual runtime symbols; illustrative layout, not Android/WebGL.',13,'#adc8e4')
rect(28,95,634,336,'#294b67',20);text(50,125,'Same 120 × 128 composition at every yaw',18)
for x,label in [(76,'FRONT'),(274,'SIDE'),(472,'BACK')]:
 y=166;rect(x,y,120,128,'#203d59',8);icon('school',x+31,y,58);icon('brain',x+21,y+62,34);text(x+57,y+86,'3',18);text(x+73,y+86,'/сек',13)
 icon('lock',x+13,y+104,21);icon('money',x+37,y+104,21);text(x+61,y+121,'1500',12,'#ffe380');text(x+60,330,label,15,'#fff','middle')
text(50,370,'One viewport scale. Price space stays reserved after purchase.',12,'#b4cbe4')
text(50,395,'The whole composition floats together; no angle-based shrinking.',12,'#b4cbe4')
rect(686,95,486,336,'#5143ac',20);text(929,130,'Четвёртое улучшение: БАК',23,'#fff','middle');icon('fuel',705,165,82)
text(824,190,'100 → 102',32,'#fff1ac');text(824,221,'Уровень 1 / 3 · +2% объёма',16)
text(711,269,'Расход на метр прежний. При покупке',16);text(711,292,'топливо не добавляется.',16)
rect(710,326,437,62,'#1da851',15);icon('brain',839,337,38);text(892,365,'20',24)
rect(28,451,1144,165,'#294b67',18);text(49,481,'Matching bare prices / lower anchors',18)
icon('money',55,513,44);text(111,545,'250',30);text(55,588,'Unowned skin: icon + price',13,'#b4cbe4')
icon('money',390,513,44);text(446,545,'900',30);text(390,588,'Unowned car: same style',13,'#b4cbe4')
text(736,531,'Owned skin / car:',18);text(736,558,'no floating price label',18);text(736,588,'All three price anchors lowered by 0.4 m',12,'#b4cbe4')
svg.append('</svg>');output=''.join(svg).encode();(HERE/'billboard-tank-specimen.svg').write_bytes(output)


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
surface=cairo.cairo_image_surface_create(0,1200,650);context=cairo.cairo_create(surface)
assert rsvg.rsvg_handle_render_cairo(handle,context),'Native SVG renderer failed'
assert cairo.cairo_surface_write_to_png(surface,str(HERE/'billboard-tank-specimen.png').encode())==0
cairo.cairo_destroy(context);cairo.cairo_surface_destroy(surface);gobj.g_object_unref(handle)
print(HERE/'billboard-tank-specimen.png')
