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

	right: =>
		aNext = @array
		aNext[aNext.length-1] = aNext[aNext.length-1] + 1
		new Selector aNext.join selector_delimiter
	
	left: =>
		aNext = @array
		aNext[aNext.length-1] = aNext[aNext.length-1] - 1
		new Selector aNext.join selector_delimiter

	down: =>
		aNext = @array
		aNext.push 0
		new Selector aNext.join selector_delimiter

	up: =>
		aNext = @array[0..@array.length-2]
		n = new Selector aNext.join selector_delimiter
		if n.str == @.str then null else n 
