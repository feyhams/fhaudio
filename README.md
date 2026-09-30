# FH Audio - Roblox Audio Studio & Bypass Engine

**FH Audio** adalah aplikasi studio audio modern berbasis web untuk kreator dan developer Roblox. Aplikasi ini beroperasi 100% secara lokal (*client-side & serverless*), tanpa bergantung pada server pihak ketiga berbayar.

---

## Fitur Utama

### 1. Bypass Audio & Interactive Waveform Trimmer
- **Visual Waveform Real-time**: Menggambar bentuk gelombang audio asli dari berkas suara via HTML5 Canvas dengan aksen emas yang elegan.
- **Precision Trimmer Handles**: Pegangan geser kiri dan kanan untuk memotong lagu secara presisi, lengkap dengan timecode dan tombol *snap at playhead*.
- **Preset Roblox Bypass Cepat**:
  - `Slow 2.1x`, `Default 2.3x`, `Fast 2.5x`, `Faster 2.7x`, `Ultra 2.9x`
  - Audio Quality: `Normal (400s)`, `High (300s)`, `Extreme (250s)`
- **Equalizer & Headroom Protection**: Menambahkan Treble Booster (+3.5 dB pada 6.5 kHz) agar suara jernih saat di-slow down di Roblox Studio, serta Headroom Limiter (-4 dB) untuk mencegah clipping.
- **Auto-Split Multipart**: Otomatis membagi lagu panjang menjadi Part 1, Part 2, dst. sesuai batas durasi yang ditentukan agar aman dari limit 7 menit Roblox.
- **Integrasi Media URL**: Tempel tautan YouTube/SoundCloud langsung untuk mengambil metadata dan mengunduh audio via `yt-dlp` langsung ke folder `%USERPROFILE%\Downloads`.

### 2. Conversion History Dashboard
- **Statistik Ringkasan**: Menampilkan total Songs, Total Parts, dan Uploaded Parts.
- **Filter Status Moderasi**: Tab filter interaktif (`All`, `Approved`, `Rejected`, `Reviewing`, `Unchecked`).
- **Pencarian Cepat**: Filter lagu berdasarkan judul atau nama part secara instan.
- **1-Click Copy**: Tombol cepat untuk menyalin PlaybackSpeed, Volume Roblox, dan Asset ID (`rbxassetid://...`).
- **Ekspor CSV**: Menyimpan rekap seluruh riwayat konversi ke file `.csv` dengan 1 klik.

### 3. Roblox Open Cloud API & Multi-Account Settings
- **Multi-Account Storage**: Simpan beberapa Open Cloud API Key secara privat di komputer Anda (`localStorage`).
- **Dukungan User ID & Group ID**: Memilih apakah aset diunggah atas nama akun pribadi atau group game.
- **Otomasi Upload Tanpa CORS (PowerShell Native)**: Menghasilkan skrip PowerShell otomatis (`upload_roblox_partX.ps1`) yang langsung mengunggah file ke Roblox Open Cloud API dan memantau status moderasi hingga lolos.
- **Roblox Upload Naming**: Menyesuaikan format penamaan otomatis judul aset Roblox agar selalu rapi dan memenuhi batas 50 karakter.

---

## Cara Menjalankan
Aplikasi ini **tidak memerlukan Node.js, tidak memerlukan build step (`npm run build`), dan tanpa framework berat**.
Cukup klik ganda berkas **`index.html`** di browser modern apa saja (Chrome, Edge, Firefox, Brave) dan aplikasi langsung siap digunakan!
