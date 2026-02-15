# API Key Management

Mediator supports a dual API Key architecture to help you use API quota more efficiently.

## Video Tutorial: How to Get an API Key

<iframe width="100%" style="aspect-ratio: 16/9;" src="https://www.youtube.com/embed/BLqoM78ISdw" title="How to Get Gemini API Key" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>

This video shows you how to get an API Key and link your Google Cloud account. First-time users receive **$300 in free credits** that can be used with all Mediator features (image generation, video generation, etc.) and other Google AI APIs.

## Single API Key

The simplest setup:

1. Open settings
2. Enter your Key in the "API Key" field
3. All features will use this Key

## Dual API Key Mode

If you have both paid and free accounts, you can set up two Keys:

### Primary Key (Paid)

Used for operations that consume more quota:

- Image generation
- Video generation

### Free Tier Key

Used for text processing operations:

- Character extraction
- Slide style analysis
- Search embedding encoding (when using the Gemini engine)
- Other text processing

::: warning Privacy Notice
Google may use Free Tier API Key inputs and outputs to improve its products and models. If you have privacy concerns, use only a paid API Key, or choose the Local engine for search.
:::

## Setup Method

1. Open settings panel
2. Expand "Advanced API Settings"
3. Enter both Keys separately

## Auto-Switch Logic

```
Text processing request:
  1. Try using Free Tier Key
  2. If 429 error (free tier quota exhausted)
  3. Auto-switch to paid Key
  4. Retry Free Tier Key after 1 hour

Image/Video generation:
  → Always use paid Key (no fallback)
```

## Quota Status

The settings panel shows whether each Key is configured.

When the Free Tier Key quota is exhausted, the system automatically switches to the paid Key to continue processing without manual intervention. After 1 hour, the system will automatically retry using the Free Tier Key.

::: info Quota Exhaustion Detection
The system detects quota exhaustion based on:
- HTTP status code 429 (Too Many Requests)
- Error messages containing "quota", "rate limit", "exhausted", etc.
:::

## Security

Your API Keys are stored in browser localStorage:

- **Not** uploaded to any server
- **Not** accessible by other websites
- Clearing browser data will delete Keys

::: tip Recommendation
Regularly rotate API Keys and monitor usage in Google AI Studio.
:::

## FAQ

### Q: Keep getting 429 errors?

A: This means API quota is exhausted. You can:
1. Wait for quota reset (usually daily or per minute)
2. Use a paid account
3. Set up dual Key mode

### Q: Key shows as invalid?

A: Please check:
1. Key was copied correctly (no extra spaces)
2. Key hasn't been disabled in Google AI Studio
3. Key has correct API permissions

## Next Steps

- [Getting Started](./getting-started) - Get your first API Key
- [Video Generation](./video-generation) - Learn about video generation pricing
