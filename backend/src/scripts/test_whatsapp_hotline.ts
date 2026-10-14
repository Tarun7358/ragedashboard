/**
 * test_whatsapp_hotline.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive test script for the Rage Optimiser WhatsApp Owner Hotline.
 *
 * Usage:
 *   npx tsx src/scripts/test_whatsapp_hotline.ts
 */

import { WhatsAppService } from '../services/WhatsAppService.js';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

const _require = createRequire(import.meta.url);
const _dotenv = _require('dotenv');

// Load environment
const possibleEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend', '.env'),
  path.resolve(process.cwd(), '..', '.env')
];

for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    _dotenv.config({ path: envPath });
    break;
  }
}

async function runTest() {
  console.log('\n======================================================');
  console.log('🤖 RAGE OPTIMISER — WHATSAPP HOTLINE DIAGNOSTICS');
  console.log('======================================================');

  const status = WhatsAppService.getStatus();
  console.log('• Enabled in .env:        ', status.enabled ? '✅ YES' : '❌ NO');
  console.log('• Owner Phone Configured: ', status.ownerConfigured ? `✅ (${status.ownerNumber})` : '❌ NOT SET');
  console.log('• Session Directory:      ', WhatsAppService.getAuthDir());
  console.log('• Pairing Method:         ', WhatsAppService.getPairingMethod().toUpperCase());
  console.log('======================================================\n');

  if (!status.enabled || !status.ownerConfigured) {
    console.log('ℹ️  HOW TO ACTIVATE YOUR HOTLINE:');
    console.log('1. Open your backend/.env file.');
    console.log('2. Add your phone number (including country code, digits only):');
    console.log('   WHATSAPP_ENABLED=true');
    console.log('   WHATSAPP_OWNER_NUMBER=91XXXXXXXXXX');
    console.log('3. Restart the bot or re-run this script to link your device.\n');
    process.exit(0);
  }

  console.log('Connecting to WhatsApp socket...');
  await WhatsAppService.init();

  // Wait up to 30s for connection
  let seconds = 0;
  const interval = setInterval(async () => {
    seconds += 2;
    const current = WhatsAppService.getStatus();
    if (current.connected) {
      clearInterval(interval);
      console.log('\n✅ Successfully connected to WhatsApp!');
      console.log('Dispatching test diagnostic alert to owner phone...');

      await WhatsAppService.sendSecurityAlert({
        type: 'DIAGNOSTIC TEST ALERT',
        guildName: 'Clutch Nation HQ',
        executor: 'Console / Test Harness',
        details: 'Owner hotline connectivity confirmed and operating normally.',
        actionTaken: 'All security channels active'
      });

      console.log('✅ Test alert dispatched! Check your WhatsApp.');
      setTimeout(() => process.exit(0), 3000);
    } else if (seconds >= 30) {
      clearInterval(interval);
      console.log('\n⚠️ Timed out waiting for connection (if first run, scan QR in terminal above).');
      process.exit(0);
    }
  }, 2000);
}

runTest().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
