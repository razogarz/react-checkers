import { mat4, vec3 } from 'gl-matrix';
import { BOARD_Y, BOARD_SIZE, CENTER, UP } from './constants/constants.js';

/**
 * Camera — manages view / projection matrices and screen -> world mapping.
 * Wraps user input handling (drag/zoom) and provides board coordinate raycasts.
 * Uses gl-matrix for math and returns view-projection matrices for rendering.
 */
export default class Camera {
  constructor(canvas) {
    this.canvas = canvas;
    this.distance = 12.0;
    this.yaw = Math.PI / 4;
    this.pitch = Math.PI / 6;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;

    this.setupControls();
  }

  /**
   * setupControls — attach input listeners to support rotation and zoom.
   * Handles mouse drag for yaw/pitch and wheel for camera distance (zoom).
   * Updates internal state used by getViewProjectionMatrix and raycasts.
   */
  setupControls() {
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.dragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.dragging = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;

      const dx = (e.clientX - this.lastX) / 400;
      const dy = (e.clientY - this.lastY) / 400;
      this.yaw -= dx;
      this.pitch = Math.max(-1.3, Math.min(1.0, this.pitch - dy));
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });

    this.canvas.addEventListener('wheel', (e) => {
      this.distance = Math.max(4, Math.min(30, this.distance + e.deltaY * 0.01));
      e.preventDefault();
    }, { passive: false });
  }

  /**
   * getViewProjectionMatrix — build combined projection × view matrix.
   * Uses current yaw/pitch/distance to position the camera in world space.
   * Returned mat4 is used by the renderer to transform world vertices.
   */
  getViewProjectionMatrix() {
    const eye = vec3.fromValues(
      this.distance * Math.cos(this.yaw) * Math.cos(this.pitch),
      this.distance * Math.sin(this.pitch),
      this.distance * Math.sin(this.yaw) * Math.cos(this.pitch)
    );

    const aspect = this.canvas.width / this.canvas.height;
    const view = mat4.create();
    const proj = mat4.create();
    const viewprojection = mat4.create();
    
    mat4.lookAt(view, eye, CENTER, UP);
    mat4.perspective(proj, 45 * Math.PI / 180, aspect, 0.1, 100);
    mat4.multiply(viewprojection, proj, view);

    return viewprojection;
  }

  /**
   * unproject — transform normalized device coordinates into world coords.
   * Inverts the view-projection matrix and applies it to the NDC triple.
   * Used to construct world-space rays for picking and board intersection.
   */
  unproject(ndcX, ndcY, ndcZ) {
    const viewprojMatrix = this.getViewProjectionMatrix();
    const invViewProjMatrix = mat4.create();
    mat4.invert(invViewProjMatrix, viewprojMatrix);

    const normalizedDeviceCoordinates = vec3.fromValues(ndcX, ndcY, ndcZ);
    const world = vec3.create();
    vec3.transformMat4(world, normalizedDeviceCoordinates, invViewProjMatrix);

    return world;
  }

  /**
   * screenToWorld — map screen coordinates to a world-space ray.
   * Computes near and far points, then derives a normalized direction vector.
   * Returns {origin, direction} ready for ray intersections.
   */
  screenToWorld(screenX, screenY) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = (screenX - rect.left) / rect.width * 2 - 1;
    const sy = -((screenY - rect.top) / rect.height * 2 - 1);

    const near = this.unproject(sx, sy, -1);
    const far = this.unproject(sx, sy, 1);
    
    const dir = vec3.create();
    vec3.subtract(dir, far, near);
    vec3.normalize(dir, dir);

    return { origin: near, direction: dir };
  }

  /**
   * rayBoardIntersect — intersect a world-space ray with the board plane.
   * Returns the 3D hit point on the plane at BOARD_Y or null when no hit.
   * Used by getBoardCoordinates to compute board indices.
   */
  rayBoardIntersect(origin, direction) {
    const t = (BOARD_Y - origin[1]) / direction[1];
    if (!isFinite(t) || t < 0) return null;

    const px = origin[0] + direction[0] * t;
    const pz = origin[2] + direction[2] * t;

    return vec3.fromValues(px, BOARD_Y, pz);
  }

  /**
   * getBoardCoordinates — convert a screen click to board (x,y) indexes.
   * Uses screenToWorld + rayBoardIntersect then quantizes to integer squares.
   * Returns {x,y} when inside board bounds, otherwise null.
   */
  getBoardCoordinates(screenX, screenY) {
    const ray = this.screenToWorld(screenX, screenY);
    const hit = this.rayBoardIntersect(ray.origin, ray.direction);

    if (!hit) return null;

    const ix = Math.floor(hit[0] + 3.5 + 0.5);
    const iy = Math.floor(hit[2] + 3.5 + 0.5);

    if (ix >= 0 && ix < BOARD_SIZE && iy >= 0 && iy < BOARD_SIZE) {
      return { x: ix, y: iy };
    }

    return null;
  }
}