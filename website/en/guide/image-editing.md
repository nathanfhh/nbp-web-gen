# Image Editing

Image editing mode lets you upload reference images for style transfer or content modification.

## Basic Usage

1. Select "Image Editing" mode
2. Upload one or more reference images
3. Describe the modifications you want
4. Click "Generate"

## Edit Types

### Style Transfer

Convert photos to different art styles:

```
Convert this photo to Studio Ghibli animation style
```

### Content Modification

Modify specific elements in the image:

```
Change the background to a beach sunset
Change the person's clothes to red
```

### Image Fusion

Combine elements from multiple reference images:

```
Use the character from the first image, place them in the scene from the second image
```

## Reference Images

### Supported Formats

- JPG, PNG, WebP
- Maximum 5 reference images

### Multiple Images

You can upload multiple reference images and specify how to use them in your prompt:

```
Use the composition from reference 1, apply the color style from reference 2
```

## Sketch Mode

If you want to use a hand-drawn sketch as reference:

1. Click the "Sketch" button to open the canvas
2. Draw a simple sketch or outline
3. AI will generate a complete image based on your sketch

### Canvas Tools

| Tool | Description |
|------|-------------|
| Brush | Free drawing (Shortcut: B) |
| Eraser | Erase mistakes (Shortcut: E) |
| Pan | Drag canvas to view different areas |
| Color Picker | Select brush color, supports presets and custom colors |
| Brush Size | Adjust line thickness (2-50px) |
| Undo/Redo | Correct operations (Shortcut: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z) |
| Clear Canvas | Clear all drawn content |

### Canvas Options

| Option | Description |
|--------|-------------|
| Quality | Output resolution: 1K, 2K, 4K |
| Aspect Ratio | Canvas ratio: 1:1, 16:9, 9:16, 4:3, 3:4 |

### Zoom Controls

- **Zoom In**: View details
- **Zoom Out**: View full picture
- **Reset Zoom**: Return to 100% zoom

### Keyboard Shortcuts

| Key | Function |
|-----|----------|
| B | Switch to Brush tool |
| E | Switch to Eraser |
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z | Redo |
| ESC | Cancel editing |
| Enter | Save and finish |

::: tip Draggable Toolbar
The toolbar can be dragged to any position on screen for when you need more canvas space.
:::

## Next Steps

- [Story Mode](./story-mode) - Create continuous image stories
- [Character Library](./character-library) - Save character consistency
