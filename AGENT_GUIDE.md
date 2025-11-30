# AGENT GUIDE — React Checkers (Complete Context & Changes)

This file is a single-stop guide for any agent or maintainer who needs to pick up the work done in the repository. It documents what was changed, why, where to look, how to run, how to debug, and what remains to be done.

IMPORTANT: This guide was created to capture the full mental context of a change session (bugfixes; AI & UI changes; and the addition of a textured sky dome). It includes developer explanations, testing advice and follow-up steps.

-----

WHAT this work delivered
------------------------
- Fixed a move-generation bug so men can perform backward captures when applicable.
- Implemented a 3-step AI difficulty system (in-repo): Easy (random), Medium (alpha-beta depth 4) and Hard (alpha-beta depth 7).
- Implemented a textured sky dome rendered from an equirectangular panorama image located at `public/Panorama_Sky_04-512x512.png`.

KEY ASSUMPTIONS
---------------
- Project uses WebGPU (navigator.gpu) in the browser (Vite-based dev server).
- The panorama is equirectangular and mapped to the sphere using standard UV mapping.
- The project expects the panorama to exist at `public/Panorama_Sky_04-512x512.png` and Vite will serve this at `/Panorama_Sky_04-512x512.png`.

WHAT I CHANGED (Summary & Rationale)
-----------------------------------
1) Gameplay / rules
   - `src/gameScripts/gameState.js`
     - Allowed men to capture backwards where required.
     - Added `clone()` to enable search-based AI.

2) AI / Difficulty
   - `src/gameScripts/ai/ai.js` + `src/gameScripts/aiRunner.js`
     - Easy = random
     - Medium = internal alpha-beta search (depth 4)
     - Hard = internal alpha-beta search (depth 7)
   - These choices avoid integrating third-party checkers engines (user preference).

3) Rendering / Sky Dome (main focus)
   - Geometry:
     - `src/gameScripts/constants/sphereGeometry.js` — creates a UV-mapped sphere (default 32x64 tessellation).
   - Shaders:
     - `src/shaders/sky.wgsl` — sky vertex and fragment shader; samples an equirectangular texture using the UVs.
     - `src/shaders/shader.wgsl` — existing scene shader updated for consistency.
   - Renderer plumbing:
     - `src/gameScripts/renderer/buffers.js` — added sky positions/uv/index buffers and `skyUniformBuffer`.
     - `src/gameScripts/renderer/pipeline.js` — added `createSkyPipeline()` to create an independent sky pipeline with bind group (uniforms + sampler + texture view).
     - `src/gameScripts/renderer/uniforms.js` — added `createSkyUniformBuffer()` and `updateSkyUniforms()`.
     - `src/gameScripts/renderer/renderPass.js` — draws the sky dome first (front-face culling, depth write off), then the scene.
     - `src/gameScripts/renderer/index.js` — loads the panorama, creates a GPU texture & sampler, seeds the sky uniform buffer, creates the sky pipeline and stores it for rendering; updated render() to update sky uniforms each frame.

BUGS FIXED
----------
1) Race causing TypeError "Cannot read properties of null (reading 'buildInstances')"
   - Root cause: `InstanceManager` creation occurred after async work; `buildInstances` was called while instance manager was still null.
   - Fix: `InstanceManager` is created early and `buildInstances()` defensively creates it on-demand if missing.

2) WebGPU texture copy error on some backends (e.g., Dawn): "Destination texture needs to have CopyDst and RenderAttachment usage"
   - Fix: created sky texture with usage flags `TEXTURE_BINDING | COPY_DST | RENDER_ATTACHMENT` — some platforms require RENDER_ATTACHMENT when copying external image sources.

3) WGSL parse errors for sky shader
   - Fix: normalized struct punctuation and trailing separators (made `sky.wgsl` use commas in struct definitions consistently) to avoid parser errors which prevented pipeline creation.

WHERE TO LOOK (files & roles)
------------------------------
- Gameplay / Board rules:
  - `src/gameScripts/gameState.js`

- AI and runner wrappers:
  - `src/gameScripts/ai/ai.js`
  - `src/gameScripts/aiRunner.js` (and `src/gameScripts/ai/aiRunner.js`)

- Renderer (sky + instances):
  - `src/gameScripts/renderer/index.js`
  - `src/gameScripts/renderer/buffers.js`
  - `src/gameScripts/renderer/pipeline.js`
  - `src/gameScripts/renderer/uniforms.js`
  - `src/gameScripts/renderer/renderPass.js`
  - `src/gameScripts/renderer/instances.js`

- Shaders:
  - `src/shaders/sky.wgsl`
  - `src/shaders/shader.wgsl` (scene)

HOW TO RUN & TEST (quick)
-------------------------
It is recommended to run from WSL (if you normally use WSL). Basic steps:

1) Install deps and start the dev server (in project root):
```bash
npm install
npm run dev
```

2) Open the app in the browser (default Vite dev server): http://localhost:5173

3) Confirm the panorama is accessible: open `http://localhost:5173/Panorama_Sky_04-512x512.png`. If it is missing you'll see a 404.

4) Debugging
   - If the scene is black or sky doesn't appear:
     - Open DevTools → Console. The app logs Shader compile errors, pipeline creation errors, or texture copy errors.
     - WGSL parser errors will show shader line/column info — check `src/shaders/sky.wgsl`.
     - If you see "Destination texture needs to have CopyDst and RenderAttachment usage" the sky texture flags were fixed, but re-check the exact texture creation site.

ONCE-KNOWN STATE & NOTES
-------------------------
- The sky dome uses a default tessellation of (latSegments 32, lonSegments 64) which is visually good but may be heavy for low-end GPUs. Lower these numbers in `sphereGeometry.js` if needed.
- The dome is kept centered on the camera using `updateSkyUniforms()` every frame (camera eye + VP matrix + radius). The radius default is 50.0; adjust if the dome clips into the scene.
- If the sky pipeline fails to create, the renderer logs a warning and continues rendering the scene without the dome.

NEXT ACTIONS / RECOMMENDATIONS
-----------------------------
These are not required to make the dome visible, but will be helpful enhancements:
1) Add a small UI toggle to enable/disable the sky quickly (useful for debugging and performance testing).
2) Add a low-res fallback for the sky texture for quicker first-frame load.
3) Offload Hard-depth AI (depth 7) to a web worker to avoid UI jank.

REPOSITORY-SPECIFIC QUICK HACKS
--------------------------------
- To quickly disable sky from code for debugging: set `this.sky = null` in `src/gameScripts/renderer/index.js` after initialization.
- To reduce geometry workload: change default call in `sphereGeometry.js` makeSphere(1.0, 12, 24) for a coarser dome.

FINAL NOTE
----------
Everything required to have an operational sky dome and the new AI/difficulty changes has already been integrated. If you hand this repo to another agent, point them at the files listed above and the `public` folder for the panorama texture. If the agent needs more context or the exact diffs, they should inspect the git history for this session.

If you'd like, I can now:
- Add a UI toggle to turn the sky on/off
- Lower the sphere tessellation and add a UI slider for quality vs performance
- Move Hard AI to a worker for responsiveness

Thank you — good luck passing this to the next agent.
