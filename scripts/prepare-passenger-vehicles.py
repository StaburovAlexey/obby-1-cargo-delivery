#!/usr/bin/env python3
"""Extract the licensed passenger pack without Blender or optional glTF codecs.

Requires Python 3 and Pillow. All geometry/UVs survive; only coordinate frames,
index storage, image resolution and scene organization change.
"""

import argparse
import copy
import hashlib
import io
import json
import math
from pathlib import Path
import struct

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = "https://sketchfab.com/3d-models/generic-passenger-car-pack-20f9af9b8a404d5cb022ac6fe87f21f5"
AUTHOR = "Comrade1280 (https://sketchfab.com/comrade1280)"
LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"
SOURCE_SHA256 = "a2d5667f3a1d47fa0dbb84cf2cf76b8aeee6a69f7fff209af09973c625f9be6e"
# Explicit IDs avoid the duplicate Wheel_A/Wheel_E/Wheel_G001 source names.
CARS = (
    ("compact", 11, (3, 5, 7, 9), 7257),
    ("coupe", 15, (19, 21, 23, 25), 6022),
    ("hatchback", 27, (31, 33, 35, 37), 6808),
    ("minivan", 41, (39, 45, 47, 49), 7450),
    ("offroad", 53, (51, 57, 59, 61), 6502),
    ("pickup", 65, (63, 69, 71, 73), 6918),
    ("sedan", 75, (79, 81, 83, 85), 7122),
    ("sport", 95, (87, 89, 91, 93), 6268),
    ("suv", 102, (99, 106, 109, 112), 7951),
    ("wagon", 115, (119, 121, 123, 125), 6982),
)
IDENTITY = (1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
COMPONENTS = {5121: "B", 5123: "H", 5125: "I", 5126: "f"}
WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def bounds(points):
    return ([min(p[k] for p in points) for k in range(3)],
            [max(p[k] for p in points) for k in range(3)])


def load_glb(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<III", data)
    if (magic, version, length) != (0x46546C67, 2, len(data)):
        raise ValueError("Expected a complete glTF 2.0 binary")
    document = binary = None
    offset = 12
    while offset < length:
        size, kind = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8:offset + 8 + size]
        if kind == 0x4E4F534A:
            document = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = chunk
        offset += 8 + size
    if document is None or binary is None:
        raise ValueError("GLB must embed JSON and binary chunks")
    return data, document, binary


class Source:
    def __init__(self, path):
        self.data, self.doc, self.binary = load_glb(path)
        if digest(self.data) != SOURCE_SHA256:
            raise ValueError("Source SHA256 changed; audit node IDs and orientation first")
        self.scale = self.doc["nodes"][0]["matrix"][0]
        self.arrays = {}
        self.images = {}

    def array(self, index):
        if index not in self.arrays:
            a = self.doc["accessors"][index]
            view = self.doc["bufferViews"][a["bufferView"]]
            fmt = "<" + COMPONENTS[a["componentType"]] * WIDTHS[a["type"]]
            stride = view.get("byteStride", struct.calcsize(fmt))
            offset = view.get("byteOffset", 0) + a.get("byteOffset", 0)
            self.arrays[index] = [struct.unpack_from(fmt, self.binary, offset + i * stride)
                                  for i in range(a["count"])]
        return self.arrays[index]

    def image(self, texture_id, limit, color=False):
        image_id = self.doc["textures"][texture_id]["source"]
        key = (image_id, limit, color)
        if key not in self.images:
            view = self.doc["bufferViews"][self.doc["images"][image_id]["bufferView"]]
            data = self.binary[view.get("byteOffset", 0):
                               view.get("byteOffset", 0) + view["byteLength"]]
            image = Image.open(io.BytesIO(data)).convert("RGB")
            image.thumbnail((limit, limit), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            # Color maps tolerate a compact palette; PBR data channels stay RGB.
            if color:
                image = image.quantize(colors=256, method=Image.Quantize.MEDIANCUT,
                                       dither=Image.Dither.NONE)
            image.save(output, format="PNG", optimize=True, compress_level=9)
            self.images[key] = (output.getvalue(), image)
        return self.images[key]

    def geometry(self, body_id, frame_id, root_id, child_id):
        nodes = self.doc["nodes"]
        body = nodes[body_id].get("matrix", IDENTITY)
        frame = nodes[frame_id].get("matrix", IDENTITY)
        matrix = nodes[root_id].get("matrix", IDENTITY)

        def canonical(point, position):
            world = [sum(matrix[j * 4 + k] * point[j] for j in range(3))
                     for k in range(3)]
            if position:
                world = [world[k] + matrix[12 + k] - body[12 + k] for k in range(3)]
            local = [sum(frame[k * 4 + j] * world[j] for j in range(3))
                     for k in range(3)]
            # Proper rotation: source Z up / -Y nose -> Y up / +Z nose.
            # The wheel frame also corrects Coupe's baked body orientation.
            value = (local[0], local[2], -local[1])
            if position:
                return tuple(v * self.scale for v in value)
            length = math.sqrt(sum(v * v for v in value))
            return tuple(v / length for v in value)

        mesh = self.doc["meshes"][nodes[child_id]["mesh"]]
        assert len(mesh["primitives"]) == 1
        primitive = mesh["primitives"][0]
        return {
            "positions": [canonical(p, True) for p in self.array(primitive["attributes"]["POSITION"])],
            "normals": [canonical(n, False) for n in self.array(primitive["attributes"]["NORMAL"])],
            "uv": self.array(primitive["attributes"]["TEXCOORD_0"]),
            "indices": [i[0] for i in self.array(primitive["indices"])],
            "sourceMaterial": primitive["material"],
        }


class Writer:
    def __init__(self, name):
        self.doc = {
            "asset": {"version": "2.0", "generator": "prepare-passenger-vehicles.py",
                      "copyright": "Generic passenger car pack by Comrade1280, CC BY 4.0",
                      "extras": {"author": AUTHOR, "license": LICENSE_URL, "source": SOURCE_URL}},
            "scene": 0, "scenes": [{"name": name.title(), "nodes": [0]}],
            "nodes": [{"name": "Passenger " + name.title(), "children": [],
                       "extras": {"assetFamily": "passenger", "forward": "+Z", "up": "+Y"}}],
            "meshes": [], "materials": [], "textures": [], "images": [],
            "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
            "accessors": [], "bufferViews": [], "buffers": [],
        }
        self.binary = bytearray()
        self.texture_ids = {}
        self.texture_sizes = {}

    def data(self, data, target=None):
        self.binary.extend(b"\0" * (-len(self.binary) % 4))
        view = {"buffer": 0, "byteOffset": len(self.binary), "byteLength": len(data)}
        if target:
            view["target"] = target
        self.binary.extend(data)
        self.doc["bufferViews"].append(view)
        return len(self.doc["bufferViews"]) - 1

    def array(self, values, kind, component=5126, with_bounds=False):
        width = WIDTHS[kind]
        fmt = "<" + COMPONENTS[component] * width
        data = b"".join(struct.pack(fmt, *(v if isinstance(v, (tuple, list)) else (v,))) for v in values)
        accessor = {"bufferView": self.data(data, 34963 if kind == "SCALAR" else 34962),
                    "componentType": component, "count": len(values), "type": kind}
        if with_bounds:
            accessor["min"], accessor["max"] = bounds(values)
        self.doc["accessors"].append(accessor)
        return len(self.doc["accessors"]) - 1

    def texture(self, source, old_id, limit, color=False):
        data, image = source.image(old_id, limit, color)
        sha = digest(data)
        if sha not in self.texture_ids:
            index = len(self.doc["textures"])
            name = "Passenger texture " + sha
            self.doc["images"].append({"name": name, "bufferView": self.data(data), "mimeType": "image/png"})
            self.doc["textures"].append({"name": name, "sampler": 0, "source": index,
                                         "extras": {"passengerTextureHash": sha}})
            self.texture_ids[sha] = index
            self.texture_sizes[sha] = list(image.size)
        return self.texture_ids[sha]

    def material(self, source, old_id, role):
        material = copy.deepcopy(source.doc["materials"][old_id])
        material["name"] = "Passenger " + role
        material["extras"] = {"passengerRole": role.lower().replace(" ", "-"),
                              "passengerPaintable": role == "Body"}
        limit = 512 if role == "Body" else 256

        def replace_textures(value):
            if isinstance(value, dict):
                for key, child in value.items():
                    if key.endswith("Texture") and isinstance(child, dict) and "index" in child:
                        child["index"] = self.texture(source, child["index"], limit,
                                                      color=key == "baseColorTexture")
                    else:
                        replace_textures(child)
            elif isinstance(value, list):
                for child in value:
                    replace_textures(child)

        replace_textures(material)
        self.doc["materials"].append(material)
        return len(self.doc["materials"]) - 1

    def mesh(self, geometry, material, name, offset):
        positions = [tuple(p[k] - offset[k] for k in range(3)) for p in geometry["positions"]]
        primitive = {
            "attributes": {"POSITION": self.array(positions, "VEC3", with_bounds=True),
                           "NORMAL": self.array(geometry["normals"], "VEC3"),
                           "TEXCOORD_0": self.array(geometry["uv"], "VEC2")},
            "indices": self.array(geometry["indices"], "SCALAR", 5123), "material": material,
        }
        self.doc["meshes"].append({"name": name, "primitives": [primitive]})
        return len(self.doc["meshes"]) - 1

    def node(self, node, parent=0):
        index = len(self.doc["nodes"])
        self.doc["nodes"].append(node)
        self.doc["nodes"][parent].setdefault("children", []).append(index)
        return index

    def save(self, path):
        self.doc["buffers"] = [{"byteLength": len(self.binary)}]
        document = json.dumps(self.doc, separators=(",", ":"), ensure_ascii=True).encode()
        document += b" " * (-len(document) % 4)
        binary = bytes(self.binary) + b"\0" * (-len(self.binary) % 4)
        output = (struct.pack("<III", 0x46546C67, 2, 28 + len(document) + len(binary))
                  + struct.pack("<II", len(document), 0x4E4F534A) + document
                  + struct.pack("<II", len(binary), 0x004E4942) + binary)
        path.write_bytes(output)
        return output


def export_car(source, output, car):
    name, body_id, wheel_ids, triangle_count = car
    body_parts = [source.geometry(body_id, wheel_ids[0], body_id, child)
                  for child in source.doc["nodes"][body_id]["children"]]
    wheels = [[source.geometry(body_id, wheel_ids[0], wheel_id, child)
               for child in source.doc["nodes"][wheel_id]["children"]] for wheel_id in wheel_ids]
    all_points = [p for geometry in body_parts + [part for wheel in wheels for part in wheel]
                  for p in geometry["positions"]]
    lo, hi = bounds(all_points)
    center = ((lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2)
    writer = Writer(name)
    materials = {}
    for geometry, role in zip(body_parts, ("Body", "Glass", "Optics")):
        materials[role] = writer.material(source, geometry["sourceMaterial"], role)
        mesh = writer.mesh(geometry, materials[role], "Passenger " + role, center)
        writer.node({"name": role, "mesh": mesh})
    # Stable numbering: front-left, front-right, rear-left, rear-right (+Z front).
    def wheel_center(parts):
        mn, mx = bounds([p for part in parts for p in part["positions"]])
        return tuple((mn[k] + mx[k]) / 2 for k in range(3))
    wheels.sort(key=lambda parts: -wheel_center(parts)[2])
    wheels = (sorted(wheels[:2], key=lambda parts: wheel_center(parts)[0])
              + sorted(wheels[2:], key=lambda parts: wheel_center(parts)[0]))
    for number, parts in enumerate(wheels, 1):
        wheel_center_value = wheel_center(parts)
        position = [wheel_center_value[k] - center[k] for k in range(3)]
        wheel_node = writer.node({"name": "Wheel" + str(number), "translation": position})
        for part_number, geometry in enumerate(parts):
            role = "Wheel" if part_number == 0 else "Wheel Trim"
            if role not in materials:
                materials[role] = writer.material(source, geometry["sourceMaterial"], role)
            mesh = writer.mesh(geometry, materials[role], "Passenger " + role, wheel_center_value)
            writer.node({"name": "Tire" if part_number == 0 else "Trim", "mesh": mesh}, wheel_node)
    actual_triangles = sum(len(g["indices"]) // 3 for g in body_parts + [p for w in wheels for p in w])
    assert actual_triangles == triangle_count, (name, actual_triangles, triangle_count)
    data = writer.save(output / (name + ".glb"))
    assert len(data) < 800_000, (name, "asset budget", len(data))
    return {
        "file": name + ".glb", "model": name, "bytes": len(data), "sha256": digest(data),
        "triangles": actual_triangles, "primitives": len(writer.doc["meshes"]),
        "materials": len(writer.doc["materials"]), "textures": len(writer.doc["textures"]),
        "maxTextureSize": max(max(size) for size in writer.texture_sizes.values()),
        "textureSizes": list(writer.texture_sizes.values()),
        "dimensions": [hi[k] - lo[k] for k in range(3)],
    }


def preview_sheet(output, destination):
    """A dependency-free textured painter preview, for orientation/UV inspection."""
    width, height = 384, 224
    sheet = Image.new("RGB", (width * 4, height * 5), (228, 233, 240))
    for car_index, car in enumerate(CARS):
        _, doc, binary = load_glb(output / (car[0] + ".glb"))
        textures = []
        for image in doc["images"]:
            view = doc["bufferViews"][image["bufferView"]]
            textures.append(Image.open(io.BytesIO(binary[view["byteOffset"]:view["byteOffset"] + view["byteLength"]])).convert("RGB"))

        def array(index):
            a = doc["accessors"][index]
            v = doc["bufferViews"][a["bufferView"]]
            fmt = "<" + COMPONENTS[a["componentType"]] * WIDTHS[a["type"]]
            step = struct.calcsize(fmt)
            return [struct.unpack_from(fmt, binary, v.get("byteOffset", 0) + j * step) for j in range(a["count"])]

        for view_number, yaw in enumerate((0.65, math.pi + 0.65)):
            image = Image.new("RGB", (width, height), (228, 233, 240))
            draw = ImageDraw.Draw(image)
            triangles = []
            pitch = 0.33
            size = max(car_size for car_size in next(e["dimensions"] for e in json.loads((output / "manifest.json").read_text())["files"] if e["model"] == car[0]))

            def projection(point):
                x, y, z = point
                u = x * math.cos(yaw) - z * math.sin(yaw)
                d = x * math.sin(yaw) + z * math.cos(yaw)
                v = y * math.cos(pitch) - d * math.sin(pitch)
                depth = d * math.cos(pitch) + y * math.sin(pitch)
                scale = 270 / size
                return (width / 2 + u * scale, height * 0.69 - v * scale, depth)

            for node in doc["nodes"]:
                if "mesh" not in node:
                    continue
                parent = next((n for n in doc["nodes"] if doc["nodes"].index(node) in n.get("children", [])), {})
                offset = parent.get("translation", (0, 0, 0))
                primitive = doc["meshes"][node["mesh"]]["primitives"][0]
                pos = array(primitive["attributes"]["POSITION"])
                normal = array(primitive["attributes"]["NORMAL"])
                uv = array(primitive["attributes"]["TEXCOORD_0"])
                indices = [a[0] for a in array(primitive["indices"])]
                material = doc["materials"][primitive["material"]]
                pbr = material["pbrMetallicRoughness"]
                tex = textures[doc["textures"][pbr["baseColorTexture"]["index"]]["source"]] if "baseColorTexture" in pbr else None
                for start in range(0, len(indices), 3):
                    ids = indices[start:start + 3]
                    points = [projection([pos[i][k] + offset[k] for k in range(3)]) for i in ids]
                    n = [sum(normal[i][k] for i in ids) / 3 for k in range(3)]
                    viewer = (math.sin(yaw) * math.cos(pitch), math.sin(pitch),
                              math.cos(yaw) * math.cos(pitch))
                    if not material.get("doubleSided") and sum(n[k] * viewer[k] for k in range(3)) <= 0:
                        continue
                    light = 0.45 + 0.55 * max(0, (n[0] * 0.25 + n[1] * 0.85 + n[2] * 0.4))
                    if tex:
                        u, v = [sum(uv[i][k] for i in ids) / 3 for k in range(2)]
                        color = tex.getpixel((int((u % 1) * (tex.width - 1)), int((v % 1) * (tex.height - 1))))
                    else:
                        color = tuple(int(v * 255) for v in pbr.get("baseColorFactor", (0, 0, 0, 1))[:3])
                    color = tuple(max(0, min(255, int(c * light))) for c in color)
                    triangles.append((sum(p[2] for p in points) / 3, [(p[0], p[1]) for p in points], color))
            for _, points, color in sorted(triangles):
                draw.polygon(points, fill=color)
            draw.text((12, 10), car[0].title() + (" - front +Z" if view_number == 0 else " - rear -Z"), fill=(25, 35, 50))
            sheet.paste(image, ((car_index % 2 * 2 + view_number) * width, (car_index // 2) * height))
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "new/generic_passenger_car_pack.glb")
    parser.add_argument("--output", type=Path, default=ROOT / "dist/assets/vehicles/passenger")
    parser.add_argument("--preview-sheet", type=Path)
    args = parser.parse_args()
    source = Source(args.source)
    args.output.mkdir(parents=True, exist_ok=True)
    files = [export_car(source, args.output, car) for car in CARS]
    manifest = {
        "title": "Generic passenger car pack", "author": AUTHOR, "sourceUrl": SOURCE_URL,
        "license": "CC BY 4.0", "licenseUrl": LICENSE_URL,
        "localSource": "new/generic_passenger_car_pack.glb", "sourceSha256": digest(source.data),
        "sourceBytes": len(source.data), "generator": "scripts/prepare-passenger-vehicles.py",
        "coordinateSystem": {"up": "+Y", "forward": "+Z", "wheelAxle": "X", "ground": 0},
        "changes": ["Extracted ten cars and excluded the display pedestal",
                    "Normalized orientation, centered X/Z and grounded Y; regrouped and centered four separate wheels",
                    "Preserved triangle topology, normals and source UVs; stored indices as unsigned 16-bit",
                    "Resized body PNG maps to 512 pixels and wheel/optics maps to 256 pixels",
                    "Optimized base-color PNGs with 256-color palettes; retained RGB PBR data maps"],
        "files": files, "totalBytes": sum(f["bytes"] for f in files),
        "totalTriangles": sum(f["triangles"] for f in files),
    }
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (args.output / "License.txt").write_text(
        "Generic passenger car pack\nBy " + AUTHOR + "\nSource: " + SOURCE_URL
        + "\nLicense: Creative Commons Attribution 4.0 International (CC BY 4.0)\n" + LICENSE_URL
        + "\n\nAdapted for Obby Cargo Delivery. Changes: extracted ten vehicles; removed the\n"
        "display pedestal; normalized axes, origin and wheel hierarchy; reduced texture\n"
        "resolution; converted all images to PNG and palette-optimized color maps;\n"
        "repacked indices without decimation.\n"
        "The original author does not endorse these changes or this game.\n"
        "Retain this attribution and license link when redistributing these assets.\n")
    (args.output / "README.md").write_text(
        "# Passenger vehicles\n\n"
        "Rebuild from the original local source with Python 3 and Pillow:\n\n"
        "```sh\npython3 scripts/prepare-passenger-vehicles.py\n```\n\n"
        "Use `--preview-sheet /tmp/passenger-vehicles.png` for a textured orientation\n"
        "contact sheet. No Blender, decoder extension or NumPy is required.\n\n"
        "Each GLB faces +Z with +Y up, X wheel axles, centered X/Z bounds and Y=0 ground.\n"
        "The root contains Body, Glass, Optics, and four wheel groups named Wheel1\n"
        "through Wheel4 (front-left, front-right, rear-left, rear-right). Wheel geometry\n"
        "is centered under each group. SUV Trim remains inside its wheel group and uses\n"
        "Passenger Wheel Trim, which must remain unpainted. Only Passenger Body is\n"
        "paintable. Original topology, UVs and material PBR settings are retained.\n\n"
        "Body color/metallic-roughness maps are at most 512x512; wheel and shared optics\n"
        "maps are at most 256x256. All images are PNG; color maps use 256-color palettes\n"
        "and PBR data maps stay RGB. Texture names and the\n"
        "passengerTextureHash extra identify byte-identical resized images for sharing.\n"
        "The manifest records source and output hashes, sizes and geometry totals.\n\n"
        "See License.txt for required CC BY 4.0 attribution.\n")
    for entry in files:
        print(f"{entry['file']}: {entry['triangles']} triangles, {entry['bytes']} bytes")
    print(f"Total: {manifest['totalTriangles']} triangles, {manifest['totalBytes']} bytes")
    if args.preview_sheet:
        preview_sheet(args.output, args.preview_sheet)
        print("Preview:", args.preview_sheet)


if __name__ == "__main__":
    main()
