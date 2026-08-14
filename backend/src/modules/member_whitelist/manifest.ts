import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, Role, ButtonBuilder, ButtonStyle } from 'discord.js';
import { checkWhitelistPermission, getGuildAndCheckPermission, protections, migrateToUnifiedWhitelist, WHITELIST_MENU_OPTIONS, mapSelectedOptionsToRules, resolveSelectedOptions, getUnifiedWhitelistEntries } from '../../utils/whitelistCheck.js';
// BUG-008 FIX: Import the canonical wrapInteraction from Gateway to eliminate the
// copy-pasted duplicate that caused double-wrapping and divergent bug-fix paths.
import { wrapInteraction } from '../../core/Gateway.js';
function resolveUserTag(user: any): string {
  if (!user) return 'Unknown User';
  const tag = user.username;
  if (tag && tag !== 'undefined' && tag !== 'null' && !tag.includes('[object Object]')) return tag;
  const username = user.username;
  if (username && username !== 'undefined' && username !== 'null' && !username.includes('[object Object]')) return username;
  return `User-${user.id || 'unknown'}`;
}

function resolveRoleName(role: any): string {
  if (!role) return 'Unknown Role';
  const name = role.name;
  if (name && name !== 'undefined' && name !== 'null' && !name.includes('[object Object]')) return name;
  return `Role-${role.id || 'unknown'}`;
}

function sanitizeWhitelistMembers(members: any[]): any[] {
  if (!Array.isArray(members)) return [];
  return members.map(m => {
    if (m === null || typeof m !== 'object') return m;
    const cleaned: any = {};
    for (const key in m) {
      if (Object.prototype.hasOwnProperty.call(m, key) && m[key] !== undefined) {
        cleaned[key] = m[key];
      }
    }
    return cleaned;
  });
}

const PUNISHMENTS = [
  { value: 'quarantine',  label: 'Quarantine',  emoji: '<:shield:1532403012751065179>', desc: 'Strip all roles & isolate in quarantine channel' },
  { value: 'ban',         label: 'Ban',          emoji: '<:gavel:1532621057318584380>',  desc: 'Permanently ban the violator from the server' },
  { value: 'kick',        label: 'Kick',         emoji: '<:gavel:1532621057318584380>',  desc: 'Remove the violator from the server' },
  { value: 'strip_roles', label: 'Strip Roles',  emoji: '<:shield:1532403012751065179>', desc: 'Strip admin roles only, no further action' },
  { value: 'timeout',     label: 'Timeout',      emoji: '<:timer:1532620491662037123>',  desc: 'Temporary mute/timeout the violator' },
];
const P_EMOJI: Record<string, string> = {
  quarantine: '<:shield:1532403012751065179>',
  ban: '<:gavel:1532621057318584380>',
  kick: '<:gavel:1532621057318584380>',
  strip_roles: '<:shield:1532403012751065179>',
  timeout: '<:timer:1532620491662037123>'
};

function buildPunishEmbed(guild: any, rules: Record<string, any>) {
  const verifiedIcon = '<a:approved:1532390590707142956>';
  const midPoint = Math.ceil(protections.length / 2);
  const leftRules = protections.slice(0, midPoint);
  const rightRules = protections.slice(midPoint);

  const leftLines = leftRules.map(p => {
    const action = rules[p.key]?.action || 'quarantine';
    const on = rules[p.key]?.enabled !== false ? verifiedIcon : '🔴';
    return `${on} **${p.label}** — ${P_EMOJI[action] || '🔒'} \`${action.toUpperCase()}\``;
  }).join('\n');

  const rightLines = rightRules.map(p => {
    const action = rules[p.key]?.action || 'quarantine';
    const on = rules[p.key]?.enabled !== false ? verifiedIcon : '🔴';
    return `${on} **${p.label}** — ${P_EMOJI[action] || '🔒'} \`${action.toUpperCase()}\``;
  }).join('\n');

  return new EmbedBuilder()
    .setColor(0x84cc16)
    .setThumbnail(guild.iconURL({ size: 256 }) || null)
    .setDescription([
      `__**WHITELIST VIOLATION PUNISHMENTS**__\n`,
      `**RAGE OPTIMISER** • **${guild.name}**\n`,
      `> Configure the punishment applied to **non-whitelisted** members who trigger Anti-Nuke rules.`,
      `> Use the select menu below to change a rule's punishment type.`
    ].join('\n'))
    .addFields(
      { name: '🛡️ Rules & Punishments (Part 1)', value: leftLines || 'No rules configured.', inline: true },
      { name: '🛡️ Rules & Punishments (Part 2)', value: rightLines || 'No rules configured.', inline: true }
    )
    .setFooter({ text: 'Rage Optimiser • Security Engine' })
    .setTimestamp();
}

async function renderWhitelistConfigUI(
  interaction: any,
  context: any,
  target: any,
  notesInput?: string
) {
  if (!target) {
    const embedErr = new EmbedBuilder()
      .setColor(0xEF4444)
      .setDescription(`❌ ${interaction.user} Target entity not specified or not found.`);
    return interaction.editReply({ embeds: [embedErr] }).catch(() => {});
  }
  const targetId = target.id;
  const isRole = target instanceof Role || (target && (target.constructor?.name === 'Role' || (typeof target === 'object' && 'name' in target && !('user' in target) && !('username' in target))));
  const userOrRole = isRole ? target : (target.user || target);
  const type: 'member' | 'bot' | 'role' = isRole ? 'role' : (userOrRole?.bot ? 'bot' : 'member');
  const tagOrName = isRole ? resolveRoleName(target) : resolveUserTag(userOrRole);

  const modules = context.getModulesState ? context.getModulesState() : [];
  const mwModule = modules.find((m: any) => m && m.id === 'member_whitelist');
  let members = [...(mwModule?.config?.members || [])].filter(Boolean);
  const allBypasses = [...protections.map(p => p.key), 'voice_protection'];

  let record = members.find((e: any) => 
    isRole 
      ? (e.type === 'role' && (e.roleId === targetId || e.id === targetId))
      : (e.type !== 'role' && (e.userId === targetId || e.id === targetId))
  );

  let isNew = false;
  if (!record) {
    isNew = true;
    record = {
      id: targetId,
      ...(isRole ? { roleId: targetId, name: tagOrName } : { userId: targetId, tag: tagOrName, username: tagOrName }),
      status: 'active',
      type,
      enabledModules: allBypasses,
      notes: notesInput || '',
      createdDate: new Date().toISOString()
    };
    members.push(record);
    const sanitized = sanitizeWhitelistMembers(members);
    context.updateModuleConfig('member_whitelist', { members: sanitized });
    context.logSyncEvent(`[Global Whitelist] Added ${type} ${tagOrName} via unified command.`, 'success');

    if (type !== 'bot' && !isRole) {
      const secModule = modules.find((m: any) => m && m.id === 'security');
      if (secModule) {
        const secWhitelist = [...(secModule.config?.whitelist || [])].filter(Boolean);
        const isPresent = secWhitelist.some((w: any) => {
          if (!w) return false;
          const id = typeof w === 'string' ? w : w.targetId;
          return id === targetId;
        });
        if (!isPresent) {
          secWhitelist.push({
            targetId: targetId,
            tag: tagOrName,
            addedAt: new Date().toISOString()
          });
          context.updateModuleConfig('security', { ...secModule.config, whitelist: secWhitelist });
        }
      }
    }
  } else if (notesInput && !record.notes) {
    record.notes = notesInput;
    const sanitized = sanitizeWhitelistMembers(members);
    context.updateModuleConfig('member_whitelist', { members: sanitized });
  }

  let currentBypasses = Array.isArray(record.enabledModules) ? record.enabledModules : allBypasses;

  const securityKeys = [
    'anti_ban', 'anti_unban', 'anti_kick', 'anti_prune', 'anti_bot_add', 'anti_bot_remove',
    'anti_channel_create', 'anti_channel_delete', 'anti_channel_update',
    'anti_role_create', 'anti_role_delete', 'anti_role_update', 'anti_role_grant', 'anti_role_remove',
    'anti_member_update', 'anti_emoji_create', 'anti_emoji_delete', 'anti_emoji_update',
    'anti_integration', 'anti_guild_update', 'anti_webhook_create', 'anti_webhook_delete',
    'anti_webhook_update', 'anti_invite_create', 'anti_invite_delete', 'anti_timeout'
  ];
  const automodKeys = ['anti_everyone_ping', 'anti_role_ping', 'anti_link'];
  const voiceKeys = ['voice_protection'];

  const buildEmbed = (bypasses: string[]) => {
    const verifiedIcon = '<a:approved:1532390590707142956>';
    const wrongIcon = '<:wrong:1532390628330307634>';

    const activeCount = bypasses.length;
    const totalCount = protections.length;
    const isAll = activeCount >= totalCount;

    const hasSec = securityKeys.every(k => bypasses.includes(k));
    const countSec = securityKeys.filter(k => bypasses.includes(k)).length;
    const secStatus = hasSec ? `${verifiedIcon} Active (Full Bypass)` : (countSec > 0 ? `⚠️ Partial (${countSec}/${securityKeys.length})` : `${wrongIcon} Disabled`);

    const hasAm = automodKeys.every(k => bypasses.includes(k));
    const countAm = automodKeys.filter(k => bypasses.includes(k)).length;
    const amStatus = hasAm ? `${verifiedIcon} Active (Full Bypass)` : (countAm > 0 ? `⚠️ Partial (${countAm}/${automodKeys.length})` : `${wrongIcon} Disabled`);

    const hasVc = voiceKeys.every(k => bypasses.includes(k));
    const vcStatus = hasVc ? `${verifiedIcon} Active (Full Bypass)` : `${wrongIcon} Disabled`;

    let bypassSummary = '';
    if (isAll) {
      bypassSummary = `> ${verifiedIcon} **FULL BYPASS GRANTED** (All ${totalCount} protections bypassed)`;
    } else if (activeCount === 0) {
      bypassSummary = `> ${wrongIcon} **NO BYPASS PERMISSIONS** (Standard security limits apply)`;
    } else {
      const activeLabels = protections.filter(p => bypasses.includes(p.key)).map(p => p.label);
      bypassSummary = `> ${verifiedIcon} **Active Bypasses (${activeCount}/${totalCount})**:\n> ` + activeLabels.map(l => `\`${l}\``).join(', ');
    }

    const embedDesc = [
      `__**WHITELIST CONFIGURATION**__\n`,
      `**RAGE OPTIMISER** • **${interaction.guild.name}**\n`,
      `**Target Entity**: ${isRole ? `<@&${targetId}>` : `<@${targetId}>`}`,
      `**Entry Status**: ${isNew ? '<a:approved:1532390590707142956> Newly Whitelisted' : '<:config:1532425712844144701> Active Whitelist Entry'}`,
      `**Audit Notes**: ${record.notes || notesInput || '*None provided*'}\n`,
      `**Sub-Module Category Statuses**:`,
      `> 🛡️ **Security Bypasses**: ${secStatus}`,
      `> ⚙️ **AutoMod Bypasses**: ${amStatus}`,
      `> 🎤 **Voice Bypasses**: ${vcStatus}\n`,
      `**Granular Protection Bypass Overview**`,
      bypassSummary
    ].join('\n');

    return new EmbedBuilder()
      .setColor(0x84cc16)
      .setDescription(embedDesc)
      .setThumbnail(interaction.guild.iconURL({ size: 256 }) || null)
      .setFooter({ text: 'Rage Optimiser • Security Engine' })
      .setTimestamp();
  };

  const buildComponents = (bypasses: string[]) => {
    const selectedVals = resolveSelectedOptions(bypasses);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`wl_config_select_${targetId}_${interaction.user.id}`)
      .setPlaceholder('⚙️ Enable/Disable Individual Sub-Modules Separately…')
      .setMinValues(0)
      .setMaxValues(WHITELIST_MENU_OPTIONS.length)
      .addOptions(
        WHITELIST_MENU_OPTIONS.map(opt => {
          const option = new StringSelectMenuOptionBuilder()
            .setLabel(opt.label)
            .setValue(opt.value)
            .setDescription(opt.desc)
            .setEmoji('<:shield:1532403012751065179>');
          if (selectedVals.includes(opt.value)) {
            option.setDefault(true);
          }
          return option;
        })
      );

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const hasSecurity = securityKeys.every(k => bypasses.includes(k));
    const hasAutoMod = automodKeys.every(k => bypasses.includes(k));
    const hasVoice = voiceKeys.every(k => bypasses.includes(k));

    const categoryRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`wl_cat_security_${targetId}_${interaction.user.id}`)
        .setLabel(hasSecurity ? '🛡️ Security Bypasses (Active)' : '🛡️ Toggle Security Bypasses')
        .setStyle(hasSecurity ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`wl_cat_automod_${targetId}_${interaction.user.id}`)
        .setLabel(hasAutoMod ? '⚙️ AutoMod Bypasses (Active)' : '⚙️ Toggle AutoMod Bypasses')
        .setStyle(hasAutoMod ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`wl_cat_voice_${targetId}_${interaction.user.id}`)
        .setLabel(hasVoice ? '🎤 Voice Bypasses (Active)' : '🎤 Toggle Voice Bypasses')
        .setStyle(hasVoice ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    const hasAll = allBypasses.every(k => bypasses.includes(k));

    const masterRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`wl_action_grant_${targetId}_${interaction.user.id}`)
        .setLabel('⚡ Grant All')
        .setStyle(ButtonStyle.Success)
        .setDisabled(hasAll),
      new ButtonBuilder()
        .setCustomId(`wl_action_revoke_${targetId}_${interaction.user.id}`)
        .setLabel('🔴 Revoke All')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(bypasses.length === 0),
      new ButtonBuilder()
        .setCustomId(`btn_dismiss_${interaction.user.id}`)
        .setLabel('Dismiss')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Secondary)
    );

    return [selectRow, categoryRow, masterRow];
  };

  const reply = await interaction.editReply({
    embeds: [buildEmbed(currentBypasses)],
    components: buildComponents(currentBypasses)
  });

  const collector = reply.createMessageComponentCollector({
    time: 600000 // 10 minutes
  });

  collector.on('collect', async (rawI: any) => {
    const i = wrapInteraction(rawI);
    if (i.user.id !== interaction.user.id) {
      const embedErr = new EmbedBuilder()
        .setTitle('❌ Interactivity Denied')
        .setColor(0xEF4444)
        .setDescription('Only the command executor can interact with this configuration.')
        .setTimestamp();
      return i.reply({ embeds: [embedErr], flags: 64 });
    }

    const freshModules = context.getModulesState ? context.getModulesState() : [];
    const freshMw = freshModules.find((m: any) => m.id === 'member_whitelist');
    let freshMembers = [...(freshMw?.config?.members || [])].filter(Boolean);

    let currentRecord = freshMembers.find((m: any) => 
      isRole
        ? (m.type === 'role' && (m.roleId === targetId || m.id === targetId))
        : (m.type !== 'role' && (m.userId === targetId || m.id === targetId))
    );

    if (!currentRecord) {
      return i.reply({ content: '❌ Whitelist record not found.', flags: 64 });
    }

    let newBypasses = [...(currentRecord.enabledModules || [])];

    if (i.isStringSelectMenu()) {
      const selectedVals = i.values || [];
      newBypasses = mapSelectedOptionsToRules(selectedVals);
    } else if (i.isButton()) {
      const cid = i.customId;
      if (cid.startsWith('btn_dismiss_')) {
        return i.message.delete().catch(() => {});
      } else if (cid.startsWith('wl_cat_security_')) {
        const hasSec = securityKeys.every(k => newBypasses.includes(k));
        if (hasSec) {
          newBypasses = newBypasses.filter(k => !securityKeys.includes(k));
        } else {
          newBypasses = Array.from(new Set([...newBypasses, ...securityKeys]));
        }
      } else if (cid.startsWith('wl_cat_automod_')) {
        const hasAm = automodKeys.every(k => newBypasses.includes(k));
        if (hasAm) {
          newBypasses = newBypasses.filter(k => !automodKeys.includes(k));
        } else {
          newBypasses = Array.from(new Set([...newBypasses, ...automodKeys]));
        }
      } else if (cid.startsWith('wl_cat_voice_')) {
        const hasVc = voiceKeys.every(k => newBypasses.includes(k));
        if (hasVc) {
          newBypasses = newBypasses.filter(k => !voiceKeys.includes(k));
        } else {
          newBypasses = Array.from(new Set([...newBypasses, ...voiceKeys]));
        }
      } else if (cid.startsWith('wl_action_grant_')) {
        newBypasses = [...allBypasses];
      } else if (cid.startsWith('wl_action_revoke_')) {
        newBypasses = [];
      } else {
        const hasAll = allBypasses.every(k => newBypasses.includes(k));
        newBypasses = hasAll ? [] : allBypasses;
      }
    }

    currentRecord.enabledModules = newBypasses;
    freshMembers = freshMembers.map((m: any) => 
      (m.id === targetId || m.roleId === targetId || m.userId === targetId) ? currentRecord : m
    );
    context.updateModuleConfig('member_whitelist', { members: sanitizeWhitelistMembers(freshMembers) });
    context.logSyncEvent(`[Global Whitelist] Updated permissions for ${type} ${tagOrName} via Discord UI.`, 'success');

    await i.update({
      embeds: [buildEmbed(newBypasses)],
      components: buildComponents(newBypasses)
    });
  });
}

export interface MemberWhitelistRecord {
  id: string; // userId or roleId
  userId?: string;
  roleId?: string;
  tag?: string;
  name?: string;
  type?: 'member' | 'bot' | 'role';
  status: 'active' | 'disabled';
  enabledModules: string[];
  addedBy?: string;
  createdDate: string;
  notes?: string;
}

export const MemberWhitelistManifest: ModuleManifest = {
  id: 'member_whitelist',
  name: 'Member Whitelist',
  version: '1.0.0',
  description: 'Manage trusted members who can bypass specific protection modules.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      let progress = 100;
      return { progress, errors: [] };
    }
  },
  commands: [
    {
      name: 'whitelist',
      description: 'Global Whitelist Management & Punishment Config',
      options: [
        { name: 'overview', description: 'Show whitelist overview', type: 1 },
        { name: 'activity', description: 'Show whitelist activity', type: 1 },
        { name: 'list', description: '📋 List all whitelisted members, bots, and roles', type: 1 },
        {
          name: 'add',
          description: '➕ Add a user or role to the global whitelist',
          type: 1,
          options: [
            { name: 'target', type: 9, description: 'The user or role to whitelist', required: true },
            { name: 'notes', type: 3, description: 'Optional purpose note', required: false }
          ]
        },
        {
          name: 'config',
          description: '⚙️ Configure permissions for a whitelisted user or role',
          type: 1,
          options: [
            { name: 'target', type: 9, description: 'The user or role to configure', required: true }
          ]
        },
        {
          name: 'edit',
          description: '✏️ Edit permissions for a whitelisted user or role',
          type: 1,
          options: [
            { name: 'target', type: 9, description: 'The user or role to edit', required: true }
          ]
        },
        {
          name: 'remove',
          description: '➖ Remove a user or role from the global whitelist',
          type: 1,
          options: [
            { name: 'target', type: 9, description: 'The user or role to remove', required: true }
          ]
        },
        {
          name: 'punishment',
          description: 'Configure punishments for non-whitelisted violators',
          type: 2,
          options: [
            { name: 'view', description: 'View all rule punishments (interactive)', type: 1 },
            {
              name: 'set',
              description: 'Set punishment for a specific protection rule',
              type: 1,
              options: [
                {
                  name: 'rule', type: 3, description: 'Protection rule to configure', required: true,
                  autocomplete: true
                },
                {
                  name: 'action', type: 3, description: 'Punishment to apply for violators', required: true,
                  choices: PUNISHMENTS.map(p => ({ name: `${p.emoji} ${p.label} — ${p.desc}`, value: p.value }))
                }
              ]
            },
            {
              name: 'set-all',
              description: 'Apply one punishment to ALL protection rules',
              type: 1,
              options: [
                {
                  name: 'action', type: 3, description: 'Global punishment action', required: true,
                  choices: PUNISHMENTS.map(p => ({ name: `${p.emoji} ${p.label} — ${p.desc}`, value: p.value }))
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  events: [
    {
      name: 'ready',
      handler: async (client: any, _ignored: any, context: any) => {
        migrateToUnifiedWhitelist(context);
      }
    },
    {
      name: 'command_whitelist',
      handler: async (client: any, interaction: any, context: any) => {
        await interaction.deferReply({ flags: 64 }).catch(() => {});
        const hasPermission = await checkWhitelistPermission(interaction.user.id, interaction.guild, context);
        if (!hasPermission) {
          const embed = new EmbedBuilder()
            .setTitle('🔒 Access Denied')
            .setColor(0xEF4444)
            .setDescription('Only the **Server Owner** and whitelisted administrators can manage Whitelist punishment settings.')
            .setTimestamp();
          return interaction.editReply({ embeds: [embed] }).catch(() => {});
        }

        const sub = interaction.options.getSubcommand(false);
        const group = interaction.options.getSubcommandGroup(false);

        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        const secConfig = secModule?.config || {};
        const rules = secConfig.rules || {};

        if (group === 'punishment') {
          if (sub === 'view') {
            const embed = buildPunishEmbed(interaction.guild, rules);
            const midPoint = Math.ceil(protections.length / 2);
            const leftProtections = protections.slice(0, midPoint);
            const rightProtections = protections.slice(midPoint);

            const selectMenu1 = new StringSelectMenuBuilder()
              .setCustomId(`wl_punish_select1_${interaction.user.id}`)
              .setPlaceholder('⚙️ Select a protection rule (Part 1)…')
              .setMinValues(1)
              .setMaxValues(1)
              .addOptions(
                leftProtections.map(p => {
                  const currentAction = rules[p.key]?.action || 'quarantine';
                  return new StringSelectMenuOptionBuilder()
                    .setLabel(p.label)
                    .setValue(p.key)
                    .setDescription(`Current Action: ${currentAction.toUpperCase()}`);
                })
              );

            const selectMenu2 = new StringSelectMenuBuilder()
              .setCustomId(`wl_punish_select2_${interaction.user.id}`)
              .setPlaceholder('⚙️ Select a protection rule (Part 2)…')
              .setMinValues(1)
              .setMaxValues(1)
              .addOptions(
                rightProtections.map(p => {
                  const currentAction = rules[p.key]?.action || 'quarantine';
                  return new StringSelectMenuOptionBuilder()
                    .setLabel(p.label)
                    .setValue(p.key)
                    .setDescription(`Current Action: ${currentAction.toUpperCase()}`);
                })
              );

            const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu1);
            const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu2);
            const reply = await interaction.editReply({
              embeds: [embed],
              components: [row1, row2]
            });

            const collector = reply.createMessageComponentCollector({
              componentType: ComponentType.StringSelect,
              filter: (idx: any) => idx.customId.startsWith('wl_punish_select1_') || idx.customId.startsWith('wl_punish_select2_'),
              time: 300000 // 5 minutes
            });

            collector.on('collect', async (rawI: any) => {
              const i = wrapInteraction(rawI);
              if (i.user.id !== interaction.user.id) {
                const embedErr = new EmbedBuilder()
                  .setTitle('❌ Interactivity Denied')
                  .setColor(0xEF4444)
                  .setDescription('Only the command executor can interact with this menu.')
                  .setTimestamp();
                return i.reply({ embeds: [embedErr], flags: 64 });
              }

              const ruleKey = i.values[0];
              const protection = protections.find(p => p.key === ruleKey)!;
              const currentAction = rules[ruleKey]?.action || 'quarantine';

              const actionMenu = new StringSelectMenuBuilder()
                .setCustomId(`wl_punish_action_${ruleKey}_${interaction.user.id}`)
                .setPlaceholder(`⚡ Select punishment for ${protection.label}…`)
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(
                  PUNISHMENTS.map(p =>
                    new StringSelectMenuOptionBuilder()
                      .setLabel(`${p.emoji} ${p.label}`)
                      .setValue(p.value)
                      .setDescription(p.desc)
                      .setDefault(p.value === currentAction)
                  )
                );

              const actionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(actionMenu);
              const detailEmbed = new EmbedBuilder()
                .setTitle(`Configure Action — ${protection.label}`)
                .setColor(0x7C5CFC)
                .setDescription(`**Current Action:** ${P_EMOJI[currentAction]} \`${currentAction.toUpperCase()}\`\n\nChoose the enforcement action that should trigger when a non-whitelisted entity performs this action.`)
                .setFooter({ text: 'Changes take effect immediately' })
                .setTimestamp();

              await i.update({ embeds: [detailEmbed], components: [actionRow] });

              // Collect the final action choice
              const actionCollector = reply.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: (idx: any) => idx.customId.startsWith(`wl_punish_action_${ruleKey}_`),
                time: 120000,
                max: 1
              });

              actionCollector.on('collect', async (rawIAction: any) => {
                const iAction = wrapInteraction(rawIAction);
                if (iAction.user.id !== interaction.user.id) {
                  const embedErr = new EmbedBuilder()
                    .setTitle('❌ Interactivity Denied')
                    .setColor(0xEF4444)
                    .setDescription('Only the command executor can interact with this menu.')
                    .setTimestamp();
                  return iAction.reply({ embeds: [embedErr], flags: 64 });
                }

                const newAction = iAction.values[0];
                const freshModules = context.getModulesState ? context.getModulesState() : [];
                const freshSec = freshModules.find((m: any) => m.id === 'security');
                const freshConfig = freshSec?.config || {};
                const freshRules = { ...(freshConfig.rules || {}) };

                freshRules[ruleKey] = { ...(freshRules[ruleKey] || {}), action: newAction };
                context.updateModuleConfig('security', { ...freshConfig, rules: freshRules });
                context.logSyncEvent(`[Whitelist Punishment] Updated ${ruleKey} action to ${newAction} via Discord.`, 'info');

                const successEmbed = new EmbedBuilder()
                  .setTitle('✅ Punishment Configured')
                  .setColor(0x10B981)
                  .setDescription(`Successfully updated violation punishment for **${protection.label}**.`)
                  .addFields(
                    { name: '🛡️ Protection Rule', value: `\`${protection.label}\``, inline: true },
                    { name: '⚡ Punishment Action', value: `${P_EMOJI[newAction]} \`${newAction.toUpperCase()}\``, inline: true }
                  )
                  .setTimestamp();

                await iAction.update({ embeds: [successEmbed], components: [] });
              });
            });
            return;
          }

          if (sub === 'set') {
            const ruleKey = interaction.options.getString('rule', true);
            const action = interaction.options.getString('action', true);
            const protection = protections.find(p => p.key === ruleKey);

            if (!protection) {
              const embedErr = new EmbedBuilder()
                .setTitle('❌ Unknown Rule')
                .setColor(0xEF4444)
                .setDescription('Unknown protection rule key.')
                .setTimestamp();
              return interaction.editReply({ embeds: [embedErr] }).catch(() => {});
            }

            const freshRules = { ...rules };
            freshRules[ruleKey] = { ...(freshRules[ruleKey] || {}), action };
            context.updateModuleConfig('security', { ...secConfig, rules: freshRules });
            context.logSyncEvent(`[Whitelist Punishment] Set ${ruleKey} punishment to ${action} via Discord.`, 'info');

            const embed = new EmbedBuilder()
              .setTitle('✅ Punishment Configured')
              .setColor(0x10B981)
              .setDescription(`Violation punishment for **${protection.label}** has been successfully updated.`)
              .addFields(
                { name: '🛡️ Protection Rule', value: `\`${protection.label}\``, inline: true },
                { name: '⚡ New Action', value: `${P_EMOJI[action]} \`${action.toUpperCase()}\``, inline: true }
              )
              .setTimestamp();

            return interaction.editReply({ embeds: [embed] }).catch(() => {});
          }

          if (sub === 'set-all') {
            const action = interaction.options.getString('action', true);
            const freshRules = { ...rules };

            for (const p of protections) {
              freshRules[p.key] = { ...(freshRules[p.key] || {}), action };
            }

            context.updateModuleConfig('security', { ...secConfig, rules: freshRules });
            context.logSyncEvent(`[Whitelist Punishment] Set ALL rule punishments to ${action} via Discord.`, 'info');

            const embed = new EmbedBuilder()
              .setTitle('✅ Global Punishment Applied')
              .setColor(0x7C5CFC)
              .setDescription(`All protection rules have been updated to trigger ${P_EMOJI[action]} \`${action.toUpperCase()}\` for non-whitelisted violators.`)
              .setTimestamp();

            return interaction.editReply({ embeds: [embed] }).catch(() => {});
          }
        }

        if (sub === 'list' || sub === 'overview') {
          const { userSet, roleSet } = getUnifiedWhitelistEntries(modules);

          const userMentions = [...userSet.keys()].map(uId => `<@${uId}>`).join('\n') || '*No users whitelisted.*';
          const roleMentions = [...roleSet.keys()].map(rId => `<@&${rId}>`).join('\n') || '*No roles whitelisted.*';

          const embedDesc = [
            `__**WL OVERVIEW**__\n`,
            `**RAGE OPTIMISER • ᴵˢ ɢʟᴏʙᴀʟ**\n`,
            `**Users Whitelisted**\n`,
            `> ` + userMentions.split('\n').join('\n> ') + `\n`,
            `**Roles Whitelisted**\n`,
            `> ` + roleMentions.split('\n').join('\n> ')
          ].join('\n');

          const embed = new EmbedBuilder()
            .setColor(0x84cc16)
            .setDescription(embedDesc)
            .setThumbnail(interaction.guild.iconURL({ size: 256 }) || client.user?.displayAvatarURL({ size: 256 }) || null)
            .setFooter({ text: 'Rage Optimiser • Security Engine' })
            .setTimestamp();

          const btnRow1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('wl_manage_users').setLabel('Manage Users').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('wl_remove_user').setLabel('Remove User').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('wl_add_user').setLabel('Add User').setStyle(ButtonStyle.Secondary)
          );

          const btnRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('wl_manage_roles').setLabel('Manage Roles').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('wl_remove_role').setLabel('Remove Role').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('wl_add_role').setLabel('Add Role').setStyle(ButtonStyle.Secondary)
          );

          const btnRow3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('wl_close').setLabel('Close').setStyle(ButtonStyle.Secondary)
          );

          return interaction.editReply({ embeds: [embed], components: [btnRow1, btnRow2, btnRow3] }).catch(() => {});
        }

        if (sub === 'add') {
          const target = interaction.options.getMentionable('target', true);
          const notes = interaction.options.getString('notes') || '';
          return renderWhitelistConfigUI(interaction, context, target, notes);
        }

        if (sub === 'config' || sub === 'edit') {
          const target = interaction.options.getMentionable('target', true);
          return renderWhitelistConfigUI(interaction, context, target);
        }

        if (sub === 'remove') {
          const target = interaction.options.getMentionable('target', true);
          if (!target) {
            const embedErr = new EmbedBuilder()
              .setColor(0xEF4444)
              .setDescription(`❌ ${interaction.user} Please specify a valid target user, role, or ID.`);
            return interaction.editReply({ embeds: [embedErr] }).catch(() => {});
          }

          const mwModule = modules.find((m: any) => m && m.id === 'member_whitelist');
          let members = [...(mwModule?.config?.members || [])].filter(Boolean);

          const isRole = target instanceof Role || (target && (target.constructor?.name === 'Role' || (typeof target === 'object' && 'name' in target && !('user' in target) && !('username' in target))));
          let found = false;
          let tagOrName = '';

          if (isRole) {
            tagOrName = resolveRoleName(target);
            const roleRecord = members.find((e: any) => e && target.id && e.type === 'role' && (e.roleId === target.id || e.id === target.id));
            if (roleRecord) {
              found = true;
              members = members.filter((e: any) => e && !(target.id && e.type === 'role' && (e.roleId === target.id || e.id === target.id)));

            }
          } else {
            const user = target.user || target;
            const targetId = target.id || user.id;
            tagOrName = resolveUserTag(user);
            const userRecord = members.find((e: any) => e && targetId && e.type !== 'role' && (e.userId === targetId || e.id === targetId));
            if (userRecord) {
              found = true;
              members = members.filter((e: any) => e && !(targetId && e.type !== 'role' && (e.userId === targetId || e.id === targetId)));

              if (userRecord.type !== 'bot' && !user?.bot) {
                // Downward Sync: remove from security whitelist
                const secModule = modules.find((m: any) => m && m.id === 'security');
                if (secModule) {
                  const secWhitelist = (secModule.config?.whitelist || []).filter(Boolean).filter((w: any) => {
                    if (!w) return false;
                    const id = typeof w === 'string' ? w : w.targetId;
                    return id !== targetId;
                  });
                  context.updateModuleConfig('security', { ...secModule.config, whitelist: secWhitelist });
                }
              }
            }
          }

          if (!found) {
            const embedErr = new EmbedBuilder()
              .setColor(0xEF4444)
              .setDescription(`❌ ${interaction.user} **${tagOrName}** was not found in the global whitelist.`);
            return interaction.editReply({ embeds: [embedErr] }).catch(() => {});
          }

          const sanitizedMembers = sanitizeWhitelistMembers(members);
          context.updateModuleConfig('member_whitelist', { members: sanitizedMembers });
          context.logSyncEvent(`[Global Whitelist] Removed ${tagOrName} via unified command.`, 'info');

          const verifiedIcon = '<a:approved:1532390590707142956>';
          const embedSuccess = new EmbedBuilder()
            .setColor(0x84cc16)
            .setDescription(`${verifiedIcon} ${interaction.user} **Has Unwhitelisted** ${target}`);
          return interaction.editReply({ embeds: [embedSuccess] }).catch(() => {});
        }


        if (sub === 'activity') {
          const reg = context.getRegistry ? context.getRegistry() : null;
          const activity = reg && reg.whitelistActivity ? reg.whitelistActivity : [];
          const lines = activity.slice(0, 10).map((a: any) => {
            const time = a.timestamp ? `<t:${Math.floor(a.timestamp / 1000)}:R>` : '';
            return `• **${a.actor}** ${a.action} \`${a.target}\` (${a.type}) ${time}`;
          }).join('\n');

          const embed = new EmbedBuilder()
            .setTitle('📋 Whitelist Audit Timeline')
            .setColor(0x7C5CFC)
            .setDescription(lines || '*No recent whitelist activity logged.*')
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] }).catch(() => {});
        }

        const mwMod = modules.find((m: any) => m.id === 'member_whitelist');
        const mwMembers = mwMod?.config?.members || [];

        const memberCount = mwMembers.filter((m: any) => !m.type || m.type === 'member').length;
        const botCount = mwMembers.filter((m: any) => m.type === 'bot').length;
        const roleCount = mwMembers.filter((m: any) => m.type === 'role').length;

        const embed = new EmbedBuilder()
          .setTitle('🛡️ Whitelist System Hub')
          .setColor(0x7C5CFC)
          .setThumbnail(interaction.guild.iconURL({ size: 256 }) || null)
          .setDescription('Central control panel for member, bot, and role whitelists.')
          .addFields(
            { name: '👥 Whitelisted Members', value: `\`${memberCount}\` entries`, inline: true },
            { name: '🤖 Whitelisted Bots', value: `\`${botCount}\` entries`, inline: true },
            { name: '🎖️ Whitelisted Roles', value: `\`${roleCount}\` entries`, inline: true }
          )
          .setFooter({ text: 'Use /whitelist punishment view to customize violation punishments' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] }).catch(() => {});
      }
    },
    ...[
      'wl_close',
      'wl_add_user',
      'wl_add_role',
      'wl_remove_user',
      'wl_remove_role',
      'wl_manage_users',
      'wl_manage_roles'
    ].map(customId => ({
      name: `button_${customId}`,
      handler: async (client: any, interaction: any, context: any) => {
        const verifiedIcon = '<a:approved:1532390590707142956>';

        if (customId === 'wl_close') {
          await interaction.deferUpdate().catch(() => {});
          return interaction.deleteReply().catch(() => {
            return interaction.editReply({ components: [] }).catch(() => {});
          });
        }

        if (customId === 'wl_add_user' || customId === 'wl_add_role') {
          const isRole = customId === 'wl_add_role';
          const embed = new EmbedBuilder()
            .setColor(0x84cc16)
            .setDescription(`${verifiedIcon} ${interaction.user} **To add a ${isRole ? 'role' : 'user'} to whitelist**:\n> Use \`/whitelist add target:@${isRole ? 'Role' : 'User'}\` or \`r!whitelist add @${isRole ? 'Role' : 'User'}\``);
          return interaction.reply({ embeds: [embed], flags: 64 }).catch(() => {});
        }

        if (customId === 'wl_remove_user' || customId === 'wl_remove_role') {
          const isRole = customId === 'wl_remove_role';
          const embed = new EmbedBuilder()
            .setColor(0x84cc16)
            .setDescription(`${verifiedIcon} ${interaction.user} **To remove a ${isRole ? 'role' : 'user'} from whitelist**:\n> Use \`/whitelist remove target:@${isRole ? 'Role' : 'User'}\` or \`r!whitelist remove @${isRole ? 'Role' : 'User'}\``);
          return interaction.reply({ embeds: [embed], flags: 64 }).catch(() => {});
        }

        if (customId === 'wl_manage_users' || customId === 'wl_manage_roles') {
          const isRole = customId === 'wl_manage_roles';
          const embed = new EmbedBuilder()
            .setColor(0x84cc16)
            .setDescription(`${verifiedIcon} ${interaction.user} **To manage permissions for a ${isRole ? 'role' : 'user'}**:\n> Use \`/whitelist config target:@${isRole ? 'Role' : 'User'}\` or \`r!whitelist edit @${isRole ? 'Role' : 'User'}\``);
          return interaction.reply({ embeds: [embed], flags: 64 }).catch(() => {});
        }
      }
    }))
  ],
  routes: [
    {
      path: '/state',
      method: 'get',
      handler: async (req: any, res: any, context: any) => {
        const modules = context.getModulesState();
        const mod = modules.find((m: any) => m.id === 'member_whitelist');
        res.json({ members: mod?.config?.members || [] });
      }
    },
    {
      path: '/action',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        if (!req.user) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        const hasPermission = await getGuildAndCheckPermission(req.user, context);
        if (!hasPermission) {
          return res.status(403).json({ success: false, error: 'Access Denied: Only the Owner and whitelisted users can manage the whitelist.' });
        }

        const { action, payload } = req.body;
        const modules = context.getModulesState();
        const mod = modules.find((m: any) => m.id === 'member_whitelist');
        let members = mod?.config?.members || [];

        const actor = req.user?.username || 'admin';
        const actorId = req.user?.id || '111';
        const logId = Math.random().toString(36).substring(2, 11);

        if (action === 'add') {
          // If no enabledModules provided (e.g. from web UI), default to all
          if (!payload.enabledModules || payload.enabledModules.length === 0) {
            payload.enabledModules = protections.map(p => p.key);
          }
          members.push(payload);
          context.logSyncEvent(`[Member Whitelist] Added ${payload.type || 'member'} ${payload.username || payload.name}.`, 'success');

          // Downward propagation
          if (payload.type !== 'role' && payload.type !== 'bot') {
            const secModule = modules.find((m: any) => m.id === 'security');
            if (secModule) {
              const secWhitelist = [...(secModule.config?.whitelist || [])];
              const isPresent = secWhitelist.some((w: any) => {
                const id = typeof w === 'string' ? w : w?.targetId;
                return id === payload.userId;
              });
              if (!isPresent) {
                secWhitelist.push({
                  targetId: payload.userId,
                  tag: payload.username || `User-${payload.userId}`,
                  addedAt: payload.createdDate || new Date().toISOString()
                });
                context.updateModuleConfig('security', { ...secModule.config, whitelist: secWhitelist });
              }
            }
          }

          context.registry.logWhitelistAudit(context.guildId, {
            id: logId,
            actor,
            actorId,
            action: `Added ${payload.type || 'member'} ${payload.username || payload.name} to whitelist`,
            category: payload.type || 'member',
            targetBefore: null,
            targetAfter: payload,
            timestamp: Date.now()
          });
          context.registry.logWhitelistActivity(context.guildId, {
            id: logId,
            type: payload.type || 'member',
            action: 'added',
            target: payload.username || payload.name,
            targetId: payload.userId || payload.roleId,
            actor,
            timestamp: Date.now()
          });
        } else if (action === 'remove') {
          const targetKey = payload.userId || payload.roleId || payload.id;
          const targetType = payload.type || 'member';
          if (!targetKey) {
            return res.status(400).json({ success: false, error: 'Missing target identifier' });
          }

          const targetMember = members.find((m: MemberWhitelistRecord) =>
            targetType === 'role'
              ? (m.type === 'role' && (m.roleId === targetKey || m.id === targetKey))
              : (m.type !== 'role' && (m.userId === targetKey || m.id === targetKey))
          );

          members = members.filter((m: MemberWhitelistRecord) => {
            if (targetType === 'role') {
              return !(m.type === 'role' && (m.roleId === targetKey || m.id === targetKey));
            } else {
              return !(m.type !== 'role' && (m.userId === targetKey || m.id === targetKey));
            }
          });

          context.logSyncEvent(`[Member Whitelist] Removed entry ${targetKey}.`, 'info');

          if (targetMember) {
            if (targetMember.type !== 'role' && targetMember.type !== 'bot') {
              const secModule = modules.find((m: any) => m.id === 'security');
              if (secModule) {
                const secWhitelist = (secModule.config?.whitelist || []).filter((w: any) => {
                  const id = typeof w === 'string' ? w : w?.targetId;
                  return id !== targetMember.userId;
                });
                context.updateModuleConfig('security', { ...secModule.config, whitelist: secWhitelist });
              }
            }
          }

          context.registry.logWhitelistAudit(context.guildId, {
            id: logId,
            actor,
            actorId,
            action: `Removed ${targetMember?.type || 'entry'} ${targetMember?.tag || targetMember?.name || targetKey} from whitelist`,
            category: targetMember?.type || 'member',
            targetBefore: targetMember || null,
            targetAfter: null,
            timestamp: Date.now()
          });
          context.registry.logWhitelistActivity(context.guildId, {
            id: logId,
            type: targetMember?.type || 'member',
            action: 'removed',
            target: targetMember?.tag || targetMember?.name || targetKey,
            targetId: targetKey,
            actor,
            timestamp: Date.now()
          });
        } else if (action === 'edit') {
          const targetKey = payload.userId || payload.roleId || payload.id;
          const targetType = payload.type || 'member';
          if (!targetKey) {
            return res.status(400).json({ success: false, error: 'Missing target identifier' });
          }

          const oldMember = members.find((m: MemberWhitelistRecord) =>
            targetType === 'role'
              ? (m.type === 'role' && (m.roleId === targetKey || m.id === targetKey))
              : (m.type !== 'role' && (m.userId === targetKey || m.id === targetKey))
          );

          members = members.map((m: MemberWhitelistRecord) => {
            const matches = targetType === 'role'
              ? (m.type === 'role' && (m.roleId === targetKey || m.id === targetKey))
              : (m.type !== 'role' && (m.userId === targetKey || m.id === targetKey));
            return matches ? { ...m, ...payload } : m;
          });

          context.logSyncEvent(`[Member Whitelist] Updated configuration for ${targetKey}.`, 'info');

          if (oldMember) {
            // No downward sync needed
          }

          context.registry.logWhitelistAudit(context.guildId, {
            id: logId,
            actor,
            actorId,
            action: `Modified whitelisted ${oldMember?.type || 'entry'} ${payload.username || payload.name || oldMember?.tag || oldMember?.name || targetKey}`,
            category: oldMember?.type || 'member',
            targetBefore: oldMember || null,
            targetAfter: { ...oldMember, ...payload },
            timestamp: Date.now()
          });
          context.registry.logWhitelistActivity(context.guildId, {
            id: logId,
            type: oldMember?.type || 'member',
            action: 'modified',
            target: payload.username || payload.name || oldMember?.tag || oldMember?.name || targetKey,
            targetId: targetKey,
            actor,
            timestamp: Date.now()
          });
        }

        const sanitizedMembers = sanitizeWhitelistMembers(members);
        context.updateModuleConfig('member_whitelist', { members: sanitizedMembers });
        res.json({ success: true, members: sanitizedMembers });
      }
    }
  ]
};
