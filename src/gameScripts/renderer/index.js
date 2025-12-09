import { createBuffers } from './buffers.js';
import { createPipeline, createSkyPipeline, createTexturedPipeline } from './pipeline.js';
import InstanceManager from './instances.js';
import { mat4 } from 'gl-matrix';
import { ensureDepthTexture } from './depth.js';
import { BOARD_Y, COLORS } from '../constants/constants.js';
import { updateUniforms, createSkyUniformBuffer, updateSkyUniforms } from './uniforms.js'; // Changed from updateUniformBuffer
import { renderPass } from './renderPass.js';
import { loadCheckerModel } from '../loader/loadCheckerGLB.js';

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
    // pipelineNoCull removed — drawing crowns with the normal culling pipeline
    // pipelineNoCull removed; crowns will be drawn with the main pipeline
    this.uniformBindGroup = p.uniformBindGroup;

    // Create instance manager before performing any async work (prevents races)
    this.instanceManager = new InstanceManager(
      this.device,
      this.buffers,
      () => this.buffers.maxInstances
    );

    // Try loading checker.glb (if present). Attach GPU buffers to buffers.checker.
    try {
      const checker = await loadCheckerModel(this.device, '/checker.glb');
      this.buffers.checker = checker;
      try { console.debug('Checker GLB loaded', { indexCount: checker.indexCount, indexFormat: checker.indexFormat }); } catch (e) {}
    } catch (e) {
      // ignore if missing — fallback to cube-based pieces
      console.info('No checker.glb or load failed - using cube pieces', e?.message || e);
    }

    // Try loading a table model from a few common names (case / extension variants)
    try {
      const tableCandidates = ['/table.glb', '/Table.glb', '/table.gltf', '/Table.gltf'];
      let loaded = null;
      for (const candidate of tableCandidates) {
        try {
          console.debug('Renderer: trying to load table candidate', candidate);
          const table = await loadCheckerModel(this.device, candidate);
          loaded = { table, path: candidate };
          break;
        } catch (e) {
          // not found or failed - keep trying
          console.info('Renderer: table candidate failed', candidate, e?.message || e);
        }
      }
      if (loaded) {
        const table = loaded.table;
        this.buffers.table = table;
        console.debug('Renderer: loaded table from', loaded.path);
        // Diagnostic: log whether the model provided UVs and an embedded image
        try {
          console.debug('Renderer: table diagnostics', {
            hasUv: !!table.uvBuf,
            hasNormals: !!table.normBuf,
            indexCount: table.indexCount,
            indexFormat: table.indexFormat,
            bounds: table.bounds,
            imageBitmap: table.imageBitmap ? { width: table.imageBitmap.width, height: table.imageBitmap.height } : null
          });
        } catch (e) { console.debug('Renderer: failed to log table diagnostics', e); }
      // compute a reasonable placement so the table sits beneath the checker board
      try {
        const sizes = table.bounds.size;
        // desired footprint slightly larger than board (8 units) so table extends under it
        const desiredFootprint = 10.0;
        const maxAxis = Math.max(sizes[0] || 1e-6, sizes[2] || 1e-6);
        const uniformScale = desiredFootprint / maxAxis;

        // position table so its top sits slightly *above* the board surface for visibility during testing
        // (we'll move it underneath once rendering is confirmed on user's machine)
        // table.bounds.max[1] is the highest Y of the model in model space
        const ty = (typeof this.buffers.table.bounds.max[1] === 'number') ? (BOARD_Y - table.bounds.max[1] * uniformScale + 0.02) : BOARD_Y + 0.04;

        const m = mat4.create();
        mat4.translate(m, m, [0.0, ty, 0.0]);
        mat4.scale(m, m, [uniformScale, uniformScale, uniformScale]);

          // write this transform + brown color into the singleInstanceBuf so table is tinted like pieces
          // use COLORS.DARK_SQUARE to pick a warm brown
        if (this.buffers.singleInstanceBuf) {
          const arr = new Float32Array(21);
          arr.set(m, 0);
          arr[16] = (COLORS.DARK_SQUARE[0] || 0.3); arr[17] = (COLORS.DARK_SQUARE[1] || 0.2); arr[18] = (COLORS.DARK_SQUARE[2] || 0.1); arr[19] = 0.0; arr[20] = 0.0;
          this.device.queue.writeBuffer(this.buffers.singleInstanceBuf, 0, arr);
          try { console.debug('Renderer: wrote singleInstanceBuf for table', { ty, uniformScale, bounds: table.bounds }); } catch (e) {}
        }
      } catch (e) {
        console.warn('Failed to place table automatically', e);
      }
        try { console.debug('Table GLB loaded', { indexCount: table.indexCount, indexFormat: table.indexFormat, bounds: table.bounds }); } catch (e) {}
          // If the model itself contained an image for the primitive material we returned an ImageBitmap
          // from the loader (imageBitmap). Prefer that embedded texture rather than fetching /texture/table.png.
          try {
            if (table.imageBitmap) {
              const img = table.imageBitmap; // ImageBitmap
              const tex = this.device.createTexture({ size: [img.width, img.height, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
              // copy the ImageBitmap into the GPU texture
              this.device.queue.copyExternalImageToTexture({ source: img }, { texture: tex }, [img.width, img.height, 1]);
              const sampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
              const texView = tex.createView();
              const tablePipelineObj = await createTexturedPipeline(this.device, this.format, this.buffers.uniformBuffer, sampler, texView);
              this.tablePipeline = tablePipelineObj.pipeline;
              this.tableBindGroup = tablePipelineObj.uniformBindGroup;
              console.debug('Renderer: created textured pipeline for table from embedded image');
            } else {
              console.info('Renderer: table model has no embedded image — not creating textured pipeline');
            }
          } catch (e) {
            // any failure in creating the texture shouldn't break the app; continue without textured table
            console.info('Failed to create textured pipeline from model image', e?.message || e);
          }
      }
    } catch (e) {
      // unexpected error — log and continue without table
      console.warn('Unexpected error trying to load table models', e?.message || e);
    }

    // Sky resources: load panorama texture from public and create pipeline
    this.sky = { pipeline: null, uniformBindGroup: null, texture: null, sampler: null };
    try {
      // create sampler
      const sampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
      // load image from public folder
      const img = await fetch('/Panorama_Sky_04-512x512.png').then(r => r.blob()).then(createImageBitmap);
      // Include RENDER_ATTACHMENT usage because some backends (Dawn) require it
      // when copying external images into GPU textures.
      const tex = this.device.createTexture({ size: [img.width, img.height, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
      this.device.queue.copyExternalImageToTexture({ source: img }, { texture: tex }, [img.width, img.height, 1]);

      // create sky uniform buffer and pipeline
      const skyUniformBuffer = this.buffers.skyUniformBuffer || createSkyUniformBuffer(this.device);
      this.buffers.skyUniformBuffer = skyUniformBuffer;
      
      const skyView = tex.createView();
      const skyPipelineObj = await createSkyPipeline(this.device, this.format, skyUniformBuffer, sampler, skyView);

      this.sky.pipeline = skyPipelineObj.pipeline;
      this.sky.uniformBindGroup = skyPipelineObj.uniformBindGroup;
      this.sky.texture = tex;
      this.sky.sampler = sampler;
      // Seed the sky uniform buffer so the first frame has values even before the camera updates
      try {
        // small initial vp identity and camera at origin
        const identity = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
        // updateSkyUniforms(device, skyUniformBuffer, vpMatrix, camPos, radius)
        updateSkyUniforms(this.device, this.buffers.skyUniformBuffer, identity, [0,0,0], 50.0);
      } catch (e) {
        // don't block if uniforms fail to seed
        console.warn('Failed to seed sky uniforms', e);
      }
      // ensure buffers for sky exist
    } catch (e) {
      // fail gracefully: no sky
      console.warn('Sky initialization failed', e);
      this.sky = null;
    }
    // Add a device lost handler to capture reasons if the GPU device is lost (explains black screens)
    if (this.device && this.device.lost) {
      // device.lost is a promise that resolves when the device is lost; print reason
      this.device.lost.then((info) => { console.error('WebGPU device lost:', info); }).catch((err) => { console.error('device.lost handler failed', err); });
    }
    // instanceManager already created above to avoid races
  }

  buildInstances(gameState) {
    if (!this.instanceManager) {
      // If instanceManager isn't set for any reason, create one on-demand and log.
      console.warn('Renderer.buildInstances called before instanceManager was initialized — creating on-demand.');
      this.instanceManager = new InstanceManager(
        this.device,
        this.buffers,
        () => this.buffers.maxInstances
      );
    }
    this.instanceManager.buildInstances(gameState);
    this.instanceManager.ensureCapacity(this.buffers.recreateInstanceBuffer);
    this.instanceManager.uploadInstances();
  }

  render(vpMatrix, eye) {
    ensureDepthTexture(this.device, this.canvas, this.depthState);

    const now = performance.now() / 1000;
    updateUniforms(this.device, this.buffers.uniformBuffer, vpMatrix, [0.5, 0.8, 0.6], now);

    // update sky uniforms (if available) and draw the sky first in the render pass
    if (this.sky && this.sky.uniformBindGroup) {
      // choose a radius large enough to enclose the scene and not get too close
      updateSkyUniforms(this.device, this.buffers.skyUniformBuffer, vpMatrix, [eye[0], eye[1], eye[2]], 50.0);
    }

    renderPass(this.device, this.context, this.pipeline, this.uniformBindGroup, this.buffers, this.depthState, this.instanceManager, this.sky, this.tablePipeline, this.tableBindGroup);
  }
}