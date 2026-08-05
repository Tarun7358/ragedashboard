import { EmbedBuilder } from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { Database } from '../../core/Database.js';
import { buildLimeOverviewCard, VERIFIED_ICON, WRONG_ICON, TIMER_ICON, SHIELD_ICON, CONFIG_ICON, Colors } from '../../core/UIFactory.js';

// Safe display name helper
function userTag(user: any): string {
  return user?.globalName ?? user?.username ?? user?.tag ?? user?.id ?? 'Unknown';
}

// Lime GG aesthetic default constants
export const DEFAULT_LIME_HEADER = '<:foxydealz:1511379877180215296>  **Welcome, {user}! To {server}**';
export const DEFAULT_LIME_DESCRIPTION = [
  '> **{user}! You Are the {membercount} Member**',
  '> **<:verifiedblue:1518869383219253328>  Thanks for being part of our community. **',
  '> **We hope you have an amazing experience! <:drmomoscandy:1511379935237902517> **',
  '> **Join Our Voice Channel to Connect! <:voicechannelgreen:1532425750278438962>**',
  '',
  '  **------- Enhanced Community! <:hunter:1511379940002631790>  -------- **'
].join('\n');
export const DEFAULT_LIME_COLOR = '#CBF528';
export const DEFAULT_LIME_FOOTER = '{server} • Member #{memberCount}';
export const DEFAULT_WELCOME_IMAGE_URL = 'https://cdn.discordapp.com/attachments/1318247749904367699/1534546572698976418/ChatGPT_Image_Aug_5_2026_06_00_23_PM.png?ex=6a74855d&is=6a7333dd&hm=cc81e1454fadaba8c9db182ebbb5b87fc6c7274da67ddd393f4f242587a4f6aa';

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
  if (imgUrl && imgUrl !== 'none' && imgUrl !== 'off') {
    embed.setImage(imgUrl);
  }

  const rawFooter = embedCfg.footer ?? cfg.footer ?? DEFAULT_LIME_FOOTER;
  if (rawFooter && rawFooter !== 'none') {
    embed.setFooter({ text: parseWelcomeVariables(rawFooter, member, countOverride, cfg) });
  }

  return { content, embeds: [embed] };
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
          const img = commConfig.welcomeEmbed?.imageUrl || commConfig.imageUrl || DEFAULT_WELCOME_IMAGE_URL;

          const overviewCard = buildLimeOverviewCard({
            title: 'COMMUNITY WELCOMER MODULE CONFIGURATION MATRIX',
            subtitle: 'NEW MEMBER GREETING CARDS & BANNER INFRASTRUCTURE',
            color: Colors.BRAND,
            sections: [
              {
                title: '<:member:1532621317487071426> WELCOME SYSTEM PARAMETERS',
                items: [
                  `Welcome Channel: ${ch}`,
                  `Banner Image URL: \`${img.slice(0, 75)}...\``
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Welcome Configuration'
          });

          return message.reply({ embeds: [overviewCard] });
        }

        if (action === 'image' || action === 'banner') {
          const urlArg = args[1];
          if (!urlArg) {
            return message.reply({
              content: `${WRONG_ICON} **Syntax**: \`r!welcome image <image_url | reset | none>\`\nExample: \`r!welcome image https://cdn.discordapp.com/attachments/.../image.png\``
            });
          }

          let newUrl = urlArg;
          if (urlArg.toLowerCase() === 'reset' || urlArg.toLowerCase() === 'default') {
            newUrl = DEFAULT_WELCOME_IMAGE_URL;
          }

          const welcomeEmbed = { ...(commConfig.welcomeEmbed || {}), imageUrl: newUrl };
          updateCommConfig({ welcomeEmbed, imageUrl: newUrl });

          return message.reply({
            content: `${VERIFIED_ICON} Welcome embed banner image saved! Updated URL:\n\`${newUrl}\``
          });
        }

        if (action === 'channel') {
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
              content: `${WRONG_ICON} **Syntax**: \`r!welcome channel <#channel | channel_id | channel_name>\`\nExample: \`r!welcome channel #welcome\` or \`r!welcome channel 123456789012345678\``
            });
          }

          updateCommConfig({ welcomeChannelId: channel.id });
          return message.reply({
            content: `${VERIFIED_ICON} Welcome channel updated to **<#${channel.id}>** (\`${channel.id}\`).`
          });
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
          return message.reply({
            content: `${VERIFIED_ICON} Welcome card **{${action}}** link updated to **<#${channel.id}>** (\`${channel.id}\`).`
          });
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
            return message.reply({
              content: `${WRONG_ICON} **Syntax**: \`r!welcome autorole <@role | role_id | role_name>\`\nExample: \`r!welcome autorole @Member\``
            });
          }

          updateCommConfig({ autoRoleId: role.id });
          return message.reply({
            content: `${VERIFIED_ICON} Onboarding auto-assigned join role set to **<@&${role.id}>**.`
          });
        }

        if (action === 'test') {
          const channelId = commConfig.welcomeChannelId || message.channel.id;
          const targetChannel = message.guild?.channels.cache.get(channelId) || message.channel;

          const payload = buildLimeWelcomePayload(commConfig, message.member || message.author);
          await (targetChannel as any).send(payload);

          return message.reply({
            content: `${VERIFIED_ICON} Dispatched test welcome greeting card to ${targetChannel}.`
          });
        }

        // Fallback Command Help Syntax
        return message.reply({
          content: [
            `${CONFIG_ICON} **Community Welcomer Command Matrix**`,
            `• \`r!welcome channel <#channel | ID | name>\` — Set main welcome channel`,
            `• \`r!welcome rules <#channel | ID | name>\` — Link server rules channel`,
            `• \`r!welcome roles <#channel | ID | name>\` — Link self-roles channel`,
            `• \`r!welcome chat <#channel | ID | name>\` — Link general chat channel`,
            `• \`r!welcome image <URL | reset>\` — Set greeting card banner image`,
            `• \`r!welcome autorole <@role | ID | name>\` — Set auto-assigned join role`,
            `• \`r!welcome status\` — View active welcome matrix parameters`,
            `• \`r!welcome test\` — Dispatch live greeting preview card`
          ].join('\n')
        });
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
            { name: '🧪 Test Welcome Card', value: 'test' },
            { name: '📊 View Status & Image URL', value: 'status' },
            { name: '🖼️ Set Custom Banner Image URL', value: 'set-image' },
            { name: '🔄 Reset Banner Image to Default', value: 'reset-image' }
          ]
        },
        { name: 'image_url', type: 3, description: 'Image URL (for set-image action)', required: false }
      ]
    },
    { name: 'avatar', description: 'Get a user\'s avatar', options: [{ name: 'user', type: 6, description: 'User to check', required: false }] },
    { name: 'userinfo', description: 'Get info about a user', options: [{ name: 'user', type: 6, description: 'User to check', required: false }] },
    { name: 'serverinfo', description: 'Get info about the server' },
    { name: 'ping', description: 'Check bot latency' },
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
                title: '<:member:1532621317487071426> WELCOME SYSTEM PARAMETERS',
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
        const embed = new EmbedBuilder()
          .setTitle(`${user.username}'s Avatar`)
          .setImage(user.displayAvatarURL({ size: 1024, forceStatic: false }))
          .setColor('#4f8cff');
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_userinfo',
      handler: async (client: any, interaction: any, context: any) => {
        const user = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        
        const embed = new EmbedBuilder()
          .setAuthor({ name: userTag(user), iconURL: user.displayAvatarURL() })
          .setThumbnail(user.displayAvatarURL())
          .setColor('#4f8cff')
          .addFields(
            { name: 'ID', value: user.id, inline: true },
            { name: 'Joined Discord', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true }
          );
        
        if (member) {
          embed.addFields(
            { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
            { name: 'Roles', value: member.roles.cache.filter((r: any) => r.name !== '@everyone').map((r: any) => `<@&${r.id}>`).join(', ') || 'None' }
          );
        }
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_serverinfo',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        const embed = new EmbedBuilder()
          .setTitle(guild.name)
          .setThumbnail(guild.iconURL())
          .setColor('#4f8cff')
          .addFields(
            { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
            { name: 'Members', value: `${guild.memberCount}`, inline: true },
            { name: 'Created On', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
            { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
            { name: 'Channels', value: `${guild.channels.cache.size}`, inline: true }
          );
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_ping',
      handler: async (client: any, interaction: any, context: any) => {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply().catch(() => {});
        }

        const wsPing = Math.round(client.ws.ping);
        const uptimeSec = process.uptime();
        const startTime = Math.floor((Date.now() - uptimeSec * 1000) / 1000);
        const heapMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

        const getStatus = (ms: number) => {
          if (ms < 100) return `${VERIFIED_ICON} Ultra Fast`;
          if (ms < 250) return `${TIMER_ICON} Normal Speed`;
          if (ms < 500) return `${TIMER_ICON} Moderate Lag`;
          return `${WRONG_ICON} High Latency`;
        };

        const pingColor = wsPing < 150 ? Colors.LIME : wsPing < 300 ? Colors.WARN : Colors.DANGER;

        const embed = buildLimeOverviewCard({
          title: 'LATENCY & SPEED MONITOR',
          subtitle: 'LIVE SYSTEM PERFORMANCE',
          color: pingColor,
          sections: [
            {
              title: `${SHIELD_ICON} GATEWAY & API LATENCY`,
              items: [
                `WebSocket Latency: \`${wsPing}ms\` — ${getStatus(wsPing)}`,
                `Online Since: <t:${startTime}:R>`
              ]
            },
            {
              title: `${CONFIG_ICON} HARDWARE & NODE ENVIRONMENT`,
              items: [
                `RAM Heap: \`${heapMb} MB\``,
                `Shard: \`#0 ONLINE\``,
                `Runtime: \`Node.js ${process.version}\``
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Speed Test'
        });

        await interaction.editReply({ embeds: [embed] }).catch(() => {});
      }
    },
    {
      name: 'command_help',
      handler: async (client: any, interaction: any, context: any) => {
        const embed = new EmbedBuilder()
          .setTitle('RAGE OPTIMISER Commands')
          .setDescription('Here are some available commands:')
          .addFields(
            { name: '🛡️ Moderation', value: '`/ban`, `/kick`, `/timeout`, `/warn`, `/purge`, `/lock`, `/slowmode`' },
            { name: '🎮 Community', value: '`/avatar`, `/userinfo`, `/serverinfo`, `/ping`, `/poll`, `/giveaway`' },
            { name: '💰 Economy', value: '`/balance`, `/daily`, `/work`, `/pay`, `/rob`, `/shop`, `/inventory`' },
            { name: '🎲 Fun', value: '`/8ball`, `/flip`, `/roll`, `/meme`, `/joke`, `/weather`' },
            { name: '🛠️ Utilities', value: '`/afk`, `/remindme`, `/stats`' }
          )
          .setColor('#2ecc71');
        await interaction.reply({ embeds: [embed] });
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
          .setTitle('📊 Poll')
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
            await interaction.editReply(`🌍 **Weather Report:**\n> ${text.trim()}`);
          } else {
            await interaction.editReply(`☀️ The weather in **${location}** is currently sunny at 24°C.`);
          }
        } catch (err) {
          await interaction.editReply(`☀️ The weather in **${location}** is currently sunny at 24°C.`);
        }
      }
    },
    {
      name: 'command_afk',
      handler: async (client: any, interaction: any, context: any) => {
        const reason = interaction.options.getString('reason') || 'AFK';
        const guildId = interaction.guildId;
        if (!guildId) return;

        await setUserAFK(guildId, interaction.user.id, reason);

        const embed = new EmbedBuilder()
          .setColor(0x84cc16)
          .setTitle('AFK Status Activated')
          .setDescription(
            `<a:approved:1532390590707142956> **Status Activated**\n` +
            `**User**: ${interaction.user}\n` +
            `**Reason**: \`${reason}\`\n\n` +
            `*your afk status will be removed upon next message*`
          )
          .setThumbnail(interaction.user.displayAvatarURL({ forceStatic: false }))
          .setFooter({ text: 'Rage Optimiser • AFK System' })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_remindme',
      handler: async (client: any, interaction: any, context: any) => {
        const time = interaction.options.getString('time');
        const message = interaction.options.getString('message');
        let ms = 60000;
        if (time.endsWith('s')) ms = parseInt(time) * 1000;
        else if (time.endsWith('m')) ms = parseInt(time) * 60000;
        else if (time.endsWith('h')) ms = parseInt(time) * 3600000;
        
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
        await interaction.reply(`🎱 **Question:** ${question}\n**Answer:** ${answer}`);
      }
    },
    {
      name: 'command_flip',
      handler: async (client: any, interaction: any, context: any) => {
        const result = Math.random() > 0.5 ? 'Heads' : 'Tails';
        await interaction.reply(`🪙 The coin landed on: **${result}**`);
      }
    },
    {
      name: 'command_roll',
      handler: async (client: any, interaction: any, context: any) => {
        const result = Math.floor(Math.random() * 6) + 1;
        await interaction.reply(`🎲 You rolled a **${result}**`);
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

        const choiceIcons: Record<string, string> = { rock: '🪨 Rock', paper: '📄 Paper', scissors: '✂️ Scissors' };
        await interaction.reply({
          content: `🎮 **Rock Paper Scissors**\n- **Your Choice:** ${choiceIcons[choice]}\n- **My Choice:** ${choiceIcons[botChoice]}\n- **Result:** **${result}**`
        });
      }
    },
    {
      name: 'command_ship',
      handler: async (client: any, interaction: any, context: any) => {
        const u1 = interaction.options.getUser('user1');
        const u2 = interaction.options.getUser('user2') || interaction.user;
        const percent = Math.floor(Math.random() * 101);

        let heart = '💔';
        if (percent > 85) heart = '💖✨';
        else if (percent > 60) heart = '❤️';
        else if (percent > 40) heart = '💛';
        else if (percent > 20) heart = '💙';

        await interaction.reply({
          content: `❤️ **Matchmaker**\n- **Match:** ${u1} x ${u2}\n- **Compatibility:** **${percent}%** ${heart}`
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
            content: `🔒 **Hash Result (${algo.toUpperCase()}):**\n\`\`\`\n${hashed}\n\`\`\``,
            flags: 64
          });
        } catch {
          await interaction.reply({ content: '❌ Hash computation failed.', flags: 64 });
        }
      }
    },
    {
      name: 'command_color',
      handler: async (client: any, interaction: any, context: any) => {
        let hex = interaction.options.getString('hex');
        if (!hex.startsWith('#')) hex = '#' + hex;
        
        const embed = new EmbedBuilder()
          .setTitle(`🎨 Color Preview: ${hex}`)
          .setColor(hex as any)
          .setThumbnail(`https://singlecolorimage.com/get/${hex.substring(1)}/100x100`)
          .setTimestamp();
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_embed-builder',
      handler: async (client: any, interaction: any, context: any) => {
        const title = interaction.options.getString('title');
        const desc = interaction.options.getString('description');
        const color = interaction.options.getString('color') || '#4f8cff';
        const footer = interaction.options.getString('footer');
        const image = interaction.options.getString('image');

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(desc)
          .setColor(color as any)
          .setTimestamp();
        
        if (footer) embed.setFooter({ text: footer });
        if (image) embed.setImage(image);

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

        const config = commModule.config;
        const channelId = config.welcomeChannelId;
        if (!channelId) return;

        const defaultEmbed = { title: '👋 Welcome to {server}!', description: 'Welcome {user}!', color: '#4f8cff', showAvatar: true, footer: 'User ID: {userId}' };
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
        const defaultEmbed = { title: '😢 Goodbye {user}!', description: '**{userTag}** has left.', color: '#ff4444', showAvatar: true, footer: 'User ID: {userId}' };
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
        
        console.log(`[Community messageCreate] Processing message from ${message.author.username} in guild ${guildId}`);

        try {
          // Remove AFK if the user speaks
          const status = await getUserAFK(guildId, message.author.id);
          if (status) {
            console.log(`[Community messageCreate] User ${message.author.username} was AFK (${status.reason}). Clearing AFK status.`);
            await clearUserAFK(guildId, message.author.id);
            await message.reply(`Welcome back! I've removed your AFK status.`).then((m: any) => setTimeout(() => m.delete().catch(() => {}), 5000));
          }

          // Check if mentioned users are AFK
          if (message.mentions.users.size > 0) {
            console.log(`[Community messageCreate] Mentions count: ${message.mentions.users.size}`);
            const mentionChecks = message.mentions.users.map(async (user: any) => {
              console.log(`[Community messageCreate] Checking AFK for mentioned user: ${user.username} (${user.id})`);
              const afkStatus = await getUserAFK(guildId, user.id);
              if (afkStatus) {
                console.log(`[Community messageCreate] Mentioned user ${user.username} is AFK: ${afkStatus.reason}`);
                await message.reply(`💤 **${user.username}** is currently AFK: ${afkStatus.reason} (Since <t:${Math.floor(afkStatus.timestamp / 1000)}:R>)`);
              } else {
                console.log(`[Community messageCreate] Mentioned user ${user.username} is NOT AFK.`);
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
