(function(maze, $, undefined)
{
	// cross-browser support for requestAnimationFrame and cancelAnimationFrame
	var requestAnimFrame = window.requestAnimationFrame
		|| window.webkitRequestAnimationFrame
		|| window.msRequestAnimationFrame
		|| window.mozRequestAnimationFrame
		|| function(callback) { return window.setTimeout(callback, 1000 / 60); };
	var cancelAnimFrame = window.cancelAnimationFrame
		|| window.webkitCancelRequestAnimationFrame
		|| window.webkitCancelAnimationFrame
		|| window.mozCancelRequestAnimationFrame || window.mozCancelAnimationFrame
		|| window.oCancelRequestAnimationFrame || window.oCancelAnimationFrame
		|| window.msCancelRequestAnimationFrame || window.msCancelAnimationFrame
		|| function(id) { clearTimeout(id); };

	var Direction = function(x, y)
	{
		this.x = x;
		this.y = y;
	}
	Direction.prototype.isOpposite = function(other)
	{
		return (this.x != 0 && this.x == -other.x)
			|| (this.y != 0 && this.y == -other.y);
	}
	Direction.NONE 	= new Direction(0, 0);
	Direction.RIGHT = new Direction(1, 0);
	Direction.LEFT 	= new Direction(-1, 0);
	Direction.UP 	= new Direction(0, -1);
	Direction.DOWN 	= new Direction(0, 1);

	var Cell = function(x, y, color, fromDir)
	{
		this.x = x;
		this.y = y;
		this.color = color;
		this.fromDir = fromDir;
	}

	var Settings = function(startX, startY, blockSize, cellDistance, directionShuffleProbability,
		disallowSameDirection, circleProbability, backgroundColor, colorFactor, colorFunction)
	{
		this.startX = startX;
		this.startY = startY;
		this.blockSize = blockSize;
		this.cellDistance = cellDistance;
		this.directionShuffleProbability = directionShuffleProbability;
		this.disallowSameDirection = disallowSameDirection;
		this.circleProbability = circleProbability;
		this.backgroundColor = backgroundColor;
		this.colorFactor = colorFactor;
		this.colorFunction = colorFunction;
	}
	Settings.prototype = {
		get border()
		{
			if(this.cellDistance == 1)
			{
				return 0;
			}
			return 1;
		}
	}

	var settings;
	var updatesPerFrame;
	var running;
	// array for the direction that the maze expands in
	// the first direction is taken first (if possible)
	var directions;
	var animFrameReqId = null;

	var data;
	var width;
	var height;
	var dfsStack;

	var canvas;
	var context;
	var bufferCanvas;
	var bufferContext;
	var changedCells;

	/**
	 * Shuffles array in place.
	 * @see http://stackoverflow.com/a/6274381
	 * @param {Array} a items The array containing the items.
	 */
	function shuffle(a)
	{
		var j, x, i;
		for(i = a.length; i; i--)
		{
			j = Math.floor(Math.random() * i);
			x = a[i - 1];
			a[i - 1] = a[j];
			a[j] = x;
		}
	}

	function initCanvas()
	{
		// get canvas
		canvas = document.getElementById("canvas");
		canvas.mozOpaque = true;
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
		context = canvas.getContext("2d");

		// buffer canvas
		bufferCanvas = document.createElement("canvas");
		bufferCanvas.width = canvas.width;
		bufferCanvas.height = canvas.height;
		bufferContext = bufferCanvas.getContext("2d");

		changedCells = new Array();
	}

	function initMaze()
	{
		// maze size
		width = Math.floor(canvas.width / settings.blockSize);
		height = Math.floor(canvas.height / settings.blockSize);

		// initialize maze array
		data = new Array(height);
		for(var y = 0; y < height; y++)
		{
			data[y] = new Array(width);
			for(var x = 0; x < width; x++)
			{
				data[y][x] = null;
			}
		}
	}

	function initGeneration()
	{
		// put starting position on the stack
		dfsStack = new Array();	
		var border = settings.border;
		dfsStack.push(new Cell(Math.floor(settings.startX * (width - 2*border - 1) + border),
			Math.floor(settings.startY * (height - 2*border - 1) + border), 0, Direction.NONE));

		directions = [ Direction.RIGHT, Direction.LEFT, Direction.UP, Direction.DOWN ];
	}

	function updateCell()
	{
		var cell;
		var makeCircle = false;

		// get next cell
		while(true)
		{
			if(dfsStack.length == 0)
			{
				return false;
			}

			cell = dfsStack.pop();
			if(data[cell.y][cell.x] != null)
			{
				if(Math.random() < settings.circleProbability && settings.cellDistance > 1)
				{
					makeCircle = true;
				}
				else
				{
					continue;
				}
			}

			// only one element per update
			break;
		}

		var color = cell.color;

		// draw the intermediate cells
		if(cell.fromDir !== Direction.NONE)
		{
			for(var i = 1; i < settings.cellDistance; i++)
			{
				// minus fromDir, since the directions points from old to new position (p is the new position)
				var intermediate = new Cell(cell.x - i * cell.fromDir.x, cell.y - i * cell.fromDir.y, color);
				data[intermediate.y][intermediate.x] = intermediate;
				changedCells.push(intermediate);
				color++;
			}
		}

		// draw the cell (if this step is not a circle connection)
		if(makeCircle)
			return true;

		data[cell.y][cell.x] = cell;
		changedCells.push(cell);
		color++;

		// shuffle directions
		if(Math.random() < settings.directionShuffleProbability)
			shuffle(directions);

		// expand maze in all directions
		// opposite order so that the first element will be the top-most on the stack
		for(var i = directions.length-1; i >= 0; i--)
		{
			var d = directions[i];

			// no need to check the direction that we are coming from
			if(d.isOpposite(cell.fromDir))
				continue;

			// disallow continuing in the same direction
			if(settings.disallowSameDirection && d === cell.fromDir)
				continue;

			var newX = cell.x + settings.cellDistance * d.x;
			var newY = cell.y + settings.cellDistance * d.y;

			// check if next position is outside of canvas
			if(newX < settings.border || newX >= width - settings.border)
				continue;
			if(newY < settings.border || newY >= height - settings.border)
				continue;

			dfsStack.push(new Cell(newX, newY, color, d))
		}

		return true;
	}

	function redrawChanged()
	{
		while(changedCells.length > 0)
		{
			drawCell(changedCells.pop());
		}
	}

	maze.redrawAll = function(backgroundColor, colorFactor, colorFunction)
	{
		settings.backgroundColor = backgroundColor;
		settings.colorFactor = colorFactor;
		settings.colorFunction = colorFunction;

		for(var y = 0; y < height; y++)
		{
			for(var x = 0; x < width; x++)
			{
				if(data[y][x] != null)
				{
					drawCell(data[y][x]);
				}
			}
		}
	}

	function drawCell(cell)
	{
		if(settings.colorFactor == 0)
		{
			bufferContext.fillStyle = "#ffffff";
		}
		else
		{
			bufferContext.fillStyle = settings.colorFunction(
				(cell.color % settings.colorFactor) / settings.colorFactor,
				cell.x / width, cell.y / height);
		}

		bufferContext.fillRect(cell.x * settings.blockSize, cell.y * settings.blockSize,
			settings.blockSize, settings.blockSize);
	}

	function drawBuffer()
	{
		context.fillStyle = settings.backgroundColor;
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.drawImage(bufferCanvas, 0, 0);
	}

	function updateAndDrawFrame()
	{
		if(running)
		{
			for(var i = 0; i < updatesPerFrame; i++)
			{
				if(!updateCell())
				{
					break;
				}
			}
			redrawChanged();
		}
		drawBuffer();
		animFrameReqId = requestAnimFrame(updateAndDrawFrame);
	};

	maze.start = function(startX, startY, blockSize, cellDistance, directionShuffleProbability,
		disallowSameDirection, circleProbability, backgroundColor, colorFactor, colorFunction, speed)
	{
		settings = new Settings(startX, startY, blockSize, cellDistance, directionShuffleProbability,
			disallowSameDirection, circleProbability, backgroundColor, colorFactor, colorFunction);
		updatesPerFrame = speed;
		running = true;

		initCanvas();
		initMaze();
		initGeneration();

		// start the draw-loop
		if(animFrameReqId != null)
		{
			cancelAnimFrame(animFrameReqId);
		}
		animFrameReqId = requestAnimFrame(updateAndDrawFrame);
	}

	maze.setSpeed = function(_updatesPerFrame)
	{
		if(_updatesPerFrame < 1)
			updatesPerFrame = 1;
		else if(_updatesPerFrame > 10000)
			updatesPerFrame = 10000;
		else
			updatesPerFrame = _updatesPerFrame;
	}

	maze.completeGeneration = function()
	{
		while(updateCell())
		{
			// updateCell will return false when no more cells are left
		}
	}

	maze.setRunning = function(_running)
	{
		running = _running;
	}

	maze.isRunning = function()
	{
		return running;
	}
}(window.maze = window.maze || {}, jQuery));