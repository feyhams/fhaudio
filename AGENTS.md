# Project Context & Agent Operating Rules

Panduan ini berisi aturan baku dan preferensi dari pembuat proyek untuk setiap agent yang mengelola atau meremix aplikasi ini.

---

## 1. Prinsip Utama (Core Principles)
- **ATURAN WAJIB & NON-NEGOSIABLE**:
  - **100% Serba Gratis (Zero-Cost)**: Semua fitur, pustaka/dependencies, metode eksekusi, dan opsi hosting harus 100% gratis tanpa biaya tersembunyi, tanpa API berbayar, tanpa memerlukan kartu kredit, dan tanpa batas kuota berbayar. Manfaatkan Web API bawaan browser, open-source (yt-dlp, WASM encoder), dan hosting statis tanpa biaya (GitHub Pages / preview gratis).
  - **Tanpa Framework**: Jangan gunakan React, Vue, Angular, atau setup Vite.
  - **Tanpa Build Process**: App harus berjalan langsung hanya dengan mengakses file `index.html`. Tidak boleh ada kewajiban menjalankan `npm run build` atau `npm run dev` untuk mengompilasi kode. Saat pengguna meng-export/unzip dan klik 2x `index.html`, aplikasi harus langsung berjalan dan berpenampilan sempurna (semua path CSS & JS harus relatif `./`, bukan `/`).
- **Ringkas, Fungsional & Tanpa AI Slop**: Jangan tambahkan teks petunjuk yang terlalu panjang atau bertele-tele di antarmuka. Jaga tampilan tetap bersih, modern, dan langsung pada fungsionalitas utama (*action-oriented*).
- **Tanpa Server Eksternal / 100% Client & Tool Berbasis Standalone**:
  - Pengunduhan YouTube audio menggunakan perintah native Windows PowerShell atau script `.bat` lokal (`yt-dlp` langsung ke folder Downloads pengguna).
  - Roblox Audio Studio berjalan 100% di browser pengguna memanfaatkan Web Audio API dan WASM Encoders (OGG/MP3/WAV) tanpa ketergantungan server backend.
- **Lokasi Unduhan**: Hasil unduhan audio YouTube **harus selalu diarahkan ke folder Downloads pengguna**:
  - Parameter yt-dlp: `-P "%USERPROFILE%/Downloads"` atau `-P "$HOME\Downloads"`.

---

## 2. Aturan Tampilan & UI (UI Guidelines)
- **Tombol Aksi Utama**:
  - Tampilkan tombol aksi yang jelas: `Salin Perintah PowerShell` dan `Unduh Script (.bat)`.
  - **Dilarang** menampilkan blok kode perintah yang panjang dan memenuhi layar secara default; cukup sediakan tombol salin dengan indikator yang jelas.
  - Sediakan progress tracker visual dinamis saat proses download dimulai.
- **Riwayat Terakhir (History)**:
  - Harus berupa komponen **dropdown / collapsible** (`<details>` / `<summary>`), dengan status default **tertutup (hide/collapsed)** agar tidak mengganggu fokus pengguna.
- **Dilarang Menampilkan Banner Usang**:
  - Jangan menambahkan kembali peringatan atau banner keamanan seperti *"Perlindungan Keamanan Aktif / yt1s"*, karena aplikasi ini tidak menggunakan converter API pihak ketiga yang berisiko.
- **Modularitas & Anti-Duplikasi**:
  - Navigasi tab dikelola terpusat di `src/js/navigation.js`. Jangan membuat listener tab duplikat di file modul lain seperti `youtube.js` atau `roblox.js`.

---

## 3. Arsitektur File Proyek
- `index.html`: Entry point HTML utama, memuat antarmuka YouTube Converter dan Roblox Audio Studio.
- `src/styles/main.css`: Seluruh styling kustom aplikasi dengan tema gelap (*dark neutral/slate palette*).
- `src/js/main.js`: Inisialisasi utama aplikasi.
- `src/js/navigation.js`: Pengendali perpindahan view/tab (YouTube Converter & Roblox Audio Studio).
- `src/js/youtube.js`: Logika YouTube Converter, generator skrip Windows PowerShell / .bat, progress tracker, dan riwayat download.
- `src/js/roblox.js`: Pemrosesan audio Roblox Studio (Trimming, pitch/speed modulation, auto-split 6 menit, Web Audio player, WASM exporter).
- `src/js/toast.js`: Utilitas notifikasi toast interaktif.
