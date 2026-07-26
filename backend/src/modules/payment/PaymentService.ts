import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { PaymentDatabase, PaymentConfigRecord, PaymentProfileRecord, PaymentPresetRecord, PaymentSessionRecord } from './PaymentDatabase.js';
import { PaymentEmbeds, BrandingConfig } from './PaymentEmbeds.js';

export class PaymentService {
  // --- Access Verification ---
  public static isServerOwnerOrAdmin(guild: any, member: any): boolean {
    if (!guild || !member) return false;
    if (guild.ownerId === member.id) return true;
    if (process.env.OWNER_ID && member.id === process.env.OWNER_ID) return true;
    if (member.permissions && typeof member.permissions.has === 'function') {
      return member.permissions.has(PermissionFlagsBits.Administrator);
    }
    return false;
  }

  public static async canGeneratePayment(guild: any, member: any): Promise<boolean> {
    if (!guild || !member) return false;
    if (this.isServerOwnerOrAdmin(guild, member)) return true;

    const allowedRoles = await PaymentDatabase.getRoles(guild.id);
    if (allowedRoles.length === 0) return false;

    if (member.roles && member.roles.cache) {
      return member.roles.cache.some((r: any) => allowedRoles.includes(r.id));
    }
    return false;
  }

  // --- Configuration Helpers ---
  public static async getOrCreateConfig(guildId: string): Promise<PaymentConfigRecord> {
    let config = await PaymentDatabase.getConfig(guildId);
    if (!config) {
      config = {
        guildId,
        enabled: 0,
        merchantName: 'Default Merchant',
        upiId: 'merchant@upi',
        currency: 'INR',
        defaultExpiry: 30,
        footer: 'Rage Optimiser • Enterprise Payment Gateway',
        branding: JSON.stringify({ accentColor: '#7c5cfc', qrColor: '#000000', backgroundColor: '#FFFFFF' }),
        defaultProfileId: null,
        logChannelId: null,
        verificationMode: 'manual'
      };
      await PaymentDatabase.saveConfig(config);
    }
    return config;
  }

  public static async setModuleEnabled(guildId: string, enabled: boolean): Promise<PaymentConfigRecord> {
    const config = await this.getOrCreateConfig(guildId);
    config.enabled = enabled ? 1 : 0;
    await PaymentDatabase.saveConfig(config);
    await this.sendLog(guildId, `⚙️ Payment QR Module **${enabled ? 'ENABLED' : 'DISABLED'}**.`, enabled ? '#10b981' : '#ff4444');
    return config;
  }

  // --- Payment Generation ---
  public static async createPaymentSession(
    guildId: string,
    userId: string,
    amount: number,
    purpose: string,
    profileQuery?: string | null
  ): Promise<{ session: PaymentSessionRecord; embed: EmbedBuilder; qrBuffer: Buffer; config: PaymentConfigRecord }> {
    const config = await this.getOrCreateConfig(guildId);

    // Resolve profile if specified or default
    let profile: PaymentProfileRecord | null = null;
    if (profileQuery) {
      profile = await PaymentDatabase.getProfileById(guildId, profileQuery);
    } else if (config.defaultProfileId) {
      profile = await PaymentDatabase.getProfileById(guildId, config.defaultProfileId);
    }

    const merchantName = profile?.merchantName || config.merchantName || 'Merchant';
    const upiId = profile?.upiId || config.upiId || 'merchant@upi';
    const prefix = profile?.prefix || 'PAY';
    const expiryMinutes = profile?.expiry || config.defaultExpiry || 30;

    const randomTag = Math.random().toString(36).substring(2, 6).toUpperCase();
    const paymentId = `${prefix}-${Date.now().toString().slice(-6)}-${randomTag}`;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiryMinutes * 60000).toISOString();

    const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(merchantName)}&am=${amount.toFixed(2)}&cu=${encodeURIComponent(config.currency || 'INR')}&tn=${encodeURIComponent(`${purpose} [${paymentId}]`)}`;

    let branding: BrandingConfig = {};
    try {
      branding = JSON.parse(config.branding || '{}');
    } catch {}

    const qrBuffer = await PaymentEmbeds.generateQRCodeBuffer(upiUri, branding);

    const session: PaymentSessionRecord = {
      paymentId,
      guildId,
      userId,
      amount,
      purpose,
      profileId: profile?.id || null,
      merchantName,
      upiId,
      status: 'ACTIVE',
      createdAt: now.toISOString(),
      expiresAt
    };

    await PaymentDatabase.createSession(session);

    const embed = PaymentEmbeds.buildPaymentEmbed(session, config, profile, branding);

    // Dispatch audit log
    await this.sendLog(
      guildId,
      `💳 **Payment Request Generated**\n• **Payment ID**: \`${paymentId}\`\n• **Amount**: \`${config.currency} ${amount}\`\n• **Purpose**: \`${purpose}\`\n• **Requested By**: <@${userId}>`,
      '#7c5cfc'
    );

    return { session, embed, qrBuffer, config };
  }

  public static async cancelPaymentSession(
    paymentId: string,
    requestedByUserId: string,
    isOwnerOrAdmin: boolean
  ): Promise<{ success: boolean; message: string; session?: PaymentSessionRecord }> {
    const session = await PaymentDatabase.getSession(paymentId);
    if (!session) {
      return { success: false, message: '❌ Payment session not found.' };
    }

    if (session.status === 'CANCELLED') {
      return { success: false, message: '⚠️ Payment session is already cancelled.' };
    }

    // Only session creator, owner, or admin can cancel
    if (session.userId !== requestedByUserId && !isOwnerOrAdmin) {
      return { success: false, message: '🔒 Only the payment creator or an administrator can cancel this payment session.' };
    }

    await PaymentDatabase.updateSessionStatus(paymentId, 'CANCELLED');
    session.status = 'CANCELLED';

    const config = await this.getOrCreateConfig(session.guildId);
    await this.sendLog(
      session.guildId,
      `✖️ **Payment Request Cancelled**\n• **Payment ID**: \`${paymentId}\`\n• **Cancelled By**: <@${requestedByUserId}>`,
      '#ff4444'
    );

    return { success: true, message: '✅ Payment request successfully cancelled.', session };
  }

  // --- Export & Import ---
  public static async exportConfig(guildId: string): Promise<string> {
    const config = await this.getOrCreateConfig(guildId);
    const profiles = await PaymentDatabase.getProfiles(guildId);
    const presets = await PaymentDatabase.getPresets(guildId);
    const roles = await PaymentDatabase.getRoles(guildId);

    const exportData = {
      version: '1.0.0',
      module: 'payment_qr',
      timestamp: new Date().toISOString(),
      config,
      profiles,
      presets,
      roles
    };

    return JSON.stringify(exportData, null, 2);
  }

  public static async importConfig(guildId: string, jsonString: string): Promise<{ success: boolean; message: string }> {
    try {
      const data = JSON.parse(jsonString);
      if (data.module !== 'payment_qr' || !data.config) {
        return { success: false, message: '❌ Invalid JSON backup data. Expected Payment QR module export payload.' };
      }

      // Restore main config
      await PaymentDatabase.saveConfig({
        ...data.config,
        guildId
      });

      // Restore profiles
      if (Array.isArray(data.profiles)) {
        for (const p of data.profiles) {
          await PaymentDatabase.saveProfile({
            ...p,
            guildId
          });
        }
      }

      // Restore presets
      if (Array.isArray(data.presets)) {
        for (const pre of data.presets) {
          await PaymentDatabase.savePreset({
            ...pre,
            guildId
          });
        }
      }

      // Restore roles
      if (Array.isArray(data.roles)) {
        for (const rId of data.roles) {
          await PaymentDatabase.addRole(guildId, rId);
        }
      }

      await this.sendLog(guildId, `📥 **Payment Configurations Imported Successfully**.`, '#10b981');
      return { success: true, message: '✅ Payment configurations imported successfully.' };
    } catch (err: any) {
      return { success: false, message: `❌ JSON parsing error: ${err.message}` };
    }
  }

  // --- Log Dispatcher ---
  public static async sendLog(guildId: string, content: string, color = '#7c5cfc', clientObj?: any): Promise<void> {
    try {
      const config = await PaymentDatabase.getConfig(guildId);
      if (!config || !config.logChannelId) return;

      const client = clientObj || (globalThis as any).discordClient;
      if (!client) return;

      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return;

      const channel = guild.channels.cache.get(config.logChannelId) || await guild.channels.fetch(config.logChannelId).catch(() => null);
      if (channel && channel.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle('💳 Payment System Audit Log')
          .setDescription(content)
          .setColor(color as any)
          .setTimestamp()
          .setFooter({ text: 'Rage Optimiser • Audit Logger' });

        await channel.send({ embeds: [embed] }).catch(() => {});
      }
    } catch (err) {
      console.error('[PaymentService] Error sending payment audit log:', err);
    }
  }
}
