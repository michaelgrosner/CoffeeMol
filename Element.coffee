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
		@bonds = []
	
	constructorName: =>
		# THIS WILL BREAK IE COMPAT.
		@.constructor.name

	writeContextInfo: =>
		shortenName = (n) ->
			n#if n.length > 20 then n.substr 0, 20+"..." else n

		genIFSLink  = (selector_str, key, val, pretty) ->
			link = "javascript:window.ctx.changeInfoFromSelectors('#{selector_str}', \
						'#{key}', '#{val}');"
			"<a href=\"#{link}\">#{pretty}</a>"


		if @constructorName() != "Residue"

			plural = if @children.length == 1 then '' else 's'

			pointsLink = genIFSLink @selector.str, "drawMethod", "points", "P"
			linesLink  = genIFSLink @selector.str, "drawMethod", "lines", "L"
			bothLink   = genIFSLink @selector.str, "drawMethod", "both", "B"

			child_type_name = @children[0].constructorName()
			x = "#{@constructorName()}: #{shortenName @name} with #{@children.length}\
				#{child_type_name}#{plural} | #{pointsLink} | \
				#{linesLink} | #{bothLink}"
			p = (c.writeContextInfo() for c in @children)
			return "#{x}<br>#{p.join "" }"

	init: ->
		@atoms = @getOfType Atom
		
	addChild: (child) ->
		@children.push child
	
	propogateInfo: (info, debug = false) ->
		@info = info

		if @info.drawColor?
			@info.drawColor = hexToRGBArray @info.drawColor 
		else
			@info.drawColor = randomRGB()

		for c in @children
			c.propogateInfo info
			if debug
				console.log c.toString()
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
		@drawLines()
		@drawPoints()

	drawLines: => 
		@bonds.sort sortBondsByZ
		for b in @bonds when b.a1.drawMethod != 'points'
			@cc.context.beginPath()
			@cc.context.moveTo(b.a1.x, b.a1.y)
			@cc.context.lineTo(b.a2.x, b.a2.y)
			@cc.context.strokeStyle = arrayToRGB (c + b.a1.z for c in b.a1.info.drawColor)
			#@cc.context.lineJoin = "round"
			@cc.context.lineCap = "round"
			#lw = (3*b.a1.z + 200)/200
			@cc.context.lineWidth = 2/@cc.zoom#if lw > 0 then lw else lw
			@cc.context.closePath()
			@cc.context.stroke()
			#b.a2.drawPoint()
		null

	drawPoints: =>
		@atoms.sort sortByZ
		for a in @atoms when a.info.drawMethod != "lines"
			a.drawPoint()
		null

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
