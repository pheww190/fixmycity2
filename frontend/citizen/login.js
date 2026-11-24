/* login.js - Citizen OTP Login Flow */

// Ensure any existing session is wiped when visiting login page
try {
  localStorage.removeItem('mg_auth_token');
  localStorage.removeItem('mg_user_data');
  sessionStorage.clear();
} catch (_) {}

const otpForm = document.getElementById('otpForm');
const verifyForm = document.getElementById('verifyForm');
const sendBtn = document.getElementById('sendBtn');
const loginBtn = document.getElementById('loginBtn');

otpForm.onsubmit = async (e) => {
  e.preventDefault();
  const rawAadhaar = document.getElementById('aadhaar').value;
  const aadhaar = rawAadhaar.replace(/[\s-]/g, '');
  const phone = document.getElementById('phone').value.replace(/[\s-]/g, '');

  if (aadhaar.length !== 12 || !/^\d{12}$/.test(aadhaar)) {
    return showToast("Please enter a valid 12-digit Aadhaar number.", "error");
  }

  sendBtn.disabled = true;
  sendBtn.textContent = "Sending OTP...";

  try {
    const res = await fetch('/api/auth/citizen/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aadhaar })
    });
    const data = await res.json();

    if (data.success) {
      showToast(data.message || "OTP sent to your registered contact details.", "success");
      otpForm.style.display = 'none';
      verifyForm.style.display = 'block';
    } else {
      showToast(data.error || "Failed to send OTP", "error");
      sendBtn.disabled = false;
      sendBtn.textContent = "Send OTP";
    }
  } catch (err) {
    showToast("Network error. Try again.", "error");
    sendBtn.disabled = false;
    sendBtn.textContent = "Send OTP";
  }
};

verifyForm.onsubmit = async (e) => {
  e.preventDefault();
  const rawAadhaar = document.getElementById('aadhaar').value;
  const aadhaar = rawAadhaar.replace(/[\s-]/g, '');
  const otp = document.getElementById('otp').value.trim();

  loginBtn.disabled = true;
  loginBtn.textContent = "Verifying...";

  try {
    const res = await fetch('/api/auth/citizen/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aadhaar, otp })
    });
    const data = await res.json();

    if (data.success) {
      Auth.saveSession(data.token, data.user);
      showToast("Login successful! Redirecting...", "success");
      setTimeout(() => window.location.href = "/citizen/portal", 800);
    } else {
      showToast(data.error || "Invalid OTP", "error");
      loginBtn.disabled = false;
      loginBtn.textContent = "Verify & Login";
    }
  } catch (err) {
    showToast("Login failed. Check connection.", "error");
    loginBtn.disabled = false;
    loginBtn.textContent = "Verify & Login";
  }
};

function resetFlow() {
  otpForm.style.display = 'block';
  verifyForm.style.display = 'none';
  sendBtn.disabled = false;
  sendBtn.textContent = "Send OTP";
}

function showToast(msg, type = "success") {
  const toast = document.getElementById("toast");
  toast.className = `toast-${type} show`;
  toast.innerHTML = `<strong>${type === "success" ? "Success:" : "Error:"}</strong> ${esc(msg)}`;
  setTimeout(() => toast.classList.remove("show"), 3000);
}
