import { Database } from '../../core/Database.js';
import { PaymentDatabase } from './PaymentDatabase.js';
import { PaymentService } from './PaymentService.js';
import { PaymentEmbeds } from './PaymentEmbeds.js';

describe('Payment QR Module Tests', () => {
  const guildId = 'test_guild_123';
  const userId = 'user_456';

  beforeAll(async () => {
    await Database.connect();
    await PaymentDatabase.init();
  });

  test('Config save and retrieval', async () => {
    await PaymentDatabase.saveConfig({
      guildId,
      merchantName: 'Test Store',
      upiId: 'test@upi',
      currency: 'INR',
      defaultExpiry: 15,
      enabled: 1
    });

    const config = await PaymentDatabase.getConfig(guildId);
    expect(config).not.toBeNull();
    expect(config?.merchantName).toBe('Test Store');
    expect(config?.upiId).toBe('test@upi');
    expect(config?.currency).toBe('INR');
    expect(config?.defaultExpiry).toBe(15);
  });

  test('Profile CRUD', async () => {
    await PaymentDatabase.saveProfile({
      id: 'tourney',
      guildId,
      name: 'Tournament Pass',
      merchantName: 'Gaming Esports',
      upiId: 'esports@upi',
      defaultAmount: 250,
      theme: '#ff0055',
      footer: 'Esports Gateway',
      prefix: 'TRN',
      expiry: 45
    });

    const profiles = await PaymentDatabase.getProfiles(guildId);
    expect(profiles.length).toBeGreaterThan(0);
    const found = profiles.find(p => p.id === 'tourney');
    expect(found).toBeDefined();
    expect(found?.name).toBe('Tournament Pass');
    expect(found?.prefix).toBe('TRN');
  });

  test('Preset CRUD', async () => {
    await PaymentDatabase.savePreset({
      id: 'vip-pass',
      guildId,
      name: 'VIP Membership',
      amount: 999
    });

    const presets = await PaymentDatabase.getPresets(guildId);
    const found = presets.find(p => p.id === 'vip-pass');
    expect(found).toBeDefined();
    expect(found?.amount).toBe(999);
  });

  test('QR Code buffer generation', async () => {
    const upiUri = 'upi://pay?pa=test@upi&pn=TestStore&am=500.00&cu=INR&tn=Order123';
    const buffer = await PaymentEmbeds.generateQRCodeBuffer(upiUri);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(100);
  });

  test('Payment Session creation and cancellation', async () => {
    const { session, embed, qrBuffer } = await PaymentService.createPaymentSession(
      guildId,
      userId,
      500,
      'Tournament Entry Fee',
      'tourney'
    );

    expect(session.paymentId).toContain('TRN-');
    expect(session.amount).toBe(500);
    expect(session.status).toBe('ACTIVE');
    expect(Buffer.isBuffer(qrBuffer)).toBe(true);
    expect(embed).toBeDefined();

    const fetchSession = await PaymentDatabase.getSession(session.paymentId);
    expect(fetchSession?.status).toBe('ACTIVE');

    const cancelRes = await PaymentService.cancelPaymentSession(session.paymentId, userId, false);
    expect(cancelRes.success).toBe(true);

    const cancelledSession = await PaymentDatabase.getSession(session.paymentId);
    expect(cancelledSession?.status).toBe('CANCELLED');
  });
});
