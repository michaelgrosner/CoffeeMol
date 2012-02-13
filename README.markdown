CoffeeMol
=========

An embeddable JavaScript Molecular Visualizer for HTML5 Browsers written in CoffeeScript and jQuery.

### To embed into an existing webpage
* Compile

```bash
$ coffee -cj {CoffeeMol,CanvasContext,Element,Structure,Chain,Residue,Atom,Selector,main}.coffee
```

* Create a `<canvas>` element with id `coffeemolCanvas`, include at least jQuery version 1.7.1, and the compiled `CoffeeMol.js` file.

```html
<canvas height="300" width="300" id="coffeemolCanvas">Canvas Load Failed</canvas>
...
</body>
<script src="jquery-1.7.1.min.js" type="text/javascript"></script>
<script src="CoffeeMol.js"  type="text/javascript"></script>
```

* The JavaScript object corresponding to `coffeemolCanvas` is attached to `window.coffeemol`. To pre-load PDB files into the viewer, include the following JavaScript:

```js
window.coffeemol.addNewStructure("path/to/any/valid.pdb");
```

Multiple structures can be loaded using an object (or dictionary, if you're from Python) 

```js
// Change this object to suit your PDB needs
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

window.coffeemol.loadFromDict(structures);
```

### Issues

* Very slow on iOS and slow with larger structures (using "cartoon" mode may help by showing a reduced version of the structure)
* Only tested on the latest Chrome, Firefox, and Safari versions as of 2/7/12 on a Mac running Lion
* Rotation speed is bounded due to roundoff error? Bad math?
* Highly unoptimized
