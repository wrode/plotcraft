import { onMount, onCleanup, createEffect } from 'solid-js';
import L from 'leaflet';

export default function Map(props) {
  let mapContainer;
  let map;
  let marker;
  let parcelLayer;
  let propertyHighlight;
  let propertyMask;

  // Kartverket WMTS tile URL template for Web Mercator
  const getTileUrl = (layer = 'topo') => {
    return `https://cache.kartverket.no/v1/wmts/1.0.0/${layer}/default/webmercator/{z}/{y}/{x}.png`;
  };

  // Matrikkel WMS for parcel boundaries
  const getParcelWmsUrl = () => {
    return 'https://wms.geonorge.no/skwms1/wms.matrikkel';
  };

  // Create a rectangular property boundary (approximation)
  // In the future, this would be the actual parcel polygon
  const createPropertyBounds = (lat, lon, sizeMeters = 40) => {
    // Approximate meters to degrees (rough at this latitude)
    const latOffset = sizeMeters / 111320;
    const lonOffset = sizeMeters / (111320 * Math.cos(lat * Math.PI / 180));

    return [
      [lat - latOffset, lon - lonOffset],
      [lat - latOffset, lon + lonOffset],
      [lat + latOffset, lon + lonOffset],
      [lat + latOffset, lon - lonOffset],
    ];
  };

  // Create mask polygon (world with hole for property)
  const createMaskWithHole = (propertyCoords) => {
    // Outer bounds (covers the world)
    const worldBounds = [
      [-90, -180],
      [-90, 180],
      [90, 180],
      [90, -180],
    ];

    // Property hole (must be wound in opposite direction)
    const hole = [...propertyCoords].reverse();

    return L.polygon([worldBounds, hole], {
      color: 'transparent',
      fillColor: '#1a1a1a',
      fillOpacity: 0.85,
      interactive: false,
    });
  };

  onMount(() => {
    // Initialize map centered on Norway
    map = L.map(mapContainer, {
      center: [63.4, 10.4],
      zoom: 5,
      zoomControl: true,
    });

    // Add Kartverket topo basemap (max zoom is 18 for WMTS tiles)
    const topoLayer = L.tileLayer(getTileUrl('topo'), {
      attribution: '© <a href="https://kartverket.no">Kartverket</a>',
      maxZoom: 18,
      maxNativeZoom: 18,
    });
    topoLayer.addTo(map);

    // Add parcel boundaries WMS layer
    parcelLayer = L.tileLayer.wms(getParcelWmsUrl(), {
      layers: 'eiendomsgrense',
      format: 'image/png',
      transparent: true,
      attribution: '© Kartverket',
      opacity: 0.8,
    });

    if (props.showParcels) {
      parcelLayer.addTo(map);
    }
  });

  // React to mode and center changes
  createEffect(() => {
    const center = props.center;
    const mode = props.mode;

    if (!map || !center || !center.lat || !center.lon) return;

    // Remove existing overlays
    if (propertyHighlight) {
      map.removeLayer(propertyHighlight);
      propertyHighlight = null;
    }
    if (propertyMask) {
      map.removeLayer(propertyMask);
      propertyMask = null;
    }
    if (marker) {
      map.removeLayer(marker);
      marker = null;
    }

    if (mode === 'property') {
      // Property view: zoom in tight and mask surroundings
      const zoomLevel = 18;
      map.setView([center.lat, center.lon], zoomLevel);

      // Disable map interaction to keep focus on property
      map.dragging.disable();
      map.touchZoom.disable();
      map.doubleClickZoom.disable();
      map.scrollWheelZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();
      map.zoomControl.remove();

      // Create property bounds
      const propertyCoords = createPropertyBounds(center.lat, center.lon, 35);

      // Add mask (darkens everything outside property)
      propertyMask = createMaskWithHole(propertyCoords);
      propertyMask.addTo(map);

      // Add subtle property border
      propertyHighlight = L.polygon(propertyCoords, {
        color: '#2d5a27',
        fillColor: 'transparent',
        fillOpacity: 0,
        weight: 3,
        dashArray: '8, 4',
      }).addTo(map);

    } else {
      // Search mode: normal map interaction
      map.dragging.enable();
      map.touchZoom.enable();
      map.doubleClickZoom.enable();
      map.scrollWheelZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();

      // Re-add zoom control if not present
      if (!map.zoomControl._map) {
        map.zoomControl.addTo(map);
      }

      const zoomLevel = 17;
      map.setView([center.lat, center.lon], zoomLevel);

      // Show regular marker
      marker = L.marker([center.lat, center.lon]).addTo(map);
      if (center.text) {
        marker.bindPopup(center.text).openPopup();
      }
    }
  });

  // React to parcel layer toggle
  createEffect(() => {
    if (!map || !parcelLayer) return;

    if (props.showParcels) {
      if (!map.hasLayer(parcelLayer)) {
        parcelLayer.addTo(map);
      }
    } else {
      if (map.hasLayer(parcelLayer)) {
        map.removeLayer(parcelLayer);
      }
    }
  });

  onCleanup(() => {
    if (map) {
      map.remove();
    }
  });

  return <div ref={mapContainer} id="map" />;
}
