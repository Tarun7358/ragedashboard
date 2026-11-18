import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { IPromotionConfig, IPromotionMessage } from '../../models/index.js';
import {
  Colors, Embeds, Components,
  buildRichCard, buildStatusCard, buildLimeOverviewCard, buildMinimalAction,
  VERIFIED_ICON, WRONG_ICON, SHIELD_ICON, CONFIG_ICON, BOT_ICON, LINK_ICON, MEMBER_ICON, TIMER_ICON, INFO_ICON,
  YOUTUBE_ICON, DISCORD_ICON, INSTAGRAM_ICON, TWITTER_ICON, FREE_FIRE_ICON, VALO_ICON
} from '../../core/UIFactory.js';
import { isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';

const LINK_REGEX = /(?:https?:\/\/|ftps?:\/\/|www\.|discord(?:app)?\.(?:gg|com|io|me)|dsc\.gg|disboard\.org|[a-zA-Z0-9-]+\.(?:com|net|org|gg|io|me|xyz|co|uk|in|info|online|site|app|tech|store|top|live|shop|vip|fun|club|pro|link|bot|ai|dev|[a-zA-Z]{2,})\b)/i;

function parseReactionEmoji(emojiStr: string): string {
  if (!emojiStr) return 'approved:1532390590707142956';
  const match = emojiStr.match(/<a?:?([a-zA-Z0-9_]+):(\d+)>/);
  if (match) {
    return `${match[1]}:${match[2]}`;
  }
  const idMatch = emojiStr.match(/\d{17,20}/);
  if (idMatch) return idMatch[0];
  return emojiStr;
}

function getDefaultConfig(): IPromotionConfig {
  return {
    enabled: true,
    channelId: null,
    autoDeleteHours: 24,
    cleanupNoticeType: 'channel_notice',
    requireLink: false,
    userCooldownHours: 24,
    autoReact: true,
    reactionEmoji: VERIFIED_ICON,
    activeMessages: []
  };
}

async function syncAntiLinkIgnoredChannel(context: any, guildId: string, channelId: string) {
  try {
    const modules = context.getModulesState ? context.getModulesState(guildId) : [];
    const amMod = modules.find((m: any) => m.id === 'automod');
    if (amMod) {
      const config = amMod.config || {};
      const ignoredChannels: string[] = config.ignoredChannels || [];
      if (!ignoredChannels.includes(channelId)) {
        ignoredChannels.push(channelId);
        context.updateModuleConfig('automod', { ...config, ignoredChannels });
        context.logSyncEvent(`[Promotion] Excused channel <#${channelId}> in AntiLink ignored list.`, 'success');
      }
    }
  } catch (err) {
    console.error('[Promotion] Error syncing AntiLink ignored channel:', err);
  }
}

export const PromotionManifest: ModuleManifest = {
  id: 'promotion',
  name: 'Promotion Channel Engine',
  version: '1.0.0',
  description: 'Enterprise Promotion Channel setup, 24-hour auto-clearing, AntiLink excusal integration, and customizable cleanup notifications.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      return { progress: 100, errors: [] };
    }
  },
  commands: [
    {
      name: 'promotion',
      description: 'Enterprise Promotion Channel management engine',
      options: [
        {
          name: 'setup',
          description: 'Auto-create dedicated `. Promo` text channel with slowmode and pinned info card',
          type: 1
        },
        {
          name: 'set',
          description: 'Set an existing text channel for promotion',
          type: 1,
          options: [
            {
              name: 'channel',
              type: 7,
              description: 'Target promotion channel',
              required: true,
              channel_types: [0]
            }
          ]
        },
        {
          name: 'config',
          description: 'Configure promotion auto-delete timer, link rules & user cooldowns',
          type: 1,
          options: [
            {
              name: 'timer',
              type: 4,
              description: 'Auto-delete expiration timer in hours (default: 24)',
              required: false
            },
            {
              name: 'require_link',
              type: 5,
              description: 'Require messages to contain promotional links (default: true)',
              required: false
            },
            {
              name: 'cooldown',
              type: 4,
              description: 'User posting cooldown in hours (default: 24)',
              required: false
            }
          ]
        },
        {
          name: 'enable',
          description: 'Enable promotion channel engine',
          type: 1
        },
        {
          name: 'disable',
          description: 'Disable promotion channel engine',
          type: 1
        },
        {
          name: 'status',
          description: 'View active promotion channel status & active tracked messages',
          type: 1
        },
        {
          name: 'clear',
          description: 'Manually purge expired promotional messages immediately',
          type: 1
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_promotion',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        if (!guild) {
          return interaction.reply({ content: `${WRONG_ICON} Promotion commands can only be run inside a server.`, flags: 64 });
        }

        const isAuthorized = await isOwnerOrExtraOwner(interaction.user.id, guild);
        if (!isAuthorized) {
          return interaction.reply({ content: `${WRONG_ICON} Access Denied: Server Owner & Extra Owner permission required.`, flags: 64 });
        }

        const modules = context.getModulesState ? context.getModulesState(guild.id) : [];
        const promoMod = modules.find((m: any) => m.id === 'promotion');
        const config: IPromotionConfig = { ...getDefaultConfig(), ...(promoMod?.config || {}) };
        const saveConfig = (updated: Partial<IPromotionConfig>) => context.updateModuleConfig('promotion', { ...config, ...updated });

        const sub = interaction.options?.getSubcommand(false) || interaction.parsed?.args?.[0]?.toLowerCase() || 'status';

        // ─── SETUP (AUTO-CREATE CHANNEL ". Promo") ─────────────────────
        if (sub === 'setup' || sub === 'create') {
          await interaction.deferReply({ flags: 64 });

          try {
            // Create text channel ". Promo" with Admin-only send permissions
            const newChannel = await guild.channels.create({
              name: '. Promo',
              type: ChannelType.GuildText,
              topic: 'Official Server Promotion Channel • Read-only for members (Admins post promotions) • Auto-clears after 24h!',
              rateLimitPerUser: 15, // 15s slowmode
              permissionOverwrites: [
                {
                  id: guild.roles.everyone.id,
                  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                  deny: [PermissionFlagsBits.SendMessages]
                },
                {
                  id: client.user.id,
                  allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.ManageMessages
                  ]
                }
              ],
              reason: 'Rage Optimiser Enterprise Promotion Channel Setup'
            });

            config.channelId = newChannel.id;
            config.enabled = true;
            saveConfig(config);

            // Send pinned guidelines embed in the created channel
            const infoCard = buildLimeOverviewCard({
              title: `${LINK_ICON} OFFICIAL SERVER PROMOTION CHANNEL`,
              subtitle: `OFFICIAL PROMOTIONS & ANNOUNCEMENTS HUB`,
              color: Colors.BRAND,
              sections: [
                {
                  title: `${LINK_ICON} PROMOTION RULES & INFORMATION`,
                  items: [
                    '• **Channel Access**: Read-only for members (Admins post promotions).',
                    '• **Auto-Clear Timer**: Promotional messages auto-delete after **24 Hours** by default.',
                    `• **Featured Links**: ${DISCORD_ICON} Discord Invites, ${YOUTUBE_ICON} YouTube, ${INSTAGRAM_ICON} Instagram, ${TWITTER_ICON} Twitter, ${FREE_FIRE_ICON} Free Fire & Websites.`
                  ]
                },
                {
                  title: `${TIMER_ICON} AUTO-CLEANUP SUMMARY`,
                  items: [
                    'When promotional posts reach 24 hours, the bot will clean the channel and post a cleanup recap right here!'
                  ]
                }
              ],
              footerText: 'Rage Optimiser Enterprise • Promotion Channel Engine'
            });

            const pinnedMsg = await newChannel.send({ embeds: [infoCard] }).catch(() => null);
            if (pinnedMsg) await pinnedMsg.pin().catch(() => null);

            context.logSyncEvent(`[Promotion] Auto-created admin-only promotion channel #${newChannel.name} (${newChannel.id}).`, 'success');

            return interaction.editReply({
              content: `${VERIFIED_ICON} Dedicated promotion channel ${newChannel} (**\`. Promo\`**) created successfully!\n• Permissions: **Read-Only for Members (Admins & Bot send)**\n• Auto-Clear: **24 Hours**\n• AntiLink: **Standard**`
            });
          } catch (err: any) {
            console.error('[Promotion] Setup channel creation error:', err);
            return interaction.editReply({ content: `${WRONG_ICON} Failed to create promotion channel: ${err.message}` });
          }
        }

        // ─── SET (BIND EXISTING CHANNEL) ──────────────────────────────
        if (sub === 'set' || sub === 'bind') {
          let targetChannel = interaction.options?.getChannel?.('channel') || interaction.message?.mentions?.channels?.first();
          
          if (!targetChannel) {
            const cleanArg = interaction.parsed?.args?.[1]?.replace(/[<#>]/g, '').trim();
            if (cleanArg) {
              targetChannel = guild.channels.cache.get(cleanArg);
            }
          }

          if (!targetChannel) {
            return interaction.reply({ content: `${WRONG_ICON} Please mention or select a target text channel. Example: \`r!promo set #promotions\``, flags: 64 });
          }

          config.channelId = targetChannel.id;
          config.enabled = true;
          saveConfig(config);

          context.logSyncEvent(`[Promotion] Set promotion channel to #${targetChannel.name}.`, 'success');

          const embed = buildStatusCard({
            emoji: LINK_ICON,
            title: 'Promotion Channel Configured',
            body: `Target channel set to ${targetChannel}.\n• Messages will auto-clear after **${config.autoDeleteHours} hours**.\n• AntiLink operates as usual unless ${targetChannel} is added to AutoMod ignored channels.`,
            accentColor: Colors.BRAND
          });

          return interaction.reply({ embeds: [embed.embeds[0]], flags: 64 });
        }

        // ─── CONFIG (TIMER, REQUIRE_LINK, COOLDOWN) ────────────────────
        if (sub === 'config' || sub === 'configure') {
          const timerOpt = interaction.options?.getInteger?.('timer');
          const requireLinkOpt = interaction.options?.getBoolean?.('require_link');
          const cooldownOpt = interaction.options?.getInteger?.('cooldown');

          const rawArgs = interaction.parsed?.args || [];
          let updated = false;

          if (timerOpt !== null && timerOpt !== undefined) {
            config.autoDeleteHours = Math.max(1, timerOpt);
            updated = true;
          } else if (rawArgs.includes('timer')) {
            const idx = rawArgs.indexOf('timer');
            const val = parseInt(rawArgs[idx + 1]);
            if (!isNaN(val) && val > 0) {
              config.autoDeleteHours = val;
              updated = true;
            }
          }

          if (requireLinkOpt !== null && requireLinkOpt !== undefined) {
            config.requireLink = requireLinkOpt;
            updated = true;
          }

          if (cooldownOpt !== null && cooldownOpt !== undefined) {
            config.userCooldownHours = Math.max(0, cooldownOpt);
            updated = true;
          }

          saveConfig(config);
          context.logSyncEvent(`[Promotion] Configured timer=${config.autoDeleteHours}h, requireLink=${config.requireLink}`, 'info');

          const statusEmbed = buildLimeOverviewCard({
            title: 'PROMOTION CHANNEL CONFIGURATION',
            subtitle: 'LIVE ENGINE SETTINGS MATRIX',
            color: Colors.BRAND,
            sections: [
              {
                title: `${CONFIG_ICON} CURRENT PARAMETERS`,
                items: [
                  `• **Target Channel**: ${config.channelId ? `<#${config.channelId}>` : '*Not Set (Run r!promo setup)*'}`,
                  `• **Auto-Clear Lifespan**: \`${config.autoDeleteHours} Hours\``,
                  `• **Require Link**: ${config.requireLink ? `${VERIFIED_ICON} Yes` : `${WRONG_ICON} No`}`,
                  `• **Poster Cooldown**: \`${config.userCooldownHours} Hours\``,
                  `• **AntiLink Filtering**: Standard (Requires channel to be added to AutoMod ignored channels if link excusal is desired)`
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Promotion Engine'
          });

          return interaction.reply({ embeds: [statusEmbed], flags: 64 });
        }

        // ─── ENABLE / DISABLE ─────────────────────────────────────────
        if (sub === 'enable' || sub === 'on') {
          config.enabled = true;
          saveConfig(config);
          context.logSyncEvent(`[Promotion] Engine enabled.`, 'success');
          return interaction.reply({ content: `${VERIFIED_ICON} Promotion channel engine is now **ENABLED**.`, flags: 64 });
        }

        if (sub === 'disable' || sub === 'off') {
          config.enabled = false;
          saveConfig(config);
          context.logSyncEvent(`[Promotion] Engine disabled.`, 'warn');
          return interaction.reply({ content: `${WRONG_ICON} Promotion channel engine is now **DISABLED**.`, flags: 64 });
        }

        // ─── CLEAR (MANUAL IMMEDIATE PURGE) ───────────────────────────
        if (sub === 'clear' || sub === 'purge') {
          // Immediately delete the trigger message (r!promo clear / r!clear)
          if (interaction.message && typeof interaction.message.delete === 'function') {
            await interaction.message.delete().catch(() => null);
          }

          if (!config.channelId) {
            return interaction.reply({ content: `${WRONG_ICON} No promotion channel is configured. Run \`r!promo setup\` first.`, flags: 64 });
          }

          const targetChannel = await guild.channels.fetch(config.channelId).catch(() => null);
          if (!targetChannel || !targetChannel.isTextBased()) {
            return interaction.reply({ content: `${WRONG_ICON} Configured promotion channel was not found.`, flags: 64 });
          }

          let deletedCount = 0;
          const activeMsgs = config.activeMessages || [];

          // 1. Delete all tracked promo messages
          for (const msgMeta of activeMsgs) {
            try {
              const msg = await targetChannel.messages.fetch(msgMeta.messageId).catch(() => null);
              if (msg && !msg.pinned) {
                await msg.delete().catch(() => null);
                deletedCount++;
              }
            } catch (e) {}
          }

          // 2. Fetch recent messages in channel and delete non-pinned messages
          try {
            const recentMsgs = await targetChannel.messages.fetch({ limit: 100 }).catch(() => null);
            if (recentMsgs && recentMsgs.size > 0) {
              const toDelete = recentMsgs.filter((m: any) => !m.pinned);
              for (const [_, msg] of toDelete) {
                await msg.delete().catch(() => null);
                deletedCount++;
              }
            }
          } catch (e) {}

          // 3. Reset activeMessages array COMPLETELY so all user cooldowns are cleared!
          config.activeMessages = [];
          saveConfig(config);

          context.logSyncEvent(`[Promotion] Manually cleared promotion channel #${targetChannel.name} and reset all user cooldowns.`, 'info');

          const noticeCard = buildLimeOverviewCard({
            title: `${TIMER_ICON} PROMOTION RESET NOTICE`,
            subtitle: `ALL PREVIOUS PROMOTIONS COMPLETED`,
            color: Colors.BRAND,
            sections: [
              {
                title: `${VERIFIED_ICON} PROMOTIONS CLEARED`,
                items: [
                  `• All previous promotional posts and user cooldowns have been cleared!`,
                  `• **The channel is now completely reset. New promotions can be posted immediately.**`
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Promotion Channel Engine'
          });

          await targetChannel.send({ embeds: [noticeCard] }).catch(() => null);

          return interaction.reply({ content: `${VERIFIED_ICON} Purged promotional messages from ${targetChannel} and reset all user cooldowns.`, flags: 64 });
        }

        // ─── STATUS (DEFAULT OVERVIEW) ────────────────────────────────
        const activeCount = (config.activeMessages || []).length;
        const channelMention = config.channelId ? `<#${config.channelId}>` : '*Not Configured*';

        const overviewCard = buildLimeOverviewCard({
          title: 'PROMOTION CHANNEL ENGINE',
          subtitle: 'AUTO-CLEARING PROMOTIONAL HUB & ANTILINK EXCUSAL MATRIX',
          color: Colors.BRAND,
          sections: [
            {
              title: `${SHIELD_ICON} STATUS & CHANNEL DETAILS`,
              items: [
                `• **Engine Status**: ${config.enabled ? `${VERIFIED_ICON} **Active**` : `${WRONG_ICON} **Disabled**`}`,
                `• **Promotion Channel**: ${channelMention}`,
                `• **Auto-Clear Timer**: \`${config.autoDeleteHours} Hours\``,
                `• **Tracked Active Messages**: \`${activeCount}\` posts currently waiting auto-clear`
              ]
            },
            {
              title: `${CONFIG_ICON} QUICK COMMANDS`,
              items: [
                `• \`r!promo setup\` — Auto-create dedicated \`. Promo\` channel`,
                `• \`r!promo set #channel\` — Bind existing channel for promotion`,
                `• \`r!promo config timer <hours>\` — Change auto-clear timer (default 24h)`,
                `• \`r!promo clear\` — Manually clear expired promotional posts`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Promotion Engine'
        });

        return interaction.reply({ embeds: [overviewCard] });
      }
    },
    {
      name: 'messageCreate',
      handler: async (client: any, message: any, context: any) => {
        if (message.author.bot || !message.guild) return;

        const modules = context.getModulesState ? context.getModulesState(message.guild.id) : [];
        const promoMod = modules.find((m: any) => m.id === 'promotion');
        if (!promoMod || promoMod.status !== 'enabled') return;

        const config: IPromotionConfig = { ...getDefaultConfig(), ...(promoMod.config || {}) };
        if (!config.enabled || !config.channelId || message.channel.id !== config.channelId) return;

        // Skip pinned messages or command execution
        if (message.pinned || message.content.startsWith('r!') || message.content.startsWith('/')) return;

        const content = message.content;
        const hasLink = LINK_REGEX.test(content) || content.includes('http://') || content.includes('https://') || content.includes('discord.gg');

        // 1. Require Link Check
        if (config.requireLink && !hasLink) {
          try {
            await message.delete().catch(() => null);
            const warnCard = buildLimeOverviewCard({
              title: `${LINK_ICON} LINK REQUIRED IN PROMOTION CHANNEL`,
              subtitle: `PROMOTION POST REJECTED`,
              color: Colors.BRAND,
              sections: [
                {
                  title: `${WRONG_ICON} VALID LINK REQUIRED`,
                  items: [
                    `• Hey ${message.author}! Messages in ${message.channel} must contain a valid promotional link (YouTube, Twitch, Discord invite, website, etc.).`,
                    `• Please include your promotional link and try posting again!`
                  ]
                }
              ],
              footerText: 'Rage Optimiser Enterprise • Promotion Channel Engine'
            });

            const sentWarn = await message.channel.send({ embeds: [warnCard] }).catch(() => null);
            if (sentWarn) setTimeout(() => sentWarn.delete().catch(() => null), 8000);
          } catch (err) {}
          return;
        }

        // 2. User Cooldown Check (1 promo post per configured hours)
        const activeMsgs: IPromotionMessage[] = config.activeMessages || [];
        const userLastPost = activeMsgs.find(m => m.authorId === message.author.id);
        
        if (userLastPost && config.userCooldownHours > 0) {
          const postTime = new Date(userLastPost.postedAt).getTime();
          const cooldownMs = config.userCooldownHours * 3600 * 1000;
          if (Date.now() - postTime < cooldownMs) {
            try {
              await message.delete().catch(() => null);
              const remainingMs = cooldownMs - (Date.now() - postTime);
              const remainingHours = (remainingMs / 3600000).toFixed(1);
              const warnCard = buildLimeOverviewCard({
                title: `${TIMER_ICON} PROMOTION POSTING COOLDOWN`,
                subtitle: `POSTING COOLDOWN ACTIVE`,
                color: Colors.BRAND,
                sections: [
                  {
                    title: `${TIMER_ICON} COOLDOWN RESTRICTION`,
                    items: [
                      `• Hey ${message.author}! You can only post 1 promotion every **${config.userCooldownHours} Hours**.`,
                      `• Please wait **${remainingHours} more hours** before posting again.`
                    ]
                  }
                ],
                footerText: 'Rage Optimiser Enterprise • Posting Cooldown'
              });

              const sentWarn = await message.channel.send({ embeds: [warnCard] }).catch(() => null);
              if (sentWarn) setTimeout(() => sentWarn.delete().catch(() => null), 8000);
            } catch (e) {}
            return;
          }
        }

        // 3. Auto-Reaction with Custom Verified Emoji
        if (config.autoReact) {
          try {
            const primaryEmoji = parseReactionEmoji(config.reactionEmoji || VERIFIED_ICON);
            await message.react(primaryEmoji).catch(async () => {
              await message.react('1532390590707142956').catch(async () => {
                await message.react('1532620580266836148').catch(() => null);
              });
            });
          } catch (e) {}
        }

        // 4. Register message for 24-hour auto-clear tracking
        const now = new Date();
        const expiresAt = new Date(now.getTime() + (config.autoDeleteHours * 3600 * 1000));

        const newMsgMeta: IPromotionMessage = {
          id: `promo_${message.id}`,
          guildId: message.guild.id,
          channelId: message.channel.id,
          messageId: message.id,
          authorId: message.author.id,
          authorTag: message.author.username,
          postedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString()
        };

        // Filter out old message from same user if present, push new one
        const updatedMsgs = activeMsgs.filter(m => m.authorId !== message.author.id);
        updatedMsgs.push(newMsgMeta);

        context.updateModuleConfig('promotion', { ...config, activeMessages: updatedMsgs });
        context.logSyncEvent(`[Promotion] Tracked promo post by ${message.author.username} in #${message.channel.name} (Auto-clear in ${config.autoDeleteHours}h).`, 'info');

        // 5. Send automated deletion timer notice from Rage Optimiser
        try {
          const expirySec = Math.floor(expiresAt.getTime() / 1000);
          const noticeCard = buildLimeOverviewCard({
            title: `${TIMER_ICON} PROMOTION AUTO-CLEAR SCHEDULED`,
            subtitle: `AUTOMATED LIFESPAN TIMER`,
            color: Colors.BRAND,
            sections: [
              {
                title: `${VERIFIED_ICON} AUTO-CLEANUP IN EFFECT`,
                items: [
                  `• This promotional post will automatically be deleted in **${config.autoDeleteHours} Hours** (<t:${expirySec}:R>).`
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Promotion Engine'
          });

          const sentNotice = await message.reply({ embeds: [noticeCard] }).catch(() => null);
          if (sentNotice) {
            setTimeout(() => sentNotice.delete().catch(() => null), 12000);
          }
        } catch (err) {}
      }
    },
    {
      name: 'tick',
      handler: async (client: any, guildId: string, context: any) => {
        if (!guildId) return;

        const modules = context.getModulesState ? context.getModulesState(guildId) : [];
        const promoMod = modules.find((m: any) => m.id === 'promotion');
        if (!promoMod || promoMod.status !== 'enabled') return;

        const config: IPromotionConfig = { ...getDefaultConfig(), ...(promoMod.config || {}) };
        if (!config.enabled || !config.channelId) return;

        const activeMsgs: IPromotionMessage[] = config.activeMessages || [];
        if (activeMsgs.length === 0) return;

        const now = Date.now();
        const expired = activeMsgs.filter(m => new Date(m.expiresAt).getTime() <= now);
        if (expired.length === 0) return;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;

        const channel = await guild.channels.fetch(config.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return;

        let clearedCount = 0;
        for (const meta of expired) {
          try {
            const msg = await channel.messages.fetch(meta.messageId).catch(() => null);
            if (msg && !msg.pinned) {
              await msg.delete().catch(() => null);
              clearedCount++;
            }
          } catch (e) {}
        }

        // Also clean any previous bot notice messages or leftover non-pinned messages
        try {
          const recentMsgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
          if (recentMsgs) {
            for (const [_, msg] of recentMsgs) {
              if (msg.pinned) continue;
              if (msg.author.id === client.user.id && (msg.embeds.length > 0 || msg.content.includes('PROMOTION'))) {
                await msg.delete().catch(() => null);
              }
            }
          }
        } catch (e) {}

        const remainingMsgs = activeMsgs.filter(m => !expired.some(e => e.messageId === m.messageId));
        context.updateModuleConfig('promotion', { ...config, activeMessages: remainingMsgs });

        if (clearedCount > 0) {
          context.logSyncEvent(`[Promotion Sweeper] Auto-cleaned ${clearedCount} expired promo messages older than ${config.autoDeleteHours}h in #${channel.name}.`, 'success');

          if (config.cleanupNoticeType === 'channel_notice') {
            const noticeCard = buildLimeOverviewCard({
              title: `${TIMER_ICON} PROMOTION RESET NOTICE`,
              subtitle: `ALL PREVIOUS PROMOTIONS COMPLETED`,
              color: Colors.BRAND,
              sections: [
                {
                  title: `${VERIFIED_ICON} PROMOTIONS CLEARED`,
                  items: [
                    `• Cleaned **${clearedCount}** promotional posts older than **${config.autoDeleteHours} Hours**.`,
                    `• **All old promos are over! New promotions can now be posted.**`
                  ]
                }
              ],
              footerText: 'Rage Optimiser Enterprise • Promotion Engine'
            });

            await channel.send({ embeds: [noticeCard] }).catch(() => null);
          }
        }
      }
    }
  ]
};

export function registerPromotionCommands() {
  PrefixRegistry.register({
    name: 'promotion',
    description: 'Enterprise Promotion Channel setup & 24h auto-clear controls',
    category: 'Community',
    usage: 'r!promotion [setup | set #channel | config | clear | status]',
    aliases: ['promo', 'pr'],
    userPermissions: ['ManageGuild'],
    cooldownSeconds: 3,
    examples: ['r!promo setup', 'r!promo set #promotions', 'r!promo config timer 24', 'r!promo clear'],
    moduleOwnerId: 'promotion',
    subcommands: [
      { name: 'setup', description: 'Auto-create dedicated . Promo channel with 24h auto-deletion and pinned card', examples: ['r!promo setup'] },
      { name: 'set #channel', description: 'Assign an existing text channel as the designated promotion channel', examples: ['r!promo set #promotions'] },
      { name: 'config timer <hours>', description: 'Configure promotion message lifespan auto-clear timer', examples: ['r!promo config timer 24'] },
      { name: 'clear', description: 'Perform manual purge of non-pinned promo posts and reset user cooldowns', examples: ['r!promo clear'] },
      { name: 'status', description: 'View promotion channel status and active tracking statistics', examples: ['r!promo status'] }
    ]
  });
}
