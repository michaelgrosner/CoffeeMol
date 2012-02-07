class CanvasContext
	constructor: (@canvas_tag, @background_color = "#ffffff") ->
		@elements = []
	
		try	
			# Use jQuery to get the canvas
			@canvas  = $(@canvas_tag)[0]
			@context = @canvas.getContext '2d'
		catch error
			alert error
		
		if $("#debug-info").length
			@resizeToWindow()
			$(window).resize =>
				@resizeToWindow()
				@drawAll()

		# Prevent highlighting on canvas, something which often happens
		# while clicking and dragging
		$(@canvas).css
			 "user-select": "none"
			 "-moz-user-select": "none"
			 "-webkit-user-select": "none"
			 "background-color": arrayToRGB @background_color

	init: =>
		# Previous mouse motions start at 0,0
		@mouse_x_prev = 0
		@mouse_y_prev = 0

		# Ready all sub-elements
		for el in @elements
			el.init()

		$("#reset").on "click", @restoreToOriginal

		# TODO: Determine which events need to be in operation depending on
		# device type
		@canvas.addEventListener 'mousedown',  @mousedown
		@canvas.addEventListener 'touchstart',  @touchstart

		@canvas.addEventListener 'DOMMouseScroll', @changeZoom
		@canvas.addEventListener 'mousewheel', @changeZoom
		@canvas.addEventListener 'gesturestart', @iOSChangeZoom

		@canvas.addEventListener 'dblclick',   @translateOrigin

		@findBonds()
		@assignSelectors()

		# Won't work outside of the debug environment
		if $("#debug-info").length
			@canvas.addEventListener 'mousemove',  @showAtomInfo

		@restoreToOriginal()

	addElement: (el) ->
		@elements.push el

	# -------
	# LOADING SECTION
	# -------
	addNewStructure: (filepath, info = null) =>
		handlePDB = (data) => 
			s = new Structure null, filepath, @
			
			for a_str in data.split '\n'
				if a_str.startswith "TITLE"
					s.attachTitle a_str
				
				if not a_str.startswith "ATOM"
					continue
	
				d = pdbAtomToDict a_str
				if not chain_id_prev? or d.chain_id != chain_id_prev
					c = new Chain s, d.chain_id
	
				if not resi_id_prev? or d.resi_id != resi_id_prev
					r = new Residue c, d.resi_name, d.resi_id
	
				a = new Atom r, d.atom_name, d.x, d.y, d.z, d.original_atom_name
				
				chain_id_prev = d.chain_id
				resi_id_prev = d.resi_id
			
			if info == null
				info = defaultInfo()
				if s.atoms.length > 100
					info.drawMethod = 'cartoon'
			s.propogateInfo info
		$.ajax
			async: false
			type: "GET"
			url: filepath
			success: handlePDB
		null

	loadFromDict: (structuresToLoad) =>
		for filepath, info of structuresToLoad
			@addNewStructure filepath, info
	
	# -------
	# DRAWING SECTION
	# -------
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
		
	changeAllDrawMethods: (new_method) =>
		# Most likely used in conjuction with a link handler
		@clear()
		for el in @elements
			el.info.drawMethod = new_method
		@drawAll()

	resizeToWindow: =>
		@canvas.width = window.innerWidth
		@canvas.height = window.innerHeight

	clear: =>
		#@context.setTransform 1, 0, 0, 1, 0, 0
		#@context.clearRect 0, 0, @canvas.width, @canvas.height
		@canvas.width = @canvas.width
		@context.translate @x_origin, @y_origin

	# -------
	# EVENTS SECTION
	# -------
	touchstart: (mobile_e) =>
		mobile_e.preventDefault()
		@canvas.addEventListener 'touchmove', @touchmove
		@canvas.addEventListener 'touchend',  @touchend
		@mousedown mobile_e.touches[0]

	mousedown: (e) =>
		@mouse_x_prev = e.clientX
		@mouse_y_prev = e.clientY
		@canvas.removeEventListener 'mousemove', @showAtomInfo
		@canvas.addEventListener 'mousemove', @mousemove
		@canvas.addEventListener 'mouseout',  @mouseup
		@canvas.addEventListener 'mouseup',   @mouseup

		#for el in @elements
		#	el.stashInfo()
		#	new_info = deepCopy el.info
		#	new_info.drawMethod = 'cartoon'
		#	new_info.drawColor = [100,100,100]
		#	el.propogateInfo new_info
		#	el.findBonds()

	mouseup: (e) =>
		#for el in @elements
		#	el.retrieveStashedInfo()
		#	el.findBonds()
		@clear()
		@drawAll()

		@canvas.removeEventListener 'mousemove', @mousemove
		@canvas.addEventListener 'mousemove',  @showAtomInfo
		@determinePointGrid()
	
	touchend: (mobile_e) =>
		@canvas.removeEventListener 'touchmove', @mousemove
		@mouseup mobile_e.touches[0]
	
	touchmove: (mobile_e) =>
		@mousemove mobile_e.touches[0]
	
	mousemove: (e) =>
		dx = boundMouseMotion @mouse_x_prev - e.clientX
		dy = boundMouseMotion @mouse_y_prev - e.clientY
		ds = Math.sqrt(dx*dx + dy*dy)

		time_start = new Date

		@clear()
		for el in @elements
			el.rotateAboutX degToRad dy
			el.rotateAboutY degToRad -dx
		@drawAll()

		fps = 1000/(new Date - time_start)
		if fps < 15
			low_fps_warning = '<p style="color: red;">It appears this molecule is too large to handle smoothly, consider using "C"/Cartoon mode, a faster computer, or upgrade your browser</p>'
		else
			low_fps_warning = ""

		$("#debug-info").html("#{low_fps_warning}FPS: #{fps.toFixed 2}, \
				ds: #{ds.toFixed 2}, \
				dx: #{dx.toFixed 2}, \
				dy: #{dy.toFixed 2}")
		
		@mouse_x_prev = e.clientX
		@mouse_y_prev = e.clientY
	
	# iOS (at least) Pinch-To-Zoom functionality
	iOSChangeZoom: (gesture) =>
		zoomChanger = (gesture) =>
			# Prevent from whole page zooming
			gesture.preventDefault()
			# Zooming metric
			@zoom *= Math.sqrt gesture.scale
			for el in @elements
				el.rotateAboutZ degToRad boundMouseMotion gesture.rotation
			@clear()
			if @zoom > 0
				@drawAll()
				@zoom_prev = @zoom
		zoomChanger gesture
		@canvas.addEventListener 'gesturechange', zoomChanger

	changeZoom: (e) =>
		# Use mousewheel to zoom in and out
		if e.hasOwnProperty 'wheelDelta'
			@zoom = @zoom_prev - e.wheelDelta/50.0
		else #if e.hasOwnProperty 'detail' 
			@zoom = @zoom_prev - e.detail/50.0
		e.preventDefault()
		@clear()
		if @zoom > 0
			@drawAll()
			@zoom_prev = @zoom

	restoreToOriginal: =>
		center = @avgCenterOfAllElements()
		for el in @elements
			el.restoreToOriginal()
			el.translateTo(center)
		@zoom = @findBestZoom()
		@zoom_prev = @zoom
		@x_origin = @canvas.width/2
		@y_origin = @canvas.height/2
		if $("#debug-info").length
			@x_origin += $(".cc-size").width()/2
		@clear()
		@drawAll()

	findBonds: =>
		@bonds = []
		el.findBonds() for el in @elements
		null

	# -------
	# MOTION SECTION
	# -------
	translateOrigin: (e) =>
		click = mousePosition e
		@x_origin = click.x
		@y_origin = click.y
		@clear()
		@drawAll()
			
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
	
	timedRotation: (dim, dt) =>
		@delayID = delay dt, =>
			@clear()
			if dim == 'X'
				el.rotateAboutX degToRad 1 for el in @elements
			else if dim == 'Y'
				el.rotateAboutY degToRad 1 for el in @elements
			else if dim == 'Z'
				el.rotateAboutZ degToRad 1 for el in @elements
			@drawAll()
	
	stopRotation: ->
		clearInterval @delayID

	# -------
	# DEBUG SECTION
	# -------
	determinePointGrid: =>
		if $("#debug-info").length == 0
			console.log "not determining pg"
			return null
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
							1
		null

	showAtomInfo: (e) =>
		if not $("#debug-info").length
			console.log "not showing atom info"
			return null

		#TODO: Does not work well with lines/cartoon
		# Unhighlight the previously highlighted atom
		if @a_prev?
			@a_prev.info.drawColor = @a_prev.info.prevDrawColor
			@a_prev.info.borderColor = @a_prev.info.prevBorderColor
			@a_prev.drawPoint()

		# Get mouse position, then use it to check against the previously computed
		# @grid to show atomInfo() and highlight it a bright green color.
		click = mousePosition e
		grid_x = parseInt (click.x - @x_origin)/@zoom
		grid_y = parseInt (click.y - @y_origin)/@zoom
		if @grid[grid_x]? and @grid[grid_x][grid_y]?
			a = @grid[grid_x][grid_y]

			if a.info.drawMethod in ['lines', 'cartoon']
				return null

			a.info.prevDrawColor = a.info.drawColor
			a.info.prevBorderColor = a.info.prevBorderColor
			a.info.drawColor = [0,255,0]
			a.info.borderColor = [0,0,255]
			a.drawPoint()

			@a_prev = a

			$("#atom-info").html a.atomInfo()
		null
	
	writeContextInfo: =>
		# See http://api.jquery.com/html/
		htmlInfo = (index, oldhtml) =>
			el_info = ("<p>#{el.writeContextInfo()}</p>" for el in @elements)
			el_info.join " "
		$("#ctx-info").html htmlInfo


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

	# -------
	# CHILD SELECTOR SECTION
	# -------
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
		if selectors == "all"
			selectors = (el.selector for el in @elements)
		else if not selectors instanceof Array or typeof selectors == 'string'
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
