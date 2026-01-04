import { createSignal, createEffect, Show } from 'solid-js';
import { fetchPropertyParcel } from '../api/matrikkel';
import { generateGardenView } from '../api/openrouter';
import AnnotationLayer from './AnnotationLayer';

export default function PropertyCanvas(props) {
  let containerRef;
  let canvasRef;

  const [parcel, setParcel] = createSignal(null);
  const [mapImage, setMapImage] = createSignal(null);
  const [satelliteImage, setSatelliteImage] = createSignal(null); // Store satellite for AI
  const [topoImage, setTopoImage] = createSignal(null); // Store topo for AI
  const [compositeImage, setCompositeImage] = createSignal(null); // Combined satellite + topo
  const [loading, setLoading] = createSignal(true);
  const [loadingStatus, setLoadingStatus] = createSignal('');
  const [error, setError] = createSignal(null);
  const [zoom, setZoom] = createSignal(1);
  const [pan, setPan] = createSignal({ x: 0, y: 0 });

  // AI state
  const [aiGenerating, setAiGenerating] = createSignal(false);
  const [aiResponse, setAiResponse] = createSignal(null);
  const [aiError, setAiError] = createSignal(null);
  const [aiProgress, setAiProgress] = createSignal(0); // 0-100 progress simulation

  // Annotation state
  let annotationLayerRef = null;
  let aiImageRef = null; // Reference to the AI-generated image element
  const [userFeedback, setUserFeedback] = createSignal(null);

  // Capture the AI image with annotations baked in
  const captureAnnotatedImage = async () => {
    const currentImage = aiResponse()?.image;
    const annotations = props.annotations || [];

    if (!currentImage || annotations.length === 0) {
      return currentImage; // Return clean image if no annotations
    }

    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      const ctx = canvas.getContext('2d');

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // Draw the AI image as base
        ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

        // Draw annotations on top
        const scale = CANVAS_SIZE / 100; // Convert from 0-100 viewBox to pixels

        annotations.forEach(annotation => {
          ctx.strokeStyle = '#e63946';
          ctx.fillStyle = '#e63946';
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          if (annotation.type === 'arrow') {
            // Draw arrow line
            ctx.beginPath();
            ctx.moveTo(annotation.fromX * scale, annotation.fromY * scale);
            ctx.lineTo(annotation.toX * scale, annotation.toY * scale);
            ctx.stroke();

            // Draw arrowhead
            const angle = Math.atan2(
              annotation.toY - annotation.fromY,
              annotation.toX - annotation.fromX
            );
            const headLength = 20;
            ctx.beginPath();
            ctx.moveTo(annotation.toX * scale, annotation.toY * scale);
            ctx.lineTo(
              annotation.toX * scale - headLength * Math.cos(angle - Math.PI / 6),
              annotation.toY * scale - headLength * Math.sin(angle - Math.PI / 6)
            );
            ctx.lineTo(
              annotation.toX * scale - headLength * Math.cos(angle + Math.PI / 6),
              annotation.toY * scale - headLength * Math.sin(angle + Math.PI / 6)
            );
            ctx.closePath();
            ctx.fill();

            // Draw text label if present
            if (annotation.text) {
              ctx.font = 'bold 16px sans-serif';
              ctx.fillStyle = '#e63946';
              ctx.fillText(annotation.text, annotation.fromX * scale + 5, annotation.fromY * scale - 10);
            }
          } else if (annotation.type === 'path' && annotation.points?.length > 1) {
            ctx.beginPath();
            annotation.points.forEach((point, i) => {
              if (i === 0) ctx.moveTo(point.x * scale, point.y * scale);
              else ctx.lineTo(point.x * scale, point.y * scale);
            });
            ctx.stroke();
          } else if (annotation.type === 'highlight' && annotation.points?.length > 1) {
            // Spray paint style - thick semi-transparent stroke
            ctx.strokeStyle = 'rgba(230, 57, 70, 0.5)';
            ctx.lineWidth = 25;
            ctx.beginPath();
            annotation.points.forEach((point, i) => {
              if (i === 0) ctx.moveTo(point.x * scale, point.y * scale);
              else ctx.lineTo(point.x * scale, point.y * scale);
            });
            ctx.stroke();
          } else if (annotation.type === 'text') {
            ctx.font = 'bold 16px sans-serif';
            ctx.fillStyle = '#e63946';
            ctx.fillText(annotation.text || '', annotation.x * scale, annotation.y * scale);
          }
        });

        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(currentImage); // Fallback to original
      img.src = currentImage;
    });
  };

  // Canvas size
  const CANVAS_SIZE = 800;

  // Calculate bounds from polygon
  const getPolygonBounds = (polygon) => {
    if (!polygon || polygon.length === 0) return null;

    let minLon = Infinity, maxLon = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    for (const [lon, lat] of polygon) {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }

    // Add 10% padding
    const padLon = (maxLon - minLon) * 0.10;
    const padLat = (maxLat - minLat) * 0.10;

    return {
      minLon: minLon - padLon,
      maxLon: maxLon + padLon,
      minLat: minLat - padLat,
      maxLat: maxLat + padLat,
    };
  };

  // Convert lat/lon to Web Mercator (EPSG:3857)
  const toWebMercator = (lon, lat) => {
    const x = lon * 20037508.34 / 180;
    const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
    const yMeters = y * 20037508.34 / 180;
    return { x, y: yMeters };
  };

  // Build WMS URL for the bounding box
  const buildMapUrl = (bounds) => {
    const sw = toWebMercator(bounds.minLon, bounds.minLat);
    const ne = toWebMercator(bounds.maxLon, bounds.maxLat);

    // Use the open topo4 WMS or cache tiles
    // Try using the cache tiles by calculating the appropriate tile
    const params = new URLSearchParams({
      SERVICE: 'WMS',
      VERSION: '1.1.1',
      REQUEST: 'GetMap',
      FORMAT: 'image/png',
      TRANSPARENT: 'false',
      LAYERS: 'topo4_WMS',
      SRS: 'EPSG:3857',
      STYLES: '',
      WIDTH: CANVAS_SIZE.toString(),
      HEIGHT: CANVAS_SIZE.toString(),
      BBOX: `${sw.x},${sw.y},${ne.x},${ne.y}`,
    });

    return `https://openwms.statkart.no/skwms1/wms.topo4?${params}`;
  };

  // Tile URL templates for different map types
  const TILE_SOURCES = {
    topo: (z, y, x) => `https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/${z}/${y}/${x}.png`,
    // Norge i Bilder - official Norwegian orthophotos, 25cm resolution!
    ortho: (z, y, x) => `https://opencache.statkart.no/gatekeeper/gk/gk.open_nib_web_mercator_wmts_v2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=Nibcache_web_mercator_v2&STYLE=default&FORMAT=image/png&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`,
    // ESRI fallback (lower resolution but global)
    esri: (z, y, x) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  };

  // Alternative: use cache tiles and stitch them
  const fetchMapTiles = async (bounds, mapType = 'ortho') => {
    // Calculate tile coordinates for zoom level 18
    const zoom = 18;
    const n = Math.pow(2, zoom);

    const lonToTileX = (lon) => Math.floor((lon + 180) / 360 * n);
    const latToTileY = (lat) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);

    const minTileX = lonToTileX(bounds.minLon);
    const maxTileX = lonToTileX(bounds.maxLon);
    const minTileY = latToTileY(bounds.maxLat); // Note: Y is inverted
    const maxTileY = latToTileY(bounds.minLat);

    // Create canvas to composite tiles
    const tilesX = maxTileX - minTileX + 1;
    const tilesY = maxTileY - minTileY + 1;
    const tileSize = 256;

    const canvas = document.createElement('canvas');
    canvas.width = tilesX * tileSize;
    canvas.height = tilesY * tileSize;
    const ctx = canvas.getContext('2d');

    // Get tile URL function based on map type
    const getTileUrl = TILE_SOURCES[mapType] || TILE_SOURCES.topo;

    // Fetch and draw each tile
    const tilePromises = [];
    for (let y = minTileY; y <= maxTileY; y++) {
      for (let x = minTileX; x <= maxTileX; x++) {
        const url = getTileUrl(zoom, y, x);
        const tileX = (x - minTileX) * tileSize;
        const tileY = (y - minTileY) * tileSize;

        const promise = new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            ctx.drawImage(img, tileX, tileY);
            resolve();
          };
          img.onerror = () => {
            // Fill with placeholder on error
            ctx.fillStyle = '#f5f0e6';
            ctx.fillRect(tileX, tileY, tileSize, tileSize);
            resolve();
          };
          img.src = url;
        });
        tilePromises.push(promise);
      }
    }

    await Promise.all(tilePromises);

    // Calculate the pixel bounds within the tile grid
    const tileToLon = (x) => x / n * 360 - 180;
    const tileToLat = (y) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;

    const gridMinLon = tileToLon(minTileX);
    const gridMaxLon = tileToLon(maxTileX + 1);
    const gridMaxLat = tileToLat(minTileY);
    const gridMinLat = tileToLat(maxTileY + 1);

    // Crop to our exact bounds
    const cropX = ((bounds.minLon - gridMinLon) / (gridMaxLon - gridMinLon)) * canvas.width;
    const cropY = ((gridMaxLat - bounds.maxLat) / (gridMaxLat - gridMinLat)) * canvas.height;
    const cropW = ((bounds.maxLon - bounds.minLon) / (gridMaxLon - gridMinLon)) * canvas.width;
    const cropH = ((bounds.maxLat - bounds.minLat) / (gridMaxLat - gridMinLat)) * canvas.height;

    // Create final cropped canvas
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = CANVAS_SIZE;
    finalCanvas.height = CANVAS_SIZE;
    const finalCtx = finalCanvas.getContext('2d');

    finalCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

    return finalCanvas.toDataURL('image/png');
  };

  // Create composite image: satellite base + topo overlay
  const createCompositeImage = (satelliteUrl, topoUrl) => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      const ctx = canvas.getContext('2d');

      const satImg = new Image();
      const topoImg = new Image();
      let loadedCount = 0;

      const onLoad = () => {
        loadedCount++;
        if (loadedCount === 2) {
          // Draw satellite as base
          ctx.drawImage(satImg, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

          // Draw topo on top with transparency (multiply blend for lines)
          ctx.globalAlpha = 0.4;
          ctx.globalCompositeOperation = 'multiply';
          ctx.drawImage(topoImg, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

          // Reset
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';

          resolve(canvas.toDataURL('image/png'));
        }
      };

      satImg.onload = onLoad;
      topoImg.onload = onLoad;
      satImg.onerror = () => resolve(satelliteUrl); // Fallback to just satellite
      topoImg.onerror = () => resolve(satelliteUrl);

      satImg.src = satelliteUrl;
      topoImg.src = topoUrl;
    });
  };

  // Load property parcel and map
  const loadProperty = async (lat, lon) => {
    setLoading(true);
    setError(null);
    setAiResponse(null);
    setAiError(null);

    try {
      // Step 1: Fetch parcel geometry
      setLoadingStatus('Henter eiendomsgrenser...');
      const parcelData = await fetchPropertyParcel(lat, lon);
      setParcel(parcelData);

      // Step 2: Fetch map tiles for the parcel bounds
      setLoadingStatus('Laster kartdata...');
      const bounds = getPolygonBounds(parcelData.polygon);

      // Fetch both satellite and topo in parallel for AI use
      const [satelliteUrl, topoUrl] = await Promise.all([
        fetchMapTiles(bounds, 'ortho'),
        fetchMapTiles(bounds, 'topo')
      ]);

      setSatelliteImage(satelliteUrl); // Store satellite for AI
      setTopoImage(topoUrl); // Store topo for AI

      // Create composite image for AI (satellite + topo overlay)
      const compositeUrl = await createCompositeImage(satelliteUrl, topoUrl);
      setCompositeImage(compositeUrl);

      setMapImage(props.mapType === 'topo' ? topoUrl : satelliteUrl);

      setLoading(false);
    } catch (err) {
      console.error('Failed to load property:', err);
      setError(err.message || 'Kunne ikke laste eiendomsdata');
      setLoading(false);
    }
  };

  // Load when center changes
  createEffect(() => {
    const center = props.center;
    if (center?.lat && center?.lon) {
      loadProperty(center.lat, center.lon);
    }
  });

  // Reload map when mapType changes
  createEffect(() => {
    const mapTypeVal = props.mapType;
    const p = parcel();
    if (p && mapTypeVal) {
      const bounds = getPolygonBounds(p.polygon);
      setLoadingStatus('Bytter karttype...');
      fetchMapTiles(bounds, mapTypeVal).then(mapDataUrl => {
        setMapImage(mapDataUrl);
      });
    }
  });

  // Convert lat/lon to canvas pixel coordinates
  const toCanvasCoords = (lon, lat, bounds) => {
    const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * CANVAS_SIZE;
    const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * CANVAS_SIZE;
    return { x, y };
  };

  // Draw the property on canvas
  const drawProperty = () => {
    const p = parcel();
    const mapImg = mapImage();
    if (!p || !canvasRef) return;

    const ctx = canvasRef.getContext('2d');
    const bounds = getPolygonBounds(p.polygon);
    if (!bounds) return;

    // Clear canvas
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Draw map image if loaded
    if (mapImg) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
        drawOverlays(ctx, p, bounds);
      };
      img.src = mapImg;
    } else {
      // Fallback: plain background
      ctx.fillStyle = '#f5f0e6';
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      drawOverlays(ctx, p, bounds);
    }
  };

  // Draw polygon and other overlays
  const drawOverlays = (ctx, p, bounds) => {
    // Draw property polygon border
    ctx.beginPath();
    p.polygon.forEach(([lon, lat], i) => {
      const { x, y } = toCanvasCoords(lon, lat, bounds);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();

    // Semi-transparent fill
    ctx.fillStyle = 'rgba(45, 90, 39, 0.1)';
    ctx.fill();

    // Stroke boundary
    ctx.strokeStyle = '#2d5a27';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw center point
    const center = props.center;
    if (center) {
      const { x, y } = toCanvasCoords(center.lon, center.lat, bounds);
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#2d5a27';
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw scale bar
    drawScaleBar(ctx, bounds);
  };

  // Draw scale bar
  const drawScaleBar = (ctx, bounds) => {
    const latMid = (bounds.minLat + bounds.maxLat) / 2;
    const metersPerDegreeLon = 111320 * Math.cos(latMid * Math.PI / 180);
    const metersPerPixel = ((bounds.maxLon - bounds.minLon) * metersPerDegreeLon) / CANVAS_SIZE;

    const targetPixels = 100;
    const targetMeters = metersPerPixel * targetPixels;
    const niceMeters = Math.pow(10, Math.floor(Math.log10(targetMeters)));
    const scalePixels = niceMeters / metersPerPixel;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(20, CANVAS_SIZE - 40, scalePixels + 20, 25);

    ctx.fillStyle = 'white';
    ctx.fillRect(30, CANVAS_SIZE - 30, scalePixels, 5);

    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'white';
    ctx.fillText(`${niceMeters}m`, 30, CANVAS_SIZE - 22);
  };

  // Redraw when data changes
  createEffect(() => {
    const p = parcel();
    const img = mapImage();
    if (p && img) {
      setTimeout(drawProperty, 50);
    }
  });

  // Watch for AI generation trigger
  const [lastTrigger, setLastTrigger] = createSignal(0);
  createEffect(() => {
    const trigger = props.triggerGenerate;
    const sat = satelliteImage();
    const topo = topoImage();
    if (trigger > 0 && trigger !== lastTrigger() && sat && topo) {
      setLastTrigger(trigger);
      generateAiDesign();
    }
  });

  // Auto-generate when images are loaded (for non-debug mode)
  const [hasAutoGenerated, setHasAutoGenerated] = createSignal(false);

  // Reset auto-generate flag when center changes (new property)
  createEffect(() => {
    const center = props.center;
    if (center) {
      setHasAutoGenerated(false);
    }
  });

  createEffect(() => {
    const sat = satelliteImage();
    const topo = topoImage();
    const isLoading = loading();

    // Auto-generate once when both images are ready and not in debug mode
    if (sat && topo && !isLoading && !hasAutoGenerated() && !props.debugMode) {
      setHasAutoGenerated(true);
      generateAiDesign();
    }
  });

  // Composite: actual topo as base + AI vegetation overlay
  const compositeTopoWithVegetation = async (topoBase, vegetationOverlay) => {
    console.log('=== COMPOSITING DEBUG ===');
    console.log('Topo base:', topoBase ? `${topoBase.substring(0, 80)}... (length: ${topoBase.length})` : 'NULL/UNDEFINED');
    console.log('Vegetation:', vegetationOverlay ? `${vegetationOverlay.substring(0, 80)}... (length: ${vegetationOverlay.length})` : 'NULL/UNDEFINED');

    // If no topo, return vegetation as-is
    if (!topoBase || !topoBase.startsWith('data:')) {
      console.error('Invalid topo base - returning vegetation only');
      return vegetationOverlay;
    }

    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      const ctx = canvas.getContext('2d');

      const baseImg = new Image();
      const overlayImg = new Image();
      let baseLoaded = false;
      let overlayLoaded = false;
      let baseError = false;
      let overlayError = false;

      const tryComposite = () => {
        if (baseLoaded && overlayLoaded) {
          console.log('Both flags set - baseError:', baseError, 'overlayError:', overlayError);

          // First draw topo as base (if loaded successfully)
          if (!baseError) {
            console.log('Drawing topo base, dimensions:', baseImg.width, 'x', baseImg.height);
            ctx.drawImage(baseImg, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
          } else {
            console.error('Topo base failed - drawing white background');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
          }

          // Then draw AI vegetation overlay on top
          if (!overlayError) {
            console.log('Drawing vegetation overlay, dimensions:', overlayImg.width, 'x', overlayImg.height);
            ctx.drawImage(overlayImg, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
          } else {
            console.error('Vegetation overlay failed to load');
          }

          const result = canvas.toDataURL('image/png');
          console.log('Composite complete, result length:', result.length);
          resolve(result);
        }
      };

      baseImg.onload = () => {
        console.log('Topo base loaded successfully:', baseImg.width, 'x', baseImg.height);
        baseLoaded = true;
        tryComposite();
      };
      overlayImg.onload = () => {
        console.log('Vegetation overlay loaded successfully:', overlayImg.width, 'x', overlayImg.height);
        overlayLoaded = true;
        tryComposite();
      };
      baseImg.onerror = (e) => {
        console.error('FAILED to load topo base image:', e);
        baseLoaded = true;
        baseError = true;
        tryComposite();
      };
      overlayImg.onerror = (e) => {
        console.error('FAILED to load vegetation overlay:', e);
        overlayLoaded = true;
        overlayError = true;
        tryComposite();
      };

      console.log('Setting image sources...');
      baseImg.src = topoBase;
      overlayImg.src = vegetationOverlay;
    });
  };

  // Generate AI design from canvas
  const generateAiDesign = async () => {
    const satImg = satelliteImage();
    const topoImg = topoImage();

    console.log('=== GENERATE AI DESIGN ===');
    console.log('Satellite image available:', !!satImg, satImg?.length);
    console.log('Topo image available:', !!topoImg, topoImg?.length);
    console.log('Annotations:', props.annotations);

    if (!satImg || !topoImg) {
      setAiError('Mangler kartbilder');
      return;
    }

    setAiGenerating(true);
    setAiError(null);
    setAiProgress(0);

    // Simulate progress during AI generation (typical 30-40s)
    const progressInterval = setInterval(() => {
      setAiProgress(prev => {
        // Slow down as we approach 90% (never reach 100 until done)
        if (prev < 30) return prev + 2;
        if (prev < 60) return prev + 1;
        if (prev < 85) return prev + 0.5;
        if (prev < 95) return prev + 0.2;
        return prev;
      });
    }, 500);

    try {
      // Build feedback from annotations if any exist
      const annotations = props.annotations || [];
      let feedbackText = '';
      let annotatedImage = null;

      if (annotations.length > 0) {
        // Capture the AI image with annotations baked in
        annotatedImage = await captureAnnotatedImage();
        console.log('Captured annotated image:', !!annotatedImage);

        const feedbackParts = annotations
          .map(a => {
            if (a.type === 'arrow' && a.text) {
              return `Arrow pointing at area: "${a.text}"`;
            } else if (a.type === 'path') {
              return `Red line marking an area that needs attention`;
            } else if (a.type === 'highlight') {
              return `Highlighted/spray-painted area that needs changes`;
            } else if (a.type === 'text' && a.text) {
              return `Text note: "${a.text}"`;
            }
            return null;
          })
          .filter(Boolean);

        if (feedbackParts.length > 0) {
          feedbackText = feedbackParts.join('. ');
        }
      }

      console.log('Calling generateGardenView with model:', props.aiModel);
      console.log('Feedback text:', feedbackText);
      console.log('Has annotated image:', !!annotatedImage);

      const result = await generateGardenView(satImg, topoImg, props.aiModel, {
        mode: props.aiMode || 'current',
        style: props.gardenStyle,
        features: ['lawn', 'flower beds', 'patio', 'pathways'],
        season: 'summer',
        feedback: feedbackText || undefined,
        previousImage: annotatedImage || undefined // Now passes the image WITH annotations drawn on it
      });

      console.log('AI Result:', {
        hasImage: !!result.image,
        imageLength: result.image?.length,
        imageStart: result.image?.substring(0, 50),
        hasDescription: !!result.description,
        model: result.model
      });

      setAiProgress(100);
      setAiResponse(result);

      // Clear annotations after successful regeneration (they've been incorporated)
      if (annotations.length > 0 && result.image) {
        props.onAnnotationsChange?.([]);
      }
    } catch (err) {
      console.error('AI generation failed:', err);
      setAiError(err.message || 'Kunne ikke generere hageforslag');
    } finally {
      clearInterval(progressInterval);
      setAiGenerating(false);
    }
  };

  // Close AI response panel
  const closeAiResponse = () => {
    setAiResponse(null);
  };

  // Regenerate with user feedback/annotations
  const regenerateWithFeedback = async () => {
    if (!annotationLayerRef) return;

    const satImg = satelliteImage();
    const topoImg = topoImage();
    if (!satImg || !topoImg) return;

    setAiGenerating(true);
    setAiError(null);

    try {
      // Get annotated image and annotations
      const annotatedImage = await annotationLayerRef.getAnnotatedImage();
      const annotations = annotationLayerRef.getAnnotations();

      // Build feedback description from annotations
      const feedbackText = annotations
        .filter(a => a.type === 'text')
        .map(a => a.text)
        .join(', ');

      // Call AI with the annotated image as additional context
      const result = await generateGardenView(satImg, topoImg, props.aiModel, {
        mode: props.aiMode || 'current',
        style: props.gardenStyle,
        features: ['lawn', 'flower beds', 'patio', 'pathways'],
        season: 'summer',
        feedback: feedbackText,
        previousImage: annotatedImage
      });

      setAiResponse(result);
    } catch (err) {
      console.error('Regeneration failed:', err);
      setAiError(err.message || 'Could not regenerate');
    } finally {
      setAiGenerating(false);
    }
  };

  // Zoom handlers
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.5, Math.min(5, zoom() * delta));
    setZoom(newZoom);
  };

  // Pan handlers
  let isDragging = false;
  let lastPos = { x: 0, y: 0 };

  const handleMouseDown = (e) => {
    isDragging = true;
    lastPos = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastPos.x;
    const dy = e.clientY - lastPos.y;
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
    lastPos = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDragging = false;
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div
      ref={containerRef}
      class="property-canvas-container"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Show loading while fetching property */}
      <Show when={loading() && !aiGenerating()}>
        <div class="property-loading">
          <div class="spinner"></div>
          <p>{loadingStatus()}</p>
        </div>
      </Show>

      {/* Enhanced AI generation loading with progress */}
      <Show when={aiGenerating()}>
        <div class="ai-loading-overlay">
          <div class="ai-loading-card">
            <div class="ai-loading-icon">
              <svg viewBox="0 0 100 100" class="progress-ring">
                <circle class="progress-ring-bg" cx="50" cy="50" r="42" />
                <circle
                  class="progress-ring-fill"
                  cx="50"
                  cy="50"
                  r="42"
                  style={{
                    'stroke-dasharray': `${2 * Math.PI * 42}`,
                    'stroke-dashoffset': `${2 * Math.PI * 42 * (1 - aiProgress() / 100)}`
                  }}
                />
              </svg>
              <span class="progress-text">{Math.round(aiProgress())}%</span>
            </div>
            <h3>Genererer hageplan</h3>
            <p class="ai-loading-hint">
              {aiProgress() < 20 && 'Finner frem akvarellene...'}
              {aiProgress() >= 20 && aiProgress() < 40 && 'Blander grønnfarger...'}
              {aiProgress() >= 40 && aiProgress() < 60 && 'Planter virtuelle busker...'}
              {aiProgress() >= 60 && aiProgress() < 80 && 'Vanner gressplenen...'}
              {aiProgress() >= 80 && 'Siste finpuss med hagegnomer...'}
            </p>
          </div>
        </div>
      </Show>

      <Show when={error()}>
        <div class="property-error">
          <p>{error()}</p>
          <button onClick={() => loadProperty(props.center?.lat, props.center?.lon)}>
            Prøv igjen
          </button>
        </div>
      </Show>

      {/* Only show canvas in debug mode when AI is not generating */}
      <Show when={parcel() && mapImage() && !loading() && !aiGenerating() && !aiResponse()?.image && props.debugMode}>
        <div
          class="property-canvas-wrapper"
          style={{
            transform: `translate(${pan().x}px, ${pan().y}px) scale(${zoom()})`,
          }}
        >
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            class="property-canvas"
          />
        </div>

        <div class="property-canvas-info-panel">
          <div class="parcel-info">
            <strong>{parcel().matrikkelnummer}</strong>
            <Show when={parcel().area}>
              <span>{Math.round(parcel().area)} m²</span>
            </Show>
          </div>
        </div>
      </Show>

      <Show when={props.debugMode}>
        <div class="property-canvas-controls">
          <button onClick={() => setZoom(z => Math.min(5, z * 1.2))} title="Zoom inn">+</button>
          <button onClick={() => setZoom(z => Math.max(0.5, z / 1.2))} title="Zoom ut">−</button>
          <button onClick={resetView} title="Tilbakestill">⟲</button>
        </div>

        <div class="property-canvas-info">
          <span>Zoom: {Math.round(zoom() * 100)}%</span>
        </div>
      </Show>


      {/* AI Error */}
      <Show when={aiError()}>
        <div class="ai-response-panel">
          <div class="ai-response-header" style={{ background: '#c00' }}>
            <h4>Feil</h4>
            <button onClick={() => setAiError(null)}>×</button>
          </div>
          <div class="ai-response-content">
            {aiError()}
          </div>
        </div>
      </Show>

      {/* AI Generated Image - fullscreen centered with annotation layer */}
      <Show when={aiResponse()?.image}>
        <div class="ai-image-fullscreen">
          <img src={aiResponse()?.image} alt="Generated garden plan" />
          <AnnotationLayer
            initialAnnotations={props.annotations}
            onAnnotationsChange={(annotations) => props.onAnnotationsChange?.(annotations)}
          />
          <Show when={props.debugMode}>
            <button class="ai-close-btn" onClick={closeAiResponse}>×</button>
          </Show>
        </div>
      </Show>

      {/* AI Text Response (fallback if no image) */}
      <Show when={aiResponse() && !aiResponse()?.image && aiResponse()?.description}>
        <div class="ai-response-panel">
          <div class="ai-response-header">
            <h4>Hageforslag fra {aiResponse()?.model}</h4>
            <button onClick={closeAiResponse}>×</button>
          </div>
          <div class="ai-response-content">
            {aiResponse()?.description}
          </div>
        </div>
      </Show>
    </div>
  );
}
