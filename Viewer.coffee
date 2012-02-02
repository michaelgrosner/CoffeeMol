if $("#debug-info").length
	$("#add-new-structure .submit").on 'click', addNewStructure
	#$("#ctx-info").on window.onresize, ->
	#	console.log $(@).offset()

	fitCtxInfo = ->
		c = $("#ctx-info")
		top = c.offset().top
		w_height = $(window).height()
		c.height w_height-top-100
	# COMMENT
	
	fitCtxInfo()
	$(window).resize fitCtxInfo

		
	fade = "out"
	$("#show-ctx-container").on "click", ->
		if fade == "in"
			$(".cc-size").fadeIn "fast", ->
				fade = "out"
				$("#show-ctx-container").html "<< Options"
		else if fade == "out"
			$(".cc-size").fadeOut "fast", ->
				fade = "in"
				$("#show-ctx-container").html "Options >>"

	$("#help-area").on "click", -> $(this).css("display", "none")

	# the filepath argument can also use a http address 
	# (e.g. http://www.rcsb.org/pdb/files/1AOI.pdb)
	structuresToLoad =
		"PDBs/A1_open_2HU_78bp_1/out-1-16.pdb":
			drawMethod: "cartoon"
			drawColor: [47, 254, 254]
		"PDBs/A1_open_2HU_78bp_1/half1_0.pdb":
			drawMethod: "points"
			drawColor: [254, 0, 254]
		"PDBs/A1_open_2HU_78bp_1/half2-78bp-ID0_B1-16.pdb":
			drawMethod: "both"
			drawColor: [254, 0, 254]
		"PDBs/A1_open_2HU_78bp_1/proteins-78bp-ID0_B1-16.pdb":
			drawMethod: "lines"
			drawColor: [251, 251, 1]
	"""
	structuresToLoad =
		"PDBs/half1_0.pdb":
			drawMethod: "cartoon"
	
	structuresToLoad =
		"http://www.rcsb.org/pdb/files/1MMS.pdb":
			drawMethod: "both"
			#drawColor: [47, 254, 254]
	"""

	dismissWelcomeSplash = ->
		$("#show-ctx-container").css "display", "block"
		$(".cc-size").css "display", "block"
		$("#welcome-splash").fadeOut "fast"

	if not structuresToLoad?
		$("#show-ctx-container").css "display", "none"
		$(".cc-size").css "display", "none"

		$("#welcome-splash").css
			left: $(window).width()/2 - $("#welcome-splash").outerWidth()/2
			top: $(window).height()/2 - $("#welcome-splash").outerHeight()/2

		$("#welcome-splash").fadeIn "fast", ->
			$("#show-ctx-container").fadeIn "fast"
			$(".sample-pdb-link").on "click", dismissWelcomeSplash
			$("#welcome-splash #dismiss").on "click", dismissWelcomeSplash
				
	else
		loadFromDict structuresToLoad
	
	ctx.init()
	
	ctx.writeContextInfo()
	
	$("#ctx-info").on "click", ".open-dropdown", (e) ->
		# Probably not good form, but the dropdown should be a sibling to the 
		# right of `.open-dropdown`
		d = $(@).next()
		if (d.filter ":hidden").length == 1
			d.css
				'top':  e.pageY
				'left': e.pageX
			d.fadeIn "fast"
		else
			d.fadeOut "fast"

	$("#ctx-info").on "click", ".element-desc", (e) ->
		cc = $(@).siblings().next()
		cc = cc.add cc.find ".element-desc"
		shown = cc.css "display"
		if shown == "none" then cc.fadeIn "fast" else cc.fadeOut "fast"

