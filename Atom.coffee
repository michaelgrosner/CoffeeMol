class Atom extends Element
	constructor: (parent, name, @x, @y, @z) ->
		super(parent, name)
		@original_position = [@x, @y, @z]

	toString: =>
		"<Atom: #{@name} [#{@x}, #{@y}, #{@z}]>"

	drawPoint: () =>
		if not @info.drawColor? and @info.drawMethod == "points"
			color = atom_colors[@name]
		else
			color = @info.drawColor

		@cc.context.beginPath()
		zz  = 3/@cc.zoom#(3*@z+300)/300
		zz2 = 1.5/@cc.zoom#(3*@z+300)/600
		if zz < 0
			zz = 0
			zz2 = 0
		@cc.context.arc @x, @y, zz, 0, 2*Math.PI, false
		
		grad = @cc.context.createRadialGradient @x, @y, zz, @x, @y, zz2
		grad.addColorStop 1, arrayToRGB color
		grad.addColorStop 0, arrayToRGB [10,10,10] #@cc.background_color

		@cc.context.fillStyle = grad #arrayToRGB color
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

sortBondsByZ = (b1, b2) ->
	b1.a2.z - b2.a2.z

class Bond
	constructor: (@a1, @a2) ->

