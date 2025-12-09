import { INSTANCE_SIZE } from '../constants/constants.js';
import { cubeGeometry } from '../constants/geometry.js';
import { sphereGeometry } from '../constants/sphereGeometry.js';
import { cylinderGeometry } from '../constants/cylinderGeometry.js';

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

  const uvBuf = device.createBuffer({
    size: cubeGeometry.uvs.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(uvBuf, 0, cubeGeometry.uvs);

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

  // cylinder geometry buffers (for crown markers)
  const cylinderPosBuf = device.createBuffer({
    size: cylinderGeometry.positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(cylinderPosBuf, 0, cylinderGeometry.positions);

  const cylinderNormBuf = device.createBuffer({
    size: cylinderGeometry.normals.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(cylinderNormBuf, 0, cylinderGeometry.normals);

  const cylinderIdxBuf = device.createBuffer({
    size: cylinderGeometry.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(cylinderIdxBuf, 0, cylinderGeometry.indices);

  let maxInstances = initialMaxInstances;
  let instanceBuf = device.createBuffer({
    size: maxInstances * INSTANCE_SIZE,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });

  // a single-instance buffer usable for drawing one-off models (like a table)
  const singleInstanceData = new Float32Array(21);
  // identity mat4
  singleInstanceData.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], 0);
  // color rgb at indices 16..18
  singleInstanceData[16] = 1.0; singleInstanceData[17] = 1.0; singleInstanceData[18] = 1.0;
  singleInstanceData[19] = 0.0; // reserved
  singleInstanceData[20] = 0.0; // pulse

  const singleInstanceBuf = device.createBuffer({ size: INSTANCE_SIZE, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(singleInstanceBuf, 0, singleInstanceData);

  // a second single-instance buffer reserved for one-off draws like a ground/large cube
  const groundInstanceData = new Float32Array(21);
  groundInstanceData.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], 0);
  // default ground color -- a soft green (overridden from renderer when placed)
  groundInstanceData[16] = 0.12; groundInstanceData[17] = 0.5; groundInstanceData[18] = 0.15;
  groundInstanceData[19] = 0.0; groundInstanceData[20] = 0.0;
  const groundInstanceBuf = device.createBuffer({ size: INSTANCE_SIZE, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(groundInstanceBuf, 0, groundInstanceData);

  // Uniform buffer size: must be large enough for the largest uniform struct (PBR: 112 bytes)
  // PBR Struct U: mat4(64) + vec4(16) + vec4(16) + vec4(16) = 112 bytes
  const uniformBufferSize = 112;
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
    posBuf, normBuf, uvBuf, idxBuf,
    // sky resources
    skyPosBuf, skyUvBuf, skyIdxBuf, skyIndexCount: sphereGeometry.indices.length,
    // cylinder (crown) resources
    cylinderPosBuf, cylinderNormBuf, cylinderIdxBuf, cylinderIndexCount: cylinderGeometry.indices.length,
    get instanceBuf() { return instanceBuf; },
    singleInstanceBuf,
    groundInstanceBuf,
    uniformBuffer,
    skyUniformBuffer,
    get maxInstances() { return maxInstances; },
    recreateInstanceBuffer
  };
}
