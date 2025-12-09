/*
 * Minimal GLB loader for the checker model.
 * - Parses binary GLB file, reads JSON chunk and BIN chunk
 * - Extracts the first mesh primitive's POSITION, NORMAL and indices accessors
 * - Builds GPU buffers for pos/norm/index and returns metadata (buffers, indexFormat, indexCount, bounds)
 *
 * This is intentionally minimal and tailored to simple exported checker.glb files used in this app.
 */

function readUint32(dataView, offset) {
  return dataView.getUint32(offset, true);
}

function getTypedArrayForAccessor(componentType, count, accessorType, buffer, byteOffset, byteStride) {
  // Determine element size in bytes
  const isFloat = componentType === 5126;
  const isUShort = componentType === 5123;
  const isUInt = componentType === 5125;

  let numComponents = 1;
  if (accessorType === 'VEC2') numComponents = 2;
  else if (accessorType === 'VEC3') numComponents = 3;
  else if (accessorType === 'VEC4') numComponents = 4;
  else if (accessorType === 'MAT4') numComponents = 16;

  const bytesPerComponent = isFloat || isUInt ? 4 : (isUShort ? 2 : 1);
  const elementSize = numComponents * bytesPerComponent;

  // effective stride is either explicit byteStride or tightly packed elementSize
  const stride = (byteStride && byteStride > 0) ? byteStride : elementSize;

  // Fast path: tightly packed (stride == elementSize)
  if (stride === elementSize) {
    if (isFloat) return new Float32Array(buffer, byteOffset, count * numComponents);
    if (isUShort) return new Uint16Array(buffer, byteOffset, count * numComponents);
    if (isUInt) return new Uint32Array(buffer, byteOffset, count * numComponents);
    return new Uint8Array(buffer, byteOffset, count * numComponents);
  }

  // Slow path: interleaved/strided data - must copy to a new dense array
  // We'll create a new TypedArray of the correct size and copy elements one by one
  let target;
  if (isFloat) target = new Float32Array(count * numComponents);
  else if (isUShort) target = new Uint16Array(count * numComponents);
  else if (isUInt) target = new Uint32Array(count * numComponents);
  else target = new Uint8Array(count * numComponents);

  const dataView = new DataView(buffer);
  let readOffset = byteOffset;

  for (let i = 0; i < count; i++) {
    for (let j = 0; j < numComponents; j++) {
      const valOffset = readOffset + j * bytesPerComponent;
      if (isFloat) target[i * numComponents + j] = dataView.getFloat32(valOffset, true);
      else if (isUShort) target[i * numComponents + j] = dataView.getUint16(valOffset, true);
      else if (isUInt) target[i * numComponents + j] = dataView.getUint32(valOffset, true);
      else target[i * numComponents + j] = dataView.getUint8(valOffset);
    }
    readOffset += stride;
  }

  return target;
}

export async function loadCheckerModel(device, url = '/checker.glb') {
  // fetch glb
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const contentType = res.headers.get('content-type') || '(unknown)';
  let ab = await res.arrayBuffer();
  try { console.debug('loadCheckerModel: fetched', { url, contentType, size: ab.byteLength }); } catch (e) { }

  let view = new DataView(ab);
  // header — check for GLB magic
  const magic = readUint32(view, 0);
  const GLB_MAGIC = 0x46546C67; // 'glTF'
  let json = null;
  let version = null;
  let length = null;
  // byte buffer for BIN chunk (either from GLB or extracted from embedded-data glTF)
  let binBuffer = null;

  if (magic === GLB_MAGIC) {
    version = readUint32(view, 4);
    length = readUint32(view, 8);

    // first chunk (JSON)
    let offset = 12;
    const jsonChunkLen = readUint32(view, offset); offset += 4;
    const jsonChunkType = readUint32(view, offset); offset += 4;
    const JSON_CHUNK = 0x4E4F534A;
    if (jsonChunkType !== JSON_CHUNK) throw new Error('GLB missing JSON chunk');
    const jsonText = new TextDecoder().decode(new Uint8Array(ab, offset, jsonChunkLen));
    offset += jsonChunkLen;
    json = JSON.parse(jsonText);

    // next chunk should be BIN
    if (offset + 8 <= length) {
      const binChunkLen = readUint32(view, offset); offset += 4;
      const binChunkType = readUint32(view, offset); offset += 4;
      const BIN_CHUNK = 0x004E4942; // 'BIN\0'
      if (binChunkType === BIN_CHUNK) {
        binBuffer = ab.slice(offset, offset + binChunkLen);
        offset += binChunkLen;
      }
    }
  } else {
    // Not a binary GLB — attempt to detect JSON .gltf with embedded buffers
    try {
      const text = new TextDecoder().decode(new Uint8Array(ab));
      if (text.trim().startsWith('{')) {
        json = JSON.parse(text);
        // if buffer uses data:...;base64, extract it
        if (json.buffers && json.buffers.length > 0 && typeof json.buffers[0].uri === 'string') {
          const uri = json.buffers[0].uri;
          if (uri.startsWith('data:')) {
            const comma = uri.indexOf(',');
            const meta = uri.substring(5, comma);
            const isBase64 = meta.includes('base64');
            const b64 = uri.substring(comma + 1);
            if (isBase64) {
              const binStr = atob(b64);
              const buf = new Uint8Array(binStr.length);
              for (let i = 0; i < binStr.length; i++) buf[i] = binStr.charCodeAt(i);
              binBuffer = buf.buffer;
            }
          } else {
            // external buffer URI (not supported by this minimal loader) — try to fetch relative to the model
            // resolve relative path
            try {
              const base = new URL(url, location.href);
              const bufUrl = new URL(json.buffers[0].uri, base).toString();
              // attempt fetching the external buffer
              try {
                const binRes = await fetch(bufUrl);
                if (binRes.ok) binBuffer = await binRes.arrayBuffer();
                else console.warn('loadCheckerModel: external buffer fetch failed', { bufUrl, status: binRes.status });
              } catch (e) { console.warn('loadCheckerModel: error fetching external buffer', e); }
            } catch (e) {
              console.warn('loadCheckerModel: failed to resolve external buffer URI', e);
            }
          }
        }
      }
    } catch (e) {
      console.warn('loadCheckerModel: not a GLB and failed JSON/gltf parse', { url, contentType, err: e?.message });
    }

    if (!json) throw new Error('Not a GLB file');
  }

  // json and binBuffer are prepared above (either from binary GLB or embedded/external glTF)

  if (!json.meshes || json.meshes.length === 0) throw new Error('GLTF has no meshes');
  const mesh = json.meshes[0];
  if (!mesh.primitives || mesh.primitives.length === 0) throw new Error('mesh has no primitives');

  const accessors = json.accessors || [];
  const bufferViews = json.bufferViews || [];

  // Helper to read accessor data
  function readAccessorData(accessorIndex) {
    if (accessorIndex === undefined) return null;
    const accessor = accessors[accessorIndex];
    if (!accessor) return null;
    const bv = bufferViews[accessor.bufferView];
    const byteOffset = (bv.byteOffset || 0) + (accessor.byteOffset || 0);
    return getTypedArrayForAccessor(accessor.componentType, accessor.count, accessor.type, binBuffer, byteOffset, bv.byteStride);
  }

  // helper to normalize integer data if needed
  const normalizeIfNeeded = (data, accessorIndex) => {
    if (!data || data instanceof Float32Array) return data;

    const accessor = accessors[accessorIndex];
    if (!accessor) return data; // Should not happen if data is not null

    // If the accessor explicitly says it's normalized, or if it's a common attribute like UV/Normal
    // that we expect as floats, convert it.
    const shouldNormalize = accessor.normalized || ['TEXCOORD_0', 'NORMAL', 'TANGENT'].includes(accessor.name);

    if (!shouldNormalize) return data; // No normalization needed

    const result = new Float32Array(data.length);
    let divisor = 1.0;
    switch (accessor.componentType) {
      case 5123: // USHORT
        divisor = 65535.0;
        break;
      case 5121: // UBYTE
        divisor = 255.0;
        break;
      case 5122: // SHORT
        divisor = 32767.0;
        break;
      case 5120: // BYTE
        divisor = 127.0;
        break;
      default:
        // For other types, no normalization needed or handled by getTypedArrayForAccessor
        return data;
    }

    for (let i = 0; i < data.length; i++) {
      result[i] = data[i] / divisor;
    }
    return result;
  };

  // 1. Calculate total size
  let totalVerts = 0;
  let totalIndices = 0;
  for (const prim of mesh.primitives) {
    const posAcc = accessors[prim.attributes.POSITION];
    if (posAcc) totalVerts += posAcc.count;
    const idxAcc = (prim.indices !== undefined) ? accessors[prim.indices] : null;
    if (idxAcc) totalIndices += idxAcc.count;
  }

  // 2. Allocate unified arrays
  const posAll = new Float32Array(totalVerts * 3);
  const normAll = new Float32Array(totalVerts * 3);
  const uvAll = new Float32Array(totalVerts * 2);
  const tanAll = new Float32Array(totalVerts * 4);
  const idxAll = new Uint32Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;
  let bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };

  // 3. Merge primitives
  for (const prim of mesh.primitives) {
    const posRaw = readAccessorData(prim.attributes.POSITION);
    const normRaw = readAccessorData(prim.attributes.NORMAL);
    const uvRaw = readAccessorData(prim.attributes.TEXCOORD_0);
    const tanRaw = readAccessorData(prim.attributes.TANGENT);

    const posF = posRaw; // POSITION is always float or normalized int that getTypedArrayForAccessor handles
    const normF = normalizeIfNeeded(normRaw, prim.attributes.NORMAL);
    const uvF = normalizeIfNeeded(uvRaw, prim.attributes.TEXCOORD_0);
    const tanF = normalizeIfNeeded(tanRaw, prim.attributes.TANGENT);

    const primVertCount = posF ? (posF.length / 3) : 0;
    if (primVertCount === 0) continue; // Skip primitives without positions

    // Copy vertices
    posAll.set(posF, vOffset * 3);

    if (normF) {
      normAll.set(normF, vOffset * 3);
    } else {
      // Fill with default normal (e.g., [0,1,0]) if not present
      for (let k = 0; k < primVertCount; k++) {
        normAll[(vOffset + k) * 3 + 1] = 1.0; // Y-up default
      }
    }

    if (uvF) {
      uvAll.set(uvF, vOffset * 2);
    } // else: uvAll remains 0s for this section

    if (tanF) {
      tanAll.set(tanF, vOffset * 4);
    } else {
      // if no tangent, generate dummy [1,0,0,1] for this chunk
      for (let k = 0; k < primVertCount; k++) {
        tanAll[(vOffset + k) * 4 + 0] = 1.0; // X-axis tangent
        tanAll[(vOffset + k) * 4 + 3] = 1.0; // W component for handedness
      }
    }

    // Update bounds
    for (let i = 0; i < posF.length; i += 3) {
      const x = posF[i], y = posF[i + 1], z = posF[i + 2];
      if (x < bounds.min[0]) bounds.min[0] = x;
      if (x > bounds.max[0]) bounds.max[0] = x;
      if (y < bounds.min[1]) bounds.min[1] = y;
      if (y > bounds.max[1]) bounds.max[1] = y;
      if (z < bounds.min[2]) bounds.min[2] = z;
      if (z > bounds.max[2]) bounds.max[2] = z;
    }

    // Copy indices with offset
    if (prim.indices !== undefined) {
      const idx = readAccessorData(prim.indices);
      for (let k = 0; k < idx.length; k++) {
        idxAll[iOffset + k] = idx[k] + vOffset;
      }
      iOffset += idx.length;
    }

    vOffset += primVertCount;
  }

  bounds.size = [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]];
  bounds.center = [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2];

  // Assign to variables expected by rest of function
  const pos = posAll;
  const norm = normAll;
  const uvs = uvAll;
  const tan = tanAll;
  const indices = idxAll;

  // create GPU buffers
  function createGPUBuffer(arr, usage) {
    const typed = arr instanceof ArrayBuffer ? new Uint8Array(arr) : arr;
    const byteLength = typed.byteLength;
    const buf = device.createBuffer({ size: (byteLength + 3) & ~3, usage, mappedAtCreation: false });
    device.queue.writeBuffer(buf, 0, typed.buffer || typed, typed.byteOffset || 0, typed.byteLength || typed.length);
    return buf;
  }

  const posBuf = createGPUBuffer(new Float32Array(pos.buffer ? pos.buffer : pos), GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
  const normBuf = norm ? createGPUBuffer(new Float32Array(norm.buffer ? norm.buffer : norm), GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST) : null;
  const tanBuf = tan ? createGPUBuffer(new Float32Array(tan.buffer ? tan.buffer : tan), GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST) : null;
  const uvSource = uvs ? uvs : generatedUVs;
  const uvBuf = uvSource ? createGPUBuffer(new Float32Array(uvSource.buffer ? uvSource.buffer : uvSource), GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST) : null;
  const idxBuf = createGPUBuffer(indices, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST);

  const indexFormat = indices instanceof Uint16Array ? 'uint16' : 'uint32';

  async function resolveMaterial() {
    try {
      const emptyMat = { baseColor: null, normal: null, orm: null, emissive: null, factors: { baseColor: [1, 1, 1, 1], metallic: 1, roughness: 1 } };

      // We merged all primitives, so we assume they share the same material (or we just use the first one).
      const firstPrim = mesh.primitives[0];
      if (firstPrim.material === undefined) return emptyMat;

      if (!json.materials) return emptyMat;
      const mat = json.materials[firstPrim.material];
      if (!mat) return emptyMat;

      // Extract Factors
      const factors = {
        baseColor: mat.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1],
        metallic: mat.pbrMetallicRoughness?.metallicFactor !== undefined ? mat.pbrMetallicRoughness.metallicFactor : 1.0,
        roughness: mat.pbrMetallicRoughness?.roughnessFactor !== undefined ? mat.pbrMetallicRoughness.roughnessFactor : 1.0,
      };

      // Helper to load a texture by generic texture info object
      async function loadTex(texInfo) {
        if (!texInfo || typeof texInfo.index !== 'number') return null;
        const tex = json.textures ? json.textures[texInfo.index] : null;
        if (!tex || typeof tex.source !== 'number') return null;
        const imgDef = json.images ? json.images[tex.source] : null;
        if (!imgDef) return null;

        // helper: get bytes either from bufferView (GLB) or data: uri or external uri
        async function getImageBlob() {
          if (imgDef.bufferView !== undefined) {
            const bv = bufferViews[imgDef.bufferView];
            if (!bv) return null;
            const bOffset = bv.byteOffset || 0;
            const bLength = bv.byteLength || 0;
            if (!binBuffer) return null;
            const bytes = new Uint8Array(binBuffer, bOffset, bLength);
            const mime = imgDef.mimeType || 'image/png';
            return new Blob([bytes], { type: mime });
          }

          if (imgDef.uri && typeof imgDef.uri === 'string') {
            // data: URIs
            if (imgDef.uri.startsWith('data:')) {
              const comma = imgDef.uri.indexOf(',');
              if (comma < 0) return null;
              const meta = imgDef.uri.substring(5, comma);
              const isBase64 = meta.includes('base64');
              const b64 = imgDef.uri.substring(comma + 1);
              if (isBase64) {
                const binStr = atob(b64);
                const buf = new Uint8Array(binStr.length);
                for (let i = 0; i < binStr.length; i++) buf[i] = binStr.charCodeAt(i);
                const mime = meta.split(';')[0] || 'image/png';
                return new Blob([buf], { type: mime });
              }
            }
            // external URI
            try {
              const base = new URL(url, location.href);
              const imgUrl = new URL(imgDef.uri, base).toString();
              const r = await fetch(imgUrl);
              if (!r.ok) return null;
              return await r.blob();
            } catch (e) {
              console.warn('loadCheckerModel: failed to fetch external image', imgDef.uri, e);
              return null;
            }
          }
          return null;
        }

        const blob = await getImageBlob();
        if (!blob) return null;
        try {
          return await createImageBitmap(blob);
        } catch (e) {
          console.warn('loadCheckerModel: createImageBitmap failed', e);
          return null;
        }
      }

      // Load all textures in parallel
      const [baseColor, normal, orm, emissive] = await Promise.all([
        loadTex(mat.pbrMetallicRoughness?.baseColorTexture),
        loadTex(mat.normalTexture),
        loadTex(mat.pbrMetallicRoughness?.metallicRoughnessTexture), // ORM
        loadTex(mat.emissiveTexture)
      ]);

      return { baseColor, normal, orm, emissive, factors };

    } catch (e) {
      console.warn('loadCheckerGLB: failed to resolve material', e);
      return { baseColor: null, normal: null, orm: null, emissive: null, factors: { baseColor: [1, 1, 1, 1], metallic: 1, roughness: 1 } };
    }
  }

  const material = await resolveMaterial();

  return { posBuf, normBuf, tanBuf, uvBuf, idxBuf, indexFormat, indexCount: indices.length, bounds, material };
}

export default loadCheckerModel;
