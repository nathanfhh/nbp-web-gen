# Slides Mode Prompt Structure

This document describes how prompts are constructed for the Slides generation mode.

## Overview

Slides mode generates presentation slide images page by page. Each page's prompt is constructed by combining multiple components using a structured markdown format with clear sections.

## Prompt Template

```markdown
# Slide Generation Task

Generate a presentation slide image for **Page {pageNumber} of {totalPages}**.

## PRESENTATION OVERVIEW
> This section provides background context about the entire presentation.
> Use this information to understand the topic, audience, and purpose - but DO NOT display this text on the slide.

{globalPrompt}

---

## DESIGN STYLE GUIDE
> This section defines the visual design language. Apply these styles consistently across all slides.

### Global Style
{globalStyle}

### Page-Specific Adjustments
> Additional styling requirements for THIS specific page (additive to global style):

{pageStyleGuide}

---

## SLIDE CONTENT
> This is the ACTUAL TEXT and information to display on this slide.
> Render this content visually on the slide image.

{pageContent}

---

## DESIGN REQUIREMENTS

### Visual Design
- Create a visually appealing slide that clearly communicates the content
- Use appropriate typography hierarchy (large titles, readable body text)
- Include relevant visual elements (icons, shapes, illustrations) that enhance understanding
- Ensure sufficient contrast and readability
- Apply professional, polished finishing

### Consistency Rules
- **Color Palette**: Use the EXACT SAME colors specified in the style guide for all similar elements
- **Typography**: Use consistent fonts, sizes, and weights across all slides
- **Layout**: Maintain consistent margins, spacing, and alignment patterns
- **Visual Elements**: Use the same icon style, shape language, and decorative patterns

---

## STRICT CONSTRAINTS (MUST FOLLOW)

⛔ **DO NOT** add any of the following:
- Page numbers, slide numbers, or any numbering
- Headers or footers
- Company logos (unless specified in content)
- Decorative elements not directly related to the content
- Any text not specified in SLIDE CONTENT section

✅ **ALWAYS** ensure:
- The slide looks like it belongs to a cohesive presentation set
- Colors match exactly across all slides in the series
- Typography is consistent with the style guide

---

Generate a single, professional slide image that effectively presents the content above.
```

## Component Breakdown

### 1. Page Context
- `{pageNumber}` - Current page number (1-indexed)
- `{totalPages}` - Total number of pages in the presentation

### 2. Presentation Overview (`{globalPrompt}`)
**Optional section** - Only included if globalPrompt is provided.
- Content from the main Prompt input field
- Provides background context (company name, presentation theme, recurring elements)
- **Important**: This content is NOT displayed on the slide, only used for context

### 3. Design Style Guide

**Global Style (`{globalStyle}`):**
The design style is determined by one of two methods:

**AI Analysis Mode:**
- User clicks "Analyze & Plan Style" button
- AI (Gemini 3 Flash/Pro) analyzes all page contents
- Returns a cohesive design recommendation
- User can edit the suggestion before confirming

**Manual Mode:**
- User directly inputs their desired design style description
- Example: "Modern minimalist style with navy blue and white colors, sans-serif fonts, clean layout..."
- Default: "Professional presentation slide design"

**Page-Specific Style (`{pageStyleGuide}`):**
**Optional section** - Only included if page has custom style adjustments.
- Per-page styling requirements that are additive to the global style
- Allows customization for specific slides while maintaining overall consistency

### 4. Slide Content (`{pageContent}`)
- Specific content for this page
- Entered in the "Presentation Content" textarea
- Pages are separated by `---` delimiter
- This is the ACTUAL text that appears on the generated slide

### 5. Design Requirements
Fixed instructions ensuring:
- Consistent, professional output quality
- Visual hierarchy and readability
- Cohesive presentation appearance

### 6. Strict Constraints
Explicit rules about what NOT to include:
- No automatic page numbers
- No headers/footers
- No unauthorized logos or decorations
- No text outside of SLIDE CONTENT

## Example

**User Input:**
- Global Prompt: "Company: TechCorp Inc. - Annual Report 2024"
- Page 1 Content: "Revenue Growth: 45% YoY increase"
- Global Style: "Corporate blue theme with data visualization focus, clean sans-serif typography"
- Page Style Guide: (none)

**Generated Prompt for Page 1:**
```markdown
# Slide Generation Task

Generate a presentation slide image for **Page 1 of 5**.

## PRESENTATION OVERVIEW
> This section provides background context about the entire presentation.
> Use this information to understand the topic, audience, and purpose - but DO NOT display this text on the slide.

Company: TechCorp Inc. - Annual Report 2024

---

## DESIGN STYLE GUIDE
> This section defines the visual design language. Apply these styles consistently across all slides.

### Global Style
Corporate blue theme with data visualization focus, clean sans-serif typography

---

## SLIDE CONTENT
> This is the ACTUAL TEXT and information to display on this slide.
> Render this content visually on the slide image.

Revenue Growth: 45% YoY increase

---

## DESIGN REQUIREMENTS

### Visual Design
- Create a visually appealing slide that clearly communicates the content
- Use appropriate typography hierarchy (large titles, readable body text)
- Include relevant visual elements (icons, shapes, illustrations) that enhance understanding
- Ensure sufficient contrast and readability
- Apply professional, polished finishing

### Consistency Rules
- **Color Palette**: Use the EXACT SAME colors specified in the style guide for all similar elements
- **Typography**: Use consistent fonts, sizes, and weights across all slides
- **Layout**: Maintain consistent margins, spacing, and alignment patterns
- **Visual Elements**: Use the same icon style, shape language, and decorative patterns

---

## STRICT CONSTRAINTS (MUST FOLLOW)

⛔ **DO NOT** add any of the following:
- Page numbers, slide numbers, or any numbering
- Headers or footers
- Company logos (unless specified in content)
- Decorative elements not directly related to the content
- Any text not specified in SLIDE CONTENT section

✅ **ALWAYS** ensure:
- The slide looks like it belongs to a cohesive presentation set
- Colors match exactly across all slides in the series
- Typography is consistent with the style guide

---

Generate a single, professional slide image that effectively presents the content above.
```

## Reference Images

The slides mode supports reference images for visual guidance during generation:

- **Global Reference Images**: Applied to all pages. Set in the "Global References" section.
- **Page-specific Reference Images**: Applied only to individual pages. Set within each page card.
- **Combined limit**: Global + page-specific ≤ 5 images per generation. Global images take priority.

When generating, the system combines global reference images with page-specific ones (if any) and passes them to the image generation API.

## Related Files

- `src/composables/useApi.js` - `buildSlidesPrompt()` function
- `src/composables/useSlidesGeneration.js` - Generation orchestration
- `src/components/SlidesOptions.vue` - UI component
