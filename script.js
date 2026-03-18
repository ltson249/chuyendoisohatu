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
let allLocationData = {};
let allUtilityData = {};
let tempLocationImages = [];

let routeControl = null;
let currentUserLatLng = null;

/* =========================
   Map (Leaflet)
========================= */
const map = L.map("map").setView([20.943, 107.112], 15);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap"
}).addTo(map);

let tempMarker = null;

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

function openLink(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function callNumber(num) {
  window.location.href = `tel:${num}`;
}

function openWeather() {
  window.open("https://www.google.com/search?q=th%E1%BB%9Di+ti%E1%BA%BFt+H%C3%A0+Tu+Qu%E1%BA%A3ng+Ninh", "_blank", "noopener,noreferrer");
}

function openFeedback() {
  window.open("https://docs.google.com/forms", "_blank", "noopener,noreferrer");
}

function parseImages(raw) {
  if (!raw) return [];
  return raw
    .split(/[\n,]+/g)
    .map(s => s.trim())
    .filter(Boolean);
}

function escapeHtml(s) {
  return String(s ?? "")
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

  const latlngs = keys
    .map(k => [Number(allLocationData[k].lat), Number(allLocationData[k].lng)])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

  if (!latlngs.length) return;

  const bounds = L.latLngBounds(latlngs);
  map.fitBounds(bounds.pad(0.2));
}

/* =========================
   Routing on web map
========================= */
function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Trình duyệt không hỗ trợ định vị"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve([position.coords.latitude, position.coords.longitude]);
      },
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
      createMarker: function(i, wp) {
        if (i === 0) {
          return L.marker(wp.latLng).bindPopup("📍 Vị trí của bạn");
        }
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
   Cloudinary upload + preview
========================= */
const CLOUDINARY_KEY = "doan_hatu_cloudinary_v1";

function getCloudinarySettings() {
  try {
    return JSON.parse(localStorage.getItem(CLOUDINARY_KEY) || "{}");
  } catch (e) {
    return {};
  }
}

function saveCloudinarySettings() {
  const cloudName = (document.getElementById("cloudName")?.value || "").trim();
  const uploadPreset = (document.getElementById("uploadPreset")?.value || "").trim();

  localStorage.setItem(CLOUDINARY_KEY, JSON.stringify({
    cloudName,
    uploadPreset
  }));

  alert("Đã lưu cấu hình upload ảnh.");
}

function hydrateCloudinarySettings() {
  const cfg = getCloudinarySettings();
  const cloudNameEl = document.getElementById("cloudName");
  const uploadPresetEl = document.getElementById("uploadPreset");

  if (cloudNameEl) cloudNameEl.value = cfg.cloudName || "";
  if (uploadPresetEl) uploadPresetEl.value = cfg.uploadPreset || "";
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

async function uploadSingleFileToCloudinary(file, cloudName, uploadPreset) {
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", uploadPreset);
  form.append("folder", "doan-thanh-nien/locations");

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
    {
      method: "POST",
      body: form
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Upload thất bại");
  }

  const data = await response.json();
  if (!data.secure_url) {
    throw new Error("Cloudinary không trả về secure_url");
  }
  return data.secure_url;
}

async function uploadLocationImages() {
  if (!isAdmin) return alert("Bạn chưa đăng nhập admin.");

  const input = document.getElementById("locationFiles");
  const files = Array.from(input?.files || []);
  if (!files.length) return alert("Vui lòng chọn ít nhất 1 ảnh.");

  const { cloudName, uploadPreset } = getCloudinarySettings();
  if (!cloudName || !uploadPreset) {
    return alert("Bạn chưa cấu hình Cloudinary. Hãy nhập cloud name và upload preset trong mục Admin.");
  }

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
          ${firstImg ? `<img src="${escapeHtml(firstImg)}" alt="Ảnh"
            style="width:72px;height:54px;object-fit:cover;border-radius:10px;border:1px solid rgba(0,0,0,.08);">` : ""}
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

function refreshMarkers() {
  clearAllMarkers();

  Object.keys(allLocationData).forEach(key => {
    const d = allLocationData[key];
    const lat = Number(d.lat);
    const lng = Number(d.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const m = L.marker([lat, lng]).addTo(map);
    m.bindPopup(buildLocationPopupHtml(d));
    markersByKey[key] = m;
  });
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

function saveLocation() {
  if (!isAdmin) return alert("Bạn chưa đăng nhập admin.");

  const nameEl = document.getElementById("name");
  const descEl = document.getElementById("desc");
  const latEl = document.getElementById("lat");
  const lngEl = document.getElementById("lng");

  syncImagesField();
  const imagesEl = document.getElementById("images");

  const name = (nameEl?.value || "").trim();
  const desc = (descEl?.value || "").trim();
  const lat = (latEl?.value || "").trim();
  const lng = (lngEl?.value || "").trim();
  const images = parseImages(imagesEl?.value || "");

  if (!name) return alert("Vui lòng nhập tên địa điểm.");
  if (!lat || !lng) return alert("Vui lòng bấm lên bản đồ để lấy tọa độ.");

  const payload = {
    name,
    desc,
    lat: Number(lat),
    lng: Number(lng),
    images
  };

  const modeLabel = document.getElementById("locationMode");

  if (editingLocationKey) {
    db.ref("locations/" + editingLocationKey).set(payload);
    if (modeLabel) modeLabel.textContent = "Chế độ: Thêm mới";
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
  document.getElementById("lat").value = Number(d.lat).toFixed(6);
  document.getElementById("lng").value = Number(d.lng).toFixed(6);

  tempLocationImages = Array.isArray(d.images) ? [...d.images] : [];
  syncImagesField();
  renderLocationPreview();

  showTab("locations");
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

  const locationMode = document.getElementById("locationMode");
  if (locationMode) locationMode.textContent = "Chế độ: Thêm mới";

  document.getElementById("name").value = "";
  document.getElementById("desc").value = "";
  document.getElementById("lat").value = "";
  document.getElementById("lng").value = "";

  tempLocationImages = [];
  syncImagesField();
  renderLocationPreview();

  const fileInput = document.getElementById("locationFiles");
  if (fileInput) fileInput.value = "";

  setUploadStatus("");

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
      map.flyTo([Number(p.lat), Number(p.lon)], 16);

      L.marker([Number(p.lat), Number(p.lon)]).addTo(map)
        .bindPopup(`
          <div class="popup-title">${escapeHtml(p.display_name)}</div>
          <div class="popup-actions">
            <a target="_blank" href="${googleDirectionsLink(p.lat, p.lon)}">🚗 Chỉ đường Google Maps</a>
            <button type="button" class="route-web-btn" onclick="showRouteOnMap(${Number(p.lat)}, ${Number(p.lon)})">🗺 Chỉ đường trên web</button>
          </div>
        `)
        .openPopup();
    })
    .catch(() => alert("Lỗi tìm kiếm. Vui lòng thử lại."));
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

  if (u.type === "call") {
    window.location.href = `tel:${u.value}`;
    return;
  }

  if (u.type === "link") {
    window.open(u.value, "_blank", "noopener,noreferrer");
    return;
  }

  if (u.type === "map") {
    const parts = String(u.value || "").split(",");
    if (parts.length < 2) return alert("Tiện ích map phải có dạng: lat,lng");

    const lat = Number(parts[0].trim());
    const lng = Number(parts[1].trim());

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return alert("Tọa độ không hợp lệ.");
    }

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

function saveUtility() {
  if (!isAdmin) return alert("Bạn chưa đăng nhập admin.");

  const title = (document.getElementById("utilTitle")?.value || "").trim();
  const type = (document.getElementById("utilType")?.value || "call").trim();
  const value = (document.getElementById("utilValue")?.value || "").trim();

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
   Admin auth
========================= */
function loginAdmin() {
  const pass = (document.getElementById("adminPass")?.value || "").trim();

  if (pass === "DOANHATU2025") {
    isAdmin = true;
    document.getElementById("adminAuth").style.display = "none";
    document.getElementById("adminPanel").style.display = "block";
    document.getElementById("btnLogout").style.display = "inline-flex";

    hydrateCloudinarySettings();
    renderLocations();
    renderUtilities();
    renderLocationPreview();
    renderLatestNews();
    renderAdminNews();
    renderAdminHomeCards();

    alert("✅ Admin đã đăng nhập.");
  } else {
    alert("Sai mật khẩu.");
  }
}

function logoutAdmin() {
  isAdmin = false;
  editingLocationKey = null;
  editingUtilityKey = null;
  editingNewsKey = null;
  editingHomeCardKey = null;

  document.getElementById("adminPass").value = "";
  document.getElementById("adminAuth").style.display = "block";
  document.getElementById("adminPanel").style.display = "none";
  document.getElementById("btnLogout").style.display = "none";

  resetLocationForm();
  resetUtilityForm();
  resetNewsForm();
  renderLocations();
  renderUtilities();
}

/* =========================
   Site Content / News
========================= */
let siteContentData = {
  logoUrl: "",
  heroMediaType: "image",
  heroMediaUrl: "",
  homeCards: {}
};

let newsData = {};
let editingNewsKey = null;
let editingHomeCardKey = null;

/* =========================
   Cloudinary generic upload
========================= */
async function uploadFileToCloudinary(file, resourceType = "image") {
  const { cloudName, uploadPreset } = getCloudinarySettings();

  if (!cloudName || !uploadPreset) {
    throw new Error("Thiếu cấu hình Cloudinary");
  }

  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", uploadPreset);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/upload`,
    {
      method: "POST",
      body: form
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Upload thất bại");
  }

  const data = await response.json();
  if (!data.secure_url) throw new Error("Không lấy được secure_url");
  return data.secure_url;
}

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
   Render site logo
========================= */
function renderSiteLogo() {
  const logoEl = document.getElementById("siteLogo");
  if (!logoEl) return;

  if (siteContentData.logoUrl) {
    logoEl.src = siteContentData.logoUrl;
  }
}

async function uploadSiteLogo() {
  if (!isAdmin) return alert("Bạn chưa đăng nhập admin.");

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
  if (!isAdmin) return alert("Bạn chưa đăng nhập admin.");

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

function saveHeroMedia() {
  if (!isAdmin) return alert("Bạn chưa đăng nhập admin.");

  const type = document.getElementById("heroMediaType")?.value || "image";
  const url = (document.getElementById("heroMediaUrl")?.value || "").trim();

  if (!url) return alert("Vui lòng nhập hoặc tải URL media.");

  db.ref("siteContent").update({
    heroMediaType: type,
    heroMediaUrl: url
  });

  const status = document.getElementById("heroMediaStatus");
  if (status) status.textContent = "Đã lưu media trang chủ.";
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
    .map(([key, item]) => `
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
  if (!isAdmin) return alert("Bạn chưa đăng nhập admin.");

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

function saveHomeCard() {
  if (!isAdmin) return alert("Bạn chưa đăng nhập admin.");

  const title = (document.getElementById("homeCardTitle")?.value || "").trim();
  const desc = (document.getElementById("homeCardDesc")?.value || "").trim();
  const imageUrl = (document.getElementById("homeCardImageUrl")?.value || "").trim();

  if (!title) return alert("Vui lòng nhập tiêu đề khối.");

  const payload = { title, desc, imageUrl };

  if (editingHomeCardKey) {
    db.ref("siteContent/homeCards/" + editingHomeCardKey).set(payload);
    editingHomeCardKey = null;
  } else {
    db.ref("siteContent/homeCards").push(payload);
  }

  document.getElementById("homeCardTitle").value = "";
  document.getElementById("homeCardDesc").value = "";
  document.getElementById("homeCardImageUrl").value = "";
  document.getElementById("homeCardFile").value = "";

  const status = document.getElementById("homeCardStatus");
  if (status) status.textContent = "Đã lưu khối hình.";
}

function editHomeCard(key) {
  const item = siteContentData.homeCards?.[key];
  if (!item) return;

  editingHomeCardKey = key;
  document.getElementById("homeCardTitle").value = item.title || "";
  document.getElementById("homeCardDesc").value = item.desc || "";
  document.getElementById("homeCardImageUrl").value = item.imageUrl || "";
  showTab("admin");
}

function deleteHomeCard(key) {
  if (!confirm("Xóa khối hình này?")) return;
  db.ref("siteContent/homeCards/" + key).remove();
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

  box.innerHTML = items.map(([key, item]) => `
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

function saveNewsItem() {
  if (!isAdmin) return alert("Bạn chưa đăng nhập admin.");

  const title = (document.getElementById("newsTitle")?.value || "").trim();
  const desc = (document.getElementById("newsDesc")?.value || "").trim();
  const link = (document.getElementById("newsLink")?.value || "").trim();

  if (!title) return alert("Vui lòng nhập tiêu đề bản tin.");

  const payload = {
    title,
    desc,
    link,
    createdAt: Date.now()
  };

  if (editingNewsKey) {
    db.ref("news/" + editingNewsKey).update(payload);
    editingNewsKey = null;
  } else {
    db.ref("news").push(payload);
  }

  resetNewsForm();
}

function editNewsItem(key) {
  const item = newsData[key];
  if (!item) return;

  editingNewsKey = key;
  document.getElementById("newsTitle").value = item.title || "";
  document.getElementById("newsDesc").value = item.desc || "";
  document.getElementById("newsLink").value = item.link || "";
  showTab("admin");
}

function deleteNewsItem(key) {
  if (!confirm("Xóa bản tin này?")) return;
  db.ref("news/" + key).remove();
}

function resetNewsForm() {
  editingNewsKey = null;
  document.getElementById("newsTitle").value = "";
  document.getElementById("newsDesc").value = "";
  document.getElementById("newsLink").value = "";
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

window.addEventListener("resize", () => {
  map.invalidateSize();
});