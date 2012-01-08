class Element
	constructor: (@parent, @name, cc = null) ->
		@children = []
		if parent? 
			@parent.addChild @
		if cc?
			@cc = cc
		else
			@cc = @parent.cc

		@info = {}

	writeContextInfo: =>
		if @.constructor.name != "Residue"
			# THIS WILL BREAK IE COMPAT.
			child_type_name = @children[0].constructor.name
			x = "#{@.constructor.name}: #{@name} with #{@children.length}\
				#{child_type_name}s"
			p = (c.writeContextInfo() for c in @children)
			return "#{x}<br>#{p.join "" }"

	init: ->
		@atoms = @.getOfType(Atom)

		# Push back the CanvasContext bounding box
		#for a in @atoms

		
	addChild: (child) ->
		@children.push child
	
	propogateInfo: (info) ->
		@info = info
		@info.drawColor = if @info.drawColor? then @info.drawColor else randomRGB()
		#if not @info.drawColor?
		#	@info.drawColor = randomRGB()
		for c in @children
			c.propogateInfo info

	getOfType: (type) ->
		ret = []
		recursor = (children) ->
			for c in children
				if c instanceof type
					ret.push c
				else
					recursor c.children
		recursor @children
		return ret

	draw: =>
		if @info.drawMethod == "lines"
			@.drawPaths()
		else if @info.drawMethod == "points"
			@.drawPoints()
		else if @info.drawMethod == "both"
			@.drawPaths()
			@.drawPoints()

	drawPaths: => 
		isBonded = (a1, a2) ->
			if a1.parent.typeName() != a2.parent.typeName()
				false
			else if atomAtomDistance(a1, a2) < 3 and a1.parent.isProtein()
				true
			else if atomAtomDistance(a1, a2) < 10 and a1.parent.isDNA()
				true
			else
				false

		x = @cc.context

		for i in [2..@atoms.length-1]
			for j in [i+1..i+5] when j < @atoms.length-1
				x.beginPath()
				a2 = @atoms[i]
				a1 = @atoms[j]
				if isBonded a1, a2 
					x.moveTo(a1.x, a1.y)
					x.lineTo(a2.x, a2.y)
				x.strokeStyle = arrayToRGB (c + a1.z for c in @info.drawColor)
				#x.lineJoin = "round"
				#x.lineCap = "round"
				lw = (3*a1.z + 200)/200
				x.lineWidth = if lw > 0 then lw else lw
				x.closePath()
				x.stroke()

	drawPoints: =>
		@atoms.sort sortByZ
		for a in @atoms
			a.drawPoint(color = @info.drawColor)

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
		avgs = [0.0, 0.0, 0.0]
		for a in @atoms
			avgs[0] += a.x
			avgs[1] += a.y
			avgs[2] += a.z
		(a/@atoms.length for a in avgs)
	
	translateTo: (center) =>
		for a in @atoms
			a.x -= center[0]
			a.y -= center[1]
			a.z -= center[2]

	
