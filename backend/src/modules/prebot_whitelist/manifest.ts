import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, Message, AttachmentBuilder } from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { Database } from '../../core/Database.js';
import { isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';
import { wrapInteraction } from '../../core/Gateway.js';
import { VERIFIED_ICON, WRONG_ICON, WARNING_ICON, SHIELD_ICON, BOT_ICON, ARROW_ICON, CONFIG_ICON, INFO_ICON, Colors, createLimeEmbed } from '../../core/UIFactory.js';
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
    return rows.map(r => {
      let allowedPerms: string[] = [];
      try {
        if (Array.isArray(r.allowedPerms)) allowedPerms = r.allowedPerms;
        else if (typeof r.allowedPerms === 'string') allowedPerms = JSON.parse(r.allowedPerms);
      } catch {
        allowedPerms = [];
      }
      return {
        guildId: r.guildId,
        botId: r.botId,
        botName: r.botName,
        allowedPerms,
        createRole: Boolean(r.createRole),
        roleName: r.roleName,
        roleColor: r.roleColor,
        addedBy: r.addedBy,
        addedAt: r.addedAt,
        notes: r.notes
      };
    });
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
    let allowedPerms: string[] = [];
    try {
      if (Array.isArray(r.allowedPerms)) allowedPerms = r.allowedPerms;
      else if (typeof r.allowedPerms === 'string') allowedPerms = JSON.parse(r.allowedPerms);
    } catch {
      allowedPerms = [];
    }
    return {
      guildId: r.guildId,
      botId: r.botId,
      botName: r.botName,
      allowedPerms,
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

export interface PrebotBuilderState {
  guildId: string;
  botId: string;
  botName: string;
  selectedPerms: string[];
  createRole: boolean;
  roleName: string;
  roleColor: string;
  notes: string;
  addedBy: string;
  avatarUrl?: string | null;
}

export const activePrebotBuilders = new Map<string, PrebotBuilderState>();

export function buildPrebotBuilderEmbed(guild: any, state: PrebotBuilderState) {
  const permBadges = state.selectedPerms.length > 0
    ? state.selectedPerms.map(p => {
      const item = PREBOT_PERMISSIONS.find(item => item.key === p);
      return `\`${item?.label || p}\``;
    }).join(', ')
    : '**No permissions selected (Least Privilege)**';

  const desc = [
    `__**PREBOT WHITELIST CONFIGURATION**__\n`,
    `**RAGE OPTIMISER** • **${guild.name}**\n`,
    `> Pre-register trusted bot **<@${state.botId}>** (\`${state.botName}\`) before it enters the server.`,
    `> Defines exact permission profile applied automatically upon bot arrival.\n`,
    `**Bot Target**: <@${state.botId}> (\`${state.botId}\`)`,
    `**Dedicated Role**: ${state.createRole ? `${VERIFIED_ICON} Enabled (\`${state.roleName}\`)` : `${WRONG_ICON} Disabled`}`,
    `**Notes**: ${state.notes ? state.notes : '**None provided**'}\n`,
    `**Approved Permission Profile (${state.selectedPerms.length}/${PREBOT_PERMISSIONS.length})**:`,
    `> ${permBadges}`
  ].join('\n');

  return new EmbedBuilder()
    .setColor(Colors.BRAND)
    .setTitle(`${BOT_ICON} PreBot Security Builder — ${state.botName}`)
    .setDescription(desc)
    .setThumbnail(state.avatarUrl || null)
    .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
    .setTimestamp();
}

export function buildPrebotBuilderComponents(state: PrebotBuilderState) {
  const mid = Math.ceil(PREBOT_PERMISSIONS.length / 2);
  const part1 = PREBOT_PERMISSIONS.slice(0, mid);
  const part2 = PREBOT_PERMISSIONS.slice(mid);

  const select1 = new StringSelectMenuBuilder()
    .setCustomId(`prebot_perm_sel1_${state.botId}_${state.addedBy}`)
    .setPlaceholder('⚙️ Select General & Messaging Permissions…')
    .setMinValues(0)
    .setMaxValues(part1.length)
    .addOptions(
      part1.map(p =>
        new StringSelectMenuOptionBuilder()
          .setLabel(p.label)
          .setValue(p.key)
          .setDescription(p.desc)
          .setDefault(state.selectedPerms.includes(p.key))
      )
    );

  const select2 = new StringSelectMenuBuilder()
    .setCustomId(`prebot_perm_sel2_${state.botId}_${state.addedBy}`)
    .setPlaceholder('⚙️ Select Moderation & Admin Permissions…')
    .setMinValues(0)
    .setMaxValues(part2.length)
    .addOptions(
      part2.map(p =>
        new StringSelectMenuOptionBuilder()
          .setLabel(p.label)
          .setValue(p.key)
          .setDescription(p.desc)
          .setDefault(state.selectedPerms.includes(p.key))
      )
    );

  const rowSelect1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select1);
  const rowSelect2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select2);

  const btnRoleToggle = new ButtonBuilder()
    .setCustomId(`prebot_btn_role_${state.botId}_${state.addedBy}`)
    .setLabel(state.createRole ? 'Dedicated Role: ON' : 'Dedicated Role: OFF')
    .setStyle(state.createRole ? ButtonStyle.Success : ButtonStyle.Secondary);

  const btnSave = new ButtonBuilder()
    .setCustomId(`prebot_btn_save_${state.botId}_${state.addedBy}`)
    .setLabel('Save PreBot Whitelist')
    .setStyle(ButtonStyle.Primary);

  const btnCancel = new ButtonBuilder()
    .setCustomId(`prebot_btn_cancel_${state.botId}_${state.addedBy}`)
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Danger);

  const rowButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(btnRoleToggle, btnSave, btnCancel);

  return [rowSelect1, rowSelect2, rowButtons];
}

async function safelyRespondPrebot(interaction: any, payload: any) {
  if (interaction.replied || interaction.deferred) {
    return interaction.editReply(payload).catch((err: any) => {
      console.warn('[prebot_whitelist] editReply error:', err?.message || err);
    });
  }
  if (typeof interaction.update === 'function') {
    return interaction.update(payload).catch(async () => {
      return interaction.editReply(payload).catch(() => {});
    });
  }
  return interaction.editReply(payload).catch(() => {});
}

export async function handlePrebotComponentInteraction(interaction: any, context?: any) {
  const guild = interaction.guild;
  if (!guild) return;

  const isAuthorized = await isOwnerOrExtraOwner(interaction.user.id, guild);
  if (!isAuthorized) {
    const errEmbed = new EmbedBuilder()
      .setTitle('🔒 Access Denied')
      .setColor(Colors.DANGER)
      .setDescription('PreBot Whitelist management is strictly restricted to the **Server Owner** and **Extra Owners**.')
      .setTimestamp();
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp({ embeds: [errEmbed], flags: 64 }).catch(() => {});
    }
    return interaction.reply({ embeds: [errEmbed], flags: 64 }).catch(() => {});
  }

  const customId = interaction.customId || '';
  const parts = customId.split('_');
  const botId = parts[3];
  if (!botId) return;

  // 1. CANCEL BUTTON
  if (customId.startsWith('prebot_btn_cancel_')) {
    activePrebotBuilders.delete(`${guild.id}_${botId}`);
    const cancelEmbed = new EmbedBuilder()
      .setTitle('❌ Setup Cancelled')
      .setColor(Colors.DANGER)
      .setDescription(`PreBot Whitelist setup for **<@${botId}>** was cancelled.`)
      .setTimestamp();
    return safelyRespondPrebot(interaction, { embeds: [cancelEmbed], components: [] });
  }

  // Retrieve or reconstruct builder state
  let state = activePrebotBuilders.get(`${guild.id}_${botId}`);
  if (!state) {
    const existing = await getPrebotEntry(guild.id, botId);
    const botUser = interaction.client.users.cache.get(botId) || await interaction.client.users.fetch(botId).catch(() => null);
    const botName = botUser?.username || existing?.botName || `Bot-${botId}`;
    state = {
      guildId: guild.id,
      botId,
      botName,
      selectedPerms: existing ? [...existing.allowedPerms] : ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
      createRole: existing ? existing.createRole : true,
      roleName: existing?.roleName || `[Trusted] ${botName}`,
      roleColor: existing?.roleColor || '#99CC00',
      notes: existing?.notes || '',
      addedBy: parts[4] || interaction.user.id,
      avatarUrl: botUser?.displayAvatarURL?.({ size: 256 }) || null
    };
    activePrebotBuilders.set(`${guild.id}_${botId}`, state);
  }

  // 2. ROLE TOGGLE BUTTON
  if (customId.startsWith('prebot_btn_role_')) {
    state.createRole = !state.createRole;
    activePrebotBuilders.set(`${guild.id}_${botId}`, state);
    const embed = buildPrebotBuilderEmbed(guild, state);
    const components = buildPrebotBuilderComponents(state);
    return safelyRespondPrebot(interaction, { embeds: [embed], components });
  }

  // 3. SAVE PREBOT BUTTON
  if (customId.startsWith('prebot_btn_save_')) {
    activePrebotBuilders.delete(`${guild.id}_${botId}`);
    const newEntry: PreBotEntry = {
      guildId: guild.id,
      botId: state.botId,
      botName: state.botName,
      allowedPerms: state.selectedPerms,
      createRole: state.createRole,
      roleName: state.createRole ? state.roleName : undefined,
      roleColor: state.createRole ? state.roleColor : undefined,
      addedBy: interaction.user.id,
      addedAt: Date.now(),
      notes: state.notes
    };

    await savePrebotEntry(newEntry);
    context?.logSyncEvent?.(guild.id, `✅ [PreBot Whitelist]: Pre-approved bot ${state.botName} (${state.botId}) with ${state.selectedPerms.length} allowed permissions.`, 'success');

    const successEmbed = new EmbedBuilder()
      .setColor(Colors.SUCCESS)
      .setTitle(`${BOT_ICON} PreBot Whitelist — Saved`)
      .setDescription([
        `${VERIFIED_ICON} **Bot <@${state.botId}>** (\`${state.botName}\`) has been successfully registered in the **PreBot Whitelist**.`,
        `When this bot enters **${guild.name}**, ${SHIELD_ICON} Rage Optimiser will instantly verify it, strip unauthorized roles, and enforce this custom profile.`,
        `${ARROW_ICON} **Allowed Permissions**: ${state.selectedPerms.length > 0 ? state.selectedPerms.map(p => '`' + p + '`').join(', ') : 'None'}`,
        `${ARROW_ICON} **Dedicated Trusted Role**: ${state.createRole ? '`' + state.roleName + '`' : 'Disabled'}`
      ].join('\n'))
      .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
      .setTimestamp();

    return safelyRespondPrebot(interaction, { embeds: [successEmbed], components: [] });
  }

  // 4. SELECT PERMISSIONS MENUS
  if (interaction.isStringSelectMenu && interaction.isStringSelectMenu()) {
    const values = interaction.values || [];
    if (customId.startsWith('prebot_perm_sel1_')) {
      const part1Keys = PREBOT_PERMISSIONS.slice(0, Math.ceil(PREBOT_PERMISSIONS.length / 2)).map(p => p.key);
      state.selectedPerms = [...state.selectedPerms.filter(p => !part1Keys.includes(p)), ...values];
    } else if (customId.startsWith('prebot_perm_sel2_')) {
      const part2Keys = PREBOT_PERMISSIONS.slice(Math.ceil(PREBOT_PERMISSIONS.length / 2)).map(p => p.key);
      state.selectedPerms = [...state.selectedPerms.filter(p => !part2Keys.includes(p)), ...values];
    }

    activePrebotBuilders.set(`${guild.id}_${botId}`, state);
    const embed = buildPrebotBuilderEmbed(guild, state);
    const components = buildPrebotBuilderComponents(state);
    return safelyRespondPrebot(interaction, { embeds: [embed], components });
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

  const state: PrebotBuilderState = {
    guildId: guild.id,
    botId,
    botName,
    selectedPerms: existingEntry ? [...existingEntry.allowedPerms] : ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
    createRole: existingEntry ? existingEntry.createRole : true,
    roleName: existingEntry?.roleName || `[Trusted] ${botName}`,
    roleColor: existingEntry?.roleColor || '#99CC00',
    notes: existingEntry?.notes || '',
    addedBy: interaction.user.id,
    avatarUrl: botUser.displayAvatarURL({ size: 256 }) || null
  };

  activePrebotBuilders.set(`${guild.id}_${botId}`, state);

  const buildEmbed = () => buildPrebotBuilderEmbed(guild, state);
  const buildComponents = () => buildPrebotBuilderComponents(state);

  let responseMsg = await interaction.editReply({
    embeds: [buildEmbed()],
    components: buildComponents()
  }).catch(() => null);

  if (!responseMsg && interaction.channel) {
    responseMsg = await interaction.channel.send({
      embeds: [buildEmbed()],
      components: buildComponents()
    }).catch(() => null);
  }

  if (!responseMsg) {
    console.error('[launchPrebotBuilder] Failed to dispatch builder message to channel.');
    return;
  }
}

export function registerPrebotCommands(): void {
  PrefixRegistry.register({
    name: 'prebot',
    category: 'Security',
    description: 'Confidential PreBot Whitelist Management (Server Owner & Extra Owner Only)',
    usage: 'r!prebot <add|remove|list|info> [bot]',
    aliases: ['prebotwhitelist', 'prebotlist', 'prebot-list', 'botwhitelist', 'bwl', 'whitelistbot', 'pb'],
    cooldownSeconds: 3,
    examples: ['r!prebot add 1234567890', 'r!prebot list'],
    moduleOwnerId: 'prebot_whitelist',
    dangerLevel: 'High',
    hidden: true, // Confidential — Excluded from r!help, autocomplete & public listings
    execute: async (message: Message, args: string[], extra?: any) => {
      const safeReply = async (opts: any) => {
        try {
          return await message.reply(opts);
        } catch {
          return await (message.channel as any)?.send(opts).catch(() => null);
        }
      };

      const guild = message.guild;
      if (!guild) return safeReply('This command can only be executed in a server.');

      const isAuthorized = await isOwnerOrExtraOwner(message.author.id, guild);
      if (!isAuthorized) {
        const denEmbed = createLimeEmbed({
          title: 'Confidential Command Access Denied',
          description: `${WRONG_ICON} **Confidential Security Feature**: PreBot Whitelist management is strictly restricted to the **Server Owner** (<@${guild.ownerId}>) and designated **Extra Owners**.\n\n*This secret management suite is not accessible by regular members or administrators.*`
        });
        return safeReply({ embeds: [denEmbed] });
      }

      const sub = args[0]?.toLowerCase() || 'list';

      if (sub === '2fa') {
        if (message.author.id !== guild.ownerId) {
          return safeReply({
            embeds: [new EmbedBuilder()
              .setTitle(`${WRONG_ICON} Server Owner Access Restricted`)
              .setColor(Colors.DANGER)
              .setDescription(`${WRONG_ICON} PreBot Whitelist 2FA configuration is strictly restricted to the **Server Owner** (<@${guild.ownerId}>). Extra Owners cannot configure server 2FA settings.`)
              .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
              .setTimestamp()]
          });
        }

        const action = args[1]?.toLowerCase() || 'status';

        if (['set', 'setup', 'on', 'create'].includes(action)) {
          const pinArg = args[2] || args.find(a => /^\d{6}$/.test(a.trim()));
          if (!pinArg || !/^\d{6}$/.test(pinArg.trim())) {
            return safeReply(`${WRONG_ICON} Please specify a valid 6-digit passcode. Example: \`r!prebot 2fa set 123456\``);
          }

          await TwoFactorManager.savePrebot2FAConfig(guild.id, message.author.id, pinArg.trim(), true);
          if (message.deletable) message.delete().catch(() => {});

          const dismissRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`btn_dismiss_${message.author.id}`)
              .setLabel('Dismiss Message')
              .setStyle(ButtonStyle.Danger)
          );

          return safeReply({
            embeds: [new EmbedBuilder()
              .setTitle(`${VERIFIED_ICON} PreBot 2FA Passcode Set & Activated!`)
              .setColor(Colors.SUCCESS)
              .setDescription([
                `**Server**: \`${guild.name}\``,
                `**Passcode**: \`•••••• (Hidden for Security)\``,
                `**Security Status**: ${VERIFIED_ICON} **ENABLED (Active)**`,
                `\nAll future PreBot additions (\`r!prebot add\`, \`r!prebot quickadd\`) will now require this 6-digit passcode.`
              ].join('\n'))
              .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
              .setTimestamp()],
            components: [dismissRow]
          });
        }

        if (['change', 'update', 'edit'].includes(action)) {
          const cfg = await TwoFactorManager.getPrebot2FAConfig(guild.id);
          if (!cfg || !cfg.pin) {
            return safeReply(`${WRONG_ICON} No passcode is currently set. Use \`r!prebot 2fa set <6-digit-pin>\` to set one.`);
          }

          const oldPin = args[2];
          const newPin = args[3];

          if (!oldPin || !newPin || !/^\d{6}$/.test(oldPin.trim()) || !/^\d{6}$/.test(newPin.trim())) {
            return safeReply(`${WRONG_ICON} Please specify both your current passcode and your new 6-digit passcode. Example: \`r!prebot 2fa change <old-pin> <new-pin>\``);
          }

          if (!TwoFactorManager.verifyPin(cfg.pin, oldPin)) {
            return safeReply(`${WRONG_ICON} Existing passcode verification failed. Incorrect current passcode.`);
          }

          await TwoFactorManager.savePrebot2FAConfig(guild.id, message.author.id, newPin.trim(), true);
          if (message.deletable) message.delete().catch(() => {});

          const dismissRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`btn_dismiss_${message.author.id}`)
              .setLabel('Dismiss Message')
              .setStyle(ButtonStyle.Danger)
          );

          return safeReply({
            embeds: [new EmbedBuilder()
              .setTitle(`${VERIFIED_ICON} PreBot 2FA Passcode Updated!`)
              .setColor(Colors.SUCCESS)
              .setDescription(`Your 6-digit PreBot 2FA passcode has been successfully updated and masked.`)
              .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
              .setTimestamp()],
            components: [dismissRow]
          });
        }

        if (['off', 'disable'].includes(action)) {
          const cfg = await TwoFactorManager.getPrebot2FAConfig(guild.id);
          if (!cfg || !cfg.isEnabled) {
            return safeReply(`${WRONG_ICON} PreBot Whitelist 2FA protection is not currently enabled for this server.`);
          }

          const pinArg = args[2] || args.find(a => /^\d{6}$/.test(a.trim()));
          if (!pinArg) {
            return safeReply(`${WRONG_ICON} Please provide your 6-digit passcode to disable 2FA. Example: \`r!prebot 2fa off 123456\``);
          }

          if (!TwoFactorManager.verifyPin(cfg.pin, pinArg)) {
            return safeReply({
              embeds: [new EmbedBuilder()
                .setTitle(`${WRONG_ICON} 2FA Verification Failed`)
                .setColor(Colors.DANGER)
                .setDescription(`Invalid 6-digit passcode. Unable to disable 2FA protection.`)
                .setTimestamp()]
            });
          }

          await TwoFactorManager.setPrebot2FAEnabled(guild.id, false);
          return safeReply({
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
        const hasPin = cfg ? Boolean(cfg.pin) : false;

        return safeReply({
          embeds: [new EmbedBuilder()
            .setTitle(`${SHIELD_ICON} PreBot Whitelist 2FA Security Status`)
            .setColor(isEnabled ? Colors.SUCCESS : Colors.INFO)
            .setDescription([
              `**Server**: \`${guild.name}\``,
              `**Security Status**: ${isEnabled ? `${VERIFIED_ICON} **ENABLED (Active)**` : `${WRONG_ICON} **DISABLED (Inactive)**`}`,
              `**Passcode Configured**: ${hasPin ? `${VERIFIED_ICON} **Passcode Set**` : `${WARNING_ICON} **No Passcode Set**`}`,
              `**Managed By**: Server Owner (<@${guild.ownerId}>)`,
              `\n**Management Commands**:`,
              `${ARROW_ICON} \`r!prebot 2fa set <6-digit-pin>\` — Set your custom 6-digit passcode & enable 2FA`,
              `${ARROW_ICON} \`r!prebot 2fa change <old-pin> <new-pin>\` — Change your existing 6-digit passcode`,
              `${ARROW_ICON} \`r!prebot 2fa off <6-digit-pin>\` — Disable 2FA enforcement`
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
            return safeReply({
              embeds: [new EmbedBuilder()
                .setTitle(`${SHIELD_ICON} 2FA Passcode Required`)
                .setColor(Colors.WARN)
                .setDescription([
                  `**RAGE OPTIMISER** • **Zero-Trust Security Gate**`,
                  `\nPreBot Whitelist 2FA protection is **ENABLED** for **${guild.name}**.`,
                  `\nPlease supply your 6-digit passcode to authorize this bot addition:\n`,
                  `> \`r!prebot quickadd ${targetMention} <6-digit-pin>\``,
                  `> \`r!prebot add ${targetMention} <6-digit-pin>\``
                ].join('\n'))
                .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
                .setTimestamp()]
            });
          }

          const isValid = TwoFactorManager.verifyPin(tfaCfg.pin, codeArg);
          if (!isValid) {
            return safeReply({
              embeds: [new EmbedBuilder()
                .setTitle(`${WRONG_ICON} 2FA Passcode Verification Failed`)
                .setColor(Colors.DANGER)
                .setDescription(`The 6-digit passcode provided is **invalid**. Access Denied.`)
                .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
                .setTimestamp()]
            });
          }
        }
      }

      if (sub === 'add' || sub === 'edit') {
        const targetUser = message.mentions.users.first() || (args[1] ? await message.client.users.fetch(args[1]).catch(() => null) : null);
        if (!targetUser) {
          return safeReply(`${WRONG_ICON} Please specify a bot user. Example: \`r!prebot add @BotName\` or \`r!prebot add 1234567890\``);
        }
        if (!targetUser.bot) {
          return safeReply(`${WRONG_ICON} Target user **<@${targetUser.id}>** is not a Discord bot application.`);
        }

        const syntheticInteraction = {
          guild,
          user: message.author,
          channel: message.channel,
          deferReply: async () => { },
          editReply: async (opts: any) => safeReply(opts),
          reply: async (opts: any) => safeReply(opts),
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
          return safeReply(`${WRONG_ICON} Please specify a bot user to quick-add. Example: \`r!prebot quickadd @BotName\``);
        }
        if (!targetUser.bot) {
          return safeReply(`${WRONG_ICON} Target user **<@${targetUser.id}>** is not a Discord bot application.`);
        }

        const defaultPerms = ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles', 'ManageChannels', 'ManageRoles', 'Connect', 'Speak', 'ManageMessages'];
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
        const successEmbed = new EmbedBuilder()
          .setTitle(`${BOT_ICON} PreBot Whitelist — Quick Added`)
          .setColor(Colors.SUCCESS)
          .setDescription([
            `${VERIFIED_ICON} **Bot <@${targetUser.id}>** (\`${targetUser.username}\`) has been successfully registered in the **PreBot Whitelist**.`,
            `When this bot enters **${guild.name}**, ${SHIELD_ICON} Rage Optimiser will instantly verify it, strip unauthorized roles, and enforce this custom profile.`,
            `\n${ARROW_ICON} **Allowed Permissions**: \`ViewChannel\`, \`SendMessages\`, \`ReadMessageHistory\`, \`EmbedLinks\`, \`AttachFiles\``,
            `${ARROW_ICON} **Dedicated Trusted Role**: \`[Trusted] ${targetUser.username}\``
          ].join('\n'))
          .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
          .setTimestamp();
        return safeReply({ embeds: [successEmbed] });
      }

      if (sub === 'remove') {
        const targetUser = message.mentions.users.first() || (args[1] ? await message.client.users.fetch(args[1]).catch(() => null) : null);
        if (!targetUser) {
          return safeReply(`${WRONG_ICON} Please specify a bot to remove. Example: \`r!prebot remove @BotName\``);
        }

        const removed = await deletePrebotEntry(guild.id, targetUser.id);
        if (!removed) {
          return safeReply(`${WRONG_ICON} Bot **<@${targetUser.id}>** is not in the PreBot Whitelist.`);
        }

        const removeEmbed = new EmbedBuilder()
          .setTitle(`${BOT_ICON} PreBot Whitelist — Bot Removed`)
          .setColor(Colors.SUCCESS)
          .setDescription([
            `${WRONG_ICON} **Bot <@${targetUser.id}>** (\`${targetUser.username}\`) has been removed from the **PreBot Whitelist**.`,
            `When this bot enters **${guild.name}**, ${SHIELD_ICON} Rage Optimiser will treat it as unauthorized and enforce zero-trust security restrictions.`
          ].join('\n'))
          .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
          .setTimestamp();
        return safeReply({ embeds: [removeEmbed] });
      }

      if (['list', 'show', 'view', 'all'].includes(sub)) {
        const entries = await getPrebotEntries(guild.id);
        if (entries.length === 0) {
          return safeReply({
            embeds: [new EmbedBuilder()
              .setTitle(`${BOT_ICON} PreBot Whitelist — Registry`)
              .setColor(Colors.SUCCESS)
              .setDescription([
                `${INFO_ICON} **No bots pre-registered in this server.**`,
                `When an un-registered bot enters **${guild.name}**, ${SHIELD_ICON} Rage Optimiser's Zero-Trust architecture will instantly ban it on join.`,
                `\n**How to Pre-Approve a Bot**:`,
                `${ARROW_ICON} Use \`r!prebot add <@bot|id>\` to configure custom permissions.`,
                `${ARROW_ICON} Use \`r!prebot quickadd <@bot|id>\` for instant default permissions.`
              ].join('\n'))
              .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
              .setTimestamp()]
          });
        }

        const lines = entries.map((e, idx) => {
          const roleStr = e.createRole ? `\`${e.roleName}\`` : '`Disabled`';
          const permsFormatted = e.allowedPerms && e.allowedPerms.length > 0
            ? e.allowedPerms.map(p => `\`${p}\``).join(', ')
            : '`None`';
          return [
            `${VERIFIED_ICON} **${idx + 1}. Bot <@${e.botId}>** (\`${e.botName || e.botId}\`)`,
            `   ${ARROW_ICON} **Dedicated Trusted Role**: ${roleStr}`,
            `   ${ARROW_ICON} **Allowed Permissions**: ${permsFormatted}`
          ].join('\n');
        }).join('\n\n');

        return safeReply({
          embeds: [new EmbedBuilder()
            .setTitle(`${BOT_ICON} PreBot Whitelist — Registry (${entries.length})`)
            .setColor(Colors.SUCCESS)
            .setDescription([
              `The following bots are pre-approved to join **${guild.name}**. Unauthorized bots will be banned immediately.`,
              `\n${lines}`,
              `\n${ARROW_ICON} Use \`r!prebot info <@bot|id>\` to inspect full bot profile.`,
              `${ARROW_ICON} Use \`r!prebot remove <@bot|id>\` to revoke pre-approval.`
            ].join('\n'))
            .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
            .setTimestamp()]
        });
      }

      if (sub === 'info') {
        const targetUser = message.mentions.users.first() || (args[1] ? await message.client.users.fetch(args[1]).catch(() => null) : null);
        if (!targetUser) {
          return safeReply(`${WRONG_ICON} Please specify a bot. Example: \`r!prebot info @BotName\``);
        }

        const entry = await getPrebotEntry(guild.id, targetUser.id);
        if (!entry) {
          return safeReply(`${WRONG_ICON} Bot **<@${targetUser.id}>** is not registered in the PreBot Whitelist.`);
        }

        return safeReply({
          embeds: [new EmbedBuilder()
            .setTitle(`${BOT_ICON} PreBot Whitelist — ${entry.botName}`)
            .setColor(Colors.SUCCESS)
            .setThumbnail(targetUser.displayAvatarURL({ size: 256 }) || null)
            .setDescription([
              `**Bot <@${entry.botId}>** (\`${entry.botId}\`) profile specifications for **${guild.name}**:`,
              `\n${ARROW_ICON} **Registered By**: <@${entry.addedBy}>`,
              `${ARROW_ICON} **Registered At**: <t:${Math.floor(entry.addedAt / 1000)}:F>`,
              `${ARROW_ICON} **Allowed Permissions**: ${entry.allowedPerms.length > 0 ? entry.allowedPerms.map(p => `\`${p}\``).join(', ') : '`None`'}`,
              `${ARROW_ICON} **Dedicated Trusted Role**: ${entry.createRole ? `\`${entry.roleName}\`` : '`Disabled`'}`,
              `${ARROW_ICON} **Notes**: ${entry.notes ? entry.notes : '**None**'}`
            ].join('\n'))
            .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
            .setTimestamp()]
        });
      }

      // Fallback: Help & Command Syntax Manual
      return safeReply({
        embeds: [new EmbedBuilder()
          .setTitle(`${SHIELD_ICON} PreBot Whitelist — Command Manual`)
          .setColor(Colors.SUCCESS)
          .setDescription([
            `Under ${SHIELD_ICON} Rage Optimiser's **Zero-Trust Security Architecture**, all bots must be pre-approved with an explicit permission profile prior to joining **${guild.name}**.\n`,
            `**Available Commands**:`,
            `${ARROW_ICON} \`r!prebot list\` — View all pre-approved bot applications`,
            `${ARROW_ICON} \`r!prebot add <@bot|id>\` — Pre-approve bot with custom permissions`,
            `${ARROW_ICON} \`r!prebot quickadd <@bot|id>\` — Fast default permission profile`,
            `${ARROW_ICON} \`r!prebot remove <@bot|id>\` — Revoke bot pre-approval`,
            `${ARROW_ICON} \`r!prebot info <@bot|id>\` — Inspect a bot's permission profile`,
            `${ARROW_ICON} \`r!prebot 2fa <set|change|off|status>\` — Mandatory 2FA passcode gate`
          ].join('\n'))
          .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
          .setTimestamp()]
      });
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
              `**PreBot Whitelist Guard**: **${isEnabled ? `${VERIFIED_ICON} ENABLED (ACTIVE)` : `${WRONG_ICON} DISABLED (INACTIVE)`}**`,
              `\n${isEnabled ? 'Un-registered bots will be automatically kicked on join.' : 'Bot join enforcement is paused. Bots can join freely without pre-registration.'}`
            ].join('\n'))
            .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] }).catch(() => {});
        }

        const is2FAAction = ['2fa', 'confirm', 'setup', 'change', 'set'].includes(sub);

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

          const posArgs: string[] = interaction.parsed?.args || [];

          let action = interaction.options.getString('action', false)?.toLowerCase() || '';
          if (!action || action === '2fa') {
            const pos1 = posArgs[1]?.toLowerCase();
            if (pos1 && ['set', 'setup', 'on', 'create', 'change', 'update', 'edit', 'off', 'disable', 'status'].includes(pos1)) {
              action = pos1;
            }
          }
          if (sub === 'setup' || sub === 'set') action = 'set';
          if (sub === 'change') action = 'change';
          if (sub === 'disable') action = 'disable';
          if (!action || action === '2fa') action = sub !== '2fa' ? sub : 'status';

          // Extract strict 6-digit passcode candidate
          const rawCode = interaction.options.getString('code', false);
          let codeInput = (rawCode && /^\d{6}$/.test(rawCode.trim())) ? rawCode.trim() : '';
          if (!codeInput) {
            const codeCandidate = posArgs.find((a: string) => /^\d{6}$/.test(a.trim()));
            if (codeCandidate) codeInput = codeCandidate.trim();
          }

          if (['set', 'setup', 'on', 'create'].includes(action)) {
            if (!codeInput || !/^\d{6}$/.test(codeInput.trim())) {
              const errEmbed = new EmbedBuilder()
                .setTitle(`${WRONG_ICON} Missing 6-Digit Passcode`)
                .setColor(Colors.DANGER)
                .setDescription('Please specify a valid 6-digit passcode: `r!prebot 2fa set 123456`');
              return interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
            }

            await TwoFactorManager.savePrebot2FAConfig(guild.id, interaction.user.id, codeInput.trim(), true);
            const dismissRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`btn_dismiss_${interaction.user.id}`)
                .setLabel('Dismiss Message')
                .setStyle(ButtonStyle.Danger)
            );

            const successEmbed = new EmbedBuilder()
              .setTitle(`${VERIFIED_ICON} PreBot 2FA Passcode Set & Activated!`)
              .setColor(Colors.SUCCESS)
              .setDescription([
                `**Server**: \`${guild.name}\``,
                `**Passcode**: \`•••••• (Hidden for Security)\``,
                `**Security Status**: ${VERIFIED_ICON} **ENABLED (Active)**`,
                `\nAll future PreBot additions will now require this 6-digit passcode.`
              ].join('\n'))
              .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
              .setTimestamp();

            return interaction.editReply({ embeds: [successEmbed], components: [dismissRow] }).catch(() => { });
          }

          if (['change', 'update', 'edit'].includes(action)) {
            const cfg = await TwoFactorManager.getPrebot2FAConfig(guild.id);
            if (!cfg || !cfg.pin) {
              const errEmbed = new EmbedBuilder()
                .setTitle(`${WRONG_ICON} Passcode Not Set`)
                .setColor(Colors.DANGER)
                .setDescription('No passcode is currently set. Use `r!prebot 2fa set <6-digit-pin>` to set one.');
              return interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
            }

            const sixDigitMatches = posArgs.filter((a: string) => /^\d{6}$/.test(a.trim()));
            const oldPin = sixDigitMatches[0];
            const newPin = sixDigitMatches[1] || codeInput;

            if (!oldPin || !newPin) {
              const errEmbed = new EmbedBuilder()
                .setTitle(`${WRONG_ICON} Missing Parameters`)
                .setColor(Colors.DANGER)
                .setDescription('Please specify both your current passcode and your new 6-digit passcode: `r!prebot 2fa change <old-pin> <new-pin>`');
              return interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
            }

            if (!TwoFactorManager.verifyPin(cfg.pin, oldPin)) {
              const errEmbed = new EmbedBuilder()
                .setTitle(`${WRONG_ICON} Verification Failed`)
                .setColor(Colors.DANGER)
                .setDescription('Existing passcode verification failed. Incorrect current passcode.');
              return interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
            }

            await TwoFactorManager.savePrebot2FAConfig(guild.id, interaction.user.id, newPin.trim(), true);
            const dismissRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`btn_dismiss_${interaction.user.id}`)
                .setLabel('Dismiss Message')
                .setStyle(ButtonStyle.Danger)
            );

            const successEmbed = new EmbedBuilder()
              .setTitle(`${VERIFIED_ICON} PreBot 2FA Passcode Updated!`)
              .setColor(Colors.SUCCESS)
              .setDescription(`Your 6-digit PreBot 2FA passcode has been successfully updated and masked.`)
              .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
              .setTimestamp();
            return interaction.editReply({ embeds: [successEmbed], components: [dismissRow] }).catch(() => { });
          }

          if (['off', 'disable'].includes(action)) {
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
                .setTitle(`${WRONG_ICON} Missing Passcode`)
                .setColor(Colors.DANGER)
                .setDescription('Please provide your 6-digit passcode to disable 2FA: `r!prebot 2fa disable 123456`');
              return interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
            }

            if (!TwoFactorManager.verifyPin(cfg.pin, codeInput)) {
              const errEmbed = new EmbedBuilder()
                .setTitle(`${WRONG_ICON} 2FA Verification Failed`)
                .setColor(Colors.DANGER)
                .setDescription('Invalid 6-digit passcode. Unable to disable 2FA protection.');
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
          const hasPin = cfg ? Boolean(cfg.pin) : false;

          const statusEmbed = new EmbedBuilder()
            .setTitle(`${SHIELD_ICON} PreBot Whitelist 2FA Security Status`)
            .setColor(isEnabled ? Colors.SUCCESS : Colors.INFO)
            .setDescription([
              `**Server**: \`${guild.name}\``,
              `**Security Status**: ${isEnabled ? `${VERIFIED_ICON} **ENABLED (Active)**` : `${WRONG_ICON} **DISABLED (Inactive)**`}`,
              `**Passcode Configured**: ${hasPin ? `${VERIFIED_ICON} **Passcode Set**` : `${WARNING_ICON} **No Passcode Set**`}`,
              `**Managed By**: Server Owner (<@${guild.ownerId}>)`,
              `\n**Management Commands**:`,
              `${ARROW_ICON} \`r!prebot 2fa set <6-digit-pin>\` — Set your custom 6-digit passcode & enable 2FA`,
              `${ARROW_ICON} \`r!prebot 2fa change <old-pin> <new-pin>\` — Change your existing 6-digit passcode`,
              `${ARROW_ICON} \`r!prebot 2fa off <6-digit-pin>\` — Disable 2FA enforcement`
            ].join('\n'))
            .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
            .setTimestamp();

          return interaction.editReply({ embeds: [statusEmbed] }).catch(() => { });
        }

        if (sub === 'add' || sub === 'edit' || sub === 'quickadd' || sub === 'quick') {
          const tfaCfg = await TwoFactorManager.getPrebot2FAConfig(guild.id);
          if (tfaCfg && tfaCfg.isEnabled) {
            const posArgs: string[] = interaction.parsed?.args || [];
            const rawCode = interaction.options.getString('code', false);
            let codeInput = (rawCode && /^\d{6}$/.test(rawCode.trim())) ? rawCode.trim() : '';
            if (!codeInput) {
              const codeCandidate = posArgs.find((a: string) => /^\d{6}$/.test(a.trim()));
              if (codeCandidate) codeInput = codeCandidate.trim();
            }

            if (!codeInput) {
              const reqEmbed = new EmbedBuilder()
                .setTitle(`${SHIELD_ICON} 2FA Passcode Required`)
                .setColor(Colors.WARN)
                .setDescription([
                  `**RAGE OPTIMISER** • **Zero-Trust Security Gate**`,
                  `\nPreBot Whitelist 2FA protection is **ENABLED** for **${guild.name}**.`,
                  `\nPlease supply your 6-digit passcode to authorize this bot addition:\n`,
                  `> \`r!prebot quickadd @Bot <6-digit-pin>\``,
                  `> \`r!prebot add @Bot <6-digit-pin>\``
                ].join('\n'))
                .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
                .setTimestamp();
              return interaction.editReply({ embeds: [reqEmbed] }).catch(() => { });
            }

            if (!TwoFactorManager.verifyPin(tfaCfg.pin, codeInput)) {
              const errEmbed = new EmbedBuilder()
                .setTitle(`${WRONG_ICON} 2FA Verification Failed`)
                .setColor(Colors.DANGER)
                .setDescription('The 6-digit passcode provided is **invalid**. Access Denied.')
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

          const defaultPerms = ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles', 'ManageChannels', 'ManageRoles', 'Connect', 'Speak', 'ManageMessages'];
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
            .setTitle(`${BOT_ICON} PreBot Whitelist — Quick Added`)
            .setColor(Colors.SUCCESS)
            .setDescription([
              `${VERIFIED_ICON} **Bot <@${botUser.id}>** (\`${botUser.username}\`) has been successfully registered in the **PreBot Whitelist**.`,
              `When this bot enters **${guild.name}**, ${SHIELD_ICON} Rage Optimiser will instantly verify it, strip unauthorized roles, and enforce this custom profile.`,
              `\n${ARROW_ICON} **Allowed Permissions**: \`ViewChannel\`, \`SendMessages\`, \`ReadMessageHistory\`, \`EmbedLinks\`, \`AttachFiles\``,
              `${ARROW_ICON} **Dedicated Trusted Role**: \`[Trusted] ${botUser.username}\``
            ].join('\n'))
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
            .setTitle(`${BOT_ICON} PreBot Whitelist — Bot Removed`)
            .setColor(Colors.SUCCESS)
            .setDescription([
              `${WRONG_ICON} **Bot <@${botUser.id}>** (\`${botUser.username}\`) has been removed from the **PreBot Whitelist**.`,
              `When this bot enters **${guild.name}**, ${SHIELD_ICON} Rage Optimiser will treat it as unauthorized and enforce zero-trust security restrictions.`
            ].join('\n'))
            .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
            .setTimestamp();
          return interaction.editReply({ embeds: [successEmbed] }).catch(() => { });
        }

        if (sub === 'list') {
          const entries = await getPrebotEntries(guild.id);
          if (entries.length === 0) {
            const emptyEmbed = new EmbedBuilder()
              .setTitle(`${BOT_ICON} PreBot Whitelist — Registry`)
              .setColor(Colors.SUCCESS)
              .setDescription([
                `${INFO_ICON} **No bots pre-registered in this server.**`,
                `When an un-registered bot enters **${guild.name}**, ${SHIELD_ICON} Rage Optimiser's Zero-Trust architecture will instantly ban it on join.`,
                `\n**How to Pre-Approve a Bot**:`,
                `${ARROW_ICON} Use \`/prebot add bot:@BotName\` to configure custom permissions.`,
                `${ARROW_ICON} Use \`r!prebot quickadd <@bot|id>\` for instant default permissions.`
              ].join('\n'))
              .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
              .setTimestamp();
            return interaction.editReply({ embeds: [emptyEmbed] }).catch(() => { });
          }

          const lines = entries.map((e, idx) => {
            const roleStr = e.createRole ? `\`${e.roleName}\`` : '`Disabled`';
            const permsFormatted = e.allowedPerms && e.allowedPerms.length > 0
              ? e.allowedPerms.map(p => `\`${p}\``).join(', ')
              : '`None`';
            return [
              `${VERIFIED_ICON} **${idx + 1}. Bot <@${e.botId}>** (\`${e.botName || e.botId}\`)`,
              `   ${ARROW_ICON} **Dedicated Trusted Role**: ${roleStr}`,
              `   ${ARROW_ICON} **Allowed Permissions**: ${permsFormatted}`
            ].join('\n');
          }).join('\n\n');

          const listEmbed = new EmbedBuilder()
            .setTitle(`${BOT_ICON} PreBot Whitelist — Registry (${entries.length})`)
            .setColor(Colors.SUCCESS)
            .setDescription([
              `The following bots are pre-approved to join **${guild.name}**. Unauthorized bots will be banned immediately.`,
              `\n${lines}`,
              `\n${ARROW_ICON} Use \`/prebot info bot:@Bot\` to inspect full bot profile.`,
              `${ARROW_ICON} Use \`/prebot remove bot:@Bot\` to revoke pre-approval.`
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
            .setTitle(`${BOT_ICON} PreBot Whitelist — ${entry.botName}`)
            .setColor(Colors.SUCCESS)
            .setThumbnail(botUser.displayAvatarURL({ size: 256 }) || null)
            .setDescription([
              `**Bot <@${entry.botId}>** (\`${entry.botId}\`) profile specifications for **${guild.name}**:`,
              `\n${ARROW_ICON} **Registered By**: <@${entry.addedBy}>`,
              `${ARROW_ICON} **Registered At**: <t:${Math.floor(entry.addedAt / 1000)}:F>`,
              `${ARROW_ICON} **Allowed Permissions**: ${entry.allowedPerms.length > 0 ? entry.allowedPerms.map(p => `\`${p}\``).join(', ') : '`None`'}`,
              `${ARROW_ICON} **Dedicated Trusted Role**: ${entry.createRole ? `\`${entry.roleName}\`` : '`Disabled`'}`,
              `${ARROW_ICON} **Notes**: ${entry.notes ? entry.notes : '**None**'}`
            ].join('\n'))
            .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
            .setTimestamp();

          return interaction.editReply({ embeds: [infoEmbed] }).catch(() => { });
        }
      }
    },
    {
      name: 'button_prebot_generic',
      handler: async (client: any, interaction: any, context: any) => {
        return handlePrebotComponentInteraction(interaction, context);
      }
    },
    {
      name: 'select_prebot_generic',
      handler: async (client: any, interaction: any, context: any) => {
        return handlePrebotComponentInteraction(interaction, context);
      }
    }
  ]
};
