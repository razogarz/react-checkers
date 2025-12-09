// Simple capped cylinder geometry generator (centered at origin, height 1, radius 0.5)
function makeCylinder(radius = 0.5, height = 1.0, segments = 24) {
  const positions = [];
  const normals = [];
  const indices = [];

  const halfH = height / 2;

    // side vertices (two per segment: top then bottom)
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    // top
    positions.push(x, halfH, z);
    // normalized side normal
    const len = Math.hypot(x, z) || 1.0;
    normals.push(x / len, 0, z / len);
    // bottom
    positions.push(x, -halfH, z);
    normals.push(x / len, 0, z / len);
  }

    // side indices (ensure consistent winding so back-face culling works)
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = ((i + 1) % segments) * 2;
    // two triangles (CCW when viewed from outside): top(a), bottom(a), bottom(b)
    indices.push(a, a + 1, b + 1);
    // top(a), bottom(b), top(b)
    indices.push(a, b + 1, b);
  }

  // duplicate side triangles reversed to make the side double-sided and avoid culling
  const sideTriCount = indices.length / 3;
  for (let t = 0; t < sideTriCount; t++) {
    const i0 = indices[t * 3 + 0];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];
    // push reversed winding
    indices.push(i2, i1, i0);
  }

  const baseIndex = positions.length / 3;

  // top cap center
  positions.push(0, halfH, 0);
  normals.push(0, 1, 0);
  const topCenter = baseIndex;

  // top cap triangles (winding CCW from above)
  for (let i = 0; i < segments; i++) {
    const a = i * 2; // top vertex
    const b = ((i + 1) % segments) * 2;
    // center, next, current -> CCW
    indices.push(topCenter, b, a);
  }

  // bottom cap center
  const bottomCenter = positions.length / 3;
  positions.push(0, -halfH, 0);
  normals.push(0, -1, 0);

  // bottom cap triangles (winding CCW when viewed from below — flip winding)
  for (let i = 0; i < segments; i++) {
    const a = i * 2 + 1; // bottom vertex
    const b = ((i + 1) % segments) * 2 + 1;
    // flip winding for bottom
    indices.push(bottomCenter, a, b);
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices)
  };
}

export const cylinderGeometry = makeCylinder(0.5, 1.0, 32);
