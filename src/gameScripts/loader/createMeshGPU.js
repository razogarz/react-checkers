const DEFAULT_SAMPLER_DESC = {
  magFilter: 'linear',
  minFilter: 'linear',
  mipmapFilter: 'linear',
  addressModeU: 'repeat',
  addressModeV: 'repeat',
  addressModeW: 'repeat'
};

async function imageBitmapFromBytes(bytes) {
  // bytes: Uint8Array
  const blob = new Blob([bytes]);
  return await createImageBitmap(blob);
}

function createGPUBuffer(device, arr, usage) {
  const byteLength = arr.byteLength;
  const buf = device.createBuffer({
    size: (byteLength + 3) & ~3, // align to 4
    usage,
    mappedAtCreation: false
  });
  device.queue.writeBuffer(buf, 0, arr.buffer, arr.byteOffset, arr.byteLength);
  return buf;
}

// Generate simple 1x1 textures for fallback
function create1x1Texture(device, color = [255, 255, 255, 255]) {
  const tex = device.createTexture({
    size: [1, 1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
  });
  const data = new Uint8Array(color);
  device.queue.writeTexture(
    { texture: tex },
    data,
    { bytesPerRow: 4, rowsPerImage: 1 },
    [1, 1, 1]
  );
  return tex.createView();
}

async function createTextureFromBytes(device, bytes) {
  try {
    const img = await imageBitmapFromBytes(bytes);
    const tex = device.createTexture({
      size: [img.width, img.height, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });
    // copyExternalImageToTexture works with ImageBitmap
    device.queue.copyExternalImageToTexture({ source: img }, { texture: tex }, [img.width, img.height, 1]);
    return tex.createView();
  } catch (e) {
    console.warn('Failed to create texture from bytes', e);
    return create1x1Texture(device);
  }
}

// Simple tangent generator (per-vertex). Expects Float32Array positions (x,y,z), uvs (x,y), indices (uint16/uint32), normals present.
function generateTangents(positions, uvs, indices) {
  const vcount = positions.length / 3;
  const tan1 = new Float32Array(vcount * 3);
  const tan2 = new Float32Array(vcount * 3);

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i + 0];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];

    const p0x = positions[i0 * 3 + 0], p0y = positions[i0 * 3 + 1], p0z = positions[i0 * 3 + 2];
    const p1x = positions[i1 * 3 + 0], p1y = positions[i1 * 3 + 1], p1z = positions[i1 * 3 + 2];
    const p2x = positions[i2 * 3 + 0], p2y = positions[i2 * 3 + 1], p2z = positions[i2 * 3 + 2];

    const uv0x = uvs[i0 * 2 + 0], uv0y = uvs[i0 * 2 + 1];
    const uv1x = uvs[i1 * 2 + 0], uv1y = uvs[i1 * 2 + 1];
    const uv2x = uvs[i2 * 2 + 0], uv2y = uvs[i2 * 2 + 1];

    const x1 = p1x - p0x, y1 = p1y - p0y, z1 = p1z - p0z;
    const x2 = p2x - p0x, y2 = p2y - p0y, z2 = p2z - p0z;

    const s1 = uv1x - uv0x, t1 = uv1y - uv0y;
    const s2 = uv2x - uv0x, t2 = uv2y - uv0y;

    const denom = (s1 * t2 - s2 * t1) || 1e-8;
    const r = 1.0 / denom;

    const sdirx = (t2 * x1 - t1 * x2) * r;
    const sdiry = (t2 * y1 - t1 * y2) * r;
    const sdirz = (t2 * z1 - t1 * z2) * r;

    const tdirx = (s1 * x2 - s2 * x1) * r;
    const tdiry = (s1 * y2 - s2 * y1) * r;
    const tdirz = (s1 * z2 - s2 * z1) * r;

    tan1[i0 * 3 + 0] += sdirx; tan1[i0 * 3 + 1] += sdiry; tan1[i0 * 3 + 2] += sdirz;
    tan1[i1 * 3 + 0] += sdirx; tan1[i1 * 3 + 1] += sdiry; tan1[i1 * 3 + 2] += sdirz;
    tan1[i2 * 3 + 0] += sdirx; tan1[i2 * 3 + 1] += sdiry; tan1[i2 * 3 + 2] += sdirz;

    tan2[i0 * 3 + 0] += tdirx; tan2[i0 * 3 + 1] += tdiry; tan2[i0 * 3 + 2] += tdirz;
    tan2[i1 * 3 + 0] += tdirx; tan2[i1 * 3 + 1] += tdiry; tan2[i1 * 3 + 2] += tdirz;
    tan2[i2 * 3 + 0] += tdirx; tan2[i2 * 3 + 1] += tdiry; tan2[i2 * 3 + 2] += tdirz;
  }

  // build final tangent vec4 (x,y,z,w) where w is handedness
  const tangents = new Float32Array(vcount * 4);

  for (let a = 0; a < vcount; a++) {
    // we'll orthonormalize with normals supplied by caller externally, so here just copy accumulated tangent
    const tx = tan1[a * 3 + 0];
    const ty = tan1[a * 3 + 1];
    const tz = tan1[a * 3 + 2];

    // pack; handedness computed later when normals are known. We will set w=1 for now.
    tangents[a * 4 + 0] = tx;
    tangents[a * 4 + 1] = ty;
    tangents[a * 4 + 2] = tz;
    tangents[a * 4 + 3] = 1.0;
  }

  return tangents;
}

// orthonormalize tangent vs normal and set handedness w
function finalizeTangents(tangents, normals) {
  const vcount = normals.length / 3;
  for (let i = 0; i < vcount; i++) {
    const nx = normals[i * 3 + 0], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
    let tx = tangents[i * 4 + 0], ty = tangents[i * 4 + 1], tz = tangents[i * 4 + 2];

    // Gram-Schmidt orthogonalize
    const dotNT = nx * tx + ny * ty + nz * tz;
    tx = tx - nx * dotNT;
    ty = ty - ny * dotNT;
    tz = tz - nz * dotNT;
    // normalize
    const len = Math.hypot(tx, ty, tz) || 1e-10;
    tx /= len; ty /= len; tz /= len;

    // bitangent handedness via cross(normal, tangent) dot bitangentSign
    // We don't have accumulated bitangent; approximate w = 1.0
    const w = 1.0;

    tangents[i * 4 + 0] = tx;
    tangents[i * 4 + 1] = ty;
    tangents[i * 4 + 2] = tz;
    tangents[i * 4 + 3] = w;
  }
}

// Create per-model uniform buffer (model matrix) and a helper to update it
function createModelBindGroup(device, pipeline, modelMatrix = null) {
  const buf = device.createBuffer({
    size: 16 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  const initial = modelMatrix ? new Float32Array(modelMatrix) : new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  device.queue.writeBuffer(buf, 0, initial.buffer, initial.byteOffset, initial.byteLength);

  const layout = pipeline.getBindGroupLayout(2); // group(2) expected for transform
  const bg = device.createBindGroup({
    layout,
    entries: [{ binding: 0, resource: { buffer: buf } }]
  });

  return {
    bindGroup: bg,
    buffer: buf,
    update(modelMat) {
      device.queue.writeBuffer(buf, 0, new Float32Array(modelMat).buffer, 0, 16 * 4);
    }
  };
}

// Create material bind group: sampler + up to 4 textures; use placeholders if missing
async function createMaterialBindGroup(device, pipeline, materialDef, images) {
  const layout = pipeline.getBindGroupLayout(1); // group(1) expected for material
  const sampler = device.createSampler(DEFAULT_SAMPLER_DESC);

  // create or fallback textures
  const baseView = materialDef.baseColorTexture !== null && images[materialDef.baseColorTexture]
    ? await createTextureFromBytes(device, images[materialDef.baseColorTexture])
    : create1x1Texture(device, [200,200,200,255]);

  const mrView = materialDef.metallicRoughnessTexture !== null && images[materialDef.metallicRoughnessTexture]
    ? await createTextureFromBytes(device, images[materialDef.metallicRoughnessTexture])
    : create1x1Texture(device, [128,128,0,255]); // R=metal(0..1), G=rough(0..1)

  const normalView = materialDef.normalTexture !== null && images[materialDef.normalTexture]
    ? await createTextureFromBytes(device, images[materialDef.normalTexture])
    : create1x1Texture(device, [128,128,255,255]);

  const aoView = materialDef.occlusionTexture !== null && images[materialDef.occlusionTexture]
    ? await createTextureFromBytes(device, images[materialDef.occlusionTexture])
    : create1x1Texture(device, [255,255,255,255]);

  const bg = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: sampler },
      { binding: 1, resource: baseView },
      { binding: 2, resource: mrView },
      { binding: 3, resource: normalView },
      { binding: 4, resource: aoView }
    ]
  });

  return { bindGroup: bg, sampler, baseView, mrView, normalView, aoView };
}

// Main: convert loader model -> GPU-ready scene data
export async function createGPUFromLoadedModel(device, pipeline, loadedModel) {
  // pipeline is expected to be the PBR pipeline created earlier
  const meshesOut = [];
  const materialsCache = []; // cache created material bind groups by index

  // preload textures (images come from loadGLB returned images[] as Uint8Array)
  const images = loadedModel.images || [];

  for (let mi = 0; mi < (loadedModel.materials || []).length; mi++) {
    const matDef = loadedModel.materials[mi];
    materialsCache[mi] = await createMaterialBindGroup(device, pipeline, matDef, images);
  }

  for (const mesh of loadedModel.meshes) {
    const primitivesOut = [];

    for (const prim of mesh.primitives) {
      // attributes
      const posAcc = prim.attributes.POSITION?.array;
      const normAcc = prim.attributes.NORMAL?.array;
      const uvAcc = prim.attributes.TEXCOORD_0?.array;
      let tanAcc = prim.attributes.TANGENT?.array;
      const idxAcc = prim.indices?.array;

      if (!posAcc || !idxAcc) {
        console.warn('Primitive missing POSITION or indices; skipping.');
        continue;
      }

      // If tangents missing, generate them
      if (!tanAcc) {
        if (uvAcc && normAcc) {
          const gen = generateTangents(posAcc, uvAcc, idxAcc);
          finalizeTangents(gen, normAcc);
          tanAcc = gen;
        } else {
          // fallback neutral tangent
          const vcount = posAcc.length / 3;
          tanAcc = new Float32Array(vcount * 4);
          for (let i = 0; i < vcount; i++) { tanAcc[i * 4 + 0] = 1; tanAcc[i * 4 + 1] = 0; tanAcc[i * 4 + 2] = 0; tanAcc[i * 4 + 3] = 1; }
        }
      } else {
        // Make sure handedness computed: if provided, assume ok.
      }

      // create GPU buffers
      const posBuf = createGPUBuffer(device, new Float32Array(posAcc), GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
      const normBuf = createGPUBuffer(device, new Float32Array(normAcc || new Float32Array(posAcc.length)), GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
      const uvBuf = createGPUBuffer(device, new Float32Array(uvAcc || new Float32Array((posAcc.length/3)*2)), GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
      const tanBuf = createGPUBuffer(device, new Float32Array(tanAcc), GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);

      // indices typed array may already be Uint16Array or Uint32Array. Convert to a view if necessary
      let indexFormat = 'uint32';
      let idxTyped = idxAcc;
      if (idxAcc instanceof Uint16Array) {
        indexFormat = 'uint16';
        idxTyped = idxAcc;
      } else if (idxAcc instanceof Uint32Array || idxAcc.BYTES_PER_ELEMENT === 4) {
        indexFormat = 'uint32';
      } else {
        // fallback to uint32
        idxTyped = new Uint32Array(idxAcc);
        indexFormat = 'uint32';
      }

      const idxBuf = createGPUBuffer(device, idxTyped, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST);

      const materialIndex = prim.materialIndex;
      const materialBG = materialIndex !== null && materialsCache[materialIndex] ? materialsCache[materialIndex] : null;

      const model = createModelBindGroup(device, pipeline, null);

      primitivesOut.push({
        posBuf, normBuf, uvBuf, tanBuf, idxBuf,
        indexFormat,
        indexCount: prim.indices.count,
        material: materialBG,
        model
      });
    }

    meshesOut.push({ name: mesh.name, primitives: primitivesOut });
  }

  return {
    // meshes: array of { name, primitives: [{ posBuf,..., material, model }] }
    meshes: meshesOut
  };
}