/**
 * FH Audio - Roblox Open Cloud API & Settings Module
 * Handles Multi-account management, asset upload scripts (PowerShell native & Gateway fetch),
 * and moderation status checking.
 */

function initSettingsModule() {
  const accountsList = document.getElementById('accountsList');
  const btnOpenAddAccount = document.getElementById('btnOpenAddAccount');
  const btnToggleApiTutorial = document.getElementById('btnToggleApiTutorial');
  const apiTutorialBox = document.getElementById('apiTutorialBox');
  const btnCloseApiTutorial = document.getElementById('btnCloseApiTutorial');
  const btnModalHowToGetApi = document.getElementById('btnModalHowToGetApi');
  const modalAccount = document.getElementById('modalAccount');
  const modalTitle = document.getElementById('modalTitle');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCancelModal = document.getElementById('btnCancelModal');
  const formAccount = document.getElementById('formAccount');
  const accEditId = document.getElementById('accEditId');
  const accNameInput = document.getElementById('accNameInput');
  const accCreatorType = document.getElementById('accCreatorType');
  const accCreatorId = document.getElementById('accCreatorId');
  const accApiKey = document.getElementById('accApiKey');

  const selNamingMode = document.getElementById('selNamingMode');
  const boxStealthOptions = document.getElementById('boxStealthOptions');
  const selSceneCategory = document.getElementById('selSceneCategory');
  const inpAliasPrefix = document.getElementById('inpAliasPrefix');
  const chkPartNumber = document.getElementById('chkPartNumber');
  const namingPreview = document.getElementById('namingPreview');

  // Toggle API Tutorial Box Visibility
  function toggleTutorial(show) {
    if (!apiTutorialBox) return;
    const isCurrentlyOpen = apiTutorialBox.style.display !== 'none';
    const shouldOpen = typeof show === 'boolean' ? show : !isCurrentlyOpen;

    if (shouldOpen) {
      apiTutorialBox.style.display = 'flex';
      if (btnToggleApiTutorial) {
        btnToggleApiTutorial.classList.add('active');
        btnToggleApiTutorial.setAttribute('aria-expanded', 'true');
      }
      setTimeout(() => {
        apiTutorialBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    } else {
      apiTutorialBox.style.display = 'none';
      if (btnToggleApiTutorial) {
        btnToggleApiTutorial.classList.remove('active');
        btnToggleApiTutorial.setAttribute('aria-expanded', 'false');
      }
    }
  }

  if (btnToggleApiTutorial) {
    btnToggleApiTutorial.addEventListener('click', () => toggleTutorial());
  }

  if (btnCloseApiTutorial) {
    btnCloseApiTutorial.addEventListener('click', () => toggleTutorial(false));
  }

  if (btnModalHowToGetApi) {
    btnModalHowToGetApi.addEventListener('click', () => {
      closeModal();
      toggleTutorial(true);
    });
  }

  // Render accounts list in settings
  function renderAccountsList() {
    if (!accountsList) return;
    const accounts = window.FHStorage.getAccounts();
    accountsList.innerHTML = '';

    if (accounts.length === 0) {
      accountsList.innerHTML = `
        <div style="padding: 1.25rem; text-align: center; color: var(--text-dim); font-size: 0.85rem; border: 1px dashed rgba(255, 255, 255, 0.12); border-radius: 8px;">
          Belum ada akun Roblox yang tersimpan. Klik <button type="button" id="btnEmptyHowToGetApi" class="btn-inline-tutorial-trigger">Cara mendapatkan API</button> atau <b>+ Add account</b> di atas untuk menambahkan.
        </div>
      `;
      const btnEmptyHowToGetApi = document.getElementById('btnEmptyHowToGetApi');
      if (btnEmptyHowToGetApi) {
        btnEmptyHowToGetApi.addEventListener('click', () => toggleTutorial(true));
      }
      return;
    }

    accounts.forEach(acc => {
      const item = document.createElement('div');
      item.className = 'account-item' + (acc.isActive ? ' active' : '');

      const maskedKey = acc.apiKey && acc.apiKey.length > 8
        ? acc.apiKey.substring(0, 4) + '••••' + acc.apiKey.substring(acc.apiKey.length - 4)
        : '••••••••';

      const typeLabel = acc.creatorType === 'group' ? 'Group ID' : 'User ID';

      item.innerHTML = `
        <div class="account-item-left">
          <input type="radio" name="activeAccountRadio" class="account-radio" ${acc.isActive ? 'checked' : ''} />
          <div class="account-details">
            <div class="account-name-row">
              <span class="account-name">${escapeHtml(acc.name)}</span>
              ${acc.isActive ? '<span class="account-active-badge">ACTIVE</span>' : ''}
            </div>
            <div class="account-meta-line">
              ${typeLabel}: ${escapeHtml(acc.creatorId || '-')} · Key: ${maskedKey}
            </div>
          </div>
        </div>
        <div class="account-actions-right">
          <button type="button" class="btn-acc-action btn-edit-acc">Edit</button>
          <button type="button" class="btn-acc-action delete btn-del-acc">Delete</button>
        </div>
      `;

      // Select active on click
      item.querySelector('.account-item-left').addEventListener('click', () => {
        window.FHStorage.setActiveAccount(acc.id);
        renderAccountsList();
        window.showToast(`Akun aktif diubah ke: ${acc.name}`);
      });

      // Edit
      item.querySelector('.btn-edit-acc').addEventListener('click', (e) => {
        e.stopPropagation();
        openModal(acc);
      });

      // Delete
      item.querySelector('.btn-del-acc').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Hapus akun "${acc.name}"?`)) {
          window.FHStorage.deleteAccount(acc.id);
          renderAccountsList();
          window.showToast('Akun berhasil dihapus.');
        }
      });

      accountsList.appendChild(item);
    });

    updateNamingPreview();
  }

  function openModal(acc = null) {
    if (!modalAccount) return;
    if (acc) {
      modalTitle.textContent = 'Edit Roblox API Account';
      accEditId.value = acc.id;
      accNameInput.value = acc.name || '';
      accCreatorType.value = acc.creatorType || 'user';
      accCreatorId.value = acc.creatorId || '';
      accApiKey.value = acc.apiKey || '';
    } else {
      modalTitle.textContent = 'Add Roblox API Account';
      accEditId.value = '';
      accNameInput.value = '';
      accCreatorType.value = 'user';
      accCreatorId.value = '';
      accApiKey.value = '';
    }
    modalAccount.classList.add('show');
    accNameInput.focus();
  }

  function closeModal() {
    if (modalAccount) modalAccount.classList.remove('show');
  }

  if (btnOpenAddAccount) btnOpenAddAccount.addEventListener('click', () => openModal(null));
  if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeModal);

  if (formAccount) {
    formAccount.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = accNameInput.value.trim() || 'Roblox Account';
      const creatorType = accCreatorType.value;
      const creatorId = accCreatorId.value.trim();
      const apiKey = accApiKey.value.trim();

      if (!apiKey) {
        alert('Masukkan Open Cloud API Key Anda.');
        return;
      }

      window.FHStorage.addOrUpdateAccount({
        id: accEditId.value || undefined,
        name,
        creatorType,
        creatorId,
        apiKey
      });

      closeModal();
      renderAccountsList();
      window.showToast('Akun Roblox berhasil disimpan!');
    });
  }

  // Naming preview logic
  function updateNamingPreview(saveToStorage = false) {
    if (!namingPreview) return;
    const settings = window.FHStorage.getSettings();
    const mode = selNamingMode ? selNamingMode.value : (settings.namingMode || 'stealth_scene');
    const category = selSceneCategory ? selSceneCategory.value : (settings.sceneCategory || 'all');
    const prefix = inpAliasPrefix ? inpAliasPrefix.value.trim() : (settings.aliasPrefix || 'BGM');
    const partNumOn = chkPartNumber ? chkPartNumber.checked : settings.includePartNumber;

    if (boxStealthOptions) {
      boxStealthOptions.style.display = (mode === 'stealth_scene') ? 'grid' : 'none';
    }

    let titlePart1 = '';
    let titlePart2 = '';

    if (mode === 'stealth_scene') {
      const sampleScene = 'Cyber_City';
      const suffix1 = partNumOn ? '_Part1' : '';
      const suffix2 = partNumOn ? '_Part2' : '';
      titlePart1 = `${prefix || 'BGM'}_${sampleScene}${suffix1}`;
      titlePart2 = `${prefix || 'BGM'}_${sampleScene}${suffix2}`;
    } else {
      titlePart1 = partNumOn ? 'Last Goodbye (UNDERTALE) - Part 1' : 'Last Goodbye (UNDERTALE)';
      titlePart2 = partNumOn ? 'Last Goodbye (UNDERTALE) - Part 2' : 'Last Goodbye (UNDERTALE)';
    }

    if (titlePart1.length > 50) titlePart1 = titlePart1.substring(0, 47) + '...';
    if (titlePart2.length > 50) titlePart2 = titlePart2.substring(0, 47) + '...';

    namingPreview.innerHTML = `${escapeHtml(titlePart1)}<br>${escapeHtml(titlePart2)}`;

    // Save to settings ONLY when explicitly requested by user interaction, NOT on initial load
    if (saveToStorage) {
      window.FHStorage.saveSettings({
        ...settings,
        namingMode: mode,
        sceneCategory: category,
        aliasPrefix: prefix || 'BGM',
        includePartNumber: partNumOn
      });
    }
  }

  // Populate initial values
  const initSettings = window.FHStorage.getSettings();
  if (selNamingMode && initSettings.namingMode) selNamingMode.value = initSettings.namingMode;
  if (selSceneCategory && initSettings.sceneCategory) selSceneCategory.value = initSettings.sceneCategory;
  if (inpAliasPrefix && initSettings.aliasPrefix) inpAliasPrefix.value = initSettings.aliasPrefix;
  if (chkPartNumber && initSettings.includePartNumber !== undefined) chkPartNumber.checked = initSettings.includePartNumber;

  if (selNamingMode) selNamingMode.addEventListener('change', () => updateNamingPreview(true));
  if (selSceneCategory) selSceneCategory.addEventListener('change', () => updateNamingPreview(true));
  if (inpAliasPrefix) inpAliasPrefix.addEventListener('input', () => updateNamingPreview(true));
  if (chkPartNumber) chkPartNumber.addEventListener('change', () => updateNamingPreview(true));

  // Initialize display without saving or triggering server disk writes
  updateNamingPreview(false);
  renderAccountsList();

  window.FHSettings = {
    renderAccountsList,
    formatAssetName: (songTitle, partNum = 1, totalParts = 1, item = null) => {
      const settings = window.FHStorage.getSettings();
      const mode = settings.namingMode || 'stealth_scene';
      const prefix = settings.aliasPrefix || 'BGM';
      const partNumOn = settings.includePartNumber !== false;

      if (mode === 'stealth_scene') {
        let scene = item?.sceneAlias;
        if (!scene) {
          scene = (item?.id && window.FHAlias) ?
            window.FHAlias.getDeterministicScene(item.id, settings.sceneCategory) :
            (window.FHAlias ? window.FHAlias.getRandomScene(settings.sceneCategory) : 'Cyber_City');
        }
        return window.FHAlias ?
          window.FHAlias.generatePartAlias(scene, partNum, totalParts, prefix) :
          `${prefix}_${scene}_Part${partNum}`;
      }

      // Legacy fallback
      let name = (songTitle || 'Audio').replace(/\.[^/.]+$/, '');
      if (partNumOn && totalParts > 1) {
        name = `${name} - Part ${partNum}`;
      }
      if (name.length > 50) {
        name = name.substring(0, 47) + '...';
      }
      return name;
    }
  };
}

// ----------------------------------------------------
// UPLOAD EXECUTOR (PowerShell Native & Direct Gateway)
// ----------------------------------------------------

/**
 * Triggers upload of an audio part to Roblox Open Cloud API.
 * Uses native PowerShell automation or custom gateway.
 */
function uploadAudioPartToRoblox(historyItem, partNum, audioBlob = null) {
  const activeAccount = window.FHStorage.getActiveAccount();
  if (!activeAccount || !activeAccount.apiKey) {
    alert('Silakan tambahkan atau aktifkan Akun Roblox API di menu Settings terlebih dahulu.');
    window.switchTab('settings');
    return;
  }

  const assetName = window.FHSettings ? window.FHSettings.formatAssetName(historyItem.title, partNum, historyItem.parts.length) : `Part ${partNum}`;
  const creatorType = activeAccount.creatorType === 'group' ? 'groupId' : 'userId';
  const typeLabel = activeAccount.creatorType === 'group' ? 'Group ID' : 'User ID';
  const creatorId = activeAccount.creatorId || '0';
  const cleanFileName = `part_${partNum}_${(historyItem.title || 'audio').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 25)}.ogg`;

  // Generate bulletproof PowerShell Open Cloud uploader script
  const psScript = `
# FH Audio - Roblox Open Cloud Asset Uploader
# Uploading: ${assetName}
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$apiKey = "${activeAccount.apiKey}"
$audioFile = "${cleanFileName}"

Write-Host "======================================================" -ForegroundColor Yellow
Write-Host " FH AUDIO - ROBLOX OPEN CLOUD ASSET UPLOADER" -ForegroundColor Yellow
Write-Host " Judul Aset : ${assetName}" -ForegroundColor Cyan
Write-Host " Akun       : ${activeAccount.name} (${typeLabel}: ${creatorId})" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Yellow
Write-Host ""

if (-not (Test-Path $audioFile)) {
    Write-Host "[GALAT] Berkas audio '$audioFile' tidak ditemukan di folder ini." -ForegroundColor Red
    Write-Host "Pastikan file .ps1 ini dijalankan di folder yang sama dengan file audio Anda." -ForegroundColor Yellow
    pause
    exit
}

Write-Host "[1/2] Mengirim permintaan upload ke Roblox Open Cloud API..." -ForegroundColor Green

$jsonMeta = @{
    assetType = "Audio"
    displayName = "${assetName}"
    description = "In-game background audio and atmospheric music"
    creationContext = @{
        creator = @{
            ${creatorType} = "${creatorId}"
        }
    }
} | ConvertTo-Json -Compress

# Create multipart form data request using curl.exe
$curlCmd = "curl.exe -s -X POST https://apis.roblox.com/assets/v1/assets " + \`
    "-H ""x-api-key: $apiKey"" " + \`
    "-F ""request=$jsonMeta;type=application/json"" " + \`
    "-F ""fileContent=@$audioFile;type=audio/ogg"""

Write-Host "Mengunggah data audio..." -ForegroundColor DarkGray
$resp = Invoke-Expression $curlCmd

if ($resp -match '"path":"([^"]+)"') {
    $opPath = $matches[1]
    Write-Host "[2/2] File terunggah! Memeriksa status moderasi..." -ForegroundColor Green
    
    $checkUrl = "https://apis.roblox.com/assets/v1/$opPath"
    $maxTries = 10
    $assetId = ""

    for ($i = 1; $i -le $maxTries; $i++) {
        Start-Sleep -Seconds 2
        $opResp = Invoke-RestMethod -Uri $checkUrl -Headers @{"x-api-key" = $apiKey} -Method Get
        if ($opResp.done) {
            if ($opResp.response.assetId) {
                $assetId = $opResp.response.assetId
                Write-Host ""
                Write-Host "======================================================" -ForegroundColor Green
                Write-Host " SUKSES! Audio berhasil lolos moderasi Roblox!" -ForegroundColor Green
                Write-Host " ASSET ID : $assetId" -ForegroundColor Yellow
                Write-Host " Gunakan ID ini di Roblox Studio: rbxassetid://$assetId" -ForegroundColor Cyan
                Write-Host "======================================================" -ForegroundColor Green
                Set-Clipboard -Value "$assetId"
                Write-Host "(Asset ID telah otomatis disalin ke Clipboard Anda)" -ForegroundColor DarkGray
                break
            } else {
                Write-Host "[PERINGATAN] Status: Moderated / Rejected oleh Roblox." -ForegroundColor Red
                break
            }
        } else {
            Write-Host "Sedang ditinjau oleh Roblox... ($i/$maxTries)" -ForegroundColor DarkYellow
        }
    }
} else {
    Write-Host "[GALAT] Gagal mengunggah:" -ForegroundColor Red
    Write-Host $resp -ForegroundColor Red
}

Write-Host ""
Write-Host "Tekan tombol apa saja untuk menutup jendela..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
`;

  // Download the PowerShell script
  const scriptBlob = new Blob([psScript], { type: 'text/plain;charset=utf-8' });
  const scriptUrl = URL.createObjectURL(scriptBlob);
  const a1 = document.createElement('a');
  a1.href = scriptUrl;
  a1.download = `upload_roblox_part${partNum}.ps1`;
  document.body.appendChild(a1);
  a1.click();
  document.body.removeChild(a1);
  URL.revokeObjectURL(scriptUrl);

  // If audio blob provided, also trigger download of the audio part
  if (audioBlob) {
    const audioUrl = URL.createObjectURL(audioBlob);
    const a2 = document.createElement('a');
    a2.href = audioUrl;
    a2.download = cleanFileName;
    document.body.appendChild(a2);
    a2.click();
    document.body.removeChild(a2);
    URL.revokeObjectURL(audioUrl);
  }

  // Update history item to 'reviewing'
  window.FHStorage.updateHistoryPart(historyItem.id, partNum, {
    viaAccount: activeAccount.name,
    moderationStatus: 'reviewing'
  });

  if (window.FHHistory && typeof window.FHHistory.renderHistoryDashboard === 'function') {
    window.FHHistory.renderHistoryDashboard();
  }

  window.showToast(`Script upload Part ${partNum} berhasil dibuat & diunduh!`);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.initSettingsModule = initSettingsModule;
window.uploadAudioPartToRoblox = uploadAudioPartToRoblox;
