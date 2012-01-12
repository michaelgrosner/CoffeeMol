CoffeeMol
=========

An embeddable CoffeeScript Molecular Visualizer for HTML5 Browsers.

### To embed into an existing webpage
* Compile

```bash
coffee -wclj CoffeeMol.coffee CanvasContext.coffee Element.coffee Structure.coffee \
        Chain.coffee Residue.coffee Atom.coffee
```

* Create a `<canvas>` element reachable by a class or ID, for example,

```html
<canvas height="300" width="300" id="mainCanvas">Canvas Load Failed</canvas>
```

* Include the following JavaScript:

```js
// Change this dictionary to suit your PDB needs
structures = {
	"http://www.rcsb.org/pdb/files/1MBO.pdb": {  // URL to a well-behaved PDB file
		drawMethod: "both",						 // Use 'lines', 'points', or 'both'
		drawColor: [255, 0, 0]				     // RGB color (optional)
	},
    "/static/pdbs/1KX5.pdb": {					 // Can mix structures and properties
        drawMethod: "points"
		borderColor: [100, 0, 0]
	}
};

// CoffeeMol only exposes the CanvasContext object to `window` and a loader function
ctx = window.ctx;
window.loadFromDict(structures);

// Once everything is loaded, run it
c.init();
```
