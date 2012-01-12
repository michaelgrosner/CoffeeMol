CoffeeMol
=========

An embeddable CoffeeScript Molecular Visualizer for HTML5 Browsers.

### To embed into webpage
1. Compile (instructions below *but do not include main.coffee*)
3. Create a `<canvas>` element reachable by a class or ID
2. Include the following JavaScript:

```js
structures = {
	"http://www.rcsb.org/pdb/files/1MBO.pdb":    // URL to a well-behaved PDB file
		drawMethod: "both",						 // Use 'lines', 'points', or 'both'
		color: [255, 0, 0]						 // RGB color (optional)
};
ctx = window.ctx;
window.loadFromDict(structures);
c.init();
```

### Compilation:

coffee -wclj CoffeeMol.coffee CanvasContext.coffee Element.coffee Structure.coffee Chain.coffee Residue.coffee Atom.coffee main.coffee
