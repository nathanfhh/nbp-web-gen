# Getting Started

In just a few minutes, you can start using Mediator for AI creation.

## Get an API Key

Mediator uses the Google AI Studio API. You need to get a free API Key first.

### Step 1: Go to Google AI Studio

1. Open [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account

### Step 2: Create an API Key

1. Click "Get API key" in the left menu
2. Click "Create API key"
3. Select a Google Cloud project (or create a new one)
4. Copy the generated API Key

::: danger Billing Account Required
Mediator uses the Gemini 3 Pro Image model (gemini-3-pro-image-preview) for image generation. This model has no free tier and requires enabling Billing on your Google Cloud project to use.

How to set up:

1. Go to [Google Cloud Console](https://console.cloud.google.com/billing)
2. Enable Billing for your project
3. Link a credit card or other payment method

We recommend setting a budget alert to avoid unexpected charges.
:::

::: warning Note
Keep your API Key safe. Don't share it with others or expose it publicly online.
:::

### Step 3: Set Up in Mediator

1. Open the Mediator app
2. Paste your Key in the "API Key" field
3. Click "Save API Key" to save

![API Key Setup](/images/api-key-setup.webp)

## Your First Image

After setting up your API Key, let's generate your first image:

1. Make sure the mode is "Generate" (default)
2. Enter a description in the prompt input, for example:

```
A cute orange cat sitting on a windowsill, with sunlight streaming in
```

3. Click the "Generate" button
4. Wait a few seconds, and your image will appear!

![Generation Result Example](/images/generation-result.webp)

After generation completes, images will appear in the "Generated Results" area. You can click on images to open the lightbox for viewing and downloading. All generation records are automatically saved to the "History" panel on the left.

For more detailed interface explanations, see [Generate Mode](./image-generation).

## Dual API Key Mode (Advanced)

If you have a paid account, you can set up two API Keys:

- **Primary Key**: For image and video generation (consumes more quota)
- **Free Tier Key**: For text processing (character extraction, style analysis, slide styling, slide content generation)

This helps save your paid quota. See [API Key Management](./api-key-management) for details.

## Next Steps

- [Image Generation](./image-generation) - Learn more generation options
- [Sticker Generation](./sticker-generation) - Create custom stickers
- [Video Generation](./video-generation) - Generate videos with Veo 3.1
