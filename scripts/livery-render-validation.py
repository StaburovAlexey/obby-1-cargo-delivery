#!/usr/bin/env python3
"""Blender CPU render of the actual Node-exported runtime geometry and livery UVs.
blender -b -t 4 --python scripts/livery-render-validation.py -- /tmp/livery-render [pickup,bmwreward]
Not a WebGL/GPU compilation test. Emits an inspectable render for each selected car and variant.
"""
import bpy, json, sys, math, os
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:]
folder=Path(args[0]);ids=args[1].split(',') if len(args)>1 else [p.stem for p in folder.glob('*.json') if p.stem!='palette']
variants=args[2].split(',') if len(args)>2 else ['neon','anime','racing','biome']
view=args[3] if len(args)>3 else 'front-left'
# Palette is decoded in preprocessing because Blender's Python lacks Pillow.
palette=json.loads((folder/'palette.json').read_text())
def srgb(c):return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4
def shade_material(name, color, metallic=.1, roughness=.4, emission=None):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Metallic'].default_value=metallic;n.inputs['Roughness'].default_value=roughness
 if emission and max(emission)>0:n.inputs['Emission Color'].default_value=(*emission,1)
 return m

def light(name,location,power,size):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=location;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()

for vehicle in ids:
 data=json.loads((folder/f'{vehicle}.json').read_text());root=Path(data['root'])
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 for mat in list(bpy.data.materials):bpy.data.materials.remove(mat)
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=False
 scene.render.resolution_x=640;scene.render.resolution_y=454;scene.render.resolution_percentage=100
 scene.world.color=(.16,.19,.23);scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast';scene.view_settings.exposure=0;scene.view_settings.gamma=1
 mats={};paint=shade_material('Livery body',(1,1,1),.2,.38);bsdf=paint.node_tree.nodes.get('Principled BSDF');tex=paint.node_tree.nodes.new('ShaderNodeTexImage');paint.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
 if os.environ.get('LIVERY_FLAT')=='1':
  emission=paint.node_tree.nodes.new('ShaderNodeEmission');paint.node_tree.links.new(tex.outputs['Color'],emission.inputs['Color']);paint.node_tree.links.new(emission.outputs[0],paint.node_tree.nodes.get('Material Output').inputs['Surface'])
 for source in data['meshes']:
  mesh=bpy.data.meshes.new(source['name']);verts=[(x,-z,y) for x,y,z in source['vertices']];mesh.from_pydata(verts,[],[f['vertices'] for f in source['faces']]);mesh.update()
  obj=bpy.data.objects.new(source['name'],mesh);bpy.context.collection.objects.link(obj)
  uv_layer=mesh.uv_layers.new(name='ActualRuntimeLiveryUV');obj.data.materials.append(paint)
  material_ids={}
  for polygon,face in zip(mesh.polygons,source['faces']):
   for loopindex,vertex in zip(polygon.loop_indices,face['vertices']):u,v=source['liveryUVs'][vertex];uv_layer.data[loopindex].uv=(u,1-v)
   if face['livery']:polygon.material_index=0;continue
   original=source['materials'][face['material']];color=original['color'];emission=[e*original['emissiveIntensity'] for e in original['emissive']]
   if original['palette'] or original.get('emissivePalette'):
    u=sum(source['uvs'][i][0] for i in face['vertices'])/3;v=sum(source['uvs'][i][1] for i in face['vertices'])/3
    col=palette[min(17,int(v*18))][min(24,int(u*25))];hexcol=(col[0]<<16)+(col[1]<<8)+col[2]
    for a,b in original['remap']:
     if hexcol==a:col=[(b>>16)&255,(b>>8)&255,b&255]
    if original['palette']:color=[srgb(c/255)*color[k] for k,c in enumerate(col)]
    if original.get('emissivePalette'):emission=[srgb(c/255)*emission[k] for k,c in enumerate(col)]
   key=tuple(round(c,5) for c in color)+tuple(round(c,5) for c in emission)+(original['metalness'],original['roughness'])
   if key not in mats:mats[key]=shade_material(original['name'],color,original['metalness'],original['roughness'],emission)
   if key not in material_ids:material_ids[key]=len(obj.data.materials);obj.data.materials.append(mats[key])
   polygon.material_index=material_ids[key]
  try:mesh.normals_split_custom_set_from_vertices([(x,-z,y) for x,y,z in source['normals']]);mesh.use_auto_smooth=True
  except AttributeError:pass
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,0));floor=bpy.context.object;floor.data.materials.append(shade_material('Studio floor',(.035,.055,.083),.1,.64))
 light('Key',(-6,7,12),1800,8);light('Fill',(7,4,7),1200,7);light('Rim',(3,-7,9),2000,6)
 camd=bpy.data.cameras.new('Camera');cam=bpy.data.objects.new('Camera',camd);bpy.context.collection.objects.link(cam);cam.location=((-11,13,9) if view=='front-left' else (11,13,7) if view=='front-right' else (11,-13,7));target=Vector((0,0,1.1));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camd.type='ORTHO';camd.ortho_scale=12;scene.camera=cam
 for variant in variants:
  image=bpy.data.images.load(str(folder/f'{vehicle}-{variant}.png'),check_existing=True);tex.image=image
  bsdf.inputs['Metallic'].default_value=.7 if variant=='biome' and vehicle=='bmwreward' else .2
  bsdf.inputs['Roughness'].default_value=.27 if variant=='biome' and vehicle=='bmwreward' else .38
  suffix=('' if view=='front-left' else f'-{view}')+('-unlit' if os.environ.get('LIVERY_FLAT')=='1' else '');scene.render.filepath=str(folder/f'{vehicle}-{variant}{suffix}-render.png');bpy.ops.render.render(write_still=True)
