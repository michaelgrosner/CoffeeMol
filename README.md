# CoffeeMol

An embeddable molecular visualizer for HTML5 browsers, written in vanilla JavaScript. Renders PDB and mmCIF files on a `<canvas>` element using 2D drawing APIs — no WebGL required, no runtime dependencies.

## Features

- **PDB and mmCIF** parsing support.
- **No runtime dependencies** — just a single `CoffeeMol.js` file.
- **No WebGL required** — works on any canvas-capable browser.

## Running

Because the viewer fetches structure files via HTTP, you must serve the directory over HTTP.

```bash
# Install dependencies (first time only)
npm install

# Build the project
npm run build

# Start a server
python3 -m http.server 8080
# then open http://localhost:8080
```

## Embedding

Add a `<canvas>` element and include `CoffeeMol.js`:

```html
<canvas id="coffeemolCanvas" width="800" height="600">Canvas not supported</canvas>
<script src="CoffeeMol.js"></script>
```

The viewer instance is available as `window.coffeemol`. Load a PDB or mmCIF file:

```js
window.coffeemol.addNewStructure("path/to/structure.pdb");
window.coffeemol.addNewStructure("path/to/structure.cif");
```

To load multiple structures with specific display options:

```js
window.coffeemol.loadFromDict({
  "path/to/protein.pdb": {
    drawMethod: "lines",    // "points", "lines", "both", or "cartoon"
    drawColor: [255, 0, 0]  // RGB array
  },
  "path/to/dna.pdb": {
    drawMethod: "cartoon",
    drawColor: [0, 128, 255]
  }
});
```

## Controls

| Action | Control |
|---|---|
| Rotate | Click and drag |
| Zoom | Scroll wheel / two-finger scroll |
| Pinch to zoom | Touch (iOS) |
| Re-center | Double-click |
| Reset view | "Reset To Original position" button |

## Draw methods

- **`points`** — atoms as circles, colored by element (CPK-style)
- **`lines`** — bonds only
- **`both`** — atoms and bonds
- **`cartoon`** — simplified backbone trace: Cα–Cα for proteins, P–P for DNA

## Structure hierarchy

PDB files are parsed into a four-level tree: `Structure → Chain → Residue → Atom`. Element colors are defined for C, N, O, P, H, and S; all other elements get a random color.

## Known issues

- Performance degrades on large structures; `cartoon` mode helps by drawing only backbone atoms
- Rotation speed is clamped to avoid numerical drift on fast mouse movements
- Tested on modern Chrome and Firefox
