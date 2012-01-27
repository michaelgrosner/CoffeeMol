CoffeeMol
=========

An embeddable JavaScript Molecular Visualizer for HTML5 Browsers written in CoffeeScript and jQuery.

### To embed into an existing webpage
* Compile

```bash
$ coffee -cj {CoffeeMol,CanvasContext,Element,Structure,Chain,Residue,Atom,main,Viewer}.coffee
```

* Create a `<canvas>` element with id `coffeemolCanvas`, include at least jQuery version 1.5.1, and the compiled `CoffeeMol.js` file.

```html
<canvas height="300" width="300" id="coffeemolCanvas">Canvas Load Failed</canvas>
...
</body>
<script src="jquery-1.5.1.min.js" type="text/javascript"></script>
<script src="CoffeeMol.js"  type="text/javascript"></script>
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
