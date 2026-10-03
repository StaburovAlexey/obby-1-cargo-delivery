"""Render actual exported Three.js vertices offline; no browser/WebGL claim.
Run: blender -b -t 4 -P qa/network-scene/render-offline.py
"""
from pathlib import Path
import bpy,json,math,sys
from mathutils import Vector
OUTPUT=Path(__file__).resolve().parent
ROOT=Path(__file__).resolve().parents[3]/'route-hills-diagnostics'
DATA=json.loads((ROOT/'geometry.json').read_text())
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=False
scene.render.resolution_x=1300;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast'
scene.world.use_nodes=True;bg=scene.world.node_tree.nodes['Background'];bg.inputs['Color'].default_value=(.48,.68,.9,1);bg.inputs['Strength'].default_value=.7
bpy.ops.object.light_add(type='SUN',location=(-50,-50,120));sun=bpy.context.object;sun.data.energy=2.3;sun.rotation_euler=(.35,-.35,-.4);sun.data.angle=.09
bpy.ops.object.camera_add();camera=bpy.context.object;camera.data.type='ORTHO';scene.camera=camera
objects=[]
def material(part):
 m=bpy.data.materials.new(part['name']);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;bsdf=n.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.84
 color=None
 if part.get('colors'):
  attr=n.new('ShaderNodeVertexColor');attr.layer_name='Source colors';color=attr.outputs['Color']
 if part.get('checker') or part.get('texture'):
  tex=n.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(ROOT/part.get('texture','checker.ppm')),check_existing=True);tex.extension='REPEAT';tex.interpolation='Linear'
  if color:
   mul=n.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1;l.new(color,mul.inputs[1]);l.new(tex.outputs['Color'],mul.inputs[2]);color=mul.outputs[0]
  else:color=tex.outputs['Color']
 if color:l.new(color,bsdf.inputs['Base Color'])
 return m
selected=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
for entry in DATA['scenes']:
 if selected and entry['id'] not in selected:continue
 for obj in objects:bpy.data.objects.remove(obj,do_unlink=True)
 objects=[];origin=entry['origin']
 for p in entry['parts']:
  if not p['faces']:continue
  verts=[(v[0]-origin[0],-(v[2]-origin[2]),v[1]-origin[1]) for v in p['vertices']]
  mesh=bpy.data.meshes.new(p['name']);mesh.from_pydata(verts,[],p['faces']);mesh.update();obj=bpy.data.objects.new(p['name'],mesh);scene.collection.objects.link(obj);objects.append(obj);mesh.materials.append(material(p))
  uv=mesh.uv_layers.new(name='Source UVs')
  for poly in mesh.polygons:
   for loop in poly.loop_indices:uv.data[loop].uv=p['uv'][mesh.loops[loop].vertex_index]
  if p.get('colors'):
   color=mesh.color_attributes.new(name='Source colors',type='FLOAT_COLOR',domain='CORNER')
   for poly in mesh.polygons:
    for loop in poly.loop_indices:color.data[loop].color=(*p['colors'][mesh.loops[loop].vertex_index],1)
 camera.location=entry['camera'];camera.rotation_euler=(Vector(entry.get('target',[0,0,3]))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type=entry.get('projection','ORTHO');camera.data.lens=entry.get('lens',45);camera.data.ortho_scale=entry['ortho'];camera.data.clip_end=10000
 scene.render.resolution_x,scene.render.resolution_y=entry.get('resolution',[1300,900]);scene.render.filepath=str(OUTPUT/(entry['id']+'-offline.png'));bpy.ops.render.render(write_still=True)
print('Finished offline actual Three.js geometry diagnostics. No browser used.')
