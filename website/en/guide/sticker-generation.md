# Sticker Mode

<TryItButton mode="sticker" prompt="A fluffy orange Shiba Inu with a round face, cute chibi style" />

Sticker mode can generate multiple expression stickers at once and automatically split them into individual images.

## Basic Usage

Here's how to generate a 3×3 (9 total) Shiba Inu office sticker set:

### Step 1: Select Mode and Enter Prompt

1. Select "Sticker" mode
2. In the "Prompt Description" input, describe your character:

```
A fluffy orange Shiba Inu with a round face, cute Q-style
```

::: tip Tip
Focus on describing the character's appearance and style. Context, composition, and expression details will be automatically added to the prompt through the options below.
:::

### Step 2: Configure Options

**Layout**
- Rows: 3
- Cols: 3
- Preview will show "9 stickers total"

**Usage Context**
- Select "Boss Replies" (suitable for office scenarios)

**Composition - Camera Angle**
- Check "Headshot", "Half-body", "Full-body" (multi-select for more variety)

**Composition - Expression Intensity**
- Choose "Natural", "Exaggerated", or "Over-the-top" based on preference

### Step 3: Generate Sticker Sheet

1. Click the "Generate" button
2. Wait for AI to generate the complete sticker sheet

![Sticker Generation Result](/images/sticker-result.webp)

### Step 4: Crop Stickers

1. Click the generated image to open the lightbox
2. Click the "Crop" button in the top-right corner

![Lightbox Crop Feature](/images/sticker-lightbox.webp)

3. In the crop tool, adjust the background removal settings:
   - **Background Color**: The system auto-detects the background color. If the detection is incorrect or the background removal looks off, click "Pick Color" to manually sample the correct color from the image
   - **Tolerance**: Adjust the value to control background removal range
   - **White Background Preview**: We recommend enabling this to ensure clean sticker edges
4. Click "Start Processing" and the system will auto-detect and split into individual stickers

![Crop Tool Interface](/images/sticker-crop-tool.webp)

### Step 5: Download and Edit

After cropping, the right panel displays all split stickers (9 stickers in this example).

![Crop Results](/images/sticker-crop-result.webp)

**Download Options:**
- Download as PDF
- Download as ZIP archive

**Individual Sticker Editing:**

In the crop results, click the "Edit" button (pencil icon) on the top-left corner of any sticker to open the background removal tool:

![Background Removal Tool](/images/sticker-edit-tool.webp)

- **Click to remove**: Click directly on areas you want to remove
- **Drag to aim**: Hold and drag for more precise selection
- **Tolerance**: Adjust the value to control the removal range
- **Undo**: Click the undo button on the bottom-left to revert the last action

If your sticker has disconnected background areas (e.g., gaps enclosed by the character's arms), use this tool to remove them and convert to transparent background.

**Character Extraction:**

If you're happy with the character design and want future generations to maintain the same appearance, use the "Extract Character" feature to save it. See [Character Library](./character-library) for details.

## Sticker Options Explained

### Quality

Set the output image resolution: **1K**, **2K**, **4K**.

### Aspect Ratio

Set the sticker sheet image ratio: **1:1**, **3:4**, **4:3**, **9:16**, **16:9**.

### Layout

Set the rows and columns for the sticker sheet. Recommended total of 4-9 stickers; too many may result in crowded images with insufficient detail.

### Style

Choose from preset styles or enter custom style descriptions:

- **Preset styles**: Photorealistic, Watercolor, Oil Painting, Sketch, Pixel Art, Anime, Pixar 3D, Vintage, Modern, Abstract, Minimalist
- **Custom style**: Enter your desired style description in the input field

### Usage Context

Preset contexts affect the expressions and action styles AI generates:

- **Chat Replies**: Everyday conversation expressions
- **Group Chat**: Reaction stickers for group chats
- **Boss Replies**: Office scenarios, workplace communication
- **Couples**: Sweet, cute expressions
- **Custom**: Enter your own specific usage context

### Text Options

Configure text tone (Formal, Polite, Friendly, Sarcastic) and language (Chinese, English, Japanese) for sticker text.

### Composition

- **Camera Angle**: Headshot, Half-body, Full-body - multi-select for variety
- **Expression Intensity**: Natural, Exaggerated, Over-the-top

## Auto Splitting

After generation, Mediator automatically splits the sticker sheet into individual stickers:

1. AI generates the complete sticker sheet
2. Client-side image analysis
3. BFS flood fill algorithm detects regions
4. Auto crop and remove background

::: tip Tip
If auto splitting doesn't work well, you can adjust splitting parameters or manually select regions in the lightbox.
:::

## Batch Download

After splitting, you can:

- Download individual stickers
- Batch download all (ZIP archive)
- Download as transparent PNG

## LINE Sticker Tool

If you want to publish your stickers on LINE Creators Market, use the built-in LINE Sticker Tool to quickly resize and format your stickers to meet LINE's specifications.

### Accessing the Tool

In the Sticker mode main screen, you'll see a green "LINE Sticker Tool" entry:

![LINE Sticker Tool Entry](/images/line-sticker-tool-entry.webp)

Click to enter the LINE Sticker Tool page.

### Features

- **Batch Resize**: Automatically resize stickers to LINE's required dimensions (max 370×320 pixels, even dimensions required)
- **File Compression**: Ensure each sticker meets LINE's file size limits
- **One-Click Download**: Package all processed stickers into a ZIP archive

### How to Use

1. Drag or upload your cropped stickers to the tool
2. The system automatically handles resizing and compression
3. Click download to get your LINE-ready sticker pack

::: tip Tip
For detailed LINE sticker specifications and submission guidelines, refer to the [LINE Creators Market Official Guide](https://creator.line.me/en/).
:::

<TryItButton mode="sticker" prompt="A fluffy orange Shiba Inu with a round face, cute chibi style" />

## Next Steps

- [Edit Mode](./image-editing) - Edit generated stickers
- [Character Library](./character-library) - Save characters for consistency
