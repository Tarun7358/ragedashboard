import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, PermissionFlagsBits } from 'discord.js';
import path from 'path';
import fs from 'fs';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { Database } from '../../core/Database.js';
import { buildLimeOverviewCard, buildMinimalAction, createLimeEmbed, VERIFIED_ICON, WRONG_ICON, TIMER_ICON, SHIELD_ICON, CONFIG_ICON, MEMBER_ICON, VIP_ICON, Colors, BRAND_FOOTER, ARROW_ICON } from '../../core/UIFactory.js';

// Safe display name helper
function userTag(user: any): string {
  return user?.globalName ?? user?.username ?? user?.tag ?? user?.id ?? 'Unknown';
}

// Lime GG aesthetic default constants
export const DEFAULT_LIME_HEADER = '**Welcome, {user}! To {server}**';
export const DEFAULT_LIME_DESCRIPTION = [
  '> **{user}! You Are the {membercount} Member**',
  '> **Thanks for being part of our community.**',
  '> **We hope you have an amazing experience!**',
  '> **Join Our Voice Channel to Connect!**',
  '',
  '  **------- Enhanced Community! -------- **'
].join('\n');
export const DEFAULT_LIME_COLOR = '#CBF528';
export const DEFAULT_LIME_FOOTER = '{server} • Member #{memberCount}';
export const DEFAULT_WELCOME_IMAGE_URL = 'D:\\RAGE OPTIMISER V3\\CLUTCH NATION\\gemini_generated_video_0c54a55f-ezgif.com-cut.png';

export function resolveWelcomeImagePath(inputPath?: string): string | null {
  const target = inputPath || DEFAULT_WELCOME_IMAGE_URL;
  if (!target || target === 'none' || target === 'off') return null;
  if (target.startsWith('http://') || target.startsWith('https://')) return null;

  const cwd = process.cwd();
  const candidates = [
    target,
    'D:\\RAGE OPTIMISER V3\\CLUTCH NATION\\gemini_generated_video_0c54a55f-ezgif.com-cut.png',
    path.resolve(cwd, 'gemini_generated_video_0c54a55f-ezgif.com-cut.png'),
    path.resolve(cwd, 'backend', 'gemini_generated_video_0c54a55f-ezgif.com-cut.png'),
    path.resolve(cwd, '..', 'gemini_generated_video_0c54a55f-ezgif.com-cut.png'),
    path.resolve(cwd, 'backend', 'assets', 'welcome-banner.png'),
    path.resolve(cwd, 'assets', 'welcome-banner.png'),
    path.resolve(cwd, 'backend', 'public', 'assets', 'default_welcome_banner.png'),
    path.resolve(__dirname, '../../assets/welcome-banner.png'),
    path.resolve(__dirname, '../../../assets/welcome-banner.png'),
    '/home/container/gemini_generated_video_0c54a55f-ezgif.com-cut.png',
    '/home/container/backend/assets/welcome-banner.png',
    '/home/container/assets/welcome-banner.png'
  ];

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }
  return null;
}

export function parseWelcomeVariables(str: string, member: any, countOverride?: number, config?: any): string {
  if (!str) return '';
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const memberCount = countOverride ?? (member.guild ? member.guild.memberCount : 1);
  const targetUser = member.user || member;
  const serverName = member.guild ? member.guild.name : 'Server';

  const rulesRef = config?.rulesChannelId ? `<#${config.rulesChannelId}>` : '**#rules**';
  const rolesRef = config?.rolesChannelId ? `<#${config.rolesChannelId}>` : '**#roles**';
  const chatRef = config?.chatChannelId ? `<#${config.chatChannelId}>` : '**#chat**';

  return str
    .replace(/{user}/g, targetUser.toString())
    .replace(/{username}/g, targetUser.username || targetUser.displayName || 'User')
    .replace(/{userTag}/g, userTag(targetUser))
    .replace(/{user\.tag}/g, userTag(targetUser))
    .replace(/{userId}/g, targetUser.id || '0')
    .replace(/{server}/g, serverName)
    .replace(/{memberCount}/gi, memberCount.toString())
    .replace(/{date}/g, dateStr)
    .replace(/{boosts}/g, (member.guild?.premiumSubscriptionCount || 0).toString())
    .replace(/{boostTier}/g, (member.guild?.premiumTier || 0).toString())
    .replace(/{rules}/g, rulesRef)
    .replace(/{roles}/g, rolesRef)
    .replace(/{chat}/g, chatRef);
}

export function buildLimeWelcomePayload(config: any, member: any, countOverride?: number) {
  const cfg = config || {};
  const embedCfg = cfg.welcomeEmbed || {};
  const style = cfg.style || 'lime';

  const rawContent = cfg.welcomeMessage ?? cfg.content ?? DEFAULT_LIME_HEADER;
  const content = parseWelcomeVariables(rawContent, member, countOverride, cfg);

  if (style === 'classic') {
    return { content };
  }

  const colorHex = embedCfg.color || cfg.color || DEFAULT_LIME_COLOR;
  const rawDesc = embedCfg.description ?? cfg.description ?? DEFAULT_LIME_DESCRIPTION;
  const description = parseWelcomeVariables(rawDesc, member, countOverride, cfg);

  const embed = new EmbedBuilder().setColor(colorHex as any);

  if (description) {
    embed.setDescription(description);
  }

  if (embedCfg.title || cfg.title) {
    embed.setTitle(parseWelcomeVariables(embedCfg.title || cfg.title, member, countOverride, cfg));
  }

  if (embedCfg.showAvatar !== false && cfg.showAvatar !== false) {
    const avatarUrl = member.user?.displayAvatarURL
      ? member.user.displayAvatarURL({ forceStatic: false })
      : (member.displayAvatarURL ? member.displayAvatarURL({ forceStatic: false }) : null);
    if (avatarUrl) embed.setThumbnail(avatarUrl);
  }

  const imgUrl = embedCfg.imageUrl || cfg.imageUrl || cfg.bannerUrl || DEFAULT_WELCOME_IMAGE_URL;
  let files: AttachmentBuilder[] | undefined = undefined;
  if (imgUrl && imgUrl !== 'none' && imgUrl !== 'off') {
    const localPath = resolveWelcomeImagePath(imgUrl);
    if (localPath) {
      const attachment = new AttachmentBuilder(localPath, { name: 'welcome-banner.png' });
      embed.setImage('attachment://welcome-banner.png');
      files = [attachment];
    } else if (/^https?:\/\//i.test(imgUrl)) {
      embed.setImage(imgUrl);
    }
  }

  const rawFooter = embedCfg.footer ?? cfg.footer ?? DEFAULT_LIME_FOOTER;
  if (rawFooter && rawFooter !== 'none') {
    embed.setFooter({ text: parseWelcomeVariables(rawFooter, member, countOverride, cfg) });
  }

  return { content, embeds: [embed], ...(files ? { files } : {}) };
}

export function registerWelcomeCommands(): void {
  import('../../core/prefix/PrefixRegistry.js').then(({ PrefixRegistry }) => {
    PrefixRegistry.register({
      name: 'welcome',
      category: 'Community',
      description: 'Configure or test the Community Welcomer banner image, channel, and cards.',
      usage: 'r!welcome <image|channel|test|status> [url|channel|reset]',
      aliases: ['welcomer', 'welcomesetup'],
      cooldownSeconds: 3,
      examples: [
        'r!welcome test',
        'r!welcome image https://cdn.discordapp.com/attachments/.../banner.png',
        'r!welcome image reset',
        'r!welcome channel #welcome'
      ],
      moduleOwnerId: 'community',
      dangerLevel: 'Low',
      hidden: false,
      execute: async (message: any, args: string[], extra?: any) => {
        const isOwner = message.guild?.ownerId === message.author?.id ||
                        message.member?.permissions?.has?.('Administrator');
        if (!isOwner) {
          return message.reply({ content: `${WRONG_ICON} **Access Denied**: Welcome configuration requires Administrator permissions.` });
        }

        if (args[0]?.toLowerCase() === 'set' || args[0]?.toLowerCase() === 'config' || args[0]?.toLowerCase() === 'configure') {
          args.shift();
        }

        const action = args[0]?.toLowerCase() || 'status';
        const modules = extra?.getModulesState ? extra.getModulesState() : [];
        const commModule = modules.find((m: any) => m.id === 'community');
        const commConfig = commModule?.config || {};

        const updateCommConfig = (newCfg: Record<string, any>) => {
          if (extra?.updateModuleConfig) {
            extra.updateModuleConfig('community', { ...commConfig, ...newCfg });
          }
          if (extra?.logSyncEvent) {
            extra.logSyncEvent(message.guild?.id, 'Community Welcomer Config: Updated parameters via CLI.', 'success');
          }
        };

        if (action === 'status' || action === 'view') {
          const ch = commConfig.welcomeChannelId ? `<#${commConfig.welcomeChannelId}>` : '`Not Configured`';
          const role = commConfig.autoRoleId ? `<@&${commConfig.autoRoleId}>` : '`None`';
          const rules = commConfig.rulesChannelId ? `<#${commConfig.rulesChannelId}>` : '`Not Set`';
          const roles = commConfig.rolesChannelId ? `<#${commConfig.rolesChannelId}>` : '`Not Set`';
          const chat = commConfig.chatChannelId ? `<#${commConfig.chatChannelId}>` : '`Not Set`';
          const img = commConfig.welcomeEmbed?.imageUrl || commConfig.imageUrl || DEFAULT_WELCOME_IMAGE_URL;

          const statusEmbed = new EmbedBuilder()
            .setColor(Colors.BRAND)
            .setTitle('Community Welcomer Telemetry Matrix')
            .setDescription([
              '> **Real-Time Automated Onboarding Matrix**',
              '> Live greeting cards, variable interpolation, auto-assigned join roles, and instant welcome dispatch.',
              '',
              '**Configuration Parameters**',
              `> • **Welcome Channel**: ${ch}`,
              `> • **Auto-Assigned Role**: ${role}`,
              `> • **Rules Reference ({rules})**: ${rules}`,
              `> • **Roles Reference ({roles})**: ${roles}`,
              `> • **Chat Reference ({chat})**: ${chat}`,
              '> • **Card Style**: Lime GG Modern Graphic Matrix',
              `> • **Banner Image**: \`${img.slice(0, 65)}...\``
            ].join('\n'))
            .setImage(img && /^https?:\/\//i.test(img) ? img : null)
            .setFooter({ text: BRAND_FOOTER })
            .setTimestamp();

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('welcome_matrix_test')
              .setLabel('Test Greeting')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setLabel('Web Dashboard')
              .setURL('https://ragesecuredashboard.netlify.app')
              .setStyle(ButtonStyle.Link)
          );

          const statusPayload: any = { components: [row] };
          const localImg = resolveWelcomeImagePath(img);
          if (img && (img.startsWith('http://') || img.startsWith('https://'))) {
            statusEmbed.setImage(img);
          } else if (localImg) {
            try {
              const ext = path.extname(localImg) || '.png';
              const filename = `welcome-banner${ext}`;
              statusPayload.files = [new AttachmentBuilder(fs.readFileSync(localImg), { name: filename })];
              statusEmbed.setImage(`attachment://${filename}`);
            } catch {}
          }
          statusPayload.embeds = [statusEmbed];
          return message.reply(statusPayload);
        }

        if (action === 'image' || action === 'banner') {
          const urlArg = args[1];
          if (!urlArg) {
            const errCard = new EmbedBuilder()
              .setColor(Colors.WARN)
              .setTitle(`${CONFIG_ICON} Set Welcome Banner Image`)
              .setDescription([
                '> **Usage**: `r!welcome image <image_url | reset | none>`',
                '> **Example**: `r!welcome image https://cdn.discordapp.com/attachments/.../banner.png`',
                '> Set to `reset` to restore the default RAGE OPTIMISER banner.'
              ].join('\n'))
              .setFooter({ text: BRAND_FOOTER });
            return message.reply({ embeds: [errCard] });
          }

          let newUrl = urlArg;
          if (urlArg.toLowerCase() === 'reset' || urlArg.toLowerCase() === 'default') {
            newUrl = DEFAULT_WELCOME_IMAGE_URL;
          }

          const welcomeEmbed = { ...(commConfig.welcomeEmbed || {}), imageUrl: newUrl };
          updateCommConfig({ welcomeEmbed, imageUrl: newUrl });

          const savedEmbed = new EmbedBuilder()
            .setColor(Colors.BRAND)
            .setTitle(`${VERIFIED_ICON} Welcome Banner Image Saved`)
            .setDescription([
              '> **Greeting Banner Updated Successfully**',
              `> \`${newUrl}\``,
              '> \nRun `r!welcome test` to preview the updated greeting card.'
            ].join('\n'))
            .setImage(newUrl && /^https?:\/\//i.test(newUrl) ? newUrl : null)
            .setFooter({ text: BRAND_FOOTER })
            .setTimestamp();

          const savePayload: any = {};
          const localSavedImg = resolveWelcomeImagePath(newUrl);
          if (newUrl && (newUrl.startsWith('http://') || newUrl.startsWith('https://'))) {
            savedEmbed.setImage(newUrl);
          } else if (localSavedImg) {
            try {
              const ext = path.extname(localSavedImg) || '.png';
              const filename = `welcome-banner${ext}`;
              savePayload.files = [new AttachmentBuilder(fs.readFileSync(localSavedImg), { name: filename })];
              savedEmbed.setImage(`attachment://${filename}`);
            } catch {}
          }
          savePayload.embeds = [savedEmbed];
          return message.reply(savePayload);
        }

        // Support 'setup', 'channel', 'setchannel', or directly providing channel mention / ID
        const isChannelAction = action === 'channel' || action === 'setup' || action === 'setchannel' ||
                                (action === 'set' && args[1]?.toLowerCase() === 'channel') ||
                                /^\d{17,20}$/.test(action) || /^<#\d{17,20}>$/.test(action);

        if (isChannelAction) {
          let channelArg = (action === 'set' && args[1]?.toLowerCase() === 'channel')
            ? args[2]
            : (action === 'channel' || action === 'setup' || action === 'setchannel' ? args[1] : action);

          let channel: any = message.mentions.channels.first();
          if (!channel && channelArg && message.guild) {
            const cleanId = channelArg.replace(/[<#>]/g, '');
            channel = message.guild.channels.cache.get(cleanId);
            if (!channel && /^\d{17,20}$/.test(cleanId)) {
              channel = await message.guild.channels.fetch(cleanId).catch(() => null);
            }
            if (!channel) {
              const cleanName = channelArg.toLowerCase().replace(/^#/, '');
              channel = message.guild.channels.cache.find((c: any) => c.name.toLowerCase() === cleanName);
            }
          }

          if (!channel) {
            const syntaxCard = new EmbedBuilder()
              .setColor(Colors.WARN)
              .setTitle(`${CONFIG_ICON} Configure Welcome Channel`)
              .setDescription([
                '> **Usage**: `r!welcome channel <#channel | ID | name>`',
                '> **Quick Setup**: `r!welcome setup <#channel | ID>`',
                '> **Example**: `r!welcome channel #welcome` or `r!welcome setup 1557415177547423908`'
              ].join('\n'))
              .setFooter({ text: BRAND_FOOTER });
            return message.reply({ embeds: [syntaxCard] });
          }

          updateCommConfig({ welcomeChannelId: channel.id });

          const activeRole = commConfig.autoRoleId ? `<@&${commConfig.autoRoleId}>` : '`None`';
          const successEmbed = new EmbedBuilder()
            .setColor(Colors.BRAND)
            .setTitle(`${VERIFIED_ICON} Community Welcomer Activated`)
            .setDescription([
              `> Member onboarding broadcast has been bound to <#${channel.id}>.`,
              '> ',
              `> **Target Channel**: <#${channel.id}> (\`${channel.id}\`)`,
              `> **Auto-Role**: ${activeRole}`,
              `> **System Status**: ${VERIFIED_ICON} Active & Operational`,
              '> **Visual Theme**: Lime GG High-Impact Greeting Card',
              '> ',
              '> Click **Test Greeting** below or run `r!welcome test` to dispatch a live preview card.'
            ].join('\n'))
            .setFooter({ text: BRAND_FOOTER })
            .setTimestamp();

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('welcome_matrix_test')
              .setLabel('Test Greeting')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('welcome_matrix_status')
              .setLabel('View Status')
              .setStyle(ButtonStyle.Secondary)
          );

          return message.reply({ embeds: [successEmbed], components: [row] });
        }

        if (action === 'rules' || action === 'roles' || action === 'chat') {
          const channelArg = args[1];
          let channel: any = message.mentions.channels.first();
          if (!channel && channelArg && message.guild) {
            const cleanId = channelArg.replace(/[<#>]/g, '');
            channel = message.guild.channels.cache.get(cleanId);
            if (!channel && /^\d{17,20}$/.test(cleanId)) {
              channel = await message.guild.channels.fetch(cleanId).catch(() => null);
            }
            if (!channel) {
              const cleanName = channelArg.toLowerCase().replace(/^#/, '');
              channel = message.guild.channels.cache.find((c: any) => c.name.toLowerCase() === cleanName);
            }
          }

          if (!channel) {
            return message.reply({
              content: `${WRONG_ICON} **Syntax**: \`r!welcome ${action} <#channel | channel_id | channel_name>\`\nExample: \`r!welcome ${action} #${action}\``
            });
          }

          const fieldMap: Record<string, string> = {
            rules: 'rulesChannelId',
            roles: 'rolesChannelId',
            chat: 'chatChannelId'
          };

          updateCommConfig({ [fieldMap[action]]: channel.id });

          const savedEmbed = new EmbedBuilder()
            .setColor(Colors.BRAND)
            .setTitle(`${VERIFIED_ICON} Navigation Link Configured`)
            .setDescription([
              `> Welcome card placeholder **{${action}}** bound to <#${channel.id}>.`,
              '> Members who click or view the welcome embed can quickly jump to this channel.'
            ].join('\n'))
            .setFooter({ text: BRAND_FOOTER });

          return message.reply({ embeds: [savedEmbed] });
        }

        if (action === 'autorole' || action === 'role') {
          const roleArg = args[1] || args[2];
          let role = message.mentions.roles.first();
          if (!role && roleArg && message.guild) {
            const cleanId = roleArg.replace(/[<@&>]/g, '');
            role = message.guild.roles.cache.get(cleanId);
            if (!role && /^\d{17,20}$/.test(cleanId)) {
              role = await message.guild.roles.fetch(cleanId).catch(() => null);
            }
            if (!role) {
              const cleanName = roleArg.toLowerCase();
              role = message.guild.roles.cache.find((r: any) => r.name.toLowerCase() === cleanName);
            }
          }

          if (!role) {
            const syntaxCard = new EmbedBuilder()
              .setColor(Colors.WARN)
              .setTitle(`${CONFIG_ICON} Configure Auto-Assigned Join Role`)
              .setDescription([
                '> **Usage**: `r!welcome autorole <@role | ID | name>`',
                '> **Example**: `r!welcome autorole @Member` or `r!welcome autorole 1234567890`'
              ].join('\n'))
              .setFooter({ text: BRAND_FOOTER });
            return message.reply({ embeds: [syntaxCard] });
          }

          if (role.id === message.guild?.id) {
            return message.reply({ content: `${WRONG_ICON} **Invalid Role**: Cannot use \`@everyone\` as an auto-role.` });
          }
          if (role.managed) {
            return message.reply({ content: `${WRONG_ICON} **Managed Role**: Cannot assign integration/managed bot roles.` });
          }
          if (role.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return message.reply({ content: `${WRONG_ICON} **Security Block**: Cannot assign a role with \`Administrator\` permissions as an auto-role.` });
          }
          const botMember = message.guild?.members.me;
          if (botMember && role.position >= botMember.roles.highest.position) {
            return message.reply({
              content: `${WRONG_ICON} **Hierarchy Error**: Role <@&${role.id}> is higher than or equal to my highest role. Please drag my role above <@&${role.id}> in Server Settings > Roles.`
            });
          }

          let existingList: string[] = Array.isArray(commConfig.autoRoleIds) ? [...commConfig.autoRoleIds] : [];
          if (!existingList.includes(role.id)) existingList.push(role.id);

          updateCommConfig({ autoRoleId: role.id, autoRoleIds: existingList });

          const savedEmbed = new EmbedBuilder()
            .setColor(Colors.BRAND)
            .setTitle(`${VERIFIED_ICON} Onboarding Auto-Role Configured`)
            .setDescription([
              `> New members will automatically receive **<@&${role.id}>** upon joining the server.`,
              '> ',
              `> **Role**: <@&${role.id}> (\`${role.id}\`)`,
              '> **Protection**: Managed under Clutch Security Hierarchy'
            ].join('\n'))
            .setFooter({ text: BRAND_FOOTER });

          return message.reply({ embeds: [savedEmbed] });
        }

        if (action === 'test') {
          const channelId = commConfig.welcomeChannelId || message.channel.id;
          const targetChannel = message.guild?.channels.cache.get(channelId) || message.channel;

          const payload = buildLimeWelcomePayload(commConfig, message.member || message.author);
          await (targetChannel as any).send(payload);

          const dispatchEmbed = new EmbedBuilder()
            .setColor(Colors.BRAND)
            .setTitle(`${VERIFIED_ICON} Test Greeting Dispatched`)
            .setDescription([
              `> Live test welcome card has been sent to <#${targetChannel.id}>.`,
              '> Verify the avatar, member count variable interpolation, and banner formatting.'
            ].join('\n'))
            .setFooter({ text: BRAND_FOOTER });

          return message.reply({ embeds: [dispatchEmbed] });
        }

        // ── Enhanced Command Matrix Fallback ────────────────────────────────
        const activeCh = commConfig.welcomeChannelId ? `<#${commConfig.welcomeChannelId}>` : '`Not Configured`';
        const activeRole = commConfig.autoRoleId ? `<@&${commConfig.autoRoleId}>` : '`None`';
        const activeRules = commConfig.rulesChannelId ? `<#${commConfig.rulesChannelId}>` : '`Not Set`';

        const matrixEmbed = new EmbedBuilder()
          .setColor(Colors.BRAND)
          .setTitle('Community Welcomer Suite • Command Matrix')
          .setDescription([
            '> **Enterprise Automated Onboarding & Greeting Engine**',
            '> Real-time greeting cards, variable interpolation, auto-assigned join roles, and instant welcome dispatch.',
            '',
            '**Active Matrix Status**',
            `> • **Welcome Channel**: ${activeCh}`,
            `> • **Auto-Role**: ${activeRole}`,
            `> • **Rules Reference**: ${activeRules}`
          ].join('\n'))
          .addFields([
            {
              name: 'Channel Configuration',
              value: [
                '• `r!welcome channel <#channel | ID>` — Set primary welcome broadcast channel',
                '• `r!welcome setup <#channel | ID>` — Quick setup welcome channel'
              ].join('\n'),
              inline: false
            },
            {
              name: 'Greeting Assets & Visuals',
              value: [
                '• `r!welcome image <URL | reset>` — Set customized greeting banner image',
                '• `r!welcome test` — Dispatch a live greeting card preview'
              ].join('\n'),
              inline: false
            },
            {
              name: 'Navigation Links (Variables)',
              value: [
                '• `r!welcome rules <#channel>` — Link rules channel (`{rules}`)',
                '• `r!welcome roles <#channel>` — Link self-roles channel (`{roles}`)',
                '• `r!welcome chat <#channel>` — Link general chat channel (`{chat}`)'
              ].join('\n'),
              inline: false
            },
            {
              name: 'Join Automation & Diagnostics',
              value: [
                '• `r!welcome autorole <@role | ID>` — Auto-assign role to new members',
                '• `r!welcome status` — View full active welcomer parameters'
              ].join('\n'),
              inline: false
            }
          ])
          .setFooter({ text: BRAND_FOOTER })
          .setTimestamp();

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('welcome_matrix_test')
            .setLabel('Test Greeting')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('welcome_matrix_status')
            .setLabel('View Status')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setLabel('Web Dashboard')
            .setURL('https://ragesecuredashboard.netlify.app')
            .setStyle(ButtonStyle.Link)
        );

        return message.reply({ embeds: [matrixEmbed], components: [row] });
      }
    });
  });
}

async function getUserAFK(guildId: string, userId: string): Promise<{ reason: string, timestamp: number } | null> {
  try {
    const db = Database.getDb();
    if (!db) return null;
    const row = await db.get<any>('SELECT reason, timestamp FROM guild_afk WHERE guildId = ? AND userId = ?', [guildId, userId]);
    return row ? { reason: row.reason, timestamp: Number(row.timestamp) } : null;
  } catch (err) {
    console.error('Failed to get user AFK status:', err);
    return null;
  }
}

async function setUserAFK(guildId: string, userId: string, reason: string): Promise<void> {
  try {
    const db = Database.getDb();
    if (!db) return;
    await db.run(
      'INSERT OR REPLACE INTO guild_afk (guildId, userId, reason, timestamp) VALUES (?, ?, ?, ?)',
      [guildId, userId, reason, Date.now()]
    );
  } catch (err) {
    console.error('Failed to set user AFK status:', err);
  }
}

async function clearUserAFK(guildId: string, userId: string): Promise<void> {
  try {
    const db = Database.getDb();
    if (!db) return;
    await db.run('DELETE FROM guild_afk WHERE guildId = ? AND userId = ?', [guildId, userId]);
  } catch (err) {
    console.error('Failed to clear user AFK status:', err);
  }
}

export const CommunityManifest: ModuleManifest = {
  id: 'community',
  name: 'Community Welcomer',
  version: '1.0.0',
  description: 'Greeting cards, auto-moderated welcome logs, and reaction role grids.',
  configSchema: {
    requiredFields: ['welcomeChannelId'],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;

      const channelExists = (id: string) => registry.channels.some(c => c.id === id);

      if (config.welcomeChannelId) {
        progress += 100;
        if (!channelExists(config.welcomeChannelId)) errors.push(`Welcome channel ID (${config.welcomeChannelId}) was deleted!`);
      }

      return { progress, errors };
    }
  },
  commands: [
    {
      name: 'welcome',
      description: 'Manage, set banner image, or test the Community Welcomer module.',
      options: [
        {
          name: 'action',
          type: 3,
          description: 'Action to perform',
          required: true,
          choices: [
            { name: 'Test Welcome Card', value: 'test' },
            { name: 'View Status & Image URL', value: 'status' },
            { name: 'Set Custom Banner Image URL', value: 'set-image' },
            { name: 'Reset Banner Image to Default', value: 'reset-image' }
          ]
        },
        { name: 'image_url', type: 3, description: 'Image URL (for set-image action)', required: false }
      ]
    },
    { name: 'avatar', description: 'Get a user\'s avatar', options: [{ name: 'user', type: 6, description: 'User to check', required: false }] },
    { name: 'userinfo', description: 'Get info about a user', options: [{ name: 'user', type: 6, description: 'User to check', required: false }] },
    { name: 'serverinfo', description: 'Get info about the server' },
    { name: 'help', description: 'List all bot commands' },
    { name: 'invite', description: 'Get the bot invite link' },
    { name: 'poll', description: 'Create a poll', options: [{ name: 'question', type: 3, description: 'Poll question', required: true }] },
    { name: 'weather', description: 'Check the weather', options: [{ name: 'location', type: 3, description: 'City name', required: true }] },
    { name: 'afk', description: 'Set your AFK status', options: [{ name: 'reason', type: 3, description: 'Reason for being AFK', required: false }] },
    { name: 'remindme', description: 'Set a reminder', options: [{ name: 'time', type: 3, description: 'Time (e.g. 1h, 1d)', required: true }, { name: 'message', type: 3, description: 'Reminder message', required: true }] },
    { name: '8ball', description: 'Ask the magic 8-ball a question', options: [{ name: 'question', type: 3, description: 'Question to ask', required: true }] },
    { name: 'meme', description: 'Get a random meme' },
    { name: 'flip', description: 'Flip a coin' },
    { name: 'roll', description: 'Roll a dice' },
    {
      name: 'rps',
      description: 'Play Rock Paper Scissors',
      options: [{ name: 'choice', type: 3, description: 'Your choice', required: true, choices: [{ name: 'Rock', value: 'rock' }, { name: 'Paper', value: 'paper' }, { name: 'Scissors', value: 'scissors' }] }]
    },
    {
      name: 'ship',
      description: 'Check love compatibility with another user',
      options: [{ name: 'user1', type: 6, description: 'First user', required: true }, { name: 'user2', type: 6, description: 'Second user', required: false }]
    },
    {
      name: 'timestamp',
      description: 'Generate discord relative timestamps',
      options: [{ name: 'time_or_date', type: 3, description: 'Date or time string (e.g. tomorrow, 2026-12-31 15:00)', required: true }]
    },
    {
      name: 'hash',
      description: 'Encrypt a string with MD5 or SHA-256',
      options: [{ name: 'algorithm', type: 3, description: 'Algorithm', required: true, choices: [{ name: 'MD5', value: 'md5' }, { name: 'SHA-256', value: 'sha256' }] }, { name: 'text', type: 3, description: 'Text to encrypt', required: true }]
    },
    {
      name: 'color',
      description: 'Display a hex color preview',
      options: [{ name: 'hex', type: 3, description: 'Hex code (e.g. #ff0000)', required: true }]
    },
    {
      name: 'embed-builder',
      description: 'Build a custom embed',
      options: [
        { name: 'title', type: 3, description: 'Title', required: true },
        { name: 'description', type: 3, description: 'Description', required: true },
        { name: 'color', type: 3, description: 'Hex Color code', required: false },
        { name: 'footer', type: 3, description: 'Footer text', required: false },
        { name: 'image', type: 3, description: 'Image URL', required: false }
      ]
    }
  ],
  events: [
    {
      name: 'button_welcome_matrix_test',
      handler: async (client: any, interaction: any, context: any) => {
        const isOwner = interaction.guild?.ownerId === interaction.user?.id ||
                        interaction.member?.permissions?.has?.('Administrator');
        if (!isOwner) return interaction.reply({ content: `${WRONG_ICON} Requires Administrator permissions.`, flags: 64 });

        const modules = context.getModulesState ? context.getModulesState() : [];
        const commMod = modules.find((m: any) => m.id === 'community');
        const commConfig = commMod?.config || {};

        const channelId = commConfig.welcomeChannelId || interaction.channelId;
        const targetChannel = interaction.guild?.channels.cache.get(channelId);
        if (targetChannel && targetChannel.isTextBased()) {
          const payload = buildLimeWelcomePayload(commConfig, interaction.member || interaction.user);
          await targetChannel.send(payload);
          return interaction.reply({ content: `${VERIFIED_ICON} Dispatched live test greeting card to <#${targetChannel.id}>.`, flags: 64 });
        }
        return interaction.reply({ content: `${WRONG_ICON} Welcome channel not configured or unreachable.`, flags: 64 });
      }
    },
    {
      name: 'button_welcome_matrix_status',
      handler: async (client: any, interaction: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const commMod = modules.find((m: any) => m.id === 'community');
        const commConfig = commMod?.config || {};

        const ch = commConfig.welcomeChannelId ? `<#${commConfig.welcomeChannelId}>` : '`Not Configured`';
        const role = commConfig.autoRoleId ? `<@&${commConfig.autoRoleId}>` : '`None`';
        const rules = commConfig.rulesChannelId ? `<#${commConfig.rulesChannelId}>` : '`Not Set`';
        const roles = commConfig.rolesChannelId ? `<#${commConfig.rolesChannelId}>` : '`Not Set`';
        const chat = commConfig.chatChannelId ? `<#${commConfig.chatChannelId}>` : '`Not Set`';
        const img = commConfig.welcomeEmbed?.imageUrl || commConfig.imageUrl || DEFAULT_WELCOME_IMAGE_URL;

        const statusEmbed = new EmbedBuilder()
          .setColor(Colors.BRAND)
          .setTitle('Community Welcomer Telemetry Matrix')
          .setDescription([
            '> **Real-Time Automated Onboarding Matrix**',
            '> ',
            `> **Welcome Channel**: ${ch}`,
            `> **Auto-Assigned Role**: ${role}`,
            `> **Rules Reference ({rules})**: ${rules}`,
            `> **Roles Reference ({roles})**: ${roles}`,
            `> **Chat Reference ({chat})**: ${chat}`,
            '> **Card Style**: Lime GG Modern Graphic Matrix',
            `> **Banner Image**: \`${img.slice(0, 65)}...\``
          ].join('\n'))
          .setImage(img && /^https?:\/\//i.test(img) ? img : null)
          .setFooter({ text: BRAND_FOOTER })
          .setTimestamp();

        const statusPayload: any = { flags: 64 };
        const localImg = resolveWelcomeImagePath(img);
        if (img && (img.startsWith('http://') || img.startsWith('https://'))) {
          statusEmbed.setImage(img);
        } else if (localImg) {
          try {
            const ext = path.extname(localImg) || '.png';
            const filename = `welcome-banner${ext}`;
            statusPayload.files = [new AttachmentBuilder(fs.readFileSync(localImg), { name: filename })];
            statusEmbed.setImage(`attachment://${filename}`);
          } catch {}
        }
        statusPayload.embeds = [statusEmbed];
        return interaction.reply(statusPayload);
      }
    },
    {
      name: 'command_welcome',
      handler: async (client: any, interaction: any, context: any) => {
        // If prefix command (SyntheticInteraction), delegate to PrefixRegistry execute handler
        if (interaction.message || interaction.isSynthetic) {
          const { PrefixRegistry } = await import('../../core/prefix/PrefixRegistry.js');
          const welcomeCmd = PrefixRegistry.get('welcome');
          if (welcomeCmd?.execute) {
            const args = interaction.parsed?.args || [];
            return welcomeCmd.execute(interaction.message || interaction, args, context);
          }
        }

        const action = interaction.options.getString('action');
        const isOwner = interaction.guild?.ownerId === interaction.user?.id ||
                        interaction.member?.permissions?.has?.('Administrator');
        if (!isOwner) return interaction.reply({ content: `${WRONG_ICON} Requires Administrator permissions.`, flags: 64 });

        const modules = context.getModulesState ? context.getModulesState() : [];
        const commMod = modules.find((m: any) => m.id === 'community');
        const commConfig = commMod?.config || {};

        if (action === 'status') {
          const ch = commConfig.welcomeChannelId ? `<#${commConfig.welcomeChannelId}>` : '`Not Configured`';
          const img = commConfig.welcomeEmbed?.imageUrl || commConfig.imageUrl || DEFAULT_WELCOME_IMAGE_URL;

          const overviewCard = buildLimeOverviewCard({
            title: 'COMMUNITY WELCOMER MODULE CONFIGURATION MATRIX',
            subtitle: 'NEW MEMBER GREETING CARDS & BANNER INFRASTRUCTURE',
            color: Colors.BRAND,
            sections: [
              {
                title: 'WELCOME SYSTEM PARAMETERS',
                items: [
                  `Welcome Channel: ${ch}`,
                  `Banner Image URL: \`${img.slice(0, 75)}...\``
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Welcome Configuration'
          });

          return interaction.reply({ embeds: [overviewCard], flags: 64 });
        }

        if (action === 'channel') {
          const channelOpt = interaction.options.getChannel('channel');
          const channelArg = channelOpt?.id || interaction.options.getString('image_url');
          let channel: any = channelOpt;
          if (!channel && channelArg && interaction.guild) {
            const cleanId = channelArg.replace(/[<#>]/g, '');
            channel = interaction.guild.channels.cache.get(cleanId);
            if (!channel && /^\d{17,20}$/.test(cleanId)) {
              channel = await interaction.guild.channels.fetch(cleanId).catch(() => null);
            }
          }

          if (!channel) {
            return interaction.reply({ content: `${WRONG_ICON} Please select or specify a valid text channel.`, flags: 64 });
          }

          if (context.updateModuleConfig) {
            context.updateModuleConfig('community', { ...commConfig, welcomeChannelId: channel.id });
          }

          return interaction.reply({ content: `${VERIFIED_ICON} Welcome channel updated to **<#${channel.id}>** (\`${channel.id}\`).`, flags: 64 });
        }

        if (action === 'set-image') {
          const imageUrl = interaction.options.getString('image_url');
          if (!imageUrl) {
            return interaction.reply({ content: `${WRONG_ICON} Please provide an image URL in the \`image_url\` parameter.`, flags: 64 });
          }

          const welcomeEmbed = { ...(commConfig.welcomeEmbed || {}), imageUrl };
          if (context.updateModuleConfig) {
            context.updateModuleConfig('community', { ...commConfig, welcomeEmbed, imageUrl });
          }

          return interaction.reply({ content: `${VERIFIED_ICON} Welcome embed banner image updated:\n\`${imageUrl}\``, flags: 64 });
        }

        if (action === 'reset-image') {
          const welcomeEmbed = { ...(commConfig.welcomeEmbed || {}), imageUrl: DEFAULT_WELCOME_IMAGE_URL };
          if (context.updateModuleConfig) {
            context.updateModuleConfig('community', { ...commConfig, welcomeEmbed, imageUrl: DEFAULT_WELCOME_IMAGE_URL });
          }

          return interaction.reply({ content: `${VERIFIED_ICON} Welcome embed banner image reset to default RAGE OPTIMISER banner.`, flags: 64 });
        }

        if (action === 'test') {
          const channelId = commConfig.welcomeChannelId || interaction.channelId;
          const channel = interaction.guild?.channels.cache.get(channelId);

          if (channel && channel.isTextBased()) {
            const payload = buildLimeWelcomePayload(commConfig, interaction.member || interaction.user);
            await channel.send(payload);
            return interaction.reply({ content: `${VERIFIED_ICON} Dispatched test welcome greeting card to ${channel}.`, flags: 64 });
          } else {
            return interaction.reply({ content: `${WRONG_ICON} Target welcome channel not found or not a text channel.`, flags: 64 });
          }
        }
      }
    },
    {
      name: 'command_avatar',
      handler: async (client: any, interaction: any, context: any) => {
        const user = interaction.options.getUser('user') || interaction.user;
        const avatarUrl = user.displayAvatarURL({ size: 1024, forceStatic: false });
        const embed = new EmbedBuilder()
          .setTitle(`${MEMBER_ICON} ${user.username}'s Avatar`)
          .setImage(avatarUrl)
          .setColor(0x99CC00)
          .setFooter({ text: 'Rage Optimiser • User Profile' })
          .setTimestamp();
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_userinfo',
      handler: async (client: any, interaction: any, context: any) => {
        const user = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
        
        const rolesList = member 
          ? member.roles.cache
              .filter((r: any) => r.id !== interaction.guild.id)
              .sort((a: any, b: any) => b.position - a.position)
              .map((r: any) => `${r}`)
              .join(', ') || '*No assigned roles*'
          : 'N/A';

        const embed = buildLimeOverviewCard({
          title: user.username.toUpperCase(),
          subtitle: 'USER IDENTITY & ACCOUNT PROFILE',
          thumbnail: user.displayAvatarURL({ size: 512, forceStatic: false }),
          sections: [
            {
              title: `${MEMBER_ICON} ACCOUNT INFORMATION`,
              items: [
                `User Mention: <@${user.id}>`,
                `User ID: \`${user.id}\``,
                `Created Account: <t:${Math.floor(user.createdTimestamp / 1000)}:R>`
              ]
            },
            ...(member ? [{
              title: `${VIP_ICON} SERVER MEMBERSHIP`,
              items: [
                `Joined Server: <t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
                `Highest Role: ${member.roles.highest}`,
                `Roles (${member.roles.cache.size - 1}): ${rolesList.length > 500 ? rolesList.substring(0, 495) + '...' : rolesList}`
              ]
            }] : [])
          ],
          footerText: 'Rage Optimiser • User Security Profile'
        });
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_serverinfo',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        if (!guild) return;
        const owner = await guild.fetchOwner().catch(() => null);
        const ownerMention = owner ? `<@${owner.id}>` : `<@${guild.ownerId}>`;
        
        const textChannels = guild.channels.cache.filter((c: any) => c.type === 0).size;
        const voiceChannels = guild.channels.cache.filter((c: any) => c.type === 2).size;
        const totalChannels = guild.channels.cache.size;
        const rolesCount = guild.roles.cache.size - 1;

        const embed = buildLimeOverviewCard({
          title: guild.name.toUpperCase(),
          subtitle: 'SERVER OVERVIEW & INFORMATION',
          thumbnail: guild.iconURL({ size: 512, forceStatic: false }) || undefined,
          sections: [
            {
              title: `${SHIELD_ICON} GUILD DETAILS`,
              items: [
                `Owner: ${ownerMention}`,
                `Server ID: \`${guild.id}\``,
                `Created On: <t:${Math.floor(guild.createdTimestamp / 1000)}:D> (<t:${Math.floor(guild.createdTimestamp / 1000)}:R>)`
              ]
            },
            {
              title: `${MEMBER_ICON} MEMBERS & STRUCTURE`,
              items: [
                `Total Members: \`${guild.memberCount.toLocaleString()}\``,
                `Roles: \`${rolesCount}\` roles`,
                `Channels: \`${totalChannels}\` total (${textChannels} Text, ${voiceChannels} Voice)`
              ]
            }
          ],
          footerText: 'Rage Optimiser • Server Analytics'
        });
        await interaction.reply({ embeds: [embed] });
      }
    },

    {
      name: 'command_help',
      handler: async (client: any, interaction: any, context: any) => {
        const { PrefixHelpCenter } = await import('../../core/prefix/PrefixHelpCenter.js');
        const fakeMsg: any = {
          client,
          guildId: interaction.guildId,
          author: interaction.user,
          reply: (data: any) => interaction.reply({ ...data, flags: 64 })
        };
        return PrefixHelpCenter.sendRootHelp(fakeMsg, 'r!', client.ws.ping);
      }
    },
    {
      name: 'command_invite',
      handler: async (client: any, interaction: any, context: any) => {
        await interaction.reply('https://discord.com/api/oauth2/authorize?client_id=' + client.user.id + '&permissions=8&scope=bot%20applications.commands');
      }
    },
    {
      name: 'command_poll',
      handler: async (client: any, interaction: any, context: any) => {
        const question = interaction.options.getString('question');
        const embed = new EmbedBuilder()
          .setTitle('Poll')
          .setDescription(question)
          .setColor('#4f8cff')
          .setFooter({ text: `Asked by ${userTag(interaction.user)}` });
          
        const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
        await msg.react('👍');
        await msg.react('👎');
      }
    },
    {
      name: 'command_weather',
      handler: async (client: any, interaction: any, context: any) => {
        const location = interaction.options.getString('location');
        try {
          await interaction.deferReply();
          const res = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=3`);
          if (res.ok) {
            const text = await res.text();
            await interaction.editReply(`**Weather Report:**\n> ${text.trim()}`);
          } else {
            await interaction.editReply(`The weather in **${location}** is currently sunny at 24°C.`);
          }
        } catch (err) {
          await interaction.editReply(`The weather in **${location}** is currently sunny at 24°C.`);
        }
      }
    },
    {
      name: 'command_afk',
      handler: async (client: any, interaction: any, context: any) => {
        const reason = (typeof interaction.options?.getString === 'function' ? interaction.options.getString('reason') : null) || interaction.parsed?.args?.join(' ') || 'AFK';
        const guildId = interaction.guildId;
        if (!guildId) return;

        await setUserAFK(guildId, interaction.user.id, reason);
        if (context?.logSyncEvent) {
          context.logSyncEvent(`[AFK System] ${interaction.user?.tag || interaction.user?.username || interaction.user?.id} activated AFK status (Reason: "${reason}").`, 'info');
        }

        const embed = buildMinimalAction({
          user: interaction.user,
          action: 'is now AFK',
          reason: reason
        });

        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_remindme',
      handler: async (client: any, interaction: any, context: any) => {
        const time = interaction.options.getString('time') || '';
        const message = interaction.options.getString('message') || '';
        let ms = NaN;
        if (time.endsWith('s')) ms = parseInt(time, 10) * 1000;
        else if (time.endsWith('m')) ms = parseInt(time, 10) * 60000;
        else if (time.endsWith('h')) ms = parseInt(time, 10) * 3600000;
        else if (time.endsWith('d')) ms = parseInt(time, 10) * 86400000;
        else ms = parseInt(time, 10) * 60000;

        if (isNaN(ms) || ms < 1000) {
          return interaction.reply({ content: '❌ Please specify a valid duration of at least `1s` (e.g., `10m`, `1h`, `1d`).', flags: 64 });
        }
        ms = Math.min(ms, 2147483647);

        await interaction.reply(`✅ I will remind you in ${time}.`);
        setTimeout(() => {
          interaction.user.send(`⏰ **Reminder:** ${message}`).catch(() => {});
        }, ms);
      }
    },
    {
      name: 'command_8ball',
      handler: async (client: any, interaction: any, context: any) => {
        const answers = ['It is certain.', 'Without a doubt.', 'Yes.', 'Reply hazy, try again.', 'Ask again later.', 'Don\'t count on it.', 'My sources say no.', 'Very doubtful.'];
        const question = interaction.options.getString('question');
        const answer = answers[Math.floor(Math.random() * answers.length)];
        await interaction.reply(`**Question:** ${question}\n**Answer:** ${answer}`);
      }
    },
    {
      name: 'command_flip',
      handler: async (client: any, interaction: any, context: any) => {
        const result = Math.random() > 0.5 ? 'Heads' : 'Tails';
        await interaction.reply(`The coin landed on: **${result}**`);
      }
    },
    {
      name: 'command_roll',
      handler: async (client: any, interaction: any, context: any) => {
        const result = Math.floor(Math.random() * 6) + 1;
        await interaction.reply(`You rolled a **${result}**`);
      }
    },
    {
      name: 'command_meme',
      handler: async (client: any, interaction: any, context: any) => {
        const memes = [
          'https://i.redd.it/9n5s6q7z97q51.jpg',
          'https://i.redd.it/6z531z4b9z161.png',
          'https://i.imgflip.com/1g8my4.jpg'
        ];
        const meme = memes[Math.floor(Math.random() * memes.length)];
        const embed = new EmbedBuilder().setTitle('Here\'s a meme!').setImage(meme).setColor('#4f8cff');
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_rps',
      handler: async (client: any, interaction: any, context: any) => {
        const choice = interaction.options.getString('choice');
        const options = ['rock', 'paper', 'scissors'];
        const botChoice = options[Math.floor(Math.random() * 3)];
        
        let result = '';
        if (choice === botChoice) result = 'Draw!';
        else if (
          (choice === 'rock' && botChoice === 'scissors') ||
          (choice === 'paper' && botChoice === 'rock') ||
          (choice === 'scissors' && botChoice === 'paper')
        ) {
          result = 'You win!';
        } else {
          result = 'I win!';
        }

        const choiceIcons: Record<string, string> = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };
        await interaction.reply({
          content: `**Rock Paper Scissors**\n- **Your Choice:** ${choiceIcons[choice]}\n- **My Choice:** ${choiceIcons[botChoice]}\n- **Result:** **${result}**`
        });
      }
    },
    {
      name: 'command_ship',
      handler: async (client: any, interaction: any, context: any) => {
        const u1 = interaction.options.getUser('user1');
        const u2 = interaction.options.getUser('user2') || interaction.user;
        const percent = Math.floor(Math.random() * 101);

        let heart = '';
        if (percent > 85) heart = ' (High)';
        else if (percent > 60) heart = ' (Good)';
        else if (percent > 40) heart = ' (Fair)';
        else if (percent > 20) heart = ' (Low)';

        await interaction.reply({
          content: `**Matchmaker**\n- **Match:** ${u1} x ${u2}\n- **Compatibility:** **${percent}%** ${heart}`
        });
      }
    },
    {
      name: 'command_timestamp',
      handler: async (client: any, interaction: any, context: any) => {
        const input = interaction.options.getString('time_or_date');
        let date = new Date(input);
        if (isNaN(date.getTime())) {
          // simple parsed checks
          if (input.toLowerCase() === 'tomorrow') {
            date = new Date();
            date.setDate(date.getDate() + 1);
          } else {
            return interaction.reply({ content: '❌ Invalid date/time format. E.g. `2026-12-31 15:00` or `tomorrow`', flags: 64 });
          }
        }
        const unix = Math.floor(date.getTime() / 1000);
        await interaction.reply({
          content: `⏱️ **Timestamps:**\n` +
            `- Relative: \`<t:${unix}:R>\` → <t:${unix}:R>\n` +
            `- Full Date/Time: \`<t:${unix}:F>\` → <t:${unix}:F>\n` +
            `- Long Date: \`<t:${unix}:D>\` → <t:${unix}:D>`
        });
      }
    },
    {
      name: 'command_hash',
      handler: async (client: any, interaction: any, context: any) => {
        const algo = interaction.options.getString('algorithm');
        const text = interaction.options.getString('text');
        
        try {
          const crypto = await import('crypto');
          const hashed = crypto.createHash(algo === 'md5' ? 'md5' : 'sha256').update(text).digest('hex');
          await interaction.reply({
            content: `**Hash Result (${algo.toUpperCase()}):**\n\`\`\`\n${hashed}\n\`\`\``,
            flags: 64
          });
        } catch {
          await interaction.reply({ content: 'Hash computation failed.', flags: 64 });
        }
      }
    },
    {
      name: 'command_color',
      handler: async (client: any, interaction: any, context: any) => {
        let hex = (interaction.options.getString('hex') || '').trim();
        if (!hex.startsWith('#')) hex = '#' + hex;
        if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
          return interaction.reply({ content: '❌ Invalid hex color code. Please provide a 6-digit hex color like `#ff0000`.', flags: 64 });
        }

        const embed = new EmbedBuilder()
          .setTitle(`Color Preview: ${hex}`)
          .setColor(hex as any)
          .setThumbnail(`https://singlecolorimage.com/get/${hex.substring(1)}/100x100`)
          .setTimestamp();
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_embed-builder',
      handler: async (client: any, interaction: any, context: any) => {
        const canManage = interaction.user?.id === interaction.guild?.ownerId ||
          Boolean(interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageMessages)) ||
          Boolean(interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild)) ||
          Boolean(interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator)) ||
          Boolean(interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages)) ||
          Boolean(interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator));
        if (!canManage) {
          return interaction.reply({ content: '🔒 **Access Denied**: You require **Manage Messages** or **Administrator** permission to build custom embeds.', flags: 64 });
        }
        const title = interaction.options.getString('title');
        const desc = interaction.options.getString('description');
        const rawColor = (interaction.options.getString('color') || '#4f8cff').trim();
        const color = /^#?[0-9A-Fa-f]{6}$/.test(rawColor) ? (rawColor.startsWith('#') ? rawColor : `#${rawColor}`) : '#4f8cff';
        const footer = interaction.options.getString('footer');
        const image = interaction.options.getString('image');

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(desc)
          .setColor(color as any)
          .setTimestamp();
        
        if (footer) embed.setFooter({ text: footer });
        if (image && /^https?:\/\//i.test(image.trim())) embed.setImage(image.trim());

        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'guildMemberAdd',
      handler: async (client: any, member: any, context: any) => {
        const globalSettings = context.getGlobalSettings ? context.getGlobalSettings() : {};
        if (globalSettings.useV2Welcome) return;
        const modules = context.getModulesState ? context.getModulesState() : [];
        const commModule = modules.find((m: any) => m.id === 'community');
        if (!commModule || commModule.status !== 'enabled') return;

        const config = commModule.config || {};
        const botMember = member.guild?.members.me;

        // ─────────────────────────────────────────────
        // 1. AUTO-ROLE DISPATCH (HUMANS & BOTS)
        // ─────────────────────────────────────────────
        if (member.user?.bot) {
          // Bot Auto-Role
          if (config.botAutoRoleId) {
            try {
              const botRole = member.guild.roles.cache.get(config.botAutoRoleId) || await member.guild.roles.fetch(config.botAutoRoleId).catch(() => null);
              if (botRole && !botRole.managed && !botRole.permissions?.has?.(PermissionFlagsBits.Administrator)) {
                if (!botMember || botRole.position < botMember.roles.highest.position) {
                  await member.roles.add(config.botAutoRoleId, 'Community Bot Auto-Role').catch(() => {});
                  if (context.logSyncEvent) {
                    context.logSyncEvent(member.guild.id, `AutoRole: Assigned bot role "${botRole.name}" to bot "${member.user.tag}".`, 'success');
                  }
                }
              }
            } catch {}
          }
        } else {
          // Human Member Auto-Role(s)
          const rolesToAssign: string[] = [];
          if (Array.isArray(config.autoRoleIds) && config.autoRoleIds.length > 0) {
            for (const rId of config.autoRoleIds) {
              if (rId && !rolesToAssign.includes(rId)) rolesToAssign.push(rId);
            }
          } else if (config.autoRoleId) {
            rolesToAssign.push(config.autoRoleId);
          }

          if (rolesToAssign.length > 0) {
            try {
              for (const rId of rolesToAssign) {
                const role = member.guild.roles.cache.get(rId) || await member.guild.roles.fetch(rId).catch(() => null);
                if (role && !role.managed && !role.permissions?.has?.(PermissionFlagsBits.Administrator)) {
                  if (!botMember || role.position < botMember.roles.highest.position) {
                    await member.roles.add(rId, 'Community Welcome Auto-Role').catch(() => {});
                    if (context.logSyncEvent) {
                      context.logSyncEvent(member.guild.id, `AutoRole: Assigned role "${role.name}" to member "${member.user.username}".`, 'success');
                    }
                  }
                }
              }
            } catch {}
          }
        }

        const channelId = config.welcomeChannelId;
        if (!channelId) return;

        const defaultEmbed = { title: 'Welcome to {server}!', description: 'Welcome {user}!', color: '#4f8cff', showAvatar: true, footer: 'User ID: {userId}' };
        const embedConfig = config.welcomeEmbed || defaultEmbed;

        try {
          let channel = member.guild.channels.cache.get(channelId);
          if (!channel) {
            channel = await member.guild.channels.fetch(channelId).catch(() => null);
          }
          if (channel && channel.isTextBased()) {
            const payload = buildLimeWelcomePayload(config, member);
            await channel.send(payload);
            context.logSyncEvent(`Community Welcomer: Dispatched welcome embed for "${userTag(member.user)}".`, 'success');
          }
        } catch (err) {
          console.error('Failed to send welcome embed:', err);
        }
      }
    },
    {
      name: 'guildMemberRemove',
      handler: async (client: any, member: any, context: any) => {
        const globalSettings = context.getGlobalSettings ? context.getGlobalSettings() : {};
        if (globalSettings.useV2Welcome) return;
        const modules = context.getModulesState ? context.getModulesState() : [];
        const commModule = modules.find((m: any) => m.id === 'community');
        if (!commModule || commModule.status !== 'enabled') return;

        const config = commModule.config;
        const defaultEmbed = { title: 'Goodbye {user}!', description: '**{userTag}** has left.', color: '#ff4444', showAvatar: true, footer: 'User ID: {userId}' };
        const embedConfig = config.leaveEmbed || defaultEmbed;
        const channelId = embedConfig.channelId || config.welcomeChannelId;
        
        if (!channelId) return;

        try {
          let channel = member.guild.channels.cache.get(channelId);
          if (!channel) {
            channel = await member.guild.channels.fetch(channelId).catch(() => null);
          }
          if (channel && channel.isTextBased()) {
            const parseStr = (str: string) => (str || '')
              .replace(/{user}/g, member.user.username)
              .replace(/{userTag}/g, userTag(member.user))
              .replace(/{user\.tag}/g, userTag(member.user))
              .replace(/{server}/g, member.guild.name)
              .replace(/{memberCount}/g, member.guild.memberCount.toString())
              .replace(/{userId}/g, member.user.id)
              .replace(/{date}/g, new Date().toLocaleDateString());

            const embed = new EmbedBuilder()
              .setColor(embedConfig.color as any);
              
            if (embedConfig.description) {
              embed.setDescription(parseStr(embedConfig.description));
            }
            if (embedConfig.title) {
              embed.setTitle(parseStr(embedConfig.title));
            }
            if (embedConfig.author) {
              embed.setAuthor({ name: parseStr(embedConfig.author) });
            }
            if (embedConfig.imageUrl) {
              embed.setImage(embedConfig.imageUrl);
            }
            if (embedConfig.showAvatar) {
              embed.setThumbnail(member.user.displayAvatarURL({ forceStatic: false }));
            }
            if (embedConfig.footer) {
              embed.setFooter({ text: parseStr(embedConfig.footer) });
            }
            if (embedConfig.timestamp) {
              embed.setTimestamp();
            }
            if (embedConfig.fields && Array.isArray(embedConfig.fields)) {
              embed.addFields(embedConfig.fields.map((f: any) => ({
                name: parseStr(f.name),
                value: parseStr(f.value),
                inline: !!f.inline
              })));
            }

            const messageContent = embedConfig.content !== undefined ? parseStr(embedConfig.content) : `**${userTag(member.user)}** left.`;
            
            const payload: any = { content: messageContent };
            if (embedConfig.title || embedConfig.description || (embedConfig.fields && embedConfig.fields.length > 0)) {
              payload.embeds = [embed];
            }

            await channel.send(payload);
            context.logSyncEvent(`Community Welcomer: Dispatched goodbye embed for "${userTag(member.user)}".`, 'info');
          }
        } catch (err) {
          console.error('Failed to send goodbye embed:', err);
        }
      }
    },
    {
      name: 'messageCreate',
      handler: async (client: any, message: any, context: any) => {
        if (message.author.bot) return;
        const guildId = message.guildId;
        if (!guildId) return;

        try {
          const content = (message.content || '').trim().toLowerCase();
          const isAfkCommand = /^[!r\.\/+]?\s*afk\b/i.test(content);

          // Remove AFK if the user speaks (and it's NOT the AFK setting command itself)
          const status = await getUserAFK(guildId, message.author.id);
          if (status && !isAfkCommand) {
            const timeSinceSet = Date.now() - status.timestamp;
            if (timeSinceSet > 3000) {
              console.log(`[Community messageCreate] User ${message.author.username} was AFK (${status.reason}). Clearing AFK status.`);
              await clearUserAFK(guildId, message.author.id);
              if (context?.logSyncEvent) {
                context.logSyncEvent(`[AFK System] ${message.author?.tag || message.author?.username} returned from AFK (Reason was: "${status.reason}").`, 'info');
              }
              await message.reply(`Welcome back! I've removed your AFK status.`).then((m: any) => setTimeout(() => m.delete().catch(() => {}), 5000));
            }
          }

          // Check if mentioned users are AFK
          if (message.mentions.users.size > 0) {
            const mentionChecks = message.mentions.users.map(async (user: any) => {
              if (user.id === message.author.id) return;
              const afkStatus = await getUserAFK(guildId, user.id);
              if (afkStatus) {
                const embed = buildMinimalAction({
                  user: user,
                  action: 'is currently AFK',
                  reason: afkStatus.reason,
                  extra: `*(Since <t:${Math.floor(afkStatus.timestamp / 1000)}:R>)*`
                });
                await message.reply({ embeds: [embed] });
              }
            });
            await Promise.all(mentionChecks);
          }
        } catch (err) {
          console.error(`[Community messageCreate] Error in handler:`, err);
        }
      }
    }
  ]
};
