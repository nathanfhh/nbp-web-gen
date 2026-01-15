# Slides Mode Prompt Structure

This document describes how prompts are constructed for the Slides generation mode.

## Overview

Slides mode generates presentation slide images page by page. Each page's prompt is constructed by combining multiple components.

## Prompt Template

```
Create a presentation slide image for page {pageNumber} of {totalPages}.

DESIGN STYLE:
{analyzedStyle}

SLIDE CONTENT:
{globalPrompt}

{pageContent}

REQUIREMENTS:
- Create a visually appealing slide that clearly communicates the content
- Maintain consistent style with other slides in the presentation
- Use appropriate typography hierarchy for titles and body text
- Include relevant visual elements that enhance understanding
- Ensure text is readable and well-positioned
- The slide should look professional and polished

Generate a single slide image that effectively presents this content.
```

## Component Breakdown

### 1. Page Context
- `{pageNumber}` - Current page number (1-indexed)
- `{totalPages}` - Total number of pages in the presentation

### 2. Design Style (`{analyzedStyle}`)
The design style is determined by one of two methods:

**AI Analysis Mode:**
- User clicks "Analyze & Plan Style" button
- AI (Gemini 3 Flash/Pro) analyzes all page contents
- Returns a cohesive design recommendation (2-3 sentences)
- User can edit the suggestion before confirming

**Manual Mode:**
- User directly inputs their desired design style description
- Example: "Modern minimalist style with navy blue and white colors, sans-serif fonts, clean layout..."

### 3. Slide Content

**Global Prompt (`{globalPrompt}`):**
- Optional content from the main Prompt input field
- Prepended to every page's content
- Use cases: Company name, presentation theme, recurring visual elements

**Page Content (`{pageContent}`):**
- Specific content for this page
- Entered in the "Presentation Content" textarea
- Pages are separated by `---` delimiter

### 4. Requirements
Fixed instructions ensuring consistent, professional output quality.

## Example

**User Input:**
- Global Prompt: "Company: TechCorp Inc. - Annual Report 2024"
- Page 1 Content: "Revenue Growth: 45% YoY increase"
- Analyzed Style: "Corporate blue theme with data visualization focus, clean sans-serif typography"

**Generated Prompt for Page 1:**
```
Create a presentation slide image for page 1 of 5.

DESIGN STYLE:
Corporate blue theme with data visualization focus, clean sans-serif typography

SLIDE CONTENT:
Company: TechCorp Inc. - Annual Report 2024

Revenue Growth: 45% YoY increase

REQUIREMENTS:
- Create a visually appealing slide that clearly communicates the content
- Maintain consistent style with other slides in the presentation
- Use appropriate typography hierarchy for titles and body text
- Include relevant visual elements that enhance understanding
- Ensure text is readable and well-positioned
- The slide should look professional and polished

Generate a single slide image that effectively presents this content.
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
