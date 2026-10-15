"""Reproducible OFFLINE Blender views of actual final Three.js hazard triangles.
Not a browser/WebGL/mobile screenshot; Blender lighting is diagnostic only.
Run blender -b -t 4 -P qa/road-hazards/render-offline.py
"""
from pathlib import Path
import bpy, json, math, sys
from mathutils import Vector
HERE=Path(__file__).resolve().parent
DATA=json.loads((HERE/'geometry.json').read_text())
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=False
scene.render.resolution_x=1200;scene.render.resolution_y=860;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.world.color=(.55,.65,.8)
scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast'
scene.view_settings.exposure=0;scene.view_settings.gamma=1
world=scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.63,.75,.91,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
bpy.ops.object.light_add(type='AREA',location=(-16,-15,30));key=bpy.context.object;key.name='Offline soft key';key.data.energy=4500;key.data.shape='DISK';key.data.size=18
bpy.ops.object.light_add(type='AREA',location=(18,20,20));bpy.context.object.data.energy=2100;bpy.context.object.data.size=15
bpy.ops.object.camera_add(location=(21,-31,29));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=40
camera.rotation_euler=(Vector((0,0,3))-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
objects=[]
def material(part):
 m=bpy.data.materials.new(part['name']);m.use_nodes=True;n=m.node_tree.nodes;links=m.node_tree.links;bsdf=n.get('Principled BSDF')
 bsdf.inputs['Base Color'].default_value=(*part.get('color',[1,1,1]),1)
 bsdf.inputs['Roughness'].default_value=part.get('roughness',.8);bsdf.inputs['Metallic'].default_value=part.get('metalness',0)
 if part.get('emissive'):
  bsdf.inputs['Emission Color'].default_value=(*part['emissive'],1);bsdf.inputs['Emission Strength'].default_value=part.get('emissiveIntensity',0)
 color=None
 if part.get('colors'):
  attr=n.new('ShaderNodeVertexColor');attr.layer_name='Actual vertex colors';color=attr.outputs['Color']
 if part.get('checker') or part.get('texture'):
  tex=n.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(HERE/part.get('texture','checker.ppm')),check_existing=True);tex.extension='REPEAT';tex.interpolation='Linear'
  if color:
   mult=n.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=1;links.new(color,mult.inputs[1]);links.new(tex.outputs['Color'],mult.inputs[2]);color=mult.outputs[0]
  else:color=tex.outputs['Color']
 if color:
  mult=n.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=1;mult.inputs[2].default_value=(*part.get('color',[1,1,1]),1);links.new(color,mult.inputs[1]);links.new(mult.outputs[0],bsdf.inputs['Base Color'])
 if part.get('opacity',1)<1:

  transparent=n.new('ShaderNodeBsdfTransparent');mix=n.new('ShaderNodeMixShader');mix.inputs[0].default_value=part['opacity'];links.new(transparent.outputs[0],mix.inputs[1]);links.new(bsdf.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],n.get('Material Output').inputs['Surface'])
 return m
selected=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
for entry in DATA['scenes']:
 if selected and entry['type'] not in selected:continue
 for obj in objects:bpy.data.objects.remove(obj,do_unlink=True)
 objects=[]
 origin=(entry['roadCenter'],entry['height'],entry['hazard']['z'])
 for part in entry['parts']:
  vertices=[(v[0]-origin[0],-(v[2]-origin[2]),v[1]-origin[1]) for v in part['vertices']]
  mesh=bpy.data.meshes.new(part['name']);mesh.from_pydata(vertices,[],part['faces']);mesh.update();obj=bpy.data.objects.new(part['name'],mesh);scene.collection.objects.link(obj);objects.append(obj);obj.data.materials.append(material(part))
  if part.get('uv'):
   uv=mesh.uv_layers.new(name='Actual UVs')
   for face in mesh.polygons:
    for loop in face.loop_indices:uv.data[loop].uv=part['uv'][mesh.loops[loop].vertex_index]
  if part.get('colors'):
   colors=mesh.color_attributes.new(name='Actual vertex colors',type='FLOAT_COLOR',domain='CORNER')
   for face in mesh.polygons:
    for loop in face.loop_indices:colors.data[loop].color=(*part['colors'][mesh.loops[loop].vertex_index],1)
 scene.render.filepath=str(HERE/f"{entry['type']}-{entry['phase']}-offline.png")
 bpy.ops.render.render(write_still=True)
print('Offline views rendered from actual source triangles. No browser was used.')
