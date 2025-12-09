import { INSTANCE_SIZE } from '../constants/constants.js';
import { cubeGeometry } from '../constants/geometry.js';
import { sphereGeometry } from '../constants/sphereGeometry.js';

/**
 * createBuffers — allocate GPU buffers for the cube geometry and instances.
 * Pre-creates vertex/index buffers and an instance buffer sized for max instances.
 * Returns handles plus a recreateInstanceBuffer helper for dynamic resizing.
 */
export function createBuffers(device, initialMaxInstances = 200) {
  const posBuf = device.createBuffer({
    size: cubeGeometry.positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(posBuf, 0, cubeGeometry.positions);

  const normBuf = device.createBuffer({
    size: cubeGeometry.normals.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(normBuf, 0, cubeGeometry.normals);

  const idxBuf = device.createBuffer({
    size: cubeGeometry.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(idxBuf, 0, cubeGeometry.indices);

  // --- sky sphere buffers (separate mesh used for the sky dome) ---
  const skyPosBuf = device.createBuffer({
    size: sphereGeometry.positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(skyPosBuf, 0, sphereGeometry.positions);

  const skyUvBuf = device.createBuffer({
    size: sphereGeometry.uvs.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(skyUvBuf, 0, sphereGeometry.uvs);

  const skyIdxBuf = device.createBuffer({
    size: sphereGeometry.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(skyIdxBuf, 0, sphereGeometry.indices);

  let maxInstances = initialMaxInstances;
  let instanceBuf = device.createBuffer({
    size: maxInstances * INSTANCE_SIZE,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });

  const uniformBufferSize = (16 + 4) * 4; // vp(16) + lightDir(4)
  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  // Additional uniform buffer for the sky pipeline: vp + camPos.xyz + radius
  const skyUniformSize = (16 + 4) * 4; // reuse 20 float slots (vp + 4 floats for camPos/radius)
  const skyUniformBuffer = device.createBuffer({
    size: skyUniformSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  /**
   * recreateInstanceBuffer — expand the instance buffer when capacity is exceeded.
   * Destroys the old GPU buffer and allocates a new one with larger size.
   * No-op if requested size is less than or equal to the current capacity.
   */
  function recreateInstanceBuffer(newMax) {
    if (newMax <= maxInstances) return;
    instanceBuf.destroy();
    maxInstances = newMax;
    instanceBuf = device.createBuffer({
      size: maxInstances * INSTANCE_SIZE,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
  }

  return {
    posBuf, normBuf, idxBuf,
    // sky resources
    skyPosBuf, skyUvBuf, skyIdxBuf, skyIndexCount: sphereGeometry.indices.length,
    // checker GLB primitive (will be assigned after GLB load)
    checker: null, // expects { posBuf, normBuf, uvBuf, tanBuf, idxBuf, indexFormat, indexCount }
    get instanceBuf() { return instanceBuf; },
    uniformBuffer,
    skyUniformBuffer,
    get maxInstances() { return maxInstances; },
    recreateInstanceBuffer
  };
}
