import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { Database } from '../../core/Database.js';
import { DashboardSyncService } from '../../services/DashboardSyncService.js';
import { Embeds, Colors, buildStatusCard, createLimeEmbed, buildLimeOverviewCard, buildMinimalAction, buildLimeWarnCard, VERIFIED_ICON, WRONG_ICON, SHIELD_ICON, GAVEL_ICON, LINK_ICON, INFO_ICON, CONFIG_ICON, VIP_ICON, BOT_ICON } from '../../core/UIFactory.js';
import { checkWhitelistPermission } from '../../utils/whitelistCheck.js';
import { isUrlCommandBypass, isMessageAntiLinkHandled, markMessageAntiLinkHandled } from '../../utils/antiLinkBypass.js';
import { resetRateLimit } from '../security/manifest.js';

function userTag(user: any): string {
  return user?.globalName ?? user?.username ?? user?.tag ?? user?.id ?? 'Unknown';
}

function sanitizeLinksFromContent(text: string): string {
  if (!text) return '';
  const GLOBAL_LINK_REGEX = /(?:https?:\/\/|www\.|discord(?:app)?\.(?:gg|com\/invite)\/|[a-zA-Z0-9-]+\.(?:com|net|org|gg|io|me|xyz|co|uk)\b)[^\s]*/gi;
  return text.replace(GLOBAL_LINK_REGEX, '`[link removed]`').trim();
}

async function repostSanitizedContent(message: any, cleanText: string) {
  try {
    const channel = message.channel;
    if (!channel || !channel.isTextBased()) return;

    const textWithoutPlaceholder = cleanText.replace(/`\[link removed\]`/g, '').trim();
    if (textWithoutPlaceholder.length === 0) {
      return;
    }

    if ('createWebhook' in channel && typeof channel.fetchWebhooks === 'function') {
      const webhooks = await channel.fetchWebhooks().catch(() => null);
      let webhook = webhooks?.find((w: any) => w.name === 'Rage-AntiLink-Sanitizer');
      if (!webhook) {
        webhook = await channel.createWebhook({
          name: 'Rage-AntiLink-Sanitizer',
          avatar: message.client.user?.displayAvatarURL()
        }).catch(() => null);
      }
      if (webhook) {
        await webhook.send({
          content: cleanText,
          username: message.member?.displayName || message.author.username,
          avatarURL: message.author.displayAvatarURL({ size: 256 }),
          allowedMentions: { parse: [] }
        });
        return;
      }
    }

    await channel.send({
      content: `<:link:1532620952087826602> **Message from ${message.author.username}** *(link removed)*:\n${cleanText}`,
      allowedMentions: { parse: [] }
    });
  } catch (e) {
    console.error('[Anti-Link] Error reposting sanitized content:', e);
  }
}

import crypto from 'crypto';

interface UserMessageLog {
  timestamp: number;
  contentHash: string;
  channelId: string;
}

export class SlidingWindowSpamDetector {
  private static userWindows = new Map<string, UserMessageLog[]>();
  private static cleanupTimer: NodeJS.Timeout | null = null;

  public static init() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.pruneOldLogs(), 5000);
  }

  private static pruneOldLogs() {
    const now = Date.now();
    for (const [key, logs] of this.userWindows.entries()) {
      const valid = logs.filter(l => now - l.timestamp < 10000);
      if (valid.length === 0) {
        this.userWindows.delete(key);
      } else {
        this.userWindows.set(key, valid);
      }
    }
  }

  public static checkSpam(guildId: string, userId: string, channelId: string, content: string): { isSpam: boolean; reason: string } {
    this.init();
    const key = `${guildId}_${userId}`;
    const now = Date.now();
    const hash = crypto.createHash('md5').update(content.trim().toLowerCase()).digest('hex');

    if (!this.userWindows.has(key)) {
      this.userWindows.set(key, []);
    }

    const logs = this.userWindows.get(key)!;
    logs.push({ timestamp: now, contentHash: hash, channelId });

    const recentLogs = logs.filter(l => now - l.timestamp < 5000);

    const burstLogs = recentLogs.filter(l => now - l.timestamp < 3000);
    if (burstLogs.length >= 5) {
      return { isSpam: true, reason: `Rapid message burst (${burstLogs.length} msgs / 3s)` };
    }

    const sameContentLogs = recentLogs.filter(l => l.contentHash === hash);
    if (sameContentLogs.length >= 3 && content.length > 5) {
      return { isSpam: true, reason: `Repeated duplicate message (${sameContentLogs.length}x / 5s)` };
    }

    const distinctChannels = new Set(recentLogs.filter(l => l.contentHash === hash).map(l => l.channelId));
    if (distinctChannels.size >= 3) {
      return { isSpam: true, reason: `Cross-channel spam raid (${distinctChannels.size} channels / 5s)` };
    }

    return { isSpam: false, reason: '' };
  }
}

const userLinkViolations = new Map<string, Map<string, { count: number; lastTime: number }>>();

export function incrementLinkViolations(guildId: string, userId: string): number {
  const now = Date.now();
  if (!userLinkViolations.has(guildId)) {
    userLinkViolations.set(guildId, new Map());
  }
  const guildMap = userLinkViolations.get(guildId)!;
  const userRecord = guildMap.get(userId) || { count: 0, lastTime: now };

  if (now - userRecord.lastTime > 24 * 60 * 60 * 1000) {
    userRecord.count = 0;
  }

  userRecord.count += 1;
  userRecord.lastTime = now;
  guildMap.set(userId, userRecord);
  return userRecord.count;
}

export function resetLinkViolations(guildId: string, userId: string): void {
  const guildMap = userLinkViolations.get(guildId);
  if (guildMap) {
    guildMap.delete(userId);
  }
}

export function getLinkViolations(guildId: string, userId: string): number {
  const guildMap = userLinkViolations.get(guildId);
  return guildMap?.get(userId)?.count || 0;
}

export const AutomodManifest: ModuleManifest = {
  id: 'automod',
  name: 'AI Automod',
  version: '1.1.0',
  description: 'Spam, phishing, bad words, AntiLink protection with ignored channel and role bypasses.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;

      const channelExists = (id: string) => registry.channels.some(c => c.id === id);

      if (config.logChannelId) {
        progress += 40;
        if (!channelExists(config.logChannelId)) errors.push(`Mod logs channel ID (${config.logChannelId}) was deleted!`);
      }
      
      if (config.badWords && config.badWords.length > 0) progress += 20;
      if (config.blockLinks) progress += 20;
      if (config.punishment) progress += 20;

      return { progress: Math.min(100, progress || 50), errors };
    }
  },
  commands: [
    {
      name: 'automod',
      description: 'Enterprise AntiLink & AutoMod configuration engine',
      options: [
        {
          name: 'status',
          description: 'View complete AutoMod status matrix, AntiLink rules & bypasses',
          type: 1
        },
        {
          name: 'antilink',
          description: 'Configure Anti-Link filter, violation limit, punishments & bypass domains',
          type: 1,
          options: [
            {
              name: 'enable',
              type: 5,
              description: 'Enable or disable Anti-Link filter',
              required: false
            },
            {
              name: 'limit',
              type: 4,
              description: 'Number of link violations before punishment (default: 5)',
              required: false
            },
            {
              name: 'action',
              type: 3,
              description: 'Punishment action when violation limit is reached',
              required: false,
              choices: [
                { name: 'Delete Message Only', value: 'delete' },
                { name: 'Warn & Delete Message', value: 'warn' },
                { name: 'Mute Member', value: 'mute' },
                { name: 'Kick Member', value: 'kick' },
                { name: 'Ban Member', value: 'ban' }
              ]
            },
            {
              name: 'allow_invites',
              type: 5,
              description: 'Allow Discord invite links (discord.gg / discord.com/invite)',
              required: false
            },
            {
              name: 'ignored_domains',
              type: 3,
              description: 'Comma-separated bypass domains (e.g. spotify.com, youtube.com)',
              required: false
            }
          ]
        },
        {
          name: 'clearwarns',
          description: 'Clear/reset Anti-Link and AutoMod violation warnings for a specific member',
          type: 1,
          options: [
            {
              name: 'user',
              type: 6,
              description: 'Target member to clear violation warnings for',
              required: true
            }
          ]
        },
        {
          name: 'warnings',
          description: 'View active Anti-Link and AutoMod violation warnings for a specific member',
          type: 1,
          options: [
            {
              name: 'user',
              type: 6,
              description: 'Target member to view violation warnings for (defaults to yourself)',
              required: false
            }
          ]
        },
        {
          name: 'antispam',
          description: 'Configure Anti-Spam rate limit, window duration & punishment',
          type: 1,
          options: [
            {
              name: 'enable',
              type: 5,
              description: 'Enable or disable Anti-Spam rate limiter',
              required: false
            },
            {
              name: 'max_messages',
              type: 4,
              description: 'Maximum messages allowed within time window (e.g. 5)',
              required: false
            },
            {
              name: 'window_seconds',
              type: 4,
              description: 'Time window duration in seconds (e.g. 5)',
              required: false
            },
            {
              name: 'action',
              type: 3,
              description: 'Punishment action on spam trigger',
              required: false,
              choices: [
                { name: 'Delete Message Only', value: 'delete' },
                { name: 'Warn & Delete Message', value: 'warn' },
                { name: 'Mute Member (Timeout)', value: 'mute' },
                { name: 'Kick Member', value: 'kick' },
                { name: 'Ban Member', value: 'ban' }
              ]
            }
          ]
        },
        {
          name: 'ignore-channel',
          description: 'Manage ignored channels for AntiLink bypass',
          type: 1,
          options: [
            {
              name: 'action',
              type: 3,
              description: 'Action (add / remove / list)',
              required: true,
              choices: [
                { name: 'Add Ignored Channel', value: 'add' },
                { name: 'Remove Ignored Channel', value: 'remove' },
                { name: 'List Ignored Channels', value: 'list' }
              ]
            },
            {
              name: 'channel',
              type: 7,
              description: 'Target text channel to ignore',
              required: false
            }
          ]
        },
        {
          name: 'ignore-role',
          description: 'Manage ignored roles for AntiLink bypass',
          type: 1,
          options: [
            {
              name: 'action',
              type: 3,
              description: 'Action (add / remove / list)',
              required: true,
              choices: [
                { name: 'Add Ignored Role', value: 'add' },
                { name: 'Remove Ignored Role', value: 'remove' },
                { name: 'List Ignored Roles', value: 'list' }
              ]
            },
            {
              name: 'role',
              type: 8,
              description: 'Target role allowed to post links',
              required: false
            }
          ]
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_automod',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: '<:wrong:1532390628330307634> AutoMod commands must be run inside a server.', flags: 64 });

        const { isOwnerOrExtraOwner } = await import('../../utils/whitelistCheck.js');
        const isOwnerOrExtra = await isOwnerOrExtraOwner(interaction.user.id, guild);
        if (!isOwnerOrExtra) {
          return interaction.reply({
            content: '<:wrong:1532390628330307634> Access Denied: Only the Guild Owner and Extra Owners can access Anti-Nuke and AutoMod features.',
            flags: 64
          });
        }

        const modules = context.getModulesState ? context.getModulesState(guild.id) : [];
        const amMod = modules.find((m: any) => m.id === 'automod');
        const config = amMod?.config || {};

        const sub = interaction.options.getSubcommand(false);
        const subCmd = sub || interaction.parsed?.args?.[0]?.toLowerCase();
        const actionArg = interaction.options.getString('action');

        // IGNORE CHANNEL
        if (['ignore-channel', 'ignorechannel', 'channel-ignore', 'channelignore', 'channels', 'channel'].includes(subCmd)) {
          const action = actionArg || interaction.parsed?.args?.[1]?.toLowerCase();
          let targetChannel: any = interaction.options.getChannel('channel') || interaction.message?.mentions?.channels?.first();

          if (!targetChannel && guild) {
            const rawArgs = interaction.parsed?.args || [];
            for (const arg of rawArgs) {
              if (!arg) continue;
              const cleanId = arg.replace(/[<#>]/g, '').trim();
              if (/^\d{17,20}$/.test(cleanId)) {
                targetChannel = guild.channels.cache.get(cleanId);
                if (!targetChannel) {
                  targetChannel = await guild.channels.fetch(cleanId).catch(() => null);
                }
                if (!targetChannel && interaction.client) {
                  targetChannel = await interaction.client.channels.fetch(cleanId).catch(() => null);
                }
                if (!targetChannel) {
                  targetChannel = { id: cleanId, name: cleanId, toString: () => `<#${cleanId}>` };
                }
                if (targetChannel) break;
              }
              const cleanName = arg.toLowerCase().replace(/^[#<>]*/, '').replace(/>$/, '').trim();
              if (cleanName && cleanName !== 'ignore-channel' && cleanName !== 'add' && cleanName !== 'remove' && cleanName !== 'list') {
                const foundByName = guild.channels.cache.find((c: any) => c.name?.toLowerCase() === cleanName);
                if (foundByName) {
                  targetChannel = foundByName;
                  break;
                }
              }
            }
          }

          let ignoredChannels: string[] = config.ignoredChannels || [];

          if (action === 'add') {
            if (!targetChannel) {
              return interaction.reply({ content: '<:wrong:1532390628330307634> Please mention or specify a target channel (or Channel ID) to ignore.', flags: 64 });
            }
            if (!ignoredChannels.includes(targetChannel.id)) {
              ignoredChannels.push(targetChannel.id);
              context.updateModuleConfig('automod', { ...config, ignoredChannels });
              context.logSyncEvent(`AutoMod: Added #${targetChannel.name} to AntiLink ignored channels.`, 'success');
            }
            return interaction.reply({ content: `<a:approved:1532390590707142956> Added ${targetChannel} to AntiLink **ignored channels**. Links posted in this channel will now be bypassed.`, flags: 64 });
          }

          if (action === 'remove') {
            if (!targetChannel) {
              return interaction.reply({ content: '<:wrong:1532390628330307634> Please mention or specify a target channel (or Channel ID) to remove.', flags: 64 });
            }
            ignoredChannels = ignoredChannels.filter((id: string) => id !== targetChannel.id);
            context.updateModuleConfig('automod', { ...config, ignoredChannels });
            context.logSyncEvent(`AutoMod: Removed #${targetChannel.name} from AntiLink ignored channels.`, 'warn');
            return interaction.reply({ content: `<a:approved:1532390590707142956> Removed ${targetChannel} from AntiLink **ignored channels**. Links in this channel are now filtered.`, flags: 64 });
          }

          // list
          const channelMentions = ignoredChannels.map((id: string) => `<#${id}>`).join(', ');
          return interaction.reply({
            content: `<a:lovemail:1527647157371535420> **AntiLink Ignored Channels**:\n${channelMentions || '*No ignored channels configured.*'}`,
            flags: 64
          });
        }

        // IGNORE ROLE
        if (['ignore-role', 'ignorerole', 'role-ignore', 'roleignore', 'roles', 'role'].includes(subCmd)) {
          const action = actionArg || interaction.parsed?.args?.[1]?.toLowerCase();
          let targetRole: any = interaction.options.getRole('role') || interaction.message?.mentions?.roles?.first();

          if (!targetRole && guild) {
            const rawArgs = interaction.parsed?.args || [];
            for (const arg of rawArgs) {
              if (!arg) continue;
              const cleanId = arg.replace(/[<@&>]/g, '').trim();
              if (/^\d{17,20}$/.test(cleanId)) {
                targetRole = guild.roles.cache.get(cleanId);
                if (!targetRole) {
                  targetRole = await guild.roles.fetch(cleanId).catch(() => null);
                }
                if (!targetRole) {
                  targetRole = { id: cleanId, name: cleanId, toString: () => `<@&${cleanId}>` };
                }
                if (targetRole) break;
              }
              const cleanName = arg.toLowerCase().replace(/^[<@&>]*|[>]*$/g, '').trim();
              if (cleanName && cleanName !== 'ignore-role' && cleanName !== 'add' && cleanName !== 'remove' && cleanName !== 'list') {
                const foundByName = guild.roles.cache.find((r: any) => r.name?.toLowerCase() === cleanName);
                if (foundByName) {
                  targetRole = foundByName;
                  break;
                }
              }
            }
          }

          let ignoredRoles: string[] = config.ignoredRoles || [];

          if (action === 'add') {
            if (!targetRole) {
              return interaction.reply({ content: '<:wrong:1532390628330307634> Please mention or specify a target role (or Role ID) to ignore.', flags: 64 });
            }
            if (!ignoredRoles.includes(targetRole.id)) {
              ignoredRoles.push(targetRole.id);
              context.updateModuleConfig('automod', { ...config, ignoredRoles });
              context.logSyncEvent(`AutoMod: Added @${targetRole.name} to AntiLink ignored roles.`, 'success');
            }
            return interaction.reply({ content: `<a:approved:1532390590707142956> Added ${targetRole} to AntiLink **ignored roles**. Members with this role can now post links anywhere.`, flags: 64 });
          }

          if (action === 'remove') {
            if (!targetRole) {
              return interaction.reply({ content: '<:wrong:1532390628330307634> Please mention or specify a target role (or Role ID) to remove.', flags: 64 });
            }
            ignoredRoles = ignoredRoles.filter((id: string) => id !== targetRole.id);
            context.updateModuleConfig('automod', { ...config, ignoredRoles });
            context.logSyncEvent(`AutoMod: Removed @${targetRole.name} from AntiLink ignored roles.`, 'warn');
            return interaction.reply({ content: `<a:approved:1532390590707142956> Removed ${targetRole} from AntiLink **ignored roles**. Link restrictions re-enabled for this role.`, flags: 64 });
          }

          // list
          const roleMentions = ignoredRoles.map((id: string) => `<@&${id}>`).join(', ');
          return interaction.reply({
            content: `<:vip:1532620837117759508> **AntiLink Ignored Roles**:\n${roleMentions || '*No ignored roles configured.*'}`,
            flags: 64
          });
        }

        // ANTILINK ENABLE / DISABLE / FULL CONFIG
        if (sub === 'antilink' || interaction.parsed?.args?.[0] === 'antilink') {
          const enableOpt = interaction.options?.getBoolean?.('enable');
          const limitOpt = interaction.options?.getInteger?.('limit');
          const actionOpt = interaction.options?.getString?.('action') || actionArg || interaction.parsed?.args?.[1]?.toLowerCase();
          const allowInvitesOpt = interaction.options?.getBoolean?.('allow_invites');
          const ignoredDomainsOpt = interaction.options?.getString?.('ignored_domains');

          const updatedConfig = { ...config };
          if (enableOpt !== null && enableOpt !== undefined) {
            updatedConfig.blockLinks = enableOpt;
          } else if (actionOpt === 'enable') {
            updatedConfig.blockLinks = true;
          } else if (actionOpt === 'disable') {
            updatedConfig.blockLinks = false;
          }

          // Parse limit from limitOpt or positional args (e.g. `r!automod antilink 5` or `r!antilink limit 5`)
          const args = interaction.parsed?.args || [];
          let parsedLimit = limitOpt;
          if (!parsedLimit) {
            for (const arg of args) {
              const num = parseInt(arg, 10);
              if (!isNaN(num) && num > 0 && num <= 100) {
                parsedLimit = num;
                break;
              }
            }
          }

          if (parsedLimit) {
            updatedConfig.antiLinkLimit = parsedLimit;
            updatedConfig.limit = parsedLimit;
          }

          if (actionOpt && ['delete', 'warn', 'mute', 'kick', 'ban'].includes(actionOpt)) {
            updatedConfig.punishment = actionOpt;
          }
          if (allowInvitesOpt !== null && allowInvitesOpt !== undefined) {
            updatedConfig.allowInvites = allowInvitesOpt;
          }
          if (ignoredDomainsOpt) {
            updatedConfig.ignoredDomains = ignoredDomainsOpt.split(',').map((d: string) => d.trim().toLowerCase()).filter(Boolean);
          }

          context.updateModuleConfig('automod', updatedConfig);
          context.logSyncEvent(`AutoMod: Updated AntiLink config (blockLinks=${updatedConfig.blockLinks}, limit=${updatedConfig.antiLinkLimit || 5}, punishment=${updatedConfig.punishment})`, 'info');

          const finalLimit = updatedConfig.antiLinkLimit || updatedConfig.limit || 5;
          const embed = createLimeEmbed({
            title: '<:link:1532620952087826602> Anti-Link Protection Settings Updated',
            description: [
              `• **Anti-Link Filter**: ${updatedConfig.blockLinks !== false ? '<a:approved:1532390590707142956> **Enabled**' : '<:wrong:1532390628330307634> **Disabled**'}`,
              `• **Violation Limit**: \`${finalLimit}\` unauthorized link(s) before punishment`,
              `• **Punishment Mode**: \`${(updatedConfig.punishment || 'mute').toUpperCase()}\``,
              `• **Allow Discord Invites**: ${updatedConfig.allowInvites ? '<a:approved:1532390590707142956> Yes' : '<:wrong:1532390628330307634> No'}`,
              `• **Ignored Bypass Domains**: ${updatedConfig.ignoredDomains?.length ? updatedConfig.ignoredDomains.map((d: string) => `\`${d}\``).join(', ') : '*None*'}`
            ].join('\n')
          });
          return interaction.reply({ embeds: [embed] });
        }

        // CLEAR WARNS / RESET WARNS FOR SPECIFIC MEMBER
        if (sub === 'clearwarns' || sub === 'clear-warns' || sub === 'resetwarns' || sub === 'clearwarn' || interaction.parsed?.args?.[0] === 'clearwarns' || interaction.parsed?.args?.[0] === 'clearwarn' || interaction.parsed?.args?.[0] === 'resetwarns') {
          const targetUser = interaction.options?.getUser?.('user') || interaction.parsed?.mentions?.users?.first?.() || (interaction as any)?.message?.mentions?.users?.first?.();

          if (!targetUser) {
            return interaction.reply({
              embeds: [createLimeEmbed({
                title: 'Clear Warnings Syntax',
                description: `<:wrong:1532390628330307634> **Syntax**: \`r!automod clearwarns @user\` or \`/automod clearwarns user:@user\`\n• **Example**: \`r!automod clearwarns @Username\``
              })]
            });
          }

          resetLinkViolations(interaction.guild.id, targetUser.id);
          resetRateLimit(interaction.guild.id, targetUser.id, 'anti_link');

          context.logSyncEvent(`AutoMod: Cleared link violation warnings for ${targetUser.username} (${targetUser.id})`, 'info');

          return interaction.reply({
            embeds: [createLimeEmbed({
              title: 'Violation Warnings Cleared',
              description: `<a:approved:1532390590707142956> Successfully cleared all Anti-Link violation warnings for ${targetUser} (\`${targetUser.id}\`).\n\n• **Current Violations**: \`0/5\``
            })]
          });
        }

        // VIEW WARNINGS FOR MEMBER
        if (sub === 'warnings' || sub === 'warns' || interaction.parsed?.args?.[0] === 'warnings' || interaction.parsed?.args?.[0] === 'warns') {
          const targetUser = interaction.options?.getUser?.('user') || interaction.parsed?.mentions?.users?.first?.() || (interaction as any)?.message?.mentions?.users?.first?.() || interaction.user || (interaction as any)?.author;

          const maxLimit = typeof config.antiLinkLimit === 'number' && config.antiLinkLimit > 0
            ? config.antiLinkLimit
            : (typeof config.limit === 'number' && config.limit > 0 ? config.limit : 5);

          const currentCount = getLinkViolations(interaction.guild.id, targetUser.id);
          const punishAction = (config.punishment || 'mute').toUpperCase();

          const embed = createLimeEmbed({
            title: `<:shield:1532403012751065179> User Violation Warnings Matrix`,
            description: [
              `> **Member**: ${targetUser} (\`${userTag(targetUser)}\` • \`ID: ${targetUser.id}\`)`,
              ``,
              `• **Anti-Link Violations**: \`${currentCount} / ${maxLimit}\``,
              `• **Violation Status**: ${currentCount > 0 ? `<:wrong:1532390628330307634> **${currentCount} Active Warning(s)**` : '<a:approved:1532390590707142956> **No Active Warnings**'}`,
              `• **Punishment Threshold**: Reaching \`${maxLimit}\` violations triggers **\`${punishAction}\`**`
            ].join('\n')
          });

          return interaction.reply({ embeds: [embed] });
        }

        // ANTISPAM FULL CONFIG
        if (sub === 'antispam' || interaction.parsed?.args?.[0] === 'antispam') {
          const enableOpt = interaction.options?.getBoolean?.('enable');
          const maxMsgsOpt = interaction.options?.getInteger?.('max_messages');
          const windowSecOpt = interaction.options?.getInteger?.('window_seconds');
          const actionOpt = interaction.options?.getString?.('action');

          const updatedConfig = { ...config };
          if (enableOpt !== null && enableOpt !== undefined) {
            updatedConfig.antiSpamEnabled = enableOpt;
          }
          if (maxMsgsOpt) {
            updatedConfig.maxSpamMessages = maxMsgsOpt;
          }
          if (windowSecOpt) {
            updatedConfig.spamWindowSeconds = windowSecOpt;
          }
          if (actionOpt) {
            updatedConfig.spamAction = actionOpt;
          }

          context.updateModuleConfig('automod', updatedConfig);
          context.logSyncEvent(`AutoMod: Updated AntiSpam config (enabled=${updatedConfig.antiSpamEnabled}, max=${updatedConfig.maxSpamMessages}, window=${updatedConfig.spamWindowSeconds})`, 'info');

          const embed = createLimeEmbed({
            title: '<:shield:1532403012751065179> Anti-Spam Protection Settings Updated',
            description: [
              `• **Anti-Spam Limiter**: ${updatedConfig.antiSpamEnabled !== false ? '<a:approved:1532390590707142956> **Enabled**' : '<:wrong:1532390628330307634> **Disabled**'}`,
              `• **Max Message Limit**: \`${updatedConfig.maxSpamMessages || 5}\` messages`,
              `• **Window Duration**: \`${updatedConfig.spamWindowSeconds || 5}\` seconds`,
              `• **Punishment Action**: \`${updatedConfig.spamAction || 'mute'}\``
            ].join('\n')
          });
          return interaction.reply({ embeds: [embed] });
        }

        // ANTIEVERYONE / MASSPING / HERE FULL CONFIG
        if (['antieveryone', 'everyone', 'here', 'antihere', 'massping', 'anti_everyone_here'].includes(sub) ||
            ['antieveryone', 'everyone', 'here', 'antihere', 'massping', 'anti_everyone_here'].includes(interaction.parsed?.args?.[0]?.toLowerCase())) {
          
          const optStr = interaction.options?.getString?.('enable') || actionArg || interaction.parsed?.args?.[1]?.toLowerCase();
          const enableOpt = interaction.options?.getBoolean?.('enable');
          
          let enableState = true;
          if (enableOpt !== null && enableOpt !== undefined) {
            enableState = enableOpt;
          } else if (['off', 'disable', 'disabled', 'false', '0'].includes(optStr)) {
            enableState = false;
          } else if (['on', 'enable', 'enabled', 'true', '1'].includes(optStr)) {
            enableState = true;
          }

          // Update automod config
          const updatedAmConfig = { ...config, antiEveryoneEnabled: enableState };
          context.updateModuleConfig('automod', updatedAmConfig);

          // Also update security module rule anti_everyone_here
          const secMod = modules.find((m: any) => m.id === 'security');
          if (secMod) {
            const secConfig = secMod.config || {};
            const rules = { ...(secConfig.rules || {}) };
            const existing = rules.anti_everyone_here || { enabled: true, limit: 1, window: 10, action: 'quarantine', recovery: true };
            rules.anti_everyone_here = { ...existing, enabled: enableState };
            context.updateModuleConfig('security', { ...secConfig, rules });
          }

          context.logSyncEvent(`AutoMod: Updated Anti-Everyone/Here filter (enabled=${enableState})`, 'info');

          const embed = createLimeEmbed({
            title: '<:shield:1532403012751065179> Anti-Everyone & Anti-Here Mention Filter Updated',
            description: [
              `• **Anti-Everyone & Anti-Here Filter**: ${enableState ? '<a:approved:1532390590707142956> **Enabled**' : '<:wrong:1532390628330307634> **Disabled**'}`,
              `• **Protection Target**: \`@everyone\` and \`@here\` mass mentions`,
              `• **Action on Violation**: \`Delete Message & Quarantine Violator\``
            ].join('\n')
          });
          return interaction.reply({ embeds: [embed] });
        }

        // DEFAULT STATUS & OVERVIEW
        const secMod = modules.find((m: any) => m.id === 'security');
        const secConfig = secMod?.config || {};
        const ruleEveryone = secConfig?.rules?.anti_everyone_here;
        const isEveryoneEnabled = (ruleEveryone?.enabled !== false) && (config.antiEveryoneEnabled !== false) && (secConfig.antiNukeEnabled !== false);

        const ignoredChannelsList = (config.ignoredChannels || []).map((id: string) => `<#${id}>`).join(', ') || '*None*';
        const ignoredRolesList = (config.ignoredRoles || []).map((id: string) => `<@&${id}>`).join(', ') || '*None*';

        const isBlockLinks = config.blockLinks !== false;
        const statusIcon = (amMod?.status || 'enabled') === 'enabled' ? VERIFIED_ICON : WRONG_ICON;
        const antilinkIcon = isBlockLinks ? VERIFIED_ICON : WRONG_ICON;
        const everyoneIcon = isEveryoneEnabled ? VERIFIED_ICON : WRONG_ICON;

        const overviewCard = buildLimeOverviewCard({
          title: 'AUTOMOD & ANTILINK PROTECTION CENTER',
          subtitle: 'AUTOMATED CHAT FILTERING, ANTI-LINK & TAG RULES MATRIX',
          color: Colors.BRAND,
          sections: [
            {
              title: `${GAVEL_ICON} PROTECTION STATUS MATRIX`,
              items: [
                `${statusIcon} **AutoMod Status**: \`${amMod?.status || 'enabled'}\``,
                `${antilinkIcon} **AntiLink Filter**: ${isBlockLinks ? '**Enabled**' : '**Disabled**'}`,
                `${everyoneIcon} **Anti-Everyone Tag Filter**: ${isEveryoneEnabled ? '**Enabled**' : '**Disabled**'}`,
                `${SHIELD_ICON} **Punishment Mode**: \`${config.punishment || 'warn'}\``
              ]
            },
            {
              title: `${INFO_ICON} BYPASS RESTRICTIONS`,
              items: [
                `Ignored Channels: ${ignoredChannelsList}`,
                `Ignored Roles: ${ignoredRolesList}`
              ]
            },
            {
              title: `${CONFIG_ICON} CONFIGURE COMMANDS`,
              items: [
                `• \`r!automod antieveryone <on|off>\` — Enable/disable @everyone & @here tag filter`,
                `• \`r!automod antilink <enable|disable>\` — Enable/disable link filter`,
                `• \`r!automod ignore-channel <add|remove|list> #channel\` — Manage ignored channels`,
                `• \`r!automod ignore-role <add|remove|list> @role\` — Manage ignored roles`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • AutoMod Protection'
        });

        return interaction.reply({ embeds: [overviewCard] });
      }
    },
    {
      name: 'messageCreate',
      handler: async (client: any, message: any, context: any) => {
        if (message.author.bot) return;
        if (!message.guild) return;
        
        const modules = context.getModulesState ? context.getModulesState(message.guild.id) : [];
        const amMod = modules.find((m: any) => m.id === 'automod');

        // DEBUG: Log automod module state
        if (!amMod) {
          console.log(`[AntiLink Debug] automod module NOT found in modules state for guild ${message.guild.id}`);
          return;
        }
        if (amMod.status !== 'enabled') {
          console.log(`[AntiLink Debug] automod module status is '${amMod.status}' — skipping`);
          return;
        }

        const config = amMod.config || {};
        if (config.autoModEnabled === false) return;
        const content = message.content.toLowerCase();
        let deleted = false;
        let reason = '';

        // 1. AntiLink Filter with Ignored Channels & Ignored Roles Bypass
        const blockLinks = config.blockLinks !== false && config.antiLinkEnabled !== false && config.autoModEnabled !== false;
        const LINK_REGEX = /(?:https?:\/\/|ftps?:\/\/|www\.|discord(?:app)?\.(?:gg|com|io|me)|dsc\.gg|disboard\.org|[a-zA-Z0-9-]+\.(?:com|net|org|gg|io|me|xyz|co|uk|in|info|online|site|app|tech|store|top|live|shop|vip|fun|club|pro|link|bot|ai|dev|[a-zA-Z]{2,})\b)/i;
        const hasLink = LINK_REGEX.test(content) || content.includes('http://') || content.includes('https://') || content.includes('www.') || content.includes('discord.gg') || content.includes('discord.com/invite') || content.includes('dsc.gg');

        if (hasLink) {
          console.log(`[AntiLink Debug] Link detected from ${message.author.username} | blockLinks=${blockLinks} | content="${message.content.substring(0,80)}"`);
        }

        if (blockLinks && hasLink) {
          if ((message as any)._antiLinkHandled || isMessageAntiLinkHandled(message.id)) return;

          const ignoredChannels: string[] = config.ignoredChannels || [];
          const ignoredRoles: string[] = config.ignoredRoles || [];

          const isChannelIgnored = ignoredChannels.includes(message.channel.id);
          const hasIgnoredRole = message.member?.roles?.cache?.some((r: any) => ignoredRoles.includes(r.id));
          // Server Owner or Administrator bypass only (ManageMessages removed so non-whitelisted staff cannot bypass)
          const isOwnerOrAdmin = message.guild.ownerId === message.author.id ||
            Boolean(message.member?.permissions?.has?.(PermissionFlagsBits.Administrator));

          const isWhitelisted = await checkWhitelistPermission(message.author.id, message.guild, context, 'anti_link');
          const isUrlCmd = isUrlCommandBypass(message, client?.user?.id);

          console.log(`[AntiLink Debug] Bypass check: channelIgnored=${isChannelIgnored} | roleIgnored=${hasIgnoredRole} | ownerOrAdmin=${isOwnerOrAdmin} | whitelisted=${isWhitelisted} | urlCmd=${isUrlCmd}`);

          if (!isChannelIgnored && !hasIgnoredRole && !isOwnerOrAdmin && !isWhitelisted && !isUrlCmd) {
            (message as any)._antiLinkHandled = true;
            markMessageAntiLinkHandled(message.id);
            deleted = true;
            reason = 'Posting unauthorized links';
            console.log(`[AntiLink Debug] → DELETING message from ${message.author.username}`);
          } else {
            console.log(`[AntiLink Debug] → ALLOWED (one of the bypass conditions is true)`);
          }
        } else if (hasLink) {
          console.log(`[AntiLink Debug] blockLinks=false — anti-link disabled in automod config. Set blockLinks=true or run r!automod antilink enable`);
        }

        // 2. Bad Words Filter
        if (!deleted && config.badWords && config.badWords.length > 0) {
          for (const word of config.badWords) {
            const trimmed = (typeof word === 'string' ? word : '').trim().toLowerCase();
            if (trimmed.length > 0 && content.includes(trimmed)) {
              deleted = true;
              reason = 'Using blacklisted words';
              break;
            }
          }
        }
        
        // 3. Caps Spam
        if (!deleted && config.preventCapsSpam && message.content.length > 10) {
          const capsCount = message.content.replace(/[^A-Z]/g, '').length;
          if (capsCount / message.content.length > 0.7) {
            deleted = true;
            reason = 'Excessive capital letters';
          }
        }

        // 4. Mention Spam
        if (!deleted && config.maxMentions && config.maxMentions > 0) {
          const mentionCount = message.mentions.users.size + message.mentions.roles.size;
          if (mentionCount > config.maxMentions) {
            deleted = true;
            reason = `Excessive mentions (${mentionCount}/${config.maxMentions})`;
          }
        }

        // 5. Emoji Spam
        if (!deleted && config.maxEmojis && config.maxEmojis > 0) {
          const emojiRegex = /(<a?:[a-zA-Z0-9_]+:[0-9]+>|[\u{1F300}-\u{1F9FF}])/gu;
          const emojiCount = (message.content.match(emojiRegex) || []).length;
          if (emojiCount > config.maxEmojis) {
            deleted = true;
            reason = `Excessive emojis (${emojiCount}/${config.maxEmojis})`;
          }
        }

        // 6. Sliding Window Anti-Spam & Cross-Channel Raid Protection
        if (!deleted && message.guild) {
          const isOwnerOrAdmin = message.guild.ownerId === message.author.id ||
            Boolean(message.member?.permissions?.has?.(PermissionFlagsBits.Administrator));
          
          if (!isOwnerOrAdmin) {
            const spamCheck = SlidingWindowSpamDetector.checkSpam(
              message.guild.id,
              message.author.id,
              message.channel.id,
              message.content
            );
            if (spamCheck.isSpam) {
              deleted = true;
              reason = spamCheck.reason;
            }
          }
        }

        if (deleted) {
          try {
            await message.delete().catch(() => {});

            if (reason === 'Posting unauthorized links') {
              (message as any)._antiLinkHandled = true;

              const maxLimit = typeof config.antiLinkLimit === 'number' && config.antiLinkLimit > 0
                ? config.antiLinkLimit
                : (typeof config.limit === 'number' && config.limit > 0 ? config.limit : 5);

              const currentCount = incrementLinkViolations(message.guild.id, message.author.id);

              if (currentCount < maxLimit) {
                // Send warning card in channel displaying current count vs max limit
                const warnCard = buildLimeWarnCard({
                  category: 'Unauthorized Link',
                  user: message.author,
                  reason: 'Posting unauthorized links',
                  currentLimit: currentCount,
                  maxLimit: maxLimit,
                  thumbnailUrl: message.author.displayAvatarURL?.()
                });
                await message.channel.send({ embeds: [warnCard] })
                  .then((m: any) => setTimeout(() => m.delete().catch(() => {}), 6000));

                // Send DM warning notification
                const dmEmbed = Embeds.warn(
                  `<:wrong:1532390628330307634> Anti-Link Warning (${currentCount}/${maxLimit}) — ${message.guild.name}`,
                  `Your message in **#${message.channel.name || 'channel'}** was **deleted by default** because it contained an unauthorized link.\n\n**Violation Count**: ${currentCount}/${maxLimit}\nReaching ${maxLimit} link violations will trigger server punishment.`,
                  { module: 'automod', footer: `${message.guild.name} • Anti-Link Protection` }
                );
                await message.member?.send({ embeds: [dmEmbed] }).catch(() => {});
              } else {
                // Violation limit reached! Send punishment notification & execute punishment
                const punishAction = (config.punishment || 'mute').toLowerCase();

                const punishEmbed = createLimeEmbed({
                  title: `<:shield:1532403012751065179> Anti-Link Punishment Enforced (${currentCount}/${maxLimit})`,
                  description: [
                    `> ${message.author} has reached the maximum Anti-Link limit (**${currentCount}/${maxLimit}**) and has been **${punishAction.toUpperCase()}D**.`,
                    ``,
                    `• **Offender**: ${userTag(message.author)} (\`${message.author.id}\`)`,
                    `• **Channel**: <#${message.channel.id}>`,
                    `• **Action Enforced**: \`${punishAction.toUpperCase()}\``
                  ].join('\n'),
                  color: Colors.DANGER
                });
                await message.channel.send({ embeds: [punishEmbed] })
                  .then((m: any) => setTimeout(() => m.delete().catch(() => {}), 8000));

                // Execute punishment action
                if (punishAction === 'mute' || punishAction === 'timeout') {
                  await message.member?.timeout(10 * 60 * 1000, 'Anti-Link: Maximum link violation limit exceeded').catch(() => {});
                } else if (punishAction === 'kick') {
                  await message.member?.kick('Anti-Link: Maximum link violation limit exceeded').catch(() => {});
                } else if (punishAction === 'ban') {
                  await message.member?.ban({ reason: 'Anti-Link: Maximum link violation limit exceeded' }).catch(() => {});
                }

                // Send DM notification of punishment
                const dmEmbed = Embeds.error(
                  `<:gavel:1532621057318584380> Anti-Link Limit Reached — ${message.guild.name}`,
                  `You have reached the maximum Anti-Link violation limit (**${currentCount}/${maxLimit}**) in **${message.guild.name}**.\n\n**Action Enforced**: ${punishAction.toUpperCase()}\n**Reason**: Repeated unauthorized link sharing.`,
                  { module: 'automod', footer: `${message.guild.name} • Anti-Link Enforcement` }
                );
                await message.member?.send({ embeds: [dmEmbed] }).catch(() => {});

                // Reset violation count after punishment
                resetLinkViolations(message.guild.id, message.author.id);
              }
            } else {
              const categoryName = reason.includes('words') ? 'Swear Words' : (reason.includes('caps') ? 'Caps' : 'Spam');
              const warnCard = buildLimeWarnCard({
                category: categoryName,
                user: message.author,
                reason: reason,
                currentLimit: 1,
                maxLimit: 5,
                thumbnailUrl: message.author.displayAvatarURL?.()
              });
              await message.channel.send({ embeds: [warnCard] })
                .then((m: any) => setTimeout(() => m.delete().catch(() => {}), 6000));

              // Handle non-link punishments if configured
              if (config.punishment === 'warn') {
                const dmEmbed = Embeds.warn(
                  `<:wrong:1532390628330307634> AutoMod Warning — ${message.guild.name}`,
                  `Your message in **#${message.channel.name || 'channel'}** was removed by AutoMod.\n\n**Server**: ${message.guild.name}\n**Reason**: ${reason}`,
                  { module: 'automod', footer: `${message.guild.name}  •  AutoMod Protection` }
                );
                await message.member?.send({ embeds: [dmEmbed] }).catch(() => {});
              } else if (config.punishment === 'timeout') {
                await message.member?.timeout(5 * 60 * 1000, 'AutoMod Timeout').catch(() => {});
              } else if (config.punishment === 'kick') {
                await message.member?.kick('AutoMod Kick').catch(() => {});
              }
            }
            
            context.logSyncEvent(`AutoMod: Removed message from ${userTag(message.author)} in #${message.channel.name} (${reason})`, 'warn');
            
            // Persist to SQLite server_audit_logs & refresh live dashboard
            Database.saveAuditLog({
              guildId: message.guild.id,
              action: reason === 'Posting unauthorized links' ? 'AUTOMOD_LINK' : 'AUTOMOD_FILTER',
              targetId: message.author.id,
              targetType: 'User',
              targetName: userTag(message.author),
              executorId: client?.user?.id || 'bot',
              executorTag: 'AutoMod Core',
              reason: reason || 'AutoMod Policy Violation',
              details: { channel: message.channel.id, content: message.content.slice(0, 100) },
              type: 'warn',
              timestamp: Date.now()
            }).catch(() => {});

            DashboardSyncService.triggerSync(message.guild.id);

            // Log to discord channel
            if (config.logChannelId) {
              const logChannel = message.guild.channels.cache.get(config.logChannelId);
              if (logChannel && logChannel.isTextBased()) {
                const embed = Embeds.warn(
                  '<:shield:1532403012751065179> AutoMod Intervention',
                  `**User**: ${userTag(message.author)} (\`${message.author.id}\`)\n**Channel**: ${message.channel}\n**Reason**: \`${reason}\`\n\n**Content**:\n${message.content.length > 900 ? message.content.substring(0, 900) + '\u2026' : message.content}`,
                  { module: 'automod' }
                );
                await logChannel.send({ embeds: [embed] });
              }
            }

          } catch (e) {
            console.error('Automod delete error:', e);
          }
        }
      }
    }
  ]
};
