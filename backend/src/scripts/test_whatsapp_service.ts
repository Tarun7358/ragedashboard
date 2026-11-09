import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

const _require = createRequire(import.meta.url);
const _dotenv = _require('dotenv');

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

import { WhatsAppService } from '../services/WhatsAppService.js';

console.log('RAW ENV VALUE:       ', JSON.stringify(process.env.WHATSAPP_OWNER_NUMBER));
console.log('CLEAN PHONE NUMBER:  ', WhatsAppService.getOwnerNumber());
console.log('OWNER JID:           ', WhatsAppService.getOwnerJid());
console.log('FULL STATUS:         ', WhatsAppService.getStatus());
