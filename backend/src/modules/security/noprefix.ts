import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  ComponentType
} from 'discord.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';
import { PrefixResolver } from '../../core/prefix/PrefixResolver.js';
import { NoPrefixManager } from '../../core/security/NoPrefixManager.js';
import { buildLimeOverviewCard, Colors, VERIFIED_ICON, WRONG_ICON, SHIELD_ICON, CONFIG_ICON } from '../../core/UIFactory.js';

const APPROVED_ICON = '<a:approved:1532390590707142956>';
const WRONG_EMOJI = '<:wrong:1532390628330307634>';
const SHIELD_EMOJI = '<:shield:1532403012751065179>';
const VIP_ICON = '<:vip:1532620837117759508>';
const MEMBER_ICON = '<:member:1532621317487071426>';

export function registerNPCommands(): void {
  PrefixRegistry.register({
    name: 'np',
    category: 'Security',
    description: 'Manage No-Prefix users who can execute commands without typing the bot prefix.',
    usage: 'r!np <manager|add|remove|list|clean> [@user|user_id]',
    aliases: ['noprefix', 'npmanager'],
    cooldownSeconds: 3,
    examples: [
      'r!np manager',
      'r!np add @User',
      'r!np remove @User',
      'r!np list',
      'r!np clean'
    ],
    moduleOwnerId: 'security',
    dangerLevel: 'High',
    subcommands: [
      { name: 'manager', description: 'Open interactive No-Prefix user management matrix card' },
      { name: 'add', description: 'Grant No-Prefix command execution to a member' },
      { name: 'remove', description: 'Revoke No-Prefix command execution from a member' },
      { name: 'list', description: 'List all current No-Prefix whitelisted members' },
      { name: 'clean', description: 'Wipe all No-Prefix users in the server' }
    ],
    execute: async (message: Message, args: string[]) => {
      const guildId = message.guildId;
      if (!guildId || !message.guild) {
        return message.reply({ content: `${WRONG_EMOJI} **Access Denied**: No-Prefix management is only available in server guilds.` });
      }

      const prefix = PrefixResolver.getPrefix(guildId);
      const isOwner = message.guild.ownerId === message.author.id ||
                      message.member?.permissions?.has?.('Administrator');

      if (!isOwner) {
        return message.reply({ content: `${WRONG_EMOJI} **Access Denied**: Only the **Server Owner** and Administrators can manage No-Prefix permissions.` });
      }

      const rawSub = args[0]?.toLowerCase();
      const validSubs = ['manager', 'status', 'view', 'add', 'remove', 'list', 'clean', 'clear'];

      // Unknown Subcommand Error Card (Matching enterprise Zero-Trace UI)
      if (rawSub && !validSubs.includes(rawSub)) {
        const botAvatar = message.client.user?.displayAvatarURL({ size: 256 }) ?? null;
        const errEmbed = new EmbedBuilder()
          .setTitle(`${WRONG_EMOJI} Unknown NP Subcommand`)
          .setColor(0xef4444)
          .setDescription(`Invalid subcommand. Use \`${prefix}np manager\` to see all available No-Prefix commands.`)
          .setThumbnail(botAvatar)
          .setFooter({ text: 'Secure Unbypassable Security' })
          .setTimestamp();

        const dismissBtn = new ButtonBuilder()
          .setCustomId(`help_btn_dismiss:${message.author.id}`)
          .setLabel('Dismiss')
          .setEmoji(WRONG_EMOJI)
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(dismissBtn);

        const replyMsg = await message.reply({ embeds: [errEmbed], components: [row] }).catch(() => null);

        // Self-destruct zero-trace timer after 15 seconds
        if (replyMsg) {
          setTimeout(() => {
            replyMsg.delete().catch(() => {});
          }, 15000);
        }
        return;
      }

      const sub = rawSub || 'manager';

      // 1. Manager Dashboard Matrix
      if (sub === 'manager' || sub === 'status') {
        const npUsers = await NoPrefixManager.getNPUsers(guildId);
        const userListText = npUsers.length > 0
          ? npUsers.map(id => `• <@${id}> (\`${id}\`)`).join('\n')
          : `*No extra No-Prefix users added yet.*`;

        const card = buildLimeOverviewCard({
          title: `${VIP_ICON} NO-PREFIX USERS MANAGEMENT MATRIX`,
          subtitle: 'EXEMPT MEMBERS ELIGIBLE FOR PREFIXLESS COMMAND EXECUTION',
          color: Colors.BRAND,
          thumbnail: message.guild.iconURL({ size: 256 }) || undefined,
          sections: [
            {
              title: `${MEMBER_ICON} WHITELISTED NO-PREFIX USERS (${npUsers.length})`,
              items: [userListText]
            },
            {
              title: `${CONFIG_ICON} COMMAND SHORTCUTS & SYNTAX`,
              items: [
                `• \`${prefix}np add <@user | ID>\` — Grant No-Prefix privileges`,
                `• \`${prefix}np remove <@user | ID>\` — Revoke No-Prefix privileges`,
                `• \`${prefix}np list\` — Display active No-Prefix directory`,
                `• \`${prefix}np clean\` — Wipe all No-Prefix entries`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Unbypassable Security'
        });

        const btnAdd = new ButtonBuilder()
          .setCustomId(`np_btn_add:${message.author.id}`)
          .setLabel('Add NP Member')
          .setStyle(ButtonStyle.Success);

        const btnRemove = new ButtonBuilder()
          .setCustomId(`np_btn_remove:${message.author.id}`)
          .setLabel('Remove NP Member')
          .setStyle(ButtonStyle.Danger);

        const btnClean = new ButtonBuilder()
          .setCustomId(`np_btn_clean:${message.author.id}`)
          .setLabel('Clean All NP')
          .setStyle(ButtonStyle.Secondary);

        const btnDismiss = new ButtonBuilder()
          .setCustomId(`help_btn_dismiss:${message.author.id}`)
          .setLabel('Dismiss')
          .setEmoji(WRONG_EMOJI)
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btnAdd, btnRemove, btnClean, btnDismiss);

        return message.reply({ embeds: [card], components: [row] });
      }

      // 2. Add NP User
      if (sub === 'add') {
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
            `User ${targetUser} (\`${targetUser.id}\`) has been **granted No-Prefix command privileges**.\n`,
            `They can now execute all authorized bot commands without typing \`${prefix}\`.`
          ].join('\n'))
          .setFooter({ text: 'Secure Unbypassable Security' })
          .setTimestamp();

        const dismissBtn = new ButtonBuilder()
          .setCustomId(`help_btn_dismiss:${message.author.id}`)
          .setLabel('Dismiss')
          .setEmoji(WRONG_EMOJI)
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(dismissBtn);

        const replyMsg = await message.reply({ embeds: [successEmbed], components: [row] });
        setTimeout(() => replyMsg.delete().catch(() => {}), 15000);
        return;
      }

      // 3. Remove NP User
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
          .setFooter({ text: 'Secure Unbypassable Security' })
          .setTimestamp();

        const dismissBtn = new ButtonBuilder()
          .setCustomId(`help_btn_dismiss:${message.author.id}`)
          .setLabel('Dismiss')
          .setEmoji(WRONG_EMOJI)
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(dismissBtn);

        const replyMsg = await message.reply({ embeds: [removeEmbed], components: [row] });
        setTimeout(() => replyMsg.delete().catch(() => {}), 15000);
        return;
      }

      // 4. List NP Users
      if (sub === 'list' || sub === 'view') {
        const npUsers = await NoPrefixManager.getNPUsers(guildId);
        const listDesc = npUsers.length > 0
          ? npUsers.map(id => `> • <@${id}> (\`${id}\`)`).join('\n')
          : `*No No-Prefix users registered.*`;

        const listEmbed = new EmbedBuilder()
          .setTitle(`${VIP_ICON} Whitelisted No-Prefix Directory`)
          .setColor(Colors.BRAND)
          .setDescription(listDesc)
          .setFooter({ text: `Total Whitelisted Members: ${npUsers.length}` })
          .setTimestamp();

        const dismissBtn = new ButtonBuilder()
          .setCustomId(`help_btn_dismiss:${message.author.id}`)
          .setLabel('Dismiss')
          .setEmoji(WRONG_EMOJI)
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(dismissBtn);

        return message.reply({ embeds: [listEmbed], components: [row] });
      }

      // 5. Clean All NP Users
      if (sub === 'clean' || sub === 'clear') {
        await NoPrefixManager.cleanNPUsers(guildId);

        const cleanEmbed = new EmbedBuilder()
          .setTitle(`${APPROVED_ICON} No-Prefix Whitelist Cleared`)
          .setColor(Colors.DANGER)
          .setDescription(`All No-Prefix entries for **${message.guild.name}** have been successfully wiped.`)
          .setFooter({ text: 'Secure Unbypassable Security' })
          .setTimestamp();

        const dismissBtn = new ButtonBuilder()
          .setCustomId(`help_btn_dismiss:${message.author.id}`)
          .setLabel('Dismiss')
          .setEmoji(WRONG_EMOJI)
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(dismissBtn);

        const replyMsg = await message.reply({ embeds: [cleanEmbed], components: [row] });
        setTimeout(() => replyMsg.delete().catch(() => {}), 15000);
        return;
      }
    }
  });
}
