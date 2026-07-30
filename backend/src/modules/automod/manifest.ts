import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { Embeds, Colors, buildStatusCard } from '../../core/UIFactory.js';
import { checkWhitelistPermission } from '../../utils/whitelistCheck.js';
import { isUrlCommandBypass } from '../../utils/antiLinkBypass.js';

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
      content: `💬 **Message from ${message.author.username}** *(link removed)*:\n${cleanText}`,
      allowedMentions: { parse: [] }
    });
  } catch (e) {
    console.error('[Anti-Link] Error reposting sanitized content:', e);
  }
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
      description: 'Enterprise AntiLink & AutoMod configuration',
      options: [
        {
          name: 'status',
          description: 'View AutoMod status, AntiLink settings, ignored channels and roles',
          type: 1
        },
        {
          name: 'antilink',
          description: 'Configure AntiLink protection settings',
          type: 1,
          options: [
            {
              name: 'action',
              type: 3,
              description: 'Action (enable / disable / status)',
              required: true,
              choices: [
                { name: 'Enable AntiLink', value: 'enable' },
                { name: 'Disable AntiLink', value: 'disable' },
                { name: 'View Status', value: 'status' }
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
        if (!guild) return interaction.reply({ content: '❌ AutoMod commands must be run inside a server.', flags: 64 });

        const modules = context.getModulesState ? context.getModulesState() : [];
        const amMod = modules.find((m: any) => m.id === 'automod');
        const config = amMod?.config || {};

        const sub = interaction.options.getSubcommand(false);
        const actionArg = interaction.options.getString('action');

        // IGNORE CHANNEL
        if (sub === 'ignore-channel' || interaction.parsed?.args?.[0] === 'ignore-channel') {
          const action = actionArg || interaction.parsed?.args?.[1]?.toLowerCase();
          const targetChannel = interaction.options.getChannel('channel');

          let ignoredChannels: string[] = config.ignoredChannels || [];

          if (action === 'add') {
            if (!targetChannel) {
              return interaction.reply({ content: '❌ Please mention or specify a target channel to ignore.', flags: 64 });
            }
            if (!ignoredChannels.includes(targetChannel.id)) {
              ignoredChannels.push(targetChannel.id);
              context.updateModuleConfig('automod', { ...config, ignoredChannels });
              context.logSyncEvent(`AutoMod: Added #${targetChannel.name} to AntiLink ignored channels.`, 'success');
            }
            return interaction.reply({ content: `✅ Added ${targetChannel} to AntiLink **ignored channels**. Links posted in this channel will now be bypassed.`, flags: 64 });
          }

          if (action === 'remove') {
            if (!targetChannel) {
              return interaction.reply({ content: '❌ Please mention or specify a target channel to remove.', flags: 64 });
            }
            ignoredChannels = ignoredChannels.filter((id: string) => id !== targetChannel.id);
            context.updateModuleConfig('automod', { ...config, ignoredChannels });
            context.logSyncEvent(`AutoMod: Removed #${targetChannel.name} from AntiLink ignored channels.`, 'warn');
            return interaction.reply({ content: `✅ Removed ${targetChannel} from AntiLink **ignored channels**. Links in this channel are now filtered.`, flags: 64 });
          }

          // list
          const channelMentions = ignoredChannels.map((id: string) => `<#${id}>`).join(', ');
          return interaction.reply({
            content: `📢 **AntiLink Ignored Channels**:\n${channelMentions || '*No ignored channels configured.*'}`,
            flags: 64
          });
        }

        // IGNORE ROLE
        if (sub === 'ignore-role' || interaction.parsed?.args?.[0] === 'ignore-role') {
          const action = actionArg || interaction.parsed?.args?.[1]?.toLowerCase();
          const targetRole = interaction.options.getRole('role');

          let ignoredRoles: string[] = config.ignoredRoles || [];

          if (action === 'add') {
            if (!targetRole) {
              return interaction.reply({ content: '❌ Please mention or specify a target role to ignore.', flags: 64 });
            }
            if (!ignoredRoles.includes(targetRole.id)) {
              ignoredRoles.push(targetRole.id);
              context.updateModuleConfig('automod', { ...config, ignoredRoles });
              context.logSyncEvent(`AutoMod: Added @${targetRole.name} to AntiLink ignored roles.`, 'success');
            }
            return interaction.reply({ content: `✅ Added ${targetRole} to AntiLink **ignored roles**. Members with this role can now post links anywhere.`, flags: 64 });
          }

          if (action === 'remove') {
            if (!targetRole) {
              return interaction.reply({ content: '❌ Please mention or specify a target role to remove.', flags: 64 });
            }
            ignoredRoles = ignoredRoles.filter((id: string) => id !== targetRole.id);
            context.updateModuleConfig('automod', { ...config, ignoredRoles });
            context.logSyncEvent(`AutoMod: Removed @${targetRole.name} from AntiLink ignored roles.`, 'warn');
            return interaction.reply({ content: `✅ Removed ${targetRole} from AntiLink **ignored roles**. Link restrictions re-enabled for this role.`, flags: 64 });
          }

          // list
          const roleMentions = ignoredRoles.map((id: string) => `<@&${id}>`).join(', ');
          return interaction.reply({
            content: `👑 **AntiLink Ignored Roles**:\n${roleMentions || '*No ignored roles configured.*'}`,
            flags: 64
          });
        }

        // ANTILINK ENABLE / DISABLE
        if (sub === 'antilink' || interaction.parsed?.args?.[0] === 'antilink') {
          const action = actionArg || interaction.parsed?.args?.[1]?.toLowerCase();
          if (action === 'enable') {
            context.updateModuleConfig('automod', { ...config, blockLinks: true });
            return interaction.reply({ content: '✅ AntiLink protection has been **ENABLED**.', flags: 64 });
          }
          if (action === 'disable') {
            context.updateModuleConfig('automod', { ...config, blockLinks: false });
            return interaction.reply({ content: '⚠️ AntiLink protection has been **DISABLED**.', flags: 64 });
          }
        }

        // DEFAULT STATUS & OVERVIEW
        const ignoredChannelsList = (config.ignoredChannels || []).map((id: string) => `<#${id}>`).join(', ') || '*None*';
        const ignoredRolesList = (config.ignoredRoles || []).map((id: string) => `<@&${id}>`).join(', ') || '*None*';

        const statusEmbed = Embeds.info(
          '🤖 AutoMod & AntiLink Protection Center',
          '*Automated chat filtering, anti-link rules, ignored channels, and role bypasses.*',
          {
            module: 'automod',
            fields: [
              { name: '⚡ AutoMod Status',          value: `\`${amMod?.status || 'enabled'}\``,                     inline: true },
              { name: '🔗 AntiLink Filter',         value: config.blockLinks !== false ? '🟢 **Enabled**' : '🔴 **Disabled**', inline: true },
              { name: '⚠️ Punishment Mode',         value: `\`${config.punishment || 'warn'}\``,                  inline: true },
              { name: '📢 Ignored Channels',        value: ignoredChannelsList,                                    inline: false },
              { name: '👑 Ignored Roles',           value: ignoredRolesList,                                       inline: false },
              { name: '📝 Configure Commands',      value: '• `r!automod ignore-channel <add|remove|list> #channel`\n• `r!automod ignore-role <add|remove|list> @role`\n• `r!automod antilink <enable|disable>`', inline: false },
            ],
          }
        );

        return interaction.reply({ embeds: [statusEmbed] });
      }
    },
    {
      name: 'messageCreate',
      handler: async (client: any, message: any, context: any) => {
        if (message.author.bot) return;
        if (!message.guild) return;
        
        const modules = context.getModulesState ? context.getModulesState() : [];
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
        const content = message.content.toLowerCase();
        let deleted = false;
        let reason = '';

        // 1. AntiLink Filter with Ignored Channels & Ignored Roles Bypass
        const blockLinks = config.blockLinks !== false;
        const LINK_REGEX = /(?:https?:\/\/|ftps?:\/\/|www\.|discord(?:app)?\.(?:gg|com|io|me)|dsc\.gg|disboard\.org|[a-zA-Z0-9-]+\.(?:com|net|org|gg|io|me|xyz|co|uk|in|info|online|site|app|tech|store|top|live|shop|vip|fun|club|pro|link|bot|ai|dev|[a-zA-Z]{2,})\b)/i;
        const hasLink = LINK_REGEX.test(content) || content.includes('http://') || content.includes('https://') || content.includes('www.') || content.includes('discord.gg') || content.includes('discord.com/invite') || content.includes('dsc.gg');

        if (hasLink) {
          console.log(`[AntiLink Debug] Link detected from ${message.author.username} | blockLinks=${blockLinks} | content="${message.content.substring(0,80)}"`);
        }

        if (blockLinks && hasLink) {
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

        if (deleted) {
          try {
            await message.delete().catch(() => {});

            if (reason === 'Posting unauthorized links') {
              (message as any)._antiLinkHandled = true;
              const dmEmbed = Embeds.warn(
                `🔗 Anti-Link Enforcement — ${message.guild.name}`,
                `Your message in **#${message.channel.name || 'channel'}** was removed because it contained an unauthorized link.\n\n**Server**: ${message.guild.name}\n**Action**: Message removed & link blocked.`,
                { module: 'automod', footer: `${message.guild.name}  •  Anti-Link Protection` }
              );
              await message.member?.send({ embeds: [dmEmbed] }).catch(() => {});
            } else {
              const warningEmbed = Embeds.warn(
                '🛡️ AutoMod Enforcement',
                `**User**: ${message.author} (\`${message.author.id}\`)\n**Reason**: ${reason}\n**Action**: Message removed.`,
                { module: 'automod' }
              );
              await message.channel.send({ embeds: [warningEmbed] })
                .then((m: any) => setTimeout(() => m.delete().catch(() => {}), 6000));
            }
            
            context.logSyncEvent(`AutoMod: Removed message from ${userTag(message.author)} in #${message.channel.name} (${reason})`, 'warn');
            
            // Log to discord channel
            if (config.logChannelId) {
              const logChannel = message.guild.channels.cache.get(config.logChannelId);
              if (logChannel && logChannel.isTextBased()) {
                const embed = Embeds.warn(
                  '🛡️ AutoMod Intervention',
                  `**User**: ${userTag(message.author)} (\`${message.author.id}\`)\n**Channel**: ${message.channel}\n**Reason**: \`${reason}\`\n\n**Content**:\n${message.content.length > 900 ? message.content.substring(0, 900) + '\u2026' : message.content}`,
                  { module: 'automod' }
                );
                await logChannel.send({ embeds: [embed] });
              }
            }

            // Handle punishment
            if (config.punishment === 'warn') {
              const dmEmbed = Embeds.warn(
                `⚠️ AutoMod Warning — ${message.guild.name}`,
                `Your message in **#${message.channel.name || 'channel'}** was removed by AutoMod.\n\n**Server**: ${message.guild.name}\n**Reason**: ${reason}`,
                { module: 'automod', footer: `${message.guild.name}  •  AutoMod Protection` }
              );
              await message.member.send({ embeds: [dmEmbed] }).catch(() => {});
            } else if (config.punishment === 'timeout') {
              await message.member.timeout(5 * 60 * 1000, 'AutoMod Timeout').catch(() => {});
            } else if (config.punishment === 'kick') {
              await message.member.kick('AutoMod Kick').catch(() => {});
            }

          } catch (e) {
            console.error('Automod delete error:', e);
          }
        }
      }
    }
  ]
};
