import { createBuffers } from './buffers.js';
import { createPipeline, createSkyPipeline, createTexturedPipeline, createPBRPipeline } from './pipeline.js';
import InstanceManager from './instances.js';
import { mat4 } from 'gl-matrix';
import { ensureDepthTexture } from './depth.js';
import { BOARD_Y, COLORS } from '../constants/constants.js';
import { updateUniforms, createSkyUniformBuffer, updateSkyUniforms } from './uniforms.js';
import { renderPass } from './renderPass.js';
import { loadCheckerModel } from '../loader/loadCheckerGLB.js';

// Helper to create 1x1 color texture
function createOnePixelTexture(device, r, g, b, a, isNormal = false) {
  const size = [1, 1, 1];
  const tex = device.createTexture({
    size,
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
  });
  // mix of 0..255
  const data = new Uint8Array([r * 255, g * 255, b * 255, a * 255]);
  device.queue.writeTexture({ texture: tex }, data, { bytesPerRow: 4 }, size);
  return tex.createView();
}



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

    // Initialize default PBR textures
    this.defaults = {
      white: createOnePixelTexture(this.device, 1, 1, 1, 1),
      black: createOnePixelTexture(this.device, 0, 0, 0, 1),
      normal: createOnePixelTexture(this.device, 0.5, 0.5, 1.0, 1.0, true),
      dielectric: createOnePixelTexture(this.device, 1.0, 1.0, 0.0, 1.0)
    };

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
      try { console.debug('Checker GLB loaded', { indexCount: checker.indexCount, indexFormat: checker.indexFormat }); } catch (e) { }
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

        // compute a reasonable placement so the table sits beneath the checker board
        try {
          const sizes = table.bounds.size;
          // desired footprint slightly larger than board (8 units) so table extends under it
          const desiredFootprint = 16.0;
          const maxAxis = Math.max(sizes[0] || 1e-6, sizes[2] || 1e-6);
          const uniformScale = desiredFootprint / maxAxis;
          const ty = (typeof this.buffers.table.bounds.max[1] === 'number') ? (BOARD_Y - table.bounds.max[1] * uniformScale + 0.02) : BOARD_Y + 0.04;

          const m = mat4.create();
          mat4.translate(m, m, [0.0, ty, 0.0]);
          mat4.scale(m, m, [uniformScale, uniformScale, uniformScale]);

          // write this transform + brown color into the singleInstanceBuf so table is tinted like pieces
          if (this.buffers.singleInstanceBuf) {
            const arr = new Float32Array(21);
            arr.set(m, 0);
            arr[16] = 1.0; arr[17] = 1.0; arr[18] = 1.0; arr[19] = 0.0; arr[20] = 0.0;
            this.device.queue.writeBuffer(this.buffers.singleInstanceBuf, 0, arr);
          }
        } catch (e) { console.warn('Failed to place table automatically', e); }

        // PBR Pipeline Setup
        try {
          // Ensure Tangents
          if (!table.tanBuf) {
            const vertCount = table.posBuf.size / 12; // 3 floats * 4 bytes
            const tanData = new Float32Array(vertCount * 4);
            for (let i = 0; i < vertCount; i++) {
              tanData[i * 4 + 0] = 1; tanData[i * 4 + 1] = 0; tanData[i * 4 + 2] = 0; tanData[i * 4 + 3] = 1;
            }
            const buf = this.device.createBuffer({ size: tanData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, mappedAtCreation: true });
            new Float32Array(buf.getMappedRange()).set(tanData);
            buf.unmap();
            table.tanBuf = buf;
            console.debug('Renderer: generated dummy tangents');
          }

          const maps = {
            baseColor: this.defaults.white,
            orm: this.defaults.dielectric,
            normal: this.defaults.normal,
            emissive: this.defaults.black
          };

          if (table.material) {
            const m = table.material;
            const upload = (bmp, format = 'rgba8unorm') => {
              if (!bmp) return null;
              const tex = this.device.createTexture({ size: [bmp.width, bmp.height, 1], format, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
              this.device.queue.copyExternalImageToTexture({ source: bmp }, { texture: tex }, [bmp.width, bmp.height, 1]);
              return tex.createView();
            };
            if (m.baseColor) maps.baseColor = upload(m.baseColor);
            if (m.normal) maps.normal = upload(m.normal);
            if (m.orm) maps.orm = upload(m.orm);
            if (m.emissive) maps.emissive = upload(m.emissive);
          }

          const sampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' });
          const pbrObj = await createPBRPipeline(this.device, this.format, this.buffers.uniformBuffer, sampler, maps);
          this.tablePipeline = pbrObj.pipeline;
          this.tableBindGroup = pbrObj.bindGroup;
          console.debug('Renderer: wired up PBR pipeline');
        } catch (e) { console.warn('PBR setup failed', e); }

        // Also create ground
        try {
          if (this.buffers.groundInstanceBuf) {
            const groundM = mat4.create();
            mat4.translate(groundM, groundM, [0.0, -5.0, 0.0]);
            mat4.scale(groundM, groundM, [200.0, 0.5, 200.0]);
            const garr = new Float32Array(21);
            garr.set(groundM, 0);
            garr[16] = 0.15; garr[17] = 0.6; garr[18] = 0.2; garr[19] = 0.0; garr[20] = 0.0;
            this.device.queue.writeBuffer(this.buffers.groundInstanceBuf, 0, garr);

            // Load grass texture
            try {
              const img = await fetch('/texture/grass.jpg').then(r => r.ok ? r.blob() : null).then(b => b ? createImageBitmap(b) : null);
              if (img) {
                const tex = this.device.createTexture({ size: [img.width, img.height, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
                this.device.queue.copyExternalImageToTexture({ source: img }, { texture: tex }, [img.width, img.height, 1]);
                const sampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' });
                const texView = tex.createView();
                const groundPipelineObj = await createTexturedPipeline(this.device, this.format, this.buffers.uniformBuffer, sampler, texView);
                this.groundPipeline = groundPipelineObj.pipeline;
                this.groundBindGroup = groundPipelineObj.uniformBindGroup;
              }
            } catch (e) { }
          }
        } catch (e) { }
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
        const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
        // updateSkyUniforms(device, skyUniformBuffer, vpMatrix, camPos, radius)
        updateSkyUniforms(this.device, this.buffers.skyUniformBuffer, identity, [0, 0, 0], 50.0);
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
    updateUniforms(this.device, this.buffers.uniformBuffer, vpMatrix, [0.5, 0.8, 0.6], eye, now);

    // update sky uniforms (if available) and draw the sky first in the render pass
    if (this.sky && this.sky.uniformBindGroup) {
      // choose a radius large enough to enclose the scene and not get too close
      updateSkyUniforms(this.device, this.buffers.skyUniformBuffer, vpMatrix, [eye[0], eye[1], eye[2]], 50.0);
    }

    renderPass(this.device, this.context, this.pipeline, this.uniformBindGroup, this.buffers, this.depthState, this.instanceManager, this.sky, this.tablePipeline, this.tableBindGroup, this.groundPipeline, this.groundBindGroup);
  }
}