import shaderCode from '../../shaders/shader.wgsl?raw';
import { INSTANCE_SIZE } from '../constants/constants.js';
import skyShaderCode from '../../shaders/sky.wgsl?raw';
import texturedShaderCode from '../../shaders/textured.wgsl?raw';

/*
 * createPipeline — compile shaders and assemble a WebGPU render pipeline.
 * Validates shader compilation and sets up vertex/fragment stages and bindings.
 * Returns {pipeline, uniformBindGroup} ready to use for drawing calls.
 */
export async function createPipeline(device, format, uniformBuffer) {
  const module = device.createShaderModule({ code: shaderCode });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'vs_main',
      buffers: [
        // Buffer 0: positions (vec3)
        {
          arrayStride: 3 * 4,
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
          stepMode: 'vertex'
        },
        // Buffer 1: normals (vec3)
        {
          arrayStride: 3 * 4,
          attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }],
          stepMode: 'vertex'
        },
        // Buffer 2: instance data (mat4 + color + pulse) — single per-instance buffer
        {
          arrayStride: INSTANCE_SIZE, // bytes (21 floats * 4)
          attributes: [
            // mat4 as 4 vec4 attributes (columns)
            { shaderLocation: 2, offset: 0, format: 'float32x4' },
            { shaderLocation: 3, offset: 16, format: 'float32x4' },
            { shaderLocation: 4, offset: 32, format: 'float32x4' },
            { shaderLocation: 5, offset: 48, format: 'float32x4' },
            // color vec4 at offset 64
            { shaderLocation: 6, offset: 64, format: 'float32x4' },
            // pulse float at offset 80
            { shaderLocation: 7, offset: 80, format: 'float32' }
          ],
          stepMode: 'instance'
        }
      ]
    },
    fragment: {
      module,
      entryPoint: 'fs_main',
      targets: [{ format }]
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'back'
    },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less'
    }
  });

  // Create bind group
  const uniformBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{
      binding: 0,
      resource: { buffer: uniformBuffer }
    }]
  });


  try {
    console.debug('createPipeline: main pipeline created', { format });
  } catch (e) {}

  return { pipeline, uniformBindGroup };
}

export async function createSkyPipeline(device, format, skyUniformBuffer, sampler, textureView) {
  const module = device.createShaderModule({ code: skyShaderCode });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'vs_main',
      buffers: [
        { arrayStride: 3 * 4, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }], stepMode: 'vertex' },
        { arrayStride: 2 * 4, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x2' }], stepMode: 'vertex' }
      ]
    },
    fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' }
  });

  const uniformBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: skyUniformBuffer } },
      { binding: 1, resource: sampler },
      { binding: 2, resource: textureView }
    ]
  });

  return { pipeline, uniformBindGroup };
}

export async function createTexturedPipeline(device, format, uniformBuffer, sampler, textureView) {
  const module = device.createShaderModule({ code: texturedShaderCode });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'vs_main',
      buffers: [
        { arrayStride: 3 * 4, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }], stepMode: 'vertex' },
        { arrayStride: 3 * 4, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }], stepMode: 'vertex' },
        { arrayStride: 2 * 4, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x2' }], stepMode: 'vertex' },
        // instance matrix (mat4 as 4 vec4s) - columns at locations 3..6
        { arrayStride: INSTANCE_SIZE, attributes: [
          { shaderLocation: 3, offset: 0, format: 'float32x4' },
          { shaderLocation: 4, offset: 16, format: 'float32x4' },
          { shaderLocation: 5, offset: 32, format: 'float32x4' },
          { shaderLocation: 6, offset: 48, format: 'float32x4' },
          // color vec4 follows matrix columns at offset 64 (matches instance layout used elsewhere)
          { shaderLocation: 7, offset: 64, format: 'float32x4' },
          // pulse float at offset 80 (optional, not used by textured shader but keeps layout consistent)
          { shaderLocation: 8, offset: 80, format: 'float32' }
        ], stepMode: 'instance' }
      ]
    },
    fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' }
  });

  const uniformBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: sampler },
      { binding: 2, resource: textureView }
    ]
  });

  return { pipeline, uniformBindGroup };
}