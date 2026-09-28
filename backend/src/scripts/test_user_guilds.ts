import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
  if (!process.env.JWT_SECRET) {
    console.error("❌ Error: JWT_SECRET environment variable is missing.");
    process.exit(1);
  }
  const secret: string = process.env.JWT_SECRET;
  
  // Payload for wt.void based on the session dump
  const payload = {
    discordId: '830993126301630485',
    username: 'wt.void',
    role: 'guild_manager',
    managedGuildIds: [
      '957493841139740692',
      '1500487419462553760',
      '1507671152389128272',
      '1508399161798819840',
      '1517780409985794138',
      '1524343224607440926',
      '1524869545590915262'
    ]
  };

  const token = jwt.sign(payload, secret, { expiresIn: '7d' });
  console.log('Generated JWT token:', token);

  const res = await fetch('http://localhost:5000/api/user/guilds', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  console.log('Response status:', res.status);
  const data = await res.json();
  console.log('Response body:', JSON.stringify(data, null, 2));
  process.exit(0);
}

run().catch(console.error);
