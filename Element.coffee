class Element
	constructor: (@parent, @name, cc = null) ->
		@children = []

		if parent? 
			@parent.addChild @

		@cc = if cc? then cc else @parent.cc

		@info = {}
		@selector = null
	
	constructorName: =>
		# THIS WILL BREAK IE COMPAT.
		@.constructor.name

	writeContextInfo: =>
		shortenName = (n) ->
			if n.length > 20 then n.substr(0,17)+"..." else n

		if @constructorName() != "Atom"

			plural = if @children.length == 1 then '' else 's'

			pointsLink  = genIFSLink @selector.str, "drawMethod", "points", "Points"
			linesLink   = genIFSLink @selector.str, "drawMethod", "lines", "Lines"
			bothLink    = genIFSLink @selector.str, "drawMethod", "both", "Points + lines"
			cartoonLink = genIFSLink @selector.str, "drawMethod", "cartoon", "Cartoon"

			child_type_name = @children[0].constructorName()

			# a) Not sure if I even need @selector.str in the class
			# b) Not sure if I can include /'s in a class descriptor
			dropdown = "<span class='fake-button open-dropdown'>Draw</span><span class='dropdown #{@selector.str}'>#{pointsLink} #{linesLink} #{bothLink} #{cartoonLink}</span>"
			ctx_info = "<span class='element-desc #{@constructorName()} fake-button'>#{@constructorName()}: #{shortenName @name} with #{@children.length} #{child_type_name}#{plural}</span> #{dropdown}"
			children_info = (c.writeContextInfo() for c in @children)
			return "<div class='element-controller #{@constructorName()}'>#{ctx_info}#{children_info.join "" }</div>"

	init: ->
		@atoms = @getOfType Atom
		
	addChild: (child) ->
		@children.push child
	
	propogateInfo: (info) ->

		# Object deep-copy. See http://stackoverflow.com/a/122704/178073
		@info = $.extend(true, {}, info)

		if @info.drawColor?
			@info.drawColor = hexToRGBArray @info.drawColor 
		else
			@info.drawColor = randomRGB()

		if @info.borderColor?
			@info.borderColor = hexToRGBArray @info.borderColor
		else
			@info.borderColor = [0, 0, 0]

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
		@drawLines()
		@drawPoints()

	drawLines: => 
		@bonds.sort sortBondsByZ
		for b in @bonds when b.a1.info.drawMethod != 'points'

			# This is to give a slight outline to each line
			"""
			@cc.context.beginPath()
			@cc.context.moveTo b.a1.x, b.a1.y
			@cc.context.lineTo b.a2.x, b.a2.y
			@cc.context.strokeStyle = arrayToRGB [10,10,10] 
			@cc.context.lineWidth = .1/@cc.zoom+2/@cc.zoom
			@cc.context.closePath()
			@cc.context.stroke()
			"""
			
			@cc.context.beginPath()
			@cc.context.moveTo b.a1.x, b.a1.y
			@cc.context.lineTo b.a2.x, b.a2.y
			if b.a1.info.drawMethod != 'both'
				color = (c + b.a1.z for c in b.a1.info.drawColor)
			else
				color = (100 - b.a1.z for c in b.a1.info.drawColor)
			@cc.context.strokeStyle = arrayToRGB color
			@cc.context.lineWidth = 2/@cc.zoom
			@cc.context.closePath()
			@cc.context.stroke()
		null

	drawPoints: =>
		sorted_atoms = @atoms.slice()
		sorted_atoms.sort sortByZ
		for a in sorted_atoms
			if a.info.drawMethod not in ["lines", "cartoon"]
				a.drawPoint()
		null

	rotateAboutZ: (theta) =>
		cos = Math.cos theta
		sin = Math.sin theta
		a.rotateAboutZ sin, cos for a in @atoms
		null
	
	rotateAboutY: (theta) =>
		cos = Math.cos theta
		sin = Math.sin theta
		a.rotateAboutY sin, cos for a in @atoms
		null
	
	rotateAboutX: (theta) =>
		cos = Math.cos theta
		sin = Math.sin theta
		a.rotateAboutX sin, cos for a in @atoms
		null
	
	restoreToOriginal: =>
		a.restoreToOriginal() for a in @atoms
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
	
	findBonds: =>
		@bonds = []
		for i in [2..@atoms.length-1]
			a1 = @atoms[i]
			j_step = if a1.info.drawMethod == 'cartoon' then 30 else 5
			for j in [i+1..i+j_step] when j < @atoms.length-1
				a2 = @atoms[j]

				if isBonded a1, a2
					b = new Bond a1, a2
					@bonds.push b
