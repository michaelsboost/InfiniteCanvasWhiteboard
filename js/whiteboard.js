
var canvas = document.getElementById("whiteboard");
document.oncontextmenu = function () {
    return false;
}
var context = canvas.getContext("2d");

const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('code') || '';

var canvasHistory = [];
var strokeHistory = [];
var socketElements = [];
var actionHistory = [];
const darkBackgroundColour = '#15171a';
const lightBackgroundColour = '#fff'
var backgroundColour = darkBackgroundColour;

// Fill Window Width and Height
redraw();
window.addEventListener("resize", (event) => {
    redraw();
});

var drawing = false;
var shiftDown = false;
var ctrlDown = false;
var panning = false;
var rightMouseDown = false;
let penColour = '#f8f9fa';

var scale = 1;


// The scaled width of the screen (ie not the pixels)
function xUnitsScaled() {
    return canvas.clientWidth / scale;
}
// The scaled height of the screen (ie not the pixels)
function yUnitsScaled() {
    return canvas.clientHeight / scale;
}

document.addEventListener('keydown', event => {
    if (event.key == "Shift") {
        if (!shiftDown) canvas.style.cursor = 'grab';
        shiftDown = true;
    }
    if (event.key == "Control") ctrlDown = true;
    if (event.key == "z") {
        if (ctrlDown) undoLast();
    }
})
document.addEventListener('keyup', event => {
    if (event.key == "Shift") {
        canvas.style.cursor = 'crosshair';
        shiftDown = false;
    }
    if (event.key == "Control") ctrlDown = false;
})

document.addEventListener('wheel', (event) => {
    const deltaY = event.deltaY;
    const scaleAmount = -deltaY / 500;
    scale = scale * (1 + scaleAmount);

    var distX = event.pageX / canvas.clientWidth;
    var distY = event.pageY / canvas.clientHeight;

    const unitsZoomedX = xUnitsScaled() * scaleAmount;
    const unitsZoomedY = yUnitsScaled() * scaleAmount;

    const unitsAddLeft = unitsZoomedX * distX;
    const unitsAddTop = unitsZoomedY * distY;

    offsetX -= unitsAddLeft;
    offsetY -= unitsAddTop;

    redraw();
})


// Mouse Event Handlers
canvas.addEventListener('mousedown', onMouseDown, false);
canvas.addEventListener('mouseup', onMouseUp, false);
canvas.addEventListener('mouseout', onMouseUp, false);
canvas.addEventListener('mousemove', throttle(onMouseMove, 25), false);

// Touch Event Handlers 
canvas.addEventListener('touchstart', onTouchStart, { passive: false });
canvas.addEventListener('touchend', onTouchEnd, { passive: false });
canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });
canvas.addEventListener('touchmove', throttle(onTouchMove, 25), { passive: false });


function onTouchStart(evt) {
    if (evt.touches.length == 1) {
        panning = false;
        drawing = true;

        lastTouches[0] = evt.touches[0];

    } else if (evt.touches.length >= 2) {
        panning = true;
        drawing = false;
        removeAllDots();

        lastTouches[0] = evt.touches[0];
        lastTouches[1] = evt.touches[1];
    }
}
function onTouchEnd(e) {
    if (drawing) {
        strokeHistory.push({ vectors: currentStroke, colour: penColour })
        actionHistory.push(currentStroke)
        currentStroke = [];
        redraw();
    }
    panning = false;
    drawing = false;

}
function onTouchMove(evt) {

    const touch1X = evt.touches[0].pageX;
    const touch1Y = evt.touches[0].pageY;
    const touch1Xprev = lastTouches[0].pageX;
    const touch1Yprev = lastTouches[0].pageY;

    if (panning) {
        // if panning there is more than 1 touch.
        // get the mid point of the first 2 touches

        const touch2X = evt.touches[1].pageX;
        const touch2Y = evt.touches[1].pageY;
        const midX = (touch1X + touch2X) / 2;
        const midY = (touch1Y + touch2Y) / 2;
        const hypot = Math.sqrt(Math.pow((touch1X - touch2X), 2) + Math.pow((touch1Y - touch2Y), 2));

        const touch2Xprev = lastTouches[1].pageX;
        const touch2Yprev = lastTouches[1].pageY;
        const midXprev = (touch1Xprev + touch2Xprev) / 2;
        const midYprev = (touch1Yprev + touch2Yprev) / 2;
        const hypotPrev = Math.sqrt(Math.pow((touch1Xprev - touch2Xprev), 2) + Math.pow((touch1Yprev - touch2Yprev), 2));

        var zoomAmount = hypot / hypotPrev;
        scale = scale * zoomAmount;
        const scaleAmount = 1 - zoomAmount;

        // calc how many pixels the touches have moved in the x and y direction
        const panX = midX - midXprev;
        const panY = midY - midYprev;
        // scale this movement based on the zoom level
        offsetX += (panX / scale);
        offsetY += (panY / scale);

        // Get the relative position of the middle of the zoom.
        // 0, 0 would be top left. 
        // 0, 1 would be top right etc.
        var zoomRatioX = midX / canvas.clientWidth;
        var zoomRatioY = midY / canvas.clientHeight;

        const unitsZoomedX = xUnitsScaled() * scaleAmount;
        const unitsZoomedY = yUnitsScaled() * scaleAmount;

        const unitsAddLeft = unitsZoomedX * zoomRatioX;
        const unitsAddTop = unitsZoomedY * zoomRatioY;

        offsetX += unitsAddLeft;
        offsetY += unitsAddTop;


        redraw()
    } else if (drawing) {
        if (currentStroke.length == 0) {
            // need to add the first touch
            addToStroke(toTrueX(touch1Xprev), toTrueY(touch1Yprev), penColour);
        }
        drawLine(touch1Xprev, touch1Yprev, touch1X, touch1Y, penColour);
        addToStroke(toTrueX(touch1X), toTrueY(touch1Y), penColour);
    }

    lastTouches[0] = evt.touches[0];
    lastTouches[1] = evt.touches[1];
}

function onMouseDown(evt) {

    if (evt.button == 2) {
        rightMouseDown = true;
    } else {
        rightMouseDown = false;
    }

    cursorX = evt.pageX;
    cursorY = evt.pageY;
    cursorXprev = evt.pageX;
    cursorYprev = evt.pageY;

    if (shiftDown || rightMouseDown) {
        canvas.style.cursor = 'grabbing';
        drawing = false;
        panning = true;
        removeAllDots();
    } else {
        panning = false;
        drawing = true;
        addToStroke((cursorX / scale) - offsetX, (cursorY / scale) - offsetY, penColour);
    }
}

function removeAllDots() {
    const dots = document.getElementsByClassName('dot');
    for (let i = 0; i < dots.length; i++) {
        const dot = dots[i];
        dot.remove();
    }
}

function toggleDark() {
    // if dark
    if (backgroundColour == darkBackgroundColour) {
        backgroundColour = lightBackgroundColour
    } else {
        backgroundColour = darkBackgroundColour;
    }
    setDocumentTitle(backgroundColour);
    redraw();
}

var cursorX = null;
var cursorY = null;
var cursorXprev = null;
var cursorYprev = null;
const lastTouches = [null, null];
var offsetX = 0;
var offsetY = 0;
var currentStroke = [];
function onMouseMove(evt) {
    cursorX = evt.pageX;
    cursorY = evt.pageY;

    if (panning) {
        offsetX += (cursorX - cursorXprev) / scale;
        offsetY += (cursorY - cursorYprev) / scale;
        redraw()
    } else if (drawing) {
        addToStroke(toTrueX(cursorX), toTrueY(cursorY), penColour);
        drawLine(cursorXprev, cursorYprev, cursorX, cursorY, penColour);
    }
    const trueX = (cursorX / scale) - offsetX;
    const trueY = (cursorY / scale) - offsetY;

    cursorXprev = cursorX;
    cursorYprev = cursorY;
}

function onMouseUp(e) {
    if (drawing) {
        strokeHistory.push({ vectors: currentStroke, colour: penColour })
        actionHistory.push(currentStroke)
        currentStroke = [];
        redraw();
    }
    canvas.style.cursor = 'crosshair';
    rightMouseDown = false;
    panning = false;
    drawing = false;
}
function undoLast() {
    if (actionHistory.length == 0) return;
    const toUndo = actionHistory.pop();
    removeFromHistory(toUndo);
}
function removeFromHistory(stroke) {
    for (let i = strokeHistory.length - 1; i >= 0; i--) {
        const historyElement = strokeHistory[i];
        if (strokesEqual(historyElement.vectors, stroke)) {
            strokeHistory.splice(i, 1);
            redraw();
            return;
        }
    }
}

function strokesEqual(strokeAVectors, strokeBVectors) {
    if (strokeAVectors.length != strokeBVectors.length) return false;
    for (let i = 0; i < strokeAVectors.length; i++) {
        const strokeAVector = strokeAVectors[i];
        const strokeBVector = strokeBVectors[i];
        if (!vectorsEqual(strokeAVector, strokeBVector)) return false;
    }
    return true;
}

function vectorsEqual(vectorA, vectorB) {
    if (vectorA.length != vectorB.length) return;
    for (let i = 0; i < vectorA.length; i++) {
        const elementA = vectorA[i];
        const elementB = vectorB[i];
        if (elementA != elementB) return false
    }
    return true;
}

function setColour(newColour) {
    penColour = newColour;
}

function drawLine(x0, y0, x1, y1, colour) {
    context.beginPath();
    context.moveTo(x0, y0);
    context.lineTo(x1, y1);
    context.strokeStyle = colour;
    context.lineWidth = 2;
    context.stroke();
}

function addToStroke(x0, y0, colour) {
    currentStroke.push([x0, y0]);
}
function drawStroke({ vectors, colour }) {
    context.beginPath();
    context.lineJoin = "round";
    context.lineCap = "round";
    if (!vectors[0]) return;
    context.moveTo(toScreenX(vectors[0][0]), toScreenY(vectors[0][1]));
    for (let i = 0; i < vectors.length; i++) {
        let x0 = toScreenX(vectors[i][0])
        let y0 = toScreenY(vectors[i][1])
        context.lineTo(x0, y0);
    }
    context.strokeStyle = colour;
    context.lineWidth = 2;
    context.stroke();

}

function toScreenX(xTrue) {
    return (xTrue + offsetX) * scale
}
function toScreenY(yTrue) {
    return (yTrue + offsetY) * scale
}
function toTrueX(xScreen) {
    return (xScreen / scale) - offsetX
}
function toTrueY(yScreen) {
    return (yScreen / scale) - offsetY
}

function onUndoStrokeEvent(data) {
    removeFromHistory(data.data);
}
function onStrokeEvent(data) {
    strokeHistory.push(data.data);
    drawStroke(data.data);
}
function onStrokesEvent(data) {
    strokeHistory = [...data.data, ...strokeHistory];
    redraw();
}

// another user drawing
function onDrawingEvent(data) {
    canvasHistory.push({ x0: data.x0, y0: data.y0, x1: data.x1, y1: data.y1, colour: data.colour });
    drawLine((data.x0 + offsetX) * scale, (data.y0 + offsetY) * scale, (data.x1 + offsetX) * scale, (data.y1 + offsetY) * scale, data.colour);
}
var connectedUsers = 0;
function onUsersChanged(data) {
    connectedUsers = data;
    document.getElementById('userCount').innerHTML = `${connectedUsers}👤`
}
function onDisconnect(data) {
    const dot = document.getElementById(data);
    if (!dot) return;
    dot.remove();
}
function onOtherCursorMove(data) {
    let dot = document.getElementById(data.socket);
    if (!dot) {
        dot = createDot(data.socket);
    }
    // dot.style.left = `${data.x-7}px`
    // dot.style.top = `${data.y-7}px`
    dot.style.left = `${(data.x - 5 + offsetX) * scale}px`;
    dot.style.top = `${(data.y - 5 + offsetY) * scale}px`;
    dot.style.backgroundColor = data.colour;
}
function onBackgroundColourChange(colour) {
    setDocumentTitle(colour);
    backgroundColour = colour;
    redraw();
}
function setDocumentTitle(colour) {
    if (colour == lightBackgroundColour) {
        document.title = 'Infinite Whiteboard';
    } else {
        document.title = 'Infinite Whiteboard';
    }
}
function createDot(socketId) {
    const dot = document.createElement('div')
    dot.className = "dot";
    dot.id = socketId;
    dot.style.position = 'fixed';
    document.body.appendChild(dot);
    return dot;
}
function onHistoryEvent(drawHistory) {
    strokeHistory = drawHistory.history;
    backgroundColour = drawHistory.backgroundColour;
    redraw();
}
function redraw() {
    canvas.width = document.body.clientWidth; //document.width is obsolete
    canvas.height = document.body.clientHeight; //document.height is obsolete
    // Set Background Colour
    context.fillStyle = backgroundColour;
    context.fillRect(0, 0, canvas.width, canvas.height);
    strokeHistory.forEach(data => {
        drawStroke({ vectors: data.vectors, colour: data.colour })
    });
}

// limit the number of events per second
function throttle(callback, delay) {
    var previousCall = new Date().getTime();
    return function () {
        var time = new Date().getTime();

        if ((time - previousCall) >= delay) {
            previousCall = time;
            callback.apply(null, arguments);
        }
    };
}

// https://stackoverflow.com/a/30832210/10159640
function download() {
    let data = JSON.stringify(strokeHistory);
    let filename = 'infiniboard.json';
    let type = 'json'
    var file = new Blob([data], { type: type });
    if (window.navigator.msSaveOrOpenBlob) // IE10+
        window.navigator.msSaveOrOpenBlob(file, filename);
    else { // Others
        var a = document.createElement("a"),
            url = URL.createObjectURL(file);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        fileSavedModalAlert();
        setTimeout(function () {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
    }
}

function save() {
  var canvas = document.getElementById("whiteboard");
  // download canvas image
  myBase64 = canvas.toDataURL("image/png");

  // remove image if already visible
  var img = new Image();
  img.crossOrigin = "Anonymous";
  img.id = "getshot";
  img.src = myBase64;
  document.body.appendChild(img);

  var a = document.createElement("a");
  a.href = getshot.src;
  a.download = "image.png";
  a.click();
  document.body.removeChild(img);
}

function fileSavedModalAlert() {
    $('#file-saved-modal').modal({show: true});
}

// load svg file once clicked
openfile.onchange = function() {
  loadfile(this);
};

function loadfile(input) {
  const reader = new FileReader();
  reader.onload = function(e) {
    let loadedData = JSON.parse(e.target.result);
    onStrokesEvent({data:loadedData});
  };
  reader.readAsText(input.files[0]);
}

$('#help-modal').modal({show: true});
