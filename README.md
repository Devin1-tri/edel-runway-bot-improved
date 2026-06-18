# 🤖 Edel Runway Desk - Auto Vote Bot (Improved v3.1)

Bot otomatis untuk daily vote pada **Listing Calls** di [Edel Finance Runway Desk](https://runway.edel.finance/listing-calls) dengan fitur **Interactive Telegram Control** dan **Session Awareness**.

## ✨ Perbaikan & Fitur Unggulan (v3.1)

Dibandingkan dengan repository aslinya yang merepotkan ketika cookie expired, versi clone yang sudah ditingkatkan ini memiliki fitur:

1. **🤖 Interactive Telegram Control (Anti-Ribet!)**
   * **Masalah versi lama:** Jika cookie expired, kamu harus SSH ke VPS, masuk ke `screen`, matikan bot (`Ctrl+C`), jalankan `npm run import`, paste cookie baru, lalu jalankan `npm run start` lagi. Ribet banget kalau lagi di luar atau lewat HP!
   * **Solusi versi baru:** Bot memiliki **Telegram Listener 2-arah** (Inbound & Outbound) yang berjalan di background. Ketika cookie expired, bot akan mengirim notifikasi ke Telegram kamu. Kamu tinggal ambil cookie baru dari Chrome PC (atau cukup token JWT yang berawalan `eyJ...`), lalu **PASTE & KIRIM LANGSUNG** ke chat bot Telegram tersebut! Bot akan mendeteksi token baru, memperbarui session secara otomatis di VPS, mengetes validitasnya, dan langsung melanjutkan voting. **Nol interaksi SSH setelah setup awal!**
2. **📌 Telegram Commands**
   * Kirim `/status` ke bot Telegram untuk mengecek kesehatan session dan status voting kapan saja.
   * Kirim `/vote` untuk memicu (force) siklus voting secara manual saat itu juga dari Telegram.
   * Kirim `/help` untuk menampilkan panduan lengkap.
3. **🔑 Smart Token Wrapper**
   * Kamu tidak harus meng-copy semua header Cookie yang panjang. Cukup copy string token JWT-nya saja (yang dimulai dengan `eyJ...`), kirim ke Telegram, dan bot akan membungkusnya secara otomatis ke struktur cookie format Playwright.
4. **💓 Session Keep-Alive (NEW in v3.1!)**
   * Bot secara otomatis melakukan ping ke Edel Finance API setiap 30 menit (dapat dikonfigurasi) untuk mencegah session timeout karena idle.
   * Jika session sudah expired, bot akan mendeteksi dan mengirim notifikasi ke Telegram.
5. **🔐 JWT Expiry Detection (NEW in v3.1!)**
   * Bot mendekode token JWT `edel_session` dan membaca klaim `exp` untuk mengetahui kapan session akan berakhir.
   * Perintah `/status` sekarang menampilkan waktu kedaluwarsa dan sisa waktu session.
   * `isSessionLikelyExpired()` menggunakan data JWT (bukan hanya umur file) untuk akurasi yang lebih baik.
6. **⚠️ Proactive Expiry Warning (NEW in v3.1!)**
   * Bot mengirim peringatan otomatis sebelum session kedaluwarsa:
     * **< 2 jam tersisa:** Peringatan biasa
     * **< 30 menit tersisa:** Peringatan mendesak setiap 5 menit
   * Dengan ini kamu punya waktu untuk memperbarui cookie sebelum bot berhenti berfungsi.
7. **📦 PM2 & Docker Ready**
   * Dilengkapi `ecosystem.config.cjs` untuk deploy mudah di VPS menggunakan PM2 agar bot auto-restart jika VPS reboot atau crash.

---

## 📋 Prerequisites

* **Node.js v18+**
* **Akun Runway Desk** → [Register](https://runway.edel.finance/register)
* **Telegram Bot** → Buat lewat `@BotFather`

---

## 🚀 Panduan Setup Awal (Sekali Saja)

### 1. Ekstrak & Install Dependencies

```bash
cd edel-improved
npm install
```

### 2. Konfigurasi `.env`

Copy `.env.example` menjadi `.env` lalu isi konfigurasinya:

```bash
cp .env.example .env
nano .env
```

Pastikan kamu mengisi bagian Telegram:
* `TELEGRAM_BOT_TOKEN`: Token bot dari `@BotFather`.
* `TELEGRAM_CHAT_ID`: ID chat kamu (bisa dicari via `https://api.telegram.org/bot<TOKEN>/getUpdates`).

Konfigurasi opsional untuk Session Keep-Alive:
* `KEEPALIVE_ENABLED`: Aktifkan keep-alive (default: `true`).
* `KEEPALIVE_INTERVAL_MINUTES`: Interval ping dalam menit (default: `30`).

### 3. Jalankan Bot

Gunakan **PM2** (Sangat Direkomendasikan) agar bot berjalan stabil di background VPS:

```bash
# Install PM2 jika belum punya
npm install -g pm2

# Jalankan bot dengan konfigurasi yang sudah disiapkan
pm2 start ecosystem.config.cjs

# Cek logs bot
pm2 logs edel-vote-bot

# Agar PM2 auto-start saat VPS reboot
pm2 startup
pm2 save
```

*(Atau jika tetap ingin menggunakan `screen`):*
```bash
screen -S edel
npm run start
# Tekan Ctrl+A lalu D untuk detach (keluar)
```

---

## 📲 Cara Update Cookie Lewat Telegram (Jika Expired)

Saat bot mengirim pesan **🔑 SESSION EXPIRED** di Telegram:

1. Buka Chrome di PC/Laptop kamu.
2. Login ke [https://runway.edel.finance](https://runway.edel.finance)
3. Buka halaman `/listing-calls`
4. Tekan **F12** (DevTools) → klik tab **Network**
5. **Refresh** halaman (Ctrl+R)
6. Cari request pertama di daftar, klik, lalu lihat bagian **Request Headers** di panel kanan.
7. Ambil bagian value **"Cookie:"** (ambil yang `edel_session=eyJ...`) ATAU **cukup copy kode JWT token-nya saja** yang berawalan `eyJ...`.
8. Buka Telegram di HP atau PC kamu, buka chat dengan bot kamu.
9. **Kirim / Paste langsung** kode tersebut ke bot Telegram.
10. Selesai! Bot akan merespon: *"✅ COOKIE BERHASIL DIPASANG! Verifikasi sukses. Bot melanjutkan voting otomatis."*

---

## 🛠️ Perintah Telegram (Chat Bot)

Kirim perintah ini langsung di dalam chat bot Telegram kamu:

* `/status` — Untuk mengecek apakah session masih valid, waktu kedaluwarsa JWT, dan sisa waktu session.
* `/vote` — Memaksa bot melakukan voting saat ini juga (jika jendela voting terbuka).
* `/help` — Menampilkan bantuan instruksi bot.

---

## ⚙️ Configuration (.env)

| Variable | Default | Description |
| --- | --- | --- |
| `VOTE_STRATEGY` | `smart` | Strategi voting: `random` / `smart` / `first` / `second` |
| `VOTE_INTERVAL_MINUTES` | `60` | Interval antar vote setelah sukses (menit) |
| `VOTE_BUFFER_MINUTES` | `5` | Buffer waktu tunggu tambahan setelah round selesai agar EDELx unlock |
| `RETRY_INTERVAL_MINUTES` | `5` | Jeda retry jika round belum siap / pending |
| `MAX_RETRIES` | `3` | Maksimal percobaan ulang jika gagal |
| `TELEGRAM_BOT_TOKEN` | *(kosong)* | Token bot dari @BotFather |
| `TELEGRAM_CHAT_ID` | *(kosong)* | ID chat kamu untuk notifikasi & interaksi kontrol |
| `KEEPALIVE_ENABLED` | `true` | Aktifkan session keep-alive (ping API secara berkala) |
| `KEEPALIVE_INTERVAL_MINUTES` | `30` | Interval keep-alive dalam menit |

---

## 🧠 Cara Kerja Session Awareness

### JWT Expiry Detection

Token `edel_session` adalah JWT (JSON Web Token) yang berisi klaim `exp` (expiry timestamp). Bot mendekode payload JWT secara lokal menggunakan base64url decoding, tanpa perlu library eksternal. Ini memungkinkan bot untuk:

* Mengetahui **kapan persisnya** session akan berakhir
* Menghitung **sisa waktu** hingga kedaluwarsa
* Memberikan peringatan **sebelum** session benar-benar habis

### Session Keep-Alive

Beberapa server mengakhiri session jika tidak ada aktivitas dalam jangka waktu tertentu. Bot ini mengirim request ringan (`GET /assets`) secara berkala untuk menjaga session tetap aktif. Jika response menunjukkan session expired (HTTP 401/403), bot akan:

1. Mengirim notifikasi ke Telegram
2. Menunggu kamu mengirim cookie baru
3. Otomatis melanjutkan voting setelah session diperbarui

### Proactive Warnings

Sebelum setiap siklus voting, bot memeriksa sisa waktu JWT. Berdasarkan sisa waktu, bot akan:

* **> 2 jam:** Tidak ada peringatan (aman)
* **< 2 jam:** Kirim peringatan biasa ke Telegram
* **< 30 menit:** Kirim peringatan mendesak setiap 5 menit
* **Expired:** Kirim notifikasi expired dan skip voting

---

## 📜 Disclaimer
> Bot ini dibuat untuk keperluan edukasi dan uji coba. Penggunaan automasi pada platform Edel Finance Runway Desk sepenuhnya merupakan risiko pengguna masing-masing.

**Improved & Optimized Clone by Sauna Assistant** ⚡
