import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  ButtonInteraction,
  Guild
} from 'discord.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';
import { PrefixResolver } from '../../core/prefix/PrefixResolver.js';
import { NoPrefixManager, GuildNoPrefixConfig } from '../../core/security/NoPrefixManager.js';
import { buildLimeOverviewCard, Colors } from '../../core/UIFactory.js';
import { isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';

const APPROVED_ICON = '<:ticks:1532620580266836148>';
const WRONG_EMOJI = '<a:warning:1546155193303957504>';
const SHIELD_EMOJI = '<a:success_check:1546134620087783526>';
const VIP_ICON = '<:vip:1532620837117759508>';
const MEMBER_ICON = '<:member:1532621317487071426>';
const CONFIG_ICON = '<:config:1532620719878574160>';

export function buildNPManagerCard(guild: Guild, cfg: GuildNoPrefixConfig, prefix: string) {
  const userListText = cfg.users.length > 0
    ? cfg.users.map(id => `• <@${id}> (\`${id}\`)`).join('\n')
    : `*No extra whitelisted members added yet.*`;

  const roleListText = cfg.roles.length > 0
    ? cfg.roles.map(id => `• <@&${id}> (\`${id}\`)`).join(', ')
    : `*Server Owner, Extra Owners & Admins only*`;

  const channelListText = cfg.channels.length > 0
    ? cfg.channels.map(id => `<#${id}>`).join(', ')
    : `*All channels permitted*`;

  const card = buildLimeOverviewCard({
    title: `${VIP_ICON} NO-PREFIX USERS MANAGEMENT MATRIX`,
    subtitle: 'EXECUTE COMMANDS DIRECTLY WITHOUT ANY BOT PREFIX',
    color: cfg.enabled ? Colors.BRAND : Colors.WARN,
    thumbnail: guild.iconURL({ size: 256 }) || undefined,
    sections: [
      {
        title: `${SHIELD_EMOJI} SYSTEM STATUS & TELEMETRY`,
        items: [
          `• **Global State:** ${cfg.enabled ? '`ACTIVE / ENABLED`' : '`DISABLED (Requires Prefix)`'}`,
          `• **Owner & Extra Owner:** \`UNRESTRICTED ZERO-LATENCY BYPASS\``,
          `• **Administrator Access:** ${cfg.enabled ? '`PERMITTED`' : '`RESTRICTED`'}`,
          `• **Allowed Channels:** ${channelListText}`
        ]
      },
      {
        title: `${MEMBER_ICON} WHITELISTED ROLES (${cfg.roles.length})`,
        items: [roleListText]
      },
      {
        title: `${VIP_ICON} WHITELISTED MEMBERS (${cfg.users.length})`,
        items: [userListText]
      },
      {
        title: `${CONFIG_ICON} QUICK COMMANDS`,
        items: [
          `• \`${prefix}noprefix on\` / \`off\` — Toggle system server-wide`,
          `• \`${prefix}noprefix add <@user>\` — Whitelist user`,
          `• \`${prefix}noprefix remove <@user>\` — Revoke user`,
          `• \`${prefix}noprefix role <@role>\` — Toggle permitted role`,
          `• \`${prefix}noprefix channel <#channel>\` — Restrict to channel`,
          `• \`${prefix}noprefix clean\` — Wipe all extra whitelists`
        ]
      }
    ],
    footerText: 'Rage Optimiser Enterprise • Unbypassable Security'
  });

  const btnToggle = new ButtonBuilder()
    .setCustomId(`np_btn_toggle:${guild.id}`)
    .setLabel(cfg.enabled ? 'No-Prefix: ON' : 'No-Prefix: OFF')
    .setStyle(cfg.enabled ? ButtonStyle.Success : ButtonStyle.Danger);

  const btnAdd = new ButtonBuilder()
    .setCustomId(`np_btn_add:${guild.id}`)
    .setLabel('Add NP Member')
    .setStyle(ButtonStyle.Primary);

  const btnRemove = new ButtonBuilder()
    .setCustomId(`np_btn_remove:${guild.id}`)
    .setLabel('Remove NP Member')
    .setStyle(ButtonStyle.Secondary);

  const btnClean = new ButtonBuilder()
    .setCustomId(`np_btn_clean:${guild.id}`)
    .setLabel('Clean Whitelist')
    .setStyle(ButtonStyle.Danger);

  const btnDismiss = new ButtonBuilder()
    .setCustomId(`help_btn_dismiss:anyone`)
    .setLabel('Dismiss')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btnToggle, btnAdd, btnRemove, btnClean, btnDismiss);
  return { embeds: [card], components: [row] };
}

export function registerNPCommands(): void {
  PrefixRegistry.register({
    name: 'np',
    category: 'Security',
    description: 'Manage No-Prefix users and settings for prefixless command execution.',
    usage: 'r!np [on | off | manager | add | remove | role | channel | list | clean]',
    aliases: ['noprefix', 'npmanager', 'prefixless'],
    cooldownSeconds: 2,
    examples: [
      'r!np on',
      'r!np off',
      'r!np manager',
      'r!np add @User',
      'r!np remove @User',
      'r!np role @Moderator',
      'r!np channel #bot-commands',
      'r!np list',
      'r!np clean'
    ],
    moduleOwnerId: 'security',
    dangerLevel: 'High',
    subcommands: [
      { name: 'on', description: 'Enable No-Prefix command execution server-wide' },
      { name: 'off', description: 'Disable No-Prefix command execution server-wide' },
      { name: 'manager', description: 'Open interactive No-Prefix user management matrix card' },
      { name: 'add', description: 'Grant No-Prefix command execution to a member' },
      { name: 'remove', description: 'Revoke No-Prefix command execution from a member' },
      { name: 'role', description: 'Toggle No-Prefix privileges for a server role' },
      { name: 'channel', description: 'Toggle channel restriction for No-Prefix commands' },
      { name: 'list', description: 'List all current No-Prefix whitelisted members and roles' },
      { name: 'clean', description: 'Wipe all extra No-Prefix users in the server' }
    ],
    execute: async (message: Message, args: string[]) => {
      const guildId = message.guildId;
      if (!guildId || !message.guild) {
        return message.reply({ content: `${WRONG_EMOJI} **Access Denied**: No-Prefix management is only available in server guilds.` });
      }

      const prefix = PrefixResolver.getPrefix(guildId);

      // Access Gate: Server Owner, Extra Owners, or Administrators
      const isOwner = await isOwnerOrExtraOwner(message.author.id, message.guild);
      const isAdmin = message.member?.permissions?.has('Administrator');

      if (!isOwner && !isAdmin) {
        return message.reply({ content: `${WRONG_EMOJI} **Access Denied**: Only the **Server Owner**, Extra Owners, or Administrators can manage No-Prefix permissions.` });
      }

      const rawSub = args[0]?.toLowerCase();
      const validSubs = [
        'manager', 'status', 'view', 'info',
        'on', 'enable', 'activate',
        'off', 'disable', 'deactivate',
        'add', 'user',
        'remove',
        'role', 'roles',
        'channel', 'channels',
        'list',
        'clean', 'clear'
      ];

      // Unknown Subcommand Error Card
      if (rawSub && !validSubs.includes(rawSub)) {
        const botAvatar = message.client.user?.displayAvatarURL({ size: 256 }) ?? null;
        const errEmbed = new EmbedBuilder()
          .setTitle(`${WRONG_EMOJI} Unknown NP Subcommand`)
          .setColor(0xef4444)
          .setDescription(`Invalid subcommand. Use \`${prefix}np on\` to enable, \`${prefix}np off\` to disable, or \`${prefix}np manager\` for the control matrix.`)
          .setThumbnail(botAvatar)
          .setFooter({ text: 'Rage Optimiser Enterprise • Unbypassable Security' })
          .setTimestamp();

        const dismissBtn = new ButtonBuilder()
          .setCustomId(`help_btn_dismiss:${message.author.id}`)
          .setLabel('Dismiss')
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(dismissBtn);
        const replyMsg = await message.reply({ embeds: [errEmbed], components: [row] }).catch(() => null);
        if (replyMsg) setTimeout(() => replyMsg.delete().catch(() => {}), 15000);
        return;
      }

      const sub = rawSub || 'manager';

      // 1. Toggle ON / ENABLE
      if (sub === 'on' || sub === 'enable' || sub === 'activate') {
        await NoPrefixManager.setEnabled(guildId, true);
        const embed = new EmbedBuilder()
          .setTitle(`${APPROVED_ICON} No-Prefix Commands Activated`)
          .setColor(Colors.LIME)
          .setDescription([
            `No-Prefix command execution is now **ENABLED** on **${message.guild.name}**.\n`,
            `• **Server Owner & Extra Owners:** Full zero-prefix access everywhere.`,
            `• **Administrators & Whitelisted:** Can run commands directly without \`${prefix}\` (e.g. \`jtc\`, \`vc\`, \`clean\`, \`help\`, \`ban\`, \`kick\`, \`mute\`).`,
            `\n> *Type any valid command name directly in chat.*`
          ].join('\n'))
          .setFooter({ text: 'Rage Optimiser Enterprise • Unbypassable Security' })
          .setTimestamp();

        const dismissBtn = new ButtonBuilder()
          .setCustomId(`help_btn_dismiss:${message.author.id}`)
          .setLabel('Dismiss')
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(dismissBtn);
        return message.reply({ embeds: [embed], components: [row] });
      }

      // 2. Toggle OFF / DISABLE
      if (sub === 'off' || sub === 'disable' || sub === 'deactivate') {
        await NoPrefixManager.setEnabled(guildId, false);
        const embed = new EmbedBuilder()
          .setTitle(`${WRONG_EMOJI} No-Prefix Commands Deactivated`)
          .setColor(Colors.WARN)
          .setDescription([
            `No-Prefix command execution is now **DISABLED** on **${message.guild.name}**.\n`,
            `Commands now require the bot prefix \`${prefix}\` or bot mention.`,
            `*(Server Owner & Extra Owners retain bypass privileges).*`
          ].join('\n'))
          .setFooter({ text: 'Rage Optimiser Enterprise • Unbypassable Security' })
          .setTimestamp();

        const dismissBtn = new ButtonBuilder()
          .setCustomId(`help_btn_dismiss:${message.author.id}`)
          .setLabel('Dismiss')
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(dismissBtn);
        return message.reply({ embeds: [embed], components: [row] });
      }

      // 3. Manager Dashboard Matrix
      if (sub === 'manager' || sub === 'status' || sub === 'info') {
        const cfg = NoPrefixManager.getConfig(guildId);
        const cardData = buildNPManagerCard(message.guild, cfg, prefix);
        return message.reply(cardData);
      }

      // 4. Add NP User
      if (sub === 'add' || sub === 'user') {
        const targetUser = message.mentions.users.first() ||
                           (args[1] ? await message.client.users.fetch(args[1]).catch(() => null) : null);

        if (!targetUser) {
          return message.reply({
            content: `${WRONG_EMOJI} **Syntax Error**: Please mention or specify a valid User ID.\nExample: \`${prefix}np add @User\``
          });
        }

        const isAlready = await NoPrefixManager.isNPUser(guildId, targetUser.id);
        if (isAlready) {
          return message.reply({ content: `${WRONG_EMOJI} User ${targetUser} (\`${targetUser.id}\`) is **already** in the No-Prefix whitelist.` });
        }

        await NoPrefixManager.addNPUser(guildId, targetUser.id, message.author.id);

        const successEmbed = new EmbedBuilder()
          .setTitle(`${APPROVED_ICON} No-Prefix Access Granted`)
          .setColor(Colors.LIME)
          .setDescription([
            `User ${targetUser} (\`${targetUser.id}\`) has been **granted No-Prefix privileges**.\n`,
            `They can now execute all authorized bot commands without typing \`${prefix}\`.`
          ].join('\n'))
          .setFooter({ text: 'Rage Optimiser Enterprise • Unbypassable Security' })
          .setTimestamp();

        const dismissBtn = new ButtonBuilder()
          .setCustomId(`help_btn_dismiss:${message.author.id}`)
          .setLabel('Dismiss')
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(dismissBtn);
        const replyMsg = await message.reply({ embeds: [successEmbed], components: [row] });
        setTimeout(() => replyMsg.delete().catch(() => {}), 15000);
        return;
      }

      // 5. Remove NP User
      if (sub === 'remove') {
        const targetUser = message.mentions.users.first() ||
                           (args[1] ? await message.client.users.fetch(args[1]).catch(() => null) : null);

        if (!targetUser) {
          return message.reply({
            content: `${WRONG_EMOJI} **Syntax Error**: Please mention or specify a valid User ID.\nExample: \`${prefix}np remove @User\``
          });
        }

        const isAlready = await NoPrefixManager.isNPUser(guildId, targetUser.id);
        if (!isAlready) {
          return message.reply({ content: `${WRONG_EMOJI} User ${targetUser} (\`${targetUser.id}\`) is not currently in the No-Prefix whitelist.` });
        }

        await NoPrefixManager.removeNPUser(guildId, targetUser.id);

        const removeEmbed = new EmbedBuilder()
          .setTitle(`${APPROVED_ICON} No-Prefix Access Revoked`)
          .setColor(Colors.WARN)
          .setDescription(`User ${targetUser} (\`${targetUser.id}\`) has been **removed** from the No-Prefix whitelist.`)
          .setFooter({ text: 'Rage Optimiser Enterprise • Unbypassable Security' })
          .setTimestamp();

        const dismissBtn = new ButtonBuilder()
          .setCustomId(`help_btn_dismiss:${message.author.id}`)
          .setLabel('Dismiss')
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(dismissBtn);
        const replyMsg = await message.reply({ embeds: [removeEmbed], components: [row] });
        setTimeout(() => replyMsg.delete().catch(() => {}), 15000);
        return;
      }

      // 6. Role Whitelist
      if (sub === 'role' || sub === 'roles') {
        const roleId = message.mentions.roles.first()?.id || args[1]?.replace(/[^0-9]/g, '');
        if (!roleId) {
          return message.reply(`${WRONG_EMOJI} Please mention or provide a valid role ID: \`${prefix}np role @Moderator\``);
        }
        const added = await NoPrefixManager.toggleRole(guildId, roleId);
        const embed = new EmbedBuilder()
          .setTitle(`${APPROVED_ICON} No-Prefix Role Updated`)
          .setColor(added ? Colors.LIME : Colors.WARN)
          .setDescription(`Role <@&${roleId}> has been **${added ? 'granted' : 'revoked from'}** No-Prefix privileges.`)
          .setFooter({ text: 'Rage Optimiser Enterprise • Unbypassable Security' })
          .setTimestamp();

        const dismissBtn = new ButtonBuilder()
          .setCustomId(`help_btn_dismiss:${message.author.id}`)
          .setLabel('Dismiss')
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(dismissBtn);
        return message.reply({ embeds: [embed], components: [row] });
      }

      // 7. Channel Restriction
      if (sub === 'channel' || sub === 'channels') {
        const channelId = message.mentions.channels.first()?.id || args[1]?.replace(/[^0-9]/g, '');
        if (!channelId) {
          return message.reply(`${WRONG_EMOJI} Please mention or provide a valid channel ID: \`${prefix}np channel #bot-commands\``);
        }
        const added = await NoPrefixManager.toggleChannel(guildId, channelId);
        const embed = new EmbedBuilder()
          .setTitle(`${APPROVED_ICON} Channel Whitelist Updated`)
          .setColor(added ? Colors.LIME : Colors.WARN)
          .setDescription(`Channel <#${channelId}> has been **${added ? 'added to' : 'removed from'}** the permitted No-Prefix channel list.`)
          .setFooter({ text: 'Rage Optimiser Enterprise • Unbypassable Security' })
          .setTimestamp();

        const dismissBtn = new ButtonBuilder()
          .setCustomId(`help_btn_dismiss:${message.author.id}`)
          .setLabel('Dismiss')
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(dismissBtn);
        return message.reply({ embeds: [embed], components: [row] });
      }

      // 8. List NP Users & Roles
      if (sub === 'list' || sub === 'view') {
        const cfg = NoPrefixManager.getConfig(guildId);
        const userList = cfg.users.length > 0 ? cfg.users.map(id => `• <@${id}> (\`${id}\`)`).join('\n') : '*No individual users whitelisted*';
        const roleList = cfg.roles.length > 0 ? cfg.roles.map(id => `• <@&${id}> (\`${id}\`)`).join('\n') : '*No roles whitelisted*';
        const chanList = cfg.channels.length > 0 ? cfg.channels.map(id => `• <#${id}>`).join('\n') : '*All channels allowed*';

        const listEmbed = new EmbedBuilder()
          .setTitle(`${VIP_ICON} Whitelisted No-Prefix Directory`)
          .setColor(Colors.BRAND)
          .addFields(
            { name: `System Status`, value: cfg.enabled ? '`ENABLED`' : '`DISABLED`', inline: true },
            { name: `Whitelisted Roles (${cfg.roles.length})`, value: roleList, inline: false },
            { name: `Whitelisted Members (${cfg.users.length})`, value: userList, inline: false },
            { name: `Allowed Channels (${cfg.channels.length})`, value: chanList, inline: false }
          )
          .setFooter({ text: 'Rage Optimiser Enterprise • Unbypassable Security' })
          .setTimestamp();

        const dismissBtn = new ButtonBuilder()
          .setCustomId(`help_btn_dismiss:${message.author.id}`)
          .setLabel('Dismiss')
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(dismissBtn);
        return message.reply({ embeds: [listEmbed], components: [row] });
      }

      // 9. Clean All NP Users
      if (sub === 'clean' || sub === 'clear') {
        await NoPrefixManager.cleanNPUsers(guildId);

        const cleanEmbed = new EmbedBuilder()
          .setTitle(`${APPROVED_ICON} No-Prefix Whitelist Cleared`)
          .setColor(Colors.DANGER)
          .setDescription(`All extra No-Prefix entries for **${message.guild.name}** have been successfully wiped.`)
          .setFooter({ text: 'Rage Optimiser Enterprise • Unbypassable Security' })
          .setTimestamp();

        const dismissBtn = new ButtonBuilder()
          .setCustomId(`help_btn_dismiss:${message.author.id}`)
          .setLabel('Dismiss')
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(dismissBtn);
        const replyMsg = await message.reply({ embeds: [cleanEmbed], components: [row] });
        setTimeout(() => replyMsg.delete().catch(() => {}), 15000);
        return;
      }
    }
  });
}

export async function handleNPButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild || !interaction.customId.startsWith('np_btn_')) return;

  const isOwner = await isOwnerOrExtraOwner(interaction.user.id, interaction.guild);
  const isAdmin = (interaction.member?.permissions as any)?.has?.('Administrator');

  if (!isOwner && !isAdmin) {
    await interaction.reply({
      content: `${WRONG_EMOJI} **Access Denied**: Only the **Server Owner**, Extra Owners, or Administrators can manage No-Prefix settings.`,
      ephemeral: true
    }).catch(() => null);
    return;
  }

  const guildId = interaction.guild.id;
  const prefix = PrefixResolver.getPrefix(guildId);

  if (interaction.customId.startsWith('np_btn_toggle:')) {
    const currentEnabled = await NoPrefixManager.isEnabled(guildId);
    await NoPrefixManager.setEnabled(guildId, !currentEnabled);
    const updatedCfg = NoPrefixManager.getConfig(guildId);
    const updatedCard = buildNPManagerCard(interaction.guild, updatedCfg, prefix);
    await interaction.update(updatedCard).catch(() => null);
    return;
  }

  if (interaction.customId.startsWith('np_btn_clean:')) {
    await NoPrefixManager.cleanNPUsers(guildId);
    const updatedCfg = NoPrefixManager.getConfig(guildId);
    const updatedCard = buildNPManagerCard(interaction.guild, updatedCfg, prefix);
    await interaction.update(updatedCard).catch(() => null);
    return;
  }

  if (interaction.customId.startsWith('np_btn_add:')) {
    await interaction.reply({
      content: `💡 To whitelist a member for No-Prefix commands, type:\n\`${prefix}noprefix add @User\` or \`${prefix}noprefix add <USER_ID>\``,
      ephemeral: true
    }).catch(() => null);
    return;
  }

  if (interaction.customId.startsWith('np_btn_remove:')) {
    await interaction.reply({
      content: `💡 To revoke a member's No-Prefix access, type:\n\`${prefix}noprefix remove @User\` or \`${prefix}noprefix remove <USER_ID>\``,
      ephemeral: true
    }).catch(() => null);
    return;
  }
}
