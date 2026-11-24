Auth.requireAuth("citizen");
document.getElementById("userName").textContent = Auth.getUser().name;

async function loadUserStats() {
  try {
    const res = await fetch('/api/features/my-stats', { headers: Auth.getAuthHeaders() });
    const { stats } = await res.json();
    if (stats) {
      document.getElementById('userBadge').textContent = stats.badge;
      document.getElementById('userPoints').textContent = `${stats.points} pts`;
      const mainBadge = document.getElementById('mainUserBadge');
      if (mainBadge) mainBadge.textContent = `⭐ ${stats.points} pts | ${stats.badge}`;
    }
  } catch(e) {}
}
loadUserStats();

let map, marker;
const defaultCoords = [12.9716, 77.5946]; // Bengaluru

const BENGALURU_LOCALITIES = {
  "indiranagar": [12.9784, 77.6408],
  "koramangala": [12.9352, 77.6245],
  "whitefield": [12.9698, 77.7500],
  "hsr": [12.9121, 77.6446],
  "hsr layout": [12.9121, 77.6446],
  "btm": [12.9166, 77.6101],
  "btm layout": [12.9166, 77.6101],
  "jayanagar": [12.9308, 77.5838],
  "jp nagar": [12.9063, 77.5857],
  "majestic": [12.9767, 77.5713],
  "kempegowda": [12.9767, 77.5713],
  "mg road": [12.9756, 77.6066],
  "brigade road": [12.9740, 77.6075],
  "church street": [12.9748, 77.6045],
  "commercial street": [12.9822, 77.6083],
  "vidhana soudha": [12.9796, 77.5906],
  "cubbon park": [12.9764, 77.5929],
  "lalbagh": [12.9507, 77.5848],
  "hebbal": [13.0358, 77.5970],
  "yelahanka": [13.1007, 77.5963],
  "electronic city": [12.8399, 77.6770],
  "ecity": [12.8399, 77.6770],
  "bellandur": [12.9260, 77.6762],
  "marathahalli": [12.9591, 77.6974],
  "malleshwaram": [13.0031, 77.5643],
  "malleswaram": [13.0031, 77.5643],
  "rajajinagar": [12.9982, 77.5530],
  "yeshwanthpur": [13.0284, 77.5408],
  "yeshwantpur": [13.0284, 77.5408],
  "basavanagudi": [12.9422, 77.5753],
  "banashankari": [12.9255, 77.5468],
  "vijayanagar": [12.9644, 77.5345],
  "silk board": [12.9176, 77.6238],
  "richmond town": [12.9620, 77.6000],
  "shivajinagar": [12.9857, 77.6057],
  "frazer town": [12.9968, 77.6133],
  "pulakeshinagar": [12.9968, 77.6133],
  "rt nagar": [13.0247, 77.5948],
  "domlur": [12.9609, 77.6387],
  "kr puram": [13.0040, 77.6878],
  "krishnarajapuram": [13.0040, 77.6878],
  "peenya": [13.0285, 77.5197],
  "kengeri": [12.9177, 77.4838],
  "sarjapur": [12.9098, 77.6855],
  "sarjapur road": [12.9098, 77.6855],
  "nagarbhavi": [12.9566, 77.5098],
  "kammanahalli": [13.0159, 77.6379],
  "kalyan nagar": [13.0180, 77.6430],
  "ulsoor": [12.9830, 77.6256],
  "halasuru": [12.9830, 77.6256],
  "bengaluru": [12.9716, 77.5946],
  "bangalore": [12.9716, 77.5946]
};

let maplibreMap = null;

/**
 * Leaflet and the MapLibre GL canvas both cache their size. After the container
 * changes size (fullscreen, minimise, rotation) both have to be told, or the map
 * stays drawn at the old size and looks broken.
 */
function resizeMap() {
  if (map) map.invalidateSize();
  if (maplibreMap && typeof maplibreMap.resize === 'function') {
    try { maplibreMap.resize(); } catch (e) { /* not ready yet */ }
  }
}

function initMap() {
  try {
    map = L.map("map").setView(defaultCoords, 13);

    let tilesLoaded = false;
    try {
      if (typeof L.maplibreGL === 'function') {
        const glLayer = L.maplibreGL({
          style: "https://tiles.openfreemap.org/styles/liberty"
        }).addTo(map);
        if (glLayer && typeof glLayer.getMaplibreMap === 'function') {
          maplibreMap = glLayer.getMaplibreMap();
        }
        tilesLoaded = true;
      }
    } catch (e) {
      console.warn("MapLibre GL failed, falling back to raster tiles:", e);
    }

    if (!tilesLoaded) {
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap, © CARTO'
      }).addTo(map);
    }

    marker = L.marker(defaultCoords, { draggable: true }).addTo(map);

    marker.on("dragend", function () {
      const pos = marker.getLatLng();
      setPinLocation(pos.lat, pos.lng, true);
    });

    map.on("click", function (e) {
      setPinLocation(e.latlng.lat, e.latlng.lng, true);
      showToast(`📍 Pinned: ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`, "success");
    });

    setTimeout(resizeMap, 300);
    setTimeout(resizeMap, 1200);
  } catch (err) {
    console.error("Map initialization error:", err);
  }
}

function setPinLocation(lat, lng, doReverseGeocode = false) {
  const numLat = Number(Number(lat).toFixed(6));
  const numLng = Number(Number(lng).toFixed(6));
  
  if (marker) {
    marker.setLatLng([numLat, numLng]);
  }
  document.getElementById("lat").value = numLat;
  document.getElementById("lng").value = numLng;

  if (doReverseGeocode) {
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${numLat}&lon=${numLng}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.display_name) {
          const parts = data.display_name.split(',');
          const locInput = document.getElementById("locationText");
          if (locInput) locInput.value = parts.slice(0, 3).join(',').trim();
        }
      })
      .catch(() => {});
  }
}

function toggleFullscreen() {
  const container = document.getElementById('mapContainer');
  const fullBtn = document.getElementById('fullscreenBtn');
  const minBtn = document.getElementById('minimizeBtn');
  const hint = document.getElementById('mapPinInstruction');

  const isFs = container.classList.toggle('fixed-fullscreen');
  
  if (isFs) {
    if (fullBtn) fullBtn.style.display = 'none';
    if (minBtn) minBtn.style.display = 'block';
    if (hint) hint.style.display = 'block';
    if (container.requestFullscreen && !document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    }
  } else {
    if (fullBtn) fullBtn.style.display = 'block';
    if (minBtn) minBtn.style.display = 'none';
    if (hint) hint.style.display = 'none';
    if (document.exitFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }

  setTimeout(() => {
    resizeMap();
    if (map && marker) map.panTo(marker.getLatLng());
  }, 250);
}

// If the browser leaves fullscreen on its own (Esc), reset the buttons too.
document.addEventListener('fullscreenchange', () => {
  const container = document.getElementById('mapContainer');
  if (!container) return;
  if (!document.fullscreenElement && container.classList.contains('fixed-fullscreen')) {
    toggleFullscreen();
  }
});

// Exit fullscreen on Escape
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const mapContainer = document.getElementById('mapContainer');
    if (mapContainer && mapContainer.classList.contains('fixed-fullscreen')) {
      toggleFullscreen();
    }
  }
});

async function searchMapLocation() {
  const inputEl = document.getElementById("mapSearchInput");
  const rawQuery = (inputEl ? inputEl.value : "").trim();
  if (!rawQuery) {
    return showToast("Please enter an area or landmark to search.", "error");
  }

  showToast(`Searching for "${rawQuery}"...`, "success");
  const cleanQ = rawQuery.toLowerCase();

  // 1. Direct or partial match in Bengaluru Localities DB
  for (const [key, coords] of Object.entries(BENGALURU_LOCALITIES)) {
    if (cleanQ === key || cleanQ.includes(key) || key.includes(cleanQ)) {
      setPinLocation(coords[0], coords[1], true);
      if (map) {
        map.setView([coords[0], coords[1]], 16);
        resizeMap();
      }
      showToast(`📍 Found & pinned: ${key.toUpperCase()}, Bengaluru`, "success");
      return;
    }
  }

  // 2. Query Nominatim with Bengaluru bias
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(rawQuery + ', Bengaluru, Karnataka')}&limit=1`);
    const data = await res.json();
    if (data && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      setPinLocation(lat, lon, true);
      if (map) {
        map.setView([lat, lon], 16);
        resizeMap();
      }
      showToast("📍 Location found & pinned on map!", "success");
      return;
    }
  } catch (_) {}

  // 3. Fallback Nominatim query
  try {
    const res2 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(rawQuery)}&limit=1`);
    const data2 = await res2.json();
    if (data2 && data2.length > 0) {
      const lat = parseFloat(data2[0].lat);
      const lon = parseFloat(data2[0].lon);
      setPinLocation(lat, lon, true);
      if (map) {
        map.setView([lat, lon], 16);
        resizeMap();
      }
      showToast("📍 Location found & pinned!", "success");
      return;
    }
  } catch (_) {}

  // 4. Photon: a geocoder that answers browser requests reliably when Nominatim
  //    rate-limits or refuses them.
  try {
    const res3 = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(rawQuery)}&limit=1&lang=en`);
    const data3 = await res3.json();
    const feature = data3 && data3.features && data3.features[0];
    if (feature && feature.geometry && feature.geometry.coordinates) {
      const lon = feature.geometry.coordinates[0];
      const lat = feature.geometry.coordinates[1];
      setPinLocation(lat, lon, true);
      if (map) {
        map.setView([lat, lon], 16);
        resizeMap();
      }
      showToast("📍 Location found & pinned!", "success");
      return;
    }
  } catch (_) {}

  showToast("Location not found. Click directly on the map to pin your location.", "error");
}

function useCurrentLocation() {
  if (!navigator.geolocation) {
    return showToast("Geolocation is not supported by your browser.", "error");
  }
  // Browsers only allow geolocation on https:// or localhost. Opening the app as
  // http://192.168.x.x (phone testing) silently fails, which looks like a bug.
  if (window.isSecureContext === false) {
    return showToast(
      "GPS needs https:// or localhost. Open the app on localhost, or click the map to pin manually.",
      "error"
    );
  }
  showToast("Requesting GPS location...", "success");

  const applyPosition = async (position) => {
    const lat = Number(position.coords.latitude.toFixed(6));
    const lng = Number(position.coords.longitude.toFixed(6));
    if (map && marker) {
      map.setView([lat, lng], 16);
      resizeMap();
    }
    setPinLocation(lat, lng, true);
    showToast(`📍 GPS coordinates pinned: ${lat}, ${lng}`, "success");
  };

  navigator.geolocation.getCurrentPosition(
    applyPosition,
    (err) => {
      // Fallback with low accuracy for laptops / desktops
      navigator.geolocation.getCurrentPosition(
        applyPosition,
        (err2) => {
          const reason =
            err2.code === 1 ? "permission denied — allow location for this site" :
            err2.code === 2 ? "position unavailable — no GPS or network location" :
            err2.code === 3 ? "timed out" : err2.message;
          showToast(`GPS unavailable (${reason}). Click the map to pin manually.`, "error");
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
      );
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
}

// Photo Handling
const dropZone = document.getElementById("dropZone");
const photoInput = document.getElementById("photoInput");
const previewBox = document.getElementById("previewBox");
const previewImg = document.getElementById("previewImg");
const uploadHint = document.getElementById("uploadHint");

if (dropZone) dropZone.onclick = () => photoInput && photoInput.click();

if (dropZone) {
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("dragover");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("dragover");
    const files = e.dataTransfer ? e.dataTransfer.files : null;
    if (files && files.length > 0) {
      try { photoInput.files = files; } catch (_) {}
      handleFile(files[0]);
    }
  });
}

if (photoInput) {
  photoInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  };
}

async function handleFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    previewImg.src = e.target.result;
    previewBox.style.display = "block";
    uploadHint.style.display = "none";
  };
  reader.readAsDataURL(file);

  // Extract EXIF GPS data if available, but DO NOT automatically change the category
  try {
    const gps = await exifr.gps(file);
    if (gps && gps.latitude && gps.longitude) {
      console.log("GPS found in photo:", gps.latitude, gps.longitude);
      setPinLocation(gps.latitude, gps.longitude, true);
      if (map) {
        map.setView([gps.latitude, gps.longitude], 16);
        resizeMap();
      }
      showToast("📍 Geotag coordinates extracted from photo!", "success");
    }
  } catch (err) {
    console.log("No GPS data found in this photo.");
  }
}

function setEmergency(desc, category) {
  document.getElementById("emergencyToggle").checked = true;
  document.getElementById("description").value = "EMERGENCY: " + desc;
  document.getElementById("categoryHint").value = category;
  showToast("Emergency alert activated. Priority auto-assigned.", "success");
}

function clearPhoto(e) {
  e.stopPropagation();
  photoInput.value = "";
  previewBox.style.display = "none";
  uploadHint.style.display = "block";
}

// Form Submission
document.getElementById("complaintForm").onsubmit = async (e) => {
  e.preventDefault();
  
  // Advanced Feature: Check for nearby duplicates first (runs in auto-detect mode if no category selected)
  const category = document.getElementById("categoryHint").value;
  const description = document.getElementById("description").value;
  const lat = document.getElementById("lat").value;
  const lng = document.getElementById("lng").value;

  if (lat && lng) {
    try {
      const checkRes = await fetch("/api/complaints/check-nearby", {
        method: "POST",
        headers: { ...Auth.getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ category, description, lat, lng })
      });
      const { duplicate } = await checkRes.json();
      if (duplicate) {
        return showDuplicateModal(duplicate);
      }
    } catch (err) { console.error("Nearby check failed:", err); }
  }

  submitGrievance();
};

async function submitGrievance() {
  const submitBtn = document.getElementById("submitBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";

  const formData = new FormData();
  formData.append("description", document.getElementById("description").value);
  formData.append("location", document.getElementById("locationText").value);
  formData.append("lat", document.getElementById("lat").value);
  formData.append("lng", document.getElementById("lng").value);
  formData.append("zone", (document.getElementById("zone") && document.getElementById("zone").value) || "Central");
  formData.append("is_emergency", document.getElementById("emergencyToggle").checked);
  if (photoInput.files[0]) { formData.append("photo", photoInput.files[0]); }

  try {
    const res = await fetch("/api/complaints", {
      method: "POST",
      headers: Auth.getAuthHeaders(),
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Award points for filing a complaint
    try { await fetch('/api/features/my-stats', { headers: Auth.getAuthHeaders() }); } catch(e){}
    showToast("Grievance filed successfully! +20 pts earned 🎉", "success");
    setTimeout(() => (window.location.href = "/citizen/my-complaints"), 1800);
  } catch (err) {
    showToast(err.message, "error");
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Grievance";
  }
}

// Live sentiment analysis
let sentimentTimer = null;
function onDescriptionInput() {
  clearTimeout(sentimentTimer);
  const text = document.getElementById('description').value;
  const chip = document.getElementById('sentimentChip');
  if (!chip) return;
  if (text.length < 15) { chip.style.display = 'none'; return; }
  sentimentTimer = setTimeout(async () => {
    try {
      const res = await fetch('/api/features/sentiment', {
        method: 'POST',
        headers: { ...Auth.getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      chip.style.display = 'inline-block';
      chip.textContent = `Tone: ${data.label}`;
      chip.style.background = data.color + '22';
      chip.style.color = data.color;
      chip.style.border = `1px solid ${data.color}`;
    } catch(e){}
  }, 600);
}

function showDuplicateModal(complaint) {
  document.getElementById('duplicateId').textContent = complaint.complaint_id;
  document.getElementById('duplicateDesc').textContent = complaint.description;
  document.getElementById('duplicateModal').style.display = 'flex';
  window.activeDuplicateId = complaint.complaint_id;
}

function closeDuplicateModal() {
  document.getElementById('duplicateModal').style.display = 'none';
}

async function supportExisting() {
  try {
    const res = await fetch(`/api/complaints/${window.activeDuplicateId}/support`, {
      method: 'POST',
      headers: Auth.getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      showToast("You have supported this complaint!", "success");
      setTimeout(() => window.location.href = "/citizen/my-complaints", 1000);
    } else {
      showToast(data.error, "error");
    }
  } catch (err) {
    showToast("Failed to support complaint", "error");
  }
}

function showToast(msg, type = "success") {
  const toast = document.getElementById("toast");
  toast.className = `toast-${type} show`;
  toast.innerHTML = `<strong>${type === "success" ? "Success:" : "Error:"}</strong> ${esc(msg)}`;
  setTimeout(() => toast.classList.remove("show"), 3000);
}

async function loadUserStats() {
  try {
    const res = await fetch("/api/complaints/mine", {
      headers: Auth.getAuthHeaders(),
    });
    const data = await res.json();
    const list = data.complaints || [];
    document.getElementById("countTotal").textContent = list.length;
    document.getElementById("countPending").textContent = list.filter(
      (c) => c.status === "Pending",
    ).length;
    document.getElementById("countResolved").textContent = list.filter(
      (c) => c.status === "Resolved",
    ).length;
    document.getElementById("countRejected").textContent = list.filter(
      (c) => c.status === "Rejected",
    ).length;
  } catch (err) {}
}

initMap();
loadUserStats();

// Pre-fill the hidden lat/lng with the default centre. (The old code called a
// helper that had been removed, which threw and logged an error on every load.)
(function seedDefaultCoords() {
  const latEl = document.getElementById("lat");
  const lngEl = document.getElementById("lng");
  if (latEl) latEl.value = defaultCoords[0];
  if (lngEl) lngEl.value = defaultCoords[1];
})();
