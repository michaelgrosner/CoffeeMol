# CoffeeMol Project Context

## Project Overview
**CoffeeMol** is a high-performance, embeddable molecular visualizer written in TypeScript. It renders PDB and mmCIF files on an HTML5 `<canvas>` element using either a custom 2D multi-pass shading engine or a Three.js (WebGL) renderer. Both renderers share the same `Renderer` interface and are selectable at runtime. Three.js (`three`) is a runtime dependency for the 3D renderer path.

## Core Technologies
- **Language**: TypeScript
- **Bundler**: `esbuild` (minifies to a single `CoffeeMol.js` file)
- **Testing**: `vitest`
- **Platform**: Web (HTML5 Canvas 2D API or WebGL via Three.js)
- **Runtime dependency**: `three` (^0.184.0) — used by `ThreeRenderer` only

## Building and Running
- **Installation**: `npm install`
- **Development Server**: `npm run dev` (starts esbuild watch mode on `http://localhost:8000`)
- **Build**: `npm run build` (runs type check, bundles with esbuild, and generates `.d.ts` files)
- **Test**: `npm run test` (executes Vitest suite)
- **Type-Check**: `npm run type-check`

## Releasing
Releases are automated via GitHub Actions (`.github/workflows/release.yml`). To trigger a release:
1. **Update Version**: Update the `version` in `package.json`.
2. **Commit and Tag**:
   ```bash
   git add .
   git commit -m "chore: release vX.Y.Z"
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   ```
3. **Push Tag**: `git push origin vX.Y.Z`.
4. **Automated Assets**: The workflow will build the project and attach `CoffeeMol.js`, `CoffeeMol.d.ts`, and `CoffeeMol.js.map` to the GitHub Release.

## Performance Philosophy

Must remain interactive with large structures (e.g. 8WLU — a ribosome-associated complex with tens of thousands of atoms) at smooth frame rates. When something feels slow, profile it.

### Render Loop
- `drawAll()` must be coalesced through `requestAnimationFrame`. Without RAF gating, a fast render path floods the GPU with hundreds of command buffers per second during interaction, causing multi-hundred-millisecond GPU stalls even when CPU utilization looks low.
- Any number of `drawAll()` calls within a single animation frame must collapse to one actual render.

### Allocation and GC
- Avoid per-frame heap allocations in hot paths. GC pauses manifest as frame drops; watch the GC category in Chrome DevTools performance traces.

### Profiling Guidance
- Use Chrome DevTools performance recording with CPU profiling enabled. Capture traces during active interaction (rotation + zoom on a large structure).
- Compare **non-idle CPU sample %** as the primary CPU metric. Compare **GPUTask average duration** and **p95 duration** as the primary GPU metric. A reduction in CPU% accompanied by a rise in GPU p95 means the CPU bottleneck was masking a GPU problem — add throttling, not more CPU work.
- Traces are stored in `traces/`. Use the `.json.gz` format for sharing.
- Watch for bimodal GPU task distributions (many tiny tasks + a few huge ones): this is the signature of GPU command buffer overflow caused by unthrottled rendering.

## Source Control
- NEVER commit without explicit permission
