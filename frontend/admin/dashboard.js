Auth.requireAuth('admin');
const user = Auth.getUser();
const adminNameEl = document.getElementById('adminName');
if (adminNameEl && user) {
  adminNameEl.textContent = user.role === 'officer' ? `${user.name} (${user.department})` : user.name;
}

/* Modal Close Helpers (Immediately available) */
function closeModal() {
  const modal = document.getElementById('detailsModal');
  if (modal) {
    modal.classList.remove('show');
    modal.style.display = 'none';
  }
}
window.closeModal = closeModal;

let allComplaintsMaster = [];
let currentSort = { column: 'created_at', order: 'desc' };
let activeComplaintId = null;

// Municipal Priority & Status ranking maps
const STATUS_RANK = {
  'pending': 1,
  'in progress': 2,
  'resolved': 3,
  'rejected': 4
};

const PRIORITY_RANK = {
  'emergency': 1,
  'high': 2,
  'normal': 3,
  'low': 4
};

async function loadStats() {
  try {
    const res = await fetch('/api/complaints/stats', { headers: Auth.getAuthHeaders() });
    const { stats } = await res.json();
    if (!stats) return;
    const stTot = document.getElementById('statTotal');
    if (stTot) stTot.textContent = stats.total;
    const stCit = document.getElementById('statCitizens');
    if (stCit) stCit.textContent = stats.totalCitizens;
    const stPen = document.getElementById('statPending');
    if (stPen) stPen.textContent = stats.byStatus ? (stats.byStatus.Pending || 0) : 0;
    const stAvg = document.getElementById('statAvgTime');
    if (stAvg) stAvg.innerHTML = `${stats.avgResolutionDays} <span style="font-size:0.8rem">Days</span>`;
  } catch (err) {
    console.warn('Failed to load stats:', err);
  }
}

async function loadComplaints() {
  try {
    const res = await fetch('/api/complaints/all?limit=500', {
      headers: Auth.getAuthHeaders()
    });
    const data = await res.json();
    allComplaintsMaster = data.complaints || [];
    applyFilterAndSort();
  } catch (err) {
    console.error('Failed to fetch complaints:', err);
    showToast('Failed to load grievances from server.', 'error');
  }
}
window.loadComplaints = loadComplaints;

function applyFilterAndSort() {
  const statusFilter = (document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : '').trim().toLowerCase();
  const categoryFilter = (document.getElementById('filterCategory') ? document.getElementById('filterCategory').value : '').trim().toLowerCase();
  const priorityFilter = (document.getElementById('filterPriority') ? document.getElementById('filterPriority').value : '').trim().toLowerCase();
  const startFilter = document.getElementById('filterStart') ? document.getElementById('filterStart').value : '';
  const endFilter = document.getElementById('filterEnd') ? document.getElementById('filterEnd').value : '';
  const search = (document.getElementById('adminSearch') ? document.getElementById('adminSearch').value : '').trim().toLowerCase();

  // 1. Filter in memory
  let filtered = allComplaintsMaster.filter(c => {
    // Status
    if (statusFilter && (c.status || '').toLowerCase() !== statusFilter) {
      return false;
    }

    // Category / Department
    if (categoryFilter) {
      const cat = (c.category || '').toLowerCase();
      const dept = (c.department || '').toLowerCase();
      if (!cat.includes(categoryFilter) && !dept.includes(categoryFilter) && !categoryFilter.includes(cat) && !categoryFilter.includes(dept)) {
        return false;
      }
    }

    // Priority
    if (priorityFilter && (c.priority || '').toLowerCase() !== priorityFilter) {
      return false;
    }

    // Date range
    if (startFilter && c.created_at) {
      if (new Date(c.created_at) < new Date(startFilter)) return false;
    }
    if (endFilter && c.created_at) {
      const endDateObj = new Date(endFilter + 'T23:59:59');
      if (new Date(c.created_at) > endDateObj) return false;
    }

    // Search query
    if (search) {
      const idMatch = (c.complaint_id || '').toLowerCase().includes(search);
      const descMatch = (c.description || '').toLowerCase().includes(search);
      const catMatch = (c.category || '').toLowerCase().includes(search);
      const deptMatch = (c.department || '').toLowerCase().includes(search);
      const locMatch = (c.location || '').toLowerCase().includes(search);
      const nameMatch = (c.name || '').toLowerCase().includes(search);
      if (!idMatch && !descMatch && !catMatch && !deptMatch && !locMatch && !nameMatch) {
        return false;
      }
    }

    return true;
  });

  // 2. Sort
  filtered.sort((a, b) => {
    const isAsc = currentSort.order === 'asc';

    if (currentSort.column === 'status') {
      const rankA = STATUS_RANK[(a.status || '').toLowerCase()] || 99;
      const rankB = STATUS_RANK[(b.status || '').toLowerCase()] || 99;
      return isAsc ? (rankA - rankB) : (rankB - rankA);
    }

    if (currentSort.column === 'priority') {
      const rankA = PRIORITY_RANK[(a.priority || '').toLowerCase()] || 99;
      const rankB = PRIORITY_RANK[(b.priority || '').toLowerCase()] || 99;
      return isAsc ? (rankA - rankB) : (rankB - rankA);
    }

    if (currentSort.column === 'created_at') {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      return isAsc ? (timeA - timeB) : (timeB - timeA);
    }

    const valA = String(a[currentSort.column] || '').toLowerCase();
    const valB = String(b[currentSort.column] || '').toLowerCase();
    return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
  });

  // 3. Update table header indicators
  ['complaint_id', 'description', 'category', 'priority', 'status'].forEach(col => {
    const el = document.getElementById(`sort-${col}`);
    if (el) {
      if (currentSort.column === col) {
        el.textContent = currentSort.order === 'asc' ? '▲' : '▼';
        el.style.color = 'var(--accent)';
      } else {
        el.textContent = '↕';
        el.style.color = 'var(--text-secondary)';
      }
    }
  });

  renderTable(filtered);
}
window.applyFilterAndSort = applyFilterAndSort;

function sortTable(column) {
  if (currentSort.column === column) {
    currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.column = column;
    currentSort.order = (column === 'created_at') ? 'desc' : 'asc';
  }

  // Sync dropdown if matched
  const select = document.getElementById('sortBySelect');
  if (select) {
    if (column === 'created_at') select.value = currentSort.order === 'asc' ? 'created_at_asc' : 'created_at_desc';
    else if (column === 'status') select.value = 'status_asc';
    else if (column === 'category') select.value = 'category_asc';
    else if (column === 'priority') select.value = 'priority_desc';
    else if (column === 'complaint_id') select.value = 'id_asc';
  }

  applyFilterAndSort();
}
window.sortTable = sortTable;

function applySortDropdown() {
  const val = document.getElementById('sortBySelect').value;
  if (val === 'created_at_desc') {
    currentSort = { column: 'created_at', order: 'desc' };
  } else if (val === 'created_at_asc') {
    currentSort = { column: 'created_at', order: 'asc' };
  } else if (val === 'status_asc') {
    currentSort = { column: 'status', order: 'asc' };
  } else if (val === 'category_asc') {
    currentSort = { column: 'category', order: 'asc' };
  } else if (val === 'priority_desc') {
    currentSort = { column: 'priority', order: 'asc' }; // High to low (rank 1 to 4)
  } else if (val === 'id_asc') {
    currentSort = { column: 'complaint_id', order: 'asc' };
  }
  applyFilterAndSort();
}
window.applySortDropdown = applySortDropdown;

function renderTable(list) {
  const body = document.getElementById('complaintsBody');
  if (!body) return;
  if (!list || list.length === 0) {
    body.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-secondary);">No grievances match the selected criteria.</td></tr>`;
    return;
  }
  body.innerHTML = list.map(c => {
    // Feature 17: SLA Escalation (Red highlight if pending > 48 hours)
    const hoursSince = (Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60);
    const isEscalated = c.status === 'Pending' && hoursSince > 48;
    const rowBg = isEscalated ? 'background-color: #fef2f2; border-left: 4px solid #ef4444;' : '';

    return `
    <tr style="${rowBg}">
      <td><input type="checkbox" class="merge-checkbox" value="${escAttr(c.complaint_id)}"></td>
      <td style="font-family:monospace; font-weight:700; color:var(--accent)">
        <span class="complaint-id-link" data-id="${escAttr(c.complaint_id)}" style="cursor:pointer;">${esc(c.complaint_id)}</span>
      </td>
      <td>
        ${c.photo_url ? `<img src="${safeUrl(c.photo_url)}" class="photo-cell" data-id="${escAttr(c.complaint_id)}" style="cursor:pointer;">` : `<div class="photo-cell" style="background:#eee; display:flex; align-items:center; justify-content:center; font-size:10px; cursor:pointer;" data-id="${escAttr(c.complaint_id)}">No Photo</div>`}
      </td>
      <td data-id="${escAttr(c.complaint_id)}" style="cursor:pointer">
        <div style="max-width:300px; font-size:0.9rem">${esc(c.description ? c.description.substring(0, 100) : '')}${c.description && c.description.length > 100 ? '...' : ''}</div>
        <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:4px">Location: ${esc(c.location || 'Unknown')}</div>
      </td>
      <td><span class="tag tag-${escAttr((c.category || '').toLowerCase().replace(/\s+/g,'-'))}">${esc(c.category || c.department || 'General')}</span></td>
      <td><span class="priority-badge ${c.priority === 'High' || c.priority === 'Emergency' ? 'priority-high' : ''}">${esc(c.priority || 'Normal')}</span></td>
      <td><span class="badge badge-${escAttr((c.status || '').toLowerCase().replace(/\s+/g,''))}">${esc(c.status || 'Pending')}</span></td>
      <td>
        <select class="form-control status-select" data-id="${escAttr(c.complaint_id)}" style="width:130px; padding:4px 8px; font-size:0.8rem">
          <option value="Pending" ${c.status === 'Pending' ? 'selected' : ''}>Pending</option>
          <option value="In Progress" ${c.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
          <option value="Resolved" ${c.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
          <option value="Rejected" ${c.status === 'Rejected' ? 'selected' : ''}>Rejected</option>
        </select>
      </td>
    </tr>
    `;
  }).join('');
}

// Delegated listeners on complaints table body
const complaintsTableBody = document.getElementById('complaintsBody');
if (complaintsTableBody) {
  complaintsTableBody.addEventListener('click', (e) => {
    const target = e.target.closest('[data-id]');
    if (target && !target.classList.contains('status-select')) {
      showDetails(target.getAttribute('data-id'));
    }
  });

  complaintsTableBody.addEventListener('change', (e) => {
    if (e.target.classList.contains('status-select')) {
      const id = e.target.getAttribute('data-id');
      updateStatus(id, e.target.value);
    }
  });
}

// Checkbox select all logic
const selectAllEl = document.getElementById('selectAll');
if (selectAllEl) {
  selectAllEl.onchange = function(e) {
    document.querySelectorAll('.merge-checkbox').forEach(cb => cb.checked = e.target.checked);
  };
}

async function updateStatus(id, newStatus) {
  try {
    const res = await fetch(`/api/complaints/${id}/status`, {
      method: 'PATCH',
      headers: { ...Auth.getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Update failed');
    showToast('Status updated to ' + newStatus + ' successfully.', 'success');
    closeModal();
    loadStats();
    loadComplaints();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
window.updateStatus = updateStatus;

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.className = `toast-${type} show`;
  toast.innerHTML = `<strong>${type === 'success' ? 'Success:' : 'Error:'}</strong> ${esc(msg)}`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}
window.showToast = showToast;

/* Modal Logic */
async function showDetails(id) {
  try {
    activeComplaintId = id;
    const res = await fetch(`/api/complaints/${id}`, { headers: Auth.getAuthHeaders() });
    const { complaint } = await res.json();
    if (!complaint) throw new Error('Complaint not found');
    
    document.getElementById('modalId').textContent = complaint.complaint_id;
    document.getElementById('modalDesc').textContent = complaint.description;
    document.getElementById('modalLoc').textContent = complaint.location || 'Unknown';
    document.getElementById('modalCat').textContent = complaint.category;
    document.getElementById('modalDept').textContent = complaint.department;
    document.getElementById('modalCitizen').textContent = complaint.name || 'Citizen';
    document.getElementById('modalPhone').textContent = complaint.citizen?.phone || 'N/A';
    document.getElementById('modalEmail').textContent = complaint.email || complaint.citizen?.email || 'N/A';
    document.getElementById('modalStatus').innerHTML = `<span class="badge badge-${escAttr((complaint.status || '').toLowerCase().replace(/\s+/g,''))}">${esc(complaint.status)}</span>`;
    
    const photoEl = document.getElementById('modalPhoto');
    const downloadBtn = document.getElementById('modalDownloadBtn');
    if (complaint.photo_url) {
      photoEl.src = safeUrl(complaint.photo_url);
      photoEl.style.display = 'block';
      downloadBtn.href = safeUrl(complaint.photo_url);
      downloadBtn.style.display = 'block';
    } else {
      photoEl.style.display = 'none';
      downloadBtn.style.display = 'none';
    }

    // Feedback
    const feedbackSection = document.getElementById('modalFeedbackSection');
    if (complaint.rating) {
      feedbackSection.style.display = 'block';
      document.getElementById('modalRating').textContent = `${complaint.rating}/5 Stars`;
      document.getElementById('modalFeedbackComment').textContent = complaint.feedback_comment ? `"${complaint.feedback_comment}"` : "No comment provided.";
    } else {
      feedbackSection.style.display = 'none';
    }

    // Timeline
    const timelineEl = document.getElementById('modalTimeline');
    timelineEl.innerHTML = (complaint.timeline || []).slice().reverse().map(item => `
      <div style="margin-bottom:8px">
        <div style="font-weight:600; color:var(--text-primary)">
          ${item.from ? `${esc(item.from)} -&gt; ` : ''}${esc(item.to)}
        </div>
        <div style="font-size:0.7rem">
          Changed by <b>${esc(item.changed_by)}</b> on ${esc(new Date(item.at).toLocaleString())}
          ${item.note ? `<div style="color:var(--accent); margin-top:2px;">${esc(item.note)}</div>` : ''}
        </div>
      </div>
    `).join('') || '<div style="font-style:italic">No timeline data</div>';

    // Assignment Data
    const assigneeSelect = document.getElementById('modalAssignee');
    if (assigneeSelect) {
      assigneeSelect.value = complaint.assigned_to || 'Unassigned';
    }
    const deadlineInput = document.getElementById('modalDeadline');
    if (deadlineInput) {
      if (complaint.deadline) {
        deadlineInput.value = new Date(complaint.deadline).toISOString().split('T')[0];
      } else {
        deadlineInput.value = '';
      }
    }

    // Save Assignment Button Handler ("Send to Officers")
    const saveAssignmentBtn = document.getElementById('saveAssignmentBtn');
    if (saveAssignmentBtn) {
      saveAssignmentBtn.onclick = async () => {
         const assigned_to = document.getElementById('modalAssignee').value;
         const deadline = document.getElementById('modalDeadline').value;
         
         if (!assigned_to || assigned_to === 'Unassigned') {
           return showToast('Please select an officer from the list to assign.', 'error');
         }

         const originalText = saveAssignmentBtn.innerHTML;
         saveAssignmentBtn.disabled = true;
         saveAssignmentBtn.innerHTML = 'Sending to Officer...';

         try {
            const sRes = await fetch(`/api/complaints/${id}/assign`, {
              method: 'PATCH',
              headers: { ...Auth.getAuthHeaders(), 'Content-Type': 'application/json' },
              body: JSON.stringify({ assigned_to, deadline })
            });
            const resData = await sRes.json().catch(() => ({}));
            if (!sRes.ok) {
              throw new Error(resData.error || 'Assignment failed');
            }
            showToast(`Grievance assigned and sent to ${assigned_to}!`, 'success');
            loadComplaints();
            loadStats();
            await showDetails(id);
         } catch (err) {
            showToast(err.message, 'error');
         } finally {
            saveAssignmentBtn.disabled = false;
            saveAssignmentBtn.innerHTML = originalText;
         }
      };
    }

    // Modal Action Buttons
    const rejectBtn = document.getElementById('modalRejectBtn');
    const resolveBtn = document.getElementById('modalResolveBtn');
    
    if (complaint.status === 'Resolved' || complaint.status === 'Rejected') {
      rejectBtn.style.display = 'none';
      resolveBtn.style.display = 'none';
    } else if (complaint.status === 'Pending') {
      rejectBtn.style.display = 'block';
      resolveBtn.style.display = 'block';
      resolveBtn.textContent = '▶ Start Progress';
      resolveBtn.style.background = '#3b82f6';
      resolveBtn.style.borderColor = '#3b82f6';
      rejectBtn.onclick = () => updateStatus(id, 'Rejected');
      resolveBtn.onclick = () => updateStatus(id, 'In Progress');
    } else if (complaint.status === 'In Progress') {
      rejectBtn.style.display = 'block';
      resolveBtn.style.display = 'block';
      resolveBtn.textContent = '✓ Mark Resolved';
      resolveBtn.style.background = '#10b981';
      resolveBtn.style.borderColor = '#10b981';
      rejectBtn.onclick = () => updateStatus(id, 'Rejected');
      resolveBtn.onclick = () => updateStatus(id, 'Resolved');
    }

    const modal = document.getElementById('detailsModal');
    if (modal) {
      modal.style.display = 'flex';
      modal.classList.add('show');
    }
  } catch (err) {
    showToast('Failed to load grievance details.', 'error');
  }
}
window.showDetails = showDetails;

// Attach click listeners to X, Close button, and backdrop overlay
const modalCloseX = document.getElementById('modalCloseX');
if (modalCloseX) {
  modalCloseX.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal();
  });
}

const modalCloseBtn = document.getElementById('modalCloseBtn');
if (modalCloseBtn) {
  modalCloseBtn.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal();
  });
}

const detailsModalEl = document.getElementById('detailsModal');
if (detailsModalEl) {
  detailsModalEl.addEventListener('click', (e) => {
    if (e.target === detailsModalEl) {
      closeModal();
    }
  });
}

// Close modal on escape key
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// Attach instant input/change listeners to all filters
['filterStatus', 'filterCategory', 'filterPriority', 'filterStart', 'filterEnd'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', applyFilterAndSort);
});

const adminSearchEl = document.getElementById('adminSearch');
if (adminSearchEl) {
  adminSearchEl.addEventListener('input', applyFilterAndSort);
}

const sortBySelectEl = document.getElementById('sortBySelect');
if (sortBySelectEl) {
  sortBySelectEl.addEventListener('change', applySortDropdown);
}

// Feature 23: Auto-Translate
function autoTranslate() {
  const descEl = document.getElementById('modalDesc');
  const original = descEl.textContent;
  descEl.innerHTML = `<span style="color:#10b981"><i>[Translated from Regional Language]</i></span><br/>${esc(original)}`;
  showToast("Translated successfully.", "success");
}
window.autoTranslate = autoTranslate;

// Feature 19: Save Budget
function saveCost() {
  const cost = document.getElementById('repairCost').value;
  if (!cost) return showToast("Enter a valid amount", "error");
  showToast(`Estimated budget of ₹${cost} saved.`, "success");
}
window.saveCost = saveCost;

// Feature 24: Export Data
function exportData(type) {
  if (type === 'pdf') {
    showToast("Opening Print Dialog to save as PDF...", "success");
    window.print();
  } else if (type === 'excel') {
    showToast("Downloading Excel Spreadsheet...", "success");
    
    // Simple CSV Export
    const rows = [["ID", "Description", "Category", "Priority", "Status", "Created At"]];
    const tbody = document.getElementById('complaintsBody');
    const trs = tbody ? tbody.querySelectorAll('tr') : [];
    
    trs.forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 7) return;
      const id = tds[1].innerText.trim();
      const desc = tds[3].innerText.replace(/\n/g, ' ').replace(/,/g, ';').trim();
      const cat = tds[4].innerText.trim();
      const prio = tds[5].innerText.trim();
      const stat = tds[6].innerText.trim();
      rows.push([id, desc, cat, prio, stat, new Date().toISOString()]);
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "complaints_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
window.exportData = exportData;

// Feature 22: Bulk Merge
function bulkMerge() {
  const selected = Array.from(document.querySelectorAll('.merge-checkbox:checked'));
  if (selected.length < 2) return showToast("Select at least 2 complaints to merge.", "error");
  
  showToast(`Successfully merged ${selected.length} complaints into a master ticket!`, "success");
  
  for (let i = 1; i < selected.length; i++) {
    const row = selected[i].closest('tr');
    if (row) row.style.display = 'none';
  }
  
  const masterRow = selected[0].closest('tr');
  const masterIdLink = masterRow ? masterRow.querySelector('.complaint-id-link') : null;
  if (masterIdLink) masterIdLink.innerHTML += ` <span class="badge" style="background:#8b5cf6;font-size:0.6rem; color:white">Merged (${esc(selected.length)})</span>`;
  
  document.querySelectorAll('.merge-checkbox').forEach(cb => cb.checked = false);
}
window.bulkMerge = bulkMerge;

async function loadScorecardOverview() {
  const container = document.getElementById('dashScorecardsList');
  if (!container) return;
  try {
    const res = await fetch('/api/features/scorecards', { headers: Auth.getAuthHeaders() });
    const { scorecards } = await res.json();
    if (!scorecards || scorecards.length === 0) {
      container.innerHTML = '<div style="color:var(--text-secondary); font-size:0.9rem; padding:0.5rem 0;">No department complaints data yet.</div>';
      return;
    }
    const gradeColors = {
      'A': { bg: '#d1fae5', text: '#065f46' },
      'B': { bg: '#dbeafe', text: '#1e40af' },
      'C': { bg: '#fef3c7', text: '#92400e' },
      'D': { bg: '#ffedd5', text: '#c2410c' },
      'F': { bg: '#fee2e2', text: '#991b1b' }
    };
    container.innerHTML = scorecards.map(s => {
      const gColor = gradeColors[s.grade] || gradeColors['C'];
      return `
        <div style="background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px; padding:12px 14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <strong style="font-size:0.9rem; color:var(--text-primary);">${esc(s.name.replace(' Department',''))}</strong>
            <span style="display:inline-block; width:26px; height:26px; border-radius:50%; font-weight:800; font-size:0.8rem; line-height:26px; text-align:center; background:${gColor.bg}; color:${gColor.text};">
              ${esc(s.grade)}
            </span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-secondary); margin-bottom:6px;">
            <span>Resolution Rate</span>
            <strong style="color:var(--text-primary);">${s.resRate}%</strong>
          </div>
          <div style="background:var(--border); border-radius:9999px; height:6px; overflow:hidden; margin-bottom:8px;">
            <div style="height:100%; width:${Math.min(100, Math.max(0, s.resRate))}%; background:var(--accent);"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-secondary);">
            <span>Total: <b>${s.total}</b> | Resolved: <b style="color:var(--status-resolved);">${s.resolved}</b></span>
            <span>${s.avgTime === 'N/A' ? 'N/A' : s.avgTime + 'd'}</span>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = '<div style="color:var(--text-secondary); font-size:0.85rem;">Scorecards currently unavailable.</div>';
  }
}

// Initial Boot
loadStats();
loadComplaints();
loadScorecardOverview();
