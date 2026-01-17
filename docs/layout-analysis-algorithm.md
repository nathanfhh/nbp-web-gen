# Hybrid Layout Analysis Algorithm

## Overview

Mediator uses a sophisticated **Hybrid Layout Analysis** engine to convert raw OCR detections into structured text blocks suitable for presentation slides. Unlike simple linear-scan methods, our approach combines **Recursive XY-Cut** (top-down) for macro-segmentation with **Graph-Based Clustering** (bottom-up) for precise text merging.

This architecture is designed to handle complex slide layouts, including multi-column text, floating captions, and mixed font sizes, while being robust across different image resolutions.

---

## Phase 1: Macro-Segmentation (Relaxed XY-Cut)

The first phase partitions the entire slide into independent **Zones**. This "Divide & Conquer" strategy prevents text from physically distant sections (e.g., left vs. right columns) from ever being merged, regardless of their vertical alignment.

### Logic
1.  **Projection Analysis:** We calculate the projection profiles of all text bounding boxes onto the X and Y axes.
2.  **Gap Detection:** The algorithm looks for "whitespace gaps" in these projections that exceed a dynamic threshold.
3.  **Recursive Splitting:**
    *   **Vertical Cuts (X-Axis):** Prioritized to separate columns.
    *   **Horizontal Cuts (Y-Axis):** Used to separate headers, bodies, and footers.

### Dynamic Thresholds (Scale Invariance)
Instead of fixed pixel values, thresholds are calculated relative to the **Median Line Height** ($H_{med}$) of the page:

*   **Column Gap Threshold:** $1.5 \times H_{med}$
    *   *Reasoning:* Columns are typically separated by wide gutters.
*   **Section Gap Threshold:** $0.3 \times H_{med}$
    *   *Reasoning:* Paragraphs and headers are separated by distinct vertical whitespace.

---

## Phase 2: Micro-Merging (Graph-Based Clustering)

Within each Zone identified in Phase 1, we treat text lines as nodes in a graph and establish edges based on an **Affinity Score** (0.0 - 1.0).

### The Affinity Function
We calculate the affinity $S$ between two text regions $R_1$ (above) and $R_2$ (below) using a weighted formula:

$$ S = (W_{dist} \times S_{dist}) + (W_{align} \times S_{align}) + B_{overlap} $$

Where the merging threshold is **$S > 0.80$**.

#### 1. Vertical Distance ($S_{dist}$) - Weight: 0.7
*   Measures how close $R_2$ is to the bottom of $R_1$.
*   **Decay Function:** The score drops linearly as the gap increases.
*   **Cutoff:** Gap $> 0.9 \times AvgHeight$.

#### 2. Horizontal Alignment ($S_{align}$) - Weight: 0.3
*   Rewards regions that share left, center, or right alignment edges.
*   Calculated based on the pixel distance between alignment anchors.

#### 3. Overlap Bonus ($B_{overlap}$) - Special Rule
*   **Condition:** If the vertical bounding boxes of $R_1$ and $R_2$ overlap significantly (intersection $> 20\%$ of height).
*   **Bonus:** $+0.4$ to the total score.
*   **Effect:** Strongly forces overlapping detections (often caused by OCR fragmentation) to merge.

### Hard Veto Rules
Regardless of the score, merging is **forbidden** if:

1.  **Font Size Mismatch:**
    *   If $\frac{Height_{min}}{Height_{max}} < 0.9$ (size differs by > 10%).
    *   *Purpose:* Strictly separates Titles from Subtitles and Body Text.

2.  **Horizontal Reach Separation (Side-by-Side):**
    *   If **No Horizontal Overlap** AND **Gap > 0.5 $\times$ AvgHeight**.
    *   *Purpose:* Prevents merging of widely separated elements (e.g., distinct columns that XY-Cut missed).

3.  **Same-Line Gap Separation:**
    *   If **Vertical Overlap > 50%** (Same Line) AND **Gap > 1.5 $\times$ AvgHeight**.
    *   *Purpose:* Prevents merging of distinct words or list items on the same line (e.g., `Item A ... Item B`).

4.  **Zone Crossing:**
    *   Nodes in different XY-Cut Zones can never have an edge.

---

## Summary of Parameters

| Parameter | Value / Logic | Purpose |
| :--- | :--- | :--- |
| **Column Gap** | $1.5 \times H_{med}$ | Separate layout columns |
| **Section Gap** | $0.3 \times H_{med}$ | Separate headers/paragraphs |
| Max Merge Gap | $0.9 \times AvgHeight$ | Prevent merging across paragraphs |
| **Size Tolerance** | $10\%$ ($0.9$ ratio) | Distinguish hierarchy levels |
| **Merge Threshold** | $0.80$ | Confidence required to group |
| **Overlap Bonus** | $+0.4$ | Fix broken/fragmented lines |

This hybrid approach ensures that Mediator produces structurally semantically correct PPTX outputs that respect the original design intent.
