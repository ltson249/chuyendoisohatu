let map, userPos, userMarker, ubndPos, ubndMarker, routeLine;
let foodMarkers = [], cafeMarkers = [];

document.addEventListener("DOMContentLoaded", () => {
  map = L.map("map").setView([21.0065,107.2925],9);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
  loadAllUBND();
});

function loadAllUBND(){
 fetch("https://overpass-api.de/api/interpreter",{
  method:"POST",
  body:`
[out:json];
area["name"="Quảng Ninh"]["admin_level"="4"]->.qn;
node["amenity"="townhall"](area.qn);
out;
`
 }).then(r=>r.json()).then(d=>{
  d.elements.forEach(e=>{
   if(!e.lat) return;
   const name=e.tags.name||"UBND";
   L.marker([e.lat,e.lon]).addTo(map)
    .bindPopup(`
      🏛 <b>${name}</b><br>
      <a href="location.html?lat=${e.lat}&lon=${e.lon}&name=${encodeURIComponent(name)}">
        👉 Xem chi tiết
      </a>
    `);
  });
 });
}
