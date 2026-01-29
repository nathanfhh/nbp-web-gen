# Manual Sticker Crop - Feature Requirements

## Overview

Add a "manual separator line mode" to the sticker cropping feature. Users can draw lines to manually define where to cut the image, instead of relying solely on automatic detection.

## Core Concept

**User draws separator lines → Lines define exactly how many stickers → Tolerance only affects background removal**

Key principle: When user manually draws cuts, the system should NOT try to auto-detect regions. The number of output stickers = exactly what the separator lines define.

---

## Functional Requirements

### 1. Mode Switching

- Two modes: **Auto** (existing) and **Manual** (new)
- Mode selector UI in the settings panel
- Switching modes should preserve the uploaded image

### 2. Separator Line Drawing

| Requirement | Description |
|-------------|-------------|
| Draw lines | Click/tap to place start point, click/tap again to place end point |
| Multiple lines | Support drawing multiple separator lines |
| Delete lines | Ability to remove individual lines or clear all |
| Visual feedback | Show lines on top of the image as they're drawn |

### 3. Zoom & Pan (for precise drawing)

- Zoom in/out controls or scroll wheel
- Pan by dragging when zoomed in
- Reset view button
- Coordinate conversion must account for zoom/pan transforms

### 4. Line Auto-Extension

**Lines should automatically extend to image edges** to ensure complete cuts.

Example: User draws a short diagonal line in the middle → System extends it to reach the edges based on the line's angle:
- More horizontal (|dx| >= |dy|): extend to left (x=0) and right (x=width) edges
- More vertical (|dy| > |dx|): extend to top (y=0) and bottom (y=height) edges

This removes the need for users to precisely draw from edge to edge.

### 5. Processing Logic

**Critical: Separator lines and background removal must not interfere with each other.**

#### Correct Processing Order (Manual Mode):

```
1. Create a SEPARATE mask for region detection
   - Mark separator line pixels in mask (not in actual image data)

2. Find regions from mask
   - Uses flood fill on the mask
   - Ignores actual pixel colors
   - Result: regions defined ONLY by separator lines

3. Remove background from ORIGINAL image data
   - No separator lines in image yet → flood fill not blocked
   - Tolerance affects this step only

4. Apply separator lines to image data
   - For visual appearance of the cuts

5. Erode edges (optional)
```

#### Why This Order Matters:

| Wrong Order | Problem |
|-------------|---------|
| Separator lines → Background removal | Lines create transparent barriers, flood fill can't reach inner regions |
| Background removal → Find regions | Background removal may create holes inside stickers, causing extra region splits |

#### Parameter Behavior:

| Parameter | Auto Mode | Manual Mode |
|-----------|-----------|-------------|
| Tolerance | Affects background removal AND region detection | Affects background removal ONLY |
| Erosion | Cleans up edges | Cleans up edges |
| Separator Lines | N/A | Defines region boundaries |

---

## UI/UX Requirements

### Layout

**Auto Mode:**
```
┌─────────────────┬─────────────────┐
│   Settings      │   Results       │
│   + Preview     │   Grid          │
└─────────────────┴─────────────────┘
```

**Manual Mode:**
```
┌─────────────────┬─────────────────┐
│   Settings      │   Tab Switch:   │
│   (no preview)  │   [Editor|Results]
│                 │                 │
│                 │   Separator     │
│                 │   Editor        │
│                 │   (full panel)  │
└─────────────────┴─────────────────┘
```

### Key UX Points

1. **Separator editor needs space** - Use the full right panel, not cramped in a corner
2. **Tab switching** in manual mode - Toggle between drawing lines and viewing results
3. **Clear visual distinction** between modes

### Toolbar (Manual Mode)

- Zoom in / Zoom out / Reset view
- Clear all lines
- Process button (applies cuts and generates stickers)

---

## Technical Implementation

### Files to Modify/Create

| File | Changes |
|------|---------|
| `src/composables/useStickerSeparator.js` | NEW - Handles separator line state, zoom/pan, coordinate conversion |
| `src/components/StickerCropper.vue` | Add mode switching, manual mode UI, event handlers |
| `src/components/StickerCropper.css` | Separator editor styles |
| `src/workers/stickerSegmentation.worker.js` | Add `findRegionsFromMask()`, update processing logic |
| `src/i18n/locales/*.json` | Add translations for new UI elements |

### Key Functions Needed

#### `useStickerSeparator.js`

```javascript
// State
separatorLines: []      // Array of {start: {x,y}, end: {x,y}}
currentLine: null       // Line being drawn
zoom: 1
pan: {x: 0, y: 0}

// Methods
startLine(point)        // Begin drawing a line
endLine(point)          // Complete the line
deleteLine(index)       // Remove a specific line
clearAllLines()         // Remove all lines
getImageCoords(event)   // Convert viewport coords to image coords (accounting for zoom/pan)
getSeparatorLinesForWorker()  // Return lines in format worker expects
```

#### `stickerSegmentation.worker.js`

```javascript
// New function
findRegionsFromMask(mask, width, height, minSize)
// - mask: Uint8Array where 1=content, 0=separator
// - Returns: Array of {x, y, w, h} bounding boxes

// New function
extendLineToEdges(start, end, width, height)
// - Extends line to reach image boundaries
// - Returns: {start, end} with extended coordinates
```

### Coordinate Conversion

**Critical for correct line positioning:**

```javascript
const getImageCoords = (event, container, imageWidth, imageHeight) => {
  // Get the actual rendered image element
  const imgElement = container.querySelector('img, canvas')
  const imgRect = imgElement.getBoundingClientRect()

  // Get click position relative to image
  const clientX = event.touches ? event.touches[0].clientX : event.clientX
  const clientY = event.touches ? event.touches[0].clientY : event.clientY
  const relX = clientX - imgRect.left
  const relY = clientY - imgRect.top

  // Convert to image coordinates
  const imageX = (relX / imgRect.width) * imageWidth
  const imageY = (relY / imgRect.height) * imageHeight

  return {
    x: Math.max(0, Math.min(imageWidth, imageX)),
    y: Math.max(0, Math.min(imageHeight, imageY)),
  }
}
```

---

## Algorithm Details

### Line Extension to Edges

```javascript
function extendLineToEdges(start, end, width, height) {
  const dx = end.x - start.x
  const dy = end.y - start.y

  if (dx === 0 && dy === 0) return { start, end }

  let newStart, newEnd

  if (Math.abs(dx) >= Math.abs(dy)) {
    // More horizontal → extend to left/right edges
    const yAtLeft = start.y + (0 - start.x) * dy / dx
    const yAtRight = start.y + (width - 1 - start.x) * dy / dx
    newStart = { x: 0, y: Math.round(yAtLeft) }
    newEnd = { x: width - 1, y: Math.round(yAtRight) }
  } else {
    // More vertical → extend to top/bottom edges
    const xAtTop = start.x + (0 - start.y) * dx / dy
    const xAtBottom = start.x + (height - 1 - start.y) * dx / dy
    newStart = { x: Math.round(xAtTop), y: 0 }
    newEnd = { x: Math.round(xAtBottom), y: height - 1 }
  }

  // Clamp to bounds
  newStart.x = Math.max(0, Math.min(width - 1, newStart.x))
  newStart.y = Math.max(0, Math.min(height - 1, newStart.y))
  newEnd.x = Math.max(0, Math.min(width - 1, newEnd.x))
  newEnd.y = Math.max(0, Math.min(height - 1, newEnd.y))

  return { start: newStart, end: newEnd }
}
```

### Region Detection from Mask

Uses 4-connected flood fill on the binary mask:
- Start with all pixels labeled 0 (unlabeled)
- Mark separator line pixels as -1 (barrier)
- For each unlabeled pixel, flood fill to find connected region
- Return bounding boxes for regions larger than `minSize`

### Line Rasterization (Bresenham with Width)

```javascript
function getLinePixels(start, end, lineWidth = 3) {
  // Use Bresenham's algorithm to get center line pixels
  // Then expand perpendicular to line direction for width
  // Returns array of {x, y} pixels
}
```

---

## i18n Keys Needed

```json
{
  "sticker": {
    "segmentationMode": "Segmentation Mode",
    "autoMode": "Auto",
    "manualMode": "Manual",
    "separatorEditor": "Separator Editor",
    "drawLines": "Draw lines to define cuts",
    "clearAllLines": "Clear All",
    "zoomIn": "Zoom In",
    "zoomOut": "Zoom Out",
    "resetView": "Reset View",
    "processWithSeparators": "Process",
    "linesCount": "{count} lines"
  }
}
```

---

## Known Challenges

1. **Order of operations** - Background removal and region detection interfere; must use separate mask
2. **Coordinate systems** - Zoom/pan transforms complicate coordinate conversion
3. **Edge cases** - Very short lines, lines at extreme angles, overlapping lines
4. **Performance** - Large images with many lines may slow down processing

---

## Future Enhancements (Out of Scope)

- Curved separator lines
- Snap to grid / smart guides
- Undo/redo for line drawing
- Import separator pattern templates
