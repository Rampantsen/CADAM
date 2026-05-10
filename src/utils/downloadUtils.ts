import { generate3DModelFilename } from '@/utils/file-utils';
import { Message } from '@shared/types';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { GLTFExporter } from 'three-stdlib';
import * as THREE from 'three';

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
 * Downloads GLB converted from the latest compiled STL blob.
 */
export async function downloadGLBFile(
  output: Blob,
  currentMessage?: Message | null,
): Promise<void> {
  const filename = generateDownloadFilename({
    currentMessage,
    extension: 'glb',
  });

  const buffer = await output.arrayBuffer();
  const loader = new STLLoader();
  const geometry = loader.parse(buffer);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0xb8c0cc,
    metalness: 0.05,
    roughness: 0.55,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = filename.replace(/\.glb$/i, '');

  const scene = new THREE.Scene();
  scene.add(mesh);

  try {
    const glb = await new Promise<ArrayBuffer>((resolve, reject) => {
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

    downloadFile({
      content: new Blob([glb], { type: 'model/gltf-binary' }),
      filename,
      mimeType: 'model/gltf-binary',
    });
  } finally {
    geometry.dispose();
    material.dispose();
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
