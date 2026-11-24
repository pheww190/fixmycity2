// Ensure any existing session is wiped when visiting admin login page
try {
  localStorage.removeItem('mg_auth_token');
  localStorage.removeItem('mg_user_data');
  sessionStorage.clear();
} catch (_) {}

document.getElementById('adminLoginForm').onsubmit = async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value;
  const loginBtn = document.getElementById('adminLoginBtn');
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in...';
  }

  try {
    const res = await fetch('/api/auth/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Authentication failed');

    Auth.saveSession(data.token, data.user);
    showToast('Authenticated! Opening dashboard...', 'success');
    setTimeout(() => window.location.href = '/admin/dashboard', 600);
  } catch (err) {
    showToast(err.message, 'error');
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Sign In';
    }
  }
};

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.className = `toast-${type} show`;
  toast.innerHTML = `<strong>${type === 'success' ? 'Success:' : 'Error:'}</strong> ${esc(msg)}`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}
