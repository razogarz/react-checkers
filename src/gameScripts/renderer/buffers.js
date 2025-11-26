import { INSTANCE_SIZE } from '../constants.js';
import { cubeGeometry } from '../geometry.js';

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
    get instanceBuf() { return instanceBuf; },
    uniformBuffer,
    get maxInstances() { return maxInstances; },
    recreateInstanceBuffer
  };
}
