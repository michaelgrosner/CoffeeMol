selector_delimiter = "/"

class Selector
	constructor: (s = null) ->
		if not s
			@str = "0"
			@array = [0]
		else if s instanceof Array
			@str = s.join selector_delimiter
			@array = s
		else if typeof s == "string"
			@str = s
			@array = @str.split selector_delimiter

		#@validate()
	
	#validate: =>
	#	1

	horizontalNext: =>
		aNext = @array
		aNext[aNext.length-1] = aNext[aNext.length-1] + 1
		new Selector aNext.join selector_delimiter

	verticalNext: =>
		aNext = @array
		aNext.push 0
		new Selector aNext.join selector_delimiter
