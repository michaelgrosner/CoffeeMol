class Structure extends Element
	constructor: (parent, name, cc) ->
		super(parent, name, cc)
		cc.addElement @

	toString: =>
		"<Structure #{@name} with #{@children.length} chains>"
	
