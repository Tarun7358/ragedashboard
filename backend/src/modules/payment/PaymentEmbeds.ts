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

  public static buildPermissionErrorEmbed(title = '<:shield:1532403012751065179> Permission Denied', message = 'You do not have administrative permission or configured manager role to execute payment commands.'): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle(title)
      .setDescription(message)
      .setColor(0x99CC00)
      .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
      .setTimestamp();
  }

  public static buildPaymentEmbed(
    session: PaymentSessionRecord,
    config: PaymentConfigRecord,
    profile?: PaymentProfileRecord | null,
    branding?: BrandingConfig
  ): EmbedBuilder {
    const accentColor = 0x99CC00;
    const currency = config.currency || 'INR';
    const currencySymbol = currency === 'INR' ? '₹' : (currency === 'USD' ? '$' : `${currency} `);
    const formattedAmount = `${currencySymbol}${Number(session.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    const merchantName = profile?.merchantName || session.merchantName || config.merchantName || 'Official Merchant';
    const upiId = profile?.upiId || session.upiId || config.upiId || 'N/A';
    const footerText = 'Rage Optimiser • Unbypassable Security';
    const logoUrl = branding?.logo || undefined;

    const expiresAtUnix = Math.floor(new Date(session.expiresAt).getTime() / 1000);

    const embed = new EmbedBuilder()
      .setTitle(`<:ticket:1532620631466836021> Payment Request — ${merchantName}`)
      .setDescription(`Scan the QR code below using any UPI app (PhonePe, Google Pay, Paytm, BHIM, Cred) to complete your transaction.`)
      .addFields(
        { name: '👤 Merchant Name', value: `\`${merchantName}\``, inline: true },
        { name: '📌 UPI ID', value: `\`\`\`${upiId}\`\`\``, inline: true },
        { name: '<:ticket:1532620631466836021> Payable Amount', value: `**\`${formattedAmount}\`**`, inline: true },
        { name: '📝 Purpose / Note', value: `\`${session.purpose}\``, inline: true },
        { name: '🔑 Payment ID', value: `\`${session.paymentId}\``, inline: true },
        { name: '⏱️ Expires In', value: `<t:${expiresAtUnix}:R> (<t:${expiresAtUnix}:f>)`, inline: true },
        { name: '🙋 Requested By', value: `<@${session.userId}>`, inline: true },
        { name: '⚙️ Gateway Status', value: `<a:approved:1532390590707142956> **Active Session**`, inline: true }
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
      .setTitle(`<:wrong:1532390628330307634> Payment Request Cancelled — ${session.paymentId}`)
      .setDescription(`This payment session was explicitly cancelled and is no longer valid for processing.`)
      .addFields(
        { name: '🔑 Payment ID', value: `\`${session.paymentId}\``, inline: true },
        { name: '<:ticket:1532620631466836021> Amount', value: `\`${config.currency || 'INR'} ${session.amount}\``, inline: true },
        { name: '📝 Purpose', value: `\`${session.purpose}\``, inline: true },
        { name: '🚫 Cancelled By', value: `<@${cancelledBy}>`, inline: true },
        { name: '⚠️ Status', value: `<:wrong:1532390628330307634> **CANCELLED**`, inline: true }
      )
      .setColor(0x99CC00)
      .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
      .setTimestamp();
  }

  public static buildPaymentActionRow(paymentId: string, disabled = false): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`payment_dl_${paymentId}`)
        .setLabel('Download QR')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('<:download:1532620432321020004>')
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`payment_upi_${paymentId}`)
        .setLabel('Copy UPI')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('<:copy:1532620803450081280>')
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`payment_note_${paymentId}`)
        .setLabel('Copy Payment Note')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('<:note:1532620850027827200>')
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`payment_cancel_${paymentId}`)
        .setLabel('Cancel Payment')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('<:wrong:1532390628330307634>')
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

    const statusBadge = config.enabled ? '<a:approved:1532390590707142956> **Enabled**' : '<:wrong:1532390628330307634> **Disabled**';
    const roleMentions = roles.length > 0 ? roles.map(r => `<@&${r}>`).join(', ') : '*None (Owner & Admins Only)*';
    const logChan = config.logChannelId ? `<#${config.logChannelId}>` : '*Not Configured*';

    return new EmbedBuilder()
      .setTitle('<:config:1532425712844144701> Payment Module Configuration')
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
        { name: '🎨 Accent Color', value: `\`${brandingObj.accentColor || '#99CC00'}\``, inline: true },
        { name: '🖼️ Branding Logo', value: brandingObj.logo ? `[View Logo](${brandingObj.logo})` : '*None*', inline: true },
        { name: '📝 Footer Text', value: `\`Rage Optimiser • Unbypassable Security\``, inline: false }
      )
      .setColor(0x99CC00)
      .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
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
      .setColor(0x99CC00)
      .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
  }
}
