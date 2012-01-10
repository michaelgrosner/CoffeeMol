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
		@selector = null
	
	constructorName: =>
		# THIS WILL BREAK IE COMPAT.
		@.constructor.name

	writeContextInfo: =>
		shortenName = (n) ->
			if n.length > 20 then n.substr 0, 20+"..." else n

		if @constructorName() != "Residue"
			link = "javascript:window.ctx.changeInfoFromSelectors('#{@selector.str}', \
						'drawMethod', 'points');"
			change_to_points = "<a href=\"#{link}\">Points</a>"

			plural = if @children.length == 1 then '' else 's'

			child_type_name = @children[0].constructorName()
			x = "#{@constructorName()}: #{shortenName @name} with #{@children.length}\
				#{child_type_name}#{plural} | #{@selector.str} | #{change_to_points}"
			p = (c.writeContextInfo() for c in @children)
			return "#{x}<br>#{p.join "" }"

	init: ->
		@atoms = @getOfType Atom
		
	addChild: (child) ->
		@children.push child
	
	propogateInfo: (info) ->
		@info = info

		if @info.drawColor?
			@info.drawColor = hexToRGBArray @info.drawColor 
		else
			@info.drawColor = randomRGB()

		for c in @children
			c.propogateInfo info
		null

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
		if @info.drawMethod not in supported_draw_methods
			c = supported_draw_methods.join ", "
			alert "drawMethod #{@info.drawMethod} not supported! Choose: #{c}"
		if @info.drawMethod == "lines"
			@drawPaths()
		else if @info.drawMethod == "points"
			@drawPoints()
		else if @info.drawMethod == "both"
			@drawPaths()
			@drawPoints()

	drawPaths: => 
		#@atoms.sort sortByZ

		isBonded = (a1, a2) ->
			if a1.parent.typeName() != a2.parent.typeName()
				return false

			# Precompute distance
			aad = atomAtomDistance(a1, a2)
			
			if aad < 3 and a1.parent.isProtein()
				true
			else if aad < 10 and a1.parent.isDNA()
				true
			else
				false

		x = @cc.context

		for i in [2..@atoms.length-1]
			for j in [i+1..i+5] when j < @atoms.length-1
				a2 = @atoms[i]
				a1 = @atoms[j]

				if a1.info.drawMethod == "points"
					continue

				if isBonded a1, a2 
					x.beginPath()
					x.moveTo(a1.x, a1.y)
					x.lineTo(a2.x, a2.y)
					x.strokeStyle = arrayToRGB (c + a1.z for c in @info.drawColor)
					#x.lineJoin = "round"
					#x.lineCap = "round"
					lw = (3*a1.z + 200)/200
					x.lineWidth = if lw > 0 then lw else lw
					x.closePath()
					x.stroke()
		null

	drawPoints: =>
		@atoms.sort sortByZ
		for a in @atoms when a.info.drawMethod != "lines"
			a.drawPoint(color = @info.drawColor)
		null

	applyToAllAtoms: (method, arg = null) =>
		for a in @atoms
			a.method arg

	rotateAboutY: (theta) =>
		for a in @atoms
			a.rotateAboutY theta
		null
	
	rotateAboutX: (theta) =>
		for a in @atoms
			a.rotateAboutX theta
		null
	
	restoreToOriginal: =>
		for a in @atoms
			a.restoreToOriginal()
		null
	
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
		null
