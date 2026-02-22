/* =========================
   Firebase
========================= */
firebase.initializeApp({
  databaseURL: "https://hatumap-default-rtdb.firebaseio.com/"
});
const db = firebase.database();

/* =========================
   State
========================= */
let isAdmin = false;

let editingLocationKey = null;
let editingUtilityKey = null;

let markersByKey = {};
let allLocationData = {};   // {key: {...}}
let allUtilityData = {};    // {key: {...}}

/* =========================
   Map (Leaflet)
========================= */
const map = L.map("map").setView([20.943, 107.112], 15);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '© OpenStreetMap'
}).addTo(map);

let tempMarker = null;

// Click map to set coords (admin only)
map.on("click", (e) => {
  if (!isAdmin) return;

  const latEl = document.getElementById("lat");
  const lngEl = document.getElementById("lng");

  latEl.value = e.latlng.lat.toFixed(6);
  lngEl.value = e.latlng.lng.toFixed(6);

  if (tempMarker) map.removeLayer(tempMarker);
  tempMarker = L.marker(e.latlng).addTo(map).bindPopup("📍 Đã chọn vị trí").openPopup();
});

/* =========================
   Helpers
========================= */
function setActiveTabButton(tab) {
  document.querySelectorAll(".tabbtn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
}

function showTab(tab) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");
  setActiveTabButton(tab);
  // Map luôn hiển thị 50%, nên không cần show/hide nữa
}

function openLink(url) {
  window.open(url, "_blank");
}

function callNumber(num) {
  window.location.href = `tel:${num}`;
}

function openWeather() {
  window.open("https://www.google.com/search?q=thời+tiết+Hà+Tu+Quảng+Ninh", "_blank");
}

function openFeedback() {
  window.open("https://docs.google.com/forms", "_blank");
}

function parseImages(raw) {
  if (!raw) return [];
  // accept commas or newlines
  return raw
    .split(/[\n,]+/g)
    .map(s => s.trim())
    .filter(Boolean);
}

function escapeHtml(s) {
  return (s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function googleDirectionsLink(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

function fitAllMarkers() {
  const keys = Object.keys(allLocationData);
  if (!keys.length) return;
  const latlngs = keys.map(k => [Number(allLocationData[k].lat), Number(allLocationData[k].lng)]);
  const bounds = L.latLngBounds(latlngs);
  map.fitBounds(bounds.pad(0.2));
}

/* =========================
   Locations: Load + Render + CRUD
========================= */
function buildLocationPopupHtml(d) {
  const name = escapeHtml(d.name);
  const desc = escapeHtml(d.desc || "");
  const lat = Number(d.lat);
  const lng = Number(d.lng);
  const images = Array.isArray(d.images) ? d.images : [];

  const imagesHtml = images.length
    ? `<div class="popup-images">${
        images.slice(0, 8).map(url => `<img src="${escapeHtml(url)}" alt="Ảnh">`).join("")
      }</div>`
    : "";

  return `
    <div class="popup-title">${name}</div>
    <div class="popup-desc">${desc}</div>
    <div class="popup-actions">
      <a href="${googleDirectionsLink(lat, lng)}" target="_blank">🚗 Chỉ đường Google Maps</a>
    </div>
    ${imagesHtml}
  `;
}

function clearAllMarkers() {
  Object.values(markersByKey).forEach(m => map.removeLayer(m));
  markersByKey = {};
}

function renderLocations() {
  const list = document.getElementById("location-list");
  const count = document.getElementById("locationsCount");
  const filter = (document.getElementById("locationFilter")?.value || "").toLowerCase().trim();

  const keys = Object.keys(allLocationData);
  count.textContent = `${keys.length} mục`;

  list.innerHTML = "";
  const filteredKeys = keys.filter(k => {
    const d = allLocationData[k];
    const hay = `${d.name || ""} ${d.desc || ""}`.toLowerCase();
    return !filter || hay.includes(filter);
  });

  if (!filteredKeys.length) {
    list.innerHTML = `<div class="small muted">Chưa có địa điểm phù hợp.</div>`;
    return;
  }

  filteredKeys
    .sort((a,b) => (allLocationData[a].name||"").localeCompare(allLocationData[b].name||""))
    .forEach(key => {
      const d = allLocationData[key];
      const div = document.createElement("div");
      div.className = "item-card";

      const firstImg = (d.images && d.images.length) ? d.images[0] : "";
      div.innerHTML = `
        <div style="display:flex; gap:10px; align-items:flex-start;">
          ${firstImg ? `<img src="${escapeHtml(firstImg)}" alt="Ảnh"
               style="width:72px;height:54px;object-fit:cover;border-radius:10px;border:1px solid rgba(0,0,0,.08);">` : ""}
          <div style="flex:1;">
            <div style="font-weight:900;color:#1831AE;">${escapeHtml(d.name)}</div>
            <div class="small muted" style="margin-top:2px;">${escapeHtml(d.desc || "")}</div>
            <div class="popup-actions" style="margin-top:8px;">
              <a href="${googleDirectionsLink(d.lat, d.lng)}" target="_blank">🚗 Chỉ đường</a>
            </div>
          </div>
        </div>
        ${isAdmin ? `
          <div style="display:flex; gap:8px; margin-top:10px;">
            <button class="btn btn-ghost" onclick="event.stopPropagation(); editLocation('${key}')">Sửa</button>
            <button class="btn" style="background:linear-gradient(135deg,#F63E1D,#EF4444);" onclick="event.stopPropagation(); deleteLocation('${key}')">Xóa</button>
          </div>
        ` : ""}
      `;

      div.onclick = () => {
        const lat = Number(d.lat), lng = Number(d.lng);
        map.flyTo([lat, lng], 16);

        const marker = markersByKey[key];
        if (marker) marker.openPopup();
      };

      list.appendChild(div);
    });
}

function refreshMarkers() {
  clearAllMarkers();
  Object.keys(allLocationData).forEach(key => {
    const d = allLocationData[key];
    const lat = Number(d.lat), lng = Number(d.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const m = L.marker([lat, lng]).addTo(map);
    m.bindPopup(buildLocationPopupHtml(d));
    markersByKey[key] = m;
  });
}

// Listen locations realtime
db.ref("locations").on("value", (snap) => {
  const obj = {};
  snap.forEach(child => {
    obj[child.key] = child.val();
  });
  allLocationData = obj;

  refreshMarkers();
  renderLocations();
});

/* Admin: Save location (create/update) */
function saveLocation() {
  if (!isAdmin) return alert("Bạn chưa đăng nhập admin.");

  const nameEl = document.getElementById("name");
  const descEl = document.getElementById("desc");
  const latEl = document.getElementById("lat");
  const lngEl = document.getElementById("lng");
  const imagesEl = document.getElementById("images");

  const name = (nameEl.value || "").trim();
  const desc = (descEl.value || "").trim();
  const lat = (latEl.value || "").trim();
  const lng = (lngEl.value || "").trim();
  const images = parseImages(imagesEl.value);

  if (!name) return alert("Vui lòng nhập tên địa điểm.");
  if (!lat || !lng) return alert("Vui lòng bấm lên bản đồ để lấy tọa độ.");

  const payload = {
    name, desc,
    lat: Number(lat),
    lng: Number(lng),
    images
  };

  const modeLabel = document.getElementById("locationMode");

  if (editingLocationKey) {
    db.ref("locations/" + editingLocationKey).set(payload);
    modeLabel.textContent = "Chế độ: Thêm mới";
    editingLocationKey = null;
    alert("Đã cập nhật địa điểm.");
  } else {
    db.ref("locations").push(payload);
    alert("Đã thêm địa điểm.");
  }

  resetLocationForm();
}

function editLocation(key) {
  if (!isAdmin) return;

  const d = allLocationData[key];
  if (!d) return;

  editingLocationKey = key;
  document.getElementById("locationMode").textContent = "Chế độ: Sửa";

  document.getElementById("name").value = d.name || "";
  document.getElementById("desc").value = d.desc || "";
  document.getElementById("lat").value = (Number(d.lat)).toFixed(6);
  document.getElementById("lng").value = (Number(d.lng)).toFixed(6);
  document.getElementById("images").value = (d.images || []).join("\n");

  // focus map
  map.flyTo([Number(d.lat), Number(d.lng)], 16);
  const m = markersByKey[key];
  if (m) m.openPopup();

  showTab("admin");
}

function deleteLocation(key) {
  if (!isAdmin) return;
  const d = allLocationData[key];
  if (!d) return;

  if (!confirm(`Xóa địa điểm "${d.name}"?`)) return;
  db.ref("locations/" + key).remove();
  if (editingLocationKey === key) resetLocationForm();
}

function resetLocationForm() {
  editingLocationKey = null;
  document.getElementById("locationMode").textContent = "Chế độ: Thêm mới";
  document.getElementById("name").value = "";
  document.getElementById("desc").value = "";
  document.getElementById("lat").value = "";
  document.getElementById("lng").value = "";
  document.getElementById("images").value = "";

  if (tempMarker) {
    map.removeLayer(tempMarker);
    tempMarker = null;
  }
}

/* Search place using Nominatim (OpenStreetMap) */
function searchPlace() {
  const q = (document.getElementById("searchInput").value || "").trim();
  if (!q) return;

  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`)
    .then(r => r.json())
    .then(res => {
      if (!res || !res.length) return alert("Không tìm thấy địa điểm.");
      const p = res[0];
      map.flyTo([Number(p.lat), Number(p.lon)], 16);
      L.marker([Number(p.lat), Number(p.lon)]).addTo(map)
        .bindPopup(`<div class="popup-title">${escapeHtml(p.display_name)}</div>
                   <div class="popup-actions">
                     <a target="_blank" href="${googleDirectionsLink(p.lat, p.lon)}">🚗 Chỉ đường Google Maps</a>
                   </div>`)
        .openPopup();
    })
    .catch(() => alert("Lỗi tìm kiếm. Vui lòng thử lại."));
}

/* =========================
   Utilities: Load + Render + CRUD (Admin created)
========================= */
function renderUtilities() {
  const box = document.getElementById("utilities-dynamic");
  box.innerHTML = "";

  const keys = Object.keys(allUtilityData);
  if (!keys.length) {
    box.innerHTML = `<div class="small muted">Chưa có tiện ích do admin tạo.</div>`;
    return;
  }

  keys
    .sort((a,b)=> (allUtilityData[a].title||"").localeCompare(allUtilityData[b].title||""))
    .forEach(key => {
      const u = allUtilityData[key];
      const div = document.createElement("div");
      div.className = "item-card";

      const typeLabel =
        u.type === "call" ? "📞 Gọi điện" :
        u.type === "link" ? "🔗 Liên kết" :
        "📍 Chỉ đường";

      div.innerHTML = `
        <div style="display:flex; justify-content:space-between; gap:10px;">
          <div style="flex:1;">
            <div style="font-weight:900;color:#1831AE;">${escapeHtml(u.title)}</div>
            <div class="small muted">${typeLabel} • ${escapeHtml(u.value || "")}</div>
          </div>
          <div class="small muted">›</div>
        </div>

        ${isAdmin ? `
          <div style="display:flex; gap:8px; margin-top:10px;">
            <button class="btn btn-ghost" onclick="event.stopPropagation(); editUtility('${key}')">Sửa</button>
            <button class="btn" style="background:linear-gradient(135deg,#F63E1D,#EF4444);" onclick="event.stopPropagation(); deleteUtility('${key}')">Xóa</button>
          </div>
        ` : ""}
      `;

      div.onclick = () => runUtility(u);

      box.appendChild(div);
    });
}

function runUtility(u) {
  if (!u) return;

  if (u.type === "call") {
    window.location.href = `tel:${u.value}`;
    return;
  }

  if (u.type === "link") {
    window.open(u.value, "_blank");
    return;
  }

  if (u.type === "map") {
    const parts = String(u.value || "").split(",");
    if (parts.length < 2) return alert("Tiện ích map phải có dạng: lat,lng");
    const lat = Number(parts[0].trim());
    const lng = Number(parts[1].trim());
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return alert("Tọa độ không hợp lệ.");

    map.flyTo([lat, lng], 16);
    L.popup()
      .setLatLng([lat, lng])
      .setContent(`
        <div class="popup-title">${escapeHtml(u.title || "Tiện ích")}</div>
        <div class="popup-actions">
          <a target="_blank" href="${googleDirectionsLink(lat, lng)}">🚗 Chỉ đường Google Maps</a>
        </div>
      `)
      .openOn(map);

    return;
  }
}

// Listen utilities realtime
db.ref("utilities").on("value", (snap) => {
  const obj = {};
  snap.forEach(child => { obj[child.key] = child.val(); });
  allUtilityData = obj;
  renderUtilities();
});

/* Admin: Save utility (create/update) */
function saveUtility() {
  if (!isAdmin) return alert("Bạn chưa đăng nhập admin.");

  const title = (document.getElementById("utilTitle").value || "").trim();
  const type = document.getElementById("utilType").value;
  const value = (document.getElementById("utilValue").value || "").trim();

  if (!title) return alert("Vui lòng nhập tên tiện ích.");
  if (!value) return alert("Vui lòng nhập giá trị tiện ích.");

  const payload = { title, type, value };

  if (editingUtilityKey) {
    db.ref("utilities/" + editingUtilityKey).set(payload);
    editingUtilityKey = null;
    document.getElementById("utilityMode").textContent = "Chế độ: Thêm mới";
    alert("Đã cập nhật tiện ích.");
  } else {
    db.ref("utilities").push(payload);
    alert("Đã thêm tiện ích.");
  }

  resetUtilityForm();
}

function editUtility(key) {
  if (!isAdmin) return;
  const u = allUtilityData[key];
  if (!u) return;

  editingUtilityKey = key;
  document.getElementById("utilityMode").textContent = "Chế độ: Sửa";

  document.getElementById("utilTitle").value = u.title || "";
  document.getElementById("utilType").value = u.type || "call";
  document.getElementById("utilValue").value = u.value || "";

  showTab("admin");
}

function deleteUtility(key) {
  if (!isAdmin) return;
  const u = allUtilityData[key];
  if (!u) return;
  if (!confirm(`Xóa tiện ích "${u.title}"?`)) return;

  db.ref("utilities/" + key).remove();
  if (editingUtilityKey === key) resetUtilityForm();
}

function resetUtilityForm() {
  editingUtilityKey = null;
  document.getElementById("utilityMode").textContent = "Chế độ: Thêm mới";
  document.getElementById("utilTitle").value = "";
  document.getElementById("utilType").value = "call";
  document.getElementById("utilValue").value = "";
}

/* =========================
   Admin auth (password)
========================= */
function loginAdmin() {
  const pass = (document.getElementById("adminPass").value || "").trim();

  // đổi mật khẩu tại đây nếu muốn
  if (pass === "DOANHATU2025") {
    isAdmin = true;
    document.getElementById("adminAuth").style.display = "none";
    document.getElementById("adminPanel").style.display = "block";
    document.getElementById("btnLogout").style.display = "inline-flex";

    // re-render to show edit/delete controls
    renderLocations();
    renderUtilities();

    alert("✅ Admin đã đăng nhập.");
  } else {
    alert("Sai mật khẩu.");
  }
}

function logoutAdmin() {
  isAdmin = false;
  editingLocationKey = null;
  editingUtilityKey = null;

  document.getElementById("adminPass").value = "";
  document.getElementById("adminAuth").style.display = "block";
  document.getElementById("adminPanel").style.display = "none";
  document.getElementById("btnLogout").style.display = "none";

  resetLocationForm();
  resetUtilityForm();

  // hide admin controls in lists
  renderLocations();
  renderUtilities();
}

/* default tab */
showTab("home");