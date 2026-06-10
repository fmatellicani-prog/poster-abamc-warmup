# AGENTS.md — Poster Interattivo ABAMC

## Panoramica

Progetto: poster grafico sperimentale interattivo in HTML/CSS/JavaScript.
Obiettivo: combinare design editoriale con interazione gestuale via webcam.
Tecnologie: p5.js (canvas + animazioni), ml5.js (hand tracking), webcam.

---

## Architettura

- **Client-side puro**, nessun backend.
- Tre strati:
  1. Canvas p5.js fullscreen (sfondo fucsio, stella decorativa, elementi interattivi)
  2. ml5.js Handpose analizza il feed webcam nascosto
  3. Canvas DOM di preview webcam in basso a destra (160x120, semi-opaco)

---

## File del Progetto

```
/
├── index.html          # Struttura HTML, carica p5.js, ml5.js (locale), font VT323
├── style.css           # Stili fullscreen, preview webcam, messaggi di stato
├── sketch.js           # Logica p5.js: classi, hand tracking, drag, clap, particelle
├── ml5.min.js          # Libreria ml5.js scaricata localmente (3.2MB, nessun CDN)
├── poster.svg          # File SVG originale del poster (copia senza spazi)
├── POSTER GIUSTO.svg  # File originale con spazio nel nome
└── docs/superpowers/   # Documentazione di design e piani di implementazione
    ├── specs/2025-06-10-poster-interattivo-design.md
    └── plans/2025-06-10-poster-interattivo-plan.md
```

---

## Tecnologie e Librerie

- **p5.js** v1.9.0 (CDN): canvas, animazioni, eventi mouse/tastiera
- **ml5.js** v0.12.2 (locale): Handpose per tracking mani
- **Google Fonts** VT323: font monospace pixel-art per tipografia
- **Vanilla JS**: nessun framework, nessun build step

**PERCHE' ml5.js E' LOCALE:**
Il CDN originale (cdnjs) restituiva 404 per la versione alpha. Per garantire che il progetto funzioni offline e senza dipendenze di rete, ml5.js e' stato scaricato localmente.

---

## Classi (5 come richiesto)

1. **PosterElement** (base astratta)
   - Proprieta': x, y, w, h, isDragging, isHovered
   - Metodi: draw(), update(), isPointInside(mx,my), startDrag(), dragTo(), endDrag()

2. **DraggableShape** (estende PosterElement)
   - Forme geometriche: rect, circle, ellipse
   - Proprieta': type, fill, stroke, strokeWeight, cornerRadius
   - Feedback drag: bordo verde acido, scale 1.05x
   - Usata per: rettangoli, cerchi, ellissi, rettangolo "WARMUP" verde

3. **DraggableText** (estende PosterElement)
   - Blocchi tipografici trascinabili
   - Proprieta': text, size, fill, font, align, baseline
   - Sfondo nero semi-trasparente dietro il testo per visibilita'
   - Testo bianco (alto contrasto su sfondo fucsio)
   - Metodo explode(): genera TypographyParticle per ogni carattere

4. **TypographyParticle**
   - Singola lettera in volo dopo esplosione
   - Fisica: vx, vy, gravity(0.25), friction(0.98), rotation, opacity decay
   - Si auto-rimuove quando opacity <= 0

5. **HandInteractionManager**
   - Gestisce dati raw da ml5 Handpose
   - Rileva **pizzico**: distanza pollice-indice < 30px (webcam)
   - Rileva **clap**: distanza palmi passa da >150px a <100px (cooldown 1.5s)
   - Mappa coordinate webcam (640x480) -> canvas (flip orizzontale per specchio)
   - Disegna feedback: cerchi bianchi sui palmi, cerchio verde sul pizzico

---

## Funzionalita'

| Feature | Implementazione |
|---------|----------------|
| Canvas fullscreen responsive | p5.js createCanvas(windowWidth, windowHeight) + windowResized() |
| Sfondo poster | background('#e6007e') + stella decorativa disegnata con line() |
| Lettere A/B/A/M/C | DraggableText con font VT323, bianco, sfondo nero semi-trasparente |
| WARMUP | DraggableShape (rettangolo verde) + DraggableText (testo nero) |
| Forme extra | 4 DraggableShape: cerchio fucsia, rettangolo nero, ellisse verde, quadrato bianco |
| Hand tracking | ml5.handpose() analizza webcam, callback 'predict' ogni frame |
| Pizzico drag | Pollice+indice vicini -> cerchio verde -> trascina elemento sotto il punto |
| Clap esplosione | Due mani si avvicinano rapidamente -> flash bianco -> testi esplodono in particelle |
| Feedback visivo | Hover: bordo tratteggiato verde lampeggiante. Drag: scale 1.05 + bordo verde solido |
| Webcam preview | Canvas DOM 160x120 in basso a destra, opacita' 70%, mirroring orizzontale |
| Fallback mouse | Se webcam non disponibile: click-drag per spostare, doppio click/spazio per clap |
| Messaggi stato | "Caricamento modello AI...", "Webcam non disponibile", ecc. (div centrato) |

---

## Coordinate e Scala

Il poster ha dimensioni native **595.28 x 841.89** (proporzioni A4).
Il canvas si adatta allo schermo mantenendo le proporzioni:

```javascript
scaleFactor = min(windowWidth / SVG_W, windowHeight / SVG_H)
offsetX = (windowWidth - SVG_W * scaleFactor) / 2
offsetY = (windowHeight - SVG_H * scaleFactor) / 2
```

Tutte le posizioni degli elementi sono nello spazio SVG nativo e vengono scalate con `translate(offsetX, offsetY)` + `scale(scaleFactor)`.

---

## Palette Colori

- `#e6007e` — Fucsia/magenta (sfondo)
- `#0dff00` — Verde acido (accento, feedback, rettangolo WARMUP)
- `#000000` — Nero (stella, stroke, sfondo lettere)
- `#ffffff` — Bianco (testo lettere, contrasto massimo)

---

## Come Testare

### Con server web locale (consigliato per webcam):
```bash
cd /percorso/progetto
python3 -m http.server 8000
```
Apri `http://localhost:8000` nel browser.

### Senza server (solo mouse):
Doppio click su `index.html` — funziona in modalita' fallback mouse.

### Test con webcam:
1. Permetti accesso webcam quando richiesto
2. Attendi "Caricamento modello AI..." (5-10 secondi)
3. Avvicina pollice e indice per pizzicare e trascinare
4. Batti le mani per far esplodere il testo WARMUP

### Test senza webcam:
1. Blocca/negal il permesso webcam
2. Vedi messaggio "Webcam non disponibile — usa mouse o tastiera"
3. Click e trascina gli elementi con il mouse
4. Doppio click o tasto **Spazio** per simulare il clap

---

## Problemi Noti e Soluzioni

1. **ml5.js CDN 404**: risolto scaricando ml5.js localmente
2. **Lettere non visibili**: risolto aggiungendo sfondo nero semi-trasparente dietro il testo bianco
3. **Canvas nero vuoto**: risolto disegnando sfondo fucsia direttamente nel canvas (no dipendenze da immagini esterne)
4. **File SVG con spazio**: copiato come `poster.svg` per evitare problemi URL

---

## Branch Git

Branch attivo: `poster`
Commit principali:
- Design spec: `docs/superpowers/specs/2025-06-10-poster-interattivo-design.md`
- Implementation plan: `docs/superpowers/plans/2025-06-10-poster-interattivo-plan.md`

---

## Note per Agenti Futuri

- **Non modificare ml5.min.js**: e' una libreria di terze parti, ogni modifica verrebbe sovrascritta
- **Mantenere il fallback mouse**: il 50% degli utenti non avra' webcam o la blocchera'
- **Le coordinate sono nello spazio SVG nativo**: quando si aggiunge un nuovo elemento, usare x,y tra 0-595 e 0-841
- **p5.js usa il font VT323**: assicurarsi che il font sia caricato prima di disegnare testo (p5 lo gestisce automaticamente)
- **Non aggiungere background() nel draw**: lo sfondo e' gia' disegnato con background(COL_BG), mettere un altro background coprirebbe gli elementi

---

## Autore e Data

Autore: Filippo
Data: 2025-06-10
Stato: Completato e funzionante
