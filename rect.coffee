degToRad = (deg) -> deg*Math.PI/180
radToDeg = (rad) -> rad*180/Math.PI

AtomColors =
	'CA': [255, 0, 0]
	#'O':  [0, 255, 0]
	'P':  [0, 0, 255]

class CanvasContext
	constructor: (@canvas_tag) ->
		@elements = []
		try	
			@canvas  = document.getElementById @canvas_tag
			@context = @canvas.getContext '2d'
		catch error
			console.log error

		@x_origin = @canvas.width/2
		@y_origin = @canvas.height/2
		@.clear()
		@canvas.addEventListener 'dblclick', @translateOrigin
		
		@canvas.addEventListener 'mousedown', @mousedown
		@canvas.addEventListener 'mouseup', @mouseup
		@mouse_x_prev = 0
		@mouse_y_prev = 0

		@canvas.addEventListener 'mousewheel', @changeZoom
		@zoom_prev = 1
		@zoom = 1

		$("#reset").live("click", @restoreToOriginal)
	
	addElement: (el) => 
		@elements.push el

	drawAll: => 
		@context.scale @zoom, @zoom
		for e in @elements
			e.drawPaths()

	clear: => 
		@canvas.width = @canvas.width
		@context.translate @x_origin, @y_origin
	
	mousedown: (e) =>
		console.log "down"
		@mouse_x_prev = e.x
		@mouse_y_prev = e.y
		@canvas.addEventListener 'mousemove', @mousemove
		@canvas.addEventListener 'mouseout', @mouseup
	
	changeZoom: (e) =>
		@zoom = @zoom_prev - e.wheelDelta/100
		@.clear()
		if @zoom > 0
			@.drawAll()
			@zoom_prev = @zoom

	mouseup: (e) =>
		console.log "up"
		@canvas.removeEventListener 'mousemove', @mousemove
	
	mousemove: (e) =>
		dx = @mouse_x_prev - e.x
		dy = @mouse_y_prev - e.y

		@.clear()
		for el in @elements
			el.rotateAboutX degToRad -dy/2
			el.rotateAboutY degToRad -dx/2
		@.drawAll()	
		
		@mouse_x_prev = e.x
		@mouse_y_prev = e.y
	
	restoreToOriginal: =>
		@x_origin = @canvas.width/2
		@y_origin = @canvas.width/2
		@.clear()
		@zoom = 1
		@zoom_prev = 1
		for e in @elements
			e.restoreToOriginal()
		@.drawAll()

	translateOrigin: (e) =>
		@x_origin = e.x
		@y_origin = e.y
		@.clear()
		@.drawAll()

class Atom
	constructor: (@pdbline, @cc) ->
		@atom_name = $.trim @pdbline.substring 13, 16 
		@resi_name = @pdbline.substring 17, 20
		@chain_id  = @pdbline.substring 21, 22
		@resi_id   = @pdbline.substring 23, 26
		
		@x = parseFloat @pdbline.substring 31, 38
		@y = parseFloat @pdbline.substring 38, 45
		@z = parseFloat @pdbline.substring 46, 53

		@original_position = [@x, @y, @z]

	to_string: =>
		"<Atom: #{@atom_name} [#{@x}, #{@y}, #{@z}]>"

	draw: () =>
		@cc.context.beginPath()
		@cc.context.arc @x, @y, 1, 0, 2*Math.PI, false

		rgb = AtomColors[@atom_name]
		if @z < -50
			rgb = (255 for c in rgb)
		#else
		#	rgb = (c for c in rgb)

		@cc.context.fillStyle = "rgb(#{rgb[0]}, #{rgb[1]}, #{rgb[2]})"
		@cc.context.fill()

	rotateAboutY: (theta) =>
		@x = @x*Math.cos(theta)  + @z*Math.sin(theta)
		@z = -@x*Math.sin(theta) + @z*Math.cos(theta)
	
	rotateAboutX: (theta) =>
		@y = @y*Math.cos(theta) - @z*Math.sin(theta)
		@z = @y*Math.sin(theta) + @z*Math.cos(theta)
	
	restoreToOriginal: =>
		@x = @original_position[0]
		@y = @original_position[1]
		@z = @original_position[2]
		
	asArray: => [@x, @y, @z]

sortByZ = (a1, a2) -> a1.z - a2.z
atomAtomDistance = (a1, a2) -> 
	Math.sqrt( 
		Math.pow(a1.x-a2.x, 2) +
		Math.pow(a1.y-a2.y, 2) +
		Math.pow(a1.z-a2.z, 2)
	)



class Chain
	constructor: (@atoms, @chain_id, @cc) ->
		@cc.addElement @

class Structure 
	constructor: (@filepath, @cc) ->
		@atoms = []
		@get_pdb()
		@cc.addElement @

	to_string: =>
		"<Structure #{@filepath} with #{@atoms.length} atoms>"

	get_pdb: (async = true) =>
		$.ajax
			async: async
			type: "GET"
			url: @filepath
			success: (data) =>
				@parse data

	parse: (@pdb) =>
		ATOM = "ATOM"
		for a_str in @pdb.split '\n'
			if a_str.substring(0, ATOM.length) == ATOM# and @atoms.length < 50
				a = new Atom a_str, @cc
				if AtomColors.hasOwnProperty a.atom_name 
					@atoms.push a
					#a.draw()
		@.drawPaths()

	drawPaths: => 
		x = @cc.context
		x.beginPath()
	
		for i in [2..@atoms.length-1]
			a2 = @atoms[i]
			a1 = @atoms[i-1]
			if atomAtomDistance(a1, a2) < 10
				x.moveTo(a1.x, a1.y)
				x.lineTo(a2.x, a2.y)
			else
				console.log @.to_string(), "new path"
		x.closePath()
		x.stroke()

	draw: =>
		@atoms.sort sortByZ
		for a in @atoms
			a.draw()

	rotateAboutY: (theta) =>
		for a in @atoms
			a.rotateAboutY theta
	
	rotateAboutX: (theta) =>
		for a in @atoms
			a.rotateAboutX theta
	
	restoreToOriginal: =>
		for a in @atoms
			a.restoreToOriginal()
	
	avgCenter: =>
		avgs = [0.0, 0.0, 0.0] #(0.0 for y in [1..3])
		for a in @atoms
			avgs[0] += a.x
			avgs[1] += a.y
			avgs[2] += a.z
		for x in avgs
			x /= @atoms.length
		return avgs

ctx = new CanvasContext "mainCanvas"
#cap = new Structure "1CGP.pdb", ctx
#fis = new Structure "3IV5.pdb", ctx

dna = new Structure "PDBs/A1_open_2HU_78bp_1/out-1-16.pdb", ctx
half1 = new Structure "PDBs/A1_open_2HU_78bp_1/half1_0.pdb", ctx
half2 = new Structure "PDBs/A1_open_2HU_78bp_1/half2-78bp-ID0_B1-16.pdb", ctx
proteins = new Structure "PDBs/A1_open_2HU_78bp_1/proteins-78bp-ID0_B1-16.pdb", ctx

#ctx.drawAll()


"""
rotateAndDraw = (c, p) -> 
	c.clear()
	p.rotateAboutY degToRad .5
	c.drawAll()

for i in [1..200]
	do (i) ->
		setTimeout (-> rotateAndDraw(c,p)), 50
"""
