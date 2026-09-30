/**
 * FH Audio - Toast Notification Utility
 */

let toastTimeout = null;

function showToast(message, isGold = true) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast-container';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.className = 'toast-container show' + (isGold ? ' toast-gold' : '');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}

window.showToast = showToast;
