import { validateConfig } from './utils/config.js';
import config from './utils/config.js';
import logger, { logSeparator } from './utils/logger.js';
import { hasSession, getSessionAge, clearSession, importSession, importSessionFromFile } from './auth/session.js';
import { checkSession } from './api/client.js';
import { startScheduler, runSingleVote } from './scheduler/cron.js';

// Get CLI command
const command = process.argv[2] || 'help';
const extraArg = process.argv[3] || null;

/**
 * Print usage help
 */
function printHelp() {
  console.log(`
\x1b[36m
 ██████╗  █████╗ ████████╗ ██████╗ ██╗  ██╗██████╗ ██████╗  ██████╗ ███╗   ██╗        ██╗  ██╗ ██████╗ █████╗ 
 ██╔══██╗██╔══██╗╚══██╔══╝██╔═══██╗██║ ██╔╝██╔══██╗██╔══██╗██╔════╝ ████╗  ██║        ██║  ██║██╔════╝██╔══██╗
 ██████╔╝███████║   ██║   ██║   ██║█████╔╝ ██║  ██║██████╔╝██║  ███╗██╔██╗ ██║        ███████║██║     ███████║
 ██╔══██╗██╔══██║   ██║   ██║   ██║██╔═██╗ ██║  ██║██╔══██╗██║   ██║██║╚██╗██║        ██╔══██║██║     ██╔══██║
 ██████╔╝██║  ██║   ██║   ╚██████╔╝██║  ██╗██████╔╝██║  ██║╚██████╔╝██║ ╚████║        ██║  ██║╚██████╗██║  ██║
 ╚═════╝ ╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝        ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝\x1b[0m
\x1b[90m  ──────────────────────────────────────────────────────────────────────────────────\x1b[0m
\x1b[33m   ⚡ Edel Runway Desk — Auto Vote Bot v3.0 (Improved)\x1b[0m
\x1b[90m   🌐 Pure HTTP Mode — Interactive Telegram Control (Anti-Ribet!)\x1b[0m
\x1b[90m  ──────────────────────────────────────────────────────────────────────────────────\x1b[0m

Usage: node src/index.js <command>

Commands:
  import    ⭐ Import session dari Chrome DevTools (Atau kirim langsung lewat Telegram!)
            Login di Chrome PC → F12 → Network → copy Cookie → paste.

  import-file <path>
            Import session dari file JSON.

  vote      Vote sekali saja (tanpa scheduling)

  start     🔥 Mulai bot scheduler + Telegram Interactive Bot
            Bot berjalan terus sampai dihentikan (Ctrl+C).
            Jika cookie expired, cukup kirim cookie/token baru langsung lewat chat Telegram!

  status    Cek status session, verifikasi API, dan konfigurasi

  clear     Hapus session (force re-import)

  help      Tampilkan bantuan ini

NPM Shortcuts:
  npm run import    → import session secara manual lewat terminal
  npm run vote      → vote sekali saja
  npm run start     → mulai bot scheduler + Telegram Interactive Bot

Workflow (Cara Paling Gampang):
  1. Isi TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID di .env
  2. Jalankan bot: npm run start
  3. Bot akan ngasih tahu lewat Telegram kalau session expired
  4. Ambil cookie dari Chrome PC (atau cukup token JWT yang dimulai 'eyJ...')
  5. PASTE & KIRIM langsung ke chat bot Telegram kamu!
  6. Bot auto-refresh session dan lanjut voting sendiri! Gak perlu SSH lagi!
`);
}

/**
 * Show current bot status
 */
async function showStatus() {
  logSeparator();
  logger.info('📊 Bot Status');
  logSeparator();

  // Session status
  if (hasSession()) {
    const age = getSessionAge();
    const ageStr = age !== null ? `${age.toFixed(1)} jam` : 'unknown';

    // Test if session is actually valid
    logger.info('🔍 Mengetes session ke API Edel Finance...');
    const valid = await checkSession();

    if (valid) {
      logger.info(`✅ Session: VALID (umur: ${ageStr})`);
    } else {
      logger.warn(`⚠️  Session: EXPIRED / INVALID (umur: ${ageStr})`);
      logger.info('   Silakan jalankan "npm run start" dan kirim cookie baru via Telegram.');
    }
  } else {
    logger.error('❌ Session: BELUM ADA');
    logger.info('   Jalankan "npm run start" dan kirim cookie baru via Telegram untuk setup awal.');
  }

  // Config
  logger.info('');
  logger.info('⚙️  Configuration:');
  logger.info(`   Strategy:    ${config.voteStrategy}`);
  logger.info(`   Interval:    ${config.voteIntervalMinutes} mnt + ${config.voteBufferMinutes} mnt buffer`);
  logger.info(`   Max Retries: ${config.maxRetries}`);
  logger.info(`   Base URL:    ${config.baseUrl}`);
  logger.info(`   Telegram:    ${config.telegramBotToken ? 'Terbuka (Interactive) ✅' : 'Belum diset ⚠️'}`);
  logger.info(`   Mode:        Pure HTTP (no browser needed)`);
  logSeparator();
}

/**
 * Main entry point
 */
async function main() {
  try {
    // Validate config (except for help command)
    if (command !== 'help') {
      validateConfig();
    }

    switch (command) {
      case 'import':
        await importSession();
        break;

      case 'import-file':
        if (!extraArg) {
          logger.error('❌ Perlu path ke file JSON.');
          logger.info('   Contoh: node src/index.js import-file ./session.json');
        } else {
          importSessionFromFile(extraArg);
        }
        break;

      case 'vote':
        await runSingleVote();
        break;

      case 'start':
        await startScheduler();
        break;

      case 'status':
        await showStatus();
        break;

      case 'clear':
        clearSession();
        logger.info('Session dihapus. Silakan kirim cookie baru via Telegram Bot.');
        break;

      case 'help':
      default:
        printHelp();
        break;
    }
  } catch (err) {
    logger.error(`Fatal error: ${err.message}`);
    logger.debug(err.stack);
    process.exit(1);
  }
}

main();
