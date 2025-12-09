struct Uniforms {
  vp : mat4x4<f32>,
  lightDir : vec3<f32>,
  time : f32,
}

@binding(0) @group(0) var<uniform> u : Uniforms;
@binding(1) @group(0) var samp : sampler;
@binding(2) @group(0) var tex : texture_2d<f32>;

struct VertexInput {
  @location(0) pos : vec3<f32>,
  @location(1) norm : vec3<f32>,
  @location(2) uv : vec2<f32>,
  @location(3) i_mat0 : vec4<f32>,
  @location(4) i_mat1 : vec4<f32>,
  @location(5) i_mat2 : vec4<f32>,
  @location(6) i_mat3 : vec4<f32>,
  @location(7) i_color : vec4<f32>,
  @location(8) i_pulse : f32,
}

struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) vUV : vec2<f32>,
  @location(1) vColor : vec3<f32>,
  @location(2) vNormal : vec3<f32>,
}

@vertex
fn vs_main(in : VertexInput) -> VertexOutput {
  var output : VertexOutput;
  let model = mat4x4<f32>(in.i_mat0, in.i_mat1, in.i_mat2, in.i_mat3);
  let worldPos = model * vec4<f32>(in.pos, 1.0);
  
  output.Position = u.vp * worldPos;
  output.vUV = in.uv;
  output.vColor = in.i_color.rgb; // ignoring pulse for now or just passing color
  
  // rotate normal
  let m3 = mat3x3<f32>(model[0].xyz, model[1].xyz, model[2].xyz);
  output.vNormal = normalize(m3 * in.norm);

  return output;
}

@fragment
fn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {
  let texColor = textureSample(tex, samp, in.vUV);
  
  let L = normalize(u.lightDir);
  let N = normalize(in.vNormal);
  
  let ndotl = max(dot(N, L), 0.0);
  
  // Basic lighting
  let ambient = 0.6;
  let diffuseTerm = ambient + 0.4 * ndotl;
  let clamped = max(diffuseTerm, 0.4);
  
  let finalColor = texColor.rgb * in.vColor * clamped;
  return vec4<f32>(finalColor, texColor.a);
}
