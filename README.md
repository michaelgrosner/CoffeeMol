# CoffeeMol

An embeddable molecular visualizer for HTML5 browsers, written in CoffeeScript. Renders PDB files on a `<canvas>` element using 2D drawing APIs — no WebGL required.

## Building

Requires [CoffeeScript 2](https://coffeescript.org/):

```bash
npm install -g coffeescript
```

Compile all source files into a single bundle:

```bash
cat Viewer.coffee CanvasContext.coffee Element.coffee Structure.coffee Chain.coffee \
    Residue.coffee Atom.coffee Selector.coffee main.coffee \
    | coffee --compile --stdio > CoffeeMol.js
```

## Running

Because the viewer fetches PDB files via AJAX, you must serve the directory over HTTP — opening `index.html` directly from disk will fail due to browser CORS restrictions.

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

jQuery is required as `jquery.min.js` in the same directory. Download it once:

```bash
curl -sL https://code.jquery.com/jquery-1.12.4.min.js -o jquery.min.js
```

## Embedding

Add a `<canvas>` element and include jQuery and `CoffeeMol.js`:

```html
<canvas id="coffeemolCanvas" width="800" height="600">Canvas not supported</canvas>
<script src="jquery.min.js"></script>
<script src="CoffeeMol.js"></script>
```

The viewer instance is available as `window.coffeemol`. Load a PDB file after the scripts:

```js
window.coffeemol.addNewStructure("path/to/structure.pdb");
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
