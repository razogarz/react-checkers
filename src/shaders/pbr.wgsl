// pbr.wgsl
struct U {
  vp : mat4x4<f32>,
  // Light direction (vec3) + padding
  lightDir : vec4<f32>, 
  viewPos : vec4<f32>,
  // generic params (exposure, gamma, etc)
  params : vec4<f32>, 
}
@binding(0) @group(0) var<uniform> u : U;

@binding(1) @group(0) var samp : sampler;
@binding(2) @group(0) var texBase : texture_2d<f32>;    // sRGB GPU format recommended
@binding(3) @group(0) var texORM  : texture_2d<f32>;    // R=occlusion, G=roughness, B=metallic (linear)
@binding(4) @group(0) var texNormal: texture_2d<f32>;
@binding(5) @group(0) var texEmissive: texture_2d<f32>;

// IBL (group 1) - Placeholder for now, typically optional or handled in second bind group
// @binding(0) @group(1) var irradianceMap : texture_cube<f32>;
// @binding(1) @group(1) var prefilteredMap : texture_cube<f32>;
// @binding(2) @group(1) var brdfLUT : texture_2d<f32>;

struct VertexInput {
  @location(0) pos : vec3<f32>,
  @location(1) nrm : vec3<f32>,
  @location(2) uv  : vec2<f32>,
  @location(3) tan : vec4<f32>, // tangent.xyz, tangent.w = sign
  
  // Instance matrix (columns)
  @location(4) i_mcol0 : vec4<f32>,
  @location(5) i_mcol1 : vec4<f32>,
  @location(6) i_mcol2 : vec4<f32>,
  @location(7) i_mcol3 : vec4<f32>,
  // Instance color / extra params
  @location(8) i_color : vec4<f32>,
};

struct VertexOutput {
  @builtin(position) pos : vec4<f32>,
  @location(0) vPos  : vec3<f32>,
  @location(1) vNormal : vec3<f32>,
  @location(2) vTangent : vec3<f32>,
  @location(3) vBitangent : vec3<f32>,
  @location(4) vUV : vec2<f32>,
  @location(5) vColor : vec3<f32>,
};

@vertex
fn vs_main(in : VertexInput) -> VertexOutput {
  var out : VertexOutput;
  
  // Reconstruct model matrix from instance attributes
  let model = mat4x4<f32>(in.i_mcol0, in.i_mcol1, in.i_mcol2, in.i_mcol3);
  
  let worldPos = (model * vec4<f32>(in.pos, 1.0)).xyz;
  out.pos = u.vp * vec4<f32>(worldPos, 1.0);
  
  // Normal matrix (approximation: just rotation part of model if uniform scale)
  let nmat = mat3x3<f32>(model[0].xyz, model[1].xyz, model[2].xyz);
  
  let n = normalize(nmat * in.nrm);
  let t = normalize(nmat * in.tan.xyz);
  let sign = in.tan.w;
  
  // compute orthonormal bitangent using sign
  let b = cross(n, t) * sign;
  
  out.vPos = worldPos;
  out.vNormal = n;
  out.vTangent = t;
  out.vBitangent = b;
  out.vUV = in.uv;
  out.vColor = in.i_color.rgb; // pass through instance tint if needed
  return out;
}

/* ---------- PBR helpers ---------- */

fn saturate(x: f32) -> f32 { return clamp(x, 0.0, 1.0); }

fn DistributionGGX(N: vec3<f32>, H: vec3<f32>, roughness: f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let NdotH = max(dot(N, H), 0.0);
  let denom = (NdotH * NdotH) * (a2 - 1.0) + 1.0;
  return a2 / (3.14159265359 * denom * denom + 1e-5);
}

fn GeometrySchlickGGX(NdotV: f32, k: f32) -> f32 {
  return NdotV / (NdotV * (1.0 - k) + k + 1e-5);
}

fn GeometrySmith(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, roughness: f32) -> f32 {
  let k = (roughness + 1.0);
  let k2 = (k * k) / 8.0;
  let NdotV = max(dot(N, V), 0.0);
  let NdotL = max(dot(N, L), 0.0);
  let ggx1 = GeometrySchlickGGX(NdotV, k2);
  let ggx2 = GeometrySchlickGGX(NdotL, k2);
  return ggx1 * ggx2;
}

fn FresnelSchlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
  return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

/* --- normal map unpacking --- */
fn fetchNormal(tuv: vec2<f32>, T: vec3<f32>, B: vec3<f32>, N: vec3<f32>) -> vec3<f32> {
  let nmap = textureSample(texNormal, samp, tuv).xyz;
  let n = nmap * 2.0 - vec3<f32>(1.0,1.0,1.0);
  // TBN transform from tangent space to world
  let worldNormal = normalize(n.x * T + n.y * B + n.z * N);
  return worldNormal;
}

/* ---------- fragment ---------- */
struct FSIn {
  @location(0) vPos : vec3<f32>,
  @location(1) vNormal : vec3<f32>,
  @location(2) vTangent : vec3<f32>,
  @location(3) vBitangent : vec3<f32>,
  @location(4) vUV : vec2<f32>,
  @location(5) vColor : vec3<f32>,
};

@fragment
fn fs_main(in : FSIn) -> @location(0) vec4<f32> {
  // sample textures
  // if texBase is sRGB in pipeline, the sample is linear
  var baseSample = textureSample(texBase, samp, in.vUV).rgb * in.vColor; 
  let orm = textureSample(texORM, samp, in.vUV).rgb; // R=AO, G=roughness, B=metal
  let emissive = textureSample(texEmissive, samp, in.vUV).rgb;

  // material parameters
  let ao = orm.r;
  var roughness = saturate(orm.g);
  var metallic = saturate(orm.b);

  // normal mapping
  let N = fetchNormal(in.vUV, normalize(in.vTangent), normalize(in.vBitangent), normalize(in.vNormal));
  let V = normalize(u.viewPos.xyz - in.vPos);

  // base reflectance for dielectrics
  let baseColor = baseSample; 
  let F0 = mix(vec3<f32>(0.04,0.04,0.04), baseColor, metallic);

  // Simple Directional Light (placeholder for IBL)
  let L = normalize(u.lightDir.xyz); 
  let H = normalize(V + L);
  
  let NdotL = max(dot(N, L), 0.0);
  let NdotV = max(dot(N, V), 0.0);
  
  let D = DistributionGGX(N, H, roughness);
  let G = GeometrySmith(N, V, L, roughness);
  let F = FresnelSchlick(max(dot(H, V), 0.0), F0);
  
  let numerator = D * G * F;
  let denom = 4.0 * NdotV * NdotL + 1e-5;
  let specular = numerator / denom;

  // kS = F, kD = (1 - kS) * (1 - metallic)
  let kS = F;
  let kD = (vec3<f32>(1.0,1.0,1.0) - kS) * (1.0 - metallic);

  // direct diffuse (Lambert)
  let diffuse = kD * baseColor / 3.14159265359;
  
  // Ambient term (approximation since we don't have full IBL yet)
  let ambientLight = vec3<f32>(0.3, 0.3, 0.3); // simple constant ambient
  let ambient = ambientLight * baseColor * ao;

  let Lo = (diffuse * NdotL + specular * NdotL) * 3.0 /* intensity */ + ambient;

  // add emissive
  let color = Lo + emissive;

  // tonemap & exposure (Reinhard simple)
  let exposure = u.params.x; // e.g. 1.0
  let mapped = vec3<f32>(1.0) - exp(-color * exposure);
  
  // gamma (sRGB) conversion
  // let srgb = pow(mapped, vec3<f32>(1.0 / 2.2));
  // If render target is sRGB, we output linear? No usually we output "encoded" if manual gamma. 
  // Let's assume we output linear and let canvas handle it, OR output srgb. 
  // Standard WebGPU 'bgra8unorm' usually expects sRGB encoded data effectively if not using srgb view.
  // Actually, keeping simple:
  let finalColor = pow(mapped, vec3<f32>(1.0 / 2.2));

  return vec4<f32>(finalColor, 1.0);
}
