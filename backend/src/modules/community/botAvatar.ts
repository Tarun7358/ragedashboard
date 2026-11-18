import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';
import { BotAvatarService } from '../../services/BotAvatarService.js';
import { isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';
import {
  Colors,
  buildLimeOverviewCard,
  VERIFIED_ICON,
  WRONG_ICON,
  CONFIG_ICON,
  BRAND_FOOTER
} from '../../core/UIFactory.js';

export function registerBotAvatarCommands(): void {
  // ─────────────────────────────────────────────
  // 1. COMMAND: r!botavatar
  // ─────────────────────────────────────────────
  PrefixRegistry.register({
    name: 'botavatar',
    category: 'Community',
    description: 'Customize or reset the bot\'s avatar specifically for this server.',
    usage: 'r!botavatar <image_url | attachment | reset | view>',
    aliases: ['serveravatar', 'guildavatar', 'setbotavatar', 'botpfp'],
    cooldownSeconds: 5,
    examples: [
      'r!botavatar https://example.com/custom-pfp.png',
      'r!botavatar (with attached image file)',
      'r!botavatar reset',
      'r!botavatar view'
    ],
    moduleOwnerId: 'community',
    dangerLevel: 'Low',
    hidden: false,
    execute: async (message: any, args: string[], extra?: any) => {
      const isAuthorized =
        message.guild?.ownerId === message.author?.id ||
        message.member?.permissions?.has?.(PermissionFlagsBits.Administrator) ||
        (await isOwnerOrExtraOwner(message.author.id, message.guild).catch(() => false));

      if (!isAuthorized) {
        return message.reply({
          content: `${WRONG_ICON} **Access Denied**: Changing the bot's server avatar requires Administrator permissions or Server Ownership.`
        });
      }

      const guild = message.guild;
      if (!guild) return;

      const firstArg = (args[0] || '').toLowerCase().trim();

      // Subcommand: RESET / CLEAR
      if (firstArg === 'reset' || firstArg === 'clear' || firstArg === 'default' || firstArg === 'remove') {
        const resetRes = await BotAvatarService.resetServerAvatar(guild, message.author.id);
        if (!resetRes.success) {
          return message.reply({
            content: `${WRONG_ICON} **Failed to reset server avatar**: ${resetRes.error}`
          });
        }

        const globalAvatar = guild.client.user?.displayAvatarURL({ size: 1024 });
        const resetEmbed = new EmbedBuilder()
          .setColor(Colors.LIME)
          .setTitle(`${VERIFIED_ICON} Bot Server Avatar Reset`)
          .setDescription([
            '> The bot\'s server avatar has been **reset to default**.',
            '> It will now display the global Rage Optimiser brand avatar.',
            '',
            `> **Updated By**: <@${message.author.id}>`
          ].join('\n'))
          .setThumbnail(globalAvatar || null)
          .setFooter({ text: BRAND_FOOTER })
          .setTimestamp();

        return message.reply({ embeds: [resetEmbed] });
      }

      // Subcommand: VIEW / STATUS (or no input and no attachments)
      const attachment = message.attachments?.first();
      const hasImageInput = Boolean(attachment || (args.length > 0 && /^https?:\/\//i.test(args[0])));

      if (!hasImageInput && (firstArg === 'view' || firstArg === 'status' || firstArg === 'info' || args.length === 0)) {
        const stored = await BotAvatarService.getCustomization(guild.id);
        const meMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
        const currentAvatar = meMember?.displayAvatarURL({ size: 1024 }) || guild.client.user?.displayAvatarURL({ size: 1024 });
        const hasCustomAvatar = Boolean(meMember?.avatar || stored?.serverAvatarUrl);

        const card = buildLimeOverviewCard({
          title: 'BOT SERVER AVATAR STATUS',
          subtitle: `BRAND CUSTOMIZATION • ${guild.name.toUpperCase()}`,
          color: Colors.LIME,
          thumbnail: currentAvatar,
          sections: [
            {
              title: 'CURRENT CONFIGURATION',
              items: [
                `• **Server Avatar**: ${hasCustomAvatar ? '`Custom Server Avatar Active`' : '`Global Default Avatar`'}`,
                `• **Server Nickname**: ${meMember?.nickname ? `\`${meMember.nickname}\`` : '`Default (None)`'}`,
                `• **Last Updated By**: ${stored?.updatedBy ? `<@${stored.updatedBy}>` : '`Not Recorded`'}`
              ]
            },
            {
              title: 'HOW TO UPDATE',
              items: [
                '• `r!botavatar <image_url>` — Set from direct link',
                '• `r!botavatar` (upload file) — Set by attaching an image',
                '• `r!botavatar reset` — Restore default global avatar',
                '• `r!botnick <nickname>` — Change bot nickname in this server'
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Guild Customization'
        });

        return message.reply({ embeds: [card] });
      }

      // Action: APPLY NEW AVATAR
      let imageSource: string | Buffer;
      if (attachment && attachment.url) {
        imageSource = attachment.url;
      } else if (args[0] && /^https?:\/\//i.test(args[0])) {
        imageSource = args[0];
      } else {
        const syntaxCard = new EmbedBuilder()
          .setColor(Colors.WARN)
          .setTitle(`${CONFIG_ICON} Configure Bot Server Avatar`)
          .setDescription([
            '> **Usage**: `r!botavatar <image_url | file attachment>`',
            '> **Reset**: `r!botavatar reset`',
            '> **Status**: `r!botavatar view`',
            '',
            '> **Example**: `r!botavatar https://i.imgur.com/example.png`',
            '> *(You can also type `r!botavatar` and attach an image file directly)*'
          ].join('\n'))
          .setFooter({ text: BRAND_FOOTER });

        return message.reply({ embeds: [syntaxCard] });
      }

      const statusMsg = await message.reply({
        content: '<a:loading:1546134304625528882> Downloading and validating server avatar with Discord API...'
      });

      const applyRes = await BotAvatarService.setServerAvatar(guild, imageSource, message.author.id);

      if (!applyRes.success) {
        return statusMsg.edit({
          content: `${WRONG_ICON} **Failed to update server avatar**: ${applyRes.error}`
        });
      }

      const meMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
      const updatedAvatar = meMember?.displayAvatarURL({ size: 1024 }) || applyRes.avatarUrl;

      const successCard = new EmbedBuilder()
        .setColor(Colors.LIME)
        .setTitle(`${VERIFIED_ICON} Bot Server Avatar Updated`)
        .setDescription([
          `> Rage Optimiser's avatar for **${guild.name}** has been updated!`,
          '',
          `> **Updated By**: <@${message.author.id}>`,
          `> **Scope**: Local to **${guild.name}** only`,
          '> **Reversion**: Run `r!botavatar reset` anytime to revert.'
        ].join('\n'))
        .setImage(updatedAvatar || null)
        .setThumbnail(updatedAvatar || null)
        .setFooter({ text: 'Rage Optimiser Enterprise • Local Guild Customization' })
        .setTimestamp();

      return statusMsg.edit({ content: '', embeds: [successCard] });
    }
  });

  // ─────────────────────────────────────────────
  // 2. COMPANION COMMAND: r!botnick
  // ─────────────────────────────────────────────
  PrefixRegistry.register({
    name: 'botnick',
    category: 'Community',
    description: 'Change or reset the bot\'s display nickname in this server.',
    usage: 'r!botnick <nickname | reset>',
    aliases: ['botname', 'setbotnick', 'serverbotnick'],
    cooldownSeconds: 3,
    examples: [
      'r!botnick Clutch Sentinel',
      'r!botnick reset'
    ],
    moduleOwnerId: 'community',
    dangerLevel: 'Low',
    hidden: false,
    execute: async (message: any, args: string[], extra?: any) => {
      const isAuthorized =
        message.guild?.ownerId === message.author?.id ||
        message.member?.permissions?.has?.(PermissionFlagsBits.Administrator) ||
        (await isOwnerOrExtraOwner(message.author.id, message.guild).catch(() => false));

      if (!isAuthorized) {
        return message.reply({
          content: `${WRONG_ICON} **Access Denied**: Changing the bot's server nickname requires Administrator permissions or Server Ownership.`
        });
      }

      const guild = message.guild;
      if (!guild) return;

      const rawInput = args.join(' ').trim();
      if (!rawInput || rawInput.toLowerCase() === 'reset' || rawInput.toLowerCase() === 'clear') {
        const resetRes = await BotAvatarService.setServerNickname(guild, null, message.author.id);
        if (!resetRes.success) {
          return message.reply({ content: `${WRONG_ICON} **Failed to reset nickname**: ${resetRes.error}` });
        }
        return message.reply({
          content: `${VERIFIED_ICON} Bot nickname reset to default in **${guild.name}**.`
        });
      }

      if (rawInput.length > 32) {
        return message.reply({
          content: `${WRONG_ICON} **Invalid Nickname**: Discord nicknames cannot exceed 32 characters.`
        });
      }

      const nickRes = await BotAvatarService.setServerNickname(guild, rawInput, message.author.id);
      if (!nickRes.success) {
        return message.reply({ content: `${WRONG_ICON} **Failed to set nickname**: ${nickRes.error}` });
      }

      return message.reply({
        content: `${VERIFIED_ICON} Bot server nickname updated to **${rawInput}** in **${guild.name}**.`
      });
    }
  });

  // ─────────────────────────────────────────────
  // 3. COMMAND: r!botbanner (Global Profile Banner)
  // ─────────────────────────────────────────────
  PrefixRegistry.register({
    name: 'botbanner',
    category: 'System',
    description: 'Customize or reset the bot\'s global Discord user profile banner.',
    usage: 'r!botbanner <image_url | attachment | reset | view>',
    aliases: ['setbanner', 'setbotbanner', 'globalbanner'],
    cooldownSeconds: 10,
    examples: [
      'r!botbanner https://example.com/banner.png',
      'r!botbanner (with attached image file)',
      'r!botbanner reset',
      'r!botbanner view'
    ],
    moduleOwnerId: 'community',
    dangerLevel: 'High',
    hidden: false,
    execute: async (message: any, args: string[], extra?: any) => {
      const { PrefixPermissionManager } = await import('../../core/prefix/PrefixPermissionManager.js');
      const isOwner =
        message.author.id === '830993126301630485' ||
        PrefixPermissionManager.isDeveloper(message.author.id, message) ||
        message.guild?.ownerId === message.author.id;

      if (!isOwner) {
        return message.reply({
          content: `${WRONG_ICON} **Access Denied**: Modifying the bot's global profile banner is strictly restricted to the **Bot Owner / Developer**.`
        });
      }

      const client = message.client;
      const firstArg = (args[0] || '').toLowerCase().trim();

      // Subcommand: RESET / CLEAR
      if (firstArg === 'reset' || firstArg === 'clear' || firstArg === 'default' || firstArg === 'remove') {
        const resetRes = await BotAvatarService.resetGlobalBanner(client);
        if (!resetRes.success) {
          return message.reply({
            content: `${WRONG_ICON} **Failed to reset banner**: ${resetRes.error}`
          });
        }

        const resetEmbed = new EmbedBuilder()
          .setColor(Colors.LIME)
          .setTitle(`${VERIFIED_ICON} Bot Profile Banner Reset`)
          .setDescription([
            '> The bot\'s global profile banner has been **cleared**.',
            '',
            `> **Updated By**: <@${message.author.id}>`
          ].join('\n'))
          .setFooter({ text: BRAND_FOOTER })
          .setTimestamp();

        return message.reply({ embeds: [resetEmbed] });
      }

      // Subcommand: VIEW / STATUS
      const attachment = message.attachments?.first();
      const hasImageInput = Boolean(attachment || (args.length > 0 && /^https?:\/\//i.test(args[0])));

      if (!hasImageInput && (firstArg === 'view' || firstArg === 'status' || firstArg === 'info' || args.length === 0)) {
        await client.user?.fetch().catch(() => null);
        const currentBanner = client.user?.bannerURL({ size: 1024 });

        const viewEmbed = new EmbedBuilder()
          .setColor(Colors.BRAND)
          .setTitle(`${CONFIG_ICON} Bot Global Profile Banner`)
          .setDescription([
            '> **Discord User Profile Banner**',
            '> This banner appears at the top of the bot\'s user profile card Discord-wide.',
            '',
            `> **Current Banner**: ${currentBanner ? `[Direct Link](${currentBanner})` : '`None (Default Black)`'}`,
            '',
            '**Command Reference**',
            '> • `r!botbanner <image_url>` — Set from image URL',
            '> • `r!botbanner` (with upload) — Set from attached file',
            '> • `r!botbanner reset` — Clear banner back to default',
            '',
            '-# Note: Discord rate-limits global banner changes to twice per 10 minutes.'
          ].join('\n'))
          .setImage(currentBanner || null)
          .setFooter({ text: BRAND_FOOTER })
          .setTimestamp();

        return message.reply({ embeds: [viewEmbed] });
      }

      // Action: APPLY BANNER
      let imageSource: string | Buffer;
      if (attachment && attachment.url) {
        imageSource = attachment.url;
      } else if (args[0] && /^https?:\/\//i.test(args[0])) {
        imageSource = args[0];
      } else {
        const syntaxCard = new EmbedBuilder()
          .setColor(Colors.WARN)
          .setTitle(`${CONFIG_ICON} Configure Global Bot Profile Banner`)
          .setDescription([
            '> **Usage**: `r!botbanner <image_url | file attachment>`',
            '> **Reset**: `r!botbanner reset`',
            '> **Status**: `r!botbanner view`',
            '',
            '> **Recommended Size**: `600x240` or `1100x440` (Aspect ratio ~2.5:1, under 8 MB)',
            '> *(You can also type `r!botbanner` and attach an image file directly)*'
          ].join('\n'))
          .setFooter({ text: BRAND_FOOTER });

        return message.reply({ embeds: [syntaxCard] });
      }

      const statusMsg = await message.reply({
        content: '<a:loading:1546134304625528882> Uploading and updating global profile banner via Discord REST API...'
      });

      const applyRes = await BotAvatarService.setGlobalBanner(client, imageSource);

      if (!applyRes.success) {
        return statusMsg.edit({
          content: `${WRONG_ICON} **Failed to update banner**: ${applyRes.error}`
        });
      }

      await client.user?.fetch().catch(() => null);
      const newBannerUrl = applyRes.bannerUrl || client.user?.bannerURL({ size: 1024 });

      const successCard = new EmbedBuilder()
        .setColor(Colors.LIME)
        .setTitle(`${VERIFIED_ICON} Bot Global Profile Banner Updated`)
        .setDescription([
          `> Rage Optimiser's Discord profile banner has been successfully updated!`,
          '',
          `> **Updated By**: <@${message.author.id}>`,
          `> **Scope**: Global (Appears across all servers in profile popout)`,
          '> **Reversion**: Run `r!botbanner reset` anytime to revert.'
        ].join('\n'))
        .setImage(newBannerUrl || null)
        .setFooter({ text: 'Rage Optimiser Enterprise • Global Profile Customization' })
        .setTimestamp();

      return statusMsg.edit({ content: '', embeds: [successCard] });
    }
  });
}

