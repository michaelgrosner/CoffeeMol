class Residue extends Element
	constructor: (parent, name, @id) ->
		super(parent, name)

	toString: ->
		"<Residue #{@name} with #{@children.length} atoms>"
	
	isDNA: ->
		if @name in nuc_acids then true else false
	
	isProtein: ->
		# Probably could use more work, i.e. dealing with non-biological stuff
		if not @isDNA() then true else false
	
	# Supported:
	# > DNA
	# > Protein
	# Need to Add:
	# > RNA
	# > Inorganic?
	typeName: ->
		if @isDNA
			return "DNA"
