class CanvasContext
	constructor: (@canvas_tag) ->
		@elements = []
	
		try	
			@canvas  = document.getElementById @canvas_tag
			@context = @canvas.getContext '2d'
		catch error
			console.log error

		noselect =
			 "user-select": "none"
			 "-moz-user-select": "none"
			 "-webkit-user-select": "none"
		$(@canvas).css noselect

	init: =>
		# Won't work outside of the debug environment
		if $("#debug-env").length > 0
			@canvas.width = window.innerWidth/1.5
			$("#ctx-container").css "width", window.innerWidth - @canvas.width - 35
			@canvas.height = window.innerHeight - 70
		@background_color = [255, 255, 255]
	
		@canvas.addEventListener 'mousedown', @mousedown
		@canvas.addEventListener 'mouseup', @mouseup
		@mouse_x_prev = 0
		@mouse_y_prev = 0

		$("#reset").live("click", @restoreToOriginal)

		for el in @elements
			el.init()

		@canvas.addEventListener 'mousewheel', @changeZoom
		@canvas.addEventListener 'dblclick', @translateOrigin

		@findBonds()
		@restoreToOriginal()
		@assignSelectors()
	
	assignSelectors: =>
		#TODO: Fix this!
		ne = 0
		for el in @elements
			el.selector = new Selector [ne]
			nc = 0
			for c in el.children
				c.selector = new Selector [ne, nc]
				nr = 0
				for r in c.children
					r.selector = new Selector [ne, nc, nr]
					na = 0
					for a in r.children
						a.selector = new Selector [ne, nc, nr, na]
						na += 1
					nr += 1
				nc += 1
			ne += 1
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

	drawAll: () => 
		@context.scale @zoom, @zoom
		for el in @elements
			el.draw()
		null
	
	changeAllDrawMethods: (new_method) =>
		@clear()
		for el in @elements
			el.info.drawMethod = new_method
		@drawAll()

	clear: => 
		@canvas.width = @canvas.width
		@context.translate @x_origin, @y_origin
		@drawGridLines()
	
	mousedown: (e) =>
		@mouse_x_prev = e.x
		@mouse_y_prev = e.y
		@canvas.addEventListener 'mousemove', @mousemove
		@canvas.addEventListener 'mouseout', @mouseup
	
	changeZoom: (e) =>
		if e instanceof WheelEvent
			@zoom = @zoom_prev - e.wheelDelta/100
		else
			@zoom = @zoom_prev - e
		@clear()
		if @zoom > 0
			@drawAll()
			@zoom_prev = @zoom

	mouseup: (e) =>
		@canvas.removeEventListener 'mousemove', @mousemove
	
	mousemove: (e) =>
		dx = @mouse_x_prev - e.x
		dy = @mouse_y_prev - e.y

		@clear()
		for el in @elements
			el.rotateAboutX degToRad dy/2
			el.rotateAboutY degToRad -dx/2
		@drawAll()	
		
		@mouse_x_prev = e.x
		@mouse_y_prev = e.y
	
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
		@x_origin = e.offsetX
		@y_origin = e.offsetY
		@clear()
		@drawAll()

	writeContextInfo: =>
		# See http://api.jquery.com/html/
		htmlInfo = (index, oldhtml) =>
			el_info = ("<p>#{el.writeContextInfo()}</p>" for el in @elements)
			el_info.join " "
			#"<a href=\"javascript:window.ctx.changeAllDrawMethods('points');\">Canvas</a><br><br>#{el_info}"
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
	
			c_info = c.info
			try
				c_info[info_key] = info_value.toLowerCase()
			catch error
				alert "Error: #{error} with #{info_key} to #{info_value}"
	
			c.propogateInfo c_info, true
			@clear()
			@drawAll()
			null
	
	findBonds: =>
		for el in @elements
			for i in [2..el.atoms.length-1]
				for j in [i+1..i+5] when j < el.atoms.length-1
					a1 = el.atoms[i]
					a2 = el.atoms[j]

					if isBonded a1, a2
						el.bonds.push new Bond a1, a2
		null
