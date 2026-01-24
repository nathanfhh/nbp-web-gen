# Video Mode

<TryItButton mode="video" prompt="A butterfly slowly takes off from a flower, sunlight through the wings creates a rainbow halo, background is a blurred garden" />

Video mode uses Google Veo 3.1 API to generate AI videos.

## Basic Usage

1. Select "Video" mode
2. Choose generation method
3. Enter video description
4. Set video parameters
5. Click "Generate"

## Generation Methods

Video mode offers four generation methods:

### Text to Video

The most basic method - generate videos purely from text descriptions.

### Frames to Video

Upload images as the video's start or end frames:

- **Start Frame** (required): The first frame of the video
- **End Frame** (optional): The last frame of the video
- **Loop Video**: If only uploading a start frame, you can create a looping video

### References to Video

Upload reference images to guide video generation:

- **Asset Reference**: Make objects/characters in the video similar to the reference
- **Style Reference**: Make the video style similar to the reference
- Click the tag on the image to toggle reference type
- Maximum 3 reference images
- **Prompt is required**: You must enter a text description when using reference images

::: warning Limitations
When using reference images:
- Model is locked to **Veo 3.1** (cannot use Fast model)
- Duration is locked to **8 seconds** (cannot change)
:::

### Extend Video

Select a video from your history to generate extended content.

::: info Limitations
- Only **720p** resolution videos can be used as extension sources
- Each video can only be extended **once** (chain extension not supported)
:::

## Video Parameters

### Model

- **Veo 3.1 Fast**: Faster generation, slightly lower quality
- **Veo 3.1**: High quality, requires more time

### Video Length

- **4 seconds**: Short clips, suitable for GIF-like use
- **6 seconds**: Medium length
- **8 seconds**: Standard length

### Resolution

- **720p**: Faster generation, smaller file size
- **1080p**: High quality
- **4K**: Ultra-high quality, requires more time

### Aspect Ratio

- **16:9**: Standard landscape
- **9:16**: Portrait (mobile-friendly)

## Prompt Tips

### Describe Motion

Videos need **dynamic** scene descriptions:

```
A butterfly slowly takes off from a flower,
sunlight through the wings creates a rainbow halo,
background is a blurred garden
```

### Cinematic Language

Using film terminology can achieve better results:

```
Slow motion close-up: water droplet falling from a leaf
Pan shot: path through the forest
Dolly shot: slowly approaching an ancient castle
```

### Style Specification

```
Cinematic quality, shallow depth of field,
warm golden light,
35mm film grain
```

### Negative Prompt

Video mode has a unique "Negative Prompt" feature that lets you specify elements you don't want in the video:

```
cartoon, painting, low quality, blurry, distorted
```

## Audio Prompts

Veo 3.1 supports generating video audio. You can configure three types of sound in the "Audio Prompts" tab:

### Dialogue

Make characters in the video speak specific content. Use **quotes** to indicate speech:

```
"This must be the key," he whispered
```

::: tip Tip
Use quotes for specific speech, and the model will attempt to have the character speak the quoted text.
:::

### Sound Effects

Describe specific sound effects in the video:

```
screeching tires, roaring engine
```

### Ambient Sound

Set the background sound for the scene:

```
a faint eerie hum in the background
```

::: warning About Audio Generation
**Currently, all generated videos will include audio** (cannot be disabled).

This is because the `generateAudio` parameter is **only supported by Vertex AI**, not the Gemini API used by this application. Vertex AI requires server-side authentication (Service Account), which is incompatible with a fully client-side application.

If you need silent video functionality, you'll need to remove the audio track using external video editing software.
:::

## Generation Time

Video generation typically takes 1-3 minutes, depending on:

- Video length
- Resolution
- Content complexity
- API load

You can do other things during generation and will be notified when complete.

## Cost Estimate

When configuring options, the interface displays a real-time cost estimate (price per second × video duration), helping you understand the cost before generating.

For actual pricing, see [Google AI Pricing](https://ai.google.dev/gemini-api/docs/pricing).

## Download and Share

Completed videos can be:

- Downloaded as MP4 file
- Previewed and played
- Saved to history

<TryItButton mode="video" prompt="A butterfly slowly takes off from a flower, sunlight through the wings creates a rainbow halo, background is a blurred garden" />

## Next Steps

- [Image Generation](./image-generation) - Generate key frames first
- [History](./history) - Manage generated videos
