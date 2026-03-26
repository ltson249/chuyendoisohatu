/* script.js */

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

let db = null;
let auth = null;

try {
  if (typeof firebase !== "undefined" && firebase?.apps) {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.database();
    auth = firebase.auth();
  } else {
    console.warn("Firebase chưa được nạp.");
  }
} catch (err) {
  console.error("Lỗi khởi tạo Firebase:", err);
}

const ADMIN_UID = "NZYYYPTukCh6OBBI1yZm5fqvMbB2";
const CHATBOT_API_URL = window.CHATBOT_API_URL || "";

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

let chatbotOpen = false;
let chatHistory = [];
let speechRecognition = null;
let isVoiceListening = false;

let map = null;

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

function slugifyText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function safeCategoryName(value) {
  const raw = String(value || "").trim();
  return raw || "Chưa phân loại";
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

function ensureDb() {
  if (!db) {
    alert("Firebase Database chưa sẵn sàng. Hãy kiểm tra lại kết nối hoặc cấu hình.");
    throw new Error("Database unavailable");
  }
}

function ensureAuth() {
  if (!auth) {
    alert("Firebase Auth chưa sẵn sàng. Hãy kiểm tra lại kết nối hoặc cấu hình.");
    throw new Error("Auth unavailable");
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
    if (map && typeof map.invalidateSize === "function") {
      map.invalidateSize();
    }
  }, 250);
}

/* =========================
   Map
========================= */
function initMap() {
  const mapEl = document.getElementById("map");
  if (!mapEl) {
    console.warn("Không tìm thấy #map");
    return;
  }

  if (typeof L === "undefined") {
    console.warn("Leaflet chưa được nạp.");
    return;
  }

  try {
    map = L.map("map", {
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
  } catch (err) {
    console.error("Lỗi khởi tạo bản đồ:", err);
    map = null;
  }
}

function fitAllMarkers() {
  if (!map || typeof L === "undefined") return;

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
    if (!map) {
      alert("Bản đồ chưa sẵn sàng.");
      return;
    }

    showTab("locations");
    const start = await getUserLocation();
    currentUserLatLng = start;

    if (routeControl && map) {
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
        styles: [{ color: "#0F4C81", opacity: 0.9, weight: 6 }]
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
  if (routeControl && map) {
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

  const data = await response.json();
  if (!response.ok || !data.secure_url) {
    throw new Error(data?.error?.message || "Upload thất bại");
  }
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

  const data = await response.json();
  if (!response.ok || !data.secure_url) {
    throw new Error(data?.error?.message || "Upload thất bại");
  }
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
  const name = escapeHtml(d.name || "Địa điểm");
  const desc = escapeHtml(d.desc || "");
  const category = escapeHtml(safeCategoryName(d.category));
  const lat = Number(d.lat);
  const lng = Number(d.lng);
  const images = Array.isArray(d.images) ? d.images : [];

  const imagesHtml = images.length
    ? `<div class="popup-images">${images.slice(0, 8).map(url => `<img src="${escapeHtml(url)}" alt="Ảnh">`).join("")}</div>`
    : "";

  return `
    <div class="popup-title">${name}</div>
    <div class="popup-meta">Nhóm: ${category}</div>
    <div class="popup-desc">${desc}</div>
    <div class="popup-actions">
      <a href="${googleDirectionsLink(lat, lng)}" target="_blank">Chỉ đường Google Maps</a>
      <button type="button" class="route-web-btn" onclick="showRouteOnMap(${lat}, ${lng})">Chỉ đường trên web</button>
    </div>
    ${imagesHtml}
  `;
}

function clearAllMarkers() {
  if (!map) return;
  Object.values(markersByKey).forEach(m => map.removeLayer(m));
  markersByKey = {};
}

function getFilteredLocationEntries() {
  const filter = (document.getElementById("locationFilter")?.value || "").toLowerCase().trim();

  return Object.entries(allLocationData).filter(([, d]) => {
    const hay = `${d.name || ""} ${d.desc || ""} ${safeCategoryName(d.category)}`.toLowerCase();
    return !filter || hay.includes(filter);
  });
}

function renderLocations() {
  const list = document.getElementById("location-list");
  const count = document.getElementById("locationsCount");
  const filteredEntries = getFilteredLocationEntries();

  if (count) count.textContent = `${filteredEntries.length} mục`;
  if (!list) return;

  list.innerHTML = "";

  if (!filteredEntries.length) {
    list.innerHTML = `<div class="small muted">Chưa có địa điểm phù hợp.</div>`;
    return;
  }

  const grouped = {};
  filteredEntries.forEach(([key, d]) => {
    const category = safeCategoryName(d.category);
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push([key, d]);
  });

  Object.keys(grouped)
    .sort((a, b) => a.localeCompare(b, "vi"))
    .forEach(category => {
      const groupBox = document.createElement("div");
      groupBox.className = "location-group";

      const entries = grouped[category].sort((a, b) =>
        String(a[1].name || "").localeCompare(String(b[1].name || ""), "vi")
      );

      groupBox.innerHTML = `
        <div class="location-group__head">
          <div class="location-group__title">${escapeHtml(category)}</div>
          <div class="small muted">${entries.length} địa điểm</div>
        </div>
        <div class="location-group__list">
          ${entries.map(([key, d]) => {
            const firstImg = (d.images && d.images.length) ? d.images[0] : "";
            const lat = Number(d.lat);
            const lng = Number(d.lng);

            return `
              <div class="item-card location-item-card" onclick="focusLocation('${key}')">
                <div style="display:flex; gap:10px; align-items:flex-start;">
                  ${firstImg ? `<img src="${escapeHtml(firstImg)}" alt="Ảnh" style="width:72px;height:54px;object-fit:cover;border-radius:10px;border:1px solid rgba(0,0,0,.08);">` : ""}
                  <div style="flex:1;">
                    <div style="font-weight:800;color:#0B4F8A;">${escapeHtml(d.name || "")}</div>
                    <div class="small muted" style="margin-top:2px;">${escapeHtml(d.desc || "")}</div>
                    <div class="small muted" style="margin-top:4px;">Nhóm: ${escapeHtml(safeCategoryName(d.category))}</div>
                    <div class="popup-actions" style="margin-top:8px;">
                      <a href="${googleDirectionsLink(lat, lng)}" target="_blank" onclick="event.stopPropagation()">Chỉ đường</a>
                      <button type="button" class="route-web-btn" onclick="event.stopPropagation(); showRouteOnMap(${lat}, ${lng})">Trên web</button>
                    </div>
                  </div>
                </div>

                ${isAdmin ? `
                  <div style="display:flex; gap:8px; margin-top:10px;">
                    <button class="btn btn-ghost" onclick="event.stopPropagation(); editLocation('${key}')">Sửa</button>
                    <button class="btn btn-danger" onclick="event.stopPropagation(); deleteLocation('${key}')">Xóa</button>
                  </div>
                ` : ""}
              </div>
            `;
          }).join("")}
        </div>
      `;

      list.appendChild(groupBox);
    });
}

function focusLocation(key) {
  const d = allLocationData[key];
  if (!d || !map) return;
  showTab("locations");
  const lat = Number(d.lat);
  const lng = Number(d.lng);
  map.flyTo([lat, lng], 16);
  const marker = markersByKey[key];
  if (marker) marker.openPopup();
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
  if (!map || typeof L === "undefined") return;

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
    color: "#C62828",
    weight: 3,
    fillColor: "#f5b7b1",
    fillOpacity: 0.12
  }).addTo(map);

  markerClusterPolygon.bindTooltip("Khu vực các điểm đã ghim", {
    permanent: false,
    direction: "center",
    className: "marker-polygon-label"
  });
}

function refreshMarkers() {
  if (!map || typeof L === "undefined") return;

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

function bindLocationListener() {
  if (!db) return;

  db.ref("locations").on("value", (snap) => {
    const obj = {};
    snap.forEach(child => {
      obj[child.key] = child.val();
    });

    allLocationData = obj;
    refreshMarkers();
    renderLocations();
  }, (err) => {
    console.error("Lỗi đọc locations:", err);
  });
}

async function saveLocation() {
  requireAdmin();
  ensureDb();

  const name = (document.getElementById("name")?.value || "").trim();
  const category = safeCategoryName(document.getElementById("locationCategory")?.value || "");
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
    category,
    desc,
    lat: Number(lat),
    lng: Number(lng),
    images,
    iconUrl: locationIconUrl
  };

  try {
    if (editingLocationKey) {
      await db.ref("locations/" + editingLocationKey).update(payload);
      editingLocationKey = null;
      document.getElementById("locationMode").textContent = "Chế độ: Thêm mới";
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
  document.getElementById("locationCategory").value = d.category || "";
  document.getElementById("desc").value = d.desc || "";
  document.getElementById("lat").value = Number(d.lat).toFixed(6);
  document.getElementById("lng").value = Number(d.lng).toFixed(6);

  tempLocationImages = Array.isArray(d.images) ? [...d.images] : [];
  syncImagesField();
  renderLocationPreview();

  document.getElementById("locationIconUrl").value = d.iconUrl || "";
  setLocationIconStatus(d.iconUrl ? "Đã có logo marker." : "");

  showTab("admin");
}

async function deleteLocation(key) {
  requireAdmin();
  ensureDb();

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
  const modeEl = document.getElementById("locationMode");
  if (modeEl) modeEl.textContent = "Chế độ: Thêm mới";

  ["name", "locationCategory", "desc", "lat", "lng", "locationFiles", "locationIconFile", "locationIconUrl"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  tempLocationImages = [];
  syncImagesField();
  renderLocationPreview();
  setUploadStatus("");
  setLocationIconStatus("");

  if (tempMarker && map) {
    map.removeLayer(tempMarker);
    tempMarker = null;
  }
}

function searchPlaceByInputValue(query) {
  const q = String(query || "").trim();
  if (!q) return;

  showTab("locations");

  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`)
    .then(r => r.json())
    .then(res => {
      if (!res || !res.length) return alert("Không tìm thấy địa điểm.");
      if (!map) return alert("Bản đồ chưa sẵn sàng.");

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
            <a target="_blank" href="${googleDirectionsLink(lat, lng)}">Chỉ đường Google Maps</a>
            <button type="button" class="route-web-btn" onclick="showRouteOnMap(${lat}, ${lng})">Chỉ đường trên web</button>
          </div>
        `)
        .openPopup();
    })
    .catch(err => {
      console.error(err);
      alert("Lỗi tìm kiếm. Vui lòng thử lại.");
    });
}

function searchPlace() {
  const q = document.getElementById("searchInput")?.value || "";
  searchPlaceByInputValue(q);
}

function searchPlaceFromLocations() {
  const q = document.getElementById("locationSearchInput")?.value || "";
  searchPlaceByInputValue(q);
}

/* =========================
   Utilities
========================= */
function normalizeUtilityRecord(u = {}) {
  const title = u.title || u.name || u.label || u.text || "Tiện ích";
  let type = u.type || u.action || "";
  let value = u.value || u.url || u.link || u.phone || u.tel || "";

  if (!type) {
    if (u.phone || u.tel) {
      type = "call";
      value = u.phone || u.tel;
    } else if (
      (u.lat !== undefined && u.lng !== undefined) ||
      /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(String(value))
    ) {
      type = "map";
      if (!value && u.lat !== undefined && u.lng !== undefined) value = `${u.lat},${u.lng}`;
    } else {
      type = "link";
      value = u.url || u.link || value;
    }
  }

  if (type === "link") value = normalizeUrl(value);
  return { title, type, value, raw: u };
}

function renderUtilities() {
  const box = document.getElementById("utilities-dynamic");
  if (!box) return;

  box.innerHTML = "";

  const entries = Object.entries(allUtilityData || {});
  if (!entries.length) {
    box.innerHTML = `<div class="small muted">Chưa có tiện ích do admin tạo.</div>`;
    return;
  }

  entries
    .sort((a, b) => {
      const ua = normalizeUtilityRecord(a[1]);
      const ub = normalizeUtilityRecord(b[1]);
      return String(ua.title).localeCompare(String(ub.title), "vi");
    })
    .forEach(([key, raw]) => {
      const u = normalizeUtilityRecord(raw);

      const typeLabel =
        u.type === "call" ? "Gọi điện" :
        u.type === "link" ? "Liên kết" :
        "Chỉ đường";

      const div = document.createElement("div");
      div.className = "item-card";
      div.innerHTML = `
        <div style="display:flex; justify-content:space-between; gap:10px;">
          <div style="flex:1;">
            <div style="font-weight:800;color:#0B4F8A;">${escapeHtml(u.title)}</div>
            <div class="small muted">${typeLabel} • ${escapeHtml(u.value || "")}</div>
          </div>
          <div class="small muted">›</div>
        </div>

        ${isAdmin ? `
          <div style="display:flex; gap:8px; margin-top:10px;">
            <button class="btn btn-ghost" onclick="event.stopPropagation(); editUtility('${key}')">Sửa</button>
            <button class="btn btn-danger" onclick="event.stopPropagation(); deleteUtility('${key}')">Xóa</button>
          </div>
        ` : ""}
      `;
      div.onclick = () => runUtility(u);
      box.appendChild(div);
    });
}

function runUtility(u) {
  const item = normalizeUtilityRecord(u);
  const raw = item.raw || {};

  if (item.type === "call") {
    if (!item.value) return alert("Tiện ích này chưa có số điện thoại.");
    callNumber(item.value);
    return;
  }

  if (item.type === "link") {
    if (!item.value) return alert("Tiện ích này chưa có liên kết.");
    openLink(item.value);
    return;
  }

  if (item.type === "map") {
    const value = String(item.value || "").trim();
    let lat, lng;

    if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(value)) {
      const parts = value.split(",");
      lat = Number(parts[0].trim());
      lng = Number(parts[1].trim());
    } else if (raw.lat !== undefined && raw.lng !== undefined) {
      lat = Number(raw.lat);
      lng = Number(raw.lng);
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      alert("Tiện ích bản đồ chưa có tọa độ hợp lệ.");
      return;
    }

    showTab("locations");

    if (!map) {
      alert("Bản đồ chưa sẵn sàng.");
      return;
    }

    map.flyTo([lat, lng], 16);
    L.popup()
      .setLatLng([lat, lng])
      .setContent(`
        <div class="popup-title">${escapeHtml(item.title)}</div>
        <div class="popup-actions">
          <a target="_blank" href="${googleDirectionsLink(lat, lng)}">Chỉ đường Google Maps</a>
          <button type="button" class="route-web-btn" onclick="showRouteOnMap(${lat}, ${lng})">Chỉ đường trên web</button>
        </div>
      `)
      .openOn(map);
  }
}

function bindUtilityListener() {
  if (!db) return;

  db.ref("utilities").on("value", (snap) => {
    const obj = {};
    snap.forEach(child => {
      obj[child.key] = child.val();
    });

    allUtilityData = obj;
    renderUtilities();
  }, (err) => {
    console.error("Lỗi đọc utilities:", err);
  });
}

async function saveUtility() {
  requireAdmin();
  ensureDb();

  const title = (document.getElementById("utilTitle")?.value || "").trim();
  const type = (document.getElementById("utilType")?.value || "call").trim();
  const valueRaw = (document.getElementById("utilValue")?.value || "").trim();

  if (!title) return alert("Vui lòng nhập tên tiện ích.");
  if (!valueRaw) return alert("Vui lòng nhập giá trị tiện ích.");

  let value = valueRaw;
  if (type === "link") value = normalizeUrl(valueRaw);

  const payload = {
    title,
    type,
    value,
    name: title,
    label: title
  };

  if (type === "call") {
    payload.phone = value;
    payload.tel = value;
  }

  if (type === "link") {
    payload.url = value;
    payload.link = value;
  }

  if (type === "map") {
    const parts = String(value).split(",");
    if (parts.length >= 2) {
      const lat = Number(parts[0].trim());
      const lng = Number(parts[1].trim());
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        payload.lat = lat;
        payload.lng = lng;
      }
    }
  }

  try {
    if (editingUtilityKey) {
      await db.ref("utilities/" + editingUtilityKey).update(payload);
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

  const raw = allUtilityData[key];
  if (!raw) return;

  const u = normalizeUtilityRecord(raw);

  editingUtilityKey = key;
  document.getElementById("utilityMode").textContent = "Chế độ: Sửa";
  document.getElementById("utilTitle").value = u.title || "";
  document.getElementById("utilType").value = u.type || "call";
  document.getElementById("utilValue").value = u.value || "";

  showTab("admin");
}

async function deleteUtility(key) {
  requireAdmin();
  ensureDb();

  const raw = allUtilityData[key];
  const title = normalizeUtilityRecord(raw).title;

  if (!raw) return;
  if (!confirm(`Xóa tiện ích "${title}"?`)) return;

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
  const modeEl = document.getElementById("utilityMode");
  if (modeEl) modeEl.textContent = "Chế độ: Thêm mới";

  const titleEl = document.getElementById("utilTitle");
  const typeEl = document.getElementById("utilType");
  const valueEl = document.getElementById("utilValue");

  if (titleEl) titleEl.value = "";
  if (typeEl) typeEl.value = "call";
  if (valueEl) valueEl.value = "";
}

/* =========================
   Admin auth with Firebase
========================= */
function applyAdminUi(user) {
  isAdmin = isAdminUser(user);

  const adminAuth = document.getElementById("adminAuth");
  const adminPanel = document.getElementById("adminPanel");
  const btnLogout = document.getElementById("btnLogout");

  if (isAdmin) {
    if (adminAuth) adminAuth.style.display = "none";
    if (adminPanel) adminPanel.style.display = "block";
    if (btnLogout) btnLogout.style.display = "inline-flex";

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
  }
}

async function loginAdmin() {
  ensureAuth();

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
    setAdminAuthStatus(`Lỗi: ${err.code || "unknown"} - ${err.message || ""}`, true);
  }
}

async function logoutAdmin() {
  ensureAuth();
  try {
    await auth.signOut();
    alert("Đã đăng xuất admin.");
  } catch (err) {
    console.error(err);
    alert("Đăng xuất thất bại.");
  }
}

async function sendAdminPasswordReset() {
  ensureAuth();

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

function bindAuthListener() {
  if (!auth) return;

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
}

/* =========================
   Firebase listeners
========================= */
function bindSiteContentListener() {
  if (!db) return;

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
  }, (err) => {
    console.error("Lỗi đọc siteContent:", err);
  });
}

function bindNewsListener() {
  if (!db) return;

  db.ref("news").on("value", (snap) => {
    const obj = {};
    snap.forEach(child => {
      obj[child.key] = child.val();
    });

    newsData = obj;
    renderLatestNews();
    renderAdminNews();
  }, (err) => {
    console.error("Lỗi đọc news:", err);
  });
}

/* =========================
   Site logo
========================= */
function renderSiteLogo() {
  const logoEl = document.getElementById("siteLogo");
  if (!logoEl) return;

  const defaultSrc =
    logoEl.getAttribute("data-default-src") ||
    logoEl.getAttribute("src") ||
    "https://dummyimage.com/96x96/e5eefb/1831ae.png&text=Logo";

  const logoUrl =
    siteContentData?.logoUrl ||
    siteContentData?.logo ||
    siteContentData?.siteLogo ||
    "";

  logoEl.src = logoUrl || defaultSrc;
}

async function uploadSiteLogo() {
  requireAdmin();
  ensureDb();

  const input = document.getElementById("logoFile");
  const file = input?.files?.[0];
  const status = document.getElementById("logoUploadStatus");

  if (!file) return alert("Vui lòng chọn logo.");

  try {
    if (status) status.textContent = "Đang tải logo lên...";
    const url = await uploadFileToCloudinary(file, "image");
    await db.ref("siteContent").update({
      logoUrl: url,
      logo: url,
      siteLogo: url
    });
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
  ensureDb();

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

  box.innerHTML = cards.slice(0, 3).map(([, item]) => `
    <div class="info-card">
      ${item.imageUrl
        ? `<img class="home-card-image" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title || "")}">`
        : `<div class="info-card__thumb">Hình ảnh</div>`}
      <h4>${escapeHtml(item.title || "")}</h4>
      <p>${escapeHtml(item.desc || "")}</p>
    </div>
  `).join("");
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
      <div style="font-weight:800;color:#0B4F8A;">${escapeHtml(item.title || "")}</div>
      <div class="small muted" style="margin-top:4px;">${escapeHtml(item.desc || "")}</div>
      <div style="display:flex; gap:8px; margin-top:10px;">
        <button class="btn btn-ghost" onclick="editHomeCard('${key}')">Sửa</button>
        <button class="btn btn-danger" onclick="deleteHomeCard('${key}')">Xóa</button>
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
  ensureDb();

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
  ensureDb();

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
  ["homeCardTitle", "homeCardDesc", "homeCardImageUrl", "homeCardFile"].forEach(id => {
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

  const items = Object.entries(newsData).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

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

  const items = Object.entries(newsData).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  if (!items.length) {
    box.innerHTML = `<div class="small muted">Chưa có bản tin.</div>`;
    return;
  }

  box.innerHTML = items.map(([key, item]) => `
    <div class="item-card">
      <div style="font-weight:800;color:#0B4F8A;">${escapeHtml(item.title || "")}</div>
      <div class="small muted" style="margin-top:4px;">${escapeHtml(item.desc || "")}</div>
      <div style="display:flex; gap:8px; margin-top:10px;">
        <button class="btn btn-ghost" onclick="editNewsItem('${key}')">Sửa</button>
        <button class="btn btn-danger" onclick="deleteNewsItem('${key}')">Xóa</button>
      </div>
    </div>
  `).join("");
}

async function saveNewsItem() {
  requireAdmin();
  ensureDb();

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
  ensureDb();

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
  ["newsTitle", "newsDesc", "newsLink"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

/* =========================
   Chatbot + Voice
========================= */
function hasChatbotBackend() {
  return typeof CHATBOT_API_URL === "string" && CHATBOT_API_URL.trim() !== "";
}

function toggleChatbot(forceValue) {
  const panel = document.getElementById("chatbotPanel");
  if (!panel) return;
  chatbotOpen = typeof forceValue === "boolean" ? forceValue : !chatbotOpen;
  panel.classList.toggle("open", chatbotOpen);
}

function addChatMessage(role, text) {
  const box = document.getElementById("chatbotMessages");
  if (!box) return;

  const div = document.createElement("div");
  div.className = `chat-msg ${role === "user" ? "user" : "bot"}`;
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function setChatbotStatus(text = "", isError = false) {
  const box = document.getElementById("chatbotStatus");
  if (!box) return;
  box.textContent = text;
  box.style.color = isError ? "#b42318" : "#64748B";
}

function clearChatMessages() {
  const box = document.getElementById("chatbotMessages");
  if (!box) return;
  box.innerHTML = `<div class="chat-msg bot">Xin chào, tôi có thể hỗ trợ tra cứu địa điểm, tiện ích và nội dung trong website.</div>`;
  chatHistory = [];
  setChatbotStatus("");
}

function handleChatInputKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
}

function buildChatbotContext() {
  const locations = Object.values(allLocationData).map(d => ({
    name: d.name || "",
    category: safeCategoryName(d.category),
    desc: d.desc || "",
    lat: Number(d.lat),
    lng: Number(d.lng)
  }));

  const utilities = Object.values(allUtilityData).map(u => {
    const item = normalizeUtilityRecord(u);
    return { title: item.title, type: item.type, value: item.value };
  });

  const news = Object.values(newsData)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 10)
    .map(item => ({
      title: item.title || "",
      desc: item.desc || "",
      link: item.link || ""
    }));

  return { siteName: "Đoàn Thanh Niên Phường Hà Tu", locations, utilities, news };
}

function answerLocally(message) {
  const q = slugifyText(message);
  const ctx = buildChatbotContext();

  if (!q) return "Anh/chị vui lòng nhập nội dung cần tra cứu.";

  if (q.includes("xin chao") || q.includes("chao")) {
    return "Xin chào. Tôi có thể hỗ trợ tra cứu địa điểm, tiện ích và bản tin trên cổng thông tin.";
  }

  if (q.includes("dia diem") || q.includes("vi tri") || q.includes("ban do") || q.includes("ghim")) {
    if (!ctx.locations.length) return "Hiện hệ thống chưa có dữ liệu địa điểm.";
    const names = ctx.locations.slice(0, 5).map(x => x.name).filter(Boolean);
    return `Hiện hệ thống có ${ctx.locations.length} địa điểm. Một số địa điểm tiêu biểu: ${names.join(", ")}.`;
  }

  if (q.includes("tien ich") || q.includes("goi") || q.includes("lien ket")) {
    if (!ctx.utilities.length) return "Hiện hệ thống chưa có dữ liệu tiện ích.";
    const names = ctx.utilities.slice(0, 5).map(x => x.title).filter(Boolean);
    return `Hiện có ${ctx.utilities.length} tiện ích sẵn sàng sử dụng, gồm: ${names.join(", ")}.`;
  }

  if (q.includes("ban tin") || q.includes("thong bao") || q.includes("tin moi") || q.includes("news")) {
    if (!ctx.news.length) return "Hiện chưa có bản tin mới.";
    return `Bản tin mới nhất là: ${ctx.news[0].title || "Chưa có tiêu đề"}.`;
  }

  const matchedLocation = ctx.locations.find(loc => {
    const hay = slugifyText(`${loc.name} ${loc.category} ${loc.desc}`);
    const name = slugifyText(loc.name);
    return hay.includes(q) || q.includes(name);
  });

  if (matchedLocation) {
    return `Địa điểm ${matchedLocation.name} thuộc nhóm ${matchedLocation.category}. ${matchedLocation.desc ? matchedLocation.desc : "Hiện chưa có mô tả chi tiết."}`;
  }

  const matchedUtility = ctx.utilities.find(util => {
    const hay = slugifyText(`${util.title} ${util.type} ${util.value}`);
    return hay.includes(q) || q.includes(slugifyText(util.title));
  });

  if (matchedUtility) {
    return `Tiện ích ${matchedUtility.title} thuộc loại ${matchedUtility.type}. Giá trị hiện có: ${matchedUtility.value || "chưa cập nhật"}.`;
  }

  return "Tôi chưa tìm thấy nội dung phù hợp. Anh/chị có thể hỏi về địa điểm, tiện ích hoặc bản tin trên hệ thống.";
}

async function sendChatMessage() {
  const input = document.getElementById("chatbotInput");
  if (!input) return;

  const message = input.value.trim();
  if (!message) return;

  toggleChatbot(true);
  addChatMessage("user", message);
  input.value = "";
  setChatbotStatus("Đang xử lý câu hỏi...");

  const payload = {
    message,
    history: chatHistory.slice(-8),
    context: buildChatbotContext()
  };

  let reply = "";

  try {
    if (hasChatbotBackend()) {
      const response = await fetch(CHATBOT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Chat API error: ${response.status}`);
      }

      const data = await response.json();
      reply = String(data.reply || "").trim();
    }

    if (!reply) {
      reply = answerLocally(message);
      setChatbotStatus("Đang dùng trợ lý tra cứu nội bộ.");
    } else {
      setChatbotStatus("");
    }
  } catch (err) {
    console.warn("Chatbot backend lỗi, chuyển sang trợ lý nội bộ:", err);
    reply = answerLocally(message);
    setChatbotStatus("Không kết nối được máy chủ AI, đang dùng trợ lý nội bộ.");
  }

  addChatMessage("bot", reply);
  chatHistory.push({ role: "user", content: message });
  chatHistory.push({ role: "assistant", content: reply });

  try {
    speakBotReply(reply);
  } catch (e) {
    console.warn("Không thể phát âm thanh phản hồi:", e);
  }
}

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  recognition.lang = "vi-VN";
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onstart = () => {
    isVoiceListening = true;
    setChatbotStatus("Đang nghe giọng nói...");
    const btn = document.getElementById("voiceBtn");
    if (btn) btn.textContent = "⏺ Đang nghe";
  };

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    const input = document.getElementById("chatbotInput");
    if (input) input.value = transcript.trim();
  };

  recognition.onerror = () => {
    setChatbotStatus("Không nhận được giọng nói hoặc trình duyệt chưa hỗ trợ.", true);
  };

  recognition.onend = () => {
    isVoiceListening = false;
    const btn = document.getElementById("voiceBtn");
    if (btn) btn.textContent = "🎤 Nói";
    if (!document.getElementById("chatbotInput")?.value.trim()) {
      setChatbotStatus("Đã dừng ghi âm.");
    } else {
      setChatbotStatus("Đã nhận giọng nói. Bạn có thể bấm Gửi.");
    }
  };

  return recognition;
}

function toggleVoiceInput() {
  toggleChatbot(true);

  if (!speechRecognition) speechRecognition = initSpeechRecognition();
  if (!speechRecognition) {
    setChatbotStatus("Trình duyệt này chưa hỗ trợ nhập giọng nói.", true);
    return;
  }

  try {
    if (isVoiceListening) speechRecognition.stop();
    else speechRecognition.start();
  } catch (err) {
    console.error(err);
    setChatbotStatus("Không thể khởi động microphone.", true);
  }
}

function speakBotReply(text) {
  if (!("speechSynthesis" in window)) return;

  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "vi-VN";
    utter.rate = 1;
    window.speechSynthesis.speak(utter);
  } catch (err) {
    console.error(err);
  }
}

/* =========================
   Init
========================= */
window.addEventListener("load", () => {
  initMap();
  showTab("home");
  hydrateCloudinarySettings();
  renderLocationPreview();
  clearChatMessages();

  setTimeout(() => {
    if (map && typeof map.invalidateSize === "function") {
      map.invalidateSize();
    }
  }, 300);

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") searchPlace();
    });
  }

  const locationSearchInput = document.getElementById("locationSearchInput");
  if (locationSearchInput) {
    locationSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") searchPlaceFromLocations();
    });
  }

  bindLocationListener();
  bindUtilityListener();
  bindSiteContentListener();
  bindNewsListener();
  bindAuthListener();
});