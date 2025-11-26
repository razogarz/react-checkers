import { createBuffers } from './buffers.js';
import { createPipeline } from './pipeline.js';
import InstanceManager from './instances.js';
import { ensureDepthTexture } from './depth.js';
import { updateUniforms } from './uniforms.js'; // Changed from updateUniformBuffer
import { renderPass } from './renderPass.js';

export default class Renderer {
  constructor(device, context, canvas, format) {
    this.device = device;
    this.context = context;
    this.canvas = canvas;
    this.format = format;

    this.buffers = null;
    this.pipeline = null;
    this.uniformBindGroup = null;
    this.depthState = { texture: null, width: 0, height: 0 };

    this.instanceManager = null;
  }

  async initialize() {
    this.buffers = createBuffers(this.device, 200);

    const p = await createPipeline(this.device, this.format, this.buffers.uniformBuffer);
    this.pipeline = p.pipeline;
    this.uniformBindGroup = p.uniformBindGroup;

    this.instanceManager = new InstanceManager(
      this.device,
      this.buffers,
      () => this.buffers.maxInstances
    );
  }

  buildInstances(gameState) {
    this.instanceManager.buildInstances(gameState);
    this.instanceManager.ensureCapacity(this.buffers.recreateInstanceBuffer);
    this.instanceManager.uploadInstances();
  }

  render(vpMatrix) {
    ensureDepthTexture(this.device, this.canvas, this.depthState);

    const now = performance.now() / 1000;
    updateUniforms(this.device, this.buffers.uniformBuffer, vpMatrix, [0.5, 0.8, 0.6], now);

    renderPass(this.device, this.context, this.pipeline, this.uniformBindGroup, this.buffers, this.depthState, this.instanceManager);
  }
}