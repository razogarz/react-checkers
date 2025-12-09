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
 * Supports PBR layout (112 bytes):
 * - VP Matrix (64 bytes)
 * - LightDir (16 bytes, vec4)
 * - ViewPos (16 bytes, vec4)
 * - Params (16 bytes, vec4: exposure, time, unused, unused)
 */
export function updateUniforms(device, uniformBuffer, vpMatrix, lightDir = [0.5, 0.8, 0.6], eye = [0, 0, 0], time = 0) {
  const data = new Float32Array(28); // 112 bytes / 4

  // 1. View Projection (0-15)
  data.set(vpMatrix, 0);

  // 2. Light Direction (16-19)
  data[16] = lightDir[0];
  data[17] = lightDir[1];
  data[18] = lightDir[2];
  data[19] = 0.0; // padding

  // 3. View Position (20-23)
  data[20] = eye[0];
  data[21] = eye[1];
  data[22] = eye[2];
  data[23] = 0.0; // padding

  // 4. Params (24-27)
  data[24] = 1.5; // Exposure (increased from 1.0 for brightness)
  data[25] = time; // Time
  data[26] = 0.0;
  data[27] = 0.0;

  device.queue.writeBuffer(uniformBuffer, 0, data);
}

/**
 * createSkyUniformBuffer — allocate a uniform buffer for sky shader (vp + camPos + radius)
 */
export function createSkyUniformBuffer(device) {
  const size = 20 * 4; // vp(16) + camPos.xyz + radius
  return device.createBuffer({ size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
}

/**
 * updateSkyUniforms — write vp matrix, camera position and sky radius into the buffer.
 */
export function updateSkyUniforms(device, skyUniformBuffer, vpMatrix, camPos = [0, 0, 0], radius = 50.0) {
  const data = new Float32Array(20);
  data.set(vpMatrix, 0);
  data[16] = camPos[0];
  data[17] = camPos[1];
  data[18] = camPos[2];
  data[19] = radius;
  device.queue.writeBuffer(skyUniformBuffer, 0, data);
}