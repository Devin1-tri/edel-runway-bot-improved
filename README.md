# 🤖 Edel Runway Desk - Auto Vote Bot (Improved v3.1)

Bot otomatis untuk daily vote pada **Listing Calls** di [Edel Finance Runway Desk](https://runway.edel.finance/listing-calls) dengan fitur **Interactive Telegram Control** dan **Session Awareness**.

---

## ✨ Fitur Unggulan

1. **🤖 Interactive Telegram Control** — Cookie expired? Tinggal paste token baru lewat Telegram. **Gak perlu SSH lagi!**
2. **📌 Telegram Commands** — `/status`, `/vote`, `/help`
3. **🔑 Smart Token Wrapper** — Cukup copy JWT token (`eyJ...`) aja
4. **💓 Session Keep-Alive** — Ping tiap 30 menit biar session gak timeout
5. **🔐 JWT Expiry Detection** — Deteksi kapan session bakal expired
6. **⚠️ Proactive Warning** — Peringatan otomatis pas session tinggal <2 jam

---

## 📋 Prerequisites

- **Node.js v18+**
- **Akun Runway Desk** → [Register](https://runway.edel.finance/register)
- **Telegram Bot** → Buat lewat `@BotFather`

---

## 🚀 Panduan Setup Awal

### 1. Clone & Install

```bash
git clone https://github.com/Devin1-tri/edel-runway-bot-improved.git
cd edel-runway-bot-improved
npm install
```

### 2. Konfigurasi `.env`

```bash
cp .env.example .env
nano .env
```

Isi bagian Telegram:
- `TELEGRAM_BOT_TOKEN` — Token dari `@BotFather`
- `TELEGRAM_CHAT_ID` — ID chat kamu

### 3. Jalankan Bot

Semua perintah dari **root folder**, pakai **node langsung**:

```bash
# 🔥 Mulai bot scheduler + Telegram listener
node start.js

# 📊 Cek status session (tanpa perlu jalanin bot)
node status.js

# 🗳️  Vote sekali manual
node vote.js

# 📥 Import cookie session
node import-session.js

# 🗑️  Hapus session
node clear-session.js
```

Atau via **npm scripts** (sama aja):

```bash
npm run start
npm run status
npm run vote
npm run import
npm run clear
```

### Biar tetap jalan di background (screen)

```bash
screen -S edel
node start.js
# Ctrl+A lalu D untuk detach
```

> **Catatan:** `ecosystem.config.cjs` disediakan untuk yang biasa pakai PM2 — tapi **tidak wajib**. Cukup `node start.js` + screen sudah cukup.

---

## 📲 Update Cookie Lewat Telegram (Kalau Expired)

Pas bot kirim notif **🔑 SESSION EXPIRED** di Telegram:

1. Buka Chrome → Login ke [runway.edel.finance](https://runway.edel.finance)
2. Buka `/listing-calls` → **F12** → tab **Network**
3. **Refresh** (Ctrl+R)
4. Cari request pertama → copy **token JWT** (`eyJ...`) aja
5. **Paste & kirim** ke chat bot Telegram
6. Selesai! 🎯

---

## 🛠️ Perintah Telegram

Kirim perintah ini di chat bot Telegram:

- `/status` — Cek session & sisa waktu
- `/vote` — Force voting sekarang
- `/help` — Panduan lengkap

---

## ⚙️ Configuration (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `VOTE_STRATEGY` | `smart` | Strategi: `random` / `smart` / `first` / `second` |
| `VOTE_INTERVAL_MINUTES` | `60` | Interval antar vote (menit) |
| `VOTE_BUFFER_MINUTES` | `5` | Buffer setelah round selesai |
| `RETRY_INTERVAL_MINUTES` | `5` | Jeda retry jika round belum siap |
| `MAX_RETRIES` | `3` | Maksimal percobaan ulang |
| `TELEGRAM_BOT_TOKEN` | — | Token bot dari @BotFather |
| `TELEGRAM_CHAT_ID` | — | ID chat Telegram kamu |
| `KEEPALIVE_ENABLED` | `true` | Keep-alive ping API |
| `KEEPALIVE_INTERVAL_MINUTES` | `30` | Interval keep-alive |

---

## 📜 Disclaimer

> Bot ini dibuat untuk keperluan edukasi dan uji coba. Penggunaan automasi sepenuhnya risiko pengguna masing-masing.
