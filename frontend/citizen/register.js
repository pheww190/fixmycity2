/* register.js - Citizen Registration & Verification Logic */

const registerForm = document.getElementById('registerForm');
const verifyForm = document.getElementById('verifyForm');
const regBtn = document.getElementById('regBtn');
const verifyBtn = document.getElementById('verifyBtn');

let submittedAadhaar = '';

registerForm.onsubmit = async (e) => {
  e.preventDefault();
  
  const name = document.getElementById('name').value.trim();
  const rawAadhaar = document.getElementById('aadhaar').value;
  const aadhaar = rawAadhaar.replace(/[\s-]/g, '');
  const phone = document.getElementById('phone').value.replace(/[\s-]/g, '');
  const email = document.getElementById('email').value.trim();

  if (aadhaar.length !== 12 || !/^\d{12}$/.test(aadhaar)) {
    return showToast("Aadhaar must be a 12-digit number.", "error");
  }

  submittedAadhaar = aadhaar;
  regBtn.disabled = true;
  regBtn.textContent = "Sending Verification OTP...";

  try {
    const res = await fetch('/api/auth/citizen/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, aadhaar, phone: `+91 ${phone}`, email })
    });
    const data = await res.json();

    if (data.success) {
      showToast(data.message || "OTP sent to your email! Please verify.", "success");
      registerForm.style.display = 'none';
      verifyForm.style.display = 'block';
    } else {
      showToast(data.error || "Registration request failed", "error");
      regBtn.disabled = false;
      regBtn.textContent = "Register Aadhaar";
    }
  } catch (err) {
    showToast("Network error. Try again.", "error");
    regBtn.disabled = false;
    regBtn.textContent = "Register Aadhaar";
  }
};

verifyForm.onsubmit = async (e) => {
  e.preventDefault();
  const otp = document.getElementById('regOtp').value.trim();

  verifyBtn.disabled = true;
  verifyBtn.textContent = "Verifying...";

  try {
    const res = await fetch('/api/auth/citizen/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aadhaar: submittedAadhaar, otp })
    });
    const data = await res.json();

    if (data.success) {
      Auth.saveSession(data.token, data.user);
      showToast("Registration and verification successful! Redirecting...", "success");
      setTimeout(() => window.location.href = "/citizen/portal", 800);
    } else {
      showToast(data.error || "Verification failed.", "error");
      verifyBtn.disabled = false;
      verifyBtn.textContent = "Verify & Complete Registration";
    }
  } catch (err) {
    showToast("Verification failed. Check network.", "error");
    verifyBtn.disabled = false;
    verifyBtn.textContent = "Verify & Complete Registration";
  }
};

function showToast(msg, type = "success") {
  const toast = document.getElementById("toast");
  toast.className = `toast-${type} show`;
  toast.innerHTML = `<strong>${type === "success" ? "Success:" : "Error:"}</strong> ${esc(msg)}`;
  setTimeout(() => toast.classList.remove("show"), 3000);
}
