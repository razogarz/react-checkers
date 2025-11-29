import shaderCode from '../../shaders/shader.wgsl?raw';
import { INSTANCE_SIZE } from '../constants/constants.js';

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

  return { pipeline, uniformBindGroup };
}