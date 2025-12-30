// OpenRouter API for AI image generation
// Uses serverless function in production, direct API in development
const API_URL = import.meta.env.DEV
  ? 'https://openrouter.ai/api/v1/chat/completions'
  : '/api/generate';

// Available models for garden visualization
export const AI_MODELS = {
  'gemini-3-pro-image': {
    id: 'google/gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image',
    description: 'Image generation'
  },
  'gemini-2.5-flash-image': {
    id: 'google/gemini-2.5-flash-image',
    name: 'Gemini 2.5 Flash Image',
    description: 'Fast image generation'
  },
  'llama-vision': {
    id: 'meta-llama/llama-3.2-11b-vision-instruct:free',
    name: 'Llama 3.2 Vision',
    description: 'Free, text only'
  },
  'gemini-2-flash': {
    id: 'google/gemini-2.0-flash-exp:free',
    name: 'Gemini 2.0 Flash',
    description: 'Free, text only'
  }
};

// Generate landscape architecture plan image from property photo
export async function generateGardenView(satelliteImage, topoImage, modelKey = 'gemini-3-pro-image', options = {}) {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;

  // Only require API key in dev mode (serverless function has it in prod)
  if (import.meta.env.DEV && !apiKey) {
    throw new Error('VITE_OPENROUTER_API_KEY not found in environment');
  }

  const model = AI_MODELS[modelKey];
  if (!model) {
    throw new Error(`Unknown model: ${modelKey}`);
  }

  const {
    mode = 'current', // 'current' = map existing, 'design' = create new design
    style = 'modern scandinavian',
    features = ['lawn', 'flower beds', 'patio', 'pathways'],
    season = 'summer',
    feedback = null, // User feedback from annotations
    previousImage = null // Previous AI image with annotations
  } = options;

  // Build prompt based on mode
  let prompt;
  if (mode === 'current') {
    prompt = `You are given two images of the same property:
1. FIRST IMAGE: Topographic map showing buildings, roads, property boundaries, and contour lines (1m height intervals)
2. SECOND IMAGE: Satellite/aerial photo showing vegetation (trees, grass, plants)

Create a HAND-DRAWN WATERCOLOR LANDSCAPE ARCHITECTURE PLAN combining both images.

CRITICAL - Use the TOPO map (FIRST image) as the PRIMARY reference for:
- Exact building footprints, shapes, and positions
- Property boundary lines
- Driveways, paths, and hardscaped areas
- Overall layout and orientation
- CONTOUR LINES: Each line represents 1 meter height difference. Use these to understand terrain slope and elevation changes. Show terrain variation through subtle shading or color gradients (darker greens in lower areas, lighter in higher areas)

From SATELLITE (second image), identify vegetation:
- Tree positions and approximate canopy sizes
- Lawn vs garden bed areas
- Hedge and shrub locations

ARTISTIC STYLE - Hand-drawn watercolor aesthetic:
- Buildings: Blue-gray watercolor wash roofs with subtle shading, black outline
- Lawn areas: Crosshatch pattern texture in warm green/olive tones
- Trees: Soft, organic watercolor blobs with varied greens (not solid circles), subtle shadows
- Shrubs/hedges: Loose, painterly green shapes with texture variation
- Driveways/paths: Light gray watercolor wash
- Garden beds: Warm earth tones with organic edges
- Overall: Soft edges, painterly texture, professional landscape architect hand-rendering style
- Paper texture: Subtle off-white/cream background showing through

Output requirements:
- ONE combined bird's-eye view image
- Match exact building positions from topo map
- NO legend, NO text labels, NO compass, NO scale bar
- Same orientation as input images`;
  } else {
    prompt = `You are given two images of the same property:
1. FIRST IMAGE: Satellite/aerial photo
2. SECOND IMAGE: Topographic map with buildings and contour lines

Create a NEW ${style} garden design for this property.

Requirements:
- Keep all existing buildings exactly as shown in topo
- Design new garden with: ${features.join(', ')}
- Design for ${season} appearance
- Bird's-eye view perspective
- Professional landscape architecture style
- NO legend or text labels`;
  }

  // Add feedback section if user provided annotations
  if (feedback && previousImage) {
    prompt = `You are making a SMALL, TARGETED modification to a landscape architecture design.

CRITICAL - KEEP EVERYTHING THE SAME EXCEPT:
- Only change VEGETATION (trees, plants, shrubs, flowers)
- Only change vegetation WHERE the user has drawn RED ANNOTATIONS
- Everything else must be PIXEL-PERFECT identical to the previous image

DO NOT CHANGE:
- Buildings, roofs, walls - keep exactly the same
- Paths, driveways, hardscaping - keep exactly the same
- Lawn areas not marked - keep exactly the same
- Overall composition, colors, style - keep exactly the same
- Any area WITHOUT red annotations - keep exactly the same

USER'S REQUEST (shown as red marks on the THIRD image):
${feedback}

OUTPUT REQUIREMENTS:
1. BIRD'S-EYE VIEW ONLY - top-down aerial view, exactly like the input
2. New vegetation must be drawn from DIRECTLY ABOVE (circular tree canopies, not side profiles)
3. The red annotations should NOT appear in output - they are instructions only
4. Match the exact watercolor hand-drawn style of the original

The goal is a MINIMAL change - 95%+ of the image stays identical. Only add/modify vegetation at the marked locations.`;
  }

  // Send both topo and satellite images to AI (topo first as primary reference)
  const content = [
    {
      type: 'text',
      text: prompt
    }
  ];

  // Add topo image first (primary reference for layout)
  if (topoImage) {
    content.push({
      type: 'image_url',
      image_url: {
        url: topoImage.startsWith('data:') ? topoImage : `data:image/png;base64,${topoImage}`
      }
    });
  }

  // Add satellite image second (for vegetation)
  content.push({
    type: 'image_url',
    image_url: {
      url: satelliteImage.startsWith('data:') ? satelliteImage : `data:image/png;base64,${satelliteImage}`
    }
  });

  // Add annotated previous image if user provided feedback
  if (previousImage) {
    content.push({
      type: 'image_url',
      image_url: {
        url: previousImage.startsWith('data:') ? previousImage : `data:image/png;base64,${previousImage}`
      }
    });
  }

  // In dev mode, call OpenRouter directly; in production, use serverless function
  const isDev = import.meta.env.DEV;

  const headers = {
    'Content-Type': 'application/json'
  };

  // Only add auth headers in dev mode (serverless function handles auth in prod)
  if (isDev) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'PlotCraft';
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model.id,
      messages: [
        {
          role: 'user',
          content: content
        }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  // Debug: log the full response
  console.log('OpenRouter response:', JSON.stringify(data, null, 2));

  if (!data.choices || data.choices.length === 0) {
    throw new Error('No response from AI model');
  }

  const message = data.choices[0].message;
  const responseContent = message.content;

  // Debug: log content structure
  console.log('Content type:', typeof responseContent);
  console.log('Content:', responseContent);

  // Check if response contains an image (base64 or inline_data)
  let generatedImage = null;
  let description = null;

  // Gemini image models return content as array with parts
  if (Array.isArray(responseContent)) {
    for (const part of responseContent) {
      console.log('Part:', part);
      if (part.type === 'image_url' && part.image_url) {
        generatedImage = part.image_url.url;
      } else if (part.type === 'image' && part.image_url) {
        generatedImage = part.image_url.url;
      } else if (part.image_url) {
        generatedImage = part.image_url.url || part.image_url;
      } else if (part.type === 'text') {
        description = part.text;
      } else if (part.inline_data) {
        generatedImage = `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
      } else if (typeof part === 'string') {
        description = (description || '') + part;
      }
    }
  } else if (typeof responseContent === 'string') {
    // Check for base64 image in response
    const base64Match = responseContent.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
    if (base64Match) {
      generatedImage = base64Match[0];
      description = responseContent.replace(base64Match[0], '').trim();
    } else {
      description = responseContent;
    }
  }

  // Check for images array (Gemini format) - capture ALL images
  const allImages = [];
  if (message.images && Array.isArray(message.images)) {
    console.log('Found images array:', message.images.length, 'images');
    for (const img of message.images) {
      if (img.type === 'image_url' && img.image_url?.url) {
        allImages.push(img.image_url.url);
        if (!generatedImage) {
          generatedImage = img.image_url.url;
        }
        console.log('Extracted image from images array');
      }
    }
  }

  // Also check message-level properties for image data
  if (!generatedImage && message.image) {
    generatedImage = message.image;
  }

  // Check for tool_calls or function_calls that might contain image
  if (!generatedImage && message.tool_calls) {
    console.log('Tool calls:', message.tool_calls);
  }

  console.log('Parsed - Image:', generatedImage ? 'Found' : 'Not found');
  console.log('Parsed - Description:', description?.substring(0, 100));

  return {
    image: generatedImage,
    images: allImages, // All returned images (base + vegetation layers)
    description: description,
    model: model.name,
    usage: data.usage,
    raw: data // Include raw response for debugging
  };
}

// Generate image with image generation model (if available)
export async function generateGardenImage(imageBase64, description, modelKey = 'gemini-2-flash') {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('VITE_OPENROUTER_API_KEY not found in environment');
  }

  const model = AI_MODELS[modelKey];

  const prompt = `Based on this bird's-eye view property map and the following garden design description, generate a beautiful realistic aerial visualization of the designed garden:

DESIGN DESCRIPTION:
${description}

Create a photorealistic bird's-eye view rendering showing the garden design implemented on this exact property. Maintain the same viewing angle and property boundaries as the input image.`;

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'PlotCraft'
    },
    body: JSON.stringify({
      model: model.id,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  return {
    content: data.choices[0].message.content,
    model: model.name
  };
}
