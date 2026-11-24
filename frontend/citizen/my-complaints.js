Auth.requireAuth('citizen');

async function loadHistory() {
  try {
    const res = await fetch('/api/complaints/mine', {
      headers: Auth.getAuthHeaders()
    });
    const data = await res.json();
    renderComplaints(data.complaints || []);
  } catch (err) {
    document.getElementById('complaintsList').innerHTML = `<div class="card p-3 text-rejected">Error loading history.</div>`;
  }
}

function renderComplaints(list) {
  const container = document.getElementById('complaintsList');
  if (list.length === 0) {
    container.innerHTML = `<div class="card p-3 text-center">You haven't filed any complaints yet. <a href="/citizen/portal" class="text-accent">File your first one here.</a></div>`;
    return;
  }

  container.innerHTML = list.map(c => {
    const statusKey = escAttr(c.status.toLowerCase().replace(/\s+/g, ''));
    const date = esc(new Date(c.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }));
    
    const isResolved = c.status === 'Resolved';
    const isRated = !!c.rating;
    const isDuplicate = !!c.parent_id;

    return `
      <div class="complaint-item">
        ${c.photo_url ? `<img src="${safeUrl(c.photo_url)}" class="photo-thumb">` : `<div class="photo-thumb" style="display:flex;align-items:center;justify-content:center;color:#444">No Photo</div>`}
        <div class="complaint-content">
          <div class="id-row">
            <div>
              <span class="font-bold text-accent" style="font-family:monospace">${esc(c.complaint_id)}</span>
              ${isDuplicate ? `<span class="text-sm text-secondary" style="margin-left:8px;">(Linked to ${esc(c.parent_id)})</span>` : ''}
              ${c.support_count ? `<span class="badge" style="background:#e2e8f0; color:#334155; margin-left:8px">Supports: ${esc(c.support_count)}</span>` : ''}
            </div>
            <span class="badge badge-${statusKey}">${esc(c.status)}</span>
          </div>
          <p style="font-size:0.95rem; margin-bottom:0.5rem;">${esc(c.description)}</p>
          <div class="text-sm text-secondary" style="display:flex; gap:10px; flex-wrap:wrap;">
            <span>Category: ${esc(c.category)}</span>
            <span>Dept: ${esc(c.department)}</span>
            <span>Date: ${date}</span>
          </div>
          
          ${isResolved && !isRated ? `
            <div class="mt-2" style="display:flex; gap:10px; align-items:center;">
              <button class="btn btn-primary open-feedback-btn" style="padding: 6px 12px; font-size: 0.8rem;" data-id="${escAttr(c.complaint_id)}">Rate Service</button>
              <button class="btn btn-secondary share-twitter-btn" style="padding: 6px 12px; font-size: 0.8rem; background:#1DA1F2; border:none; color:white;" data-id="${escAttr(c.complaint_id)}">🐦 Share on Twitter</button>
            </div>
          ` : ''}

          ${isRated ? `
            <div class="mt-2 text-sm" style="color: var(--status-resolved)">
              Rating: ${esc(c.rating)}/5 — "${esc(c.feedback_comment || 'No comment')}"
            </div>
          ` : ''}

          ${c.timeline ? `
            <div class="timeline-container">
              <h4 style="font-size:0.8rem; margin-bottom:12px; color:var(--text-secondary)">Complaint Progress Timeline</h4>
              ${c.timeline.map((t, idx) => `
                <div class="timeline-step">
                  <div class="step-dot ${idx === c.timeline.length - 1 ? 'active' : ''}"></div>
                  <div class="step-content">
                    <div class="font-bold" style="color:${t.to === 'Resolved' ? 'var(--status-resolved)' : (t.to === 'Rejected' ? 'var(--status-rejected)' : 'var(--text-primary)')}">
                      ${esc(t.to)}
                    </div>
                    <div class="step-time">${esc(new Date(t.at).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }))}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Delegated click handlers on complaints list
document.getElementById('complaintsList').addEventListener('click', (e) => {
  const feedbackBtn = e.target.closest('.open-feedback-btn');
  if (feedbackBtn && feedbackBtn.dataset.id) {
    openFeedbackModal(feedbackBtn.dataset.id);
    return;
  }
  const twitterBtn = e.target.closest('.share-twitter-btn');
  if (twitterBtn && twitterBtn.dataset.id) {
    const cid = encodeURIComponent(twitterBtn.dataset.id);
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent('I just used FixMyCity to resolve an issue in my neighborhood! 🏙️✅ Thanks to the municipal team. ' + cid + ' @FixMyCity')}`);
  }
});

let activeComplaintId = null;

function openFeedbackModal(id) {
  activeComplaintId = id;
  document.getElementById('feedbackModal').style.display = 'flex';
  // Reset form
  document.querySelectorAll('.star').forEach(s => s.classList.remove('active'));
  document.getElementById('feedbackComment').value = '';
  window.selectedRating = 0;
}

function closeFeedbackModal() {
  document.getElementById('feedbackModal').style.display = 'none';
  activeComplaintId = null;
}

function selectStar(rating) {
  window.selectedRating = rating;
  document.querySelectorAll('.star').forEach((s, i) => {
    s.classList.toggle('active', i < rating);
  });
}

async function submitFeedback() {
  if (!window.selectedRating) return alert('Please select a rating');
  const comment = document.getElementById('feedbackComment').value;

  try {
    const res = await fetch(`/api/complaints/${activeComplaintId}/feedback`, {
      method: 'POST',
      headers: { ...Auth.getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: window.selectedRating, comment })
    });
    const data = await res.json();
    if (data.success) {
      closeFeedbackModal();
      loadHistory();
    } else {
      alert(data.error);
    }
  } catch (err) {
    alert('Failed to submit feedback');
  }
}

loadHistory();
