
class CanvasContext
	constructor: ->
		try	
			@canvas  = document.getElementById "mainCanvas"
			@context = @canvas.getContext '2d'

			#@canvas.addEventListener("drag", @mousePosition)
		catch error
			# Not in the browser
			console.log error
	"""
	mousePosition: (e) ->
		j = mx: e.clientX, my: e.clientY
		console.log j
	"""
	
	clear: ->
		@context.clearRect(0, 0, @canvas.width, @canvas.height)

class Vector
	constructor: (@data = null) ->
		if typeof(@data) == 'number'
			@data = (0.0 for b in [1..@data])

	to_string: ->
		"{#{@data[0]}, #{@data[1]}, #{@data[2]}}"
	
	to_console: ->
		console.log @to_string()

	asMatrix: ->
		new Matrix(1, 3, @data)

class Matrix
	constructor: (@height, @width, data = null) ->
		if not data
			@data = ((0.0 for b in [1..@width]) for a in [1..@height])
		else if typeof(data) == 'object' and not @height
			@data = data
			@height = data.length
			@width  = data[0].length
		else if typeof(data) == 'object' and @height
			@data = data

	to_string: ->
		if @height > 1
			"{" + [ "["+d.join(", ")+"]" for d in @data].join(",") + "}"
		else if @height == 1
			"{" + @data.join(", ") + "}"

	to_console: ->
		console.log @to_string()

class Atom
	constructor: (@pdbline, @cc) ->
		@atom_name = @pdbline.substring(13,16)
		@resi_name = @pdbline.substring(17,20)
		@chain_id  = @pdbline.substring(21,22)
		@resi_id   = @pdbline.substring(23,26)
		
		@x = parseFloat(@pdbline.substring(31,38))
		@y = parseFloat(@pdbline.substring(38,45))
		@z = parseFloat(@pdbline.substring(46,53))

		@pos = new Vector([@x, @y, @z])

	to_string: ->
		"<Atom: #{@atom_name} [#{@x}, #{@y}, #{@z}]>"

	draw: (fillColor = "#ff0000") ->
		@cc.context.beginPath()
		@cc.context.arc(5*@x, 5*@y, (@z+100)/100, 0, 2*Math.PI, false)
		@cc.context.fillStyle = fillColor;
		@cc.context.fill()
	
	translate: (x1, y1) ->
		@x += x1
		@y += y1

	rotate: (deg, about) ->
		if about == "X"	
			@pos = matrixVector3DMultiply(rotationAboutX(deg), @pos)
		else if about == "Z"
			@pos = matrixVector3DMultiply(rotationAboutX(deg), @pos)
		else if about == "Y"
			@pos = matrixVector3DMultiply(rotationAboutY(deg), @pos)
		@x = @pos.data[0]
		@y = @pos.data[1]
		@z = @pos.data[2]

class PDBObject
	constructor: (@filepath, @cc) ->
		@atoms = []
		@get_pdb()

	get_pdb: ->
		$.ajax
			async: false
			type: "GET"
			url: @filepath
			success: (data) =>
				@pdb = @parse(data)

	parse: (@pdb) =>
		ATOM = "ATOM"
		for a_str in @pdb.split('\n')
			if a_str.substring(0, ATOM.length) == ATOM# and @atoms.length < 50
				a = new Atom(a_str, @cc)
				@atoms.push a
	
	printAll: ->
		for a in @atoms
			console.log a.to_string()

	drawAll: ->
		for a in @atoms
			a.draw()
	
	translate: (x,y) ->
		for a in @atoms
			a.translate(x,y)
			a.draw()
	
	rotate: (deg, about) ->
		for a in @atoms
			a.rotate(deg, about)
			a.draw(fillColor = "#00ff00")

matrixMultiply = (m1, m2) ->
	d1 = m1.data
	d2 = m2.data

	m = new Matrix(m1.width, m2.height)
	
	for i in [0..m1.width-1]
		for j in [0..m2.height-1]
			for k in [0..m2.width-1]
				m.data[i][j] += d1[i][k]*d2[k][j]
	return m

matrixVector3DMultiply = (m, v) ->
	o = new Vector(3)

	for j in [0..m.height-1]
		for i in [0..m.width-1]
			o.data[j] += m.data[i][j]*v.data[j]
	return o

rotationAboutZ = (deg) ->
	deg = deg*0.0174532925
	m = [[Math.cos(deg), -Math.sin(deg), 0],
		 [Math.sin(deg),  Math.cos(deg), 0],
		 [0,              0,             1]]
	new Matrix(null, null, data = m)

rotationAboutX = (deg) ->
	deg = deg*0.0174532925
	m = [[1,              0,              0],
		 [0,  Math.cos(deg), -Math.sin(deg)],
		 [0,  Math.sin(deg),  Math.cos(deg)]]
	new Matrix(null, null, data = m)

rotationAboutY = (deg) ->
	deg = deg*0.0174532925
	m = [[1,              0,              0],
		 [0,  Math.cos(deg), -Math.sin(deg)],
		 [0,  Math.sin(deg),  Math.cos(deg)]]
	new Matrix(null, null, data = m)


after = (ms, cb) -> 
	setTimeout cb, ms

c = new CanvasContext

p = new PDBObject("1CGP.pdb", c)

p.drawAll()

for i in [1..10]	
	console.log i
	c.context.save()
	c.context.translate(i*3,i*3)
	c.context.restore()
