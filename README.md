# [CoffeeMol](https://michaelgrosner.github.io/CoffeeMol/)

An embeddable molecular visualizer for HTML5 browsers, written in TypeScript. Renders PDB and mmCIF files on a `<canvas>` element using either a custom 2D multi-pass shading engine (no WebGL required) or a Three.js (WebGL) renderer.

CoffeeMol brings a rich, 3D experience to any browser, providing both a lightweight 2D fallback and a hardware-accelerated 3D path.

## Features

- **Dual Rendering Engine**: Choose between a custom **2D multi-pass shading engine** (no WebGL/runtime dependencies) or a **Three.js (WebGL)** renderer for hardware-accelerated 3D.
- **PDB and mmCIF** parsing support with automatic secondary structure detection (helices, sheets, loops).
- **Advanced 2D Rendering**: Volumetric shading, depth-based contrast enhancement, and multi-pass highlights for a "3D" feel without WebGL.
- **Rich Color Schemes**: Multiple built-in themes (Dracula, Nord, Synthwave '84, etc.) and support for custom schemes.
- **Multi-Instance Support**: Independently embed multiple visualizers on the same page.
- **Measurement Tool**: Built-in distance measurement between atoms.
- **TypeScript Support**: Full type definitions included.
- **Minimal Dependencies**: Zero runtime dependencies when using the 2D renderer. Three.js is only required if opting into the 3D renderer path.
- **Cross-platform**: Works on desktop and mobile (including touch/pinch gestures).

## Installation

### 1. CDN (Recommended)
Include the library directly from the GitHub Pages deployment:
```html
<script src="https://michaelgrosner.github.io/CoffeeMol/CoffeeMol.js"></script>
```

### 2. Manual Download
You can download the latest pre-built `CoffeeMol.js` and `CoffeeMol.d.ts` files directly from the [GitHub Releases](https://github.com/michaelgrosner/CoffeeMol/releases) page.

### 3. Build from Source
If you want to modify the library, see the [Development](#development) section.

## Embedding

Add a `<canvas>` element and include `CoffeeMol.js`:

```html
<canvas id="coffeemolCanvas" width="800" height="600">Canvas not supported</canvas>
<script src="https://michaelgrosner.github.io/CoffeeMol/CoffeeMol.js"></script>
<script>
  // Initialize the viewer (defaults to '2d' renderer)
  const viewer = CoffeeMol.create("#coffeemolCanvas").autoResize();

  // Or explicitly select a renderer: '2d' or '3d'
  // const viewer = CoffeeMol.create("#coffeemolCanvas", "#ffffff", "3d").autoResize();

  // Load a structure
  viewer.loadNewStructure("path/to/structure.pdb", { drawMethod: "ribbon" });
</script>
```

### Loading Methods

```js
// Replaces current structure(s)
viewer.loadNewStructure("path/to/structure.pdb", { drawMethod: "ribbon" });

// Appends to current structure(s)
viewer.addNewStructure("path/to/structure.cif");

// Load from raw string data (useful for drag-and-drop)
viewer.loadFromData(rawPdbText, "my_file.pdb", { drawMethod: "tube" });
```

### Resizing

By default, CoffeeMol respects the `width` and `height` attributes of the `<canvas>`.

- `viewer.resize(w, h)`: Manually resize the canvas. If no arguments are provided, it attempts to fill its CSS container.
- `viewer.autoResize()`: Opt-in to automatic resizing whenever the window is resized (useful for full-screen applications).

### Advanced Loading

You can load multiple structures with specific display options:

```js
viewer.loadFromDict({
  "path/to/protein.pdb": {
    drawMethod: "ribbon",   // "points", "lines", "both", "cartoon", "ribbon", or "tube"
    drawColor: [255, 0, 0]  // RGB array
  },
  "path/to/dna.cif": {
    drawMethod: "tube",
    drawColor: "#0080FF"    // Hex string support
  }
});
```

## Color Schemes

CoffeeMol supports a variety of built-in color schemes:

- `default`: Classic magenta/yellow/gray for secondary structure.
- `modern`: A clean, dark-mode friendly palette.
- `dracula`, `nord`, `oneDark`, `tokyoNight`: Popular developer themes.
- `synthwave84`, `neon`: Vibrant, high-glow aesthetics.
- `coffee`: Earthy brown tones.

You can apply a scheme using:
```js
viewer.setScheme(CoffeeMol.colorSchemes.dracula);
```

## Controls

| Action | Control |
|---|---|
| **Rotate** | Click and drag |
| **Zoom** | Scroll wheel / two-finger scroll |
| **Pinch to zoom** | Touch (iOS/Android) |
| **Re-center** | Double-click on new origin |
| **Measure** | **Right-click** first atom, then click second atom |
| **Reset view** | Trigger `viewer.restoreToOriginal()` |

## Draw Methods

- **`ribbon`** — Smooth spline representation of the backbone (Cα/P trace) with volumetric shading. Automatically colored by secondary structure (helix, sheet, loop).
- **`tube`** — Thick, depth-shaded cylindrical segments for the backbone.
- **`cartoon`** — Simplified backbone trace: Cα–Cα for proteins, P–P for DNA.
- **`points`** — Atoms as spheres, colored by element (CPK-style).
- **`lines`** — Bonds only.
- **`both`** — Atoms and bonds combined.

## Measurement Tool

CoffeeMol includes a built-in distance measurement tool:
1. **Right-click** on the starting atom.
2. Move the mouse to see the live distance preview.
3. **Left-click** on the target atom to fix the measurement.
4. **Click again** (anywhere or on either atom) to clear the measurement.

## API

The instance returned by `CoffeeMol.create()` provides several methods for programmatic control:

- `loadNewStructure(path, info)`: Clear and load a new file.
- `addNewStructure(path, info)`: Add a file to the current scene.
- `loadFromData(data, name, info)`: Load from a string (PDB/mmCIF content).
- `changeAllDrawMethods(method)`: Change the rendering style of all loaded structures.
- `setScheme(scheme)`: Apply a color scheme (e.g., `CoffeeMol.colorSchemes.dracula`).
- `timedRotation(axis, ms)`: Start continuous rotation about 'X', 'Y', or 'Z'.
- `stopRotation()`: Stop any active rotation.
- `setBackgroundColor(color)`: Set the canvas background.
- `clear()`: Clear all structures from the scene.
- `resize(w, h)`: Resize the viewer.
- `autoResize()`: Enable automatic resizing.

## Development

If you want to modify CoffeeMol or run the demo page locally:

```bash
# 1. Install dependencies
npm install

# 2. Build the library
npm run build

# 3. Start the dev server
npm run dev
# then open http://localhost:8000
```

## Technical Details

- **Language**: TypeScript
- **Bundler**: esbuild
- **Testing**: vitest
- **Dual Engine Architecture**: Shared `Renderer` interface with 2D Canvas and Three.js (WebGL) implementations.

## Known Issues

- Performance degrades on large structures (>50,000 atoms); `cartoon` or `ribbon` modes are recommended for better performance on the 2D path.
- Tested on modern Chrome, Firefox, and Safari.
