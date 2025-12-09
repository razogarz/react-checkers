//
// === Bind Groups ============================================================
//
// @group(0) - Scene uniforms
//   binding 0: vp matrix (mat4)
//   binding 1: directional light direction (vec3) + padding
//
// @group(1) - Material (textures + sampler)
//   binding 0: sampler
//   binding 1: baseColorTexture
//   binding 2: metallicRoughnessTexture
//   binding 3: normalTexture (optional, fallback neutral normal)
//   binding 4: aoTexture (optional)
//
// @group(2) - Object transform
//   binding 0: model matrix
//

struct SceneUniforms {
    vp : mat4x4<f32>,
    lightDir : vec3<f32>,
    _pad1 : f32,      // padding
};

@binding(0) @group(0) var<uniform> scene : SceneUniforms;

@binding(0) @group(1) var samp : sampler;
@binding(1) @group(1) var baseColorTex : texture_2d<f32>;
@binding(2) @group(1) var mrTex         : texture_2d<f32>;
@binding(3) @group(1) var normalTex     : texture_2d<f32>;
@binding(4) @group(1) var aoTex         : texture_2d<f32>;

struct Transform {
    model : mat4x4<f32>
};

@binding(0) @group(2) var<uniform> transform : Transform;

//
// === Vertex Stage ============================================================
//

struct VSIn {
    @location(0) pos : vec3<f32>,
    @location(1) normal : vec3<f32>,
    @location(2) uv : vec2<f32>,
    @location(3) tangent : vec4<f32>,     // xyz = tangent, w = handedness
};

struct VSOut {
    @builtin(position) position : vec4<f32>,
    @location(0) worldPos : vec3<f32>,
    @location(1) normal : vec3<f32>,
    @location(2) uv : vec2<f32>,
    @location(3) tangent : vec4<f32>,
};

@vertex
fn vs_main(in : VSIn) -> VSOut {
    var out : VSOut;

    let worldPos = (transform.model * vec4<f32>(in.pos, 1.0)).xyz;
    out.worldPos = worldPos;

    let worldNormal = normalize((transform.model * vec4<f32>(in.normal, 0.0)).xyz);
    out.normal = worldNormal;

    out.uv = in.uv;
    out.tangent = in.tangent;

    out.position = scene.vp * vec4<f32>(worldPos, 1.0);
    return out;
}

//
// === Helper Functions (PBR) =================================================
//

fn fresnelSchlick(cosTheta : f32, F0 : vec3<f32>) -> vec3<f32> {
    return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

fn distributionGGX(n : vec3<f32>, h : vec3<f32>, roughness : f32) -> f32 {
    let a = roughness * roughness;
    let a2 = a * a;
    let NdotH = max(dot(n, h), 0.0);
    let NdotH2 = NdotH * NdotH;

    let denom = (NdotH2 * (a2 - 1.0) + 1.0);
    return a2 / (3.14159265 * denom * denom);
}

fn geometrySchlickGGX(NdotV : f32, roughness : f32) -> f32 {
    let r = roughness + 1.0;
    let k = (r * r) / 8.0;
    return NdotV / (NdotV * (1.0 - k) + k);
}

fn geometrySmith(n : vec3<f32>, v : vec3<f32>, l : vec3<f32>, roughness : f32) -> f32 {
    let NdotV = max(dot(n, v), 0.0);
    let NdotL = max(dot(n, l), 0.0);
    let ggx1 = geometrySchlickGGX(NdotV, roughness);
    let ggx2 = geometrySchlickGGX(NdotL, roughness);
    return ggx1 * ggx2;
}

//
// === Fragment Stage ==========================================================
//

struct FSOut {
    @location(0) color : vec4<f32>
};

@fragment
fn fs_main(in : VSOut) -> FSOut {
    var out : FSOut;

    let N = normalize(in.normal);
    let V = normalize(-in.worldPos); // camera at origin for simplicity

    // === Normal Map ===
    // TBN construction
    let T = normalize((transform.model * vec4<f32>(in.tangent.xyz, 0.0)).xyz);
    let B = normalize(cross(N, T) * in.tangent.w);
    let TBN = mat3x3<f32>(T, B, N);

    let normalSample = textureSample(normalTex, samp, in.uv).xyz * 2.0 - 1.0;
    let Nn = normalize(TBN * normalSample);

    // === Base Color ===
    let baseColor = textureSample(baseColorTex, samp, in.uv).rgb;

    // === Metallic & Roughness ===
    let mr = textureSample(mrTex, samp, in.uv).rg;
    let metallic = mr.x;
    let roughness = max(mr.y, 0.05);

    // === Ambient Occlusion (fallback = 1) ===
    let ao = textureSample(aoTex, samp, in.uv).r;

    // === Lighting Setup ===
    let L = normalize(-scene.lightDir);
    let H = normalize(V + L);

    let NdotL = max(dot(Nn, L), 0.0);
    let NdotV = max(dot(Nn, V), 0.0);

    if (NdotL <= 0.0) {
        out.color = vec4<f32>(baseColor * ao * 0.2, 1.0);
        return out;
    }

    // === PBR Core ===========================================================

    let F0 = mix(vec3<f32>(0.04), baseColor, metallic);
    let F = fresnelSchlick(max(dot(H, V), 0.0), F0);

    let D = distributionGGX(Nn, H, roughness);
    let G = geometrySmith(Nn, V, L, roughness);

    let nominator = D * G * F;
    let denom = 4.0 * NdotV * NdotL + 0.001;
    let specular = nominator / denom;

    let kS = F;
    let kD = (vec3<f32>(1.0) - kS) * (1.0 - metallic);

    let diffuse = baseColor / 3.14159265;

    let radiance = 1.0;

    let finalColor =
        (kD * diffuse + specular) * NdotL * radiance +
        baseColor * ao * 0.1;

    out.color = vec4<f32>(finalColor, 1.0);
    return out;
}
