export function renderPass(device, context, pipeline, uniformBindGroup, buffers, depthState, instanceManager) {
  // Validate pipeline before use
  if (!pipeline) {
    console.error('Pipeline is undefined!');
    return;
  }

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
  // Use the buffer names returned by createBuffers: posBuf / normBuf / idxBuf
  if (!buffers.posBuf || !buffers.normBuf || !buffers.idxBuf || !buffers.instanceBuf) {
    console.error('Missing buffers on render call:', {
      posBuf: !!buffers.posBuf,
      normBuf: !!buffers.normBuf,
      idxBuf: !!buffers.idxBuf,
      instanceBuf: !!buffers.instanceBuf
    });
    pass.end();
    return;
  }

  pass.setVertexBuffer(0, buffers.posBuf);
  pass.setVertexBuffer(1, buffers.normBuf);
  pass.setVertexBuffer(2, buffers.instanceBuf);
  pass.setIndexBuffer(buffers.idxBuf, 'uint16');
  pass.drawIndexed(36, instanceManager.instanceCount, 0, 0, 0); // 36 indices for cube

  pass.end();
  device.queue.submit([commandEncoder.finish()]);
}