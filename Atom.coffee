class Atom extends Element
	constructor: (parent, name, @x, @y, @z, @original_atom_name) ->
		super(parent, name)
		@original_position = [@x, @y, @z]

	toString: =>
		"<Atom: #{@name} [#{@x.toFixed 2}, #{@y.toFixed 2}, #{@z.toFixed 2}]>"

	drawPoint: () =>
		color = if not @info.drawColor? then atom_colors[@name] else @info.drawColor

		@cc.context.beginPath()
		zz  = ATOM_SIZE/@cc.zoom
		@cc.context.arc @x, @y, zz, 0, 2*Math.PI, false
		@cc.context.lineWidth = 1/@cc.zoom
		@cc.context.strokeStyle = arrayToRGB [0,0,0]#@info.borderColor
		@cc.context.fillStyle = arrayToRGB (c + @z for c in color)#@info.drawColor)
		@cc.context.stroke()
		@cc.context.fill()

	# For the next 3 rotation functions, `sin` and `cos` are given as 
	# Math.sin(dy), precomputed in `Element`
	rotateAboutY: (sin, cos) =>
		@x = @x*cos  + @z*sin
		@z = -@x*sin + @z*cos
	
	rotateAboutX: (sin, cos) =>
		@y = @y*cos - @z*sin
		@z = @y*sin + @z*cos

	rotateAboutZ: (sin, cos) =>
		@x = @x*cos - @y*sin
		@y = @x*sin + @y*cos

	# Probably broken
	rotateAboutXYZ: (j, k, l) =>
		@x = @x * Math.cos(k) * Math.cos(l) + @z * Math.sin(k) - \
				@y * Math.cos(k) * Math.sin(l)
		@y = -@z * Math.cos(k) * Math.sin(j) + @x * (Math.cos(l) * Math.sin(j) \
				* Math.sin(k) + Math.cos(j) * Math.sin(l)) + \
				@y * (Math.cos(j) * Math.cos(l) - Math.sin(j) * \
				Math.sin(k) * Math.sin(l))
		@z = @z * Math.cos(j) * Math.cos(k) + @x * (-Math.cos(j) * Math.cos(l) \
				* Math.sin(k) + Math.sin(j) * Math.sin(l)) + \
				@y * (Math.cos(l) * Math.sin(j) + Math.cos(j) * \
				Math.sin(k) * Math.sin(l))

	restoreToOriginal: =>
		@x = @original_position[0]
		@y = @original_position[1]
		@z = @original_position[2]
		
	asArray: => [@x, @y, @z]

	# A jQuery callback, thus index and oldhtml which are still not used
	atomInfo: (index, oldhtml) =>
		s = @selector
		parents = [@]
		for i in [1..10]
			s = s.up()
			if not s? then break else parents.push @cc.childFromSelector s
		(encodeHTML p.toString() for p in parents).join "<br>"

# Using http://www.pymolwiki.org/index.php/Color_Values
atom_colors =
	'C': [51,  255,  51]
	'O': [255, 76,   76]
	'N': [51,  51,  255]
	'P': [255, 128,   0]
	'H': [229, 229, 229]
	'S': [229, 198,  64]

sortBondsByZ = (b1, b2) ->
	# These are the average z between the two atoms in each bond
	b1.zCenter() - b2.zCenter()

sortByZ = (a1, a2) ->
	a1.z - a2.z

atomAtomDistance = (a1, a2) -> 
	Math.sqrt( 
		(a1.x-a2.x)*(a1.x-a2.x) +
		(a1.y-a2.y)*(a1.y-a2.y) +
		(a1.z-a2.z)*(a1.z-a2.z)
	)

class Bond
	constructor: (@a1, @a2) ->
		@computeLength()

	toString: =>
		"<Bond of Length: #{@computeLength().toFixed 3} between #{@a1.toString()} and #{@a2.toString()}>"

	computeLength: =>
		if @length?
			@length
		else
			@length = atomAtomDistance @a1, @a2
	
	zCenter: =>
		(@a1.z + @a2.z)/2.0
