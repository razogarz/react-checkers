// Simple keyed cylinder geometry generator (centered at origin, height 1, radius 0.5)
function makeCylinder(radius = 0.5, height = 1.0, segments = 32) {
  const positions = [];
  const normals = [];
  const indices = [];

  const halfH = height / 2;

  // 1. Side Vertices (Smooth Normals)
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    // normal points out
    const len = Math.hypot(x, z) || 1.0;
    const nx = x / len;
    const nz = z / len;

    // top-side
    positions.push(x, halfH, z);
    normals.push(nx, 0, nz);
    // bottom-side
    positions.push(x, -halfH, z);
    normals.push(nx, 0, nz);
  }

  // Side Indices
  for (let i = 0; i < segments; i++) {
    const i0 = i * 2;
    const i1 = i * 2 + 1;
    const i2 = i * 2 + 2;
    const i3 = i * 2 + 3;
    // Two instanced triangles per quad
    indices.push(i0, i1, i3);
    indices.push(i0, i3, i2);
  }

  const sideVertCount = positions.length / 3;

  // 2. Top Cap Vertices (Flat UP Normal)
  const topStartIndex = positions.length / 3;
  // Center
  positions.push(0, halfH, 0);
  normals.push(0, 1, 0);
  // Rim
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    positions.push(x, halfH, z);
    normals.push(0, 1, 0);
  }

  // Top Cap Indices
  for (let i = 0; i < segments; i++) {
    // center is at topStartIndex
    // rim starts at topStartIndex + 1
    const center = topStartIndex;
    const current = topStartIndex + 1 + i;
    const next = topStartIndex + 1 + i + 1;
    indices.push(center, next, current); // CCW
  }

  // 3. Bottom Cap Vertices (Flat DOWN Normal)
  const botStartIndex = positions.length / 3;
  // Center
  positions.push(0, -halfH, 0);
  normals.push(0, -1, 0);
  // Rim
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    positions.push(x, -halfH, z);
    normals.push(0, -1, 0);
  }

  // Bottom Cap Indices
  for (let i = 0; i < segments; i++) {
    const center = botStartIndex;
    const current = botStartIndex + 1 + i;
    const next = botStartIndex + 1 + i + 1;
    // flipped winding for bottom
    indices.push(center, current, next);
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices)
  };
}

export const cylinderGeometry = makeCylinder(0.5, 1.0, 32);
