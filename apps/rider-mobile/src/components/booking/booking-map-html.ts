import type { BookingMapProps } from './booking-map';

type MapPoint = BookingMapProps['pickup'];
type MapOptions = Pick<
  BookingMapProps,
  'driverLocation' | 'routeCoordinates' | 'readOnly' | 'cameraVersion'
>;

export function mapUpdate(pickup: MapPoint, drop?: MapPoint, options: MapOptions = {}) {
  return JSON.stringify({
    pickup: { lat: pickup.lat, lng: pickup.lng },
    drop: drop ? { lat: drop.lat, lng: drop.lng } : null,
    driver: options.driverLocation
      ? { lat: options.driverLocation.lat, lng: options.driverLocation.lng }
      : null,
    route: options.routeCoordinates ?? [],
    readOnly: Boolean(options.readOnly),
    cameraVersion: options.cameraVersion ?? 0,
  });
}

export function mapSelection(message: unknown): { lat: number; lng: number } | null {
  if (typeof message !== 'string') return null;
  try {
    const point: unknown = JSON.parse(message);
    if (!point || typeof point !== 'object') return null;
    const { lat, lng } = point as { lat?: unknown; lng?: unknown };
    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    )
      return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

export function bookingMapHtml(pickup: MapPoint, drop?: MapPoint, options: MapOptions = {}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@6.15.0/dist/maplibre-gl.css">
  <style>
    html,body,#map{margin:0;width:100%;height:100%;overflow:hidden}
    body{background:#fff;font-family:Arial,sans-serif}
    #status{position:absolute;inset:0;display:grid;place-items:center;padding:32px;text-align:center;color:#5b5149;font-size:15px;pointer-events:none}
    .pin{width:25px;height:25px;border:4px solid white;border-radius:50%;box-shadow:0 2px 8px #0004;background:#a95713;cursor:pointer}
    .pin.pickup{background:#2f764c}
    .pin.driver{width:auto;height:auto;padding:8px 12px;border:2px solid white;border-radius:16px;background:#3a2414;color:white;font-weight:700;font-size:13px;cursor:default}
    @keyframes pickupPulse{50%{box-shadow:0 0 0 12px #2f764c33,0 2px 8px #0004}}
    @media (prefers-reduced-motion:no-preference){.pin.pickup{animation:pickupPulse 2s ease-in-out infinite}}
  </style>
</head>
<body>
  <div id="map"></div><div id="status">Loading map…</div>
  <script>
    let bookingMap = null;
    let nextPoints = ${mapUpdate(pickup, drop, options)};
    let markers = [];
    let lastView = '';
    setTimeout(()=>{
      if(!bookingMap || !bookingMap.loaded()) document.getElementById('status').textContent='Map could not load. Check your connection.';
    },12000);
    function editPickup(){
      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage('editPickup');
      else if(window.parent!==window) window.parent.postMessage('editPickup','*');
    }
    window.updateBookingMap = function(points){
      nextPoints = points;
      if(!bookingMap || !bookingMap.loaded()) return;
      markers.forEach(marker => marker.remove());
      markers = [];
      for(const [name,point] of [['pickup',points.pickup],['drop',points.drop],['driver',points.driver]]){
        if(!point) continue;
        const pin = document.createElement('button');
        pin.type = 'button';
        pin.className = 'pin ' + name;
        pin.title = name === 'driver' ? 'Driver location' : name === 'pickup' ? (points.readOnly ? 'Pickup' : 'Change pickup') : 'Destination';
        if(name === 'driver') pin.textContent = 'Driver';
        pin.setAttribute('aria-label', pin.title);
        if(name === 'pickup' && !points.readOnly) pin.addEventListener('click',editPickup);
        markers.push(new maplibregl.Marker({element:pin}).setLngLat([point.lng,point.lat]).addTo(bookingMap));
      }
      const route = {type:'FeatureCollection',features:points.route.length > 1 ? [{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:points.route}}] : []};
      const source = bookingMap.getSource('trip-route');
      if(source) source.setData(route);
      else{
        bookingMap.addSource('trip-route',{type:'geojson',data:route});
        bookingMap.addLayer({id:'trip-route',type:'line',source:'trip-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#b45309','line-width':5}});
      }
      const view = JSON.stringify([points.pickup,points.drop,Boolean(points.driver),points.cameraVersion]);
      if(view === lastView) return;
      lastView = view;
      const visible = [points.pickup,points.drop,points.driver].filter(Boolean);
      if(visible.length > 1){
        const bounds = new maplibregl.LngLatBounds();
        visible.forEach(point=>bounds.extend([point.lng,point.lat]));
        bookingMap.fitBounds(bounds,{padding:50,maxZoom:16,duration:450});
      }else{
        bookingMap.easeTo({center:[points.pickup.lng,points.pickup.lat],zoom:14,duration:450});
      }
    };
    window.addEventListener('message',event=>{
      if(event.source === window.parent && event.data?.type === 'booking.map.update') window.updateBookingMap(event.data.points);
    });
  </script>
  <script type="module">
    import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.15.0/dist/maplibre-gl.mjs';
    window.maplibregl = maplibregl;
    bookingMap = new maplibregl.Map({
      container:'map',
      style:'https://tiles.openfreemap.org/styles/positron',
      center:[nextPoints.pickup.lng,nextPoints.pickup.lat],
      zoom:14,
      attributionControl:true
    });
    bookingMap.on('load',()=>{
      document.getElementById('status').style.display='none';
      window.updateBookingMap(nextPoints);
    });
    bookingMap.on('error',()=>{
      if(!bookingMap.loaded()) document.getElementById('status').textContent='Map could not load. Check your connection.';
    });
    bookingMap.on('click',event=>{
      if(nextPoints.readOnly) return;
      const point = JSON.stringify({lat:Number(event.lngLat.lat.toFixed(5)),lng:Number(event.lngLat.lng.toFixed(5))});
      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(point);
      else if(window.parent!==window) window.parent.postMessage(point,'*');
    });
  </script>
</body>
</html>`;
}
