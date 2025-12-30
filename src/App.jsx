import { createSignal, Show, Match, Switch, For, onMount, onCleanup } from 'solid-js';
import PropertyCanvas from './components/PropertyCanvas';
import { AI_MODELS } from './api/openrouter';

export default function App() {
  const [uploadedImage, setUploadedImage] = createSignal(null);
  const [viewMode, setViewMode] = createSignal('upload'); // 'upload' | 'render'
  const [isDragging, setIsDragging] = createSignal(false);

  // AI settings
  const [selectedModel, setSelectedModel] = createSignal('gemini-3-pro-image');
  const [triggerGenerate, setTriggerGenerate] = createSignal(0);
  const [debugMode, setDebugMode] = createSignal(false);
  const [annotations, setAnnotations] = createSignal([]);

  let fileInputRef;
  let dropZoneRef;

  // Handle file selection
  const handleFileSelect = (file) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedImage(e.target.result);
        setViewMode('render');
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle drag events
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  };

  // Handle paste from clipboard
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        handleFileSelect(file);
        break;
      }
    }
  };

  // Set up paste listener
  onMount(() => {
    document.addEventListener('paste', handlePaste);
  });

  onCleanup(() => {
    document.removeEventListener('paste', handlePaste);
  });

  const handleBackToUpload = () => {
    setViewMode('upload');
    setUploadedImage(null);
    setAnnotations([]);
  };

  const handleGenerateDesign = () => {
    setTriggerGenerate(t => t + 1);
  };

  return (
    <div class="app">
      <Show when={viewMode() === 'render'}>
        <header class="header">
          <button class="back-button" onClick={handleBackToUpload}>
            ← Back
          </button>
          <h1>RoomCraft</h1>
        </header>
      </Show>

      <main class="main">
        <Switch>
          {/* Upload mode - clean homepage */}
          <Match when={viewMode() === 'upload'}>
            <div class="upload-page">
              <div class="upload-hero">
                <h1 class="logo-mark">RoomCraft</h1>
                <p class="tagline">Transform floor plans into stunning 3D renders</p>

                <div
                  ref={dropZoneRef}
                  class={`upload-zone ${isDragging() ? 'dragging' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef?.click()}
                >
                  <div class="upload-icon">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M12 16V4m0 0L8 8m4-4l4 4" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M3 16v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </div>
                  <p class="upload-text">Drag and drop your floor plan here</p>
                  <p class="upload-subtext">or</p>
                  <button class="upload-btn">Choose file</button>
                  <p class="upload-hint">PNG, JPEG or AVIF, max 10 MB</p>
                  <p class="upload-paste-hint">You can also paste an image (Ctrl+V / Cmd+V)</p>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style="display: none"
                    onChange={(e) => handleFileSelect(e.target.files[0])}
                  />
                </div>
              </div>
            </div>
          </Match>

          {/* Render mode */}
          <Match when={viewMode() === 'render'}>
            <div class="map-container">
              <PropertyCanvas
                uploadedImage={uploadedImage()}
                aiModel={selectedModel()}
                triggerGenerate={triggerGenerate()}
                debugMode={debugMode()}
                annotations={annotations()}
                onAnnotationsChange={setAnnotations}
              />
            </div>

            <aside class="sidebar property-sidebar">
              <div class="property-info">
                <h2>Your Floor Plan</h2>
                <p class="property-details">
                  AI will transform this into a photorealistic 3D render
                </p>
              </div>

              {/* Feedback section - always visible */}
              <div class="feedback-section">
                <h3>Adjust Design</h3>
                <p class="feedback-hint">
                  Use the tools to mark changes on the image
                </p>
                <Show when={annotations().length > 0}>
                  <div class="annotations-list">
                    <For each={annotations()}>
                      {(annotation) => (
                        <div class="annotation-item-preview">
                          <span class="annotation-type-icon">
                            {annotation.type === 'arrow' && '→'}
                            {annotation.type === 'path' && '〰'}
                            {annotation.type === 'highlight' && '▢'}
                            {annotation.type === 'text' && 'T'}
                          </span>
                          <span class="annotation-text">
                            {annotation.type === 'arrow' && (annotation.text || 'Arrow')}
                            {annotation.type === 'path' && 'Line'}
                            {annotation.type === 'highlight' && 'Highlighted area'}
                            {annotation.type === 'text' && (annotation.text || 'Text')}
                          </span>
                        </div>
                      )}
                    </For>
                  </div>
                  <button class="regenerate-btn" onClick={handleGenerateDesign}>
                    Generate new version
                  </button>
                </Show>
              </div>

              {/* Debug mode toggle - dev only */}
              <Show when={import.meta.env.DEV}>
                <div class="debug-toggle">
                  <input
                    type="checkbox"
                    id="debug-mode"
                    checked={debugMode()}
                    onChange={(e) => setDebugMode(e.target.checked)}
                  />
                  <label for="debug-mode">Debug mode</label>
                </div>
              </Show>

              {/* AI controls - only visible in debug mode */}
              <Show when={import.meta.env.DEV && debugMode()}>
                <div class="ai-controls">
                  <h3>AI Settings</h3>

                  <div class="control-group">
                    <label for="model-select">AI Model</label>
                    <select
                      id="model-select"
                      value={selectedModel()}
                      onChange={(e) => setSelectedModel(e.target.value)}
                    >
                      <For each={Object.entries(AI_MODELS)}>
                        {([key, model]) => (
                          <option value={key}>
                            {model.name} - {model.description}
                          </option>
                        )}
                      </For>
                    </select>
                  </div>

                  <button class="generate-btn" onClick={handleGenerateDesign}>
                    Generate render
                  </button>
                </div>
              </Show>
            </aside>
          </Match>
        </Switch>
      </main>
    </div>
  );
}
