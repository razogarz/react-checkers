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
