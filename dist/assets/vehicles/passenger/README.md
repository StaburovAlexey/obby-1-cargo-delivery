# Passenger vehicles

Rebuild from the original local source with Python 3 and Pillow:

```sh
python3 scripts/prepare-passenger-vehicles.py
```

Use `--preview-sheet /tmp/passenger-vehicles.png` for a textured orientation
contact sheet. No Blender, decoder extension or NumPy is required.

Each GLB faces +Z with +Y up, X wheel axles, centered X/Z bounds and Y=0 ground.
The root contains Body, Glass, Optics, and four wheel groups named Wheel1
through Wheel4 (front-left, front-right, rear-left, rear-right). Wheel geometry
is centered under each group. SUV Trim remains inside its wheel group and uses
Passenger Wheel Trim, which must remain unpainted. Only Passenger Body is
paintable. Original topology, UVs and material PBR settings are retained.

Body color/metallic-roughness maps are at most 512x512; wheel and shared optics
maps are at most 256x256. All images are PNG; color maps use 256-color palettes
and PBR data maps stay RGB. Texture names and the
passengerTextureHash extra identify byte-identical resized images for sharing.
The manifest records source and output hashes, sizes and geometry totals.

See License.txt for required CC BY 4.0 attribution.
