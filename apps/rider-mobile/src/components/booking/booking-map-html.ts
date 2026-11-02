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
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <style>
    html,body,#map{margin:0;width:100%;height:100%;overflow:hidden}
    body{background:#fff;font-family:Arial,sans-serif}
    #status{position:absolute;inset:0;display:grid;place-items:center;padding:32px;text-align:center;color:#5b5149;font-size:15px;pointer-events:none;z-index:1}
  </style>
</head>
<body>
  <div id="map"></div><div id="status">Loading map\u2026</div>
  <script>
    let bookingMap = null;
    let nextPoints = ${mapUpdate(pickup, drop, options)};
    let pickupMarker = null;
    let dropMarker = null;
    let driverMarker = null;
    let routePolyline = null;
    let lastView = '';

    setTimeout(function(){
      if(!bookingMap) document.getElementById('status').textContent='Map could not load. Check your connection.';
    },12000);

    function editPickup(){
      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage('editPickup');
      else if(window.parent!==window) window.parent.postMessage('editPickup','*');
    }

    window.updateBookingMap = function(points){
      nextPoints = points;
      if(!bookingMap) return;

      var gm = window.google.maps;

      function makePinIcon(type) {
        var isPickup = type === 'pickup';
        var svg = isPickup
          ? '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">' +
            '<circle cx="17" cy="17" r="16" fill="#059669" fill-opacity="0.28"/>' +
            '<circle cx="17" cy="17" r="11" fill="#059669" stroke="#ffffff" stroke-width="2"/>' +
            '<circle cx="17" cy="17" r="6" fill="#ffffff"/>' +
            '<circle cx="17" cy="17" r="3.5" fill="#059669"/>' +
            '</svg>'
          : '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">' +
            '<path fill="#dc2626" stroke="#ffffff" stroke-width="2" d="M16 1C8 1 2 7 2 15c0 10 14 26 14 26s14-16 14-26c0-8-6-14-14-14z"/>' +
            '<circle fill="#ffffff" cx="16" cy="15" r="5"/>' +
            '</svg>';
        var iconObj = {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg)
        };
        var w = isPickup ? 34 : 32;
        var h = isPickup ? 34 : 42;
        if(typeof gm.Size === 'function') iconObj.scaledSize = new gm.Size(w, h);
        if(typeof gm.Point === 'function') iconObj.anchor = new gm.Point(w/2, isPickup ? h/2 : h - 2);
        return iconObj;
      }

      function makeDriverIcon() {
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="28" viewBox="0 0 64 28">' +
          '<rect x="2" y="1" width="60" height="24" rx="12" fill="#1e1b18" stroke="#ffffff" stroke-width="2"/>' +
          '<circle cx="14" cy="13" r="3.5" fill="#f59e0b"/>' +
          '<text x="36" y="17" font-size="11" font-family="system-ui, -apple-system, sans-serif" font-weight="800" fill="#ffffff" text-anchor="middle">Driver</text>' +
          '</svg>';
        var iconObj = {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg)
        };
        if(typeof gm.Size === 'function') iconObj.scaledSize = new gm.Size(64, 28);
        if(typeof gm.Point === 'function') iconObj.anchor = new gm.Point(32, 14);
        return iconObj;
      }

      // Pickup marker
      if(points.pickup){
        var pickupPos = {lat:points.pickup.lat,lng:points.pickup.lng};
        if(!pickupMarker){
          pickupMarker = new gm.Marker({
            position:pickupPos,
            map:bookingMap,
            title:points.readOnly?'Pickup':'Change pickup',
            icon:makePinIcon('pickup'),
            zIndex:10
          });
          if(!points.readOnly){
            pickupMarker.addListener('click',editPickup);
          }
        } else {
          pickupMarker.setPosition(pickupPos);
        }
      } else if(pickupMarker){
        pickupMarker.setMap(null); pickupMarker=null;
      }

      // Drop marker
      if(points.drop){
        var dropPos = {lat:points.drop.lat,lng:points.drop.lng};
        if(!dropMarker){
          dropMarker = new gm.Marker({
            position:dropPos,
            map:bookingMap,
            title:'Destination',
            icon:makePinIcon('drop'),
            zIndex:10
          });
        } else {
          dropMarker.setPosition(dropPos);
        }
      } else if(dropMarker){
        dropMarker.setMap(null); dropMarker=null;
      }

      // Driver marker
      if(points.driver){
        var driverPos = {lat:points.driver.lat,lng:points.driver.lng};
        if(!driverMarker){
          driverMarker = new gm.Marker({
            position:driverPos,
            map:bookingMap,
            title:'Driver location',
            icon:makeDriverIcon(),
            zIndex:20
          });
        } else {
          driverMarker.setPosition(driverPos);
        }
      } else if(driverMarker){
        driverMarker.setMap(null); driverMarker=null;
      }

      // Route polyline — routeCoordinates are [lng, lat] pairs (GeoJSON order)
      var route = points.route || [];
      var coords = [];
      for(var i=0;i<route.length;i++){
        coords.push({lat:route[i][1],lng:route[i][0]});
      }
      if(coords.length>1){
        if(!routePolyline){
          routePolyline = new gm.Polyline({
            path:coords,
            map:bookingMap,
            strokeColor:'#b45309',
            strokeOpacity:0.9,
            strokeWeight:5,
            geodesic:true
          });
        } else {
          routePolyline.setPath(coords);
        }
      } else if(routePolyline){
        routePolyline.setMap(null); routePolyline=null;
      }

      // Camera / bounds
      var view = JSON.stringify([points.pickup,points.drop,Boolean(points.driver),points.cameraVersion]);
      if(view===lastView) return;
      lastView=view;
      var visible=[points.pickup,points.drop,points.driver].filter(Boolean);
      if(visible.length>1){
        var bounds = new gm.LatLngBounds();
        for(var j=0;j<visible.length;j++){
          bounds.extend({lat:visible[j].lat,lng:visible[j].lng});
        }
        bookingMap.fitBounds(bounds,{top:50,right:50,bottom:50,left:50});
      } else {
        bookingMap.panTo({lat:points.pickup.lat,lng:points.pickup.lng});
        bookingMap.setZoom(14);
      }
    };

    window.addEventListener('message',function(event){
      if(event.source===window.parent && event.data&&event.data.type==='booking.map.update'){
        window.updateBookingMap(event.data.points);
      }
    });

    function initMap(){
      var gm = window.google.maps;
      bookingMap = new gm.Map(document.getElementById('map'),{
        center:{lat:nextPoints.pickup.lat,lng:nextPoints.pickup.lng},
        zoom:14,
        mapTypeControl:false,
        streetViewControl:false,
        fullscreenControl:false,
        zoomControl:false,
        gestureHandling:'greedy',
        clickableIcons:false,
        styles:[{featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]}]
      });
      document.getElementById('status').style.display='none';
      window.updateBookingMap(nextPoints);
      if(!nextPoints.readOnly){
        bookingMap.addListener('click',function(event){
          if(nextPoints.readOnly) return;
          var point = JSON.stringify({lat:Number(event.latLng.lat().toFixed(5)),lng:Number(event.latLng.lng().toFixed(5))});
          if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(point);
          else if(window.parent!==window) window.parent.postMessage(point,'*');
        });
      }
    }
  </script>
  <script
    src="https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap&loading=async"
    async defer
    onerror="document.getElementById('status').textContent='Map could not load. Check your connection.'"
  ></script>
</body>
</html>`;
}
