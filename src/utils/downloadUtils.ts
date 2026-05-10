import { generate3DModelFilename } from '@/utils/file-utils';
import { parseColoredOff } from '@/utils/offParser';
import {
  Message,
  Parameter,
  ParametricArtifact,
  ParametricPart,
} from '@shared/types';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { GLTFExporter } from 'three-stdlib';
import * as THREE from 'three';
import { ExportScadFile } from '@/hooks/useOpenSCAD';

interface DownloadOptions {
  content: Blob | string;
  filename: string;
  mimeType?: string;
}

interface GenerateDownloadFilenameOptions {
  currentMessage?: Message | null;
  fallback?: string;
  extension: string;
}

/**
 * Downloads a file by creating a temporary download link
 */
export function downloadFile({
  content,
  filename,
  mimeType = 'application/octet-stream',
}: DownloadOptions): void {
  let blob: Blob;

  if (typeof content === 'string') {
    blob = new Blob([content], { type: mimeType });
  } else {
    blob = content;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates a filename for downloads using the 3D model filename utility
 */
export function generateDownloadFilename({
  currentMessage,
  fallback = 'parametric-model',
  extension,
}: GenerateDownloadFilenameOptions): string {
  const baseName = generate3DModelFilename({
    conversationTitle: undefined,
    assistantMessage: currentMessage || undefined,
    modelName: undefined,
    fallback,
  });

  return `${baseName}.${extension}`;
}

/**
 * Downloads STL file from blob
 */
export function downloadSTLFile(
  output: Blob,
  currentMessage?: Message | null,
): void {
  const filename = generateDownloadFilename({
    currentMessage,
    extension: 'stl',
  });

  downloadFile({
    content: output,
    filename,
    mimeType: 'application/octet-stream',
  });
}

/**
 * Builds a logical part hierarchy by compiling every declared CADAM part.
 *
 * This path requires generated code to implement the CADAM export selector:
 * `cadam_export_part = "assembly";` plus cadam_render_part(part_id).
 */
async function buildPartSceneFromArtifact(
  artifact: ParametricArtifact,
  exportScadFile: ExportScadFile,
  rootName: string,
): Promise<THREE.Scene | null> {
  const parts = artifact.parts?.filter((part) => part.id && part.module) ?? [];
  if (parts.length === 0 || !artifact.code.includes('cadam_export_part')) {
    return null;
  }

  const scene = new THREE.Scene();
  scene.name = `${rootName} Scene`;
  const root = new THREE.Group();
  root.name = rootName;
  root.userData = {
    cadamExport: {
      mode: 'parts',
      articulations: artifact.articulations ?? [],
    },
  };
  scene.add(root);

  const groupById = new Map<string, THREE.Group>();
  for (const part of parts) {
    const group = new THREE.Group();
    group.name = part.name || part.id;
    group.userData = {
      cadamPart: part,
      cadamArticulations:
        artifact.articulations?.filter((item) => item.partId === part.id) ?? [],
    };
    groupById.set(part.id, group);
  }

  for (const part of parts) {
    const group = groupById.get(part.id);
    if (!group) continue;
    const parent =
      part.parentId && groupById.has(part.parentId)
        ? groupById.get(part.parentId)
        : root;
    parent?.add(group);
  }

  for (const part of parts) {
    const group = groupById.get(part.id);
    if (!group) continue;

    const stlBlob = await exportScadFile(artifact.code, 'stl', [
      buildExportPartParameter(part.id),
    ]);
    const geometry = await parseStlGeometry(stlBlob);
    const material = new THREE.MeshStandardMaterial({
      color: resolvePartColor(part, artifact),
      metalness: 0.05,
      roughness: 0.65,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${part.name || part.id} mesh`;
    mesh.userData = { cadamPartId: part.id };
    group.add(mesh);
  }

  return root.children.length > 0 ? scene : null;
}

function buildExportPartParameter(partId: string): Parameter {
  return {
    name: 'cadam_export_part',
    displayName: 'CADAM Export Part',
    value: partId,
    defaultValue: 'assembly',
    type: 'string',
  };
}

async function parseStlGeometry(output: Blob): Promise<THREE.BufferGeometry> {
  const buffer = await output.arrayBuffer();
  const loader = new STLLoader();
  const geometry = loader.parse(buffer);
  geometry.computeVertexNormals();
  return geometry;
}

function resolvePartColor(
  part: ParametricPart,
  artifact: ParametricArtifact,
): THREE.ColorRepresentation {
  const colorValue =
    artifact.parameters.find((parameter) => parameter.name === part.color)
      ?.value ?? part.color;
  if (typeof colorValue !== 'string' || colorValue.length === 0) {
    return 0xb8c0cc;
  }
  try {
    return new THREE.Color(colorValue);
  } catch {
    return 0xb8c0cc;
  }
}

/**
 * Converts colored OpenSCAD OFF output into a named mesh hierarchy.
 *
 * OpenSCAD's STL output is a flattened triangle soup. The companion OFF output
 * preserves color() calls per face, so GLB export can keep those groups as
 * separate scene nodes for downstream apps.
 */
async function buildLayeredSceneFromOff(
  offOutput: Blob,
  rootName: string,
): Promise<THREE.Scene | null> {
  const parsed = parseColoredOff(await offOutput.text());
  const buckets = new Map<string, typeof parsed.faces>();

  for (const face of parsed.faces) {
    if (!face.color) {
      const bucket = buckets.get('__default');
      if (bucket) bucket.push(face);
      else buckets.set('__default', [face]);
      continue;
    }

    const r = Math.round(face.color[0] * 255);
    const g = Math.round(face.color[1] * 255);
    const b = Math.round(face.color[2] * 255);
    const isOpenscadDefault = r === 249 && g === 215 && b === 44;
    const isManifoldCutDefault = r === 157 && g === 203 && b === 81;
    const key =
      isOpenscadDefault || isManifoldCutDefault
        ? '__default'
        : `${r},${g},${b},${Math.round(face.color[3] * 255)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(face);
    else buckets.set(key, [face]);
  }

  if (buckets.size === 0) return null;

  const scene = new THREE.Scene();
  scene.name = `${rootName} Scene`;
  const root = new THREE.Group();
  root.name = rootName;
  const layers = new THREE.Group();
  layers.name = 'OpenSCAD Color Layers';
  root.add(layers);
  scene.add(root);

  let layerIndex = 1;
  for (const [key, faces] of buckets) {
    if (faces.length === 0) continue;

    const positions = new Float32Array(faces.length * 9);
    for (let f = 0; f < faces.length; f++) {
      const [a, b, c] = faces[f].vertices;
      const va = parsed.vertices[a];
      const vb = parsed.vertices[b];
      const vc = parsed.vertices[c];
      const base = f * 9;
      positions[base + 0] = va[0];
      positions[base + 1] = va[1];
      positions[base + 2] = va[2];
      positions[base + 3] = vb[0];
      positions[base + 4] = vb[1];
      positions[base + 5] = vb[2];
      positions[base + 6] = vc[0];
      positions[base + 7] = vc[1];
      positions[base + 8] = vc[2];
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();

    const firstFace = faces[0];
    const faceColor = key === '__default' ? null : firstFace.color;
    const material = new THREE.MeshStandardMaterial({
      color: faceColor
        ? (Math.round(faceColor[0] * 255) << 16) |
          (Math.round(faceColor[1] * 255) << 8) |
          Math.round(faceColor[2] * 255)
        : 0xb8c0cc,
      metalness: 0.05,
      roughness: faceColor ? 0.7 : 0.55,
      transparent: faceColor ? faceColor[3] < 1 : false,
      opacity: faceColor ? faceColor[3] : 1,
    });

    const mesh = new THREE.Mesh(geometry, material);
    const colorName = faceColor
      ? `#${Math.round(faceColor[0] * 255).toString(16).padStart(2, '0')}${Math.round(faceColor[1] * 255).toString(16).padStart(2, '0')}${Math.round(faceColor[2] * 255).toString(16).padStart(2, '0')}`
      : 'default';
    mesh.name = `Layer ${String(layerIndex).padStart(2, '0')} ${colorName}`;
    layers.add(mesh);
    layerIndex += 1;
  }

  return layers.children.length > 0 ? scene : null;
}

function buildSceneFromStl(output: Blob, rootName: string): Promise<{
  scene: THREE.Scene;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}> {
  return parseStlGeometry(output).then((geometry) => {
    const material = new THREE.MeshStandardMaterial({
      color: 0xb8c0cc,
      metalness: 0.05,
      roughness: 0.55,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Layer 01 flattened STL';

    const root = new THREE.Group();
    root.name = rootName;
    root.add(mesh);

    const scene = new THREE.Scene();
    scene.name = `${rootName} Scene`;
    scene.add(root);

    return { scene, geometry, material };
  });
}

function disposeScene(scene: THREE.Scene) {
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry?.dispose();
    const material = object.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else {
      material?.dispose();
    }
  });
}

function exportSceneToGlb(scene: THREE.Scene): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(result);
          return;
        }
        reject(new Error('GLB export returned JSON instead of binary data'));
      },
      (error) => reject(error),
      { binary: true },
    );
  });
}

/**
 * Downloads GLB converted from the latest compiled OpenSCAD output.
 */
export async function downloadGLBFile(
  output: Blob,
  currentMessage?: Message | null,
  offOutput?: Blob,
  exportScadFile?: ExportScadFile,
): Promise<void> {
  const filename = generateDownloadFilename({
    currentMessage,
    extension: 'glb',
  });
  const rootName = filename.replace(/\.glb$/i, '');

  let stlFallback:
    | { scene: THREE.Scene; geometry: THREE.BufferGeometry; material: THREE.Material }
    | undefined;
  const artifact = currentMessage?.content.artifact;
  let scene =
    artifact && exportScadFile
      ? await buildPartSceneFromArtifact(
          artifact,
          exportScadFile,
          rootName,
        ).catch((error) => {
          console.warn('[Download] Failed to build part-aware GLB:', error);
          return null;
        })
      : null;
  scene =
    scene ??
    (offOutput instanceof Blob
      ? await buildLayeredSceneFromOff(offOutput, rootName).catch((error) => {
          console.warn('[Download] Failed to build layered GLB from OFF:', error);
          return null;
        })
      : null);
  if (!scene) {
    stlFallback = await buildSceneFromStl(output, rootName);
    scene = stlFallback.scene;
  }

  try {
    const glb = await exportSceneToGlb(scene);

    downloadFile({
      content: new Blob([glb], { type: 'model/gltf-binary' }),
      filename,
      mimeType: 'model/gltf-binary',
    });
  } finally {
    if (stlFallback) {
      stlFallback.geometry.dispose();
      stlFallback.material.dispose();
    } else {
      disposeScene(scene);
    }
  }
}

/**
 * Downloads OpenSCAD code as .scad file
 */
export function downloadOpenSCADFile(
  code: string,
  currentMessage?: Message | null,
): void {
  const filename = generateDownloadFilename({
    currentMessage,
    extension: 'scad',
  });

  downloadFile({
    content: code,
    filename,
    mimeType: 'text/plain',
  });
}
