/* =========================
   Firebase
========================= */
const firebaseConfig = {
  apiKey: "AIzaSyDf0zIgG5445L5k9YhSIN7KSo12uslI-6Y",
  authDomain: "hatumap.firebaseapp.com",
  databaseURL: "https://hatumap-default-rtdb.firebaseio.com",
  projectId: "hatumap",
  storageBucket: "hatumap.firebasestorage.app",
  messagingSenderId: "867387956570",
  appId: "1:867387956570:web:e2e91a942735da76db6763",
  measurementId: "G-2DLNK3SM7B"
};


firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

const ADMIN_UID = "NZYYYPTukCh6OBBI1yZm5fqvMbB2";

/* =========================
   State
========================= */
let isAdmin = false;
let editingLocationKey = null;
let editingUtilityKey = null;
let editingNewsKey = null;
let editingHomeCardKey = null;

let markersByKey = {};
let allLocationData = {};
let allUtilityData = {};
let tempLocationImages = [];
let markerClusterPolygon = null;

let routeControl = null;
let currentUserLatLng = null;
let searchMarker = null;
let tempMarker = null;

let siteContentData = {
  logoUrl: "",
  heroMediaType: "image",
  heroMediaUrl: "",
  homeCards: {}
};

let newsData = {};

/* =========================
   Helpers
========================= */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseImages(raw) {
  if (!raw) return [];
  return raw
    .split(/[\n,]+/g)
    .map(s => s.trim())
    .filter(Boolean);
}

function normalizeUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function setActiveTabButton(tab) {
  document.querySelectorAll(".tabbtn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
}

function setAdminAuthStatus(text = "", isError = false) {
  const el = document.getElementById("adminAuthStatus");
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? "#b42318" : "#64748B";
}

function openLink(url) {
  const safeUrl = normalizeUrl(url);
  if (!safeUrl) return;
  window.open(safeUrl, "_blank", "noopener,noreferrer");
}

function callNumber(num) {
  const phone = String(num || "").trim();
  if (!phone) return;
  window.location.href = `tel:${phone}`;
}

function openWeather() {
  window.open(
    "https://www.google.com/search?q=th%E1%BB%9Di+ti%E1%BA%BFt+H%C3%A0+Tu+Qu%E1%BA%A3ng+Ninh",
    "_blank",
    "noopener,noreferrer"
  );
}

function googleDirectionsLink(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

function getImagesField() {
  return document.getElementById("images");
}

function syncImagesField() {
  const imagesEl = getImagesField();
  if (imagesEl) imagesEl.value = tempLocationImages.join("\n");
}

function setUploadStatus(text, isError = false) {
  const box = document.getElementById("locationUploadStatus");
  if (!box) return;
  box.textContent = text || "";
  box.style.color = isError ? "#b91c1c" : "";
}

function setLocationIconStatus(text, isError = false) {
  const box = document.getElementById("locationIconStatus");
  if (!box) return;
  box.textContent = text || "";
  box.style.color = isError ? "#b91c1c" : "";
}

function isAdminUser(user) {
  return !!(user && user.uid === ADMIN_UID);
}

function requireAdmin() {
  if (!isAdmin) {
    alert("Bạn chưa đăng nhập admin hoặc không có quyền.");
    throw new Error("Admin permission required");
  }
}

function showTab(tab) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  const activeTab = document.getElementById("tab-" + tab);
  if (activeTab) activeTab.classList.add("active");

  setActiveTabButton(tab);

  const app = document.querySelector(".app");
  if (app) {
    if (tab === "locations") {
      app.classList.add("show-map");
    } else {
      app.classList.remove("show-map");
      clearRouteOnMap();
    }
  }

  setTimeout(() => {
    map.invalidateSize();
  }, 250);
}

/* =========================
   Map
========================= */
const map = L.map("map", {
  center: [20.943, 107.112],
  zoom: 15,
  minZoom: 12,
  maxZoom: 18
}).setView([20.943, 107.112], 15);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap"
}).addTo(map);

map.on("click", (e) => {
  if (!isAdmin) return;

  const latEl = document.getElementById("lat");
  const lngEl = document.getElementById("lng");
  if (!latEl || !lngEl) return;

  latEl.value = e.latlng.lat.toFixed(6);
  lngEl.value = e.latlng.lng.toFixed(6);

  if (tempMarker) map.removeLayer(tempMarker);

  tempMarker = L.marker(e.latlng)
    .addTo(map)
    .bindPopup("📍 Đã chọn vị trí")
    .openPopup();
});

function fitAllMarkers() {
  const latlngs = Object.values(allLocationData)
    .map(d => L.latLng(Number(d.lat), Number(d.lng)))
    .filter(ll => Number.isFinite(ll.lat) && Number.isFinite(ll.lng));

  if (!latlngs.length) return;

  let bounds = L.latLngBounds(latlngs);
  const north = bounds.getNorth() + 0.01;
  const south = bounds.getSouth() - 0.01;
  const east = bounds.getEast() + 0.01;
  const west = bounds.getWest() - 0.01;

  bounds = L.latLngBounds([south, west], [north, east]);
  map.fitBounds(bounds);
}

/* =========================
   Routing
========================= */
function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Trình duyệt không hỗ trợ định vị"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve([position.coords.latitude, position.coords.longitude]),
      (error) => reject(error),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

async function showRouteOnMap(destinationLat, destinationLng) {
  try {
    showTab("locations");

    const start = await getUserLocation();
    currentUserLatLng = start;

    if (routeControl) {
      map.removeControl(routeControl);
      routeControl = null;
    }

    if (!L.Routing) {
      alert("Bạn chưa nạp thư viện Leaflet Routing Machine.");
      return;
    }

    routeControl = L.Routing.control({
      waypoints: [
        L.latLng(start[0], start[1]),
        L.latLng(destinationLat, destinationLng)
      ],
      routeWhileDragging: false,
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: true,
      show: true,
      lineOptions: {
        styles: [{ color: "#2E8AED", opacity: 0.9, weight: 6 }]
      },
      createMarker: function (i, wp) {
        if (i === 0) return L.marker(wp.latLng).bindPopup("📍 Vị trí của bạn");
        return L.marker(wp.latLng).bindPopup("🎯 Điểm đến");
      }
    }).addTo(map);
  } catch (err) {
    console.error(err);
    alert("Không lấy được vị trí hiện tại. Hãy cho phép quyền truy cập vị trí.");
  }
}

function clearRouteOnMap() {
  if (routeControl) {
    map.removeControl(routeControl);
    routeControl = null;
  }
}

/* =========================
   Cloudinary
========================= */
const CLOUDINARY_KEY = "doan_hatu_cloudinary_v1";

function getCloudinarySettings() {
  try {
    return JSON.parse(localStorage.getItem(CLOUDINARY_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveCloudinarySettings() {
  requireAdmin();

  const cloudName = (document.getElementById("cloudName")?.value || "").trim();
  const uploadPreset = (document.getElementById("uploadPreset")?.value || "").trim();

  localStorage.setItem(CLOUDINARY_KEY, JSON.stringify({ cloudName, uploadPreset }));
  alert("Đã lưu cấu hình upload ảnh.");
}

function hydrateCloudinarySettings() {
  const cfg = getCloudinarySettings();
  const cloudNameEl = document.getElementById("cloudName");
  const uploadPresetEl = document.getElementById("uploadPreset");

  if (cloudNameEl) cloudNameEl.value = cfg.cloudName || "";
  if (uploadPresetEl) uploadPresetEl.value = cfg.uploadPreset || "";
}

async function uploadSingleFileToCloudinary(file, cloudName, uploadPreset) {
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", uploadPreset);
  form.append("folder", "doan-thanh-nien/locations");

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
    { method: "POST", body: form }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Upload thất bại");
  }

  const data = await response.json();
  if (!data.secure_url) throw new Error("Cloudinary không trả về secure_url");
  return data.secure_url;
}

async function uploadFileToCloudinary(file, resourceType = "image") {
  const { cloudName, uploadPreset } = getCloudinarySettings();

  if (!cloudName || !uploadPreset) throw new Error("Thiếu cấu hình Cloudinary");

  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", uploadPreset);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/upload`,
    { method: "POST", body: form }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Upload thất bại");
  }

  const data = await response.json();
  if (!data.secure_url) throw new Error("Không lấy được secure_url");
  return data.secure_url;
}

async function uploadLocationImages() {
  requireAdmin();

  const input = document.getElementById("locationFiles");
  const files = Array.from(input?.files || []);
  if (!files.length) return alert("Vui lòng chọn ít nhất 1 ảnh.");

  const { cloudName, uploadPreset } = getCloudinarySettings();
  if (!cloudName || !uploadPreset) return alert("Bạn chưa cấu hình Cloudinary.");

  try {
    setUploadStatus("Đang tải ảnh lên...");
    const urls = [];

    for (const file of files) {
      const url = await uploadSingleFileToCloudinary(file, cloudName, uploadPreset);
      urls.push(url);
    }

    tempLocationImages = tempLocationImages.concat(urls);
    if (input) input.value = "";

    renderLocationPreview();
    setUploadStatus(`Đã tải lên ${urls.length} ảnh.`);
  } catch (error) {
    console.error(error);
    setUploadStatus("Upload thất bại. Kiểm tra lại cloud name / upload preset.", true);
    alert("Upload ảnh thất bại.");
  }
}

async function uploadLocationIcon() {
  requireAdmin();

  const input = document.getElementById("locationIconFile");
  const file = input?.files?.[0];
  if (!file) return alert("Vui lòng chọn logo ghim.");

  try {
    setLocationIconStatus("Đang tải logo ghim...");
    const { cloudName, uploadPreset } = getCloudinarySettings();
    if (!cloudName || !uploadPreset) return alert("Bạn chưa cấu hình Cloudinary.");

    const url = await uploadSingleFileToCloudinary(file, cloudName, uploadPreset);
    document.getElementById("locationIconUrl").value = url;

    setLocationIconStatus("Đã tải logo ghim lên.");
    input.value = "";
  } catch (err) {
    console.error(err);
    setLocationIconStatus("Upload logo ghim thất bại.", true);
    alert("Upload logo ghim thất bại.");
  }
}

/* =========================
   Marker UI
========================= */
function buildCustomLocationIcon(iconUrl) {
  const hasImage = !!iconUrl;

  return L.divIcon({
    className: "custom-location-marker",
    html: `
      <div class="custom-marker-wrap">
        <div class="custom-marker-pin">
          <div class="custom-marker-badge ${hasImage ? "" : "custom-marker-badge--fallback"}">
            ${hasImage ? `<img src="${escapeHtml(iconUrl)}" alt="Logo">` : "📍"}
          </div>
        </div>
      </div>
    `,
    iconSize: [54, 68],
    iconAnchor: [27, 68],
    popupAnchor: [0, -58]
  });
}

function renderLocationPreview() {
  const box = document.getElementById("locationImagePreview");
  if (!box) return;

  syncImagesField();

  if (!tempLocationImages.length) {
    box.innerHTML = '<div class="small muted">Chưa có ảnh nào.</div>';
    return;
  }

  box.innerHTML = tempLocationImages.map((url, index) => `
    <div class="preview-card">
      <img src="${escapeHtml(url)}" alt="Ảnh ${index + 1}" />
      <button type="button" class="preview-remove" onclick="removeTempImage(${index})">×</button>
    </div>
  `).join("");
}

function removeTempImage(index) {
  tempLocationImages.splice(index, 1);
  renderLocationPreview();
}

/* =========================
   Locations
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
      <button type="button" class="route-web-btn" onclick="showRouteOnMap(${lat}, ${lng})">🗺 Chỉ đường trên web</button>
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
  if (count) count.textContent = `${keys.length} mục`;
  if (!list) return;

  list.innerHTML = "";

  const filteredKeys = keys.filter(k => {
    const d = allLocationData[k] || {};
    const hay = `${d.name || ""} ${d.desc || ""}`.toLowerCase();
    return !filter || hay.includes(filter);
  });

  if (!filteredKeys.length) {
    list.innerHTML = `<div class="small muted">Chưa có địa điểm phù hợp.</div>`;
    return;
  }

  filteredKeys
    .sort((a, b) => (allLocationData[a].name || "").localeCompare(allLocationData[b].name || ""))
    .forEach(key => {
      const d = allLocationData[key];
      const div = document.createElement("div");
      div.className = "item-card";

      const firstImg = (d.images && d.images.length) ? d.images[0] : "";

      div.innerHTML = `
        <div style="display:flex; gap:10px; align-items:flex-start;">
          ${firstImg ? `<img src="${escapeHtml(firstImg)}" alt="Ảnh" style="width:72px;height:54px;object-fit:cover;border-radius:10px;border:1px solid rgba(0,0,0,.08);">` : ""}
          <div style="flex:1;">
            <div style="font-weight:900;color:#1831AE;">${escapeHtml(d.name)}</div>
            <div class="small muted" style="margin-top:2px;">${escapeHtml(d.desc || "")}</div>
            <div class="popup-actions" style="margin-top:8px;">
              <a href="${googleDirectionsLink(d.lat, d.lng)}" target="_blank">🚗 Chỉ đường</a>
              <button type="button" class="route-web-btn" onclick="event.stopPropagation(); showRouteOnMap(${Number(d.lat)}, ${Number(d.lng)})">🗺 Trên web</button>
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
        showTab("locations");
        const lat = Number(d.lat);
        const lng = Number(d.lng);
        map.flyTo([lat, lng], 16);

        const marker = markersByKey[key];
        if (marker) marker.openPopup();
      };

      list.appendChild(div);
    });
}

function cross(o, a, b) {
  return (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);
}

function convexHull(points) {
  if (points.length < 3) return points;

  const pts = [...points].sort((p1, p2) => {
    if (p1.lng === p2.lng) return p1.lat - p2.lat;
    return p1.lng - p2.lng;
  });

  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function refreshMarkerClusterPolygon() {
  if (markerClusterPolygon) {
    map.removeLayer(markerClusterPolygon);
    markerClusterPolygon = null;
  }

  const points = Object.values(allLocationData)
    .map(d => ({ lat: Number(d.lat), lng: Number(d.lng) }))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  if (points.length < 3) return;

  const hull = convexHull(points);
  const hullLatLngs = hull.map(p => [p.lat, p.lng]);

  markerClusterPolygon = L.polygon(hullLatLngs, {
    color: "#d32f2f",
    weight: 3,
    fillColor: "#ef9a9a",
    fillOpacity: 0.12
  }).addTo(map);

  markerClusterPolygon.bindTooltip("Khu vực các điểm đã ghim", {
    permanent: false,
    direction: "center",
    className: "marker-polygon-label"
  });
}

function refreshMarkers() {
  clearAllMarkers();

  Object.keys(allLocationData).forEach(key => {
    const d = allLocationData[key];
    const lat = Number(d.lat);
    const lng = Number(d.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const markerIcon = buildCustomLocationIcon(d.iconUrl || "");
    const marker = L.marker([lat, lng], { icon: markerIcon }).addTo(map);

    marker.bindPopup(buildLocationPopupHtml(d));
    markersByKey[key] = marker;
  });

  refreshMarkerClusterPolygon();
}

db.ref("locations").on("value", (snap) => {
  const obj = {};
  snap.forEach(child => {
    obj[child.key] = child.val();
  });

  allLocationData = obj;
  refreshMarkers();
  renderLocations();
});

async function saveLocation() {
  requireAdmin();

  const name = (document.getElementById("name")?.value || "").trim();
  const desc = (document.getElementById("desc")?.value || "").trim();
  const lat = (document.getElementById("lat")?.value || "").trim();
  const lng = (document.getElementById("lng")?.value || "").trim();

  syncImagesField();
  const images = parseImages(document.getElementById("images")?.value || "");
  const locationIconUrl = (document.getElementById("locationIconUrl")?.value || "").trim();

  if (!name) return alert("Vui lòng nhập tên địa điểm.");
  if (!lat || !lng) return alert("Vui lòng bấm lên bản đồ để lấy tọa độ.");

  const payload = {
    name,
    desc,
    lat: Number(lat),
    lng: Number(lng),
    images,
    iconUrl: locationIconUrl
  };

  try {
    if (editingLocationKey) {
      await db.ref("locations/" + editingLocationKey).set(payload);
      editingLocationKey = null;
      const modeLabel = document.getElementById("locationMode");
      if (modeLabel) modeLabel.textContent = "Chế độ: Thêm mới";
      alert("Đã cập nhật địa điểm.");
    } else {
      await db.ref("locations").push(payload);
      alert("Đã thêm địa điểm.");
    }

    resetLocationForm();
  } catch (err) {
    console.error(err);
    alert("Lưu địa điểm thất bại.");
  }
}

function editLocation(key) {
  requireAdmin();

  const d = allLocationData[key];
  if (!d) return;

  editingLocationKey = key;
  document.getElementById("locationMode").textContent = "Chế độ: Sửa";
  document.getElementById("name").value = d.name || "";
  document.getElementById("desc").value = d.desc || "";
  document.getElementById("lat").value = Number(d.lat).toFixed(6);
  document.getElementById("lng").value = Number(d.lng).toFixed(6);

  tempLocationImages = Array.isArray(d.images) ? [...d.images] : [];
  syncImagesField();
  renderLocationPreview();

  document.getElementById("locationIconUrl").value = d.iconUrl || "";
  setLocationIconStatus(d.iconUrl ? "Đã có logo ghim cho địa điểm này." : "");

  map.flyTo([Number(d.lat), Number(d.lng)], 16);
  const m = markersByKey[key];
  if (m) m.openPopup();

  showTab("admin");
}

async function deleteLocation(key) {
  requireAdmin();

  const d = allLocationData[key];
  if (!d) return;
  if (!confirm(`Xóa địa điểm "${d.name}"?`)) return;

  try {
    await db.ref("locations/" + key).remove();
    if (editingLocationKey === key) resetLocationForm();
  } catch (err) {
    console.error(err);
    alert("Xóa địa điểm thất bại.");
  }
}

function resetLocationForm() {
  editingLocationKey = null;

  const locationMode = document.getElementById("locationMode");
  if (locationMode) locationMode.textContent = "Chế độ: Thêm mới";

  const ids = ["name", "desc", "lat", "lng", "locationFiles", "locationIconFile", "locationIconUrl"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  tempLocationImages = [];
  syncImagesField();
  renderLocationPreview();

  setUploadStatus("");
  setLocationIconStatus("");

  if (tempMarker) {
    map.removeLayer(tempMarker);
    tempMarker = null;
  }
}

function searchPlace() {
  const q = (document.getElementById("searchInput")?.value || "").trim();
  if (!q) return;

  showTab("locations");

  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`)
    .then(r => r.json())
    .then(res => {
      if (!res || !res.length) return alert("Không tìm thấy địa điểm.");

      const p = res[0];
      const lat = Number(p.lat);
      const lng = Number(p.lon);

      map.flyTo([lat, lng], 16);

      if (searchMarker) map.removeLayer(searchMarker);

      searchMarker = L.marker([lat, lng])
        .addTo(map)
        .bindPopup(`
          <div class="popup-title">${escapeHtml(p.display_name)}</div>
          <div class="popup-actions">
            <a target="_blank" href="${googleDirectionsLink(lat, lng)}">🚗 Chỉ đường Google Maps</a>
            <button type="button" class="route-web-btn" onclick="showRouteOnMap(${lat}, ${lng})">🗺 Chỉ đường trên web</button>
          </div>
        `)
        .openPopup();
    })
    .catch(err => {
      console.error(err);
      alert("Lỗi tìm kiếm. Vui lòng thử lại.");
    });
}

/* =========================
   Utilities
========================= */
function renderUtilities() {
  const box = document.getElementById("utilities-dynamic");
  if (!box) return;

  box.innerHTML = "";

  const keys = Object.keys(allUtilityData);
  if (!keys.length) {
    box.innerHTML = `<div class="small muted">Chưa có tiện ích do admin tạo.</div>`;
    return;
  }

  keys
    .sort((a, b) => (allUtilityData[a].title || "").localeCompare(allUtilityData[b].title || ""))
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

  if (u.type === "call") return callNumber(u.value);
  if (u.type === "link") return openLink(u.value);

  if (u.type === "map") {
    const parts = String(u.value || "").split(",");
    if (parts.length < 2) return alert("Tiện ích map phải có dạng: lat,lng");

    const lat = Number(parts[0].trim());
    const lng = Number(parts[1].trim());

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return alert("Tọa độ không hợp lệ.");

    showTab("locations");
    map.flyTo([lat, lng], 16);
    L.popup()
      .setLatLng([lat, lng])
      .setContent(`
        <div class="popup-title">${escapeHtml(u.title || "Tiện ích")}</div>
        <div class="popup-actions">
          <a target="_blank" href="${googleDirectionsLink(lat, lng)}">🚗 Chỉ đường Google Maps</a>
          <button type="button" class="route-web-btn" onclick="showRouteOnMap(${lat}, ${lng})">🗺 Chỉ đường trên web</button>
        </div>
      `)
      .openOn(map);
  }
}

db.ref("utilities").on("value", (snap) => {
  const obj = {};
  snap.forEach(child => {
    obj[child.key] = child.val();
  });

  allUtilityData = obj;
  renderUtilities();
});

async function saveUtility() {
  requireAdmin();

  const title = (document.getElementById("utilTitle")?.value || "").trim();
  const type = (document.getElementById("utilType")?.value || "call").trim();
  const valueRaw = (document.getElementById("utilValue")?.value || "").trim();

  if (!title) return alert("Vui lòng nhập tên tiện ích.");
  if (!valueRaw) return alert("Vui lòng nhập giá trị tiện ích.");

  const value = type === "link" ? normalizeUrl(valueRaw) : valueRaw;
  const payload = { title, type, value };

  try {
    if (editingUtilityKey) {
      await db.ref("utilities/" + editingUtilityKey).set(payload);
      editingUtilityKey = null;
      document.getElementById("utilityMode").textContent = "Chế độ: Thêm mới";
      alert("Đã cập nhật tiện ích.");
    } else {
      await db.ref("utilities").push(payload);
      alert("Đã thêm tiện ích.");
    }

    resetUtilityForm();
  } catch (err) {
    console.error(err);
    alert("Lưu tiện ích thất bại.");
  }
}

function editUtility(key) {
  requireAdmin();

  const u = allUtilityData[key];
  if (!u) return;

  editingUtilityKey = key;
  document.getElementById("utilityMode").textContent = "Chế độ: Sửa";
  document.getElementById("utilTitle").value = u.title || "";
  document.getElementById("utilType").value = u.type || "call";
  document.getElementById("utilValue").value = u.value || "";

  showTab("admin");
}

async function deleteUtility(key) {
  requireAdmin();

  const u = allUtilityData[key];
  if (!u) return;
  if (!confirm(`Xóa tiện ích "${u.title}"?`)) return;

  try {
    await db.ref("utilities/" + key).remove();
    if (editingUtilityKey === key) resetUtilityForm();
  } catch (err) {
    console.error(err);
    alert("Xóa tiện ích thất bại.");
  }
}

function resetUtilityForm() {
  editingUtilityKey = null;
  document.getElementById("utilityMode").textContent = "Chế độ: Thêm mới";
  document.getElementById("utilTitle").value = "";
  document.getElementById("utilType").value = "call";
  document.getElementById("utilValue").value = "";
}

/* =========================
   Admin auth with Firebase
========================= */
function applyAdminUi(user) {
  isAdmin = isAdminUser(user);

  const adminAuth = document.getElementById("adminAuth");
  const adminPanel = document.getElementById("adminPanel");
  const btnLogout = document.getElementById("btnLogout");
  const adminTabBtn = document.querySelector('.tabbtn[data-tab="admin"]');

  if (isAdmin) {
    if (adminAuth) adminAuth.style.display = "none";
    if (adminPanel) adminPanel.style.display = "block";
    if (btnLogout) btnLogout.style.display = "inline-flex";
    if (adminTabBtn) adminTabBtn.style.display = "inline-flex";

    hydrateCloudinarySettings();
    renderLocations();
    renderUtilities();
    renderLocationPreview();
    renderLatestNews();
    renderAdminNews();
    renderAdminHomeCards();
    setAdminAuthStatus("");
  } else {
    if (adminAuth) adminAuth.style.display = "block";
    if (adminPanel) adminPanel.style.display = "none";
    if (btnLogout) btnLogout.style.display = "none";
    if (adminTabBtn) adminTabBtn.style.display = "inline-flex";
  }
}

async function loginAdmin() {
  const email = (document.getElementById("adminEmail")?.value || "").trim();
  const pass = (document.getElementById("adminPass")?.value || "").trim();

  if (!email || !pass) {
    setAdminAuthStatus("Vui lòng nhập email và mật khẩu.", true);
    return;
  }

  try {
    setAdminAuthStatus("Đang đăng nhập...");
    const cred = await auth.signInWithEmailAndPassword(email, pass);

    if (!isAdminUser(cred.user)) {
      await auth.signOut();
      setAdminAuthStatus("Tài khoản này không phải admin.", true);
      return;
    }

    setAdminAuthStatus("Đăng nhập thành công.");
    alert("✅ Admin đã đăng nhập.");
  } catch (err) {
    console.error("Firebase login error:", err);

    // 👇 HIỆN LỖI THẬT
    setAdminAuthStatus(
      `Lỗi: ${err.code || "unknown"} - ${err.message || ""}`,
      true
    );
  }
}

async function logoutAdmin() {
  try {
    await auth.signOut();
    alert("Đã đăng xuất admin.");
  } catch (err) {
    console.error(err);
    alert("Đăng xuất thất bại.");
  }
}

async function sendAdminPasswordReset() {
  const email = (document.getElementById("adminEmail")?.value || "").trim();
  if (!email) {
    setAdminAuthStatus("Nhập email admin để gửi link đặt lại mật khẩu.", true);
    return;
  }

  try {
    auth.languageCode = "vi";
    await auth.sendPasswordResetEmail(email);
    setAdminAuthStatus("Đã gửi email đặt lại mật khẩu.");
  } catch (err) {
    console.error(err);
    setAdminAuthStatus("Không gửi được email đặt lại mật khẩu.", true);
  }
}

auth.onAuthStateChanged((user) => {
  applyAdminUi(user);

  if (!isAdminUser(user)) {
    editingLocationKey = null;
    editingUtilityKey = null;
    editingNewsKey = null;
    editingHomeCardKey = null;

    const passEl = document.getElementById("adminPass");
    if (passEl) passEl.value = "";

    resetLocationForm();
    resetUtilityForm();
    resetNewsForm();
    resetHomeCardForm();
    renderLocations();
    renderUtilities();
  }
});

/* =========================
   Firebase listeners
========================= */
db.ref("siteContent").on("value", (snap) => {
  siteContentData = snap.val() || {
    logoUrl: "",
    heroMediaType: "image",
    heroMediaUrl: "",
    homeCards: {}
  };

  renderSiteLogo();
  renderHeroMedia();
  renderHomeCards();
  renderAdminHomeCards();
});

db.ref("news").on("value", (snap) => {
  const obj = {};
  snap.forEach(child => {
    obj[child.key] = child.val();
  });

  newsData = obj;
  renderLatestNews();
  renderAdminNews();
});

/* =========================
   Site logo
========================= */
function renderSiteLogo() {
  const logoEl = document.getElementById("siteLogo");
  if (!logoEl) return;
  if (siteContentData.logoUrl) logoEl.src = siteContentData.logoUrl;
}

async function uploadSiteLogo() {
  requireAdmin();

  const input = document.getElementById("logoFile");
  const file = input?.files?.[0];
  const status = document.getElementById("logoUploadStatus");

  if (!file) return alert("Vui lòng chọn logo.");

  try {
    if (status) status.textContent = "Đang tải logo lên...";
    const url = await uploadFileToCloudinary(file, "image");
    await db.ref("siteContent/logoUrl").set(url);
    if (status) status.textContent = "Đã cập nhật logo.";
    input.value = "";
  } catch (err) {
    console.error(err);
    if (status) status.textContent = "Upload logo thất bại.";
    alert("Upload logo thất bại.");
  }
}

/* =========================
   Hero media
========================= */
function renderHeroMedia() {
  const box = document.getElementById("heroMediaBox");
  if (!box) return;

  const type = siteContentData.heroMediaType || "image";
  const url = siteContentData.heroMediaUrl || "";

  if (!url) {
    box.innerHTML = `
      <div id="heroMediaPlaceholder">
        <div class="media-icon">▶</div>
        <div class="media-title">Khu vực nhúng video hoặc hình ảnh hoạt động đoàn</div>
        <div class="small muted" style="margin-top:6px;">Có thể thay bằng ảnh sự kiện, thông báo hoặc video YouTube.</div>
      </div>
    `;
    return;
  }

  if (type === "image") {
    box.innerHTML = `<img class="dynamic-media" src="${escapeHtml(url)}" alt="Banner hoạt động">`;
    return;
  }

  if (type === "video") {
    box.innerHTML = `<video class="dynamic-video" controls src="${escapeHtml(url)}"></video>`;
    return;
  }

  if (type === "youtube") {
    box.innerHTML = `<iframe class="dynamic-iframe" src="${escapeHtml(url)}" allowfullscreen></iframe>`;
  }
}

async function uploadHeroMedia() {
  requireAdmin();

  const type = document.getElementById("heroMediaType")?.value || "image";
  const input = document.getElementById("heroMediaFile");
  const file = input?.files?.[0];
  const status = document.getElementById("heroMediaStatus");

  if (!file) return alert("Vui lòng chọn file ảnh hoặc video.");

  try {
    if (status) status.textContent = "Đang tải media lên...";
    const resourceType = type === "video" ? "video" : "image";
    const url = await uploadFileToCloudinary(file, resourceType);
    document.getElementById("heroMediaUrl").value = url;
    if (status) status.textContent = "Đã tải media lên. Bấm 'Lưu media' để áp dụng.";
    input.value = "";
  } catch (err) {
    console.error(err);
    if (status) status.textContent = "Upload media thất bại.";
    alert("Upload media thất bại.");
  }
}

async function saveHeroMedia() {
  requireAdmin();

  const type = document.getElementById("heroMediaType")?.value || "image";
  const rawUrl = (document.getElementById("heroMediaUrl")?.value || "").trim();
  const url = type === "youtube" ? rawUrl : normalizeUrl(rawUrl);

  if (!url) return alert("Vui lòng nhập hoặc tải URL media.");

  try {
    await db.ref("siteContent").update({
      heroMediaType: type,
      heroMediaUrl: url
    });

    const status = document.getElementById("heroMediaStatus");
    if (status) status.textContent = "Đã lưu media trang chủ.";
  } catch (err) {
    console.error(err);
    alert("Lưu media thất bại.");
  }
}

/* =========================
   Home cards
========================= */
function renderHomeCards() {
  const box = document.getElementById("homeCards");
  if (!box) return;

  const cards = Object.entries(siteContentData.homeCards || {});
  if (!cards.length) return;

  box.innerHTML = cards
    .slice(0, 3)
    .map(([, item]) => `
      <div class="info-card">
        ${
          item.imageUrl
            ? `<img class="home-card-image" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title || "")}">`
            : `<div class="info-card__thumb">Hình ảnh</div>`
        }
        <h4>${escapeHtml(item.title || "")}</h4>
        <p>${escapeHtml(item.desc || "")}</p>
      </div>
    `)
    .join("");
}

function renderAdminHomeCards() {
  const box = document.getElementById("adminHomeCardList");
  if (!box) return;

  const cards = Object.entries(siteContentData.homeCards || {});
  if (!cards.length) {
    box.innerHTML = `<div class="small muted">Chưa có khối hình trang chủ.</div>`;
    return;
  }

  box.innerHTML = cards.map(([key, item]) => `
    <div class="item-card">
      <div style="font-weight:900;color:#1831AE;">${escapeHtml(item.title || "")}</div>
      <div class="small muted" style="margin-top:4px;">${escapeHtml(item.desc || "")}</div>
      <div style="display:flex; gap:8px; margin-top:10px;">
        <button class="btn btn-ghost" onclick="editHomeCard('${key}')">Sửa</button>
        <button class="btn" style="background:linear-gradient(135deg,#F63E1D,#EF4444);" onclick="deleteHomeCard('${key}')">Xóa</button>
      </div>
    </div>
  `).join("");
}

async function uploadHomeCardImage() {
  requireAdmin();

  const input = document.getElementById("homeCardFile");
  const file = input?.files?.[0];
  const status = document.getElementById("homeCardStatus");

  if (!file) return alert("Vui lòng chọn ảnh khối.");

  try {
    if (status) status.textContent = "Đang tải ảnh khối lên...";
    const url = await uploadFileToCloudinary(file, "image");
    document.getElementById("homeCardImageUrl").value = url;
    if (status) status.textContent = "Đã tải ảnh lên. Bấm 'Lưu khối hình'.";
    input.value = "";
  } catch (err) {
    console.error(err);
    if (status) status.textContent = "Upload ảnh khối thất bại.";
    alert("Upload ảnh khối thất bại.");
  }
}

async function saveHomeCard() {
  requireAdmin();

  const title = (document.getElementById("homeCardTitle")?.value || "").trim();
  const desc = (document.getElementById("homeCardDesc")?.value || "").trim();
  const imageUrl = normalizeUrl(document.getElementById("homeCardImageUrl")?.value || "");

  if (!title) return alert("Vui lòng nhập tiêu đề khối.");

  const payload = { title, desc, imageUrl };

  try {
    if (editingHomeCardKey) {
      await db.ref("siteContent/homeCards/" + editingHomeCardKey).set(payload);
      editingHomeCardKey = null;
    } else {
      await db.ref("siteContent/homeCards").push(payload);
    }

    resetHomeCardForm();

    const status = document.getElementById("homeCardStatus");
    if (status) status.textContent = "Đã lưu khối hình.";
  } catch (err) {
    console.error(err);
    alert("Lưu khối hình thất bại.");
  }
}

function editHomeCard(key) {
  requireAdmin();

  const item = siteContentData.homeCards?.[key];
  if (!item) return;

  editingHomeCardKey = key;
  document.getElementById("homeCardTitle").value = item.title || "";
  document.getElementById("homeCardDesc").value = item.desc || "";
  document.getElementById("homeCardImageUrl").value = item.imageUrl || "";
  showTab("admin");
}

async function deleteHomeCard(key) {
  requireAdmin();
  if (!confirm("Xóa khối hình này?")) return;

  try {
    await db.ref("siteContent/homeCards/" + key).remove();
    if (editingHomeCardKey === key) resetHomeCardForm();
  } catch (err) {
    console.error(err);
    alert("Xóa khối hình thất bại.");
  }
}

function resetHomeCardForm() {
  editingHomeCardKey = null;
  const ids = ["homeCardTitle", "homeCardDesc", "homeCardImageUrl", "homeCardFile"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const statusEl = document.getElementById("homeCardStatus");
  if (statusEl) statusEl.textContent = "";
}

/* =========================
   News
========================= */
function renderLatestNews() {
  const box = document.getElementById("latestNewsList");
  if (!box) return;

  const items = Object.entries(newsData)
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  if (!items.length) {
    box.innerHTML = `<div class="small muted">Chưa có bản tin mới.</div>`;
    return;
  }

  box.innerHTML = items.map(([, item]) => `
    <div class="news-card">
      <div class="news-card__title">${escapeHtml(item.title || "")}</div>
      <div class="news-card__desc">${escapeHtml(item.desc || "")}</div>
      ${item.link ? `<a href="${escapeHtml(item.link)}" target="_blank">Xem chi tiết</a>` : ""}
    </div>
  `).join("");
}

function renderAdminNews() {
  const box = document.getElementById("adminNewsList");
  if (!box) return;

  const items = Object.entries(newsData)
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  if (!items.length) {
    box.innerHTML = `<div class="small muted">Chưa có bản tin.</div>`;
    return;
  }

  box.innerHTML = items.map(([key, item]) => `
    <div class="item-card">
      <div style="font-weight:900;color:#1831AE;">${escapeHtml(item.title || "")}</div>
      <div class="small muted" style="margin-top:4px;">${escapeHtml(item.desc || "")}</div>
      <div style="display:flex; gap:8px; margin-top:10px;">
        <button class="btn btn-ghost" onclick="editNewsItem('${key}')">Sửa</button>
        <button class="btn" style="background:linear-gradient(135deg,#F63E1D,#EF4444);" onclick="deleteNewsItem('${key}')">Xóa</button>
      </div>
    </div>
  `).join("");
}

async function saveNewsItem() {
  requireAdmin();

  const title = (document.getElementById("newsTitle")?.value || "").trim();
  const desc = (document.getElementById("newsDesc")?.value || "").trim();
  const link = normalizeUrl(document.getElementById("newsLink")?.value || "");

  if (!title) return alert("Vui lòng nhập tiêu đề bản tin.");

  try {
    if (editingNewsKey) {
      await db.ref("news/" + editingNewsKey).update({
        title,
        desc,
        link,
        updatedAt: Date.now()
      });
    } else {
      await db.ref("news").push({
        title,
        desc,
        link,
        createdAt: Date.now()
      });
    }

    resetNewsForm();
  } catch (err) {
    console.error(err);
    alert("Lưu bản tin thất bại.");
  }
}

function editNewsItem(key) {
  requireAdmin();

  const item = newsData[key];
  if (!item) return;

  editingNewsKey = key;
  document.getElementById("newsTitle").value = item.title || "";
  document.getElementById("newsDesc").value = item.desc || "";
  document.getElementById("newsLink").value = item.link || "";
  showTab("admin");
}

async function deleteNewsItem(key) {
  requireAdmin();
  if (!confirm("Xóa bản tin này?")) return;

  try {
    await db.ref("news/" + key).remove();
    if (editingNewsKey === key) resetNewsForm();
  } catch (err) {
    console.error(err);
    alert("Xóa bản tin thất bại.");
  }
}

function resetNewsForm() {
  editingNewsKey = null;
  const ids = ["newsTitle", "newsDesc", "newsLink"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

/* =========================
   Init
========================= */
window.addEventListener("load", () => {
  showTab("home");
  hydrateCloudinarySettings();
  renderLocationPreview();

  setTimeout(() => {
    map.invalidateSize();
  }, 300);
});