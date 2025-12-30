import { createSignal, Show, Match, Switch, For } from 'solid-js';
import AddressSearch from './components/AddressSearch';
import Map from './components/Map';
import PropertyCanvas from './components/PropertyCanvas';
import { AI_MODELS } from './api/openrouter';

export default function App() {
  const [selectedAddress, setSelectedAddress] = createSignal(null);
  const [showParcels, setShowParcels] = createSignal(true);
  const [viewMode, setViewMode] = createSignal('search'); // 'search' | 'property'

  // AI settings
  const [selectedModel, setSelectedModel] = createSignal('gemini-3-pro-image');
  const [gardenStyle, setGardenStyle] = createSignal('modern scandinavian');
  const [triggerGenerate, setTriggerGenerate] = createSignal(0);
  const [mapType, setMapType] = createSignal('ortho'); // 'ortho' | 'topo'
  const [aiMode, setAiMode] = createSignal('current'); // 'current' | 'design'
  const [debugMode, setDebugMode] = createSignal(false);
  const [annotations, setAnnotations] = createSignal([]);

  const handleAddressSelect = (address) => {
    setAnnotations([]); // Clear annotations when selecting new address
    setSelectedAddress(address);
    // Auto-navigate to property view when address selected
    setViewMode('property');
    // AI generation is auto-triggered in PropertyCanvas when images are ready
  };

  const handleBackToSearch = () => {
    setViewMode('search');
    setSelectedAddress(null);
  };

  const handleGenerateDesign = () => {
    setTriggerGenerate(t => t + 1);
  };

  const mapCenter = () => {
    const addr = selectedAddress();
    if (addr && addr.lat && addr.lon) {
      return {
        lat: addr.lat,
        lon: addr.lon,
        text: addr.text,
      };
    }
    return null;
  };

  const gardenStyles = [
    { value: 'modern scandinavian', label: 'Moderne skandinavisk' },
    { value: 'traditional norwegian', label: 'Tradisjonell norsk' },
    { value: 'cottage garden', label: 'Cottage hage' },
    { value: 'minimalist zen', label: 'Minimalistisk zen' },
    { value: 'wildlife friendly', label: 'Naturvennlig' },
  ];

  return (
    <div class="app">
      <Show when={viewMode() === 'property'}>
        <header class="header">
          <button class="back-button" onClick={handleBackToSearch}>
            ← Back
          </button>
          <h1>PlotCraft</h1>
        </header>
      </Show>

      <main class="main">
        <Switch>
          {/* Search mode - clean homepage */}
          <Match when={viewMode() === 'search'}>
            <div class="search-page">
              <div class="search-hero">
                <div class="logo-mark">PlotCraft</div>
                <p class="tagline">Skriv inn adressen din for å komme i gang</p>
                <div class="search-wrapper">
                  <AddressSearch onSelect={handleAddressSelect} />
                </div>
              </div>
            </div>
          </Match>

          {/* Property mode */}
          <Match when={viewMode() === 'property'}>
            <div class="map-container">
              <PropertyCanvas
                center={mapCenter()}
                showParcels={showParcels()}
                aiModel={selectedModel()}
                aiMode={aiMode()}
                gardenStyle={gardenStyle()}
                triggerGenerate={triggerGenerate()}
                mapType={mapType()}
                debugMode={debugMode()}
                annotations={annotations()}
                onAnnotationsChange={setAnnotations}
              />
            </div>

            <aside class="sidebar property-sidebar">
              <div class="property-info">
                <h2>Din eiendom</h2>
                <p class="property-address">{selectedAddress()?.text}</p>
                <p class="property-details">
                  {selectedAddress()?.postalCode} {selectedAddress()?.postalPlace}
                </p>
                <Show when={selectedAddress()?.gardsnummer}>
                  <p class="property-gnr">
                    Gnr/Bnr: {selectedAddress()?.gardsnummer}/{selectedAddress()?.bruksnummer}
                  </p>
                </Show>
              </div>

              {/* Feedback section - always visible */}
              <div class="feedback-section">
                <h3>Juster design</h3>
                <p class="feedback-hint">
                  Bruk verktøyene for å markere endringer på bildet
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
                            {annotation.type === 'arrow' && (annotation.text || 'Pil')}
                            {annotation.type === 'path' && 'Strek'}
                            {annotation.type === 'highlight' && 'Markert område'}
                            {annotation.type === 'text' && (annotation.text || 'Tekst')}
                          </span>
                        </div>
                      )}
                    </For>
                  </div>
                  <button class="regenerate-btn" onClick={handleGenerateDesign}>
                    Generer ny versjon
                  </button>
                </Show>
              </div>

              {/* Debug mode toggle */}
              <div class="debug-toggle">
                <input
                  type="checkbox"
                  id="debug-mode"
                  checked={debugMode()}
                  onChange={(e) => setDebugMode(e.target.checked)}
                />
                <label for="debug-mode">Debug mode</label>
              </div>

              {/* AI controls - only visible in debug mode */}
              <Show when={debugMode()}>
                <div class="ai-controls">
                  <h3>AI Hagedesign</h3>

                  <div class="control-group">
                    <label>Modus</label>
                    <div class="map-type-toggle">
                      <button
                        class={aiMode() === 'current' ? 'active' : ''}
                        onClick={() => setAiMode('current')}
                      >
                        Kartlegg
                      </button>
                      <button
                        class={aiMode() === 'design' ? 'active' : ''}
                        onClick={() => setAiMode('design')}
                      >
                        Design
                      </button>
                    </div>
                  </div>

                  <div class="control-group">
                    <label>Karttype</label>
                    <div class="map-type-toggle">
                      <button
                        class={mapType() === 'ortho' ? 'active' : ''}
                        onClick={() => setMapType('ortho')}
                      >
                        Satellitt
                      </button>
                      <button
                        class={mapType() === 'topo' ? 'active' : ''}
                        onClick={() => setMapType('topo')}
                      >
                        Topo
                      </button>
                    </div>
                  </div>

                  <div class="control-group">
                    <label for="model-select">AI Modell</label>
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

                  <Show when={aiMode() === 'design'}>
                    <div class="control-group">
                      <label for="style-select">Hagestil</label>
                      <select
                        id="style-select"
                        value={gardenStyle()}
                        onChange={(e) => setGardenStyle(e.target.value)}
                      >
                        <For each={gardenStyles}>
                          {(style) => (
                            <option value={style.value}>{style.label}</option>
                          )}
                        </For>
                      </select>
                    </div>
                  </Show>

                  <button class="generate-btn" onClick={handleGenerateDesign}>
                    {aiMode() === 'current' ? 'Kartlegg hage' : 'Generer design'}
                  </button>
                </div>

                <div class="layer-controls">
                  <h3>Kartlag</h3>
                  <div class="layer-toggle">
                    <input
                      type="checkbox"
                      id="parcels-property"
                      checked={showParcels()}
                      onChange={(e) => setShowParcels(e.target.checked)}
                    />
                    <label for="parcels-property">Eiendomsgrenser</label>
                  </div>
                </div>
              </Show>
            </aside>
          </Match>
        </Switch>
      </main>
    </div>
  );
}
