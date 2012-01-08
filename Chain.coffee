class Chain extends Element
	constructor: (parent, name) ->
		super(parent, name)
	
	toString: ->
		"<Chain #{@name} with #{@children.length} residues>"


