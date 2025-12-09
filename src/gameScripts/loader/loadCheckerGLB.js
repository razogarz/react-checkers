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

function getTypedArrayForAccessor(componentType, count, accessorType, buffer, byteOffset) {
  // Only a few combinations needed: FLOAT vec3, UNSIGNED_SHORT/UNSIGNED_INT scalar indices
  if (componentType === 5126) { // FLOAT
    // 'VEC2' -> 2, 'VEC3' -> 3, 'VEC4' -> 4
    const comps = accessorType === 'VEC2' ? 2 : accessorType === 'VEC4' ? 4 : 3;
    return new Float32Array(buffer, byteOffset, count * comps);
  }
  if (componentType === 5123) { // UNSIGNED_SHORT
    return new Uint16Array(buffer, byteOffset, count);
  }
  if (componentType === 5125) { // UNSIGNED_INT
    return new Uint32Array(buffer, byteOffset, count);
  }
  // fallback - return raw Uint8Array
  return new Uint8Array(buffer, byteOffset, count);
}

export async function loadCheckerModel(device, url = '/checker.glb') {
  // fetch glb
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const contentType = res.headers.get('content-type') || '(unknown)';
  let ab = await res.arrayBuffer();
  try { console.debug('loadCheckerModel: fetched', { url, contentType, size: ab.byteLength }); } catch (e) {}

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
  const prim = mesh.primitives[0];

  // need accessors, bufferViews
  const accessors = json.accessors || [];
  const bufferViews = json.bufferViews || [];

  function readAccessor(name) {
    const attrIndex = prim.attributes[name];
    if (attrIndex === undefined) return null;
    const accessor = accessors[attrIndex];
    if (!accessor) return null;
    const bv = bufferViews[accessor.bufferView];
    const byteOffset = (bv.byteOffset || 0) + (accessor.byteOffset || 0);
    return getTypedArrayForAccessor(accessor.componentType, accessor.count, accessor.type, binBuffer, byteOffset);
  }

  const pos = readAccessor('POSITION');
  const norm = readAccessor('NORMAL');
  // try reading texture coordinates (optional)
  const uvs = readAccessor('TEXCOORD_0');
  const idxAccessorIndex = prim.indices;
  let indices = null;
  if (typeof idxAccessorIndex === 'number') {
    const idxAcc = accessors[idxAccessorIndex];
    const bv = bufferViews[idxAcc.bufferView];
    const byteOffset = (bv.byteOffset || 0) + (idxAcc.byteOffset || 0);
    indices = getTypedArrayForAccessor(idxAcc.componentType, idxAcc.count, idxAcc.type, binBuffer, byteOffset);
  }

  if (!pos || !indices) throw new Error('checker.glb missing POSITION or indices');

  // compute bounds
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i+1], z = pos[i+2];
    if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
  }
  const bounds = { min: [minX, minY, minZ], max: [maxX, maxY, maxZ], size: [maxX-minX, maxY-minY, maxZ-minZ], center: [(minX+maxX)/2, (minY+maxY)/2, (minZ+maxZ)/2] };

  // If model lacks TEXCOORD_0 but has positions, generate a simple planar UV set mapped using X/Z bounds.
  let generatedUVs = null;
  if (!uvs && pos && pos.length >= 3) {
    try {
      const vertCount = pos.length / 3;
      const minXv = bounds.min[0], maxXv = bounds.max[0];
      const minZv = bounds.min[2], maxZv = bounds.max[2];
      const sizeX = (maxXv - minXv) || 1.0;
      const sizeZ = (maxZv - minZv) || 1.0;
      generatedUVs = new Float32Array(vertCount * 2);
      for (let i = 0; i < vertCount; i++) {
        const x = pos[i*3 + 0];
        const z = pos[i*3 + 2];
        const u = (x - minXv) / sizeX;
        const v = (z - minZv) / sizeZ;
        generatedUVs[i*2 + 0] = u;
        generatedUVs[i*2 + 1] = v;
      }
      // don't override existing uvs; generatedUVs will be used when creating GPU buffer
      console.debug('loadCheckerModel: generated planar UVs for model (fallback)');
    } catch (e) {
      console.warn('loadCheckerModel: failed to generate fallback UVs', e);
      generatedUVs = null;
    }
  }

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
  const uvSource = uvs ? uvs : generatedUVs;
  const uvBuf = uvSource ? createGPUBuffer(new Float32Array(uvSource.buffer ? uvSource.buffer : uvSource), GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST) : null;
  const idxBuf = createGPUBuffer(indices, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST);

  const indexFormat = indices instanceof Uint16Array ? 'uint16' : 'uint32';

  // Attempt to resolve a material texture (if the model has one) and produce an ImageBitmap
  async function resolveImageForPrimitive() {
    try {
      if (!prim.material || !json.materials || !json.textures || !json.images) return null;
      const mat = json.materials[prim.material];
      if (!mat) return null;

      // pbrMetallicRoughness.baseColorTexture is the common place for albedo/texture
      const texInfo = mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorTexture;
      if (!texInfo || typeof texInfo.index !== 'number') return null;

      const tex = json.textures[texInfo.index];
      if (!tex || typeof tex.source !== 'number') return null;

      const imgDef = json.images[tex.source];
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
            // otherwise it's likely a plain URI string - fall through to fetching
          }

          // external URI — try to fetch relative to model URL
          try {
            const base = new URL(url, location.href);
            const imgUrl = new URL(imgDef.uri, base).toString();
            const r = await fetch(imgUrl);
            if (!r.ok) return null;
            const b = await r.blob();
            return b;
          } catch (e) {
            console.warn('loadCheckerModel: failed to fetch external image', imgDef.uri, e);
            return null;
          }
        }

        return null;
      }

      const blob = await getImageBlob();
      if (!blob) return null;

      // createImageBitmap is widely supported in browsers and yields a useful object for GPU uploads
      try {
        const bmp = await createImageBitmap(blob);
        return bmp;
      } catch (e) {
        console.warn('loadCheckerModel: createImageBitmap failed', e);
        return null;
      }
    } catch (e) {
      console.warn('loadCheckerModel: failed to resolve image for primitive', e);
      return null;
    }
  }

  const imageBitmap = await resolveImageForPrimitive();

  return { posBuf, normBuf, uvBuf, idxBuf, indexFormat, indexCount: indices.length, bounds, imageBitmap };
}

export default loadCheckerModel;
