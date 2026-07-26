import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import QRCode from 'qrcode';
import { PaymentConfigRecord, PaymentProfileRecord, PaymentPresetRecord, PaymentSessionRecord } from './PaymentDatabase.js';

export interface BrandingConfig {
  logo?: string;
  accentColor?: string;
  qrColor?: string;
  backgroundColor?: string;
  qrStyle?: string;
  footer?: string;
}

export class PaymentEmbeds {
  public static async generateQRCodeBuffer(upiUri: string, branding?: BrandingConfig): Promise<Buffer> {
    const darkColor = branding?.qrColor || '#000000';
    const lightColor = branding?.backgroundColor || '#FFFFFF';

    return await QRCode.toBuffer(upiUri, {
      type: 'png',
      width: 500,
      margin: 2,
      color: {
        dark: darkColor,
        light: lightColor
      },
      errorCorrectionLevel: 'H'
    });
  }

  public static buildPermissionErrorEmbed(title = '🔒 Permission Denied', message = 'You do not have administrative permission or configured manager role to execute payment commands.'): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle(title)
      .setDescription(message)
      .setColor('#ff4444')
      .setFooter({ text: 'Rage Optimiser • Security Engine' })
      .setTimestamp();
  }

  public static buildPaymentEmbed(
    session: PaymentSessionRecord,
    config: PaymentConfigRecord,
    profile?: PaymentProfileRecord | null,
    branding?: BrandingConfig
  ): EmbedBuilder {
    const accentColor = profile?.theme || branding?.accentColor || '#7c5cfc';
    const currency = config.currency || 'INR';
    const currencySymbol = currency === 'INR' ? '₹' : (currency === 'USD' ? '$' : `${currency} `);
    const formattedAmount = `${currencySymbol}${Number(session.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    const merchantName = profile?.merchantName || session.merchantName || config.merchantName || 'Official Merchant';
    const upiId = profile?.upiId || session.upiId || config.upiId || 'N/A';
    const footerText = profile?.footer || branding?.footer || config.footer || 'Rage Optimiser • Enterprise Payment Gateway';
    const logoUrl = branding?.logo || undefined;

    const expiresAtUnix = Math.floor(new Date(session.expiresAt).getTime() / 1000);

    const embed = new EmbedBuilder()
      .setTitle(`💳 Payment Request — ${merchantName}`)
      .setDescription(`Scan the QR code below using any UPI app (PhonePe, Google Pay, Paytm, BHIM, Cred) to complete your transaction.`)
      .addFields(
        { name: '👤 Merchant Name', value: `\`${merchantName}\``, inline: true },
        { name: '📌 UPI ID', value: `\`\`\`${upiId}\`\`\``, inline: true },
        { name: '💰 Payable Amount', value: `**\`${formattedAmount}\`**`, inline: true },
        { name: '📝 Purpose / Note', value: `\`${session.purpose}\``, inline: true },
        { name: '🔑 Payment ID', value: `\`${session.paymentId}\``, inline: true },
        { name: '⏱️ Expires In', value: `<t:${expiresAtUnix}:R> (<t:${expiresAtUnix}:f>)`, inline: true },
        { name: '🙋 Requested By', value: `<@${session.userId}>`, inline: true },
        { name: '⚙️ Gateway Status', value: `🟢 **Active Session**`, inline: true }
      )
      .setColor(accentColor as any)
      .setImage(`attachment://payment_qr_${session.paymentId}.png`)
      .setFooter({ text: footerText })
      .setTimestamp();

    if (logoUrl && logoUrl.startsWith('http')) {
      embed.setThumbnail(logoUrl);
    }

    return embed;
  }

  public static buildCancelledPaymentEmbed(
    session: PaymentSessionRecord,
    config: PaymentConfigRecord,
    cancelledBy: string
  ): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle(`❌ Payment Request Cancelled — ${session.paymentId}`)
      .setDescription(`This payment session was explicitly cancelled and is no longer valid for processing.`)
      .addFields(
        { name: '🔑 Payment ID', value: `\`${session.paymentId}\``, inline: true },
        { name: '💰 Amount', value: `\`${config.currency || 'INR'} ${session.amount}\``, inline: true },
        { name: '📝 Purpose', value: `\`${session.purpose}\``, inline: true },
        { name: '🚫 Cancelled By', value: `<@${cancelledBy}>`, inline: true },
        { name: '⚠️ Status', value: `🔴 **CANCELLED**`, inline: true }
      )
      .setColor('#ff4444')
      .setFooter({ text: config.footer || 'Rage Optimiser • Payment Gateway' })
      .setTimestamp();
  }

  public static buildPaymentActionRow(paymentId: string, disabled = false): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`payment_dl_${paymentId}`)
        .setLabel('Download QR')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📥')
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`payment_upi_${paymentId}`)
        .setLabel('Copy UPI')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📋')
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`payment_note_${paymentId}`)
        .setLabel('Copy Payment Note')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📌')
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`payment_cancel_${paymentId}`)
        .setLabel('Cancel Payment')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('✖️')
        .setDisabled(disabled)
    );
  }

  public static buildConfigEmbed(
    config: PaymentConfigRecord,
    profiles: PaymentProfileRecord[],
    presets: PaymentPresetRecord[],
    roles: string[]
  ): EmbedBuilder {
    let brandingObj: BrandingConfig = {};
    try {
      brandingObj = JSON.parse(config.branding || '{}');
    } catch {}

    const statusBadge = config.enabled ? '🟢 **Enabled**' : '🔴 **Disabled**';
    const roleMentions = roles.length > 0 ? roles.map(r => `<@&${r}>`).join(', ') : '*None (Owner & Admins Only)*';
    const logChan = config.logChannelId ? `<#${config.logChannelId}>` : '*Not Configured*';

    return new EmbedBuilder()
      .setTitle('⚙️ Payment Module Configuration')
      .setDescription(`Current operational status and global settings for **Payment QR Module**.`)
      .addFields(
        { name: '⚡ Module State', value: statusBadge, inline: true },
        { name: '🏢 Merchant Name', value: config.merchantName ? `\`${config.merchantName}\`` : '*Not Set*', inline: true },
        { name: '📌 UPI ID', value: config.upiId ? `\`${config.upiId}\`` : '*Not Set*', inline: true },
        { name: '💱 Currency', value: `\`${config.currency}\``, inline: true },
        { name: '⏱️ Default Expiry', value: `\`${config.defaultExpiry} minutes\``, inline: true },
        { name: '📢 Log Channel', value: logChan, inline: true },
        { name: '👑 Manager Roles', value: roleMentions, inline: false },
        { name: '📂 Profiles Count', value: `\`${profiles.length}\` profiles`, inline: true },
        { name: '🏷️ Presets Count', value: `\`${presets.length}\` presets`, inline: true },
        { name: '🎨 Accent Color', value: `\`${brandingObj.accentColor || '#7c5cfc'}\``, inline: true },
        { name: '🖼️ Branding Logo', value: brandingObj.logo ? `[View Logo](${brandingObj.logo})` : '*None*', inline: true },
        { name: '📝 Footer Text', value: `\`${config.footer}\``, inline: false }
      )
      .setColor(config.enabled ? '#10b981' : '#ff4444')
      .setFooter({ text: config.footer || 'Rage Optimiser • Payment Module' })
      .setTimestamp();
  }

  public static buildSetupWizardEmbed(step: number, data: Partial<PaymentConfigRecord>): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('🧙 Payment QR Interactive Setup Wizard')
      .setDescription(
        `Welcome to the **Payment QR Wizard**.\nFollow the prompts to configure your enterprise UPI payment engine.`
      )
      .addFields(
        { name: 'Current Step', value: `**Step ${step} of 8**`, inline: true },
        { name: 'Merchant Name', value: data.merchantName ? `\`${data.merchantName}\`` : '⏳ Pending', inline: true },
        { name: 'UPI ID', value: data.upiId ? `\`${data.upiId}\`` : '⏳ Pending', inline: true },
        { name: 'Currency', value: `\`${data.currency || 'INR'}\``, inline: true },
        { name: 'Expiry', value: `\`${data.defaultExpiry || 30} mins\``, inline: true },
        { name: 'Log Channel', value: data.logChannelId ? `<#${data.logChannelId}>` : '⏳ Pending', inline: true }
      )
      .setColor('#7c5cfc')
      .setFooter({ text: 'Rage Optimiser • Setup Wizard' });
  }
}
