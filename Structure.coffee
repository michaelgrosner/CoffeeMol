class Structure extends Element
	constructor: (parent, name, cc) ->
		if name.startswith "http:"
			n = name.split "/"
			name = n[n.length-1]
		if name.endswith ".pdb"
			n = name.split "."
			name = n[0]
		super(parent, name, cc)
		cc.addElement @

	toString: =>
		n = if @title? then @title else @name
		"<Structure #{n} with #{@children.length} chains>"
	
	attachTitle: (str) =>
		str = str.replace "TITLE ", ""
		if not @title?
			@title = str
		else
			@title += str[2..str.length]
