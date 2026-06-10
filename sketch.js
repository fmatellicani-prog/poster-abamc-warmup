// ============================================================
// POSTER INTERATTIVO ABAMC
// p5.js + ml5.js Handpose
// Trascina gli elementi con il pizzico delle dita.
// Batti le mani per far esplodere la tipografia.
//
// Il poster originale (poster.svg) e' lo sfondo HTML.
// Il canvas p5.js e' trasparente e disegna SOLO gli elementi interattivi.
// ============================================================

// ============================================================
// VARIABILI GLOBALI
// ============================================================
let posterElements = [];    // Array di PosterElement (tutti trascinabili)
let particles = [];         // Array di TypographyParticle attive
let handManager;            // Istanza di HandInteractionManager
let handposeModel;          // Modello ml5 Handpose
let videoElement;           // Elemento video DOM (webcam)
let previewCanvas;          // Canvas DOM per preview webcam
let previewCtx;             // Context 2D del preview canvas
let isModelLoaded = false;
let useMouseFallback = false;
let scaleFactor = 1;        // Fattore di scala canvas -> SVG
let offsetX = 0;            // Offset X per centrare il poster
let offsetY = 0;            // Offset Y per centrare il poster
let flashFrames = 0;        // Frames di flash bianco per clap

// Dimensioni spazio nativo SVG
const SVG_W = 595.28;
const SVG_H = 841.89;

// Colori
const COL_BG = '#e6007e';
const COL_ACCENT = '#0dff00';
const COL_STROKE = '#000000';

// ============================================================
// CLASSE BASE: PosterElement
// ============================================================
// Ogni elemento visivo interattivo eredita da questa classe.
class PosterElement {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w || 0;
    this.h = h || 0;
    this.isDragging = false;
    this.isHovered = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
  }

  draw() {
    // override in subclasses
  }

  update() {
    // override in subclasses
  }

  /**
   * Verifica se il punto (mx, my) nello spazio SVG nativo
   * ricade dentro il bounding box dell'elemento.
   */
  isPointInside(mx, my) {
    return (
      mx >= this.x &&
      mx <= this.x + this.w &&
      my >= this.y &&
      my <= this.y + this.h
    );
  }

  startDrag(mx, my) {
    this.isDragging = true;
    this.dragOffsetX = mx - this.x;
    this.dragOffsetY = my - this.y;
  }

  dragTo(mx, my) {
    if (this.isDragging) {
      this.x = mx - this.dragOffsetX;
      this.y = my - this.dragOffsetY;
    }
  }

  endDrag() {
    this.isDragging = false;
  }
}

// ============================================================
// CLASSE: DraggableShape
// ============================================================
// Forma geometrica semplice (cerchio, rettangolo arrotondato,
// poligono) usata come elemento grafico interattivo sopra il poster.
class DraggableShape extends PosterElement {
  constructor(x, y, w, h, options = {}) {
    super(x, y, w, h);
    this.type = options.type || 'rect';   // 'rect', 'circle', 'ellipse'
    this.fill = options.fill || '#000000';
    this.stroke = options.stroke || 'none';
    this.strokeWeight = options.strokeWeight || 0;
    this.cornerRadius = options.cornerRadius || 0;
  }

  draw() {
    push();
    if (this.isDragging) {
      translate(this.x + this.w / 2, this.y + this.h / 2);
      scale(1.05);
      translate(-(this.x + this.w / 2), -(this.y + this.h / 2));
      stroke(COL_ACCENT);
      strokeWeight(3);
    } else if (this.isHovered) {
      if (frameCount % 20 < 10) {
        stroke(COL_ACCENT);
        strokeWeight(2);
        drawingContext.setLineDash([5, 5]);
      }
    } else {
      if (this.stroke !== 'none') {
        stroke(this.stroke);
        strokeWeight(this.strokeWeight);
      } else {
        noStroke();
      }
    }

    fill(this.fill);

    if (this.type === 'rect') {
      if (this.cornerRadius > 0) {
        rect(this.x, this.y, this.w, this.h, this.cornerRadius);
      } else {
        rect(this.x, this.y, this.w, this.h);
      }
    } else if (this.type === 'circle') {
      ellipse(this.x + this.w / 2, this.y + this.h / 2, this.w, this.h);
    } else if (this.type === 'ellipse') {
      ellipse(this.x + this.w / 2, this.y + this.h / 2, this.w, this.h);
    }

    drawingContext.setLineDash([]);
    pop();
  }

  update() {
    // Nessuna fisica propria
  }
}

// ============================================================
// CLASSE: DraggableText
// ============================================================
// Blocco tipografico che puo' essere trascinato.
// Quando scatta il clap, il testo esplode in particelle.
class DraggableText extends PosterElement {
  constructor(x, y, text, size, options = {}) {
    // Stima larghezza in base a lunghezza testo e dimensione
    let approxW = text.length * size * 0.55;
    super(x, y, approxW, size);
    this.text = text;
    this.size = size;
    this.fill = options.fill || '#000000';
    this.font = options.font || 'VT323';
    this.align = options.align || LEFT;
    this.baseline = options.baseline || TOP;
  }

  draw() {
    push();
    textFont(this.font);
    textSize(this.size);
    textAlign(this.align, this.baseline);

    if (this.isDragging) {
      translate(this.x + this.w / 2, this.y + this.h / 2);
      scale(1.05);
      translate(-(this.x + this.w / 2), -(this.y + this.h / 2));
      fill(COL_ACCENT);
      stroke(COL_ACCENT);
      strokeWeight(2);
    } else if (this.isHovered) {
      fill(COL_ACCENT);
      noStroke();
    } else {
      fill(this.fill);
      noStroke();
    }

    text(this.text, this.x, this.y);
    pop();
  }

  update() {
    // Nessuna fisica propria
  }

  /**
   * Esplode il testo in un array di TypographyParticle,
   * una per ogni carattere.
   */
  explode() {
    let parts = [];
    for (let i = 0; i < this.text.length; i++) {
      let ch = this.text[i];
      // Posizione approssimativa del carattere all'interno del blocco
      let px = this.x + i * (this.size * 0.55);
      let py = this.y + this.size * 0.5;
      parts.push(new TypographyParticle(px, py, ch, this.size, this.fill));
    }
    return parts;
  }
}

// ============================================================
// CLASSE: TypographyParticle
// ============================================================
// Singola lettera in volo dopo l'esplosione.
class TypographyParticle {
  constructor(x, y, char, size, color) {
    this.x = x;
    this.y = y;
    this.char = char;
    this.size = size;
    this.color = color;
    // Velocita' iniziale casuale verso l'alto e lateralmente
    this.vx = random(-4, 4);
    this.vy = random(-8, -3);
    this.rotation = random(TWO_PI);
    this.rotationSpeed = random(-0.2, 0.2);
    this.scale = 1.0;
    this.opacity = 255;
    this.gravity = 0.25;
    this.friction = 0.98;
    this.lifeDecay = random(3, 6); // Velocita' di svanimento
  }

  update() {
    this.vx *= this.friction;
    this.vy *= this.friction;
    this.vy += this.gravity;
    this.x += this.vx;
    this.y += this.vy;
    this.rotation += this.rotationSpeed;
    this.opacity -= this.lifeDecay;
    if (this.opacity < 0) this.opacity = 0;
  }

  draw() {
    if (this.opacity <= 0) return;
    push();
    translate(this.x, this.y);
    rotate(this.rotation);
    scale(this.scale);
    textFont('VT323');
    textSize(this.size);
    textAlign(CENTER, CENTER);
    noStroke();
    let c = color(this.color);
    c.setAlpha(this.opacity);
    fill(c);
    text(this.char, 0, 0);
    pop();
  }

  isDead() {
    return this.opacity <= 0;
  }
}

// ============================================================
// CLASSE: HandInteractionManager
// ============================================================
// Coordina il tracking ml5 Handpose, rileva pizzico e clap,
// e disegna il feedback visivo delle mani.
class HandInteractionManager {
  constructor() {
    this.hands = [];              // Dati raw delle mani (fino a 2)
    this.pinchActive = false;     // Pizzico in corso?
    this.pinchX = 0;              // Coordinate pizzico (canvas)
    this.pinchY = 0;
    this.clapActive = false;      // Clap in questo frame?
    this.lastClapTime = 0;
    this.pinchThreshold = 30;     // px webcam per attivare pizzico
    this.pinchRelease = 40;       // px webcam per disattivare (hysteresis)
    this.clapDistanceThreshold = 100; // px webcam per rilevare clap
    this.clapCooldownMs = 1500;
    this.prevPalmsDistance = Infinity;
  }

  process(predictions) {
    this.hands = predictions || [];
    this.clapActive = false;

    // --- RILEVAMENTO PIZZICO ---
    this.pinchActive = false;
    this.pinchX = 0;
    this.pinchY = 0;

    for (let hand of this.hands) {
      let thumb = hand.landmarks[4];   // thumb_tip
      let index = hand.landmarks[8];   // index_finger_tip
      let d = dist(thumb[0], thumb[1], index[0], index[1]);

      if (d < this.pinchThreshold) {
        this.pinchActive = true;
        let midX = (thumb[0] + index[0]) / 2;
        let midY = (thumb[1] + index[1]) / 2;
        let mapped = this.mapToCanvas(midX, midY);
        this.pinchX = mapped.x;
        this.pinchY = mapped.y;
        break; // Solo una mano per drag
      }
    }

    // --- RILEVAMENTO CLAP ---
    if (this.hands.length >= 2) {
      let palm1 = this.hands[0].landmarks[0]; // wrist
      let palm2 = this.hands[1].landmarks[0];
      let palmsDistance = dist(palm1[0], palm1[1], palm2[0], palm2[1]);

      let now = millis();
      if (now - this.lastClapTime > this.clapCooldownMs) {
        if (this.prevPalmsDistance > 150 && palmsDistance < this.clapDistanceThreshold) {
          this.clapActive = true;
          this.lastClapTime = now;
        }
      }
      this.prevPalmsDistance = palmsDistance;
    } else {
      this.prevPalmsDistance = Infinity;
    }
  }

  mapToCanvas(webcamX, webcamY) {
    // La webcam e' specchiata: flip orizzontale
    let sx = width / 640;
    let sy = height / 480;
    let cx = (640 - webcamX) * sx;
    let cy = webcamY * sy;
    return { x: cx, y: cy };
  }

  draw() {
    // Cerchi semi-trasparenti sui palmi
    for (let hand of this.hands) {
      let palm = hand.landmarks[0];
      let mapped = this.mapToCanvas(palm[0], palm[1]);
      noStroke();
      fill(255, 255, 255, 76); // 30% opacita'
      ellipse(mapped.x, mapped.y, 60, 60);
    }

    // Cerchio verde sul punto di pizzico
    if (this.pinchActive) {
      noFill();
      stroke(COL_ACCENT);
      strokeWeight(3);
      ellipse(this.pinchX, this.pinchY, 30, 30);
    }
  }
}

// ============================================================
// SETUP
// ============================================================
function setup() {
  console.log('--- p5 SETUP avviato ---');
  let cnv = createCanvas(windowWidth, windowHeight);
  cnv.parent('poster-container');
  console.log('Canvas creato:', width, 'x', height);

  // Inizializza preview canvas
  previewCanvas = document.getElementById('webcam-preview');
  previewCanvas.width = 160;
  previewCanvas.height = 120;
  previewCtx = previewCanvas.getContext('2d');

  calculateScale();

  // Manager mani
  handManager = new HandInteractionManager();

  // Crea elementi del poster
  createPosterElements();

  // Avvia webcam
  videoElement = document.getElementById('webcam');
  let constraints = { video: { width: 640, height: 480 } };
  navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
      videoElement.srcObject = stream;
      videoElement.onloadedmetadata = () => {
        videoElement.play();
        initHandpose();
      };
    })
    .catch(err => {
      console.warn('Webcam non disponibile:', err);
      showStatus('Webcam non disponibile — usa mouse o tastiera');
      useMouseFallback = true;
      setTimeout(hideStatus, 5000);
    });

  textFont('VT323');
}

// ============================================================
// INIT HANDPOSE (ml5)
// ============================================================
function initHandpose() {
  showStatus('Caricamento modello AI...');
  handposeModel = ml5.handpose(videoElement, () => {
    isModelLoaded = true;
    hideStatus();
    handposeModel.on('predict', results => {
      if (!useMouseFallback) {
        handManager.process(results);
      }
    });
  });

  // Timeout fallback: se il modello non si carica in 30s
  setTimeout(() => {
    if (!isModelLoaded) {
      showStatus('Modello AI non caricato — usa mouse o tastiera');
      useMouseFallback = true;
      setTimeout(hideStatus, 5000);
    }
  }, 30000);
}

// ============================================================
// DRAW (loop principale)
// ============================================================
function draw() {
  // NON disegnare background: il canvas e' trasparente,
  // lo sfondo poster.svg e' gia' visibile come <img> HTML.
  calculateScale();

  // --- GESTIONE DRAG (HAND TRACKING) ---
  if (!useMouseFallback) {
    if (handManager.pinchActive) {
      let svgCoords = canvasToSvg(handManager.pinchX, handManager.pinchY);
      handleDragAt(svgCoords.x, svgCoords.y);
    } else {
      endAllDrags();
    }
  }

  // --- GESTIONE DRAG (MOUSE FALLBACK) ---
  if (useMouseFallback) {
    handleMouseDragFallback();
  }

  // --- RILEVAMENTO CLAP ---
  if (handManager.clapActive || mouseClapTriggered) {
    flashFrames = 5;
    triggerTypographyExplosion();
    mouseClapTriggered = false;
  }

  // --- AGGIORNA E DISEGNA PARTICELLE ---
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    particles[i].draw();
    if (particles[i].isDead()) {
      particles.splice(i, 1);
    }
  }

  // --- DISEGNA ELEMENTI DEL POSTER ---
  push();
  translate(offsetX, offsetY);
  scale(scaleFactor);
  for (let el of posterElements) {
    el.update();
    el.draw();
  }
  pop();

  // --- FEEDBACK MANI (coordinate canvas) ---
  if (!useMouseFallback) {
    handManager.draw();
  }

  // --- FLASH BIANCO PER CLAP ---
  if (flashFrames > 0) {
    push();
    noStroke();
    fill(255, 255, 255, 180);
    rect(0, 0, width, height);
    pop();
    flashFrames--;
  }

  // --- PREVIEW WEBCAM ---
  drawWebcamPreview();
}

// ============================================================
// CREAZIONE ELEMENTI DEL POSTER
// ============================================================
// Tutti gli elementi sono posizionati nello spazio SVG nativo
// (595.28 x 841.89) e scalati automaticamente dal canvas.
function createPosterElements() {
  // --- LETTERA A (top) ---
  posterElements.push(new DraggableText(
    340, 80, 'A', 160,
    { fill: '#000000', font: 'VT323', align: LEFT, baseline: TOP }
  ));

  // --- LETTERA A (bottom) ---
  posterElements.push(new DraggableText(
    480, 650, 'A', 160,
    { fill: '#000000', font: 'VT323', align: LEFT, baseline: TOP }
  ));

  // --- LETTERA B ---
  posterElements.push(new DraggableText(
    430, 340, 'B', 180,
    { fill: '#000000', font: 'VT323', align: LEFT, baseline: TOP }
  ));

  // --- LETTERA M ---
  posterElements.push(new DraggableText(
    70, 540, 'M', 160,
    { fill: '#000000', font: 'VT323', align: LEFT, baseline: TOP }
  ));

  // --- LETTERA C ---
  posterElements.push(new DraggableText(
    30, 270, 'C', 160,
    { fill: '#000000', font: 'VT323', align: LEFT, baseline: TOP }
  ));

  // --- WARMUP (rettangolo verde acido dietro) ---
  posterElements.push(new DraggableShape(
    333, 317, 186, 55,
    { type: 'rect', fill: '#0dff00', cornerRadius: 12.64 }
  ));

  // --- WARMUP (testo nero sopra) ---
  posterElements.push(new DraggableText(
    341, 320, 'WARMUP', 72,
    { fill: '#000000', font: 'VT323', align: LEFT, baseline: TOP }
  ));

  // --- FORME GEOMETRICHE EXTRA ---
  // Cerchio fucsia in alto a sinistra
  posterElements.push(new DraggableShape(50, 50, 80, 80, {
    type: 'circle',
    fill: '#e6007e'
  }));

  // Rettangolo arrotondato nero in basso a destra
  posterElements.push(new DraggableShape(450, 750, 120, 60, {
    type: 'rect',
    fill: '#000000',
    cornerRadius: 12
  }));

  // Ellisse verde acido a meta' schermo
  posterElements.push(new DraggableShape(200, 400, 100, 60, {
    type: 'ellipse',
    fill: '#0dff00'
  }));

  // Rettangolo piccolo bianco (texture)
  posterElements.push(new DraggableShape(500, 500, 40, 40, {
    type: 'rect',
    fill: '#ffffff'
  }));
}

// ============================================================
// FUNZIONI DI SUPPORTO: COORDINATE, SCALA, DRAG
// ============================================================

function calculateScale() {
  scaleFactor = min(width / SVG_W, height / SVG_H);
  offsetX = (width - SVG_W * scaleFactor) / 2;
  offsetY = (height - SVG_H * scaleFactor) / 2;
}

function canvasToSvg(cx, cy) {
  let sx = (cx - offsetX) / scaleFactor;
  let sy = (cy - offsetY) / scaleFactor;
  return { x: sx, y: sy };
}

function svgToCanvas(sx, sy) {
  let cx = sx * scaleFactor + offsetX;
  let cy = sy * scaleFactor + offsetY;
  return { x: cx, y: cy };
}

// --- HAND TRACKING DRAG ---
let handDragElement = null;

function handleDragAt(sx, sy) {
  if (!handDragElement) {
    // Cerca elemento sotto il punto di pizzico
    for (let el of posterElements) {
      if (el.isPointInside(sx, sy)) {
        el.startDrag(sx, sy);
        handDragElement = el;
        break;
      }
    }
  } else {
    handDragElement.dragTo(sx, sy);
  }
}

function endAllDrags() {
  if (handDragElement) {
    handDragElement.endDrag();
    handDragElement = null;
  }
}

// --- MOUSE FALLBACK ---
let mouseDragElement = null;
let mouseClapTriggered = false;

function mousePressed() {
  if (!useMouseFallback) return;
  let svgCoords = canvasToSvg(mouseX, mouseY);
  for (let el of posterElements) {
    if (el.isPointInside(svgCoords.x, svgCoords.y)) {
      el.startDrag(svgCoords.x, svgCoords.y);
      mouseDragElement = el;
      break;
    }
  }
}

function mouseDragged() {
  if (!useMouseFallback || !mouseDragElement) return;
  let svgCoords = canvasToSvg(mouseX, mouseY);
  mouseDragElement.dragTo(svgCoords.x, svgCoords.y);
}

function mouseReleased() {
  if (!useMouseFallback || !mouseDragElement) return;
  mouseDragElement.endDrag();
  mouseDragElement = null;
}

function doubleClicked() {
  if (useMouseFallback) {
    mouseClapTriggered = true;
  }
  return false;
}

function keyPressed() {
  if (useMouseFallback && key === ' ') {
    mouseClapTriggered = true;
  }
}

function handleMouseDragFallback() {
  let svgCoords = canvasToSvg(mouseX, mouseY);
  for (let el of posterElements) {
    el.isHovered = el.isPointInside(svgCoords.x, svgCoords.y);
  }
}

// --- ESPLOSIONE TIPOGRAFICA ---
function triggerTypographyExplosion() {
  for (let i = posterElements.length - 1; i >= 0; i--) {
    let el = posterElements[i];
    if (el instanceof DraggableText && el.text.length > 1) {
      let newParticles = el.explode();
      particles = particles.concat(newParticles);
      posterElements.splice(i, 1);
    }
  }
}

// --- PREVIEW WEBCAM ---
function drawWebcamPreview() {
  if (videoElement && videoElement.readyState >= 2) {
    previewCtx.save();
    previewCtx.translate(previewCanvas.width, 0);
    previewCtx.scale(-1, 1);
    previewCtx.drawImage(
      videoElement,
      0, 0,
      previewCanvas.width,
      previewCanvas.height
    );
    previewCtx.restore();
  }
}

// --- MESSAGGI DI STATO ---
function showStatus(msg) {
  let statusDiv = document.getElementById('status-message');
  statusDiv.textContent = msg;
  statusDiv.classList.add('visible');
}

function hideStatus() {
  let statusDiv = document.getElementById('status-message');
  statusDiv.classList.remove('visible');
}

// --- RESIZE ---
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  calculateScale();
}
