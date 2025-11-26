// shaders.wgsl
// Vertex + fragment for instanced cubes with per-instance pulse flag.
// Uniforms: vp (mat4), lightDir (vec3), time (f32)
// Instance attributes:
//  location(2..5) = mat4 columns (vec4 each)
//  location(6) = color vec4
//  location(7) = pulse float (0 or 1)

struct Uniforms {
  vp : mat4x4<f32>,
  lightDir : vec3<f32>,
  time : f32,
}
@binding(0) @group(0) var<uniform> u : Uniforms;

struct VertexInput {
  @location(0) pos : vec3<f32>,
  @location(1) normal : vec3<f32>,
  @location(2) i_mcol0 : vec4<f32>,
  @location(3) i_mcol1 : vec4<f32>,
  @location(4) i_mcol2 : vec4<f32>,
  @location(5) i_mcol3 : vec4<f32>,
  @location(6) i_color : vec4<f32>,
  @location(7) i_pulse : f32,
}

struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) vNormal : vec3<f32>,
  @location(1) vColor : vec3<f32>,
}

@vertex
fn vs_main(in : VertexInput) -> VertexOutput {
  var out : VertexOutput;

  // rebuild model matrix from instance columns
  var model = mat4x4<f32>(in.i_mcol0, in.i_mcol1, in.i_mcol2, in.i_mcol3);

  // pulse scaling in shader when i_pulse is enabled
  if (in.i_pulse > 0.5) {
    let amp = 0.08;
    let freq = 6.0;
    let s = 1.0 + amp * sin(u.time * freq);
    // scale basis vectors (columns 0..2), keep translation column intact
    model = mat4x4<f32>(
      in.i_mcol0 * vec4<f32>(s, s, s, 1.0),
      in.i_mcol1 * vec4<f32>(s, s, s, 1.0),
      in.i_mcol2 * vec4<f32>(s, s, s, 1.0),
      in.i_mcol3
    );
  }

  let worldPos = model * vec4<f32>(in.pos, 1.0);
  out.position = u.vp * worldPos;

  // compute normal matrix from model basis (upper-left 3x3)
  let nmat = mat3x3<f32>(model[0].xyz, model[1].xyz, model[2].xyz);
  out.vNormal = normalize(nmat * in.normal);
  out.vColor = in.i_color.xyz;
  return out;
}

@fragment
fn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {
  let light = normalize(u.lightDir);
  let ndotl = max(dot(normalize(in.vNormal), light), 0.0);
  let ambient = 0.18;
  let col = in.vColor * (ambient + 0.82 * ndotl);
  return vec4<f32>(col, 1.0);
}
