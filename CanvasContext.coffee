class CanvasContext
	constructor: (@canvas_tag) ->
		@elements = []
	
		try	
			# Use jQuery to get the canvas
			@canvas  = $(@canvas_tag)[0]
			@context = @canvas.getContext '2d'
		catch error
			console.log error

		# Prevent highlighting on canvas, something which often happens
		# while clicking and dragging
		$(@canvas).css
			 "user-select": "none"
			 "-moz-user-select": "none"
			 "-webkit-user-select": "none"

	determinePointGrid: =>
		# TODO: Is there a better algorithm than this mess?

		# Seed grid with nulls
		@grid = {}
		for w in [-@x_origin..@canvas.width-@x_origin]
			@grid[w] = {}
			for h in [-@y_origin..@canvas.height-@y_origin]
				@grid[w][h] = null

		# Fill in grid with the top atom at that pixel. This serves as 
		# a quick lookup when hovering over an atom
		for el in @elements
			for a in el.atoms
				w = parseInt a.x
				h = parseInt a.y
				dx = parseInt ATOM_SIZE/@zoom
				for i in [-1*dx..dx]
					for j in [-1*dx..dx]
						try
							if not @grid[w+i][h+j]? or a.z > @grid[w+i][h+j].z
								@grid[w+i][h+j] = a
						# May need to rethink a bit more
						catch error
							1#console.log error, w, h
		null

	showAtomInfo: (e) =>
		#TODO: Does not work well with lines/cartoon
		# Unhighlight the previously highlighted atom
		if @a_highlighted_prev?
			@a_highlighted_prev.info.drawColor = @a_highlighted_prev.info.prevDrawColor
			@a_highlighted_prev.info.borderColor = @a_highlighted_prev.info.prevBorderColor
			@a_highlighted_prev.drawPoint()

		# Get mouse position, then use it to check against the previously computed
		# @grid to show atomInfo() and highlight it a bright green color.
		click = mousePosition e
		xx = parseInt (click.x - @x_origin)/@zoom
		yy = parseInt (click.y - @y_origin)/@zoom
		if @grid[xx]? and @grid[xx][yy]?
			a = @grid[xx][yy]

			a.info.prevDrawColor = a.info.drawColor
			a.info.prevBorderColor = a.info.prevBorderColor
			a.info.drawColor = [0,255,0]
			a.info.borderColor = [0,0,255]
			a.drawPoint()

			@a_highlighted_prev = a

			$("#atom-info").html a.atomInfo()
		null

	init: =>
		# Won't work outside of the debug environment
		if $("#debug-info").length > 0
			@canvas.width = window.innerWidth/1.5
			$("#ctx-container").css "width", window.innerWidth - @canvas.width - 45
			@canvas.height = window.innerHeight - 20
			@canvas.addEventListener 'mousemove',  @showAtomInfo

		# Background color of the canvas
		# TODO: Embedder changable?
		@background_color = [255, 255, 255]
	
		# Previous mouse motions start at 0,0
		@mouse_x_prev = 0
		@mouse_y_prev = 0

		$("#reset").live "click", @restoreToOriginal

		# Ready all sub-elements
		for el in @elements
			el.init()

		@canvas.addEventListener 'mousedown',  @mousedown
		@canvas.addEventListener 'mousewheel', @changeZoom
		@canvas.addEventListener 'dblclick',   @translateOrigin
		#@canvas.addEventListener 'click', @rotateToClick

		@findBonds()
		@restoreToOriginal()
		@assignSelectors()
		@determinePointGrid()
	
	assignSelectors: =>
		#TODO: Fix this!
		# Also, remember the order of for ... in arguments is reversed comapred to Python!
		for el, ne in @elements
			el.selector = new Selector [ne]
			for c, nc in el.children
				c.selector = new Selector [ne, nc]
				for r, nr in c.children
					r.selector = new Selector [ne, nc, nr]
					for a, na in r.children
						a.selector = new Selector [ne, nc, nr, na]
		null


	findBestZoom: =>
		max_x = 0
		max_y = 0
		for el in @elements
			for a in el.atoms
				if Math.abs(a.x) > max_x
					max_x = Math.abs(a.x)
				if Math.abs(a.y) > max_y
					max_y = Math.abs(a.y)
		if max_x > max_y then @canvas.width/(2*max_x) else @canvas.width/(2*max_y)
	
	drawGridLines: =>
		@context.moveTo 0, -@canvas.height
		@context.lineTo 0, @canvas.height

		@context.moveTo -@canvas.width, 0
		@context.lineTo @canvas.width, 0

		@context.strokeStyle = "#eee"
		@context.stroke()
	
	addElement: (el) ->
		@elements.push el

	drawAll: (DEBUG = false) =>
		@drawGridLines()

		@context.scale @zoom, @zoom

		# When drawing by lines, sort elements in order of depth of overall Z
		# This should be smarter, and bonds should be moved to a CanvasContext
		# so they can sorted that way
		sortByAvgZ = (e1, e2) ->
			c1 = e1.avgCenter()
			c2 = e2.avgCenter()
			c1[2] - c2[2]

		@elements.sort sortByAvgZ
		for el in @elements
			el.draw()
		null
	
	changeAllDrawMethods: (new_method) =>
		# Most likely used in conjuction with a link handler
		@clear()
		for el in @elements
			el.info.drawMethod = new_method
		@drawAll()

	clear: => 
		#@context.setTransform 1, 0, 0, 1, 0, 0
		#@context.clearRect 0, 0, @canvas.width, @canvas.height
		@canvas.width = @canvas.width
		@context.translate @x_origin, @y_origin
	
	mousedown: (e) =>
		@mouse_x_prev = e.clientX
		@mouse_y_prev = e.clientY
		@canvas.removeEventListener 'mousemove', @showAtomInfo
		@canvas.addEventListener 'mousemove', @mousemove
		@canvas.addEventListener 'mouseout',  @mouseup
		@canvas.addEventListener 'mouseup',   @mouseup
	
	changeZoom: (e) =>
		# Use mousewheel to zoom in and out
		if e instanceof WheelEvent
			@zoom = @zoom_prev - e.wheelDelta/50
		else
			@zoom = @zoom_prev - e
		@clear()
		if @zoom > 0
			@drawAll()
			@zoom_prev = @zoom

	mouseup: (e) =>
		@canvas.removeEventListener 'mousemove', @mousemove
		@canvas.addEventListener 'mousemove',  @showAtomInfo
		@determinePointGrid()
	
	mousemove: (e) =>
		# TODO: Large mouse movements will squish and distort the molecule (perhaps
		# JS can't keep up with large motions? Numerical error? Coding error???)
		# Limit to some tolerance level `tol`. I assume it's probably highly dependent
		# on CPU/Browser/GPU(?) etc.
		tol = 2
		boundMouseMotion = (dz) ->
			if dz > tol
				tol
			else if dz < -1*tol
				-1*tol
			else
				dz

		dx = boundMouseMotion @mouse_x_prev - e.clientX
		dy = boundMouseMotion @mouse_y_prev - e.clientY
		ds = Math.sqrt(dx*dx + dy*dy)

		@time_start = new Date

		@clear()
		for el in @elements
			el.rotateAboutX degToRad dy
			el.rotateAboutY degToRad -dx
		@drawAll()

		fps = 1000/(new Date - @time_start)
		if fps < 15
			low_fps_warning = '<p style="color: red;">It appears this molecule is too large to handle smoothly, consider using a faster computer or browser</p>'
		else
			low_fps_warning = ""

		$("#debug-info").html("#{low_fps_warning}FPS: #{fps.toFixed 2}, ds: #{ds.toFixed 2},\
				dx: #{dx.toFixed 2}, dy: #{dy.toFixed 2}")
		
		@mouse_x_prev = e.clientX
		@mouse_y_prev = e.clientY

		#console.log @elements[0].bonds[@elements[0].bonds.length-1].toString()
	
	restoreToOriginal: =>
		@zoom = @findBestZoom()
		@zoom_prev = @zoom
		center = @avgCenterOfAllElements()
		for el in @elements
			el.restoreToOriginal()
			el.translateTo(center)
		@x_origin = @canvas.width/2
		@y_origin = @canvas.height/2
		@clear()
		@drawAll()

	translateOrigin: (e) =>
		click = mousePosition e
		@x_origin = click.x
		@y_origin = click.y
		@clear()
		@drawAll()

	writeContextInfo: =>
		# See http://api.jquery.com/html/
		htmlInfo = (index, oldhtml) =>
			el_info = ("<p>#{el.writeContextInfo()}</p>" for el in @elements)
			el_info.join " "
		$("#ctx-info").html htmlInfo
	
	avgCenterOfAllElements: =>
		avgs = [0.0, 0.0, 0.0]
		total_atoms = 0
		for el in @elements
			elAvg = el.avgCenter()
			ela = el.atoms.length
			avgs[0] += elAvg[0]*ela
			avgs[1] += elAvg[1]*ela
			avgs[2] += elAvg[2]*ela
			total_atoms += el.atoms.length
		(a/total_atoms for a in avgs)
	
	handleSelectorArg: (s) =>
		if typeof s == "string"
			s = new Selector s
		return s

	childFromSelector: (selector) =>
		#selArray = (parseInt x for x in selector.split "/")

		# If it's a string, make sure to convert it to a selector object
		selector = @handleSelectorArg selector

		c = @
		for i in selector.array
			if c.elements?
				c = c.elements[i]
			else
				c = c.children[i]
		return c
	
	changeInfoFromSelectors: (selectors, info_key, info_value) =>
		# `selectors` can be a single String which will map to a single Selector
		# or a single Selector, or an array of those two types.
		# TODO: This will not change drawMethods for anything other than top level
		# elements (Structure)
		if not selectors instanceof Array or typeof selectors == 'string'
			selectors = [selectors]

		for selector in selectors
	
			selector = @handleSelectorArg selector
	
			try
				c = @childFromSelector(selector)
			catch error
				alert "Child from selector #{selector.str} does not exist"
	
			try
				c.info[info_key] = info_value.toLowerCase()
			catch error
				alert "Error: #{error} with #{info_key} to #{info_value}"
	
			c.propogateInfo c.info
			@clear()
			if c.info.drawMethod != 'points'
				@findBonds()
			@drawAll()
			null
	
	findBonds: =>
		@bonds = []
		for el in @elements
			el.findBonds()
		null

