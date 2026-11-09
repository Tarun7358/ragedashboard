import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import {
  Colors, buildLimeOverviewCard, DEFAULT_BRAND_IMAGE_URL, getBrandBannerAttachment,
  VERIFIED_ICON, WRONG_ICON, MEMBER_ICON, CONFIG_ICON, SHIELD_ICON
} from '../../core/UIFactory.js';
import { isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits
} from 'discord.js';

function parseReactionEmoji(emojiStr: string): string {
  if (!emojiStr) return '1532390590707142956';
  const match = emojiStr.match(/<a?:?([a-zA-Z0-9_]+):(\d+)>/);
  if (match) {
    return `${match[1]}:${match[2]}`;
  }
  const idMatch = emojiStr.match(/\d{17,20}/);
  if (idMatch) return idMatch[0];
  return emojiStr;
}

export function buildPublicReactionRolesPanel(guild: any, roleMap: Record<string, string>, client?: any) {
  const entries = Object.entries(roleMap);
  const roleLines = entries.map(([emoji, rId], idx) => {
    const num = (idx + 1).toString().padStart(2, '0');
    const role = guild.roles.cache.get(rId as string);
    const roleLabel = role ? `<@&${rId}>` : `\`Role ID: ${rId}\``;
    return `│  \` ${num} \`  ${roleLabel}`;
  });

  const descContent = [
    `Select your desired roles below to personalize your server profile and gain access to corresponding community channels.\n`,
    `╭── **Available Roles Directory** ────────────`,
    ...roleLines,
    `╰──────────────────────────────────────────────\n`,
    `*Click the corresponding button below to claim or remove a role instantly.*`
  ].join('\n');

  const bannerAttachment = getBrandBannerAttachment('rage-banner.png');
  const files: AttachmentBuilder[] = [];

  const panelEmbed = new EmbedBuilder()
    .setColor(Colors.BRAND)
    .setAuthor({
      name: `${guild.name} • Role Selection Center`,
      iconURL: guild.iconURL({ size: 128 }) || client?.user?.displayAvatarURL()
    })
    .setTitle('Reaction Roles')
    .setDescription(descContent)
    .setFooter({
      text: 'Rage Optimiser Enterprise • Automated Role Engine',
      iconURL: client?.user?.displayAvatarURL()
    })
    .setTimestamp();

  if (bannerAttachment) {
    panelEmbed.setImage('attachment://rage-banner.png');
    files.push(bannerAttachment);
  } else {
    panelEmbed.setImage(DEFAULT_BRAND_IMAGE_URL);
  }

  // Create Clean Numbered / Named ActionRow Buttons (Text only, no emojis)
  const actionRows: ActionRowBuilder<ButtonBuilder>[] = [];
  let currentRow = new ActionRowBuilder<ButtonBuilder>();
  const seenRoles = new Set<string>();
  const uniqueEntries = entries.filter(([, roleId]) => {
    const rId = String(roleId);
    if (seenRoles.has(rId)) return false;
    seenRoles.add(rId);
    return true;
  }).slice(0, 25);

  uniqueEntries.forEach(([emoji, roleId], idx) => {
    const role = guild.roles.cache.get(roleId as string);
    const numStr = (idx + 1).toString().padStart(2, '0');

    let btnLabel = numStr;
    if (uniqueEntries.length <= 5 && role?.name) {
      btnLabel = `${numStr} • ${role.name.slice(0, 20)}`;
    } else if (uniqueEntries.length <= 10 && role?.name) {
      btnLabel = role.name.slice(0, 25);
    }

    const btn = new ButtonBuilder()
      .setCustomId(`rr_btn_${roleId}`)
      .setLabel(btnLabel)
      .setStyle(ButtonStyle.Secondary);

    currentRow.addComponents(btn);

    if (currentRow.components.length === 5 || idx === uniqueEntries.length - 1) {
      actionRows.push(currentRow);
      currentRow = new ActionRowBuilder<ButtonBuilder>();
    }
  });

  return { panelEmbed, actionRows, files, entries };
}

export function buildReactionRoleAdminDashboardGUI(guild: any, roleMap: Record<string, string>, client?: any) {
  const entries = Object.entries(roleMap);
  const bannerAttachment = getBrandBannerAttachment('rage-banner.png');
  const files: AttachmentBuilder[] = [];

  const roleLines = entries.length > 0
    ? entries.map(([emoji, rId], idx) => {
        const num = (idx + 1).toString().padStart(2, '0');
        const role = guild.roles.cache.get(rId as string);
        const roleLabel = role ? `<@&${rId}>` : `\`Role ID: ${rId}\``;
        return `│  \` ${num} \`  ${roleLabel}`;
      })
    : ['│  *(No reaction roles configured yet. Select a role below to add your first mapping)*'];

  const descContent = [
    `> **Interactive Reaction Role Control Center**\n`,
    `Manage self-assignable roles, add or remove role triggers, and publish live interactive panels directly to community channels.\n`,
    `**Configured Role Mappings:** \`${entries.length} Roles Active\``,
    `╭── **Current Mappings** ───────────────────────`,
    ...roleLines,
    `╰──────────────────────────────────────────────\n`,
    `• **Add Role**: Select any server role from the dropdown below to immediately map it.`,
    `• **Deploy Public Panel**: Click Deploy to post the interactive member button panel to this channel.`
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(Colors.BRAND)
    .setAuthor({
      name: `${guild.name} • Reaction Roles Control Center`,
      iconURL: guild.iconURL({ size: 128 }) || client?.user?.displayAvatarURL()
    })
    .setTitle('Reaction Roles Control Center')
    .setDescription(descContent)
    .setFooter({
      text: 'Rage Optimiser Enterprise • Interactive Management GUI',
      iconURL: client?.user?.displayAvatarURL()
    })
    .setTimestamp();

  if (bannerAttachment) {
    embed.setImage('attachment://rage-banner.png');
    files.push(bannerAttachment);
  }

  // Row 1: Native Role Select Menu
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId('rr_gui_role_select')
    .setPlaceholder('Select a role to add to Reaction Roles...')
    .setMinValues(1)
    .setMaxValues(1);

  const row1 = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect);

  // Row 2: Action Buttons (Clean text only, no emojis)
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('rr_gui_deploy')
      .setLabel('Deploy Public Panel')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(entries.length === 0),
    new ButtonBuilder()
      .setCustomId('rr_gui_remove_menu')
      .setLabel('Remove Role')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(entries.length === 0),
    new ButtonBuilder()
      .setCustomId('rr_gui_clear')
      .setLabel('Clear All')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(entries.length === 0),
    new ButtonBuilder()
      .setCustomId('rr_gui_refresh')
      .setLabel('Refresh Dashboard')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2], files: files.length > 0 ? files : undefined };
}

export async function handleReactionRolesGuiInteraction(client: any, interaction: any, context: any) {
  if (!interaction || !interaction.guild) return;
  const customId = interaction.customId || '';
  if (!customId.startsWith('rr_gui_')) return;

  const isAuthorized = await isOwnerOrExtraOwner(interaction.user.id, interaction.guild);
  if (!isAuthorized) {
    return interaction.reply({ content: `${WRONG_ICON} Access Denied: Server Owner & Extra Owner permission required.`, flags: 64 });
  }

  const modules = context.getModulesState ? context.getModulesState(interaction.guild.id) : [];
  const rrMod = modules.find((m: any) => m.id === 'reaction_roles');
  const roleMap: Record<string, string> = { ...(rrMod?.config?.roleMap || {}) };

  // 1. Role Select Menu
  if (customId === 'rr_gui_role_select') {
    await interaction.deferUpdate().catch(() => {});
    const roleId = interaction.values?.[0];
    if (roleId) {
      roleMap[roleId] = roleId;
      context.updateModuleConfig('reaction_roles', { roleMap });
      context.logSyncEvent(`[ReactionRoles] Added role ${roleId} via GUI role selector.`, 'success');
      const payload = buildReactionRoleAdminDashboardGUI(interaction.guild, roleMap, client);
      return interaction.editReply(payload);
    }
  }

  // 2. Deploy Panel to Channel
  if (customId === 'rr_gui_deploy') {
    const { panelEmbed, actionRows, files, entries } = buildPublicReactionRolesPanel(interaction.guild, roleMap, client);
    if (entries.length === 0) {
      return interaction.reply({ content: `${WRONG_ICON} No roles configured to deploy yet.`, flags: 64 });
    }
    const msg = await interaction.channel.send({
      embeds: [panelEmbed],
      components: actionRows,
      files: files.length > 0 ? files : undefined
    });
    context.updateModuleConfig('reaction_roles', {
      ...(rrMod?.config || {}),
      roleMap,
      channelId: interaction.channel.id,
      panelMessageId: msg.id
    });
    for (const [emoji, roleId] of entries) {
      if (emoji === roleId) continue;
      const reactionKey = parseReactionEmoji(emoji as string);
      await msg.react(reactionKey).catch(() => msg.react(emoji as string).catch(() => null));
    }
    context.logSyncEvent(`[ReactionRoles] Deployed public reaction role panel to #${interaction.channel.name}.`, 'success');
    return interaction.reply({ content: `${VERIFIED_ICON} Reaction role panel deployed to ${interaction.channel}!`, flags: 64 });
  }

  // 3. Remove Role Menu
  if (customId === 'rr_gui_remove_menu') {
    const entries = Object.entries(roleMap);
    if (entries.length === 0) {
      return interaction.reply({ content: `${WRONG_ICON} No roles configured to remove.`, flags: 64 });
    }
    const removeSelect = new StringSelectMenuBuilder()
      .setCustomId('rr_gui_remove_pick')
      .setPlaceholder('Choose a role to remove from Reaction Roles...')
      .addOptions(
        entries.slice(0, 25).map(([key, rId]) => {
          const role = interaction.guild.roles.cache.get(rId);
          return new StringSelectMenuOptionBuilder()
            .setLabel(role ? role.name.slice(0, 100) : `Role ${rId}`)
            .setValue(key)
            .setDescription(`Remove ${role ? '@' + role.name : rId} from panel`);
        })
      );
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(removeSelect);
    return interaction.reply({ content: 'Select which role to remove from the reaction roles panel:', components: [row], flags: 64 });
  }

  // 4. Remove Role Picked
  if (customId === 'rr_gui_remove_pick') {
    const keyToRemove = interaction.values?.[0];
    if (keyToRemove && roleMap[keyToRemove]) {
      delete roleMap[keyToRemove];
      context.updateModuleConfig('reaction_roles', { ...(rrMod?.config || {}), roleMap });
      context.logSyncEvent(`[ReactionRoles] Removed role key ${keyToRemove} via GUI.`, 'info');
      const payload = buildReactionRoleAdminDashboardGUI(interaction.guild, roleMap, client);
      await interaction.update(payload).catch(() => {});
      return interaction.followUp({ content: `${VERIFIED_ICON} Successfully removed role mapping!`, flags: 64 }).catch(() => {});
    }
  }

  // 5. Clear All
  if (customId === 'rr_gui_clear') {
    await interaction.deferUpdate().catch(() => {});
    context.updateModuleConfig('reaction_roles', { roleMap: {} });
    context.logSyncEvent(`[ReactionRoles] Cleared all reaction roles via GUI.`, 'warn');
    const payload = buildReactionRoleAdminDashboardGUI(interaction.guild, {}, client);
    return interaction.editReply(payload);
  }

  // 6. Refresh
  if (customId === 'rr_gui_refresh') {
    await interaction.deferUpdate().catch(() => {});
    const payload = buildReactionRoleAdminDashboardGUI(interaction.guild, roleMap, client);
    return interaction.editReply(payload);
  }
}

export const ReactionRolesManifest: ModuleManifest = {
  id: 'reaction_roles',
  name: 'Reaction Roles Engine',
  version: '1.0.0',
  description: 'Enterprise self-assignable role panels linked to emoji reactions and numbered buttons.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 100;
      
      const roleMap = config.roleMap || {};
      for (const [emoji, roleId] of Object.entries(roleMap)) {
        if (!registry.roles.some(r => r.id === roleId)) {
          errors.push(`Mapped role for emoji ${emoji} (${roleId}) no longer exists.`);
          progress = 50;
        }
      }

      return { progress, errors };
    }
  },
  commands: [
    {
      name: 'reactionrole',
      description: 'Enterprise Reaction Role Management Engine',
      options: [
        {
          name: 'gui',
          description: 'Open the interactive Reaction Roles Control Center GUI',
          type: 1
        },
        {
          name: 'spawn',
          description: 'Spawn an enterprise reaction role panel in a channel',
          type: 1,
          options: [
            { name: 'channel', type: 7, description: 'Channel to spawn panel in', required: false, channel_types: [0, 5] }
          ]
        },
        {
          name: 'add',
          description: 'Add an emoji to role mapping for reaction roles',
          type: 1,
          options: [
            { name: 'emoji', type: 3, description: 'Emoji symbol, name, or custom emoji ID', required: true },
            { name: 'role', type: 8, description: 'Role to assign when reacted', required: true }
          ]
        },
        {
          name: 'remove',
          description: 'Remove an emoji mapping',
          type: 1,
          options: [
            { name: 'emoji', type: 3, description: 'Emoji symbol or name to remove', required: true }
          ]
        },
        {
          name: 'list',
          description: 'List all configured reaction role mappings',
          type: 1
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_reactionrole',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        if (!guild) {
          return interaction.reply({ content: `${WRONG_ICON} Reaction Role commands can only be run inside a server.`, flags: 64 });
        }

        const isAuthorized = await isOwnerOrExtraOwner(interaction.user.id, guild);
        if (!isAuthorized) {
          return interaction.reply({ content: `${WRONG_ICON} Access Denied: Server Owner & Extra Owner permission required.`, flags: 64 });
        }
        
        const sub = interaction.options?.getSubcommand(false) || interaction.parsed?.args?.[0]?.toLowerCase() || 'gui';
        const modules = context.getModulesState ? context.getModulesState(guild.id) : [];
        const rrMod = modules.find((m: any) => m.id === 'reaction_roles');

        // ─── GUI CONTROL CENTER (DEFAULT) ─────────────────────────────
        if (sub === 'gui' || sub === 'control' || sub === 'dashboard' || sub === 'admin' || !sub) {
          const roleMap = rrMod?.config?.roleMap || {};
          const payload = buildReactionRoleAdminDashboardGUI(guild, roleMap, client);
          return interaction.reply(payload);
        }

        // ─── ADD MAPPING ───────────────────────────────────────────────
        if (sub === 'add') {
          const emoji = interaction.options?.getString?.('emoji') || interaction.parsed?.args?.[1];
          const role = interaction.options?.getRole?.('role') || interaction.parsed?.args?.[2];

          if (!emoji || !role) {
            return interaction.reply({ content: `${WRONG_ICON} Usage: \`r!rr add <emoji> <@role>\``, flags: 64 });
          }

          const roleMap = { ...(rrMod?.config?.roleMap || {}) };
          const roleId = typeof role === 'string' ? role.replace(/[<@&>]/g, '') : role.id;
          roleMap[emoji] = roleId;
          context.updateModuleConfig('reaction_roles', { roleMap });
          context.logSyncEvent(`[ReactionRoles] Mapped emoji ${emoji} to role ${typeof role === 'string' ? roleId : role.name}.`, 'success');
          
          return interaction.reply({ content: `${VERIFIED_ICON} Successfully mapped emoji ${emoji} to role <@&${roleId}>.`, flags: 64 });
        }
        
        // ─── REMOVE MAPPING ────────────────────────────────────────────
        if (sub === 'remove' || sub === 'delete') {
          const emoji = interaction.options?.getString?.('emoji') || interaction.parsed?.args?.[1];
          if (!emoji) {
            return interaction.reply({ content: `${WRONG_ICON} Usage: \`r!rr remove <emoji>\``, flags: 64 });
          }

          const roleMap = { ...(rrMod?.config?.roleMap || {}) };
          delete roleMap[emoji];
          context.updateModuleConfig('reaction_roles', { roleMap });
          context.logSyncEvent(`[ReactionRoles] Removed emoji ${emoji} mapping.`, 'info');
          
          return interaction.reply({ content: `${VERIFIED_ICON} Removed reaction role mapping for ${emoji}.`, flags: 64 });
        }
        
        // ─── LIST MAPPINGS ─────────────────────────────────────────────
        if (sub === 'list' || sub === 'show') {
          const roleMap = rrMod?.config?.roleMap || {};
          const payload = buildReactionRoleAdminDashboardGUI(guild, roleMap, client);
          return interaction.reply(payload);
        }

        // ─── SPAWN PANEL (NEW REFERENCE DESIGN) ────────────────────────
        if (sub === 'spawn' || sub === 'panel' || sub === 'setup') {
          const channel = interaction.options?.getChannel?.('channel') || interaction.channel;
          const roleMap = rrMod?.config?.roleMap || {};
          const { panelEmbed, actionRows, files, entries } = buildPublicReactionRolesPanel(guild, roleMap, client);
          
          if (entries.length === 0) {
            return interaction.reply({ content: `${WRONG_ICON} No reaction roles mapped yet. Configure roles first using \`r!rr\` GUI or \`r!rr add <emoji> <@role>\`.`, flags: 64 });
          }

          try {
            const msg = await channel.send({
              embeds: [panelEmbed],
              components: actionRows,
              files: files.length > 0 ? files : undefined
            });
            context.updateModuleConfig('reaction_roles', {
              ...(rrMod?.config || {}),
              roleMap,
              channelId: channel.id,
              panelMessageId: msg.id
            });
            
            // Also react to message with custom emojis if configured for dual interaction
            for (const [emoji, roleId] of entries) {
              if (emoji === roleId) continue;
              const reactionKey = parseReactionEmoji(emoji as string);
              await msg.react(reactionKey).catch(() => msg.react(emoji as string).catch(() => null));
            }

            context.logSyncEvent(`[ReactionRoles] Spawned redesigned reaction role panel in #${channel.name}.`, 'success');
            return interaction.reply({ content: `${VERIFIED_ICON} Reaction role panel successfully spawned in ${channel}.`, flags: 64 });
          } catch (e: any) {
            console.error('[ReactionRoles] Failed to spawn panel:', e);
            return interaction.reply({ content: `${WRONG_ICON} Failed to send reaction role panel: ${e.message}`, flags: 64 });
          }
        }
      }
    },
    // ─── INTERACTION LISTENER FOR REACTION ROLES (GUI + BUTTONS) ───────
    {
      name: 'interactionCreate',
      handler: async (client: any, interaction: any, context: any) => {
        if (interaction.customId?.startsWith('rr_gui_')) {
          return handleReactionRolesGuiInteraction(client, interaction, context);
        }

        if (!interaction.isButton?.()) return;
        if (!interaction.customId.startsWith('rr_btn_')) return;

        const roleId = interaction.customId.replace('rr_btn_', '');
        const guild = interaction.guild;
        if (!guild) return;

        try {
          const member = await guild.members.fetch(interaction.user.id);
          const role = await guild.roles.fetch(roleId).catch(() => null);

          if (!role) {
            return interaction.reply({ content: `${WRONG_ICON} The selected role no longer exists on this server.`, flags: 64 });
          }

          if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId);
            context.logSyncEvent(`[ReactionRoles] ${member.user.username} removed role @${role.name} via panel button.`, 'info');
            return interaction.reply({ content: `${VERIFIED_ICON} Removed role **${role.name}** from your profile.`, flags: 64 });
          } else {
            await member.roles.add(roleId);
            context.logSyncEvent(`[ReactionRoles] ${member.user.username} claimed role @${role.name} via panel button.`, 'info');
            return interaction.reply({ content: `${VERIFIED_ICON} Successfully assigned role **${role.name}** to your profile!`, flags: 64 });
          }
        } catch (e: any) {
          console.error('[ReactionRoles] Button click error:', e);
          return interaction.reply({ content: `${WRONG_ICON} Unable to modify role: ${e.message}`, flags: 64 });
        }
      }
    },
    // ─── EMOJI REACTION ADD LISTENER ──────────────────────────────────
    {
      name: 'messageReactionAdd',
      handler: async (client: any, reaction: any, user: any, context: any) => {
        if (user.bot) return;
        if (reaction.partial) await reaction.fetch().catch(() => {});
        if (reaction.message?.partial) await reaction.message.fetch().catch(() => {});
        if (reaction.message?.author?.id && reaction.message.author.id !== client.user?.id) return;

        const modules = context.getModulesState ? context.getModulesState(reaction.message?.guild?.id) : [];
        const rrMod = modules.find((m: any) => m.id === 'reaction_roles');
        if (!rrMod) return;

        const config = rrMod.config || {};
        if (config.panelMessageId && reaction.message?.id !== config.panelMessageId) return;
        if (!config.panelMessageId && config.channelId && reaction.message?.channelId !== config.channelId) return;

        const roleMap = config.roleMap || {};
        const emojiKey = reaction.emoji.id ? `${reaction.emoji.name}:${reaction.emoji.id}` : reaction.emoji.name;
        const customFull = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : undefined;
        const customAnim = reaction.emoji.id ? `<a:${reaction.emoji.name}:${reaction.emoji.id}>` : undefined;

        const roleId =
          roleMap[emojiKey] ||
          (reaction.emoji.name ? roleMap[reaction.emoji.name] : undefined) ||
          (reaction.emoji.id ? roleMap[reaction.emoji.id] : undefined) ||
          (customFull ? roleMap[customFull] : undefined) ||
          (customAnim ? roleMap[customAnim] : undefined);

        if (roleId) {
          try {
            const member = await reaction.message.guild.members.fetch(user.id);
            if (member && !member.roles.cache.has(roleId)) {
              await member.roles.add(roleId);
              context.logSyncEvent(`[ReactionRoles] ${user.username} assigned themselves role <@&${roleId}> via reaction.`, 'info');
            }
          } catch (e) {
            console.error('[ReactionRoles] Error assigning role:', e);
          }
        }
      }
    },
    // ─── EMOJI REACTION REMOVE LISTENER ───────────────────────────────
    {
      name: 'messageReactionRemove',
      handler: async (client: any, reaction: any, user: any, context: any) => {
        if (user.bot) return;
        if (reaction.partial) await reaction.fetch().catch(() => {});
        if (reaction.message?.partial) await reaction.message.fetch().catch(() => {});
        if (reaction.message?.author?.id && reaction.message.author.id !== client.user?.id) return;

        const modules = context.getModulesState ? context.getModulesState(reaction.message?.guild?.id) : [];
        const rrMod = modules.find((m: any) => m.id === 'reaction_roles');
        if (!rrMod) return;

        const config = rrMod.config || {};
        if (config.panelMessageId && reaction.message?.id !== config.panelMessageId) return;
        if (!config.panelMessageId && config.channelId && reaction.message?.channelId !== config.channelId) return;

        const roleMap = config.roleMap || {};
        const emojiKey = reaction.emoji.id ? `${reaction.emoji.name}:${reaction.emoji.id}` : reaction.emoji.name;
        const customFull = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : undefined;
        const customAnim = reaction.emoji.id ? `<a:${reaction.emoji.name}:${reaction.emoji.id}>` : undefined;

        const roleId =
          roleMap[emojiKey] ||
          (reaction.emoji.name ? roleMap[reaction.emoji.name] : undefined) ||
          (reaction.emoji.id ? roleMap[reaction.emoji.id] : undefined) ||
          (customFull ? roleMap[customFull] : undefined) ||
          (customAnim ? roleMap[customAnim] : undefined);

        if (roleId) {
          try {
            const member = await reaction.message.guild.members.fetch(user.id);
            if (member && member.roles.cache.has(roleId)) {
              await member.roles.remove(roleId);
              context.logSyncEvent(`[ReactionRoles] ${user.username} removed role <@&${roleId}> via reaction.`, 'info');
            }
          } catch (e) {
            console.error('[ReactionRoles] Error removing role:', e);
          }
        }
      }
    }
  ],
  routes: [
    {
      path: '/state',
      method: 'get',
      handler: async (req: any, res: any, context: any) => {
        const modules = context.getModulesState();
        const mod = modules.find((m: any) => m.id === 'reaction_roles');
        res.json({ roleMap: mod?.config?.roleMap || {} });
      }
    },
    {
      path: '/update',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        const { roleMap } = req.body;
        context.updateModuleConfig('reaction_roles', { roleMap });
        context.logSyncEvent(`Reaction Roles: Mappings updated from dashboard.`, 'success');
        res.json({ success: true, roleMap });
      }
    }
  ]
};

export function registerReactionRolesCommands() {
  PrefixRegistry.register({
    name: 'reactionrole',
    description: 'Enterprise Reaction Role management engine, interactive GUI Control Center & panels',
    category: 'Management',
    usage: 'r!reactionrole [gui | add <emoji> <@role> | remove <emoji> | list | spawn #channel]',
    aliases: ['rr', 'reactionroles', 'rolepanel'],
    userPermissions: [],
    cooldownSeconds: 3,
    examples: ['r!rr', 'r!rr gui', 'r!rr spawn #roles', 'r!rr add ⭐ @VIP'],
    moduleOwnerId: 'reaction_roles',
    subcommands: [
      { name: 'gui', description: 'Open interactive Reaction Roles Control Center GUI', examples: ['r!rr', 'r!rr gui'] },
      { name: 'add <emoji> <@role>', description: 'Add an emoji/role mapping for reaction role panels', examples: ['r!rr add ⭐ @VIP'] },
      { name: 'remove <emoji>', description: 'Remove an existing emoji role mapping', examples: ['r!rr remove ⭐'] },
      { name: 'list', description: 'List all currently configured reaction role mappings', examples: ['r!rr list'] },
      { name: 'spawn [#channel]', description: 'Spawn an enterprise numbered button reaction role panel', examples: ['r!rr spawn', 'r!rr spawn #roles'] }
    ]
  });
}
