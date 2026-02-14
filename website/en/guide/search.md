# Smart Search

As your history grows, Smart Search helps you quickly find past generation results. It combines keyword matching with semantic understanding, so you can find relevant records even when you don't remember the exact prompt.

## Opening Search

Click the search button (🔍) above the history area to open the search panel.

![Search Panel](/images/search-modal.webp)

## Basic Usage

1. Type a keyword or description in the search box
2. Results appear in real time
3. Click a result to preview it in the lightbox

### Search Results

Each search result includes:

| Item | Description |
|------|-------------|
| Thumbnail | Preview of the generated result |
| Mode Tag | Generation mode (Generate, Sticker, Video, etc.) |
| Time | When it was generated |
| Snippet | Matching prompt excerpt with highlighted keywords |

## Search Strategies

Three search strategies are available for different use cases:

| Strategy | Description | Best For |
|----------|-------------|----------|
| Hybrid | Combines keyword + semantic search (default) | Most situations |
| Semantic | Pure meaning-based search, no exact match needed | "Find that image with a sunset" |
| Fulltext | Pure BM25 keyword matching | Searching for specific terms or names |

::: tip Tip
Hybrid search is the default strategy and works best in most cases. If your description is vague, try switching to semantic search.
:::

## Mode Filter

You can filter search results by generation mode:

- All
- Generate
- Sticker
- Edit
- Story
- Diagram
- Video
- Slides
- Agent

![Mode Filter](/images/search-mode-filter.webp)

## Sort Options

Search results support three sort orders:

| Sort | Description |
|------|-------------|
| Relevance | Sort by match quality (default) |
| Newest First | Sort by generation time, descending |
| Oldest First | Sort by generation time, ascending |

## First-Time Setup

When you first open the search panel, the system performs initialization:

1. **Download language model** — An AI model for semantic search (~33MB); progress is shown in the panel
2. **Build index** — Creates a search index for all history records

::: info Note
The language model only needs to be downloaded once and is cached in the browser. The index is persisted, so it won't need to be rebuilt next time.
:::

![Model Loading Progress](/images/search-model-loading.webp)

## Real-Time Sync

The search index automatically stays in sync with your history:

- **New records** — Automatically indexed after generation
- **Deleted records** — Removed from the index when deleted
- **Imported records** — Automatically indexed after import
- **Clear all** — Index cleared when history is cleared

You don't need to manage the index manually — the system handles it in the background.

## Preference Memory

Your search preferences are automatically saved, including:

- Last selected mode filter
- Last used search strategy
- Last used sort order

These settings are restored the next time you open the search panel.

## Multilingual Support

The search engine is specially optimized for CJK (Chinese, Japanese, Korean) text, with proper tokenization for accurate results. English and other languages are fully supported as well.

## Next Steps

- [History](./history) - Manage all generation records
- [Character Library](./character-library) - Create characters from history
