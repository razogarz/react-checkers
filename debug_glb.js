
const fs = require('fs');
const path = require('path');

async function debugGLB(filePath) {
    console.log(`Reading ${filePath}...`);
    const buffer = fs.readFileSync(filePath);
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const view = new DataView(ab);

    const readUint32 = (v, off) => v.getUint32(off, true);

    const magic = readUint32(view, 0);
    const GLB_MAGIC = 0x46546C67;
    
    if (magic !== GLB_MAGIC) {
        console.error("Not a GLB file (magic mismatch)");
        return;
    }

    const version = readUint32(view, 4);
    const length = readUint32(view, 8);
    console.log(`GLB Version: ${version}, Length: ${length}`);

    let offset = 12;
    const jsonChunkLen = readUint32(view, offset); offset += 4;
    const jsonChunkType = readUint32(view, offset); offset += 4;
    
    if (jsonChunkType !== 0x4E4F534A) {
        console.error("Missing JSON chunk");
        return;
    }

    const jsonText = new TextDecoder().decode(new Uint8Array(ab, offset, jsonChunkLen));
    const json = JSON.parse(jsonText);
    console.log("JSON chunk parsed.");

    // Inspect meshes and materials
    console.log(`Meshes: ${json.meshes ? json.meshes.length : 0}`);
    if (json.meshes) {
        json.meshes.forEach((m, i) => {
            console.log(`Mesh ${i}: ${m.name || 'unnamed'}`);
            if (m.primitives) {
                m.primitives.forEach((p, j) => {
                    console.log(`  Primitive ${j}: material=${p.material}, mode=${p.mode}, attributes=${Object.keys(p.attributes).join(',')}`);
                });
            }
        });
    }

    console.log(`Materials: ${json.materials ? json.materials.length : 0}`);
    if (json.materials) {
        json.materials.forEach((m, i) => {
            console.log(`Material ${i}: ${m.name || 'unnamed'}`);
            console.log(`  pbrMetallicRoughness:`, m.pbrMetallicRoughness);
        });
    }

    console.log(`Textures: ${json.textures ? json.textures.length : 0}`);
    if (json.textures) {
        json.textures.forEach((t, i) => {
            console.log(`Texture ${i}: source=${t.source}`);
        });
    }

    console.log(`Images: ${json.images ? json.images.length : 0}`);
    if (json.images) {
        json.images.forEach((img, i) => {
            console.log(`Image ${i}: bufferView=${img.bufferView}, uri=${img.uri}`);
        });
    }

    // Simulate the loader logic
    const mesh = json.meshes[0];
    const prim = mesh.primitives[0];
    if (prim && prim.material !== undefined) {
        const mat = json.materials[prim.material];
        if (mat) {
             const texInfo = mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorTexture;
             if (texInfo) {
                 console.log(`Loader would find texture index: ${texInfo.index}`);
                 const tex = json.textures[texInfo.index];
                 if (tex) {
                     console.log(`Loader would find image source: ${tex.source}`);
                 }
             } else {
                 console.log("Loader would NOT find baseColorTexture in pbrMetallicRoughness");
             }
        }
    } else {
        console.log("First primitive has no material.");
    }
}

// Check public/table.glb
// The path needs to be absolute or relative to where we run this.
// I will run it from the project root.
const targetFile = 'public/table.glb';
if (fs.existsSync(targetFile)) {
    debugGLB(targetFile);
} else {
    // Try absolute path if relative fails, though I'll run relative
    console.error("File not found: " + targetFile);
}
