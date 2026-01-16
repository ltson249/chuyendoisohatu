let map, ubndPos, userPos, routeLine;
let allPOI = []; // 🔴 BẮT BUỘC

document.addEventListener("DOMContentLoaded", () => {
  const p = new URLSearchParams(location.search);
  const lat = +p.get("lat");
  const lon = +p.get("lon");
  const name = p.get("name");

  document.getElementById("title").innerText = name;
  ubndPos = [lat, lon];

  map = L.map("map").setView(ubndPos, 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")
    .addTo(map);

  L.marker(ubndPos).addTo(map)
    .bindPopup("🏛 " + name).openPopup();

  loadPOI("restaurant");
  loadPOI("cafe");
});

/* ===============================
   LOAD POI + LƯU VÀO allPOI
================================ */
function loadPOI(type) {
  const box = document.getElementById(
    type === "restaurant" ? "foods" : "cafes"
  );
  box.innerHTML = "Đang tải...";

  fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: `
[out:json];
node["amenity"="${type}"](around:2000,${ubndPos[0]},${ubndPos[1]});
out;
`
  })
    .then(r => r.json())
    .then(d => {
      box.innerHTML = "";

      d.elements.forEach(e => {
        if (!e.tags?.name) return;

        const poi = {
          name: e.tags.name,
          lat: e.lat,
          lng: e.lon,
          type: type === "restaurant" ? "food" : "cafe",
          rate: Math.floor(Math.random() * 2) + 4, // giả lập 4–5⭐
          icon: type === "restaurant" ? "🍜" : "☕"
        };

        allPOI.push(poi);
      });

      renderPOI(allPOI);
    });
}

/* ===============================
   RENDER DANH SÁCH + CLICK MAP
================================ */
function renderPOI(list) {
  document.getElementById("foods").innerHTML = "";
  document.getElementById("cafes").innerHTML = "";

  list.forEach(p => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      ${p.icon} <b>${p.name}</b><br>
      ⭐ ${p.rate}/5
    `;

    div.onclick = () => {
      map.setView([p.lat, p.lng], 17);
      L.marker([p.lat, p.lng]).addTo(map)
        .bindPopup(`${p.icon} <b>${p.name}</b><br>⭐ ${p.rate}/5`)
        .openPopup();
    };

    if (p.type === "food")
      document.getElementById("foods").appendChild(div);
    else
      document.getElementById("cafes").appendChild(div);
  });
}

/* ===============================
   TÌM KIẾM (KHÔI PHỤC)
================================ */
function searchPOI() {
  const q = document
    .getElementById("searchPOI")
    .value
    .toLowerCase();

  if (!q) {
    renderPOI(allPOI);
    return;
  }

  const filtered = allPOI.filter(p =>
    p.name.toLowerCase().includes(q)
  );

  renderPOI(filtered);
}

/* ===============================
   VỊ TRÍ NGƯỜI DÙNG
================================ */
function getUserLocation() {
  navigator.geolocation.getCurrentPosition(p => {
    userPos = [p.coords.latitude, p.coords.longitude];
    L.marker(userPos)
      .addTo(map)
      .bindPopup("📍 Bạn")
      .openPopup();
  });
}

/* ===============================
   CHỈ ĐƯỜNG
================================ */
function drawRoute() {
  if (!userPos) return alert("Chưa có vị trí!");

  fetch(
    `https://router.project-osrm.org/route/v1/driving/${userPos[1]},${userPos[0]};${ubndPos[1]},${ubndPos[0]}?geometries=geojson`
  )
    .then(r => r.json())
    .then(d => {
      const coords = d.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
      routeLine && map.removeLayer(routeLine);
      routeLine = L.polyline(coords, { color: "red" }).addTo(map);
    });
}
