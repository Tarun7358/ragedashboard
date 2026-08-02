import { AttachmentBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { PaymentDatabase } from './PaymentDatabase.js';
import { PaymentService } from './PaymentService.js';
import { PaymentEmbeds } from './PaymentEmbeds.js';

export const PaymentManifest: ModuleManifest = {
  id: 'payment',
  name: 'Payment QR',
  version: '1.0.0',
  description: 'Enterprise payment request and UPI QR code generator module.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      return { progress: 100, errors: [] };
    }
  },
  commands: [
    {
      name: 'payment',
      description: 'Enterprise Payment QR administration & setup',
      options: [
        {
          name: 'setup',
          description: 'Start interactive payment setup wizard',
          type: 1, // SUB_COMMAND
          options: [
            { name: 'merchant_name', type: 3, description: 'Business / Merchant Name', required: true },
            { name: 'upi_id', type: 3, description: 'UPI VPA ID (e.g. merchant@upi)', required: true },
            { name: 'currency', type: 3, description: 'Currency code (default: INR)', required: false },
            { name: 'default_expiry', type: 4, description: 'Default QR expiry in minutes (default: 30)', required: false },
            { name: 'log_channel', type: 7, description: 'Payment audit log channel', required: false, channel_types: [0, 5] },
            { name: 'footer', type: 3, description: 'Custom embed footer text', required: false }
          ]
        },
        {
          name: 'config',
          description: 'View or modify payment configuration',
          type: 1,
          options: [
            { name: 'merchant_name', type: 3, description: 'Update Merchant Name', required: false },
            { name: 'upi_id', type: 3, description: 'Update UPI ID', required: false },
            { name: 'currency', type: 3, description: 'Update Currency', required: false },
            { name: 'expiry', type: 4, description: 'Update Default Expiry (minutes)', required: false },
            { name: 'footer', type: 3, description: 'Update Footer Text', required: false },
            { name: 'log_channel', type: 7, description: 'Update Log Channel', required: false, channel_types: [0, 5] },
            { name: 'verification_mode', type: 3, description: 'Verification Mode (Reserved for Future)', required: false, choices: [
              { name: 'Manual Verification', value: 'manual' },
              { name: 'Auto Gateway Verification (Reserved)', value: 'auto' }
            ]}
          ]
        },
        {
          name: 'profile',
          description: 'Manage multiple payment profiles',
          type: 1,
          options: [
            { name: 'action', type: 3, description: 'Action to perform', required: true, choices: [
              { name: 'Create / Update Profile', value: 'create' },
              { name: 'List Profiles', value: 'list' },
              { name: 'Delete Profile', value: 'delete' },
              { name: 'Set Default Profile', value: 'set-default' }
            ]},
            { name: 'name', type: 3, description: 'Profile Name (e.g. Tournament, VIP, Donation)', required: false },
            { name: 'merchant_name', type: 3, description: 'Merchant Name override', required: false },
            { name: 'upi_id', type: 3, description: 'UPI ID override', required: false },
            { name: 'amount', type: 10, description: 'Default Amount override', required: false },
            { name: 'theme', type: 3, description: 'Accent Color Hex (e.g. #ffaa00)', required: false },
            { name: 'prefix', type: 3, description: 'Transaction ID Prefix (default: PAY)', required: false },
            { name: 'expiry', type: 4, description: 'Expiry duration in minutes', required: false }
          ]
        },
        {
          name: 'branding',
          description: 'Configure Payment QR visual styling and logos',
          type: 1,
          options: [
            { name: 'logo', type: 3, description: 'Logo Image URL', required: false },
            { name: 'accent_color', type: 3, description: 'Embed Accent Hex Color', required: false },
            { name: 'qr_color', type: 3, description: 'QR Code Dark Module Hex Color', required: false },
            { name: 'background', type: 3, description: 'QR Code Background Hex Color', required: false },
            { name: 'footer', type: 3, description: 'Footer text', required: false }
          ]
        },
        {
          name: 'preset',
          description: 'Manage predefined payment amounts',
          type: 1,
          options: [
            { name: 'action', type: 3, description: 'Action', required: true, choices: [
              { name: 'Create Preset', value: 'create' },
              { name: 'List Presets', value: 'list' },
              { name: 'Delete Preset', value: 'delete' }
            ]},
            { name: 'name', type: 3, description: 'Preset Name (e.g. Bronze, Silver, Gold, VIP)', required: false },
            { name: 'amount', type: 10, description: 'Preset Amount', required: false }
          ]
        },
        {
          name: 'role',
          description: 'Configure which roles can generate payment requests',
          type: 1,
          options: [
            { name: 'action', type: 3, description: 'Action', required: true, choices: [
              { name: 'Add Role', value: 'add' },
              { name: 'Remove Role', value: 'remove' },
              { name: 'List Allowed Roles', value: 'list' }
            ]},
            { name: 'role', type: 8, description: 'Target Discord Role', required: false }
          ]
        },
        {
          name: 'export',
          description: 'Export all payment configurations to JSON',
          type: 1
        },
        {
          name: 'import',
          description: 'Import previously exported payment configurations',
          type: 1,
          options: [
            { name: 'data', type: 3, description: 'JSON configuration string payload', required: true }
          ]
        },
        {
          name: 'enable',
          description: 'Enable Payment QR module',
          type: 1
        },
        {
          name: 'disable',
          description: 'Disable Payment QR module',
          type: 1
        }
      ]
    },
    {
      name: 'pay',
      description: 'Generate a professional Payment QR request',
      options: [
        { name: 'amount', type: 10, description: 'Payable Amount (e.g. 500)', required: true },
        { name: 'purpose', type: 3, description: 'Payment Purpose / Note', required: true },
        { name: 'profile', type: 3, description: 'Payment Profile Name or ID', required: false }
      ]
    }
  ],
  events: [
    {
      name: 'command_payment',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: '❌ Payment commands can only be executed within a server.', flags: 64 });

        // Access check: Owner or Administrator
        if (!PaymentService.isServerOwnerOrAdmin(guild, interaction.member)) {
          const errEmbed = PaymentEmbeds.buildPermissionErrorEmbed(
            '🔒 Access Denied',
            'Only the Server Owner or members with Administrator permissions can manage Payment settings.'
          );
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }

        const sub = interaction.options.getSubcommand(false) || 'config';
        const guildId = guild.id;

        // SETUP WIZARD
        if (sub === 'setup') {
          const merchantName = interaction.options.getString('merchant_name');
          const upiId = interaction.options.getString('upi_id');
          const currency = interaction.options.getString('currency') || 'INR';
          const defaultExpiry = interaction.options.getInteger('default_expiry') || 30;
          const logChannel = interaction.options.getChannel('log_channel');
          const footer = interaction.options.getString('footer') || 'Rage Optimiser • Enterprise Payment Gateway';

          await PaymentDatabase.saveConfig({
            guildId,
            enabled: 1,
            merchantName,
            upiId,
            currency,
            defaultExpiry,
            logChannelId: logChannel?.id || null,
            footer
          });

          await PaymentService.sendLog(
            guildId,
            `🧙 **Payment Setup Wizard Completed**\n• **Merchant**: \`${merchantName}\`\n• **UPI ID**: \`${upiId}\`\n• **Log Channel**: ${logChannel ? `<#${logChannel.id}>` : 'None'}`,
            '#10b981',
            client
          );

          const successEmbed = new EmbedBuilder()
            .setTitle('✅ Payment QR Setup Completed')
            .setDescription(`Your enterprise payment engine has been successfully configured and enabled!`)
            .addFields(
              { name: '🏢 Merchant Name', value: `\`${merchantName}\``, inline: true },
              { name: '📌 UPI ID', value: `\`${upiId}\``, inline: true },
              { name: '💱 Currency', value: `\`${currency}\``, inline: true },
              { name: '⏱️ Default Expiry', value: `\`${defaultExpiry} minutes\``, inline: true },
              { name: '📢 Log Channel', value: logChannel ? `${logChannel}` : '*Not Set*', inline: true },
              { name: '⚡ Status', value: `🟢 **Enabled**`, inline: true }
            )
            .setColor('#10b981')
            .setFooter({ text: footer });

          return interaction.reply({ embeds: [successEmbed], flags: 64 });
        }

        // ENABLE / DISABLE
        if (sub === 'enable' || sub === 'disable') {
          const enabled = sub === 'enable';
          const updated = await PaymentService.setModuleEnabled(guildId, enabled);
          return interaction.reply({
            content: `✅ Payment QR module has been **${enabled ? 'ENABLED' : 'DISABLED'}**.`,
            flags: 64
          });
        }

        // CONFIG VIEW & EDIT
        if (sub === 'config') {
          const merchantName = interaction.options.getString('merchant_name');
          const upiId = interaction.options.getString('upi_id');
          const currency = interaction.options.getString('currency');
          const expiry = interaction.options.getInteger('expiry');
          const footer = interaction.options.getString('footer');
          const logChannel = interaction.options.getChannel('log_channel');
          const verificationMode = interaction.options.getString('verification_mode');

          const updateObj: any = { guildId };
          let changed = false;

          if (merchantName !== null) { updateObj.merchantName = merchantName; changed = true; }
          if (upiId !== null) { updateObj.upiId = upiId; changed = true; }
          if (currency !== null) { updateObj.currency = currency; changed = true; }
          if (expiry !== null) { updateObj.defaultExpiry = expiry; changed = true; }
          if (footer !== null) { updateObj.footer = footer; changed = true; }
          if (logChannel !== null) { updateObj.logChannelId = logChannel.id; changed = true; }
          if (verificationMode !== null) { updateObj.verificationMode = verificationMode; changed = true; }

          if (changed) {
            await PaymentDatabase.saveConfig(updateObj);
            await PaymentService.sendLog(guildId, `⚙️ **Payment Configuration Updated** by ${interaction.user}.`, '#7c5cfc', client);
          }

          const currentConfig = await PaymentService.getOrCreateConfig(guildId);
          const profiles = await PaymentDatabase.getProfiles(guildId);
          const presets = await PaymentDatabase.getPresets(guildId);
          const roles = await PaymentDatabase.getRoles(guildId);

          const embed = PaymentEmbeds.buildConfigEmbed(currentConfig, profiles, presets, roles);
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        // BRANDING
        if (sub === 'branding') {
          const logo = interaction.options.getString('logo');
          const accentColor = interaction.options.getString('accent_color');
          const qrColor = interaction.options.getString('qr_color');
          const background = interaction.options.getString('background');
          const footer = interaction.options.getString('footer');

          const config = await PaymentService.getOrCreateConfig(guildId);
          let brandingObj: any = {};
          try {
            brandingObj = JSON.parse(config.branding || '{}');
          } catch {}

          if (logo !== null) brandingObj.logo = logo;
          if (accentColor !== null) brandingObj.accentColor = accentColor;
          if (qrColor !== null) brandingObj.qrColor = qrColor;
          if (background !== null) brandingObj.backgroundColor = background;
          if (footer !== null) config.footer = footer;

          config.branding = JSON.stringify(brandingObj);
          await PaymentDatabase.saveConfig(config);

          await PaymentService.sendLog(guildId, `🎨 **Payment Branding Style Updated** by ${interaction.user}.`, '#7c5cfc', client);

          const embed = new EmbedBuilder()
            .setTitle('🎨 Payment Branding Updated')
            .setDescription('Visual style and QR styling options updated successfully.')
            .addFields(
              { name: '🖼️ Logo URL', value: brandingObj.logo ? `\`${brandingObj.logo}\`` : '*Not Set*', inline: false },
              { name: '🎨 Accent Color', value: `\`${brandingObj.accentColor || '#7c5cfc'}\``, inline: true },
              { name: '⬛ QR Color', value: `\`${brandingObj.qrColor || '#000000'}\``, inline: true },
              { name: '⬜ Background', value: `\`${brandingObj.backgroundColor || '#FFFFFF'}\``, inline: true }
            )
            .setColor((brandingObj.accentColor || '#7c5cfc') as any)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });

          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        // PROFILE
        if (sub === 'profile') {
          const action = interaction.options.getString('action');
          const name = interaction.options.getString('name');
          const merchantName = interaction.options.getString('merchant_name');
          const upiId = interaction.options.getString('upi_id');
          const amount = interaction.options.getNumber('amount');
          const theme = interaction.options.getString('theme');
          const prefix = interaction.options.getString('prefix');
          const expiry = interaction.options.getInteger('expiry');

          if (action === 'create') {
            if (!name) return interaction.reply({ content: '❌ Please specify a profile name.', flags: 64 });
            const id = name.toLowerCase().replace(/\s+/g, '-');
            await PaymentDatabase.saveProfile({
              id,
              guildId,
              name,
              merchantName,
              upiId,
              defaultAmount: amount,
              theme,
              footer: null,
              prefix: prefix || 'PAY',
              expiry: expiry || 30
            });

            await PaymentService.sendLog(guildId, `📂 **Profile Created / Updated**: \`${name}\` (\`${id}\`)`, '#10b981', client);
            return interaction.reply({ content: `✅ Payment profile **${name}** (\`${id}\`) created/updated successfully.`, flags: 64 });
          }

          if (action === 'list') {
            const profiles = await PaymentDatabase.getProfiles(guildId);
            if (profiles.length === 0) return interaction.reply({ content: '📋 No custom payment profiles created yet.', flags: 64 });

            const lines = profiles.map((p, i) => `**${i + 1}. ${p.name}** (\`${p.id}\`)\n• Merchant: ${p.merchantName || 'Default'} | UPI: ${p.upiId || 'Default'} | Prefix: \`${p.prefix || 'PAY'}\` | Expiry: \`${p.expiry || 30}m\``);
            const embed = new EmbedBuilder()
              .setTitle('📂 Payment Profiles List')
              .setDescription(lines.join('\n\n'))
              .setColor('#7c5cfc');
            return interaction.reply({ embeds: [embed], flags: 64 });
          }

          if (action === 'delete') {
            if (!name) return interaction.reply({ content: '❌ Please specify the profile name or ID to delete.', flags: 64 });
            const deleted = await PaymentDatabase.deleteProfile(guildId, name);
            if (deleted) {
              await PaymentService.sendLog(guildId, `📂 **Profile Deleted**: \`${name}\``, '#ff4444', client);
              return interaction.reply({ content: `✅ Profile **${name}** deleted.`, flags: 64 });
            }
            return interaction.reply({ content: `❌ Profile **${name}** not found.`, flags: 64 });
          }

          if (action === 'set-default') {
            if (!name) return interaction.reply({ content: '❌ Please specify the profile name or ID to set as default.', flags: 64 });
            const prof = await PaymentDatabase.getProfileById(guildId, name);
            if (!prof) return interaction.reply({ content: `❌ Profile **${name}** not found.`, flags: 64 });

            await PaymentDatabase.saveConfig({ guildId, defaultProfileId: prof.id });
            return interaction.reply({ content: `✅ Default profile set to **${prof.name}** (\`${prof.id}\`).`, flags: 64 });
          }
        }

        // PRESET
        if (sub === 'preset') {
          const action = interaction.options.getString('action');
          const name = interaction.options.getString('name');
          const amount = interaction.options.getNumber('amount');

          if (action === 'create') {
            if (!name || amount === null) return interaction.reply({ content: '❌ Provide both preset name and amount.', flags: 64 });
            const id = name.toLowerCase().replace(/\s+/g, '-');
            await PaymentDatabase.savePreset({ id, guildId, name, amount });
            await PaymentService.sendLog(guildId, `🏷️ **Preset Created**: \`${name}\` (Amount: ${amount})`, '#10b981', client);
            return interaction.reply({ content: `✅ Preset **${name}** for **${amount}** created.`, flags: 64 });
          }

          if (action === 'list') {
            const presets = await PaymentDatabase.getPresets(guildId);
            if (presets.length === 0) return interaction.reply({ content: '🏷️ No payment presets configured.', flags: 64 });
            const lines = presets.map((p, i) => `**${i + 1}. ${p.name}** — \`${p.amount}\``);
            return interaction.reply({ content: `🏷️ **Payment Presets List**:\n${lines.join('\n')}`, flags: 64 });
          }

          if (action === 'delete') {
            if (!name) return interaction.reply({ content: '❌ Specify preset name or ID to delete.', flags: 64 });
            const deleted = await PaymentDatabase.deletePreset(guildId, name);
            return interaction.reply({ content: deleted ? `✅ Preset **${name}** deleted.` : `❌ Preset **${name}** not found.`, flags: 64 });
          }
        }

        // ROLE
        if (sub === 'role') {
          const action = interaction.options.getString('action');
          const targetRole = interaction.options.getRole('role');

          if (action === 'add') {
            if (!targetRole) return interaction.reply({ content: '❌ Specify a role to add.', flags: 64 });
            await PaymentDatabase.addRole(guildId, targetRole.id);
            return interaction.reply({ content: `✅ Added ${targetRole} to Payment Manager roles.`, flags: 64 });
          }

          if (action === 'remove') {
            if (!targetRole) return interaction.reply({ content: '❌ Specify a role to remove.', flags: 64 });
            await PaymentDatabase.removeRole(guildId, targetRole.id);
            return interaction.reply({ content: `✅ Removed ${targetRole} from Payment Manager roles.`, flags: 64 });
          }

          if (action === 'list') {
            const roles = await PaymentDatabase.getRoles(guildId);
            if (roles.length === 0) return interaction.reply({ content: '👑 No custom manager roles configured. Server Owner & Administrators have default access.', flags: 64 });
            return interaction.reply({ content: `👑 **Allowed Payment Manager Roles**:\n${roles.map(r => `<@&${r}>`).join(', ')}`, flags: 64 });
          }
        }

        // EXPORT
        if (sub === 'export') {
          const exportedJson = await PaymentService.exportConfig(guildId);
          const buffer = Buffer.from(exportedJson, 'utf-8');
          const file = new AttachmentBuilder(buffer, { name: `payment_config_${guildId}.json` });

          return interaction.reply({
            content: '📥 **Payment Configuration Export Completed**',
            files: [file],
            flags: 64
          });
        }

        // IMPORT
        if (sub === 'import') {
          const jsonPayload = interaction.options.getString('data');
          const result = await PaymentService.importConfig(guildId, jsonPayload);
          return interaction.reply({ content: result.message, flags: 64 });
        }
      }
    },
    {
      name: 'command_pay',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: '❌ /pay can only be used inside a server.', flags: 64 });

        // Authorization check: Owner, Administrator, or Manager Role
        const canPay = await PaymentService.canGeneratePayment(guild, interaction.member);
        if (!canPay) {
          const errEmbed = PaymentEmbeds.buildPermissionErrorEmbed(
            '🔒 Permission Denied',
            'You must be a Server Owner, Administrator, or have a configured Payment Manager role to generate payment requests.'
          );
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }

        const config = await PaymentService.getOrCreateConfig(guild.id);
        if (!config.enabled) {
          return interaction.reply({
            content: '⚠️ **Payment QR Module is currently disabled.** Ask a server administrator to enable it using `/payment enable`.',
            flags: 64
          });
        }

        if (!config.upiId) {
          return interaction.reply({
            content: '⚠️ **Payment Module is not setup yet.** An administrator must run `/payment setup` first.',
            flags: 64
          });
        }

        const amount = interaction.options.getNumber('amount');
        const purpose = interaction.options.getString('purpose');
        const profileQuery = interaction.options.getString('profile');

        if (!amount || amount <= 0) {
          return interaction.reply({ content: '❌ Amount must be greater than 0.', flags: 64 });
        }

        await interaction.deferReply();

        try {
          const { session, embed, qrBuffer } = await PaymentService.createPaymentSession(
            guild.id,
            interaction.user.id,
            amount,
            purpose,
            profileQuery
          );

          const attachment = new AttachmentBuilder(qrBuffer, { name: `payment_qr_${session.paymentId}.png` });
          const row = PaymentEmbeds.buildPaymentActionRow(session.paymentId);

          return interaction.editReply({
            embeds: [embed],
            files: [attachment],
            components: [row]
          });
        } catch (err: any) {
          console.error('[command_pay Error]:', err);
          return interaction.editReply({ content: `❌ Failed to generate Payment QR: ${err.message}` });
        }
      }
    },
    {
      name: 'button_payment_generic',
      handler: async (client: any, interaction: any, context: any) => {
        const customId = interaction.customId;
        if (!customId.startsWith('payment_')) return;

        const parts = customId.split('_');
        const action = parts[1]; // dl, upi, note, cancel
        const paymentId = parts.slice(2).join('_');

        const session = await PaymentDatabase.getSession(paymentId);
        if (!session) {
          return interaction.reply({ content: '❌ Payment session expired or not found.', flags: 64 });
        }

        const config = await PaymentService.getOrCreateConfig(session.guildId);

        // 1. DOWNLOAD QR
        if (action === 'dl') {
          const upiUri = `upi://pay?pa=${encodeURIComponent(session.upiId)}&pn=${encodeURIComponent(session.merchantName)}&am=${session.amount.toFixed(2)}&cu=${encodeURIComponent(config.currency || 'INR')}&tn=${encodeURIComponent(`${session.purpose} [${session.paymentId}]`)}`;

          let branding: any = {};
          try { branding = JSON.parse(config.branding || '{}'); } catch {}

          const qrBuffer = await PaymentEmbeds.generateQRCodeBuffer(upiUri, branding);
          const attachment = new AttachmentBuilder(qrBuffer, { name: `qr_${paymentId}.png` });

          return interaction.reply({
            content: `📥 **High Resolution Payment QR Code**\nPayment ID: \`${paymentId}\``,
            files: [attachment],
            flags: 64
          });
        }

        // 2. COPY UPI
        if (action === 'upi') {
          return interaction.reply({
            content: `📌 **Merchant UPI ID**:\n\`\`\`${session.upiId}\`\`\``,
            flags: 64
          });
        }

        // 3. COPY PAYMENT NOTE
        if (action === 'note') {
          return interaction.reply({
            content: `📋 **Payment Transaction Note**:\n\`\`\`${session.purpose} [${session.paymentId}]\`\`\``,
            flags: 64
          });
        }

        // 4. CANCEL PAYMENT
        if (action === 'cancel') {
          const isOwnerOrAdmin = PaymentService.isServerOwnerOrAdmin(interaction.guild, interaction.member);
          const result = await PaymentService.cancelPaymentSession(paymentId, interaction.user.id, isOwnerOrAdmin);

          if (!result.success) {
            return interaction.reply({ content: result.message, flags: 64 });
          }

          const cancelledEmbed = PaymentEmbeds.buildCancelledPaymentEmbed(result.session!, config, interaction.user.id);
          const disabledRow = PaymentEmbeds.buildPaymentActionRow(paymentId, true);

          // Update original message
          if (interaction.message && interaction.message.editable) {
            await interaction.message.edit({
              embeds: [cancelledEmbed],
              files: [],
              components: [disabledRow]
            }).catch(() => {});
          }

          return interaction.reply({ content: '✅ Payment session cancelled.', flags: 64 });
        }
      }
    }
  ]
};
