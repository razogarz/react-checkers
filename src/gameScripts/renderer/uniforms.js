export function createUniformBuffer(device) {
  // mat4 (16 floats) + vec4 (lightDir.xyz + time) = 20 floats = 80 bytes
  const size = 20 * 4;
  return device.createBuffer({
    size,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
}

export function updateUniforms(device, uniformBuffer, vpMatrix, lightDir = [0.5, 0.8, 0.6], time = 0) {
  const data = new Float32Array(20);
  data.set(vpMatrix, 0); // mat4 at offset 0-15
  data[16] = lightDir[0];  // lightDir.x
  data[17] = lightDir[1];  // lightDir.y
  data[18] = lightDir[2];  // lightDir.z
  data[19] = time;         // time in seconds
  device.queue.writeBuffer(uniformBuffer, 0, data);
}