if typeof String.prototype.startswith != 'function'
	String.prototype.startswith = (str) ->
		@.slice(0, str.length) == str

if typeof String.prototype.endswith != 'function'
	String.prototype.endswith = (str) ->
		@.slice(-str.length) == str

if typeof Array.prototype.dot != 'function'
	Array.prototype.dot = (v) ->
		if v.length != @.length
			alert "Lengths for dot product must be equal"
		(v[i]*@[i] for i in [0..v.length-1])

nuc_acids = ["A", "C", "G", "T"]

# Using http://www.pymolwiki.org/index.php/Color_Values
atom_colors =
	'CA': [51,  255, 51]
	'O':  [255, 76,  76]
	'N':  [51,  51, 255]
	'P':  [255, 128,  0]

arrayToRGB = (a) -> 
	if a.length != 3
		alert "Array To RGB must be of length 3"
	fixer = (c) ->
		c = if c > 255 then c = 255 else c
		c = if c < 0   then c = 0   else c
		parseInt c
	a = (fixer x for x in a)
	"rgb(#{a[0]}, #{a[1]}, #{a[2]})"

degToRad = (deg) -> deg*Math.PI/180
radToDeg = (rad) -> rad*180/Math.PI

sortByZ = (a1, a2) -> a1.z - a2.z

atomAtomDistance = (a1, a2) -> 
	Math.sqrt( 
		(a1.x-a2.x)*(a1.x-a2.x) +
		(a1.y-a2.y)*(a1.y-a2.y) +
		(a1.z-a2.z)*(a1.z-a2.z)
	)

pdbAtomToDict = (a_str) ->
	formatResiName = (r) ->
		r
		#if r.startswith "D" and r.substr 1, 2 in nuc_acids 
		#	return r.substr 1, 2 
		#else 
		#	return r
	atom_name: $.trim a_str.substring 13, 16 
	resi_name: formatResiName $.trim a_str.substring 17, 20
	chain_id:  $.trim a_str.substring 21, 22
	resi_id: parseInt a_str.substring 23, 26
	
	x: parseFloat a_str.substring 31, 38
	y: parseFloat a_str.substring 38, 45
	z: parseFloat a_str.substring 46, 53

randomRGB = ->
	rr = -> Math.floor(Math.random()*255)
	j = [rr(), rr(), rr()]
	console.log j
	return j

defaultInfo = ->
	drawMethod: "lines"
	drawColor: randomRGB()

loadPDBAsStructure = (filepath, cc, info = null) ->
	parse = (data) ->
		s = new Structure null, filepath, cc
		
		parsedPDB = (pdbAtomToDict a_str for a_str in data.split '\n' \
							when a_str.startswith "ATOM")

		for d in parsedPDB
			if not chain_id_prev? or d.chain_id != chain_id_prev
				c = new Chain s, d.chain_id

			if not resi_id_prev? or d.resi_id != resi_id_prev
				r = new Residue c, d.resi_name, d.resi_id

			if (d.atom_name == "P" and d.resi_name in nuc_acids) \
					or (d.atom_name in ["N", "O", "CA"] and \
						d.resi_name not in nuc_acids)
				a = new Atom r, d.atom_name, d.x, d.y, d.z
			
			chain_id_prev = d.chain_id
			resi_id_prev = d.resi_id
		
		info = if info? then info else defaultInfo()
		s.propogateInfo info

	$.ajax
		async: false 
		type: "GET"
		url: filepath
		success: parse

addNewStructure = (e) ->
	filepath = $("#add-new-structure .text").val()
	loadPDBAsStructure filepath, ctx
	ctx.init()
	ctx.writeContextInfo()

$("#add-new-structure .submit").live 'click', addNewStructure

ctx = new CanvasContext "mainCanvas"

# the filepath argument can also use a http address (e.g. http://www.rcsb.org/pdb/files/1AOI.pdb)
structuresToLoad =
	"PDBs/A1_open_2HU_78bp_1/out-1-16.pdb":
		drawMethod: "lines"
		drawColor: [47, 254, 254]
	"PDBs/A1_open_2HU_78bp_1/half1_0.pdb":
		drawMethod: "lines"
		drawColor: [254, 0, 254]
	"PDBs/A1_open_2HU_78bp_1/half2-78bp-ID0_B1-16.pdb":
		drawMethod: "lines"
		drawColor: [254, 0, 254]
	"PDBs/A1_open_2HU_78bp_1/proteins-78bp-ID0_B1-16.pdb":
		drawMethod: "lines"
		drawColor: [251, 251, 1]

"""
structuresToLoad = 
	"PDBs/half1_1.pdb":
		drawMethod: "lines"
		#drawColor: [47, 254, 254]
"""

for filepath, info of structuresToLoad
	loadPDBAsStructure filepath, ctx, info

ctx.init()

ctx.writeContextInfo()

window.ctx = ctx
window.loadPDBAsStructure = loadPDBAsStructure