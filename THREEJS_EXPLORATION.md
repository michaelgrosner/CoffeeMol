# CoffeeMol: Three.js Integration Exploration

This document explores the technical implications, advantages, and disadvantages of migrating CoffeeMol from its current custom 2D Canvas rendering engine to a [Three.js](https://threejs.org/) (WebGL/WebGPU) based architecture.

## 1. Current Architecture Overview
CoffeeMol currently uses a **pseudo-3D** engine built on the HTML5 Canvas 2D API. Key characteristics include:
- **Zero Runtime Dependencies**: Optimized for embeddability and minimal footprint.
- **Custom Z-Sorting**: Manually sorts atoms and bonds by depth to handle occlusion.
- **Volumetric Multi-pass Shading**: Simulates 3D lighting by drawing each element multiple times with varying widths and opacities (Shadow -> Body -> Soft Highlight -> Sharp Shine).
- **Geometric Abstractions**: Custom math for calculating ribbon paths, tube segments, and rotation matrices.

## 2. Proposed Architecture with Three.js
A Three.js implementation would shift CoffeeMol from a "Painter's Algorithm" approach to a **Scene Graph** architecture:
- **Scene**: A container for all molecular components.
- **Meshes**:
    - **Atoms**: `SphereGeometry` with `MeshStandardMaterial`.
    - **Bonds**: `CylinderGeometry` oriented between atom pairs.
    - **Ribbons/Tubes**: `TubeGeometry` or custom `BufferGeometry` using Catmull-Rom splines.
- **Camera**: `PerspectiveCamera` with `OrbitControls` for interaction.
- **Renderer**: `WebGLRenderer` (with fallback to WebGPU).

---

## 3. Pros of Migrating to Three.js

### A. Performance and Scalability
- **GPU Acceleration**: Offloads rendering to the graphics card. Three.js can handle hundreds of thousands of atoms via **Instanced Rendering** (`InstancedMesh`), whereas the 2D API struggles with sorting and redrawing thousands of shapes.
- **Frustum Culling**: Automatically skips rendering of elements outside the view.
- **Level of Detail (LOD)**: Easily swap high-poly spheres for low-poly ones (or points) based on distance.

### B. Visual Fidelity
- **Real Lighting & Shadows**: Access to PBR (Physically Based Rendering), ambient occlusion (SSAO), and dynamic shadows.
- **Advanced Shaders**: Easy implementation of "Ghost" surfaces, depth-peeling for transparency, and glow effects without multi-pass overhead.
- **Post-Processing**: Integration with Three.js effect composers for bloom, outlines, and depth-of-field.

### C. Development Efficiency
- **Standardized Abstractions**: Replaces custom rotation and projection math with Three.js's robust `Vector3`, `Matrix4`, and `Quaternion` classes.
- **Interactivity**: Raycasting comes built-in, simplifying atom selection and tooltips.
- **Ecosystem**: Access to a vast library of loaders, controls, and helper utilities.

---

## 4. Cons of Migrating to Three.js

### A. Dependency and Bundle Size
- **Weight**: Adding Three.js introduces a significant runtime dependency (~600KB+ minified). This directly contradicts CoffeeMol's core "no runtime dependencies" mandate.
- **Complexity**: Increases the build complexity and maintenance surface area.

### B. Compatibility and Overhead
- **Hardware Requirements**: Requires WebGL/WebGPU support. While common, some ultra-legacy or restricted environments (embedded browsers in low-end hardware) might only support Canvas 2D.
- **Initialization Cost**: Setting up a WebGL context is "heavier" than a 2D context for simple 10-atom visualizations.

### C. Aesthetic Consistency
- **The "CoffeeMol Look"**: The current custom shading gives CoffeeMol a unique, "illustrative" look. Porting this exact aesthetic to shaders requires specialized GLSL knowledge to avoid the "generic 3D" appearance of many other visualizers.

---

## 5. Implementation Strategy

If a migration were to occur, a hybrid or phased approach is recommended:

1.  **Core Abstraction**: Refactor `CanvasContext` into a generic `Renderer` interface.
2.  **ThreeRenderer**: Implement a new class that maps `Molecule` data to Three.js objects.
3.  **Instancing**: Use `InstancedMesh` for atoms of the same element to maximize performance.
4.  **Shader Parity**: Write a custom `ShaderMaterial` that replicates the multi-pass highlight logic of the current 2D engine to maintain brand identity.

## 6. Recommendation

**Maintain the 2D Engine for Core CoffeeMol.**

The primary value proposition of CoffeeMol is its **extreme lightness** and **zero-dependency** nature. Moving to Three.js would turn it into one of many WebGL visualizers (like NGL or Mol*), losing its unique niche as the "plug-and-play" 2D alternative.

**Alternative**: Develop an optional `@coffeemol/gl` package that acts as a Three.js-based renderer for users who need to visualize massive proteins (>50,000 atoms) where the 2D engine hits its limit.
