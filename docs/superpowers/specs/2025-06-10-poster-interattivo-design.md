# Spec: Poster Interattivo ABAMC con Hand Tracking

**Data**: 2025-06-10  
**Progetto**: Poster interattivo fullscreen con p5.js, ml5.js Handpose, drag tramite gesture e distruzione tipografica tramite clap  
**Stato**: Approvato per implementazione  

---

## 1. Obiettivo

Realizzare un poster grafico sperimentale in HTML/CSS/JavaScript, eseguibile immediatamente nel browser, in cui gli elementi visivi del poster possono essere spostati con le mani tramite webcam, e la tipografia può "distruggersi" con un gesto di battito delle mani.

---

## 2. Architettura Generale

Il poster è un'applicazione client-side a **tre strati** sovrapposti nello stesso contesto DOM:

1. **Layer Webcam** (sotto): elemento `<video>` nascosto cattura il feed dalla webcam. ml5.js `Handpose` elabora ogni frame per estrarre le coordinate delle mani.
2. **Layer Canvas p5.js** (centro): canvas fullscreen che disegna tutti gli elementi del poster (sfondo, lettere, stella, forme, testo). Qui avvengono tutte le animazioni, il drag&drop e gli effetti di distruzione.
3. **Layer UI Overlay** (sopra): un piccolo elemento video/canvas in angolo (basso-destra, 160×120px, bordo arrotondato, semi-opaco) mostra la preview della webcam.

**Coordinate e mapping**: l'SVG originale ha `viewBox="0 0 595.28 841.89"` (A4). Il canvas si adatta allo schermo tramite scaling uniforme e centratura. Tutte le posizioni degli elementi sono definite nello spazio "SVG nativo" e scalate al momento del disegno.

**Ciclo principale** (ogni frame p5):
1. Aggiornamento dati handpose (coordinate mani)
2. Rilevamento gesti (pizzico, clap)
3. Aggiornamento fisica/animazione elementi (posizioni, velocità, particelle)
4. Disegno di tutti gli elementi
5. Disegno feedback mani (punti delle dita, linee)

---

## 3. Componenti e Classi

### 3.1 PosterElement (classe base astratta)

La radice della gerarchia. Definisce le proprietà comuni:
- `x`, `y` — posizione nello spazio SVG nativo
- `draw(ctx)` — metodo astratto
- `isPointInside(mx, my)` — per il picking (click/pizzico)
- `update()` — per animazioni generiche

### 3.2 DraggableShape (estende PosterElement)

Per forme geometriche, lettere SVG-path, e forme astratte:
- Può essere rettangolo arrotondato, cerchio, o path custom (beginShape/vertex/endShape)
- `draw()` disegna la forma con colore/fill definito
- Feedback quando trascinato: bordo verde acido `#0dff00`, stroke più spesso
- Mantiene la sua forma originale durante il drag

### 3.3 DraggableText (estende PosterElement)

Per blocchi tipografici e lettere singole:
- Memorizza testo, font, dimensione, colore
- `draw()` usa `text()` di p5
- Quando selezionato con pizzico: testo si "illumina" (glow o colore invertito)
- Quando rilevato il clap: ogni `DraggableText` con più di 1 carattere si "esplode" — viene rimosso dalla lista degli elementi e genera un array di `TypographyParticle`

### 3.4 TypographyParticle

Rappresenta una singola lettera in volo dopo l'esplosione:
- Proprietà: `x`, `y`, `vx`, `vy`, `rotation`, `rotationSpeed`, `scale`, `opacity`
- `update()` applica gravità, attrito, e aggiorna rotazione/trasparenza
- `draw()` disegna la lettera singola con p5 `text()`
- Quando `opacity` raggiunge 0, la particella viene rimossa automaticamente

### 3.5 HandInteractionManager

Il cervello del tracking. Coordina:
- Riceve dati raw da ml5 `Handpose` (array di mani con 21 keypoints ciascuna)
- Calcola distanza pollice-indice per rilevare **pizzico** (threshold < 30px nello spazio camera)
- Calcola distanza tra palmi delle due mani per rilevare **clap** (threshold: distanza palmi < 100px, cooldown 1.5 secondi)
- Emette stato: `pinchingHandIndex`, `pinchPosition`, `clapDetected`
- Mappa coordinate webcam (640×480) alle coordinate del canvas tramite fattore di scala

**Comunicazione tra classi**: `HandInteractionManager` non conosce gli elementi del poster. Ogni frame, il `draw()` di p5 chiede al manager se c'è un pizzico e a che coordinate. Se sì, cerca un `PosterElement` sotto quel punto tramite `isPointInside()`. Se trovato, lo marca come "dragged" e ne aggiorna `x`/`y`. Quando il pizzico finisce, l'elemento viene "sganciato".

Il **clap** è gestito come evento globale: quando rilevato, il `draw()` scorre tutti i `DraggableText` e li converte in `TypographyParticle`.

---

## 4. Data Flow e Rilevamento Gesti

### Pipeline del Frame

```
Webcam (640×480) 
    ↓
ml5 Handpose (ogni frame, async callback)
    ↓
HandInteractionManager.process(predictions)
    ↓
Calcoli:
  - Per ogni mano: distanza pollice-indice → pizzico?
  - Tra le due mani: distanza palmi → clap?
    ↓
Stato esposto:
  - pinchActive (boolean)
  - pinchX, pinchY (coordinate canvas)
  - clapActive (boolean, con cooldown)
    ↓
p5 draw() loop:
  - Se pinchActive → cerca elemento sotto pinchX,pinchY
  - Se clapActive → esplodi tutti i DraggableText
```

### Coordinate Mapping

La webcam ha risoluzione fissa (640×480), il canvas è fullscreen. La mappatura:
```javascript
canvasX = pinchX_webcam * scaleX + offsetX
canvasY = pinchY_webcam * scaleY + offsetY
```

Dove `scaleX`/`scaleY` sono i fattori di scala tra dimensione reale del canvas e viewBox SVG (595.28×841.89), e `offsetX`/`offsetY` centrano il contenuto.

### Rilevamento Pizzico

- **Trigger**: distanza euclidea tra `thumb_tip` (keypoint 4) e `index_finger_tip` (keypoint 8) < **30 pixel** nello spazio webcam.
- **Posizione**: punto medio tra pollice e indice.
- **Hysteresis**: pizzico si attiva sotto i 30px ma si disattiva solo quando la distanza supera i **40px**.
- **Drag**: se al momento del pizzico c'è un elemento sotto il punto medio, quell'elemento viene "agganciato". Finché il pizzico resta attivo, l'elemento segue il punto medio. Quando finisce, l'elemento si sgancia.

### Rilevamento Clap (Battito)

- **Trigger**: quando sono rilevate **entrambe le mani**, si calcola la distanza tra i palmi usando il keypoint del palmo (wrist, keypoint 0 o media di wrist + palm center). Se la distanza passa da > 150px a < 80px in un intervallo breve (< 300ms), è un clap.
- **Cooldown**: dopo un clap rilevato, timer di **1.5 secondi** durante il quale nessun altro clap può essere rilevato.
- **Azione**: il clap attiva immediatamente la "distruzione" della tipografia.

### Feedback Visivo

- **Mano rilevata**: cerchio semi-trasparente (fill bianco, 30% opacità) intorno al palmo di ogni mano tracciata.
- **Pizzico attivo**: punto medio pollice-indice diventa cerchio verde acido `#0dff00` con raggio 15px.
- **Elemento selezionabile**: quando il cursore della mano passa sopra un elemento draggable, l'elemento mostra bordo tratteggiato verde acido lampeggiante (alternanza ogni 10 frame).
- **Elemento trascinato**: bordo diventa stroke continuo verde acido spesso (3px), e l'elemento viene leggermente ingrandito (scale 1.05) per dare sensazione di "sollevamento".
- **Clap rilevato**: flash bianco sullo schermo per 5 frame, poi l'esplosione avviene.

---

## 5. Stile Visivo e Layout

### Colori
- **Sfondo**: fucsia/magenta `#e6007e`
- **Accento**: verde acido `#0dff00`
- **Stroke principale**: nero `#000000`
- **Feedback interattivo**: verde acido `#0dff00`

### Tipografia
- **"WARMUP"**: font `VT323` (monospace pixel-art), dimensione scalata da 53.57px SVG. Disponibile via Google Fonts CDN.
- **Lettere A/B/A/M/C**: riprodotte come path SVG con `beginShape()`/`vertex()`/`endShape()` in p5, non come testo. Questo mantiene fedelmente la forma geometrica complessa (segmenti a zigzag) dell'originale. Sono `DraggableShape` con fill nero `#000` o fucsia `#e6007e` e nessuno stroke.

### Layout degli elementi (spazio SVG nativo 595.28×841.89)

| Elemento | Tipo | Posizione approssimativa (x,y) | Colore |
|----------|------|-------------------------------|--------|
| Sfondo | Rect | Fullscreen | `#e6007e` |
| Lettera A (top) | Path | (432, 116) | `#000` |
| Lettera A (bottom) | Path | (567, 690) | `#000` |
| Lettera B | Path | (538, 364) | `#000` |
| Lettera M | Path | (253, 564) | `#000` |
| Lettera C | Path | (190, 409) | `#000` |
| Stella | Polilinee | Centro canvas | `#000` (stroke) |
| "WARMUP" | Text + Rect | (333, 317) | Text `#000`, Rect `#0dff00` |

Tutti gli elementi tranne lo sfondo sono **draggable**.

### Responsive

Il canvas si adatta alla finestra (`windowResized()` in p5). Il fattore di scala:
```javascript
scaleFactor = min(windowWidth / 595.28, windowHeight / 841.89)
```
Il contenuto viene disegnato con `translate()` per centrare e `scale()` per adattare. Gli elementi mantengono le loro coordinate nello spazio nativo.

### Webcam Preview

- Posizione: angolo in basso a destra
- Dimensione: 160×120 pixel
- Stile: bordo arrotondato 12px, opacità 70%, nessun bordo visibile, ombra leggera
- Non interattiva, solo informativa

---

## 6. Error Handling e Stati Edge Case

### Webcam non disponibile o permesso negato
- Il poster si avvia in **modalità "solo mouse"**.
- In questa modalità, il drag avviene con il mouse (click e trascina) e il clap viene simulato con doppio click o tasto spazio.
- Messaggio in alto-centro: "Webcam non disponibile — usa mouse o tastiera" per 5 secondi, poi scompare.

### ml5 Handpose non si carica
- Indicatore di caricamento centrato ("Caricamento modello AI...") con barra di progresso simulata.
- Se il caricamento fallisce dopo 30 secondi, passa automaticamente alla modalità solo mouse.
- Il messaggio di errore è visibile ma non blocca l'applicazione.

### Nessuna mano rilevata
- Stato normale: il poster funziona, nessun feedback visivo sulle mani.
- Il primo frame con mano rilevata mostra brevemente indicatore "Mano rilevata" che scompare dopo 1 secondo.

### Due mani con un solo pizzico
- Il `HandInteractionManager` gestisce fino a 2 mani. Se una mano pizzica e l'altra no, solo la mano che pizzica può trascinare. Nessun conflitto.

### Elemento trascinato fuori schermo
- Le coordinate vengono clampate ai bordi del canvas in modo che almeno il 20% dell'elemento rimanga visibile.

### Clap durante drag
- Se l'utente sta trascinando un elemento e fa il clap, l'elemento viene sganciato immediatamente (il drag ha priorità minore rispetto al clap). La tipografia esplode mentre l'elemento che stava trascinando cade a terra per inerzia.

---

## 7. Struttura File

```
/Users/filippomatellicani/Desktop/definitivoposter/
├── index.html          # Struttura HTML, caricamento librerie
├── style.css           # Stili CSS (fullscreen, overlay webcam)
├── sketch.js           # Logica p5 + classi + ml5 handpose
└── docs/
    └── superpowers/
        └── specs/
            └── 2025-06-10-poster-interattivo-design.md  # Questo file
```

### Librerie CDN
- p5.js (ultima versione stable)
- ml5.js (ultima versione stable con Handpose)
- Google Fonts: VT323

---

## 8. Criteri di Successo

- [ ] Il poster si avvia fullscreen e responsive
- [ ] ml5 Handpose traccia correttamente le mani dalla webcam
- [ ] Il gesto del pizzico (pollice + indice) permette di trascinare gli elementi
- [ ] Tutti gli elementi tranne lo sfondo sono trascinabili
- [ ] Il gesto del battito delle mani attiva l'esplosione della tipografia
- [ ] Le lettere esplose diventano particelle che cadono/ruotano/svaniscono
- [ ] Il feedback visivo è presente per selezione, drag, e mani rilevate
- [ ] Il codice è organizzato in classi con commenti chiari
- [ ] L'applicazione funziona anche senza webcam (modalità mouse)
- [ ] Il design mantiene lo stile editoriale/sperimentale dell'SVG originale

---

## 9. Note per l'Implementazione

- Le lettere A/B/A/M/C nel SVG originale sono path complessi con molti segmenti. In p5 saranno ricreate con `beginShape()`/`vertex()` usando le coordinate estratte dall'SVG. Questo è il passo più laborioso ma garantisce fedeltà visiva.
- Il font VT323 deve essere caricato tramite Google Fonts nel `<head>` di `index.html` e in `setup()` di p5 usare `textFont('VT323')` (oppure caricare tramite `loadFont()` se necessario per particelle).
- Il modello ml5 Handpose richiede un breve caricamento iniziale. Mostrare un indicatore di caricamento è essenziale per l'UX.
- Il clap detection richiede entrambe le mani visibili contemporaneamente. Se l'utente ha solo una mano, può usare il mouse/la tastiera per simulare il clap.
- Per semplicità e modificabilità grafica, tutte le costanti di colore, posizione, soglia, e dimensione sono definite come costanti in cima a `sketch.js`.

---

**Approvato da**: Filippo  
**Data approvazione**: 2025-06-10  
**Prossimo passo**: Scrittura del piano di implementazione (writing-plans skill)
