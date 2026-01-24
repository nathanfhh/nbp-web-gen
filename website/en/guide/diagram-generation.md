# Diagram Mode

<TryItButton mode="diagram" prompt="User login flow:
1. Enter username and password
2. Validate credentials
3. If successful, go to homepage
4. If failed, show error message and retry" />

Diagram mode is designed for generating technical diagrams, flowcharts, architecture diagrams, and other visual content.

## Basic Usage

1. Select "Diagram" mode
2. Describe the diagram content you need
3. Choose diagram type
4. Click "Generate"

## Diagram Type Examples

Here are some commonly used diagram types. You can try generating various other types as well:

### Flowcharts

```
User login flow:
1. Enter username and password
2. Validate credentials
3. If successful, go to homepage
4. If failed, show error message and retry
```

### Architecture Diagrams

```
Three-tier architecture:
- Presentation layer: React frontend
- Logic layer: Node.js API server
- Data layer: PostgreSQL database
```

### Sequence Diagrams

```
API request sequence:
Client -> API Gateway -> Auth Service -> Database
```

::: tip Tip
Besides the examples above, you can also try generating mind maps, org charts, ER diagrams, Gantt charts, and more. Just clearly describe what you need in your Prompt.
:::

## Diagram Options Explained

### Quality

Set the output image resolution: 1K, 2K, or 4K.

### Diagram Type

Choose the type of diagram to generate:

- **Unspecified**: Let AI decide automatically
- **Flowchart**: Show process steps
- **Architecture**: System architecture diagrams
- **Network**: Network topology diagrams
- **Database**: Database structure (ER diagrams, etc.)
- **Wireframe**: UI/UX design mockups
- **Mind Map**: Thought mapping diagrams
- **Sequence**: Time-ordered interaction flows

### Visual Style

Set the visual presentation of the diagram:

- **Unspecified**: Let AI decide automatically
- **Clean**: Clean lines and color blocks
- **Hand-drawn**: Whiteboard doodle effect
- **Technical**: Professional technical document style

### Layout

Set the overall arrangement of the diagram:

- **Unspecified**: Let AI decide automatically
- **Horizontal**: Left to right arrangement
- **Vertical**: Top to bottom arrangement
- **Hierarchical**: Tree-like hierarchical structure
- **Circular**: Radial circular arrangement

### Complexity

Control the level of detail in the diagram:

- **Unspecified**: Let AI decide automatically
- **Simple**: Show only main elements
- **Detailed**: Include more details
- **Comprehensive**: Complete and thorough presentation

### Annotation Level

Set the amount of text labels on the diagram:

- **Unspecified**: Let AI decide automatically
- **Minimal**: Label only key elements
- **Detailed**: Label every element with descriptions

## Prompt Tips

### Clear Structure

Clearly describe the diagram's hierarchy and relationships:

```
Clearly indicate:
- Main nodes use large boxes
- Secondary nodes use small boxes
- Use arrows to show data flow
- Use different colors to distinguish types
```

### Add Labels

```
Add a legend below the diagram
Each node should have labels in the desired language
```

<TryItButton mode="diagram" prompt="User login flow:
1. Enter username and password
2. Validate credentials
3. If successful, go to homepage
4. If failed, show error message and retry" />

## Next Steps

- [Slide Conversion](./slide-conversion) - Add diagrams to presentations
- [Image Editing](./image-editing) - Fine-tune diagram details
