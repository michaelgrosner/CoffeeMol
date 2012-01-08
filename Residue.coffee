class Residue extends Element
	constructor: (parent, name, @id) ->
		super(parent, name)
	
	toString: ->
		"<Residue #{@name} with #{@children.length} atoms>"
	
