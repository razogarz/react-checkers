/**
 * renderPass — record and submit a render pass for the current frame.
 * Binds vertex/index/instance buffers, sets pipeline & bind groups and draws
 * the configured cube mesh using instanced rendering from instanceManager.
 *
 * Now supports:
 *  - drawing the first N instances as instanced cubes (board squares)
 *  - drawing checker GLB primitive instances (using same instance buffer)
 *  - drawing remaining instances (crowns, markers, etc.) as instanced cubes
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

  // Use the main pipeline for scene geometry
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, uniformBindGroup);

  // --- 1) draw board squares (first N instances) using cube geometry ---
  const cubeInstances = instanceManager.cubeCount || 0;
  if (cubeInstances > 0) {
    pass.setVertexBuffer(0, buffers.posBuf);
    pass.setVertexBuffer(1, buffers.normBuf);
    pass.setVertexBuffer(2, buffers.instanceBuf);
    pass.setIndexBuffer(buffers.idxBuf, 'uint16');
    pass.drawIndexed(36, cubeInstances, 0, 0, 0); // 36 indices for cube
  }

  // --- 2) draw GLB checkers (if available) using the same instance buffer ---
  if (buffers.checker && instanceManager.checkerCount > 0) {
    const checker = buffers.checker;
    pass.setVertexBuffer(0, checker.posBuf);
    pass.setVertexBuffer(1, checker.normBuf);
    pass.setVertexBuffer(2, buffers.instanceBuf);
    pass.setIndexBuffer(checker.idxBuf, checker.indexFormat || 'uint32');

    pass.drawIndexed(
      checker.indexCount,
      instanceManager.checkerCount,
      0,
      instanceManager.firstCheckerIndex,
      0
    );
  }

  // --- 3) draw remaining instances (crowns, markers, glow, valid moves) ---
  const startRemaining = (instanceManager.firstCheckerIndex || 0) + (instanceManager.checkerCount || 0);
  const remainingCount = Math.max(0, (instanceManager.instanceCount || 0) - startRemaining);
  if (remainingCount > 0) {
    pass.setVertexBuffer(0, buffers.posBuf);
    pass.setVertexBuffer(1, buffers.normBuf);
    pass.setVertexBuffer(2, buffers.instanceBuf);
    pass.setIndexBuffer(buffers.idxBuf, 'uint16');
    pass.drawIndexed(36, remainingCount, 0, startRemaining, 0);
  }

  pass.end();
  device.queue.submit([commandEncoder.finish()]);
}
