let map, userPos, routeLine, markers = [];
let myPlaces = JSON.parse(localStorage.getItem('my_qn_places')) || [];
let tempMarker = null; // Marker đỏ để ghim khi thêm địa điểm
let currentViewId = null; // Lưu ID địa điểm đang xem chi tiết

document.addEventListener("DOMContentLoaded", () => {
    map = L.map("map").setView([20.95, 107.05], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

    navigator.geolocation.getCurrentPosition(p => {
        userPos = [p.coords.latitude, p.coords.longitude];
        L.marker(userPos).addTo(map).bindPopup("Vị trí của bạn");
    });

    // CHỨC NĂNG GHIM VỊ TRÍ KHI CLICK
    map.on('click', (e) => {
        // Chỉ hoạt động khi đang mở tab "Thêm địa điểm"
        if(document.getElementById('tab-create').classList.contains('active')) {
            document.getElementById('new-lat').value = e.latlng.lat.toFixed(6);
            document.getElementById('new-lon').value = e.latlng.lng.toFixed(6);

            if(tempMarker) map.removeLayer(tempMarker);
            tempMarker = L.marker(e.latlng, {
                icon: L.icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                    iconSize: [25, 41], iconAnchor: [12, 41]
                })
            }).addTo(map).bindPopup("Vị trí bạn chọn").openPopup();
        }
    });

    renderMyPlaces();
});

function showTab(tabId) {
    closeDetail(); // Đóng trang chi tiết nếu đang mở
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
}

// --- GIỮ NGUYÊN CÁC HÀM CŨ CỦA BẠN ---
async function searchLocation() {
    const q = document.getElementById("searchBox").value;
    if (!q) return;
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}, Quảng Ninh, Vietnam&limit=5`);
    const data = await res.json();
    const list = document.getElementById("proposal-list");
    list.innerHTML = "";
    data.forEach(item => {
        const div = document.createElement("div");
        div.className = "proposal-item";
        div.innerText = item.display_name;
        div.onclick = () => selectLocation(item.lat, item.lon, item.display_name);
        list.appendChild(div);
    });
}
function selectLocation(lat, lon, name) {
    document.getElementById("proposal-list").innerHTML = "";
    clearMarkers();
    map.setView([lat, lon], 15);
    const m = L.marker([lat, lon]).addTo(map).bindPopup(name).openPopup();
    markers.push(m);
    const resBox = document.getElementById("search-selected-result");
    resBox.innerHTML = `<div class="item-card"><h4>${name}</h4><button onclick="drawRoute(${lat}, ${lon})" style="background:#28a745">Chỉ đường tới đây</button></div>`;
}
async function searchTypeAround(type) {
    const inputId = type === 'school' ? 'searchSchoolCenter' : (type === 'ubnd' ? 'searchUBNDCenter' : 'searchFoodCenter');
    const resultsId = type === 'school' ? 'school-results' : (type === 'ubnd' ? 'ubnd-results' : 'food-results');
    const q = document.getElementById(inputId).value;
    if (!q) return alert("Vui lòng nhập khu vực trung tâm!");
    const geo = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}, Quảng Ninh`).then(r => r.json());
    if (!geo.length) return alert("Không tìm thấy khu vực này!");
    const { lat, lon } = geo[0];
    map.setView([lat, lon], 13);
    clearMarkers();
    let filter = "";
    if (type === 'school') filter = 'node["amenity"~"school|kindergarten|university|college"]';
    if (type === 'ubnd') filter = 'node["amenity"="townhall"]';
    if (type === 'food') filter = 'node["amenity"~"restaurant|cafe|fast_food|bar|pub|food_court"]';
    const query = `[out:json][timeout:25];( ${filter}(around:10000, ${lat}, ${lon}); );out;`;
    const container = document.getElementById(resultsId);
    container.innerHTML = "Đang quét dữ liệu...";
    try {
        const response = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: query });
        const data = await response.json();
        container.innerHTML = "";
        data.elements.forEach(e => {
            if (!e.tags.name) return;
            const card = document.createElement("div");
            card.className = "item-card";
            const dist = userPos ? calcDistance(userPos, [e.lat, e.lon]).toFixed(2) : "?";
            card.innerHTML = `<h4>${e.tags.name}</h4><p>📍 Khoảng cách: ${dist} km</p><button class="btn-sm" onclick="map.setView([${e.lat}, ${e.lon}], 17)">Ghim</button>`;
            container.appendChild(card);
            const m = L.marker([e.lat, e.lon]).addTo(map).bindPopup(e.tags.name);
            markers.push(m);
        });
    } catch (err) { container.innerHTML = "Lỗi khi tải dữ liệu."; }
}

// --- NÂNG CẤP CHỨC NĂNG THÊM ĐỊA ĐIỂM ---
async function saveMyPlace() {
    const name = document.getElementById('new-name').value;
    const lat = document.getElementById('new-lat').value;
    const lon = document.getElementById('new-lon').value;
    const desc = document.getElementById('new-desc').value;
    const imgInput = document.getElementById('new-img');

    if(!name || !lat) return alert("Vui lòng nhập tên và ghim vị trí trên bản đồ!");

    let imgBase64 = "";
    if (imgInput.files && imgInput.files[0]) {
        imgBase64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(imgInput.files[0]);
        });
    }

    const newPlace = {
        id: Date.now(),
        name,
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        desc,
        img: imgBase64,
        comments: []
    };

    myPlaces.push(newPlace);
    localStorage.setItem('my_qn_places', JSON.stringify(myPlaces));
    alert("Đã lưu địa điểm thành công!");
    location.reload(); 
}

function renderMyPlaces() {
    const container = document.getElementById('my-places-list');
    container.innerHTML = "";
    myPlaces.forEach(p => {
        const card = document.createElement("div");
        card.className = "item-card";
        card.style.cursor = "pointer";
        card.innerHTML = `<h4>⭐ ${p.name}</h4><p>Xem chi tiết & bình luận</p>`;
        card.onclick = () => openDetail(p.id);
        container.appendChild(card);
        
        L.marker([p.lat, p.lon]).addTo(map).bindPopup(`<b>${p.name}</b>`).on('click', () => openDetail(p.id));
    });
}

// --- LOGIC TRANG CHI TIẾT ---
function openDetail(id) {
    const place = myPlaces.find(x => x.id === id);
    if(!place) return;
    currentViewId = id;

    document.getElementById('main-sidebar').style.display = "none";
    document.getElementById('detail-view').style.display = "block";

    const content = document.getElementById('detail-content');
    content.innerHTML = `
        <h2>${place.name}</h2>
        ${place.img ? `<img src="${place.img}" style="width:100%; border-radius:8px; margin-bottom:15px;">` : ""}
        <p><b>Đánh giá của tôi:</b></p>
        <p style="background: #f4f4f4; padding: 10px; border-radius: 5px;">${place.desc || "Chưa có mô tả."}</p>
        <p><small>Tọa độ: ${place.lat}, ${place.lon}</small></p>
        <button onclick="drawRoute(${place.lat}, ${place.lon})" style="background:#28a745; color:white; border:none; padding:10px; border-radius:5px; width:100%; cursor:pointer;">Chỉ đường tới đây</button>
    `;

    renderComments();
    map.setView([place.lat, place.lon], 16);
}

function closeDetail() {
    document.getElementById('main-sidebar').style.display = "block";
    document.getElementById('detail-view').style.display = "none";
    currentViewId = null;
}

function submitComment() {
    const user = document.getElementById('cmt-user').value;
    const text = document.getElementById('cmt-text').value;
    if(!user || !text) return alert("Vui lòng nhập tên và nội dung!");

    const place = myPlaces.find(x => x.id === currentViewId);
    place.comments.push({ user, text, date: new Date().toLocaleString() });
    
    localStorage.setItem('my_qn_places', JSON.stringify(myPlaces));
    renderComments();
    document.getElementById('cmt-text').value = "";
}

function renderComments() {
    const place = myPlaces.find(x => x.id === currentViewId);
    const list = document.getElementById('comment-list');
    list.innerHTML = place.comments.map(c => `
        <div style="border-bottom: 1px solid #eee; padding: 5px 0;">
            <b>${c.user}:</b> ${c.text} <br>
            <small style="color: #999;">${c.date}</small>
        </div>
    `).join("");
}

// --- CÁC HÀM TIỆN ÍCH KHÁC ---
function drawRoute(lat, lon) {
    if (!userPos) return alert("Cần vị trí của bạn để chỉ đường!");
    fetch(`https://router.project-osrm.org/route/v1/driving/${userPos[1]},${userPos[0]};${lon},${lat}?geometries=geojson`)
        .then(r => r.json()).then(d => {
            if (routeLine) map.removeLayer(routeLine);
            const coords = d.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
            routeLine = L.polyline(coords, { color: 'red', weight: 5 }).addTo(map);
            map.fitBounds(routeLine.getBounds());
        });
}
function clearMarkers() { markers.forEach(m => map.removeLayer(m)); markers = []; }
function calcDistance(a, b) {
    const R = 6371;
    const dLat = (b[0] - a[0]) * Math.PI / 180;
    const dLon = (b[1] - a[1]) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}