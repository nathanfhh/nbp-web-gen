# Slide Generation

Slide mode can automatically generate complete presentation slides using AI, with style analysis and page-by-page generation.

## Interface Overview

![Slides Mode Interface](/images/slides-basic-usage.webp)

Slides mode offers two main approaches: plan the content yourself, or let AI plan it for you.

## Scenario 1: Plan Content Yourself

When you already know what each page should contain, you can enter content directly in the "Presentation Content" area, using `---` (three dashes) to separate different pages.

### Example: Creating a FIDO Passkey Introduction

Let's create a 3-page presentation to introduce FIDO Passkey:

```
Cover: What is FIDO Passkey?
Subtitle: A more secure and convenient passwordless login method

---

How Passkey Works
- Uses public key cryptography
- Private key stored securely on device
- Verified through biometrics (fingerprint, Face ID)
- No need to remember complex passwords

---

Advantages of Passkey
- Prevents phishing: private key never leaves the device
- Cross-device sync: syncs via iCloud/Google account
- Better user experience: one-tap login, no password needed
```

The system will automatically split this into three pages based on `---`, showing "3 pages" at the bottom.

### Steps

1. Select "Slides" mode
2. Enter content for each page in "Presentation Content", separated by `---` (max 30 pages)
3. (Optional) Enter "Global Description" - background context about your presentation that helps AI understand the overall theme (this text won't appear on slides)
4. Set quality (1K, 2K, 4K) and aspect ratio (16:9, 4:3, 1:1)
5. Choose design style (AI Analysis or Manual Input)
6. Click "Generate"

::: tip Global Description
Use Global Description to provide context like "This is an internal tech sharing session for engineers" or "Target audience is marketing team, prefer business style". This helps AI generate more appropriate visuals without cluttering individual slide content.
:::

## Scenario 2: Let AI Plan for You

When you have a long document (like official documentation, technical specs, meeting notes) to convert into slides, you can use the "AI Planning" feature to let AI analyze the content and plan key points for each page.

::: info About API Key Usage
AI Planning is a text processing feature that prioritizes using your Free Tier API Key (if configured). It only switches to your paid key when the Free Tier quota is exhausted. See [API Key Management](./api-key-management) for details.
:::

### Example: Converting FIDO Official Documentation to Slides

1. Click the "AI Planning" button next to "Presentation Content"
2. Paste the full document content in the popup (e.g., FIDO Alliance technical whitepaper)
3. Click "Start Planning"
4. AI will analyze and split the content into multiple slide pages

![AI Slides Planning](/images/slides-ai-planning.webp)

::: tip Tip
AI Planning works best for longer documents. If you only have brief bullet points, Scenario 1 (planning yourself) is more efficient.
:::

## Generation Flow

Slides mode uses a **sequential generation** strategy:

1. Generate first page (cover) first
2. Use first page as reference to maintain style consistency
3. Generate subsequent pages in order

This ensures visual style consistency throughout the presentation.

## Design Style

In the "Design Style" section, you can choose from two methods to set your presentation's visual style:

### AI Analysis

Click "AI Analysis", then you can:

1. **Select analysis model**: Gemini 3 Flash (faster) or Gemini 3 Pro (more accurate)
2. **Enter style preferences** (optional): Describe what you want or don't want, e.g.:
   - ✓ Want: Modern minimalist, blue color scheme
   - ✗ Don't want: Gradient backgrounds, excessive decorations
3. Click "Analyze & Plan Style"

AI will analyze your presentation content and style preferences to generate suitable design style suggestions:

- **Color scheme**: Primary, secondary, background colors
- **Layout**: Title position, content blocks, margins
- **Typography**: Title size, body text size
- **Visual elements**: Chart style, icon style

You can edit and adjust the AI's suggestions after they're generated.

::: info About API Key Usage
Style analysis is a text processing feature that prioritizes using your Free Tier API Key. See [API Key Management](./api-key-management) for details.
:::

### Manual Input

If you already have a clear style in mind, choose "Manual Input" and directly describe your desired design style:

```
Modern minimalist style with navy blue and white background,
sans-serif fonts, clean and organized layout
```

### Global Style vs Page Style

Presentation styles work at two levels:

1. **Global Style**: Base design style applied to all pages
2. **Page Style Guide**: Each page can have additional style adjustments

For example, you can set the global style to "professional business" but specify "use blue-green data visualization" for chart pages.

::: tip Tip
If a page has special content (charts, quotes, timelines), you can specify custom styling in that page's "Page Style Guide" to help AI handle it better.
:::

### Global Reference Images

You can upload up to 5 reference images that will be applied to all page generations, helping AI better understand your desired visual style or brand elements.

![Design Style Interface](/images/slides-design-style.webp)

## Prompt Structure (Technical Details)

The system combines your inputs into a structured prompt sent to AI for image generation. Here's the actual prompt structure for each page:

```
# Slide Generation Task

Generate a presentation slide image for **Page {number} of {total}**.

## PRESENTATION OVERVIEW
{Global Description}

## DESIGN STYLE GUIDE

### Global Style
{Global Style}

### Page-Specific Adjustments
{Page Style Guide}

## SLIDE CONTENT
{Page Content}

## DESIGN REQUIREMENTS
(System-added design guidelines)

## STRICT CONSTRAINTS
(System-added constraints)
```

This structure ensures:
- **Global Description** provides background context (not displayed on slides)
- **Global Style** maintains visual consistency across all slides
- **Page Style Guide** allows flexibility for individual pages
- **Page Content** is the actual text rendered on the slide

## Page Types

Since this is an image generation model, the types of pages you can create are only limited by your imagination. Here are some common examples:

| Type | Description |
|------|-------------|
| Cover | Title, subtitle, date |
| Table of Contents | Presentation outline |
| Content Page | Title + bullet points |
| Chart Page | Data visualization |
| Comparison Page | Two or multi-column comparison |
| Timeline | History, milestones |
| Quote Page | Famous quotes, key takeaways |
| Ending Page | Summary, Q&A, contact info |

As long as you can clearly describe the layout in your prompt, the model can generate it for you.

## Prompt Tips

### Specify Content Clearly

```
Page 3: Quarterly Performance
- Q1: Revenue $1.2M, growth 15%
- Q2: Revenue $1.35M, growth 12%
- Q3: Revenue $1.28M, decline 5%
- Q4: Revenue $1.5M, growth 17%
Use bar chart visualization
```

### Specify Style Preferences

```
Overall style: Professional business
Colors: Navy blue primary, white background
Avoid: Excessive decoration, cartoon elements
```

## Generated Results

![Slides Generation Result](/images/slides-result.webp)

## Export Options

After generation, you can:

- Download as ZIP (all pages as PNG images)
- Download as PDF

::: tip Need Editable PPTX?
If you need to convert your slides to editable PPTX format, use the [Slide Conversion Tool](./slide-conversion).
:::

## Difference from Slide Conversion

| Feature | Slide Generation | Slide Conversion |
|---------|------------------|------------------|
| Input | Text description | PDF file |
| Purpose | Create slides from scratch | Convert existing PDF to editable format |
| AI Role | Generate content and design | OCR recognition and background removal |

## Next Steps

- [Slide Conversion](./slide-conversion) - Convert PDF to PPTX
- [Diagram Generation](./diagram-generation) - Generate charts for slides
- [Image Generation](./image-generation) - Generate illustration assets
