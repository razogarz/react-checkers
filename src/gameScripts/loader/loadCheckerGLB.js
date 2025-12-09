import { loadGLB } from "./loadGLB.js";

/**
 * loadCheckerModel — loads checker.glb and extracts a single primitive
 * containing:
 *   position buffer
 *   normal buffer
 *   index buffer
 * 
 * This version ignores UVs, tangents, materials — ideal for your current
 * non-textured pipeline.
 */
export async function loadCheckerModel(device, url = "/checker.glb") {
  const model = await loadGLB(url);
  if (!model.meshes.length) throw new Error("checker.glb: no meshes");

  const prim = model.meshes[0].primitives[0]; // one mesh, one primitive

  if (!prim.attributes.POSITION || !prim.attributes.NORMAL || !prim.indices) {
    throw new Error("checker.glb missing POSITION / NORMAL / INDICES");
  }

  // --- Create GPU buffers ---

  // Position buffer -------------------------
  const posData = prim.attributes.POSITION.array;
  const posBuf = device.createBuffer({
    size: posData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(posBuf, 0, posData);

  // Normal buffer ---------------------------
  const normData = prim.attributes.NORMAL.array;
  const normBuf = device.createBuffer({
    size: normData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(normBuf, 0, normData);

  // Index buffer ----------------------------
  const idxData = prim.indices.array;
  const indexFormat = (prim.indices.componentType === 5123) ? "uint16" : "uint32";

  const idxBuf = device.createBuffer({
    size: idxData.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(idxBuf, 0, idxData);

  return {
    posBuf,
    normBuf,
    idxBuf,
    indexFormat,
    indexCount: prim.indices.count
  };
}
