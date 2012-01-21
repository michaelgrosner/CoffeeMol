class Atom extends Element
	constructor: (parent, name, @x, @y, @z, @original_atom_name) ->
		super(parent, name)
		@original_position = [@x, @y, @z]

	toString: =>
		"<Atom: #{@name} [#{@x.toFixed 2}, #{@y.toFixed 2}, #{@z.toFixed 2}]>"

	drawPoint: () =>
		if not @info.drawColor? #and @info.drawMethod == "points"
			color = atom_colors[@name]
		else
			color = @info.drawColor

		@cc.context.beginPath()
		zz  = ATOM_SIZE/@cc.zoom
		@cc.context.arc @x, @y, zz, 0, 2*Math.PI, false
		@cc.context.lineWidth = 1/@cc.zoom
		@cc.context.strokeStyle = arrayToRGB [0,0,0]#@info.borderColor
		@cc.context.fillStyle = arrayToRGB (c + @z for c in color)#@info.drawColor)
		@cc.context.stroke()
		@cc.context.fill()

	rotateAboutY: (sin, cos) =>
		@x = @x*cos  + @z*sin
		@z = -@x*sin + @z*cos
	
	rotateAboutX: (sin, cos) =>
		@y = @y*cos - @z*sin
		@z = @y*sin + @z*cos

	restoreToOriginal: =>
		@x = @original_position[0]
		@y = @original_position[1]
		@z = @original_position[2]
		
	asArray: => [@x, @y, @z]

	atomInfo: (index, oldhtml) =>
		s = @selector
		parents = [@]
		for i in [1..10]
			s = s.up()
			if not s? then break else parents.push @cc.childFromSelector s
		(encodeHTML p.toString() for p in parents).join "<br>"

sortBondsByZ = (b1, b2) ->
	b1.a2.z - b2.a2.z

class Bond
	constructor: (@a1, @a2) ->
		@computeLength()

	toString: =>
		"<Bond of Length: #{@computeLength().toFixed 3} between #{@a1.toString()} and #{@a2.toString()}>"

	computeLength: =>
		@length = atomAtomDistance @a1, @a2
