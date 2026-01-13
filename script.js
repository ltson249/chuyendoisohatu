// Danh sách 20 địa điểm với hình ảnh
const locations = [
  { name: "Điểm 1", lat: 10.762622, lng: 106.660172, img: "images/item1.jpg" },
  { name: "Điểm 2", lat: 10.776889, lng: 106.700806, img: "images/item2.jpg" },
  { name: "Điểm 3", lat: 10.771476, lng: 106.698188, img: "images/item3.jpg" },
  { name: "Điểm 4", lat: 10.780000, lng: 106.670000, img: "images/item4.jpg" },
  { name: "Điểm 5", lat: 10.765000, lng: 106.655000, img: "images/item5.jpg" },
  { name: "Điểm 6", lat: 10.770000, lng: 106.675000, img: "images/item6.jpg" },
  { name: "Điểm 7", lat: 10.775000, lng: 106.660000, img: "images/item7.jpg" },
  { name: "Điểm 8", lat: 10.780500, lng: 106.680000, img: "images/item8.jpg" },
  { name: "Điểm 9", lat: 10.767000, lng: 106.665000, img: "images/item9.jpg" },
  { name: "Điểm 10", lat: 10.772000, lng: 106.670500, img: "images/item10.jpg" },
  { name: "Điểm 11", lat: 10.768500, lng: 106.660500, img: "images/item11.jpg" },
  { name: "Điểm 12", lat: 10.775500, lng: 106.690500, img: "images/item12.jpg" },
  { name: "Điểm 13", lat: 10.779000, lng: 106.672000, img: "images/item13.jpg" },
  { name: "Điểm 14", lat: 10.770500, lng: 106.680500, img: "images/item14.jpg" },
  { name: "Điểm 15", lat: 10.765500, lng: 106.667000, img: "images/item15.jpg" },
  { name: "Điểm 16", lat: 10.773000, lng: 106.675500, img: "images/item16.jpg" },
  { name: "Điểm 17", lat: 10.769000, lng: 106.662500, img: "images/item17.jpg" },
  { name: "Điểm 18", lat: 10.776000, lng: 106.678500, img: "images/item18.jpg" },
  { name: "Điểm 19", lat: 10.771500, lng: 106.669000, img: "images/item19.jpg" },
  { name: "Điểm 20", lat: 10.774000, lng: 106.664000, img: "images/item20.jpg" },
];

// Tạo bản đồ
const map = L.map('map').setView([10.762622, 106.660172], 12);

// Nền OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Marker
const markers = [];
locations.forEach(loc => {
  const marker = L.marker([loc.lat, loc.lng]).addTo(map)
    .bindPopup(loc.name);
  markers.push(marker);
});

// Tạo danh sách mục
const container = document.getElementById("itemsContainer");
locations.forEach((loc, index) => {
  const div = document.createElement("div");
  div.className = "item";
  div.innerHTML = `
    <img src="${loc.img}" alt="${loc.name}">
    <h3>${loc.name}</h3>
    <button onclick="goToLocation(${index})">Xem trên bản đồ</button>
  `;
  container.appendChild(div);
});

// Hàm zoom đến vị trí khi click nút
function goToLocation(index) {
  const loc = locations[index];
  map.setView([loc.lat, loc.lng], 14);
  markers[index].openPopup();
}

// Tìm kiếm địa điểm
const searchBox = document.getElementById("searchBox");
searchBox.addEventListener("input", function() {
  const query = this.value.toLowerCase();
  locations.forEach((loc, index) => {
    if (loc.name.toLowerCase().includes(query)) {
      map.setView([loc.lat, loc.lng], 14);
      markers[index].openPopup();
    }
  });
});
