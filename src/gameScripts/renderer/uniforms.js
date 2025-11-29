/**
 * createUniformBuffer — allocate a uniform buffer for view-projection and lighting.
 * The created buffer reserves space for a 4x4 matrix plus a small light vector.
 * Returned buffer should be updated each frame using updateUniforms().
 */
export function createUniformBuffer(device) {
  const size = 20 * 4;
  return device.createBuffer({
    size,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
}

/**
 * updateUniforms — write the view-projection matrix and lighting into the buffer.
 * Accepts a vpMatrix (mat4), light direction and optional time for shader effects.
 * Uses device.queue.writeBuffer to push data into the GPU uniform buffer.
 */
export function updateUniforms(device, uniformBuffer, vpMatrix, lightDir = [0.5, 0.8, 0.6], time = 0) {
  const data = new Float32Array(20);
  data.set(vpMatrix, 0); 
  data[16] = lightDir[0];  
  data[17] = lightDir[1];  
  data[18] = lightDir[2];  
  data[19] = time;         
  device.queue.writeBuffer(uniformBuffer, 0, data);
}