"""Build the Michigan Block M in Blender and export it as a glTF binary for the site.

Run:  blender --background --python tools/block-m/build_block_m.py -- <outline.json> <out.glb> [preview.png]

The outline JSON comes from tracing the logo (navy M = "inner", maize outline = "outer"),
in image pixels with y pointing down. The M is built standing up in Blender's XZ plane,
facing -Y, so after glTF's Y-up conversion it stands upright facing the viewer (+Z).
"""
import json
import sys

import bmesh
import bpy

args = sys.argv[sys.argv.index("--") + 1:]
outline_path, out_glb = args[0], args[1]
preview = args[2] if len(args) > 2 else None

data = json.load(open(outline_path))
outer, inner = data["outer"], data["inner"]
xs = [p[0] for p in outer]
ys = [p[1] for p in outer]
cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
scale = 2.0 / (max(xs) - min(xs))  # the whole logo is 2 units wide

NAVY = (0.0, 0.0207, 0.0723, 1.0)    # Michigan Blue #00274C, linear
MAIZE = (1.0, 0.597, 0.0015, 1.0)    # Maize #FFCB05, linear


def to3d(p):
    return ((p[0] - cx) * scale, 0.0, -(p[1] - cy) * scale)


def material(name, color, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = 0.0
    return m


def slab(name, pts, depth, mat):
    """Extrude a closed polygon into a slab centred on y=0, with a small bevel on the edges."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    verts = [bm.verts.new(to3d(p)) for p in pts]
    face = bm.faces.new(verts)
    bmesh.ops.translate(bm, verts=verts, vec=(0, -depth / 2, 0))
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [g for g in ext["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved, vec=(0, depth, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()
    obj.data.materials.append(mat)
    bev = obj.modifiers.new("bevel", "BEVEL")
    bev.width = 0.018
    bev.segments = 3
    bev.limit_method = "ANGLE"
    bev.harden_normals = True
    obj.modifiers.new("tri", "TRIANGULATE")
    return obj


# start from an empty scene
bpy.ops.wm.read_factory_settings(use_empty=True)

navy = material("Michigan Blue", NAVY, 0.42)
maize = material("Maize", MAIZE, 0.38)
# the navy M sits proud of the maize outline on both faces
slab("Maize outline", outer, 0.46, maize)
slab("Block M", inner, 0.55, navy)

bpy.ops.export_scene.gltf(
    filepath=out_glb,
    export_format="GLB",
    export_apply=True,
    export_yup=True,
    export_materials="EXPORT",
    export_normals=True,
    export_texcoords=False,
)
print("exported", out_glb)

if preview:
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (0.9, -5.2, 0.35)
    cam.rotation_euler = (1.50, 0.0, 0.17)
    scene.camera = cam
    light = bpy.data.objects.new("key", bpy.data.lights.new("key", "AREA"))
    light.data.energy = 900
    light.data.size = 4
    light.location = (2.5, -3.5, 3.0)
    scene.collection.objects.link(light)
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.91, 0.91, 0.9, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    scene.world = world
    scene.view_settings.view_transform = "Standard"   # show the real Michigan colours, not a desaturated film look
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.cycles.device = "CPU"
    scene.render.resolution_x, scene.render.resolution_y = 900, 700
    scene.render.filepath = preview
    bpy.ops.render.render(write_still=True)
    print("rendered", preview)
