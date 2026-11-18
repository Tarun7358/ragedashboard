import { PermissionFlagsBits, ChannelType, Guild } from 'discord.js';
import { ModuleManifest } from '../../core/types.js';
import { createLimeEmbed, buildMinimalAction, buildLimeActionCard, buildLimeOverviewCard, VERIFIED_ICON, WRONG_ICON, SHIELD_ICON, CONFIG_ICON, INFO_ICON } from '../../core/UIFactory.js';
import { checkWhitelistPermission } from '../../utils/whitelistCheck.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';

// User specified server emojis for Embeds
export const STAT_EMOJIS = {
  YOUTUBE: '<:YouTube:1527641424169009412>',
  CANDY: '<:drmomoscandy:1511379935237902517>',
  TWITTER: '<a:verifiedtwitter:1518869600899432468>',
  FOXY: '<:foxydealz:1511379877180215296>',
  ARROW: '<a:animatedarrowwhite:1527647357473132554>',
  DISCORD: '<:discord:1518869308162314310>'
};

// Standard Unicode Emojis for Channel Titles (Discord API only renders standard Unicode emojis in channel names)
export const CHANNEL_EMOJIS = {
  MEMBERS: '👥',
  VOICE: '🎙️',
  YOUTUBE: '🔴',
  VIEWS: '📈'
};

export function formatViews(viewsStr: string): string {
  if (!viewsStr || viewsStr === '0' || viewsStr === 'N/A') return viewsStr || '0';
  const cleanNum = parseInt(viewsStr.replace(/[^0-9]/g, ''), 10);
  if (isNaN(cleanNum)) return viewsStr;

  if (cleanNum >= 1_000_000_000) {
    return (cleanNum / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  }
  if (cleanNum >= 1_000_000) {
    return (cleanNum / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (cleanNum >= 1_000) {
    return (cleanNum / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return cleanNum.toLocaleString();
}

export function cleanSubCount(subStr: string): string {
  if (!subStr || subStr === 'N/A') return '0';
  let s = subStr.replace(/subscribers?/i, '').trim();
  s = s.replace(/million/i, 'M').replace(/thousand/i, 'K').replace(/billion/i, 'B').replace(/\s+/g, '');
  return s || '0';
}

export async function fetchYouTubeSubscribers(channelHandle: string): Promise<{ subs: string; views: string }> {
  try {
    const cleanHandle = channelHandle.replace(/^https?:\/\/(www\.)?youtube\.com\//i, '').replace(/^\/?@?/, '');
    const url = `https://www.youtube.com/@${cleanHandle}/about`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (!res.ok) return { subs: 'N/A', views: 'N/A' };
    const html = await res.text();

    const subMatch = html.match(/"subscriberCountText":"([^"]+)"/) ||
                     html.match(/"content":"([^"]*subscribers?)"/i) ||
                     html.match(/([\d\.]+[KMB]?)\s+subscribers/i) ||
                     html.match(/"subscriberCountText":\s*\{[^\}]*"simpleText":"([^"]+)"\}/) ||
                     html.match(/"subscriberCountText":\s*\{[^\}]*"text":"([^"]+)"\}/) ||
                     html.match(/-\s*([\d\.]+[KMB]?)\s+subscribers/i);

    const videoMatch = html.match(/"content":"([^"]*videos?)"/i) ||
                       html.match(/([\d,]+)\s+videos/i);

    const viewMatch = html.match(/"viewCountText":"([^"]+)"/) ||
                      html.match(/"viewCountText":\s*\{[^\}]*"simpleText":"([^"]+)"\}/) ||
                      html.match(/"viewCountText":\s*\{[^\}]*"text":"([^"]+)"\}/) ||
                      html.match(/"viewCountText":\{"accessibility":\{"accessibilityData":\{"label":"([^"]+)"\}/) ||
                      html.match(/([\d,]+)\s+views/i);

    const rawSub = subMatch ? subMatch[1] : '0';
    const rawViews = viewMatch ? viewMatch[1] : (videoMatch ? videoMatch[1] : '0');

    return { subs: cleanSubCount(rawSub), views: formatViews(rawViews) };
  } catch (err) {
    return { subs: 'N/A', views: 'N/A' };
  }
}

export function resolveTargetChannel(guild: Guild, input?: string) {
  if (!input) return null;
  const cleanInput = input.trim();
  const idMatch = cleanInput.match(/^<#(\d+)>$/) || cleanInput.match(/^(\d{17,20})$/);
  if (idMatch) {
    return guild.channels.cache.get(idMatch[1]) || null;
  }
  const lower = cleanInput.toLowerCase().replace(/^#/, '');
  return guild.channels.cache.find(c => c.name.toLowerCase() === lower || c.name.toLowerCase().includes(lower)) || null;
}

export async function setVoiceChannelStatusHelper(channel: any, statusText: string) {
  if (!channel || !channel.isVoiceBased?.()) return;
  try {
    if (typeof channel.setVoiceChannelStatus === 'function') {
      await channel.setVoiceChannelStatus(statusText);
    } else if (channel.client?.rest) {
      await channel.client.rest.put(`/channels/${channel.id}/voice-status`, {
        body: { status: statusText }
      });
    }
  } catch (err: any) {
    // Graceful catch if endpoint not supported or missing permissions
  }
}

export async function syncGuildStatCounters(guild: Guild, config: any, context?: any) {
  if (!config || !config.enabled) return;

  try {
    // 1. Calculate Live Guild Stats
    const totalMembers = guild.memberCount || guild.members.cache.size || 0;
    
    let activeVoiceCount = 0;
    guild.channels.cache.forEach(ch => {
      if (ch.isVoiceBased()) {
        activeVoiceCount += ch.members.size;
      }
    });

    // 2. Update Member Stats Voice Channel Status
    if (config.memberChannelId) {
      const channel = guild.channels.cache.get(config.memberChannelId);
      if (channel) {
        const statusText = `${STAT_EMOJIS.CANDY} . Members : ${totalMembers} . ${STAT_EMOJIS.FOXY} Voice Chat : ${activeVoiceCount}`;
        await setVoiceChannelStatusHelper(channel, statusText);
      }
    }

    // 3. Update YouTube Stats Voice Channel Status
    if (config.ytChannelId && config.ytHandle) {
      const channel = guild.channels.cache.get(config.ytChannelId);
      if (channel) {
        const ytData = await fetchYouTubeSubscribers(config.ytHandle);
        const statusText = `${STAT_EMOJIS.YOUTUBE} Subs : ${ytData.subs} . ${STAT_EMOJIS.ARROW} ${ytData.views} Views`;
        await setVoiceChannelStatusHelper(channel, statusText);
      }
    }
  } catch (err: any) {
    console.error(`[StatsCounter] Failed to sync counters for guild ${guild.id}:`, err?.message || err);
  }
}

export const StatsCounterManifest: ModuleManifest = {
  id: 'stats-counter',
  name: 'Server & Social Stats Counter Engine',
  version: '3.0.0',
  description: 'Automated display-only locked voice channel counters for Server Members, Active VC Chat, and YouTube Subscribers.',
  configSchema: {
    requiredFields: [],
    validate: (cfg: any) => ({ progress: 100, errors: [] })
  },
  commands: [
    {
      name: 'counter',
      description: '📊 Manage display-only Server & YouTube live statistics channels.',
      category: 'Community',
      userPermissions: ['Manage Channels', 'Manage Guild'],
      botPermissions: ['Manage Channels', 'Manage Roles', 'Connect', 'ViewChannel'],
      aliases: ['statscounter', 'serverstats', 'ytcounter'],
      usage: 'r!counter <setup | status | update | reset> [members | youtube <handle>]',
      examples: [
        'r!counter setup members',
        'r!counter setup youtube @MrBeast',
        'r!counter status',
        'r!counter update',
        'r!counter reset'
      ],
      subcommands: [
        {
          name: 'setup members',
          description: 'Create locked voice channel displaying live Member Count & Active VC Chat.',
          examples: ['r!counter setup members']
        },
        {
          name: 'setup youtube <handle>',
          description: 'Create locked voice channel displaying live YouTube Subscribers & Videos.',
          examples: ['r!counter setup youtube @MrBeast']
        },
        {
          name: 'status',
          description: 'View current active counter channels and live metrics.',
          examples: ['r!counter status']
        },
        {
          name: 'update',
          description: 'Instantly force sync channel names with live statistics.',
          examples: ['r!counter update']
        },
        {
          name: 'reset',
          description: 'Remove counter channels and reset module configuration.',
          examples: ['r!counter reset']
        }
      ]
    }
  ],
  events: [
    {
      name: 'voiceStateUpdate',
      handler: async (client: any, oldState: any, newState: any, context: any) => {
        const guild = newState?.guild || oldState?.guild;
        if (!guild) return;

        const modules = context.getModulesState ? context.getModulesState() : [];
        const mod = modules.find((m: any) => m.id === 'stats-counter');
        const config = mod?.config || {};
        if (!config || !config.enabled) return;

        await syncGuildStatCounters(guild, config, context).catch(() => {});
      }
    },
    {
      name: 'command_counter',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        if (!guild) return;

        // Check permissions: Strict Guild Owner & Extra Owner access
        const { isOwnerOrExtraOwner } = await import('../../utils/whitelistCheck.js');
        const isOwnerOrExtra = await isOwnerOrExtraOwner(interaction.user.id, guild);
        if (!isOwnerOrExtra) {
          return interaction.reply({
            embeds: [
              createLimeEmbed({
                title: 'Access Denied',
                description: `${WRONG_ICON} Access Denied: Only the **Guild Owner** and **Extra Owners** can configure or use Stats Counter commands.`
              })
            ],
            flags: 64
          });
        }

        const args = interaction.parsed?.args || [];
        const rawSub = (interaction.options?.getSubcommand?.(false) || args[0] || 'status').toLowerCase();
        const mode = args[1] ? args[1].toLowerCase() : '';

        const modules = context.getModulesState ? context.getModulesState() : [];
        const mod = modules.find((m: any) => m.id === 'stats-counter');
        const config = mod?.config || {};

        // 1. ENABLE / DISABLE
        if (rawSub === 'enable' || rawSub === 'on' || rawSub === 'active') {
          await interaction.deferReply({ flags: 64 });
          const totalMembers = guild.memberCount || guild.members.cache.size;
          let activeVoice = 0;
          guild.channels.cache.forEach((ch: any) => {
            if (ch.isVoiceBased?.()) activeVoice += ch.members.size;
          });

          let targetChannel: any = config.memberChannelId ? guild.channels.cache.get(config.memberChannelId) : null;
          let createdNew = false;

          if (!targetChannel && !config.ytChannelId) {
            // Auto setup member channel if no counters exist yet
            let category = config.memberCategoryId ? guild.channels.cache.get(config.memberCategoryId) : null;
            if (!category) {
              category = await guild.channels.create({
                name: '.  Rage . GG',
                type: ChannelType.GuildCategory
              }).catch(() => null);
            }

            targetChannel = await guild.channels.create({
              name: '🔒 . Rage . Server',
              type: ChannelType.GuildVoice,
              parent: category ? category.id : undefined,
              permissionOverwrites: [
                {
                  id: guild.roles.everyone.id,
                  allow: [PermissionFlagsBits.ViewChannel],
                  deny: [PermissionFlagsBits.Connect]
                }
              ]
            });
            createdNew = true;
          }

          const updatedConfig = {
            ...config,
            enabled: true,
            ...(targetChannel ? {
              memberChannelId: targetChannel.id,
              memberCategoryId: targetChannel.parentId || config.memberCategoryId || null
            } : {})
          };

          await context.updateModuleConfig('stats-counter', updatedConfig);
          await syncGuildStatCounters(guild, updatedConfig, context);

          const embed = buildMinimalAction({
            user: interaction.user,
            action: createdNew
              ? 'enabled Stats Counter Engine & configured live Member Counter channel'
              : 'enabled Stats Counter Engine & force-synced live counter channels',
            ...(targetChannel ? { target: targetChannel } : {})
          });

          return interaction.editReply({ embeds: [embed] });
        }

        if (rawSub === 'disable' || rawSub === 'off' || rawSub === 'deactivate') {
          await interaction.deferReply({ flags: 64 });
          const updatedConfig = { ...config, enabled: false };
          await context.updateModuleConfig('stats-counter', updatedConfig);

          const embed = buildMinimalAction({
            user: interaction.user,
            action: 'disabled Stats Counter Engine'
          });

          return interaction.editReply({ embeds: [embed] });
        }

        // 2. STATUS
        if (rawSub === 'status' || (rawSub === 'setup' && !mode)) {
          const totalMembers = guild.memberCount || guild.members.cache.size;
          let activeVoice = 0;
          guild.channels.cache.forEach((ch: any) => {
            if (ch.isVoiceBased?.()) activeVoice += ch.members.size;
          });

          const overviewCard = buildLimeOverviewCard({
            title: 'SERVER & SOCIAL STATS COUNTER MATRIX',
            subtitle: 'LIVE AUTOMATED DISPLAY-ONLY VOICE CHANNELS',
            sections: [
              {
                title: `${CONFIG_ICON} OPERATIONAL PARAMETERS`,
                items: [
                  `• **Module Status**: ${config.enabled ? '`ACTIVE`' : '`OFFLINE`'}`,
                  `• **Member Stat Channel**: ${config.memberChannelId ? `<#${config.memberChannelId}>` : '`Not Setup`'}`,
                  `• **YouTube Stat Channel**: ${config.ytChannelId ? `<#${config.ytChannelId}>` : '`Not Setup`'}`,
                  `• **Connected YouTube**: ${config.ytHandle ? `\`${config.ytHandle}\`` : '`None`'}`,
                  `• **Live Guild Members**: \`${totalMembers}\``,
                  `• **Live Active VC Members**: \`${activeVoice}\``
                ]
              }
            ],
            footerText: 'Rage Optimiser • Stats Counter Engine'
          });

          return interaction.reply({ embeds: [overviewCard], flags: 64 });
        }

        // 3. SETUP / SETCHANNEL MEMBERS
        if (rawSub === 'members' || rawSub === 'server' || ((rawSub === 'setup' || rawSub === 'setchannel' || rawSub === 'set') && (mode === 'members' || mode === 'server'))) {
          const isDirect = (rawSub === 'members' || rawSub === 'server');
          const targetInput = isDirect ? args[1] : (args[2] || (rawSub === 'set' && args[1] === 'channel' ? args[3] : undefined) || interaction.options?.getChannel?.('channel')?.id || interaction.options?.getString?.('channel'));
          await interaction.deferReply({ flags: 64 });

          const totalMembers = guild.memberCount || guild.members.cache.size;
          let activeVoice = 0;
          guild.channels.cache.forEach((ch: any) => {
            if (ch.isVoiceBased?.()) activeVoice += ch.members.size;
          });

          let targetChannel: any = resolveTargetChannel(guild, targetInput);

          if (targetChannel) {
            if (targetChannel.isVoiceBased?.()) {
              await targetChannel.permissionOverwrites?.edit?.(guild.roles.everyone.id, {
                ViewChannel: true,
                Connect: false
              }).catch(() => {});
            }
          } else {
            // Create Category if needed
            let category = config.memberCategoryId ? guild.channels.cache.get(config.memberCategoryId) : null;
            if (!category) {
              category = await guild.channels.create({
                name: '.  Rage . GG',
                type: ChannelType.GuildCategory
              }).catch(() => null);
            }

            targetChannel = await guild.channels.create({
              name: '🔒 . Rage . Server',
              type: ChannelType.GuildVoice,
              parent: category ? category.id : undefined,
              permissionOverwrites: [
                {
                  id: guild.roles.everyone.id,
                  allow: [PermissionFlagsBits.ViewChannel],
                  deny: [PermissionFlagsBits.Connect]
                }
              ]
            });
          }

          const updatedConfig = {
            ...config,
            enabled: true,
            memberChannelId: targetChannel.id,
            memberCategoryId: targetChannel.parentId || config.memberCategoryId || null
          };

          await context.updateModuleConfig('stats-counter', updatedConfig);
          const statusText = `${STAT_EMOJIS.CANDY} . Members : ${totalMembers} . ${STAT_EMOJIS.FOXY} Voice Chat : ${activeVoice}`;
          await setVoiceChannelStatusHelper(targetChannel, statusText);

          const embed = buildMinimalAction({
            user: interaction.user,
            action: 'configured Voice Channel Status for',
            target: targetChannel
          });

          return interaction.editReply({ embeds: [embed] });
        }

        // 4. SETUP / SETCHANNEL YOUTUBE
        const isYtDirect = (rawSub === 'youtube' || rawSub === 'yt');
        if (isYtDirect || ((rawSub === 'setup' || rawSub === 'setchannel' || rawSub === 'set') && (mode === 'youtube' || mode === 'yt'))) {
          const handle = isYtDirect ? args[1] : (args[2] || interaction.options?.getString?.('handle'));
          if (!handle) {
            return interaction.reply({
              embeds: [
                createLimeEmbed({
                  title: 'Syntax Error',
                  description: `${WRONG_ICON} Please specify a valid YouTube handle or URL.\n\n**Example**: \`r!counter setup youtube @MrBeast [#channel]\` or \`r!counter youtube @MrBeast\``
                })
              ],
              flags: 64
            });
          }

          const targetInput = isYtDirect ? args[2] : (args[3] || (rawSub === 'set' && args[1] === 'channel' ? args[4] : undefined) || interaction.options?.getChannel?.('channel')?.id || interaction.options?.getString?.('channel'));
          await interaction.deferReply({ flags: 64 });

          const ytData = await fetchYouTubeSubscribers(handle);

          let targetChannel: any = resolveTargetChannel(guild, targetInput);

          if (targetChannel) {
            if (targetChannel.isVoiceBased?.()) {
              await targetChannel.permissionOverwrites?.edit?.(guild.roles.everyone.id, {
                ViewChannel: true,
                Connect: false
              }).catch(() => {});
            }
          } else {
            // Create Category if needed
            let category = config.ytCategoryId ? guild.channels.cache.get(config.ytCategoryId) : null;
            if (!category) {
              category = await guild.channels.create({
                name: '.  Rage . YT',
                type: ChannelType.GuildCategory
              }).catch(() => null);
            }

            targetChannel = await guild.channels.create({
              name: '🔒 . Rage . YouTube',
              type: ChannelType.GuildVoice,
              parent: category ? category.id : undefined,
              permissionOverwrites: [
                {
                  id: guild.roles.everyone.id,
                  allow: [PermissionFlagsBits.ViewChannel],
                  deny: [PermissionFlagsBits.Connect]
                }
              ]
            });
          }

          const updatedConfig = {
            ...config,
            enabled: true,
            ytChannelId: targetChannel.id,
            ytCategoryId: targetChannel.parentId || config.ytCategoryId || null,
            ytHandle: handle
          };

          await context.updateModuleConfig('stats-counter', updatedConfig);
          const statusText = `${STAT_EMOJIS.YOUTUBE} Subs : ${ytData.subs} . ${STAT_EMOJIS.ARROW} ${ytData.views} Views`;
          await setVoiceChannelStatusHelper(targetChannel, statusText);

          const embed = buildMinimalAction({
            user: interaction.user,
            action: `configured display-only YouTube counter for **${handle}**`,
            target: targetChannel
          });

          return interaction.editReply({ embeds: [embed] });
        }

        // 5. UPDATE / SYNC
        if (rawSub === 'update' || rawSub === 'sync') {
          await interaction.deferReply({ flags: 64 });
          await syncGuildStatCounters(guild, config, context);

          const embed = buildMinimalAction({
            user: interaction.user,
            action: 'force-synced all live display counter channel statuses'
          });

          return interaction.editReply({ embeds: [embed] });
        }

        // 6. RESET / DELETE
        if (rawSub === 'reset' || rawSub === 'delete') {
          await interaction.deferReply({ flags: 64 });

          if (config.memberChannelId) {
            const ch = guild.channels.cache.get(config.memberChannelId);
            if (ch) await ch.delete().catch(() => {});
          }
          if (config.ytChannelId) {
            const ch = guild.channels.cache.get(config.ytChannelId);
            if (ch) await ch.delete().catch(() => {});
          }

          await context.updateModuleConfig('stats-counter', {
            enabled: true,
            memberChannelId: null,
            memberCategoryId: null,
            ytChannelId: null,
            ytCategoryId: null,
            ytHandle: null
          });

          const embed = buildMinimalAction({
            user: interaction.user,
            action: 'purged all display counter channels and reset config'
          });

          return interaction.editReply({ embeds: [embed] });
        }

        // Fallback: Overview Status Card
        const totalMembers = guild.memberCount || guild.members.cache.size;
        let activeVoice = 0;
        guild.channels.cache.forEach((ch: any) => {
          if (ch.isVoiceBased?.()) activeVoice += ch.members.size;
        });

        const overviewCard = buildLimeOverviewCard({
          title: 'SERVER & SOCIAL STATS COUNTER MATRIX',
          subtitle: 'LIVE AUTOMATED DISPLAY-ONLY VOICE CHANNELS',
          sections: [
            {
              title: `${CONFIG_ICON} OPERATIONAL PARAMETERS`,
              items: [
                `• **Module Status**: ${config.enabled ? '`ACTIVE`' : '`OFFLINE`'}`,
                `• **Member Stat Channel**: ${config.memberChannelId ? `<#${config.memberChannelId}>` : '`Not Setup`'}`,
                `• **YouTube Stat Channel**: ${config.ytChannelId ? `<#${config.ytChannelId}>` : '`Not Setup`'}`,
                `• **Connected YouTube**: ${config.ytHandle ? `\`${config.ytHandle}\`` : '`None`'}`,
                `• **Live Guild Members**: \`${totalMembers}\``,
                `• **Live Active VC Members**: \`${activeVoice}\``
              ]
            }
          ],
          footerText: 'Rage Optimiser • Stats Counter Engine'
        });

        return interaction.reply({ embeds: [overviewCard], flags: 64 });
      }
    }
  ]
};

export function registerStatsCounterCommands(): void {
  PrefixRegistry.register({
    name: 'counter',
    category: 'Community',
    description: '📊 Manage display-only Server & YouTube live statistics channels.',
    usage: 'r!counter <enable | disable | setup | status | update | reset> [members | youtube <handle>] [#channel|channelId|channelName]',
    aliases: ['statscounter', 'serverstats', 'ytcounter'],
    cooldownSeconds: 3,
    examples: [
      'r!counter enable',
      'r!counter disable',
      'r!counter setup members',
      'r!counter setup members #stats-channel',
      'r!counter setup members 123456789012345678',
      'r!counter setup youtube @MrBeast',
      'r!counter setup youtube @MrBeast #yt-stats',
      'r!counter setup youtube clasherliveop 123456789012345678',
      'r!counter status',
      'r!counter update',
      'r!counter reset'
    ],
    moduleOwnerId: 'stats-counter',
    dangerLevel: 'Low',
    subcommands: [
      {
        name: 'enable',
        description: 'Enable the Stats Counter Engine and force-sync or setup live statistics channels.',
        usage: 'r!counter enable',
        examples: ['r!counter enable'],
        userPermissions: ['ManageGuild']
      },
      {
        name: 'disable',
        description: 'Disable the Stats Counter Engine without deleting configured channels.',
        usage: 'r!counter disable',
        examples: ['r!counter disable'],
        userPermissions: ['ManageGuild']
      },
      {
        name: 'setup members',
        description: 'Set or create locked Voice Channel displaying live Member Count & Active VC Chat.',
        usage: 'r!counter setup members [#channel|channelId|channelName]',
        examples: [
          'r!counter setup members',
          'r!counter setup members #server-stats',
          'r!counter setup members 123456789012345678'
        ],
        userPermissions: ['ManageGuild']
      },
      {
        name: 'setup youtube',
        description: 'Set or create locked Voice Channel displaying live YouTube Subscribers & Views.',
        usage: 'r!counter setup youtube <handle> [#channel|channelId|channelName]',
        examples: [
          'r!counter setup youtube @MrBeast',
          'r!counter setup youtube clasherliveop #yt-counter',
          'r!counter setup youtube @MrBeast 123456789012345678'
        ],
        userPermissions: ['ManageGuild']
      },
      {
        name: 'status',
        description: 'View current active counter channels and live metrics.',
        usage: 'r!counter status',
        examples: ['r!counter status']
      },
      {
        name: 'update',
        description: 'Instantly force sync channel names with live statistics.',
        usage: 'r!counter update',
        examples: ['r!counter update'],
        userPermissions: ['ManageGuild']
      },
      {
        name: 'reset',
        description: 'Remove counter channels and reset module configuration.',
        usage: 'r!counter reset',
        examples: ['r!counter reset'],
        userPermissions: ['ManageGuild']
      }
    ]
  });
}
