import { createSignal, createEffect, For, Index, Show } from 'solid-js';

export default function AnnotationLayer(props) {
  const [annotations, setAnnotations] = createSignal([]);
  const [isDrawing, setIsDrawing] = createSignal(false);
  const [currentShape, setCurrentShape] = createSignal(null);
  const [selectedId, setSelectedId] = createSignal(null);
  const [nextId, setNextId] = createSignal(1);
  const [activeTool, setActiveTool] = createSignal('select'); // 'select' | 'arrow' | 'path' | 'highlight' | 'text'

  // Dragging state
  const [dragging, setDragging] = createSignal(null);
  const [dragId, setDragId] = createSignal(null);
  const [dragOffset, setDragOffset] = createSignal({ x: 0, y: 0 });

  let containerRef;

  // Sync from parent when annotations are cleared externally (e.g., after regeneration)
  createEffect(() => {
    const parentAnnotations = props.initialAnnotations;
    // If parent passes empty array, clear local state
    if (parentAnnotations !== undefined && parentAnnotations.length === 0 && annotations().length > 0) {
      setAnnotations([]);
      setSelectedId(null);
    }
  });

  // Get mouse position relative to container (0-100 scale)
  const getMousePos = (e) => {
    if (!containerRef) return { x: 0, y: 0 };
    const rect = containerRef.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100
    };
  };

  // Start dragging an endpoint (for arrows)
  const startDragEndpoint = (id, endpoint, e) => {
    e.stopPropagation();
    setDragging(endpoint);
    setDragId(id);
    setSelectedId(id);
  };

  // Start dragging whole shape
  const startDragWhole = (id, e) => {
    e.stopPropagation();
    const pos = getMousePos(e);
    const shape = annotations().find(a => a.id === id);
    if (!shape) return;

    if (shape.type === 'arrow') {
      setDragOffset({ x: pos.x - shape.fromX, y: pos.y - shape.fromY });
    } else if (shape.type === 'path' && shape.points.length > 0) {
      setDragOffset({ x: pos.x - shape.points[0].x, y: pos.y - shape.points[0].y });
    } else if (shape.type === 'highlight' && shape.points?.length > 0) {
      setDragOffset({ x: pos.x - shape.points[0].x, y: pos.y - shape.points[0].y });
    } else if (shape.type === 'text') {
      setDragOffset({ x: pos.x - shape.x, y: pos.y - shape.y });
    }
    setDragging('whole');
    setDragId(id);
    setSelectedId(id);
  };

  // Handle mouse down - start drawing based on active tool
  const handleMouseDown = (e) => {
    if (e.target.closest('.annotation-item') || e.target.closest('.annotation-label') || e.target.closest('.annotation-toolbar')) return;

    const pos = getMousePos(e);

    // If select tool or no tool, just deselect
    if (!activeTool() || activeTool() === 'select') {
      setSelectedId(null);
      return;
    }

    setIsDrawing(true);
    setSelectedId(null);

    const id = nextId();

    if (activeTool() === 'arrow') {
      setCurrentShape({
        id,
        type: 'arrow',
        fromX: pos.x,
        fromY: pos.y,
        toX: pos.x,
        toY: pos.y,
        text: ''
      });
    } else if (activeTool() === 'path') {
      setCurrentShape({
        id,
        type: 'path',
        points: [{ x: pos.x, y: pos.y }],
        text: ''
      });
    } else if (activeTool() === 'highlight') {
      setCurrentShape({
        id,
        type: 'highlight',
        points: [{ x: pos.x, y: pos.y }],
        text: ''
      });
    } else if (activeTool() === 'text') {
      // Text is added immediately on click (no drawing)
      setAnnotations(prev => [...prev, {
        id,
        type: 'text',
        x: pos.x,
        y: pos.y,
        text: ''
      }]);
      setSelectedId(id);
      setNextId(n => n + 1);
      setIsDrawing(false);
      return;
    }
  };

  const handleMouseMove = (e) => {
    const pos = getMousePos(e);

    // Handle dragging existing shape
    if (dragging() && dragId()) {
      const dragType = dragging();
      const shapeId = dragId();

      setAnnotations(prev => prev.map(shape => {
        if (shape.id !== shapeId) return shape;

        if (shape.type === 'arrow') {
          if (dragType === 'from') {
            return { ...shape, fromX: pos.x, fromY: pos.y };
          } else if (dragType === 'to') {
            return { ...shape, toX: pos.x, toY: pos.y };
          } else if (dragType === 'whole') {
            const dx = shape.toX - shape.fromX;
            const dy = shape.toY - shape.fromY;
            const newFromX = pos.x - dragOffset().x;
            const newFromY = pos.y - dragOffset().y;
            return { ...shape, fromX: newFromX, fromY: newFromY, toX: newFromX + dx, toY: newFromY + dy };
          }
        } else if (shape.type === 'path' && dragType === 'whole') {
          const offsetX = pos.x - dragOffset().x - shape.points[0].x;
          const offsetY = pos.y - dragOffset().y - shape.points[0].y;
          return {
            ...shape,
            points: shape.points.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }))
          };
        } else if (shape.type === 'highlight' && dragType === 'whole' && shape.points?.length > 0) {
          const offsetX = pos.x - dragOffset().x - shape.points[0].x;
          const offsetY = pos.y - dragOffset().y - shape.points[0].y;
          return {
            ...shape,
            points: shape.points.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }))
          };
        } else if (shape.type === 'text' && dragType === 'whole') {
          return { ...shape, x: pos.x - dragOffset().x, y: pos.y - dragOffset().y };
        }
        return shape;
      }));
      return;
    }

    // Handle drawing new shape
    if (!isDrawing() || !currentShape()) return;

    const shape = currentShape();

    if (shape.type === 'arrow') {
      setCurrentShape(prev => ({ ...prev, toX: pos.x, toY: pos.y }));
    } else if (shape.type === 'path') {
      setCurrentShape(prev => ({
        ...prev,
        points: [...prev.points, { x: pos.x, y: pos.y }]
      }));
    } else if (shape.type === 'highlight') {
      setCurrentShape(prev => ({
        ...prev,
        points: [...prev.points, { x: pos.x, y: pos.y }]
      }));
    }
  };

  const handleMouseUp = () => {
    // Stop dragging
    if (dragging()) {
      setDragging(null);
      setDragId(null);
      return;
    }

    if (!isDrawing() || !currentShape()) return;

    const shape = currentShape();
    let isValid = false;

    if (shape.type === 'arrow') {
      const dist = Math.sqrt(Math.pow(shape.toX - shape.fromX, 2) + Math.pow(shape.toY - shape.fromY, 2));
      isValid = dist > 3;
    } else if (shape.type === 'path') {
      isValid = shape.points.length > 5;
    } else if (shape.type === 'highlight') {
      isValid = shape.points.length > 5;
    }

    if (isValid) {
      setAnnotations(prev => [...prev, { ...shape }]);
      setSelectedId(shape.id);
      setNextId(n => n + 1);
    }

    setCurrentShape(null);
    setIsDrawing(false);
  };

  // Select an annotation
  const selectAnnotation = (id, e) => {
    e?.stopPropagation();
    setSelectedId(id);
  };

  // Update annotation text
  const updateAnnotationText = (id, text) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, text } : a));
  };

  // Delete annotation
  const deleteAnnotation = (id) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    if (selectedId() === id) setSelectedId(null);
  };

  // Handle keyboard delete
  const handleKeyDown = (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId() && !e.target.matches('input')) {
      deleteAnnotation(selectedId());
    }
    if (e.key === 'Escape') {
      setActiveTool('select');
      setSelectedId(null);
    }
  };

  // Deselect when clicking empty area
  const handleContainerClick = (e) => {
    if (e.target === containerRef || e.target.tagName === 'svg') {
      if (activeTool() === 'select') setSelectedId(null);
    }
  };

  // Expose annotations to parent
  createEffect(() => {
    props.onAnnotationsChange?.(annotations());
  });

  // Get label position for a shape
  const getLabelPosition = (shape) => {
    if (shape.type === 'arrow') {
      return { x: shape.fromX, y: shape.fromY };
    } else if ((shape.type === 'path' || shape.type === 'highlight') && shape.points?.length > 0) {
      // Position at start of stroke
      return { x: shape.points[0].x, y: shape.points[0].y };
    }
    return { x: 0, y: 0 };
  };

  // Arrow SVG component
  const Arrow = (arrow, isPreview = false) => {
    const isSelected = () => selectedId() === arrow.id;
    const angle = Math.atan2(arrow.toY - arrow.fromY, arrow.toX - arrow.fromX);
    const headLength = 2.5;

    const headX1 = arrow.toX - headLength * Math.cos(angle - Math.PI / 6);
    const headY1 = arrow.toY - headLength * Math.sin(angle - Math.PI / 6);
    const headX2 = arrow.toX - headLength * Math.cos(angle + Math.PI / 6);
    const headY2 = arrow.toY - headLength * Math.sin(angle + Math.PI / 6);

    return (
      <g class={`annotation-item ${isSelected() ? 'selected' : ''}`} onClick={(e) => !isPreview && selectAnnotation(arrow.id, e)}>
        {!isPreview && (
          <line x1={arrow.fromX} y1={arrow.fromY} x2={arrow.toX} y2={arrow.toY}
            stroke="transparent" stroke-width="2" style={{ cursor: 'move' }}
            onMouseDown={(e) => startDragWhole(arrow.id, e)} />
        )}
        <line x1={arrow.fromX} y1={arrow.fromY} x2={arrow.toX} y2={arrow.toY}
          stroke="#e63946" stroke-width="0.4" stroke-linecap="round" style={{ "pointer-events": "none" }} />
        <polygon points={`${arrow.toX},${arrow.toY} ${headX1},${headY1} ${headX2},${headY2}`}
          fill="#e63946" style={{ "pointer-events": "none" }} />
        {isSelected() && !isPreview && (
          <>
            <circle cx={arrow.fromX} cy={arrow.fromY} r="1.2" fill="white" stroke="#e63946"
              stroke-width="0.3" style={{ cursor: 'grab' }} class="drag-handle"
              onMouseDown={(e) => startDragEndpoint(arrow.id, 'from', e)} />
            <circle cx={arrow.toX} cy={arrow.toY} r="1.2" fill="white" stroke="#e63946"
              stroke-width="0.3" style={{ cursor: 'grab' }} class="drag-handle"
              onMouseDown={(e) => startDragEndpoint(arrow.id, 'to', e)} />
          </>
        )}
      </g>
    );
  };

  // Path SVG component
  const Path = (path, isPreview = false) => {
    const isSelected = () => selectedId() === path.id;
    if (path.points.length < 2) return null;

    const d = path.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    return (
      <g class={`annotation-item ${isSelected() ? 'selected' : ''}`} onClick={(e) => !isPreview && selectAnnotation(path.id, e)}>
        {!isPreview && (
          <path d={d} stroke="transparent" stroke-width="2" fill="none" style={{ cursor: 'move' }}
            onMouseDown={(e) => startDragWhole(path.id, e)} />
        )}
        <path d={d} stroke="#e63946" stroke-width="0.4" fill="none" stroke-linecap="round"
          stroke-linejoin="round" style={{ "pointer-events": "none" }} />
        {isSelected() && !isPreview && (
          <circle cx={path.points[0].x} cy={path.points[0].y} r="1" fill="white" stroke="#e63946" stroke-width="0.3" />
        )}
      </g>
    );
  };

  // Highlight SVG component - spray paint style (freeform)
  const Highlight = (highlight, isPreview = false) => {
    const isSelected = () => selectedId() === highlight.id;
    if (!highlight.points || highlight.points.length < 2) return null;

    const d = highlight.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    return (
      <g class={`annotation-item ${isSelected() ? 'selected' : ''}`} onClick={(e) => !isPreview && selectAnnotation(highlight.id, e)}>
        {!isPreview && (
          <path d={d} stroke="transparent" stroke-width="4" fill="none" style={{ cursor: 'move' }}
            onMouseDown={(e) => startDragWhole(highlight.id, e)} />
        )}
        {/* Spray paint stroke - thick, semi-transparent with rough edges */}
        <path d={d} stroke="rgba(230, 57, 70, 0.5)" stroke-width="2.5" fill="none"
          stroke-linecap="round" stroke-linejoin="round" style={{ "pointer-events": "none" }} />
        <path d={d} stroke="rgba(255, 150, 150, 0.3)" stroke-width="3.5" fill="none"
          stroke-linecap="round" stroke-linejoin="round" style={{ "pointer-events": "none" }} />
        {isSelected() && !isPreview && (
          <circle cx={highlight.points[0].x} cy={highlight.points[0].y} r="1" fill="white" stroke="#e63946" stroke-width="0.3" />
        )}
      </g>
    );
  };

  // Render shape based on type
  const renderShape = (shape, isPreview = false) => {
    if (shape.type === 'arrow') return Arrow(shape, isPreview);
    if (shape.type === 'path') return Path(shape, isPreview);
    if (shape.type === 'highlight') return Highlight(shape, isPreview);
    return null;
  };

  return (
    <div
      ref={containerRef}
      class={`annotation-layer-v2 ${activeTool() && activeTool() !== 'select' ? 'tool-active' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleContainerClick}
      onKeyDown={handleKeyDown}
      tabIndex="0"
    >
      {/* Toolbar */}
      <div class="annotation-toolbar">
        <button
          class={`tool-btn ${activeTool() === 'select' ? 'active' : ''}`}
          onClick={() => setActiveTool('select')}
          title="Velg og flytt"
        >
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M5 3L19 12L12 13L9 20L5 3Z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>
          </svg>
        </button>
        <button
          class={`tool-btn ${activeTool() === 'arrow' ? 'active' : ''}`}
          onClick={() => setActiveTool('arrow')}
          title="Pil"
        >
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M4 20L20 4M20 4H8M20 4V16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button
          class={`tool-btn ${activeTool() === 'path' ? 'active' : ''}`}
          onClick={() => setActiveTool('path')}
          title="Tegn strek"
        >
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M3 17C6 17 8 7 12 7C16 7 18 17 21 17" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
          </svg>
        </button>
        <button
          class={`tool-btn ${activeTool() === 'highlight' ? 'active' : ''}`}
          onClick={() => setActiveTool('highlight')}
          title="Spray marker"
        >
          <svg viewBox="0 0 24 24" width="20" height="20">
            <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" stroke-width="2" fill="rgba(230,57,70,0.25)" stroke-dasharray="2 1"/>
          </svg>
        </button>
        <button
          class={`tool-btn ${activeTool() === 'text' ? 'active' : ''}`}
          onClick={() => setActiveTool('text')}
          title="Legg til tekst"
        >
          <svg viewBox="0 0 24 24" width="20" height="20">
            <text x="12" y="17" text-anchor="middle" font-size="14" font-weight="bold" fill="currentColor">T</text>
          </svg>
        </button>
      </div>

      {/* SVG layer for shapes */}
      <svg class="annotation-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <For each={annotations()}>
          {(shape) => renderShape(shape)}
        </For>
        {currentShape() && renderShape(currentShape(), true)}
      </svg>

      {/* Text labels for text annotations only (arrows are just arrows) */}
      <Index each={annotations()}>
        {(shape) => (
          <Show when={shape().type === 'text'}>
            <div
              class={`annotation-label text-only ${selectedId() === shape().id ? 'selected' : ''}`}
              style={{
                left: `${shape().x}%`,
                top: `${shape().y}%`
              }}
              onClick={(e) => selectAnnotation(shape().id, e)}
            >
              <span
                class="drag-handle-label"
                onMouseDown={(e) => { e.stopPropagation(); startDragWhole(shape().id, e); }}
                title="Dra for å flytte"
              >
                ⋮⋮
              </span>
              <input
                type="text"
                placeholder="Legg til kommentar..."
                value={shape().text}
                onInput={(e) => updateAnnotationText(shape().id, e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              />
              <button
                class="delete-btn"
                onClick={(e) => { e.stopPropagation(); deleteAnnotation(shape().id); }}
                title="Slett"
              >
                ×
              </button>
            </div>
          </Show>
        )}
      </Index>

      {/* Instructions */}
      <Show when={annotations().length === 0 && !isDrawing() && activeTool() === 'select'}>
        <div class="annotation-hint">
          Velg et verktøy fra menyen for å legge til merknader
        </div>
      </Show>
    </div>
  );
}
