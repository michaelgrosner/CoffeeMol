class Atom extends Element
	constructor: (parent, name, @x, @y, @z, @original_atom_name) ->
		super(parent, name)
		@original_position = [@x, @y, @z]

	toString: =>
		"<Atom: #{@name} [#{@x.toFixed 2}, #{@y.toFixed 2}, #{@z.toFixed 2}]>"

	cpkColor: =>
		@info.drawColor ? atom_colors[@name] ? atom_colors['_']

	depthShadedColor: =>
		base   = @cpkColor()
		extent = @cc.z_extent ? 1
		t      = Math.max(0, Math.min(1, (@z + extent) / (2 * extent)))
		factor = 0.3 + 0.7 * t
		(Math.round(c * factor) for c in base)

	drawPoint: () =>
		base   = @cpkColor()
		relR   = atom_radii[@name] ? 1.0
		zz     = ATOM_SIZE * relR / @cc.zoom

		extent = @cc.z_extent ? 1
		t      = Math.max(0, Math.min(1, (@z + extent) / (2 * extent)))
		factor = 0.3 + 0.7 * t

		shaded    = (Math.round(c * factor)             for c in base)
		highlight = (Math.min(255, Math.round(c * 0.4 + 160)) for c in base)

		grad = @cc.context.createRadialGradient(
			@x - zz * 0.35, @y - zz * 0.35, 0,
			@x,             @y,             zz)
		grad.addColorStop 0, arrayToRGB highlight
		grad.addColorStop 1, arrayToRGB shaded

		@cc.context.beginPath()
		@cc.context.arc @x, @y, zz, 0, 2 * Math.PI, false
		@cc.context.fillStyle = grad
		@cc.context.fill()

	# For the next 3 rotation functions, `sin` and `cos` are given as 
	# Math.sin(dy), precomputed in `Element`
	rotateAboutY: (sin, cos) =>
		ox = @x
		@x = ox*cos  + @z*sin
		@z = -ox*sin + @z*cos

	rotateAboutX: (sin, cos) =>
		oy = @y
		@y = oy*cos - @z*sin
		@z = oy*sin + @z*cos

	rotateAboutZ: (sin, cos) =>
		ox = @x
		@x = ox*cos - @y*sin
		@y = ox*sin + @y*cos

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

	atomInfo: (index, oldhtml) =>
		s = @selector
		parents = [@]
		for i in [1..10]
			s = s.up()
			if not s? then break else parents.push @cc.childFromSelector s
		try
			(encodeHTML p.toString() for p in parents).join "<br>"
		catch error
			console.log parents

# Jmol CPK colors — http://jmol.sourceforge.net/jscolors/
atom_colors =
	'H': [255, 255, 255]
	'C': [144, 144, 144]
	'N': [ 48,  80, 248]
	'O': [255,  13,  13]
	'F': [144, 224,  80]
	'P': [255, 128,   0]
	'S': [255, 200,  50]
	'K': [143,  64, 212]
	'I': [148,   0, 148]
	'V': [166,   0, 255]
	'_': [180, 180, 180]

# Van der Waals radii relative to C = 1.0
atom_radii =
	'H': 0.65
	'C': 1.00
	'N': 0.93
	'O': 0.91
	'F': 0.88
	'P': 1.12
	'S': 1.12
	'I': 1.35

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
