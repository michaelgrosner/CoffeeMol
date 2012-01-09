class CanvasContext
	constructor: (@canvas_tag) ->
		@elements = []
	
		try	
			@canvas  = document.getElementById @canvas_tag
			@context = @canvas.getContext '2d'
		catch error
			console.log error

	init: =>
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

		@restoreToOriginal()
		
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
		"""
		for x in [0.5..@canvas.width] by 10
			@context.moveTo x, 0
			@context.lineTo x, @canvas.height
		for y in [0.5..@canvas.height] by 10
			@context.moveTo 0, y
			@context.lineTo @canvas.width, y
		"""
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
		#@drawGridLines()
	
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
		@y_origin = @canvas.width/2
		@clear()
		@drawAll()

	translateOrigin: (e) =>
		@x_origin = e.x
		@y_origin = e.y
		@clear()
		@drawAll()

	writeContextInfo: =>
		# See http://api.jquery.com/html/
		htmlInfo = (index, oldhtml) =>
			el_info = ("<p>#{el.writeContextInfo()}</p>" for el in @elements)
			el_info.join " "
			"<a href=\"javascript:window.ctx.changeAllDrawMethods('points');\">Canvas</a><br><br>#{el_info}"
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

	childFromSelector: (selector) =>
		selArray = (parseInt x for x in selector.split "/")

		c = @
		for i in selArray
			if c.elements?
				c = c.elements[i]
			else
				c = c.children[i]
		return c
