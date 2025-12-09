// Read GLB from URL or public/ folder
export async function loadGLB(url) {
  const arrayBuffer = await fetch(url).then(r => r.arrayBuffer());
  const dataView = new DataView(arrayBuffer);

  // --- GLB Header ---------------------------------------------------------
  const magic = dataView.getUint32(0, true);

  if (magic !== 0x46546C67) { // "glTF"
    throw new Error("Invalid GLB magic.");
  }

  // --- First Chunk: JSON --------------------------------------------------
  let offset = 12;
  const jsonChunkLength = dataView.getUint32(offset, true); offset += 4;
  const jsonChunkType = dataView.getUint32(offset, true); offset += 4;

  if (jsonChunkType !== 0x4E4F534A) { // "JSON"
    throw new Error("Invalid GLB: First chunk is not JSON.");
  }

  const jsonText = new TextDecoder().decode(
    new Uint8Array(arrayBuffer, offset, jsonChunkLength)
  );
  const gltf = JSON.parse(jsonText);
  offset += jsonChunkLength;

  // --- Second Chunk: BIN --------------------------------------------------
  const binChunkLength = dataView.getUint32(offset, true); offset += 4;
  const binChunkType = dataView.getUint32(offset, true); offset += 4;

  if (binChunkType !== 0x004e4942) { // "BIN"
    throw new Error("Invalid GLB: Second chunk is not BIN.");
  }

  const binBuffer = arrayBuffer.slice(offset, offset + binChunkLength);

  // Helper to read typed arrays from accessor
  function getAccessorData(accIndex) {
    const accessor = gltf.accessors[accIndex];
    const bufferView = gltf.bufferViews[accessor.bufferView];
    const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const count = accessor.count;

    const componentType = accessor.componentType;
    const type = accessor.type; // "VEC3", "VEC2", "SCALAR", etc.

    const numComponents = {
      "SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16
    }[type];

    const TypedArray = {
      5120: Int8Array,
      5121: Uint8Array,
      5122: Int16Array,
      5123: Uint16Array,
      5125: Uint32Array,
      5126: Float32Array
    }[componentType];

    const elementBytes = TypedArray.BYTES_PER_ELEMENT * numComponents;
    const byteLength = count * elementBytes;

    const slice = new TypedArray(
      binBuffer,
      byteOffset,
      byteLength / TypedArray.BYTES_PER_ELEMENT
    );

    return {
      array: slice,
      components: numComponents,
      count,
      componentType,
      type
    };
  }

  // --- Load images (textures) --------------------------------------------
  const images = [];
  if (gltf.images) {
    for (const imgDef of gltf.images) {
      if (imgDef.bufferView !== undefined) {
        const bufferView = gltf.bufferViews[imgDef.bufferView];
        const bytes = new Uint8Array(
          binBuffer,
          bufferView.byteOffset || 0,
          bufferView.byteLength
        );
        images.push(bytes);
      } else if (imgDef.uri) {
        // external file: fetch separately
        const imgBytes = await fetch(imgDef.uri).then(r => r.arrayBuffer());
        images.push(new Uint8Array(imgBytes));
      }
    }
  }

  // --- Load materials -----------------------------------------------------
  const materials = [];
  if (gltf.materials) {
    for (const mat of gltf.materials) {
      const pbr = mat.pbrMetallicRoughness || {};

      materials.push({
        baseColorTexture: pbr.baseColorTexture?.index ?? null,
        metallicRoughnessTexture: pbr.metallicRoughnessTexture?.index ?? null,
        normalTexture: mat.normalTexture?.index ?? null,
        occlusionTexture: mat.occlusionTexture?.index ?? null
      });
    }
  }

  // --- Load meshes -------------------------------------------------------
  const meshes = [];
  if (gltf.meshes) {
    for (const mesh of gltf.meshes) {
      const primitives = [];

      for (const prim of mesh.primitives) {
        primitives.push({
          attributes: {
            POSITION: prim.attributes.POSITION !== undefined
                ? getAccessorData(prim.attributes.POSITION)
                : null,
            NORMAL: prim.attributes.NORMAL !== undefined
                ? getAccessorData(prim.attributes.NORMAL)
                : null,
            TEXCOORD_0: prim.attributes.TEXCOORD_0 !== undefined
                ? getAccessorData(prim.attributes.TEXCOORD_0)
                : null,
            TANGENT: prim.attributes.TANGENT !== undefined
                ? getAccessorData(prim.attributes.TANGENT)
                : null
          },
          indices: prim.indices !== undefined ? getAccessorData(prim.indices) : null,
          materialIndex: prim.material ?? null,
          mode: prim.mode !== undefined ? prim.mode : 4  // TRIANGLES
        });
      }

      meshes.push({ name: mesh.name, primitives });
    }
  }

  return {
    gltf,
    meshes,
    materials,
    images
  };
}
