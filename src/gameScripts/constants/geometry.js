export const cubeGeometry = {
  /**
   * positions — 24 vertex positions (x,y,z) for the cube.
   * Repeats 4 vertices per face to allow flat per-face normals.
   * Coordinates are ±0.5 so the cube is 1 unit wide and centered at (0,0,0).
   */
  positions: new Float32Array([
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, -0.5,
    -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5,
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
    0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5,
    -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5
  ]),

  /**
   * normals — per-vertex normal vectors (x,y,z) for lighting.
   * There are 24 normals; each face's four vertices share the same normal.
   * These create flat shading (crisp faces) rather than smoothed corners.
   */
  normals: new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0
  ]),

  /**
   * indices — triangle index list referencing positions by index.
   * 36 indices (6 faces × 2 triangles × 3 indices) define the cube faces.
   * Index ordering uses consistent winding so back-face culling works.
   */
  indices: new Uint16Array([
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    8, 9, 10, 8, 10, 11,
    12, 13, 14, 12, 14, 15,
    16, 17, 18, 16, 18, 19,
    20, 21, 22, 20, 22, 23
  ]),

  /**
   * uvs — texture coordinates (u,v) for each vertex.
   * Maps 0..1 across each face.
   */
  uvs: new Float32Array([
    0, 1, 1, 1, 1, 0, 0, 0, // front
    0, 1, 1, 1, 1, 0, 0, 0, // back
    0, 0, 0, 1, 1, 1, 1, 0, // top
    0, 0, 0, 1, 1, 1, 1, 0, // bottom
    0, 1, 1, 1, 1, 0, 0, 0, // right
    0, 1, 1, 1, 1, 0, 0, 0  // left
  ])
};
