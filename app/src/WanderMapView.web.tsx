/**
 * WanderMapView — Web implementation using Leaflet + OpenStreetMap tiles.
 * Rendered in a sandboxed iframe so Leaflet's global state is isolated.
 * No API key required; OSM tiles are free.
 * Pin taps bubble out via postMessage → onItemPress callback.
 */
import React, { useEffect, useId, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ItineraryItem } from './types';
import { colors, radius, itemAccent } from './theme';

interface Props {
  items: ItineraryItem[];
  onItemPress: (item: ItineraryItem) => void;
  large?: boolean;
}

interface MarkerData {
  id: string;
  lat: number;
  lng: number;
  title: string;
  locationName: string | null;
  type: string;
  color: string;
  index: number;
}

function buildHtml(markers: MarkerData[]): string {
  const markersJson = JSON.stringify(markers)
    // Escape closing script tags in any string value so they can't break out of
    // the srcdoc context.
    .replace(/<\/script>/gi, '<\\/script>');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV/XN2GqBk=" crossorigin=""></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#ddeedd;font-family:-apple-system,sans-serif}
#map{width:100%;height:100%}
.wander-pin{
  width:28px;height:28px;border-radius:50%;border:2.5px solid;
  display:flex;align-items:center;justify-content:center;
  font-size:11px;font-weight:800;background:#fff;
  box-shadow:0 2px 6px rgba(0,0,0,0.25);cursor:pointer;
  transition:transform .12s;
}
.wander-pin:hover{transform:scale(1.15)}
.wander-pin.sel{color:#fff!important}
</style>
</head>
<body>
<div id="map"></div>
<script>
(function(){
  var markers = ${markersJson};
  if(!markers.length){return}

  var map = L.map('map',{zoomControl:true,attributionControl:true});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom:19,
  }).addTo(map);

  var leafletMarkers=[];
  markers.forEach(function(m){
    var el=document.createElement('div');
    el.className='wander-pin';
    el.style.color=m.color;
    el.style.borderColor=m.color;
    el.textContent=String(m.index);
    var icon=L.divIcon({html:el.outerHTML,iconSize:[28,28],iconAnchor:[14,14],className:''});
    var lm=L.marker([m.lat,m.lng],{icon:icon,title:m.title});
    lm.addTo(map);
    lm.bindPopup('<b>'+m.title+'</b>'+(m.locationName?'<br/>'+m.locationName:''));
    lm.on('click',function(){
      window.parent.postMessage({type:'wander-pin-tap',id:m.id},'*');
      lm.openPopup();
    });
    leafletMarkers.push(lm);
  });

  if(markers.length===1){
    map.setView([markers[0].lat,markers[0].lng],15);
  } else {
    var group=L.featureGroup(leafletMarkers);
    map.fitBounds(group.getBounds().pad(0.2),{maxZoom:15});
  }
})();
</script>
</body>
</html>`;
}

export function WanderMapView({ items, onItemPress, large }: Props) {
  const panelH = large ? 340 : 200;
  const channelId = useId();
  const onItemPressRef = useRef(onItemPress);
  onItemPressRef.current = onItemPress;

  const located = items.filter((i) => i.latitude != null && i.longitude != null);
  const unlocated = items.length - located.length;

  const markers: MarkerData[] = located.map((item, idx) => ({
    id: item.id,
    lat: item.latitude!,
    lng: item.longitude!,
    title: item.title,
    locationName: item.locationName ?? null,
    type: item.type,
    color: itemAccent[item.type] ?? colors.brand,
    index: idx + 1,
  }));

  const html = markers.length > 0 ? buildHtml(markers) : null;

  // Listen for pin-tap messages from the iframe.
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as MessageEvent).data;
      if (msg?.type !== 'wander-pin-tap') return;
      const item = items.find((i) => i.id === msg.id);
      if (item) onItemPressRef.current(item);
    };
    (globalThis as any).addEventListener('message', handler);
    return () => (globalThis as any).removeEventListener('message', handler);
  }, [items]);

  return (
    <View style={s.root}>
      <View style={[s.frame, { height: panelH }]}>
        {html ? (
          // React Native Web renders <iframe> as a real iframe in the browser.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          React.createElement('iframe' as any, {
            srcDoc: html,
            style: { width: '100%', height: '100%', border: 'none' },
            title: 'Trip map',
            sandbox: 'allow-scripts',
          })
        ) : (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>📍</Text>
            <Text style={s.emptyText}>No located stops yet.</Text>
            <Text style={s.emptySub}>
              Search a place in the add/edit screen to pin stops here.
            </Text>
          </View>
        )}
      </View>
      {unlocated > 0 ? (
        <Text style={s.note}>
          +{unlocated} stop{unlocated > 1 ? 's' : ''} without coordinates — search a place to add them to the map.
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { marginTop: 8, marginBottom: 4 },
  frame: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    backgroundColor: '#ddeedd',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  emptyIcon: { fontSize: 28, marginBottom: 6 },
  emptyText: { fontSize: 13, fontWeight: '700', color: colors.ink600 },
  emptySub: {
    fontSize: 11,
    color: colors.ink400,
    textAlign: 'center',
    marginTop: 4,
  },
  note: { fontSize: 10, color: colors.ink400, fontStyle: 'italic', paddingHorizontal: 4, paddingTop: 4 },
});
