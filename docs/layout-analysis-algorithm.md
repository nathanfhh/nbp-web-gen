# Recursive XY-Cut Layout Analysis Algorithm

## Overview

Mediator uses a **Recursive XY-Cut** algorithm to convert raw OCR detections into structured text blocks suitable for presentation slides. This is a classic document layout analysis approach that recursively partitions the page into rectangular zones based on whitespace separators.

This architecture is designed to handle structured slide layouts, including multi-column text, headers, and sections, while maintaining simplicity and predictable behavior.

---

## Algorithm: Recursive XY-Cut

The algorithm recursively splits the page into smaller zones until no more valid cuts can be found. Each leaf node becomes a final text block.

### Step 1: Vertical Cut (Column Separation)

First, attempt to split the page vertically to separate columns.

1. **Project** all text bounding boxes onto the X-axis.
2. **Find gaps** in the projection that exceed the threshold.
3. **Split** at the widest gap if found.

**Threshold:** $1.5 \times H_{med}$ (where $H_{med}$ is the median line height)

*Reasoning:* Columns are typically separated by wide gutters. Using 1.5× median height ensures we don't accidentally split within a paragraph.

### Step 2: Horizontal Cut (Section Separation)

If no vertical cut is possible, attempt to split horizontally.

1. **Project** all text bounding boxes onto the Y-axis.
2. **Find gaps** in the projection that exceed the threshold.
3. **Split** at the widest gap if found.

**Threshold:** $0.3 \times H_{med}$

*Reasoning:* Paragraphs and sections are separated by smaller but distinct vertical whitespace (roughly 1/3 of a line height).

### Step 3: Font Size Cut (Header/Body Separation)

If no whitespace-based cut is possible, attempt to split based on font size differences.

1. **Sort** regions by Y-position (top to bottom).
2. **Compare heights** of adjacent regions.
3. **Split** at the position where height ratio exceeds the threshold.

**Threshold:** `fontSizeDiffThreshold` (default: 1.5, meaning 50% height difference)

*Reasoning:* Headers and body text often have different font sizes but may be close together without significant whitespace. This step ensures they are separated even when tightly spaced.

### Step 4: Recursion

Apply the same process recursively to each partition until:
- **Depth limit** (10 levels) is reached, OR
- **Too few regions** (< 2) remain in a partition, OR
- **No valid cuts** can be found

When recursion stops, the partition becomes a **leaf node** (final text block).

---

## Text Block Creation

Once leaf nodes are identified, each group of regions is converted into a text block:

### Reading Order Sort

Regions within a block are sorted in reading order:

1. **Compare Y-centers** of two regions
2. If Y-centers are within $0.7 \times min(height)$, they are on the **same line** → sort left-to-right
3. Otherwise → sort top-to-bottom

### Smart Text Joining

Text from regions is joined intelligently:

- **Same line:** Join with space ` `
- **Different lines:** Join with newline `\n`
- **Duplicate space prevention:** If the previous text ends with space or current text starts with space, avoid adding extra space

---

## Alignment Detection

Each text block's alignment is inferred by analyzing the horizontal distribution:

| Condition | Alignment |
|-----------|-----------|
| Left edge aligned (< 10% variance) | `left` |
| Center aligned (< 10% variance) | `center` |
| Right edge aligned (< 10% variance) | `right` |
| Otherwise | `left` (default) |

---

## Summary of Parameters

| Parameter | Value / Logic | Purpose |
|:----------|:--------------|:--------|
| **Column Gap** | $1.5 \times H_{med}$ | Separate layout columns |
| **Section Gap** | $0.3 \times H_{med}$ | Separate headers/paragraphs |
| **Font Size Diff** | 1.5 (height ratio) | Separate headers from body text |
| **Same-Line Threshold** | $0.7 \times min(height)$ | Determine if regions are on same line |
| **Max Recursion Depth** | 10 | Prevent infinite recursion |
| **Min Regions for Cut** | 2 | Stop cutting single-region zones |

---

## Comparison with Previous Hybrid Approach

The previous implementation used a two-phase approach:

1. **Phase 1 (XY-Cut):** Macro-segmentation into zones
2. **Phase 2 (Graph Clustering):** Affinity-based merging within zones

The new pure XY-Cut approach offers:

| Aspect | Hybrid (Old) | Pure XY-Cut (New) |
|--------|--------------|-------------------|
| Complexity | ~250 lines | ~100 lines |
| Performance | O(N²) neighbor comparison | O(N log N) recursive split |
| Predictability | Complex affinity scoring | Simple geometric rules |
| Column handling | ✅ Good | ✅ Good |
| Irregular layouts | ✅ Better | ⚠️ Adequate |

The simplified approach trades some flexibility for maintainability and predictable behavior, which is well-suited for structured documents like presentation slides.
