import { useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { colors } from '@/lib/theme';
import { useTheme } from '@/components/ThemeProvider';

export type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  subtitle?: string | null;
  /** Tipo do marker - afeta cor/ícone. Default 'place'. */
  kind?: 'place' | 'lodging';
};

type MapViewProps = {
  markers: MapMarker[];
  focusedId?: string | null;
  height?: number;
  onMarkerPress?: (id: string) => void;
  /** Se true, desenha uma linha conectando os markers na ordem fornecida */
  showRoute?: boolean;
};

// Importação condicional do WebView. No web, ele não é necessário (usamos iframe).
let WebView: any = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebView = require('react-native-webview').WebView;
}

export function MapView({
  markers,
  focusedId,
  height = 280,
  onMarkerPress,
  showRoute = false,
}: MapViewProps) {
  const styles = useStyles();
  const html = useMemo(() => buildLeafletHtml(markers, showRoute), [markers, showRoute]);

  // Quando focusedId muda, mandamos uma mensagem pro mapa centralizar nele.
  // Usamos refs distintas pro web (iframe) e mobile (webview).
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const webViewRef = useRef<any>(null);

  useEffect(() => {
    if (!focusedId) return;
    const message = JSON.stringify({ type: 'focus', id: focusedId });

    if (Platform.OS === 'web') {
      iframeRef.current?.contentWindow?.postMessage(message, '*');
    } else {
      webViewRef.current?.injectJavaScript?.(
        `window.handleHostMessage(${JSON.stringify(message)}); true;`
      );
    }
  }, [focusedId]);

  // Listener para cliques nos pinos (mobile manda via postMessage; web via window.message)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    function handler(event: MessageEvent) {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'marker-click' && data.id) {
          onMarkerPress?.(data.id);
        }
      } catch {
        // ignora mensagens não-JSON
      }
    }
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onMarkerPress]);

  if (Platform.OS === 'web') {
    // No web usamos iframe com srcdoc — funciona idêntico em todos os navegadores
    const React = require('react');
    return React.createElement('iframe', {
      ref: iframeRef,
      srcDoc: html,
      style: {
        width: '100%',
        height,
        border: 'none',
        borderRadius: 12,
        backgroundColor: colors.surface,
      },
    });
  }

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html }}
        style={styles.webview}
        // Permite o JS do Leaflet fazer fetch de tiles
        javaScriptEnabled
        domStorageEnabled
        // Mobile: cliques no pino chegam como mensagem
        onMessage={(event: { nativeEvent: { data: string } }) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data?.type === 'marker-click' && data.id) {
              onMarkerPress?.(data.id);
            }
          } catch {
            // ignora
          }
        }}
      />
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
}), [themeVersion]);
}

// Gera o HTML completo da página do mapa.
// Carrega Leaflet do CDN, monta marcadores, e expõe handlers para o host.
function buildLeafletHtml(markers: MapMarker[], showRoute = false): string {
  // Calcula centro e zoom inicial
  const initialView = computeInitialView(markers);

  // Encoda os marcadores como JSON pra injetar com segurança no JS
  const markersJson = JSON.stringify(markers);
  const showRouteJs = showRoute ? 'true' : 'false';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: #e8f0f7; }
    .leaflet-popup-content { font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; }
    .leaflet-popup-content b { display: block; margin-bottom: 4px; }
    .leaflet-popup-content small { color: #64748b; }
    .pin {
      width: 36px; height: 36px;
      background: #0ea5e9;
      border: 3px solid #fff;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 3px 12px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .pin-inner {
      transform: rotate(45deg);
      font-size: 14px; font-weight: 800; color: #fff;
      font-family: -apple-system, sans-serif;
      display: flex; align-items: center; justify-content: center;
      width: 100%; height: 100%;
    }
    .pin.lodging { background: #7c3aed; }
    .pin.flight  { background: #2563eb; }
    .pin.focused {
      background: #f59e0b;
      transform: rotate(-45deg) scale(1.25);
      box-shadow: 0 5px 18px rgba(245,158,11,0.55);
      z-index: 9999 !important;
    }
    .pin:hover { transform: rotate(-45deg) scale(1.15); }
    .leaflet-popup-content { min-width: 190px; font-family: -apple-system, sans-serif; }
    .leaflet-popup-content-wrapper { border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
    .popup-title { font-weight: 700; font-size: 14px; margin-bottom: 4px; color: #0f172a; }
    .popup-sub { font-size: 12px; color: #64748b; margin-bottom: 8px; }
    .popup-nav { 
      display: inline-flex; align-items: center; gap: 4px; margin-top: 4px;
      padding: 6px 12px; background: #0ea5e9; color: #fff;
      border-radius: 8px; font-size: 12px; font-weight: 600;
      text-decoration: none; cursor: pointer;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var markers = ${markersJson};
    var view = ${JSON.stringify(initialView)};

    var map = L.map('map', { zoomControl: true, attributionControl: false })
      .setView([view.lat, view.lng], view.zoom);

    // CartoDB Positron — visual limpo, contraste alto, estilo moderno
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
      attribution: '© OpenStreetMap © CARTO'
    }).addTo(map);

    var markerById = {};
    var kindById = {};
    var numById = {};

    // Se tem 2+ marcadores, ajusta o viewport pra mostrar todos com padding.
    // fitBounds é mais robusto que zoom fixo via spread.
    // - padding maior (60-80) deixa pinos com mais respiro nas bordas
    // - maxZoom 13 evita zoom muito perto quando os pontos estão próximos
    if (markers.length >= 2) {
      var bounds = L.latLngBounds(markers.map(function(m) { return [m.latitude, m.longitude]; }));
      map.fitBounds(bounds, {
        paddingTopLeft: [60, 60],
        paddingBottomRight: [60, 80],  // mais padding embaixo (bottom bar do app)
        maxZoom: 13,
      });
    } else if (markers.length === 1) {
      // Single marker: zoom out um pouco (12 em vez de 13) pra mostrar contexto
      map.setView([markers[0].latitude, markers[0].longitude], 12);
    }

    function createIcon(focused, kind, num) {
      var classes = 'pin';
      if (focused) classes += ' focused';
      if (kind === 'lodging') classes += ' lodging';
      if (kind === 'flight') classes += ' flight';
      var inner = kind === 'lodging' ? '🏨' : kind === 'flight' ? '✈' : (num || '');
      return L.divIcon({
        className: '',
        html: '<div class="' + classes + '"><div class="pin-inner">' + inner + '</div></div>',
        iconSize: [36, 36],
        iconAnchor: [10, 36],
        popupAnchor: [8, -38]
      });
    }

    markers.forEach(function (m, idx) {
      var num = idx + 1;
      var marker = L.marker([m.latitude, m.longitude], { icon: createIcon(false, m.kind, num) })
        .addTo(map)
        .bindPopup(
          '<div class="popup-title">' + escapeHtml(m.title) + '</div>' +
          (m.subtitle ? '<div class="popup-sub">' + escapeHtml(m.subtitle) + '</div>' : '') +
          '<a class="popup-nav" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(m.title) + '&center=' + m.latitude + ',' + m.longitude + '" target="_blank">↗ Abrir no Maps</a>'
        );
      marker.on('click', function () {
        sendToHost({ type: 'marker-click', id: m.id });
      });
      markerById[m.id] = marker;
      kindById[m.id] = m.kind;
      numById[m.id] = num;
    });

    // Rota: polyline conectando os markers em ordem
    if (${showRouteJs} && markers.length > 1) {
      var routeCoords = markers.map(function (m) { return [m.latitude, m.longitude]; });
      L.polyline(routeCoords, {
        color: '#14b8a6',
        weight: 3,
        opacity: 0.75,
        dashArray: '6 4',
      }).addTo(map);

      // Números de ordem nos markers
      markers.forEach(function (m, idx) {
        L.marker([m.latitude, m.longitude], {
          icon: L.divIcon({
            className: '',
            html: '<div style="width:20px;height:20px;border-radius:50%;background:#14b8a6;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3);">' + (idx + 1) + '</div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          }),
          zIndexOffset: 1000,
        }).addTo(map);
      });
    }

    // Recebe mensagens do host (focar em um lugar)
    window.handleHostMessage = function (raw) {
      try {
        var msg = JSON.parse(raw);
        if (msg.type === 'focus' && markerById[msg.id]) {
          var target = markerById[msg.id];
          // Reset todos os ícones, depois marca o foco (preservando kind)
          Object.keys(markerById).forEach(function (k) {
            markerById[k].setIcon(createIcon(false, kindById[k], numById[k]));
          });
          target.setIcon(createIcon(true, kindById[msg.id], numById[msg.id]));
          map.flyTo(target.getLatLng(), Math.max(map.getZoom(), 14), { duration: 0.5 });
          target.openPopup();
        }
      } catch (e) {}
    };

    // Web: escuta postMessage do iframe pai
    window.addEventListener('message', function (event) {
      if (typeof event.data === 'string') {
        window.handleHostMessage(event.data);
      }
    });

    function sendToHost(obj) {
      var json = JSON.stringify(obj);
      // Mobile (React Native WebView)
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(json);
      }
      // Web (iframe -> parent)
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(json, '*');
      }
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]);
      });
    }
  </script>
</body>
</html>`;
}

// Calcula uma view inicial razoável baseada nos marcadores.
function computeInitialView(markers: MapMarker[]): {
  lat: number;
  lng: number;
  zoom: number;
} {
  if (markers.length === 0) {
    // Default: centro do mundo, zoom out
    return { lat: 20, lng: 0, zoom: 2 };
  }
  if (markers.length === 1) {
    return { lat: markers[0].latitude, lng: markers[0].longitude, zoom: 13 };
  }

  // Centroide simples — bom o suficiente pra dezenas de pinos
  const avgLat = markers.reduce((sum, m) => sum + m.latitude, 0) / markers.length;
  const avgLng = markers.reduce((sum, m) => sum + m.longitude, 0) / markers.length;

  // Zoom baseado no spread geográfico
  const lats = markers.map((m) => m.latitude);
  const lngs = markers.map((m) => m.longitude);
  const spread = Math.max(
    Math.max(...lats) - Math.min(...lats),
    Math.max(...lngs) - Math.min(...lngs)
  );

  let zoom = 12;
  if (spread > 50) zoom = 3;
  else if (spread > 20) zoom = 4;
  else if (spread > 10) zoom = 5;
  else if (spread > 5) zoom = 6;
  else if (spread > 2) zoom = 8;
  else if (spread > 0.5) zoom = 10;
  else if (spread > 0.1) zoom = 12;
  else zoom = 14;

  return { lat: avgLat, lng: avgLng, zoom };
}
