struct SkyUniforms {
  vp : mat4x4<f32>,
  camPos : vec3<f32>,
  radius : f32,
}

@binding(0) @group(0) var<uniform> su : SkyUniforms;
@binding(1) @group(0) var skySampler : sampler;
@binding(2) @group(0) var skyTex : texture_2d<f32>;

struct VSIn {
  @location(0) pos : vec3<f32>,
  @location(1) uv : vec2<f32>,
}

struct VSOut {
  @builtin(position) position : vec4<f32>,
  @location(0) vUV : vec2<f32>,
}

@vertex
fn vs_main(in : VSIn) -> VSOut {
  var out : VSOut;
  // Transform the sphere vertex to world by scaling and moving to camera
  let worldPos = in.pos * su.radius + su.camPos;
  out.position = su.vp * vec4<f32>(worldPos, 1.0);
  out.vUV = in.uv;
  return out;
}

@fragment
fn fs_main(in : VSOut) -> @location(0) vec4<f32> {
  // sample equirectangular texture using uv
  let color = textureSample(skyTex, skySampler, in.vUV);
  return vec4<f32>(color.rgb, 1.0);
}
