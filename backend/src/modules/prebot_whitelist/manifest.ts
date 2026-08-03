import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, Message, AttachmentBuilder } from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { Database } from '../../core/Database.js';
import { isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';
import { wrapInteraction } from '../../core/Gateway.js';
import { VERIFIED_ICON, WRONG_ICON, SHIELD_ICON, BOT_ICON, ARROW_ICON, CONFIG_ICON, INFO_ICON, Colors, createLimeEmbed } from '../../core/UIFactory.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';
import { TwoFactorManager } from '../../core/security/TwoFactorManager.js';

export interface PreBotEntry {
  guildId: string;
  botId: string;
  botName: string;
  allowedPerms: string[];
  createRole: boolean;
  roleName?: string;
  roleColor?: string;
  addedBy: string;
  addedAt: number;
  notes?: string;
}

// Available granular permissions for bot profiles
export const PREBOT_PERMISSIONS = [
  { key: 'ViewChannel', label: 'View Channels', desc: 'Allows bot to see channels', flag: PermissionFlagsBits.ViewChannel },
  { key: 'SendMessages', label: 'Send Messages', desc: 'Allows bot to send text messages', flag: PermissionFlagsBits.SendMessages },
  { key: 'EmbedLinks', label: 'Embed Links', desc: 'Allows bot to embed rich content', flag: PermissionFlagsBits.EmbedLinks },
  { key: 'AttachFiles', label: 'Attach Files', desc: 'Allows bot to upload media & files', flag: PermissionFlagsBits.AttachFiles },
  { key: 'ReadMessageHistory', label: 'Read Message History', desc: 'Allows bot to read past messages', flag: PermissionFlagsBits.ReadMessageHistory },
  { key: 'UseExternalEmojis', label: 'Use External Emojis', desc: 'Allows bot to use external emojis', flag: PermissionFlagsBits.UseExternalEmojis },
  { key: 'AddReactions', label: 'Add Reactions', desc: 'Allows bot to react to messages', flag: PermissionFlagsBits.AddReactions },
  { key: 'Connect', label: 'Voice Connect', desc: 'Allows bot to connect to voice channels', flag: PermissionFlagsBits.Connect },
  { key: 'Speak', label: 'Voice Speak', desc: 'Allows bot to speak in voice channels', flag: PermissionFlagsBits.Speak },
  { key: 'ManageMessages', label: 'Manage Messages', desc: 'Allows bot to delete/pin messages', flag: PermissionFlagsBits.ManageMessages },
  { key: 'ManageRoles', label: 'Manage Roles', desc: 'Allows bot to manage lower roles', flag: PermissionFlagsBits.ManageRoles },
  { key: 'ManageChannels', label: 'Manage Channels', desc: 'Allows bot to manage channels', flag: PermissionFlagsBits.ManageChannels },
  { key: 'ModerateMembers', label: 'Timeout Members', desc: 'Allows bot to mute/timeout members', flag: PermissionFlagsBits.ModerateMembers },
  { key: 'KickMembers', label: 'Kick Members', desc: 'Allows bot to kick members', flag: PermissionFlagsBits.KickMembers },
  { key: 'BanMembers', label: 'Ban Members', desc: 'Allows bot to ban members', flag: PermissionFlagsBits.BanMembers },
  { key: 'Administrator', label: 'Administrator (High Risk)', desc: 'Full administrative access', flag: PermissionFlagsBits.Administrator }
];

export async function getPrebotEntries(guildId: string): Promise<PreBotEntry[]> {
  try {
    const db = Database.getDb();
    if (!db) return [];
    const rows = await db.all<any>('SELECT * FROM prebot_whitelist WHERE guildId = ?', [guildId]);
    return rows.map(r => ({
      guildId: r.guildId,
      botId: r.botId,
      botName: r.botName,
      allowedPerms: JSON.parse(r.allowedPerms || '[]'),
      createRole: Boolean(r.createRole),
      roleName: r.roleName,
      roleColor: r.roleColor,
      addedBy: r.addedBy,
      addedAt: r.addedAt,
      notes: r.notes
    }));
  } catch (err) {
    console.error('[PreBot DB] Error fetching entries:', err);
    return [];
  }
}

export async function getPrebotEntry(guildId: string, botId: string): Promise<PreBotEntry | null> {
  try {
    const db = Database.getDb();
    if (!db) return null;
    const r = await db.get<any>('SELECT * FROM prebot_whitelist WHERE guildId = ? AND botId = ?', [guildId, botId]);
    if (!r) return null;
    return {
      guildId: r.guildId,
      botId: r.botId,
      botName: r.botName,
      allowedPerms: JSON.parse(r.allowedPerms || '[]'),
      createRole: Boolean(r.createRole),
      roleName: r.roleName,
      roleColor: r.roleColor,
      addedBy: r.addedBy,
      addedAt: r.addedAt,
      notes: r.notes
    };
  } catch (err) {
    console.error('[PreBot DB] Error fetching entry:', err);
    return null;
  }
}

export async function savePrebotEntry(entry: PreBotEntry): Promise<void> {
  try {
    const db = Database.getDb();
    if (!db) return;
    await db.run(
      `INSERT INTO prebot_whitelist (guildId, botId, botName, allowedPerms, createRole, roleName, roleColor, addedBy, addedAt, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(guildId, botId) DO UPDATE SET
         botName = excluded.botName,
         allowedPerms = excluded.allowedPerms,
         createRole = excluded.createRole,
         roleName = excluded.roleName,
         roleColor = excluded.roleColor,
         addedBy = excluded.addedBy,
         addedAt = excluded.addedAt,
         notes = excluded.notes`,
      [
        entry.guildId,
        entry.botId,
        entry.botName,
        JSON.stringify(entry.allowedPerms),
        entry.createRole ? 1 : 0,
        entry.roleName || `[Trusted] ${entry.botName}`,
        entry.roleColor || '#99CC00',
        entry.addedBy,
        entry.addedAt,
        entry.notes || ''
      ]
    );
  } catch (err) {
    console.error('[PreBot DB] Error saving entry:', err);
  }
}

export async function deletePrebotEntry(guildId: string, botId: string): Promise<boolean> {
  try {
    const db = Database.getDb();
    if (!db) return false;
    const res = await db.run('DELETE FROM prebot_whitelist WHERE guildId = ? AND botId = ?', [guildId, botId]);
    return res.changes > 0;
  } catch (err) {
    console.error('[PreBot DB] Error deleting entry:', err);
    return false;
  }
}

// Build interactive builder UI for adding/editing PreBot whitelist entry
async function launchPrebotBuilder(
  interaction: any,
  context: any,
  botUser: any,
  existingEntry?: PreBotEntry | null
) {
  const guild = interaction.guild;
  const botId = botUser.id;
  const botName = botUser.username || botUser.tag || `Bot-${botId}`;

  let selectedPerms: string[] = existingEntry ? [...existingEntry.allowedPerms] : ['ViewChannel', 'SendMessages', 'ReadMessageHistory'];
  let createRole = existingEntry ? existingEntry.createRole : true;
  let roleName = existingEntry?.roleName || `[Trusted] ${botName}`;
  let roleColor = existingEntry?.roleColor || '#99CC00';
  let notes = existingEntry?.notes || '';

  const buildEmbed = () => {
    const permBadges = selectedPerms.length > 0
      ? selectedPerms.map(p => {
        const item = PREBOT_PERMISSIONS.find(item => item.key === p);
        return `\`${item?.label || p}\``;
      }).join(', ')
      : '*No permissions selected (Least Privilege)*';

    const desc = [
      `__**PREBOT WHITELIST CONFIGURATION**__\n`,
      `**RAGE OPTIMISER** • **${guild.name}**\n`,
      `> Pre-register trusted bot **<@${botId}>** (\`${botName}\`) before it enters the server.`,
      `> Defines exact permission profile applied automatically upon bot arrival.\n`,
      `**Bot Target**: <@${botId}> (\`${botId}\`)`,
      `**Dedicated Role**: ${createRole ? `${VERIFIED_ICON} Enabled (\`${roleName}\`)` : `${WRONG_ICON} Disabled`}`,
      `**Notes**: ${notes ? notes : '*None provided*'}\n`,
      `**Approved Permission Profile (${selectedPerms.length}/${PREBOT_PERMISSIONS.length})**:`,
      `> ${permBadges}`
    ].join('\n');

    return new EmbedBuilder()
      .setColor(Colors.BRAND)
      .setTitle(`${BOT_ICON} PreBot Security Builder — ${botName}`)
      .setDescription(desc)
      .setThumbnail(botUser.displayAvatarURL({ size: 256 }) || null)
      .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
      .setTimestamp();
  };

  const buildComponents = () => {
    // Split permissions into 2 select menus due to 25 option limit per menu
    const mid = Math.ceil(PREBOT_PERMISSIONS.length / 2);
    const part1 = PREBOT_PERMISSIONS.slice(0, mid);
    const part2 = PREBOT_PERMISSIONS.slice(mid);

    const select1 = new StringSelectMenuBuilder()
      .setCustomId(`prebot_perm_sel1_${botId}_${interaction.user.id}`)
      .setPlaceholder('⚙️ Select General & Messaging Permissions…')
      .setMinValues(0)
      .setMaxValues(part1.length)
      .addOptions(
        part1.map(p =>
          new StringSelectMenuOptionBuilder()
            .setLabel(p.label)
            .setValue(p.key)
            .setDescription(p.desc)
            .setDefault(selectedPerms.includes(p.key))
        )
      );

    const select2 = new StringSelectMenuBuilder()
      .setCustomId(`prebot_perm_sel2_${botId}_${interaction.user.id}`)
      .setPlaceholder('⚙️ Select Moderation & Admin Permissions…')
      .setMinValues(0)
      .setMaxValues(part2.length)
      .addOptions(
        part2.map(p =>
          new StringSelectMenuOptionBuilder()
            .setLabel(p.label)
            .setValue(p.key)
            .setDescription(p.desc)
            .setDefault(selectedPerms.includes(p.key))
        )
      );

    const rowSelect1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select1);
    const rowSelect2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select2);

    const btnRoleToggle = new ButtonBuilder()
      .setCustomId(`prebot_btn_role_${botId}_${interaction.user.id}`)
      .setLabel(createRole ? 'Dedicated Role: ON' : 'Dedicated Role: OFF')
      .setStyle(createRole ? ButtonStyle.Success : ButtonStyle.Secondary);

    const btnSave = new ButtonBuilder()
      .setCustomId(`prebot_btn_save_${botId}_${interaction.user.id}`)
      .setLabel('Save PreBot Whitelist')
      .setStyle(ButtonStyle.Primary);

    const btnCancel = new ButtonBuilder()
      .setCustomId(`prebot_btn_cancel_${botId}_${interaction.user.id}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger);

    const rowButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(btnRoleToggle, btnSave, btnCancel);

    return [rowSelect1, rowSelect2, rowButtons];
  };

  const responseMsg = await interaction.editReply({
    embeds: [buildEmbed()],
    components: buildComponents()
  });

  const collector = responseMsg.createMessageComponentCollector({
    time: 600000 // 10 minutes
  });

  collector.on('collect', async (rawI: any) => {
    const i = wrapInteraction(rawI);
    if (i.user.id !== interaction.user.id) {
      const errEmbed = new EmbedBuilder()
        .setTitle('🔒 Interactivity Denied')
        .setColor(Colors.DANGER)
        .setDescription('Only the command executor can configure this PreBot Whitelist profile.')
        .setTimestamp();
      return i.reply({ embeds: [errEmbed], flags: 64 });
    }

    if (i.isStringSelectMenu()) {
      const menuId = i.customId;
      const values = i.values || [];

      if (menuId.startsWith('prebot_perm_sel1_')) {
        const part1Keys = PREBOT_PERMISSIONS.slice(0, Math.ceil(PREBOT_PERMISSIONS.length / 2)).map(p => p.key);
        // Retain selections from part 2, replace part 1
        selectedPerms = [...selectedPerms.filter(p => !part1Keys.includes(p)), ...values];
      } else if (menuId.startsWith('prebot_perm_sel2_')) {
        const part2Keys = PREBOT_PERMISSIONS.slice(Math.ceil(PREBOT_PERMISSIONS.length / 2)).map(p => p.key);
        // Retain selections from part 1, replace part 2
        selectedPerms = [...selectedPerms.filter(p => !part2Keys.includes(p)), ...values];
      }

      await i.update({
        embeds: [buildEmbed()],
        components: buildComponents()
      });
    } else if (i.isButton()) {
      const btnId = i.customId;

      if (btnId.startsWith('prebot_btn_role_')) {
        createRole = !createRole;
        await i.update({
          embeds: [buildEmbed()],
          components: buildComponents()
        });
      } else if (btnId.startsWith('prebot_btn_cancel_')) {
        collector.stop('cancelled');
        const cancelEmbed = new EmbedBuilder()
          .setTitle('❌ Setup Cancelled')
          .setColor(Colors.DANGER)
          .setDescription(`PreBot Whitelist setup for **<@${botId}>** was cancelled.`)
          .setTimestamp();
        await i.update({ embeds: [cancelEmbed], components: [] });
      } else if (btnId.startsWith('prebot_btn_save_')) {
        collector.stop('saved');

        const newEntry: PreBotEntry = {
          guildId: guild.id,
          botId,
          botName,
          allowedPerms: selectedPerms,
          createRole,
          roleName: createRole ? roleName : undefined,
          roleColor: createRole ? roleColor : undefined,
          addedBy: interaction.user.id,
          addedAt: Date.now(),
          notes
        };

        await savePrebotEntry(newEntry);
        context.logSyncEvent(guild.id, `✅ [PreBot Whitelist]: Pre-approved bot ${botName} (${botId}) with ${selectedPerms.length} allowed permissions.`, 'success');

        const successEmbed = new EmbedBuilder()
          .setColor(Colors.SUCCESS)
          .setTitle(`${VERIFIED_ICON} PreBot Whitelist — Saved`)
          .setDescription([
            `**Bot <@${botId}>** (\`${botName}\`) has been successfully registered in the **PreBot Whitelist**.`,
            `When this bot enters **${guild.name}**, Rage Optimiser will instantly verify it, strip unauthorized roles, and enforce this custom profile.`,
            `\n**Allowed Permissions**: ${selectedPerms.length > 0 ? selectedPerms.map(p => `\`${p}\``).join(', ') : '`None`'}`,
            `**Dedicated Trusted Role**: ${createRole ? `\`${roleName}\`` : '`Disabled`'}`
          ].join('\n'))
          .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
          .setTimestamp();

        await i.update({ embeds: [successEmbed], components: [] });
      }
    }
  });
}

export function registerPrebotCommands(): void {
  PrefixRegistry.register({
    name: 'prebot',
    category: 'Security',
    description: 'Confidential PreBot Whitelist Management (Server Owner & Extra Owner Only)',
    usage: 'r!prebot <add|remove|list|info> [bot]',
    aliases: ['prebotwhitelist'],
    cooldownSeconds: 3,
    examples: ['r!prebot add 1234567890', 'r!prebot list'],
    moduleOwnerId: 'prebot_whitelist',
    dangerLevel: 'High',
    hidden: true, // Confidential — Excluded from r!help, autocomplete & public listings
    execute: async (message: Message, args: string[], extra?: any) => {
      const guild = message.guild;
      if (!guild) return message.reply('This command can only be executed in a server.');

      const isAuthorized = await isOwnerOrExtraOwner(message.author.id, guild);
      if (!isAuthorized) {
        const denEmbed = createLimeEmbed({
          title: 'Confidential Command Access Denied',
          description: `${WRONG_ICON} **Confidential Security Feature**: PreBot Whitelist management is strictly restricted to the **Server Owner** (<@${guild.ownerId}>) and designated **Extra Owners**.\n\n*This secret management suite is not accessible by regular members or administrators.*`
        });
        return message.reply({ embeds: [denEmbed] });
      }

      const sub = args[0]?.toLowerCase() || 'list';

      if (sub === '2fa') {
        if (message.author.id !== guild.ownerId) {
          return message.reply({
            embeds: [new EmbedBuilder()
              .setTitle(`${WRONG_ICON} Server Owner Access Restricted`)
              .setColor(Colors.DANGER)
              .setDescription(`${WRONG_ICON} PreBot Whitelist 2FA configuration is strictly restricted to the **Server Owner** (<@${guild.ownerId}>). Extra Owners cannot configure server 2FA settings.`)
              .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
              .setTimestamp()]
          });
        }

        const action = args[1]?.toLowerCase() || 'status';
        const codeArg = args[2] || args.find(a => /^\d{6}$/.test(a.trim()));

        if (action === 'setup' || action === 'on') {
          const { secret, qrBuffer } = await TwoFactorManager.generateSecret(message.author.username, guild.name);
          await TwoFactorManager.savePrebot2FAConfig(guild.id, message.author.id, secret, false);

          const attachment = new AttachmentBuilder(qrBuffer, { name: '2fa-qrcode.png' });
          const setupEmbed = new EmbedBuilder()
            .setTitle(`${SHIELD_ICON} PreBot Whitelist 2FA Setup`)
            .setColor(Colors.BRAND)
            .setThumbnail('attachment://2fa-qrcode.png')
            .setDescription([
              `**Server**: \`${guild.name}\``,
              `\n**Step 1**: Scan the QR Code below using **Google Authenticator**, **Authy**, or **Microsoft Authenticator**.`,
              `\n**Step 2**: Run the confirmation command with your live 6-digit code to activate 2FA:`,
              `> \`r!prebot 2fa confirm <code>\` or \`/prebot 2fa action:confirm code:<code>\``,
              `\n**Secret Key (Manual Entry)**: \`${secret}\``
            ].join('\n'))
            .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
            .setTimestamp();

          try {
            await message.author.send({ embeds: [setupEmbed], files: [attachment] });
            return message.reply({
              embeds: [new EmbedBuilder()
                .setTitle(`${VERIFIED_ICON} 2FA Setup Instructions Sent`)
                .setColor(Colors.SUCCESS)
                .setDescription(`Check your Direct Messages (<@${message.author.id}>) for your secret 2FA QR Code and setup instructions.\n\n*After scanning, confirm with:* \`r!prebot 2fa confirm <code>\``)
                .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
                .setTimestamp()]
            });
          } catch (dmErr) {
            return message.reply({
              content: '⚠️ Failed to send DM. Sending confidential setup payload here:',
              embeds: [setupEmbed],
              files: [attachment]
            });
          }
        }

        if (action === 'confirm' || action === 'verify') {
          if (!codeArg) {
            return message.reply(`${WRONG_ICON} Please provide your 6-digit Google Authenticator code. Example: \`r!prebot 2fa confirm 123456\``);
          }

          const cfg = await TwoFactorManager.getPrebot2FAConfig(guild.id);
          if (!cfg || !cfg.secret) {
            return message.reply(`${WRONG_ICON} No pending 2FA setup found. Please run \`r!prebot 2fa setup\` first.`);
          }

          const isValid = TwoFactorManager.verifyToken(cfg.secret, codeArg);
          if (!isValid) {
            return message.reply({
              embeds: [new EmbedBuilder()
                .setTitle(`${WRONG_ICON} 2FA Verification Failed`)
                .setColor(Colors.DANGER)
                .setDescription(`The 6-digit 2FA code provided is **invalid or expired**. Please check your Google Authenticator app and try again.`)
                .setTimestamp()]
            });
          }

          await TwoFactorManager.setPrebot2FAEnabled(guild.id, true);
          return message.reply({
            embeds: [new EmbedBuilder()
              .setTitle(`${VERIFIED_ICON} PreBot Whitelist 2FA Protection Activated!`)
              .setColor(Colors.SUCCESS)
              .setDescription(`Google Authenticator 2FA protection is now **ENABLED** for this server.\n\nAll future PreBot additions (\`r!prebot add\`, \`r!prebot quickadd\`) will require a live 6-digit Google Authenticator code.`)
              .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
              .setTimestamp()]
          });
        }

        if (action === 'off' || action === 'disable') {
          const cfg = await TwoFactorManager.getPrebot2FAConfig(guild.id);
          if (!cfg || !cfg.isEnabled) {
            return message.reply(`${WRONG_ICON} PreBot Whitelist 2FA protection is not currently enabled for this server.`);
          }

          if (!codeArg) {
            return message.reply(`${WRONG_ICON} Please provide your 6-digit Google Authenticator code to disable 2FA. Example: \`r!prebot 2fa off 123456\``);
          }

          const isValid = TwoFactorManager.verifyToken(cfg.secret, codeArg);
          if (!isValid) {
            return message.reply({
              embeds: [new EmbedBuilder()
                .setTitle(`${WRONG_ICON} 2FA Verification Failed`)
                .setColor(Colors.DANGER)
                .setDescription(`Invalid 6-digit code. Unable to disable 2FA protection.`)
                .setTimestamp()]
            });
          }

          await TwoFactorManager.setPrebot2FAEnabled(guild.id, false);
          return message.reply({
            embeds: [new EmbedBuilder()
              .setTitle(`${VERIFIED_ICON} PreBot Whitelist 2FA Disabled`)
              .setColor(Colors.SUCCESS)
              .setDescription(`2FA enforcement for PreBot Whitelist additions has been **DISABLED**.`)
              .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
              .setTimestamp()]
          });
        }

        // Default: status
        const cfg = await TwoFactorManager.getPrebot2FAConfig(guild.id);
        const isEnabled = cfg ? cfg.isEnabled : false;
        return message.reply({
          embeds: [new EmbedBuilder()
            .setTitle(`${SHIELD_ICON} PreBot Whitelist 2FA Status`)
            .setColor(isEnabled ? Colors.SUCCESS : Colors.INFO)
            .setDescription([
              `**Status**: ${isEnabled ? '🟢 **ENABLED (Active)**' : '🔴 **DISABLED (Inactive)**'}`,
              `**Managed By**: Server Owner (<@${guild.ownerId}>)`,
              `\n${isEnabled ? 'All bot additions require a live 6-digit Google Authenticator code.' : 'Bot additions do not require 2FA authentication.'}`,
              `\n**Management Commands**:`,
              `> \`r!prebot 2fa setup\` — Setup QR Code for Google Authenticator`,
              `> \`r!prebot 2fa confirm <code>\` — Confirm and enable 2FA`,
              `> \`r!prebot 2fa off <code>\` — Disable 2FA enforcement`
            ].join('\n'))
            .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
            .setTimestamp()]
        });
      }

      // Check 2FA Enforcement on bot addition commands
      if (sub === 'add' || sub === 'edit' || sub === 'quickadd' || sub === 'quick') {
        const tfaCfg = await TwoFactorManager.getPrebot2FAConfig(guild.id);
        if (tfaCfg && tfaCfg.isEnabled) {
          const codeArg = args.find(a => /^\d{6}$/.test(a.trim()));
          if (!codeArg) {
            const targetMention = args[1] || '@BotName';
            return message.reply({
              embeds: [new EmbedBuilder()
                .setTitle(`${SHIELD_ICON} 2FA Authentication Required`)
                .setColor(Colors.WARN)
                .setDescription([
                  `**RAGE OPTIMISER** • **Zero-Trust Security Gate**`,
                  `\nPreBot Whitelist 2FA protection is **ENABLED** for **${guild.name}**.`,
                  `\nPlease supply your live 6-digit Google Authenticator code to authorize this bot addition:\n`,
                  `> \`r!prebot quickadd ${targetMention} 123456\``,
                  `> \`r!prebot add ${targetMention} 123456\``
                ].join('\n'))
                .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
                .setTimestamp()]
            });
          }

          const isValid = TwoFactorManager.verifyToken(tfaCfg.secret, codeArg);
          if (!isValid) {
            return message.reply({
              embeds: [new EmbedBuilder()
                .setTitle(`${WRONG_ICON} 2FA Verification Failed`)
                .setColor(Colors.DANGER)
                .setDescription(`The 6-digit 2FA code provided is **invalid or expired**. Access Denied.`)
                .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
                .setTimestamp()]
            });
          }
        }
      }

      if (sub === 'add' || sub === 'edit') {
        const targetUser = message.mentions.users.first() || (args[1] ? await message.client.users.fetch(args[1]).catch(() => null) : null);
        if (!targetUser) {
          return message.reply(`${WRONG_ICON} Please specify a bot user. Example: \`r!prebot add @BotName\` or \`r!prebot add 1234567890\``);
        }
        if (!targetUser.bot) {
          return message.reply(`${WRONG_ICON} Target user **<@${targetUser.id}>** is not a Discord bot application.`);
        }

        const syntheticInteraction = {
          guild,
          user: message.author,
          deferReply: async () => { },
          editReply: async (opts: any) => message.reply(opts),
          reply: async (opts: any) => message.reply(opts),
          options: {
            getSubcommand: () => sub,
            getUser: () => targetUser
          }
        };

        const existing = await getPrebotEntry(guild.id, targetUser.id);
        return launchPrebotBuilder(syntheticInteraction, extra || {}, targetUser, existing);
      }

      if (sub === 'quickadd' || sub === 'quick') {
        const targetUser = message.mentions.users.first() || (args[1] ? await message.client.users.fetch(args[1]).catch(() => null) : null);
        if (!targetUser) {
          return message.reply(`${WRONG_ICON} Please specify a bot user to quick-add. Example: \`r!prebot quickadd @BotName\``);
        }
        if (!targetUser.bot) {
          return message.reply(`${WRONG_ICON} Target user **<@${targetUser.id}>** is not a Discord bot application.`);
        }

        const defaultPerms = ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles'];
        const newEntry: PreBotEntry = {
          guildId: guild.id,
          botId: targetUser.id,
          botName: targetUser.username || `Bot-${targetUser.id}`,
          allowedPerms: defaultPerms,
          createRole: true,
          roleName: `[Trusted] ${targetUser.username}`,
          roleColor: '#99CC00',
          addedBy: message.author.id,
          addedAt: Date.now(),
          notes: 'Quick-added via r!prebot quickadd'
        };

        await savePrebotEntry(newEntry);
        return message.reply({
          embeds: [new EmbedBuilder()
            .setTitle(`${VERIFIED_ICON} PreBot Whitelist — Quick Added`)
            .setColor(Colors.SUCCESS)
            .setDescription(`Successfully registered bot **<@${targetUser.id}>** (\`${targetUser.username}\`) in the PreBot Whitelist with standard default permissions.\n\n**Dedicated Role**: \`[Trusted] ${targetUser.username}\`\n**Allowed Permissions**: \`ViewChannel, SendMessages, ReadMessageHistory, EmbedLinks, AttachFiles\``)
            .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
            .setTimestamp()]
        });
      }

      if (sub === 'remove') {
        const targetUser = message.mentions.users.first() || (args[1] ? await message.client.users.fetch(args[1]).catch(() => null) : null);
        if (!targetUser) {
          return message.reply(`${WRONG_ICON} Please specify a bot to remove. Example: \`r!prebot remove @BotName\``);
        }

        const removed = await deletePrebotEntry(guild.id, targetUser.id);
        if (!removed) {
          return message.reply(`${WRONG_ICON} Bot **<@${targetUser.id}>** is not in the PreBot Whitelist.`);
        }

        return message.reply({
          embeds: [new EmbedBuilder()
            .setTitle(`${VERIFIED_ICON} Bot Removed`)
            .setColor(Colors.SUCCESS)
            .setDescription(`Successfully removed bot **<@${targetUser.id}>** (\`${targetUser.username}\`) from the PreBot Whitelist.`)
            .setTimestamp()]
        });
      }

      if (sub === 'list') {
        const entries = await getPrebotEntries(guild.id);
        if (entries.length === 0) {
          return message.reply({
            embeds: [new EmbedBuilder()
              .setTitle(`${BOT_ICON} Secret PreBot Whitelist Registry`)
              .setColor(Colors.INFO)
              .setDescription('**No bots pre-registered in this server.**\n\nTo pre-approve a bot before it joins, use:\n> `r!prebot add @BotName`')
              .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
              .setTimestamp()]
          });
        }

        const lines = entries.map(e => `• **<@${e.botId}>** (\`${e.botName}\`) — \`${e.allowedPerms.length}\` allowed perms | ${e.createRole ? `Role: \`${e.roleName}\`` : 'Role: Disabled'}`).join('\n');

        return message.reply({
          embeds: [new EmbedBuilder()
            .setTitle(`${BOT_ICON} Secret PreBot Whitelist Registry (${entries.length})`)
            .setColor(Colors.BRAND)
            .setDescription([`__**APPROVED BOTS**__`, lines, `\n> Use \`r!prebot info @Bot\` to inspect full permission profile.`].join('\n'))
            .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
            .setTimestamp()]
        });
      }

      if (sub === 'info') {
        const targetUser = message.mentions.users.first() || (args[1] ? await message.client.users.fetch(args[1]).catch(() => null) : null);
        if (!targetUser) {
          return message.reply(`${WRONG_ICON} Please specify a bot. Example: \`r!prebot info @BotName\``);
        }

        const entry = await getPrebotEntry(guild.id, targetUser.id);
        if (!entry) {
          return message.reply(`${WRONG_ICON} Bot **<@${targetUser.id}>** is not registered in the PreBot Whitelist.`);
        }

        return message.reply({
          embeds: [new EmbedBuilder()
            .setTitle(`${BOT_ICON} PreBot Profile — ${entry.botName}`)
            .setColor(Colors.BRAND)
            .setThumbnail(targetUser.displayAvatarURL({ size: 256 }) || null)
            .setDescription([
              `**Bot User**: <@${entry.botId}> (\`${entry.botId}\`)`,
              `**Registered By**: <@${entry.addedBy}>`,
              `**Registered At**: <t:${Math.floor(entry.addedAt / 1000)}:F>`,
              `**Dedicated Role**: ${entry.createRole ? `\`${entry.roleName}\`` : '`Disabled`'}`,
              `**Notes**: ${entry.notes ? entry.notes : '*None*'}`,
              `\n**Approved Permission Profile (${entry.allowedPerms.length})**:`,
              entry.allowedPerms.length > 0 ? entry.allowedPerms.map(p => `\`${p}\``).join(', ') : '`None`'
            ].join('\n'))
            .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
            .setTimestamp()]
        });
      }
    }
  });
}

export const PrebotWhitelistManifest: ModuleManifest = {
  id: 'prebot_whitelist',
  name: 'PreBot Whitelist Guard',
  version: '1.0.0',
  description: 'Enterprise pre-registration registry for trusted bots with strict permission enforcement and zero-trust drift monitoring.',
  configSchema: {
    requiredFields: [],
    validate: () => ({ progress: 100, errors: [] })
  },
  commands: [],
  events: [
    {
      name: 'command_prebot',
      handler: async (client: any, interaction: any, context: any) => {
        await interaction.deferReply({ flags: 64 }).catch(() => { });
        const guild = interaction.guild;
        if (!guild) {
          const errEmbed = new EmbedBuilder()
            .setTitle(`${WRONG_ICON} Server Command Only`)
            .setColor(Colors.DANGER)
            .setDescription('This command can only be executed within a Discord server.')
            .setTimestamp();
          return interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
        }

        // Strictly verify Server Owner or Extra Owner authority ONLY
        const isAuthorized = await isOwnerOrExtraOwner(interaction.user.id, guild);
        if (!isAuthorized) {
          const denEmbed = new EmbedBuilder()
            .setTitle(`${SHIELD_ICON} Access Denied`)
            .setColor(Colors.DANGER)
            .setDescription(`${SHIELD_ICON} PreBot Whitelist management is strictly restricted to the **Server Owner** and **Extra Owners**.`)
            .setTimestamp();
          return interaction.editReply({ embeds: [denEmbed] }).catch(() => { });
        }

        const sub = (interaction.options.getSubcommand(false) || interaction.parsed?.args?.[0] || 'list').toLowerCase();

        if (['on', 'off', 'enable', 'disable', 'toggle'].includes(sub)) {
          const modules = context.getModulesState ? context.getModulesState(guild.id) : [];
          const secModule = modules.find((m: any) => m.id === 'security');
          const secConfig = secModule?.config || {};
          const isEnabled = sub === 'on' || sub === 'enable' || (sub === 'toggle' && secConfig.prebotEnabled === false);

          if (context.updateModuleConfig) {
            context.updateModuleConfig(guild.id, 'security', { ...secConfig, prebotEnabled: isEnabled });
          }

          const embed = new EmbedBuilder()
            .setTitle(`${SHIELD_ICON} Master PreBot Whitelist Guard Toggle`)
            .setColor(isEnabled ? Colors.SUCCESS : Colors.WARN)
            .setDescription([
              `**Server**: \`${guild.name}\``,
              `**PreBot Whitelist Guard**: **${isEnabled ? '🟢 ENABLED (ACTIVE)' : '🔴 DISABLED (INACTIVE)'}**`,
              `\n${isEnabled ? 'Un-registered bots will be automatically kicked on join.' : 'Bot join enforcement is paused. Bots can join freely without pre-registration.'}`
            ].join('\n'))
            .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] }).catch(() => {});
        }

        const is2FAAction = ['2fa', 'confirm', 'setup'].includes(sub);

        if (is2FAAction) {
          if (interaction.user.id !== guild.ownerId) {
            const errEmbed = new EmbedBuilder()
              .setTitle(`${WRONG_ICON} Server Owner Access Restricted`)
              .setColor(Colors.DANGER)
              .setDescription(`${WRONG_ICON} PreBot Whitelist 2FA configuration is strictly restricted to the **Server Owner** (<@${guild.ownerId}>). Extra Owners cannot configure server 2FA settings.`)
              .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
              .setTimestamp();
            return interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
          }

          let action = interaction.options.getString('action', false)?.toLowerCase();
          let codeInput = interaction.options.getString('code', false) || '';

          if (sub === 'setup') action = 'setup';
          if (sub === 'confirm') action = 'confirm';
          if (sub === 'disable') action = 'disable';

          if (!action) {
            const pos1 = interaction.parsed?.args?.[1]?.toLowerCase();
            action = pos1 || (sub !== '2fa' ? sub : 'status');
          }

          if (!codeInput) {
            const posArgs: string[] = interaction.parsed?.args || [];
            const codeCandidate = posArgs.find((a: string) => /^\d{6}$/.test(a));
            if (codeCandidate) codeInput = codeCandidate;
          }

          if (action === 'setup' || action === 'on') {
            const { secret, qrBuffer } = await TwoFactorManager.generateSecret(interaction.user.username, guild.name);
            await TwoFactorManager.savePrebot2FAConfig(guild.id, interaction.user.id, secret, false);

            const attachment = new AttachmentBuilder(qrBuffer, { name: '2fa-qrcode.png' });
            const setupEmbed = new EmbedBuilder()
              .setTitle(`${SHIELD_ICON} PreBot Whitelist 2FA Setup`)
              .setColor(Colors.BRAND)
              .setThumbnail('attachment://2fa-qrcode.png')
              .setDescription([
                `**Server**: \`${guild.name}\``,
                `\n**Step 1**: Scan the QR Code below using **Google Authenticator**, **Authy**, or **Microsoft Authenticator**.`,
                `\n**Step 2**: Run the confirmation command with your live 6-digit code to activate 2FA:`,
                `> \`r!prebot 2fa confirm <code>\``,
                `\n**Secret Key (Manual Entry)**: \`${secret}\``
              ].join('\n'))
              .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
              .setTimestamp();

            return interaction.editReply({ embeds: [setupEmbed], files: [attachment] }).catch(() => { });
          }

          if (action === 'confirm' || action === 'verify') {
            if (!codeInput) {
              const errEmbed = new EmbedBuilder()
                .setTitle(`${WRONG_ICON} Missing Code`)
                .setColor(Colors.DANGER)
                .setDescription('Please provide your 6-digit Google Authenticator code: `r!prebot 2fa confirm 123456`');
              return interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
            }

            const cfg = await TwoFactorManager.getPrebot2FAConfig(guild.id);
            if (!cfg || !cfg.secret) {
              const errEmbed = new EmbedBuilder()
                .setTitle(`${WRONG_ICON} Setup Required`)
                .setColor(Colors.DANGER)
                .setDescription('No pending 2FA setup found. Please run `r!prebot 2fa setup` first.');
              return interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
            }

            const isValid = TwoFactorManager.verifyToken(cfg.secret, codeInput);
            if (!isValid) {
              const errEmbed = new EmbedBuilder()
                .setTitle(`${WRONG_ICON} 2FA Verification Failed`)
                .setColor(Colors.DANGER)
                .setDescription('The 6-digit 2FA code provided is **invalid or expired**. Please check your Google Authenticator app and try again.');
              return interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
            }

            await TwoFactorManager.setPrebot2FAEnabled(guild.id, true);
            const successEmbed = new EmbedBuilder()
              .setTitle(`${VERIFIED_ICON} PreBot Whitelist 2FA Protection Activated!`)
              .setColor(Colors.SUCCESS)
              .setDescription(`Google Authenticator 2FA protection is now **ENABLED** for this server.\n\nAll future PreBot additions will require a live 6-digit Google Authenticator code.`)
              .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
              .setTimestamp();
            return interaction.editReply({ embeds: [successEmbed] }).catch(() => { });
          }

          if (action === 'off' || action === 'disable') {
            const cfg = await TwoFactorManager.getPrebot2FAConfig(guild.id);
            if (!cfg || !cfg.isEnabled) {
              const errEmbed = new EmbedBuilder()
                .setTitle(`${WRONG_ICON} 2FA Not Enabled`)
                .setColor(Colors.DANGER)
                .setDescription('PreBot Whitelist 2FA protection is not currently enabled for this server.');
              return interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
            }

            if (!codeInput) {
              const errEmbed = new EmbedBuilder()
                .setTitle(`${WRONG_ICON} Missing Code`)
                .setColor(Colors.DANGER)
                .setDescription('Please provide your 6-digit Google Authenticator code to disable 2FA: `r!prebot 2fa disable 123456`');
              return interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
            }

            const isValid = TwoFactorManager.verifyToken(cfg.secret, codeInput);
            if (!isValid) {
              const errEmbed = new EmbedBuilder()
                .setTitle(`${WRONG_ICON} 2FA Verification Failed`)
                .setColor(Colors.DANGER)
                .setDescription('Invalid 6-digit code. Unable to disable 2FA protection.');
              return interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
            }

            await TwoFactorManager.setPrebot2FAEnabled(guild.id, false);
            const successEmbed = new EmbedBuilder()
              .setTitle(`${VERIFIED_ICON} PreBot Whitelist 2FA Disabled`)
              .setColor(Colors.SUCCESS)
              .setDescription('2FA enforcement for PreBot Whitelist additions has been **DISABLED**.')
              .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
              .setTimestamp();
            return interaction.editReply({ embeds: [successEmbed] }).catch(() => { });
          }

          // Default: status
          const cfg = await TwoFactorManager.getPrebot2FAConfig(guild.id);
          const isEnabled = cfg ? cfg.isEnabled : false;
          const statusEmbed = new EmbedBuilder()
            .setTitle(`${SHIELD_ICON} PreBot Whitelist 2FA Status`)
            .setColor(isEnabled ? Colors.SUCCESS : Colors.INFO)
            .setDescription([
              `**Status**: ${isEnabled ? '🟢 **ENABLED (Active)**' : '🔴 **DISABLED (Inactive)**'}`,
              `**Managed By**: Server Owner (<@${guild.ownerId}>)`,
              `\n${isEnabled ? 'All bot additions require a live 6-digit Google Authenticator code.' : 'Bot additions do not require 2FA authentication.'}`,
              `\n**Management Commands**:`,
              `> \`r!prebot 2fa setup\` — Setup QR Code for Google Authenticator`,
              `> \`r!prebot 2fa confirm <code>\` — Confirm and enable 2FA`,
              `> \`r!prebot 2fa disable <code>\` — Disable 2FA enforcement`
            ].join('\n'))
            .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
            .setTimestamp();

          return interaction.editReply({ embeds: [statusEmbed] }).catch(() => { });
        }

        if (sub === 'add' || sub === 'edit' || sub === 'quickadd' || sub === 'quick') {
          const tfaCfg = await TwoFactorManager.getPrebot2FAConfig(guild.id);
          if (tfaCfg && tfaCfg.isEnabled) {
            const codeInput = interaction.options.getString('code', false);
            if (!codeInput) {
              const reqEmbed = new EmbedBuilder()
                .setTitle(`${SHIELD_ICON} 2FA Authentication Required`)
                .setColor(Colors.WARN)
                .setDescription([
                  `**RAGE OPTIMISER** • **Zero-Trust Security Gate**`,
                  `\nPreBot Whitelist 2FA protection is **ENABLED** for **${guild.name}**.`,
                  `\nPlease supply your live 6-digit Google Authenticator code to authorize this bot addition:\n`,
                  `> \`/prebot quickadd bot:@Bot code:123456\``,
                  `> \`/prebot add bot:@Bot code:123456\``
                ].join('\n'))
                .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
                .setTimestamp();
              return interaction.editReply({ embeds: [reqEmbed] }).catch(() => { });
            }

            const isValid = TwoFactorManager.verifyToken(tfaCfg.secret, codeInput);
            if (!isValid) {
              const errEmbed = new EmbedBuilder()
                .setTitle(`${WRONG_ICON} 2FA Verification Failed`)
                .setColor(Colors.DANGER)
                .setDescription('The 6-digit 2FA code provided is **invalid or expired**. Access Denied.')
                .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
                .setTimestamp();
              return interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
            }
          }
        }

        if (sub === 'add' || sub === 'edit') {
          const botUser = interaction.options.getUser('bot', true);
          if (!botUser.bot) {
            const errEmbed = new EmbedBuilder()
              .setTitle(`${WRONG_ICON} Target Is Not A Bot`)
              .setColor(Colors.DANGER)
              .setDescription(`Target user **<@${botUser.id}>** is a regular Discord user account. PreBot Whitelist is strictly for **bot applications**.`)
              .setTimestamp();
            return interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
          }

          const existing = await getPrebotEntry(guild.id, botUser.id);
          return launchPrebotBuilder(interaction, context, botUser, existing);
        }

        if (sub === 'quickadd' || sub === 'quick') {
          const botUser = interaction.options.getUser('bot', true);
          if (!botUser.bot) {
            const errEmbed = new EmbedBuilder()
              .setTitle(`${WRONG_ICON} Target Is Not A Bot`)
              .setColor(Colors.DANGER)
              .setDescription(`Target user **<@${botUser.id}>** is a regular Discord user account. PreBot Whitelist is strictly for **bot applications**.`)
              .setTimestamp();
            return interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
          }

          const defaultPerms = ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles'];
          const newEntry: PreBotEntry = {
            guildId: guild.id,
            botId: botUser.id,
            botName: botUser.username || `Bot-${botUser.id}`,
            allowedPerms: defaultPerms,
            createRole: true,
            roleName: `[Trusted] ${botUser.username}`,
            roleColor: '#99CC00',
            addedBy: interaction.user.id,
            addedAt: Date.now(),
            notes: 'Quick-added via /prebot quickadd'
          };

          await savePrebotEntry(newEntry);
          context.logSyncEvent(guild.id, `✅ [PreBot Whitelist]: Quick-added bot ${botUser.username} (${botUser.id}).`, 'success');

          const successEmbed = new EmbedBuilder()
            .setTitle(`${VERIFIED_ICON} PreBot Whitelist — Quick Added`)
            .setColor(Colors.SUCCESS)
            .setDescription(`Successfully registered bot **<@${botUser.id}>** (\`${botUser.username}\`) in the PreBot Whitelist with standard default permissions.\n\n**Dedicated Role**: \`[Trusted] ${botUser.username}\`\n**Allowed Permissions**: \`ViewChannel, SendMessages, ReadMessageHistory, EmbedLinks, AttachFiles\``)
            .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
            .setTimestamp();

          return interaction.editReply({ embeds: [successEmbed] }).catch(() => { });
        }

        if (sub === 'remove') {
          const botUser = interaction.options.getUser('bot', true);
          const removed = await deletePrebotEntry(guild.id, botUser.id);

          if (!removed) {
            const errEmbed = new EmbedBuilder()
              .setTitle(`${WRONG_ICON} Entry Not Found`)
              .setColor(Colors.DANGER)
              .setDescription(`Bot **<@${botUser.id}>** (\`${botUser.username}\`) is not present in the PreBot Whitelist.`)
              .setTimestamp();
            return interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
          }

          context.logSyncEvent(guild.id, `[PreBot Whitelist]: Removed bot ${botUser.username} (${botUser.id}) from registry.`, 'info');

          const successEmbed = new EmbedBuilder()
            .setTitle(`${VERIFIED_ICON} Bot Removed`)
            .setColor(Colors.SUCCESS)
            .setDescription(`Successfully removed bot **<@${botUser.id}>** (\`${botUser.username}\`) from the PreBot Whitelist.`)
            .setTimestamp();
          return interaction.editReply({ embeds: [successEmbed] }).catch(() => { });
        }

        if (sub === 'list') {
          const entries = await getPrebotEntries(guild.id);
          if (entries.length === 0) {
            const emptyEmbed = new EmbedBuilder()
              .setTitle(`${BOT_ICON} PreBot Whitelist Registry`)
              .setColor(Colors.INFO)
              .setDescription([
                `**No bots pre-registered in this server.**`,
                `\nTo pre-approve a bot before it joins, use:`,
                `> \`/prebot add bot:@BotName\` or \`r!prebot add @BotName\``
              ].join('\n'))
              .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
              .setTimestamp();
            return interaction.editReply({ embeds: [emptyEmbed] }).catch(() => { });
          }

          const lines = entries.map(e => {
            const permCount = e.allowedPerms.length;
            const roleStr = e.createRole ? `Role: \`${e.roleName}\`` : 'Role: Disabled';
            return `• **<@${e.botId}>** (\`${e.botName}\`) — \`${permCount}\` allowed perms | ${roleStr}`;
          }).join('\n');

          const listEmbed = new EmbedBuilder()
            .setTitle(`${BOT_ICON} PreBot Whitelist Registry (${entries.length})`)
            .setColor(Colors.BRAND)
            .setDescription([
              `__**APPROVED BOTS**__`,
              lines,
              `\n> Use \`/prebot info bot:@Bot\` to inspect full permission profile.`
            ].join('\n'))
            .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
            .setTimestamp();

          return interaction.editReply({ embeds: [listEmbed] }).catch(() => { });
        }

        if (sub === 'info') {
          const botUser = interaction.options.getUser('bot', true);
          const entry = await getPrebotEntry(guild.id, botUser.id);

          if (!entry) {
            const errEmbed = new EmbedBuilder()
              .setTitle(`${WRONG_ICON} Entry Not Found`)
              .setColor(Colors.DANGER)
              .setDescription(`Bot **<@${botUser.id}>** is not registered in the PreBot Whitelist.`)
              .setTimestamp();
            return interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
          }

          const infoEmbed = new EmbedBuilder()
            .setTitle(`${BOT_ICON} PreBot Profile — ${entry.botName}`)
            .setColor(Colors.BRAND)
            .setThumbnail(botUser.displayAvatarURL({ size: 256 }) || null)
            .setDescription([
              `**Bot User**: <@${entry.botId}> (\`${entry.botId}\`)`,
              `**Registered By**: <@${entry.addedBy}>`,
              `**Registered At**: <t:${Math.floor(entry.addedAt / 1000)}:F>`,
              `**Dedicated Role**: ${entry.createRole ? `\`${entry.roleName}\`` : '`Disabled`'}`,
              `**Notes**: ${entry.notes ? entry.notes : '*None*'}`,
              `\n**Approved Permission Profile (${entry.allowedPerms.length})**:`,
              entry.allowedPerms.length > 0 ? entry.allowedPerms.map(p => `\`${p}\``).join(', ') : '`None`'
            ].join('\n'))
            .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
            .setTimestamp();

          return interaction.editReply({ embeds: [infoEmbed] }).catch(() => { });
        }
      }
    }
  ]
};
