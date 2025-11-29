/**
 * ensureDepthTexture — make sure the WebGPU depth texture exists & matches canvas size.
 * Creates a depth texture when missing and updates it if the canvas resized.
 * Returns the (possibly replaced) depthState object for the renderer to use.
 */
export function ensureDepthTexture(device, canvas, depthState) {
  if (depthState.texture &&
      depthState.width === canvas.width &&
      depthState.height === canvas.height) {
    return;
  }

  if (depthState.texture) depthState.texture.destroy();

  depthState.width = canvas.width;
  depthState.height = canvas.height;
  depthState.texture = device.createTexture({
    size: [depthState.width, depthState.height],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT
  });
}
