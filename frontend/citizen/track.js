let map;

async function trackComplaint() {
  const id = document.getElementById('trackId').value.trim();
  if (!id) return;

  document.getElementById('statusCard').style.display = 'none';
  document.getElementById('noMatch').style.display = 'none';

  try {
    const res = await fetch(`/api/complaints/public/track/${encodeURIComponent(id)}`);
    const data = await res.json();
    
    if (!res.ok || !data.success) throw new Error(data.error || 'Not found');

    const c = data.complaint;
    document.getElementById('resId').textContent = c.complaint_id;
    document.getElementById('resStatus').textContent = c.status;
    document.getElementById('resStatus').className = `badge badge-${c.status.toLowerCase().replace(/\s+/g,'')}`;
    document.getElementById('resDesc').textContent = c.description;
    document.getElementById('resCat').textContent = c.category;
    document.getElementById('resDept').textContent = c.department;

    document.getElementById('statusCard').style.display = 'block';

    if (c.lat && c.lng) {
      document.getElementById('trackMap').style.display = 'block';
      if (!map) {
        map = L.map('trackMap').setView([c.lat, c.lng], 15);
        L.maplibreGL({
          style: 'https://tiles.openfreemap.org/styles/liberty'
        }).addTo(map);
      } else {
        map.setView([c.lat, c.lng], 15);
      }
      const marker = L.marker([c.lat, c.lng]).addTo(map);
      let popupContent = `<b>${esc(c.complaint_id)}</b>`;
      if (c.photo_url) {
        popupContent += `<br><img src="${safeUrl(c.photo_url)}" style="width:100%; height:100px; object-fit:cover; border-radius:4px; margin-top:5px;">`;
      }
      marker.bindPopup(popupContent);
      setTimeout(() => map.invalidateSize(), 200);
    } else {
      document.getElementById('trackMap').style.display = 'none';
    }

  } catch (err) {
    document.getElementById('noMatch').style.display = 'block';
  }
}
