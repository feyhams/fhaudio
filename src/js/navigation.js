/**
 * FH Audio - Navigation & View Manager
 * Controls sidebar active tabs and sub-modes (Single vs Mass Convert).
 */

function initNavigation() {
  const navBypass = document.getElementById('navBypass');
  const navHistory = document.getElementById('navHistory');
  const navSettings = document.getElementById('navSettings');

  const viewBypass = document.getElementById('viewBypass');
  const viewHistory = document.getElementById('viewHistory');
  const viewSettings = document.getElementById('viewSettings');

  const navItems = [
    { btn: navBypass, view: viewBypass, name: 'bypass' },
    { btn: navHistory, view: viewHistory, name: 'history' },
    { btn: navSettings, view: viewSettings, name: 'settings' }
  ];

  function switchTab(targetName) {
    navItems.forEach(item => {
      if (!item.btn || !item.view) return;
      if (item.name === targetName) {
        item.btn.classList.add('active');
        item.view.classList.add('active');
      } else {
        item.btn.classList.remove('active');
        item.view.classList.remove('active');
      }
    });

    // Refresh view specific components
    if (targetName === 'bypass') {
      if (window.trimmerInstance && window.trimmerInstance.audioBuffer) {
        requestAnimationFrame(() => {
          window.trimmerInstance.resizeCanvas();
          window.trimmerInstance.draw();
          window.trimmerInstance.renderRuler('waveformRuler');
        });
        setTimeout(() => {
          if (window.trimmerInstance) {
            window.trimmerInstance.resizeCanvas();
            window.trimmerInstance.draw();
            window.trimmerInstance.renderRuler('waveformRuler');
          }
        }, 100);
      }
    }
    if (targetName === 'history' && window.FHHistory && typeof window.FHHistory.renderHistoryDashboard === 'function') {
      window.FHHistory.renderHistoryDashboard();
    }
    if (targetName === 'settings' && window.FHSettings) {
      if (typeof window.FHSettings.renderAccountsList === 'function') {
        window.FHSettings.renderAccountsList();
      }
      if (typeof window.FHSettings.updateBackupBadge === 'function') {
        window.FHSettings.updateBackupBadge();
      }
    }
  }

  navItems.forEach(item => {
    if (item.btn) {
      item.btn.addEventListener('click', () => switchTab(item.name));
    }
  });

  window.switchTab = switchTab;

  // Single vs Mass Convert Pill Switcher
  const btnModeSingle = document.getElementById('btnModeSingle');
  const btnModeMass = document.getElementById('btnModeMass');
  const singleConvertPanel = document.getElementById('singleConvertPanel');
  const massConvertPanel = document.getElementById('massConvertPanel');

  if (btnModeSingle && btnModeMass) {
    btnModeSingle.addEventListener('click', () => {
      btnModeSingle.classList.add('active');
      btnModeMass.classList.remove('active');
      if (singleConvertPanel) singleConvertPanel.style.display = 'flex';
      if (massConvertPanel) massConvertPanel.classList.remove('active');
      if (window.trimmerInstance && window.trimmerInstance.audioBuffer) {
        requestAnimationFrame(() => {
          window.trimmerInstance.resizeCanvas();
          window.trimmerInstance.draw();
          window.trimmerInstance.renderRuler('waveformRuler');
        });
        setTimeout(() => {
          if (window.trimmerInstance) {
            window.trimmerInstance.resizeCanvas();
            window.trimmerInstance.draw();
            window.trimmerInstance.renderRuler('waveformRuler');
          }
        }, 100);
      }
    });

    btnModeMass.addEventListener('click', () => {
      btnModeMass.classList.add('active');
      btnModeSingle.classList.remove('active');
      if (singleConvertPanel) singleConvertPanel.style.display = 'none';
      if (massConvertPanel) massConvertPanel.classList.add('active');
    });
  }
}

window.initNavigation = initNavigation;
