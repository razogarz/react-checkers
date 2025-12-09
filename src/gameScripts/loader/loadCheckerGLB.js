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
  const ab = await res.arrayBuffer();

  const view = new DataView(ab);
  // header
  const magic = readUint32(view, 0);
  const GLB_MAGIC = 0x46546C67; // 'glTF'
  if (magic !== GLB_MAGIC) throw new Error('Not a GLB file');
  const version = readUint32(view, 4);
  const length = readUint32(view, 8);

  // first chunk (JSON)
  let offset = 12;
  const jsonChunkLen = readUint32(view, offset); offset += 4;
  const jsonChunkType = readUint32(view, offset); offset += 4;
  const JSON_CHUNK = 0x4E4F534A;
  if (jsonChunkType !== JSON_CHUNK) throw new Error('GLB missing JSON chunk');
  const jsonText = new TextDecoder().decode(new Uint8Array(ab, offset, jsonChunkLen));
  offset += jsonChunkLen;
  const json = JSON.parse(jsonText);

  // next chunk should be BIN
  let binBuffer = null;
  if (offset + 8 <= length) {
    const binChunkLen = readUint32(view, offset); offset += 4;
    const binChunkType = readUint32(view, offset); offset += 4;
    const BIN_CHUNK = 0x004E4942; // 'BIN\0'
    if (binChunkType === BIN_CHUNK) {
      binBuffer = ab.slice(offset, offset + binChunkLen);
      offset += binChunkLen;
    }
  }

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
  const idxBuf = createGPUBuffer(indices, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST);

  const indexFormat = indices instanceof Uint16Array ? 'uint16' : 'uint32';

  return { posBuf, normBuf, idxBuf, indexFormat, indexCount: indices.length, bounds };
}

export default loadCheckerModel;
