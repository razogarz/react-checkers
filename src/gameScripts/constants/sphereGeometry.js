export function makeSphere(radius = 1.0, latSegments = 32, lonSegments = 64) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let lat = 0; lat <= latSegments; lat++) {
    const v = lat / latSegments;
    const theta = v * Math.PI; // 0..PI

    for (let lon = 0; lon <= lonSegments; lon++) {
      const u = lon / lonSegments;
      const phi = u * Math.PI * 2; // 0..2PI

      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.cos(theta);
      const z = Math.sin(theta) * Math.sin(phi);

      positions.push(x * radius, y * radius, z * radius);
      normals.push(x, y, z);
      uvs.push(u, 1 - v);
    }
  }

  for (let lat = 0; lat < latSegments; lat++) {
    for (let lon = 0; lon < lonSegments; lon++) {
      const a = (lat * (lonSegments + 1)) + lon;
      const b = a + lonSegments + 1;

      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices)
  };
}

// Convenience export for a default dome
export const sphereGeometry = makeSphere(1.0, 32, 64);
