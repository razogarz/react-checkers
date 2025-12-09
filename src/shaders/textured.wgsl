// textured.wgsl
// Vertex + fragment for textured meshes (single-instance)

struct Uniforms {
  vp : mat4x4<f32>,
  lightDir : vec3<f32>,
  time : f32,
}
@binding(0) @group(0) var<uniform> u : Uniforms;

@binding(1) @group(0) var texSampler : sampler;
@binding(2) @group(0) var texView : texture_2d<f32>;

struct VertexInput {
  @location(0) pos : vec3<f32>,
  @location(1) normal : vec3<f32>,
  @location(2) uv : vec2<f32>,
  // instance matrix (optional) - allow using single-instance buffer as a mat4 in location 3..6
  @location(3) i_mcol0 : vec4<f32>,
  @location(4) i_mcol1 : vec4<f32>,
  @location(5) i_mcol2 : vec4<f32>,
  @location(6) i_mcol3 : vec4<f32>,
  // instance color (vec4) - same data used by the instanced shader to tint checkers
  @location(7) i_color : vec4<f32>,
}

struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) vNormal : vec3<f32>,
  @location(1) vUV : vec2<f32>,
  @location(2) vColor : vec3<f32>,
}

@vertex
fn vs_main(in : VertexInput) -> VertexOutput {
  var out : VertexOutput;
  var model = mat4x4<f32>(in.i_mcol0, in.i_mcol1, in.i_mcol2, in.i_mcol3);
  let worldPos = model * vec4<f32>(in.pos, 1.0);
  out.position = u.vp * worldPos;
  let nmat = mat3x3<f32>(model[0].xyz, model[1].xyz, model[2].xyz);
  out.vNormal = normalize(nmat * in.normal);
  out.vUV = in.uv;
  out.vColor = in.i_color.xyz;
  return out;
}

@fragment
fn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {
  let light = normalize(u.lightDir);
  let ndotl = max(dot(normalize(in.vNormal), light), 0.0);
  // increase ambient to avoid very dark sides and reduce directional dominance
  let ambient = 0.28;
  let tex = textureSample(texView, texSampler, in.vUV);
  // apply per-instance color tint then do diffuse modulation
  let base = tex.rgb * in.vColor;
  // keep directional term but ensure a floor so sides are not completely black
  let diffuseTerm = ambient + 0.72 * ndotl;
  let clamped = max(diffuseTerm, 0.25);
  // small rim highlight to help silhouette read on sides
  let rim = pow(1.0 - abs(dot(normalize(in.vNormal), light)), 2.0) * 0.06;
  let color = base * (clamped + rim);
  return vec4<f32>(color, tex.a);
}
