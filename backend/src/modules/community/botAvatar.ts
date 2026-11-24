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
  // 3. COMMAND: r!botbanner (Server Profile Banner)
  // ─────────────────────────────────────────────
  PrefixRegistry.register({
    name: 'botbanner',
    category: 'Community',
    description: 'Customize or reset the bot\'s profile banner specifically for this server.',
    usage: 'r!botbanner <image_url | attachment | reset | view> [--global]',
    aliases: ['serverbanner', 'guildbanner', 'setbotbanner', 'setbanner'],
    cooldownSeconds: 5,
    examples: [
      'r!botbanner https://example.com/banner.png',
      'r!botbanner (with attached image file)',
      'r!botbanner reset',
      'r!botbanner view',
      'r!botbanner https://example.com/banner.png --global (Bot Developer only)'
    ],
    moduleOwnerId: 'community',
    dangerLevel: 'Low',
    hidden: false,
    execute: async (message: any, args: string[], extra?: any) => {
      const guild = message.guild;
      if (!guild) return;

      const { PrefixPermissionManager } = await import('../../core/prefix/PrefixPermissionManager.js');
      const isDevOrBotOwner =
        message.author.id === '830993126301630485' ||
        PrefixPermissionManager.isDeveloper(message.author.id, message);

      const isServerAuthorized =
        guild.ownerId === message.author?.id ||
        message.member?.permissions?.has?.(PermissionFlagsBits.Administrator) ||
        (await isOwnerOrExtraOwner(message.author.id, guild).catch(() => false)) ||
        isDevOrBotOwner;

      if (!isServerAuthorized) {
        return message.reply({
          content: `${WRONG_ICON} **Access Denied**: Changing the bot's server banner requires Administrator permissions or Server Ownership.`
        });
      }

      const isGlobal = args.some(a => a.toLowerCase() === '--global' || a.toLowerCase() === '-g');
      if (isGlobal && !isDevOrBotOwner) {
        return message.reply({
          content: `${WRONG_ICON} **Access Denied**: Modifying the bot's global Discord profile banner is strictly restricted to the **Bot Developer**.`
        });
      }

      // Filter out --global flag from args for input handling
      const cleanArgs = args.filter(a => a.toLowerCase() !== '--global' && a.toLowerCase() !== '-g');
      const firstArg = (cleanArgs[0] || '').toLowerCase().trim();

      // ─────────────────────────────────────────
      // GLOBAL SCOPE (Developer only with --global)
      // ─────────────────────────────────────────
      if (isGlobal) {
        const client = message.client;

        if (firstArg === 'reset' || firstArg === 'clear' || firstArg === 'default' || firstArg === 'remove') {
          const resetRes = await BotAvatarService.resetGlobalBanner(client);
          if (!resetRes.success) {
            return message.reply({
              content: `${WRONG_ICON} **Failed to reset global banner**: ${resetRes.error}`
            });
          }

          const resetEmbed = new EmbedBuilder()
            .setColor(Colors.LIME)
            .setTitle(`${VERIFIED_ICON} Bot Global Profile Banner Reset`)
            .setDescription([
              '> The bot\'s global profile banner has been **cleared**.',
              '',
              `> **Updated By**: <@${message.author.id}>`
            ].join('\n'))
            .setFooter({ text: BRAND_FOOTER })
            .setTimestamp();

          return message.reply({ embeds: [resetEmbed] });
        }

        const attachment = message.attachments?.first();
        const hasImageInput = Boolean(attachment || (cleanArgs.length > 0 && /^https?:\/\//i.test(cleanArgs[0])));

        if (!hasImageInput) {
          await client.user?.fetch().catch(() => null);
          const currentBanner = client.user?.bannerURL({ size: 1024 });

          const viewEmbed = new EmbedBuilder()
            .setColor(Colors.BRAND)
            .setTitle(`${CONFIG_ICON} Bot Global Profile Banner`)
            .setDescription([
              '> **Discord User Profile Banner (Global)**',
              '> This banner appears at the top of the bot\'s user profile card across all servers.',
              '',
              `> **Current Banner**: ${currentBanner ? `[Direct Link](${currentBanner})` : '`None (Default Black)`'}`,
              '',
              '**Command Reference**',
              '> • `r!botbanner <image_url> --global` — Set global banner',
              '> • `r!botbanner reset --global` — Clear global banner'
            ].join('\n'))
            .setImage(currentBanner || null)
            .setFooter({ text: BRAND_FOOTER })
            .setTimestamp();

          return message.reply({ embeds: [viewEmbed] });
        }

        let imageSource: string | Buffer = attachment ? attachment.url : cleanArgs[0];
        const statusMsg = await message.reply({
          content: '<a:loading:1546134304625528882> Uploading and updating global profile banner via Discord REST API...'
        });

        const applyRes = await BotAvatarService.setGlobalBanner(client, imageSource);
        if (!applyRes.success) {
          return statusMsg.edit({
            content: `${WRONG_ICON} **Failed to update global banner**: ${applyRes.error}`
          });
        }

        await client.user?.fetch().catch(() => null);
        const newBannerUrl = applyRes.bannerUrl || client.user?.bannerURL({ size: 1024 });

        const successCard = new EmbedBuilder()
          .setColor(Colors.LIME)
          .setTitle(`${VERIFIED_ICON} Bot Global Profile Banner Updated`)
          .setDescription([
            `> Rage Optimiser's global profile banner has been updated!`,
            '',
            `> **Updated By**: <@${message.author.id}>`,
            `> **Scope**: Global (Appears across all servers in profile popout)`
          ].join('\n'))
          .setImage(newBannerUrl || null)
          .setFooter({ text: 'Rage Optimiser Enterprise • Global Customization' })
          .setTimestamp();

        return statusMsg.edit({ content: '', embeds: [successCard] });
      }

      // ─────────────────────────────────────────
      // SERVER SCOPE (Per-Server Profile Banner)
      // ─────────────────────────────────────────

      // Subcommand: RESET / CLEAR
      if (firstArg === 'reset' || firstArg === 'clear' || firstArg === 'default' || firstArg === 'remove') {
        const resetRes = await BotAvatarService.resetServerBanner(guild, message.author.id);
        if (!resetRes.success) {
          return message.reply({
            content: `${WRONG_ICON} **Failed to reset server banner**: ${resetRes.error}`
          });
        }

        const resetEmbed = new EmbedBuilder()
          .setColor(Colors.LIME)
          .setTitle(`${VERIFIED_ICON} Bot Server Profile Banner Reset`)
          .setDescription([
            `> The bot's profile banner for **${guild.name}** has been **reset to default**.`,
            '> It will now display the global profile banner or default theme.',
            '',
            `> **Updated By**: <@${message.author.id}>`
          ].join('\n'))
          .setFooter({ text: BRAND_FOOTER })
          .setTimestamp();

        return message.reply({ embeds: [resetEmbed] });
      }

      // Subcommand: VIEW / STATUS
      const attachment = message.attachments?.first();
      const hasImageInput = Boolean(attachment || (cleanArgs.length > 0 && /^https?:\/\//i.test(cleanArgs[0])));

      if (!hasImageInput && (firstArg === 'view' || firstArg === 'status' || firstArg === 'info' || cleanArgs.length === 0)) {
        const stored = await BotAvatarService.getCustomization(guild.id);
        const meMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
        const currentBanner = (meMember as any)?.bannerURL?.({ size: 1024 }) || stored?.serverBannerUrl;

        const viewEmbed = new EmbedBuilder()
          .setColor(Colors.BRAND)
          .setTitle(`${CONFIG_ICON} Bot Server Profile Banner`)
          .setDescription([
            `> **Per-Server Profile Banner — ${guild.name}**`,
            `> This banner appears exclusively when viewing the bot inside **${guild.name}**.`,
            `> The bot's global profile across other servers is completely unaffected.`,
            '',
            `> **Current Server Banner**: ${currentBanner ? `[Direct Link](${currentBanner})` : '`None (Default Global Banner)`'}`,
            `> **Last Updated By**: ${stored?.updatedBy ? `<@${stored.updatedBy}>` : '`Not Recorded`'}`,
            '',
            '**Command Reference**',
            '> • `r!botbanner <image_url>` — Set server profile banner from direct link',
            '> • `r!botbanner` (upload file) — Set server profile banner by attaching an image',
            '> • `r!botbanner reset` — Clear server profile banner back to default'
          ].join('\n'))
          .setImage(currentBanner || null)
          .setFooter({ text: `${guild.name} • Server Profile Customization` })
          .setTimestamp();

        return message.reply({ embeds: [viewEmbed] });
      }

      // Action: APPLY SERVER BANNER
      let imageSource: string | Buffer;
      if (attachment && attachment.url) {
        imageSource = attachment.url;
      } else if (cleanArgs[0] && /^https?:\/\//i.test(cleanArgs[0])) {
        imageSource = cleanArgs[0];
      } else {
        const syntaxCard = new EmbedBuilder()
          .setColor(Colors.WARN)
          .setTitle(`${CONFIG_ICON} Configure Server Bot Profile Banner`)
          .setDescription([
            '> **Usage**: `r!botbanner <image_url | file attachment>`',
            '> **Reset**: `r!botbanner reset`',
            '> **Status**: `r!botbanner view`',
            '',
            '> **Recommended Size**: `600x240` or `1100x440` (Aspect ratio ~2.5:1, under 8 MB)',
            `> **Scope**: Changes the bot's banner **only inside ${guild.name}** without affecting other servers.`,
            '',
            '> *(You can also type `r!botbanner` and attach an image file directly)*'
          ].join('\n'))
          .setFooter({ text: BRAND_FOOTER });

        return message.reply({ embeds: [syntaxCard] });
      }

      const statusMsg = await message.reply({
        content: `<a:loading:1546134304625528882> Uploading and updating bot server profile banner for **${guild.name}**...`
      });

      const applyRes = await BotAvatarService.setServerBanner(guild, imageSource, message.author.id);

      if (!applyRes.success) {
        return statusMsg.edit({
          content: `${WRONG_ICON} **Failed to update server banner**: ${applyRes.error}`
        });
      }

      const meMember = await guild.members.fetchMe().catch(() => null);
      const newBannerUrl = applyRes.bannerUrl || (meMember as any)?.bannerURL?.({ size: 1024 });

      const successCard = new EmbedBuilder()
        .setColor(Colors.LIME)
        .setTitle(`${VERIFIED_ICON} Bot Server Profile Banner Updated`)
        .setDescription([
          `> The bot's profile banner for **${guild.name}** has been successfully updated!`,
          '',
          `> **Updated By**: <@${message.author.id}>`,
          `> **Scope**: **${guild.name} Only** (Per-server profile banner)`,
          '> **Note**: Global bot profile in other servers remains untouched.',
          '> **Reversion**: Run `r!botbanner reset` anytime to restore default.'
        ].join('\n'))
        .setImage(newBannerUrl || null)
        .setFooter({ text: `Rage Optimiser Enterprise • ${guild.name} Customization` })
        .setTimestamp();

      return statusMsg.edit({ content: '', embeds: [successCard] });
    }
  });
}

