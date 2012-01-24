# To set up for debugging: 
# python -m SimpleHTTPServer & coffee -wclj CoffeeMol.coffee Selector.coffee CanvasContext.coffee Element.coffee Structure.coffee Chain.coffee Residue.coffee Atom.coffee main.coffee

# In pixels
ATOM_SIZE = 3
DEBUG = true

if typeof String.prototype.startswith != 'function'
	String.prototype.startswith = (str) ->
		@slice(0, str.length) == str

if typeof String.prototype.endswith != 'function'
	String.prototype.endswith = (str) ->
		@slice(-str.length) == str

if typeof Array.prototype.norm != 'function'
	Array.prototype.norm = ->
		Math.sqrt @.dot @

if typeof Array.prototype.dot != 'function'
	Array.prototype.dot = (v) ->
		if v.length != @.length
			alert "Lengths for dot product must be equal"
		summation (v[i]*@[i] for i in [0..v.length-1])

nuc_acids = ["A",  "C",  "G",   "T",
			 "DA", "DC", "DG", "DT",
			 "RA", "RC", "RG", "RT"]

# Using http://www.pymolwiki.org/index.php/Color_Values
atom_colors =
	'C': [51,  255,  51]
	'O': [255, 76,   76]
	'N': [51,  51,  255]
	'P': [255, 128,   0]
	'H': [229, 229, 229]
	'S': [229, 198,  64]

# See http://www.science.uwaterloo.ca/~cchieh/cact/c120/bondel.html
# Currently, just use < 2
#average_bond_lengths =
#	["C", "C"]: 1.54
#	["N", "N"]: 1.45
#	["O", "O"]: 1.21
#	["C", "N"]: 1.47

supported_draw_methods = ["both", "lines", "points", "cartoon"]

summation = (v) ->
	r = 0
	for x in v
		r += x
	r

encodeHTML = (s) ->
	s.replace("<", "&lt;").replace(">", "&gt;")

timeIt = (fn) ->
	t_start = new Date
	fn()
	(new Date) - t_start

hexToRGBArray = (h) ->
	if h instanceof Array
		return h

	# Some flavors of hex...
	if h.startswith "0x"
		h = h.substring 2

	temp = (h.substring i, i+2 for i in [0..4] by 2)
	(parseInt t, 16 for t in temp)

arrayToRGB = (a) -> 
	if typeof a == 'string'
		if a.startswith "#" and a.length == 7
			console.log "hex"
			return a
		else
			alert "Improperly formatted string -> color. Must be of the form #XXXXXX"

	if not a?
		a = randomRGB()
		if DEBUG
			alert "No color defined for #{a.toString()}. Using a random color"
	
	# RGB must be an array of length 3
	if a.length != 3
		alert "Array To RGB must be of length 3, it is length #{a.length}: #{a}"

	# Make sure our colors are within 0 to 255 and are integers
	fixer = (c) ->
		c = if c > 255 then c = 255 else c
		c = if c < 0   then c = 0   else c
		parseInt c
	a = (fixer x for x in a)
	"rgb(#{a[0]}, #{a[1]}, #{a[2]})"

# Algorithm to determine whether or not two atoms should be bonded
isBonded = (a1, a2) ->
	if a1.parent.typeName() != a2.parent.typeName()
		return false

	# Precompute distance
	aad = atomAtomDistance(a1, a2)

	# Cartoon method shall only draw bonds between protein-protein C-alphas and 
	# along the DNA Phosphate backbone
	if a1.info.drawMethod == 'cartoon'
		if aad < 4 and a1.parent.isProtein() \
				and a1.original_atom_name == "CA" \
				and a2.original_atom_name == "CA"
			return true
		else if aad < 10 and a1.parent.isDNA() \
				and a1.original_atom_name == "P" \
				and a2.original_atom_name == "P"
			return true
		else
			return false
	else
		if aad < 2
			return true
		else
			return false

degToRad = (deg) ->
	deg*0.0174532925

radToDeg = (rad) ->
	rad*57.2957795

sortByZ = (a1, a2) ->
	a1.z - a2.z

atomAtomDistance = (a1, a2) -> 
	Math.sqrt( 
		(a1.x-a2.x)*(a1.x-a2.x) +
		(a1.y-a2.y)*(a1.y-a2.y) +
		(a1.z-a2.z)*(a1.z-a2.z)
	)

pdbAtomToDict = (a_str) ->
	# Sometimes PDBs use `DA` instead of `A` for nucleotides
	handleResiName = (r) ->
		if r in nuc_acids[4..nuc_acids.length] then r.substr(1, 2) else r
	
	# We only need the elemental symbol
	handleAtomName = (a) ->
		a.substr 0, 1
	
	original_atom_name: $.trim a_str.substring 13, 16
	atom_name: handleAtomName $.trim a_str.substring 13, 16
	resi_name: handleResiName $.trim a_str.substring 17, 20
	chain_id:  $.trim a_str.substring 21, 22
	resi_id:   parseInt a_str.substring 23, 26
	x: parseFloat a_str.substring 31, 38
	y: parseFloat a_str.substring 38, 45
	z: parseFloat a_str.substring 46, 53

randomInt = (maxInt) ->
	Math.floor(Math.random()*maxInt)

randomRGB = ->
	rr = -> randomInt 255
	[rr(), rr(), rr()]

randomDrawMethod = ->
	supported_draw_methods[randomInt supported_draw_methods.length]

defaultInfo = ->
	drawMethod: randomDrawMethod()
	drawColor: randomRGB()
	borderColor: [0, 0, 0]

genIFSLink  = (selector_str, key, val, pretty) ->
	link = "javascript:window.ctx.changeInfoFromSelectors('#{selector_str}', \
			'#{key}', '#{val}');"
	"<div class='dropdown-option'><a href=\"#{link}\">#{pretty}</a></div>"

mousePosition = (e) ->
	if not e.offsetX? or not e.offsetY?
		x: e.layerX - $(e.target).position().left
		y: e.layerY - $(e.target).position().top
	else
		x: e.offsetX
		y: e.offsetY

loadPDBAsStructure = (filepath, cc, info = null) ->
	$.ajax
		async: false
		type: "GET"
		url: filepath
		success: (data) ->
			s = new Structure null, filepath, cc
			
			for a_str in data.split '\n'
				if a_str.startswith "TITLE"
					s.attachTitle a_str
				
				if not a_str.startswith "ATOM"
					continue
	
				d = pdbAtomToDict a_str
				if not chain_id_prev? or d.chain_id != chain_id_prev
					c = new Chain s, d.chain_id
	
				if not resi_id_prev? or d.resi_id != resi_id_prev
					r = new Residue c, d.resi_name, d.resi_id
	
				a = new Atom r, d.atom_name, d.x, d.y, d.z, d.original_atom_name
				
				chain_id_prev = d.chain_id
				resi_id_prev = d.resi_id
			
			if info == null
				info = defaultInfo()
				if s.atoms.length > 100
					info.drawMethod = 'cartoon'
			s.propogateInfo info

	null

addNewStructure = (e) ->
	filepath = $("#add-new-structure .text").val()
	loadPDBAsStructure filepath, ctx
	ctx.init()
	ctx.writeContextInfo()

loadFromDict = (structuresToLoad) ->
	for filepath, info of structuresToLoad
		loadPDBAsStructure filepath, ctx, info

fromSplashLink = (filename) ->
	loadPDBAsStructure filename, window.ctx, {drawMethod: 'cartoon'} 
	ctx.init()
	ctx.writeContextInfo()

ctx = new CanvasContext "#coffeemolCanvas"

delay = (ms, f) -> 
	setInterval f, ms

# If we are in the debug environment
if $("#debug-info").length
	$("#add-new-structure .submit").live 'click', addNewStructure
	#$("#ctx-info").on window.onresize, ->
	#	console.log $(@).offset()

	fitCtxInfo = ->
		c = $("#ctx-info")
		top = c.offset().top
		w_height = $(window).height()
		c.height w_height-top-100
	
	fitCtxInfo()
	$(window).resize fitCtxInfo

		
	fade = "out"
	$("#show-ctx-container").live "click", ->
		if fade == "in"
			$(".cc-size").fadeIn "fast", -> 
				fade = "out"
				$("#show-ctx-container").html "<< Options"
		else if fade == "out"
			$(".cc-size").fadeOut "fast", -> 
				fade = "in"
				$("#show-ctx-container").html "Options >>"

	$("#help-area").live "click", -> $(this).css("display", "none")

	# the filepath argument can also use a http address 
	# (e.g. http://www.rcsb.org/pdb/files/1AOI.pdb)
	structuresToLoad =
		"PDBs/A1_open_2HU_78bp_1/out-1-16.pdb":
			drawMethod: "cartoon"
			drawColor: [47, 254, 254]
		"PDBs/A1_open_2HU_78bp_1/half1_0.pdb":
			drawMethod: "cartoon"
			drawColor: [254, 0, 254]
		"PDBs/A1_open_2HU_78bp_1/half2-78bp-ID0_B1-16.pdb":
			drawMethod: "cartoon"
			drawColor: [254, 0, 254]
		"PDBs/A1_open_2HU_78bp_1/proteins-78bp-ID0_B1-16.pdb":
			drawMethod: "cartoon"
			drawColor: [251, 251, 1]
	"""
	structuresToLoad =
		"PDBs/half1_0.pdb":
			drawMethod: "cartoon"
	
	structuresToLoad =
		"http://www.rcsb.org/pdb/files/1MMS.pdb":
			drawMethod: "both"
			#drawColor: [47, 254, 254]
	"""

	dismissWelcomeSplash = ->
		$("#show-ctx-container").css "display", "block"
		$(".cc-size").css "display", "block"
		$("#welcome-splash").fadeOut "fast", -> 1

	if not structuresToLoad?
		$("#show-ctx-container").css "display", "none"
		$(".cc-size").css "display", "none"

		$("#welcome-splash").css
			left: $(window).width()/2 - $("#welcome-splash").outerWidth()/2
			top: $(window).height()/2 - $("#welcome-splash").outerHeight()/2

		$("#welcome-splash").fadeIn "fast", -> 
			$("#show-ctx-container").fadeIn "fast", -> 1
			$(".sample-pdb-link").live "click", dismissWelcomeSplash
			$("#welcome-splash #dismiss").live "click", dismissWelcomeSplash
				
	else
		loadFromDict structuresToLoad
	
	ctx.init()
	
	ctx.writeContextInfo()
	
	$(".open-dropdown").live "click", ->
		# Probably not good form, but the dropdown should be a sibling to the 
		# right of `.open-dropdown`
		d = $(@).next()
		if (d.filter ":hidden").length == 1
			d.fadeIn "fast"
		else
			d.fadeOut "fast"

# Attach ctx instance to window to use it in the HTML
window.ctx = ctx
window.loadFromDict = loadFromDict
window.loadPDBAsStructure = loadPDBAsStructure
window.fromSplashLink = fromSplashLink
