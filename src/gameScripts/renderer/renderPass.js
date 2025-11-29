/**
 * renderPass — record and submit a render pass for the current frame.
 * Binds vertex/index/instance buffers, sets pipeline & bind groups and draws
 * the configured cube mesh using instanced rendering from instanceManager.
 */
export function renderPass(device, context, pipeline, uniformBindGroup, buffers, depthState, instanceManager) {
  const commandEncoder = device.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();

  const pass = commandEncoder.beginRenderPass({
    colorAttachments: [{
      view: textureView,
      clearValue: { r: 0.07, g: 0.07, b: 0.09, a: 1.0 },
      loadOp: 'clear',
      storeOp: 'store'
    }],
    depthStencilAttachment: {
      view: depthState.texture.createView(),
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store'
    }
  });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, uniformBindGroup);

  pass.setVertexBuffer(0, buffers.posBuf);
  pass.setVertexBuffer(1, buffers.normBuf);
  pass.setVertexBuffer(2, buffers.instanceBuf);
  pass.setIndexBuffer(buffers.idxBuf, 'uint16');
  
  pass.drawIndexed(36, instanceManager.instanceCount, 0, 0, 0); // 36 indices for cube

  pass.end();
  device.queue.submit([commandEncoder.finish()]);
}