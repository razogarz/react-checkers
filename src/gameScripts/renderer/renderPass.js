/**
 * renderPass — record and submit a render pass for the current frame.
 * Binds vertex/index/instance buffers, sets pipeline & bind groups and draws
 * the configured cube mesh using instanced rendering from instanceManager.
 */
export function renderPass(device, context, pipeline, uniformBindGroup, buffers, depthState, instanceManager, sky) {
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

  // Draw sky dome first if available
  if (sky && sky.pipeline) {
    pass.setPipeline(sky.pipeline);
    pass.setBindGroup(0, sky.uniformBindGroup);
    pass.setVertexBuffer(0, buffers.skyPosBuf);
    pass.setVertexBuffer(1, buffers.skyUvBuf);
    pass.setIndexBuffer(buffers.skyIdxBuf, 'uint32');
    pass.drawIndexed(buffers.skyIndexCount, 1, 0, 0, 0);
  }

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, uniformBindGroup);

  pass.setVertexBuffer(0, buffers.posBuf);
  pass.setVertexBuffer(1, buffers.normBuf);
  pass.setVertexBuffer(2, buffers.instanceBuf);
  pass.setIndexBuffer(buffers.idxBuf, 'uint16');

  // draw first batch: all board cubes
  pass.drawIndexed(36, instanceManager.cubeCount || 0, 0, 0, 0); // 36 indices for cube

  // draw GLB checker primitives (if available) using the same instance buffer
  if (buffers.checker && instanceManager.checkerCount > 0) {
    try { console.debug('renderPass: drawing GLB checkers', { firstCheckerIndex: instanceManager.firstCheckerIndex, checkerCount: instanceManager.checkerCount, indexCount: buffers.checker.indexCount }); } catch (e) {}
    const checker = buffers.checker;
    pass.setVertexBuffer(0, checker.posBuf);
    pass.setVertexBuffer(1, checker.normBuf);
    pass.setVertexBuffer(2, buffers.instanceBuf);
    pass.setIndexBuffer(checker.idxBuf, checker.indexFormat || 'uint32');

    // drawIndexed(indexCount, instanceCount, firstIndex, baseVertex, firstInstance)
    pass.drawIndexed(checker.indexCount, instanceManager.checkerCount, 0, 0, instanceManager.firstCheckerIndex);

    // restore cube buffers for remaining draws
    pass.setVertexBuffer(0, buffers.posBuf);
    pass.setVertexBuffer(1, buffers.normBuf);
    pass.setVertexBuffer(2, buffers.instanceBuf);
    pass.setIndexBuffer(buffers.idxBuf, 'uint16');
  }

  // draw remaining instances (crowns, markers, glow, valid moves)
  const startRemaining = (instanceManager.firstCheckerIndex || 0) + (instanceManager.checkerCount || 0);
  const remainingCount = Math.max(0, (instanceManager.instanceCount || 0) - startRemaining);
  if (remainingCount > 0) {
    try { console.debug('renderPass: drawing remaining cubes', { startRemaining, remainingCount }); } catch (e) {}
    pass.drawIndexed(36, remainingCount, 0, 0, startRemaining);
  }

  pass.end();
  device.queue.submit([commandEncoder.finish()]);
}