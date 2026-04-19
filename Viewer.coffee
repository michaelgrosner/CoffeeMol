if document.getElementById('debug-info')
	document.querySelector('#add-new-structure .submit')?.addEventListener 'click', addNewStructure

	fitCtxInfo = ->
		c = document.getElementById('ctx-info')
		top = c.getBoundingClientRect().top + window.scrollY
		w_height = window.innerHeight
		c.style.height = (w_height - top - 100) + 'px'
	# COMMENT

	fitCtxInfo()
	window.addEventListener 'resize', fitCtxInfo


	fade = "out"
	document.getElementById('show-ctx-container')?.addEventListener 'click', ->
		ccSize = document.querySelectorAll('.cc-size')
		if fade == "in"
			ccSize.forEach (el) -> el.style.display = 'block'
			fade = "out"
			document.getElementById('show-ctx-container').textContent = "<< Options"
		else if fade == "out"
			ccSize.forEach (el) -> el.style.display = 'none'
			fade = "in"
			document.getElementById('show-ctx-container').textContent = "Options >>"

	document.getElementById('help-area')?.addEventListener 'click', ->
		this.style.display = 'none'

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
		"http://www.rcsb.org/pdb/files/1MMS.pdb":
			drawMethod: "both"
			#drawColor: [47, 254, 254]
	structuresToLoad =
		"PDBs/half1_0.pdb":
			drawMethod: "both"
	"""


	dismissWelcomeSplash = ->
		document.getElementById('show-ctx-container')?.style.display = 'block'
		document.querySelectorAll('.cc-size').forEach (el) -> el.style.display = 'block'
		document.getElementById('welcome-splash')?.style.display = 'none'

	if not structuresToLoad?
		showCtx = document.getElementById('show-ctx-container')
		if showCtx then showCtx.style.display = 'none'
		document.querySelectorAll('.cc-size').forEach (el) -> el.style.display = 'none'

		splash = document.getElementById('welcome-splash')
		if splash
			splash.style.left = (window.innerWidth/2 - splash.offsetWidth/2) + 'px'
			splash.style.top  = (window.innerHeight/2 - splash.offsetHeight/2) + 'px'
			splash.style.display = 'block'
			if showCtx then showCtx.style.display = 'block'
			document.querySelectorAll('.sample-pdb-link').forEach (el) ->
				el.addEventListener 'click', dismissWelcomeSplash
			document.querySelector('#welcome-splash #dismiss')?.addEventListener 'click', dismissWelcomeSplash

	else
		coffeemol.loadFromDict structuresToLoad

	coffeemol.writeContextInfo()

	document.getElementById('ctx-info')?.addEventListener 'click', (e) ->
		if e.target.classList.contains('open-dropdown')
			d = e.target.nextElementSibling
			if d
				if d.style.display == 'none' or d.style.display == ''
					d.style.top  = e.pageY + 'px'
					d.style.left = e.pageX + 'px'
					d.style.display = 'block'
				else
					d.style.display = 'none'
		else if e.target.classList.contains('element-desc')
			siblings = Array.from(e.target.parentElement.children)
			idx = siblings.indexOf(e.target)
			cc = siblings.slice(idx + 1)
			cc = cc.concat(cc.flatMap (el) -> Array.from(el.querySelectorAll('.element-desc')))
			shown = cc[0]?.style.display
			cc.forEach (el) -> el.style.display = if shown == 'none' or shown == '' then 'block' else 'none'
