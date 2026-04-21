# CoffeeMol

An embeddable molecular visualizer for HTML5 browsers, written in TypeScript. Renders PDB and mmCIF files on a `<canvas>` element using 2D drawing APIs — **no WebGL required, no runtime dependencies.**

CoffeeMol brings a rich, 3D-like experience to any browser using a custom volumetric multi-pass shading engine.

## Features

- **PDB and mmCIF** parsing support with automatic secondary structure detection (helices, sheets, loops).
- **Advanced 2D Rendering**: Volumetric shading, depth-based contrast enhancement, and multi-pass highlights for a "3D" feel without WebGL.
- **Multi-Instance Support**: Independently embed multiple visualizers on the same page.
- **Measurement Tool**: Built-in distance measurement between atoms.
- **TypeScript Support**: Full type definitions included for a first-class developer experience.
- **No runtime dependencies** — just a single bundled `CoffeeMol.js` file.
- **Cross-platform**: Works on desktop and mobile (including touch/pinch gestures).

## Running

CoffeeMol uses TypeScript and `esbuild` for bundling.

```bash
# Install development dependencies
npm install

# Build the project
npm run build

# Start a development server
npm run dev
# then open http://localhost:8000
```

## Embedding

Add a `<canvas>` element and include `CoffeeMol.js`:

```html
<canvas id="coffeemolCanvas" width="800" height="600">Canvas not supported</canvas>
<script src="CoffeeMol.js"></script>
<script>
  // Initialize the viewer
  const viewer = CoffeeMol.create("#coffeemolCanvas").autoResize();

  // Load a structure
  viewer.loadNewStructure("path/to/structure.pdb", { drawMethod: "ribbon" });
</script>
```

### Resizing

By default, CoffeeMol respects the `width` and `height` attributes of the `<canvas>`.

- `viewer.resize(w, h)`: Manually resize the canvas. If no arguments are provided, it attempts to fill its CSS container.
- `viewer.autoResize()`: Opt-in to automatic resizing whenever the window is resized (useful for full-screen applications).

### Loading Methods

```js
// Replaces current structure(s)
viewer.loadNewStructure("path/to/structure.pdb", { drawMethod: "ribbon" });

// Appends to current structure(s)
viewer.addNewStructure("path/to/structure.cif");

// Load from raw string data (useful for drag-and-drop)
viewer.loadFromData(rawPdbText, "my_file.pdb", { drawMethod: "tube" });
```

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
- **`points`** — Atoms as spheres, colored by element (CPK-style). Hydrogen, Carbon, Nitrogen, Oxygen, Fluorine, Phosphorus, Sulfur, Potassium, Iodine, and Vanadium are supported; unknown elements are gray.
- **`lines`** — Bonds only.
- **`both`** — Atoms and bonds combined.

## Measurement Tool

CoffeeMol includes a built-in distance measurement tool:
1. **Right-click** on the starting atom.
2. Move the mouse to see the live distance preview.
3. **Left-click** on the target atom to fix the measurement.
4. **Click again** (anywhere or on either atom) to clear the measurement.

## Secondary Structure

CoffeeMol automatically parses HELIX and SHEET records from PDB/mmCIF files:
- **Helices**: Magenta
- **Sheets**: Yellow
- **Loops**: Gray

## API

The instance returned by `CoffeeMol.create()` provides several methods for programmatic control:

- `loadNewStructure(path, info)`: Clear and load a new file.
- `addNewStructure(path, info)`: Add a file to the current scene.
- `loadFromData(data, name, info)`: Load from a string (PDB/mmCIF content).
- `changeAllDrawMethods(method)`: Change the rendering style of all loaded structures.
- `timedRotation(axis, ms)`: Start continuous rotation about 'X', 'Y', or 'Z'.
- `stopRotation()`: Stop any active rotation.
- `setBackgroundColor(color)`: Set the canvas background.
- `clear()`: Clear all structures from the scene.
- `clearCanvas()`: Clear the pixels from the canvas without removing structures.

## Technical Details

- **Language**: TypeScript
- **Bundler**: esbuild
- **Testing**: vitest
- **Coordinate System**: Custom 3D-to-2D projection with Z-sorting for correct transparency and occlusion.

## Known Issues

- Performance degrades on large structures (>50,000 atoms); `cartoon` or `ribbon` modes are recommended for better performance.
- Tested on modern Chrome, Firefox, and Safari.
