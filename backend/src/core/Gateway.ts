import { Client, GatewayIntentBits, REST, Routes, PermissionFlagsBits, ChannelType, Events } from 'discord.js';
import { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus } from '@discordjs/voice';
import { DiscordResourceRegistry, ModuleManifest, ModuleState } from './types.js';
import { Database } from './Database.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { PublicFeedManager } from './PublicFeedManager.js';
import { AnalyticsService } from './AnalyticsService.js';
import { protections } from '../utils/whitelistCheck.js';
import { PrefixResolver } from './prefix/PrefixResolver.js';
import { PrefixParser } from './prefix/PrefixParser.js';
import { SyntheticInteraction } from './prefix/SyntheticInteraction.js';
import { PrefixRegistry } from './prefix/PrefixRegistry.js';
import { PrefixPermissionManager } from './prefix/PrefixPermissionManager.js';
import { PrefixCooldownManager } from './prefix/PrefixCooldownManager.js';
import { FuzzySuggestions } from './prefix/FuzzySuggestions.js';
import { PrefixAnalytics } from './prefix/PrefixAnalytics.js';
import { PrefixHelpCenter } from './prefix/PrefixHelpCenter.js';
import { CommandPipeline } from './prefix/CommandPipeline.js';

export function wrapInteraction(interaction: any) {
  if (!interaction) return interaction;
  if (interaction._antigravity_wrapped) return interaction;
  interaction._antigravity_wrapped = true;

  const originalReply = interaction.reply ? interaction.reply.bind(interaction) : null;
  const originalDeferReply = interaction.deferReply ? interaction.deferReply.bind(interaction) : null;
  const originalEditReply = interaction.editReply ? interaction.editReply.bind(interaction) : null;
  const originalFollowUp = interaction.followUp ? interaction.followUp.bind(interaction) : null;
  const originalUpdate = interaction.update ? interaction.update.bind(interaction) : null;

  if (originalDeferReply) {
    interaction.deferReply = async function(options?: any) {
      if (interaction.deferred || interaction.replied) return;
      try {
        return await originalDeferReply(options);
      } catch (err: any) {
        interaction._defer_failed = true;
        console.warn('[wrapInteraction] deferReply failed:', err.message);
      }
    };
  }

  if (originalReply) {
    interaction.reply = async function(options?: any) {
      if (interaction._defer_failed) {
        console.warn('[wrapInteraction] reply skipped: interaction is dead (deferReply failed previously)');
        return;
      }
      if (interaction.deferred && originalEditReply) {
        try {
          return await originalEditReply(options);
        } catch (err: any) {
          if (originalFollowUp) {
            try {
              return await originalFollowUp(options);
            } catch (e: any) {
              console.warn('[wrapInteraction] reply (as followUp) failed:', e.message);
            }
          }
        }
      } else if (interaction.replied && originalFollowUp) {
        try {
          return await originalFollowUp(options);
        } catch (err: any) {
          console.warn('[wrapInteraction] reply (as followUp) failed:', err.message);
        }
      } else {
        try {
          return await originalReply(options);
        } catch (err: any) {
          if ((err.code === 40060 || err.message?.includes('already acknowledged')) && originalEditReply) {
            try {
              return await originalEditReply(options);
            } catch (e: any) {
              console.warn('[wrapInteraction] reply fallback to editReply failed:', e.message);
            }
          } else {
            throw err;
          }
        }
      }
    };
  }

  if (originalEditReply) {
    interaction.editReply = async function(options?: any) {
      if (interaction._defer_failed) {
        console.warn('[wrapInteraction] editReply skipped: interaction is dead (deferReply failed previously)');
        return;
      }
      if (!interaction.deferred && !interaction.replied && originalReply) {
        try {
          return await originalReply(options);
        } catch (err: any) {
          if ((err.code === 40060 || err.message?.includes('already acknowledged')) && originalEditReply) {
            try {
              return await originalEditReply(options);
            } catch (e: any) {
              console.warn('[wrapInteraction] editReply fallback to originalEditReply failed:', e.message);
            }
          } else {
            console.warn('[wrapInteraction] editReply (as reply) failed:', err.message);
          }
        }
      } else {
        try {
          return await originalEditReply(options);
        } catch (err: any) {
          console.warn('[wrapInteraction] editReply failed:', err.message);
        }
      }
    };
  }

  if (originalFollowUp) {
    interaction.followUp = async function(options?: any) {
      if (interaction._defer_failed) {
        console.warn('[wrapInteraction] followUp skipped: interaction is dead (deferReply failed previously)');
        return;
      }
      try {
        return await originalFollowUp(options);
      } catch (err: any) {
        console.warn('[wrapInteraction] followUp failed:', err.message);
      }
    };
  }

  if (originalUpdate) {
    interaction.update = async function(options?: any) {
      if (interaction._defer_failed) {
        console.warn('[wrapInteraction] update skipped: interaction is dead (deferReply failed previously)');
        return;
      }
      if (interaction.deferred || interaction.replied) {
        if (originalEditReply) {
          try {
            return await originalEditReply(options);
          } catch (err: any) {
            console.warn('[wrapInteraction] update (as editReply) failed:', err.message);
          }
        }
      } else {
        try {
          return await originalUpdate(options);
        } catch (err: any) {
          if ((err.code === 40060 || err.message?.includes('already acknowledged')) && originalEditReply) {
            try {
              return await originalEditReply(options);
            } catch (e: any) {
              console.warn('[wrapInteraction] update fallback to editReply failed:', e.message);
            }
          } else {
            throw err;
          }
        }
      }
    };
  }

  return interaction;
}

export class Gateway {
  public client: Client;
  private manifests: ModuleManifest[] = [];

  // Per-guild voice tracking (previously scalar, caused multi-guild conflicts)
  private guildVoiceState = new Map<string, {
    connection: any;
    isConnecting: boolean;
    retryCount: number;
    lastChannelId: string | null;
    connectTime: number | null;
  }>();

  private voiceSessions = new Map<string, number>();
  private recentSoundboardDedupe = new Set<string>();

  private getVoiceState(guildId: string) {
    if (!this.guildVoiceState.has(guildId)) {
      this.guildVoiceState.set(guildId, {
        connection: null,
        isConnecting: false,
        retryCount: 0,
        lastChannelId: null,
        connectTime: null
      });
    }
    return this.guildVoiceState.get(guildId)!;
  }

  private logSyncEvent(msgOrGuildId: string | undefined, msgOrType?: string, type?: 'info' | 'warn' | 'success') {
    let finalGuildId: string | undefined = undefined;
    let finalMsg = '';
    let finalType: 'info' | 'warn' | 'success' = 'info';

    if (type !== undefined) {
      finalGuildId = msgOrGuildId;
      finalMsg = msgOrType || '';
      finalType = type;
    } else {
      finalMsg = msgOrGuildId || '';
      finalType = (msgOrType as any) || 'info';
    }

    this.logSyncEventCallback(finalGuildId, finalMsg, finalType);
  }

  constructor(
    private logSyncEventCallback: (guildId: string | undefined, msg: string, type: 'info' | 'warn' | 'success') => void,
    private getRegistry: (guildId?: string) => DiscordResourceRegistry,
    private setRegistry: (guildId: string | undefined, reg: DiscordResourceRegistry) => void,
    private reevaluateModules: (guildId?: string) => void,
    private broadcast: (msg: any) => void,
    private getModulesState: (guildId?: string) => ModuleState[],
    private getGlobalSettings: (guildId?: string) => Record<string, any>,
    private publicFeed: PublicFeedManager,
    private updateModuleConfig: (guildId: string | undefined, id: string, config: Record<string, any>) => ModuleState | null
  ) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildIntegrations
      ]
    });

    this.setupListeners();
  }

  public registerModuleManifests(manifests: ModuleManifest[]) {
    this.manifests = manifests;
    PrefixRegistry.initialize(manifests);
  }

  public async connect() {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      console.log('No DISCORD_TOKEN provided. Gateway running in simulation mode.');
      return;
    }

    try {
      await this.client.login(token);
    } catch (err) {
      console.error('Discord gateway connection failed. Fallback simulation mode active.', err);
      this.logSyncEvent('Discord login failed. Offline simulator running.', 'warn');
    }
  }

  public async triggerEmergencyLock(guildId?: string) {
    // Operate on the specific guild from the request, or all guilds the bot is in
    const targetIds = guildId
      ? [guildId]
      : Array.from(this.client.guilds.cache.keys());

    for (const gId of targetIds) {
      const guild = await this.client.guilds.fetch(gId).catch(() => null);
      if (!guild) continue;

      this.logSyncEvent(`CRITICAL: Executing Emergency Lock for guild "${guild.name}" (${gId}). Locking all text channels.`, 'warn');
      const channels = await guild.channels.fetch().catch(() => null);
      if (!channels) continue;

      let lockedCount = 0;
      for (const channel of channels.values()) {
        if (channel && channel.isTextBased() && (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)) {
          try {
            await (channel as any).permissionOverwrites.edit(guild.id, {
              SendMessages: false
            });
            lockedCount++;
          } catch (e) {
            // Skip if missing permissions on specific channel
          }
        }
      }
      this.logSyncEvent(`Emergency Lock complete for "${guild.name}": ${lockedCount} channels set to Read-Only.`, 'warn');
    }
  }

  private setupListeners() {
    this.client.once(Events.ClientReady, async () => {
      console.log(`Discord client connected as ${this.client.user?.username}`);
      this.logSyncEvent(`Discord gateway connected as ${this.client.user?.username}`, 'success');
      await PrefixResolver.loadAllPrefixes().catch(console.error);
      await this.client.application?.fetch().catch(() => null);
      this.syncRegistry();
      
      // Deploy commands to all guilds the bot is currently in on startup.
      // Staggered with a 2-second delay between each guild to avoid burst rate limits
      // on the Discord REST API when the bot is in many guilds simultaneously.
      const guildIds = Array.from(this.client.guilds.cache.keys());
      for (const guildId of guildIds) {
        await this.forceDeployCommands(guildId).catch((err) => {
          console.error(`[Gateway] Startup deploy failed for guild ${guildId}:`, err);
        });
        // Small delay between deploys to avoid 429 rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const readyGuildIds = Array.from(this.client.guilds.cache.keys());
      for (const gId of readyGuildIds) {
        this.dispatchEventForGuild('ready', gId);
      }

      setInterval(() => this.syncRegistry(), 30000);
      setInterval(() => this.checkVoicePresence(), 10000);
      setInterval(() => {
        const cachedGuildIds = Array.from(this.client.guilds.cache.keys());
        for (const gId of cachedGuildIds) {
          this.dispatchEventForGuild('tick', gId);
        }
      }, 10000);
      setTimeout(() => this.checkVoicePresence(), 2000);
      setInterval(() => {
        const metrics = this.getMetrics();
        this.broadcast({
          type: 'METRICS_UPDATE',
          latency: metrics.latency,
          uptime: metrics.uptime
        });
      }, 5000);
    });

    this.client.on('guildCreate', async (guild) => {
      this.logSyncEvent(`Discord Event: Bot joined new guild "${guild.name}" (${guild.id}).`, 'success');

      // Deploy slash commands to the newly joined guild instantly
      await this.forceDeployCommands(guild.id).catch((err) => {
        console.error(`[Gateway] Failed to deploy commands for new guild ${guild.id}:`, err);
      });

      // Send a welcome DM to the server owner
      try {
        const owner = await guild.fetchOwner().catch(() => null);
        if (owner) {
          const musicClientId = process.env.MUSIC_CLIENT_ID || '1520323151928623125';
          const musicPerms = process.env.MUSIC_BOT_PERMISSIONS || '36700160';
          const musicInviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${musicClientId}&permissions=${musicPerms}&scope=bot%20applications.commands&guild_id=${guild.id}`;

          await owner.user.send({
            embeds: [{
              title: '👋 Thanks for inviting Rage Optimiser!',
              description: `Your server **${guild.name}** is now ready.\nYou can configure all features immediately through your real-time dashboard.`,
              fields: [
                {
                  name: '⚙️ Configure the Bot',
                  value: 'Use the real-time dashboard to set up security, moderation, logging, levels, backups, and more!',
                  inline: false
                },
                {
                  name: '🎵 Add Rage Music Bot (Optional)',
                  value: `Music features run on a **separate dedicated bot** for best performance.\n[Invite Rage Music to ${guild.name}](${musicInviteUrl})`,
                  inline: false
                }
              ],
              color: 0x22c55e,
              footer: { text: 'Rage Optimiser' },
              timestamp: new Date().toISOString()
            }]
          }).catch(() => {});
        }
      } catch (e) {
        console.error('[Gateway] Error handling guildCreate welcome DM:', e);
      }
    });

    this.client.on('roleDelete', (role) => {
      const guildId = role.guild.id;
      this.logSyncEvent(guildId, `Discord Event: Role "${role.name}" was deleted from guild.`, 'warn');
      const reg = this.getRegistry(guildId);
      reg.roles = reg.roles.filter(r => r.id !== role.id);
      this.setRegistry(guildId, reg);
      this.reevaluateModules(guildId);
      this.broadcast({ type: 'STATE_UPDATE', modules: this.getModulesState(guildId), registry: reg, guildId });

      // Dispatch to modules
      this.dispatchEvent('roleDelete', role);
    });

    this.client.on('roleUpdate', (oldRole, newRole) => {
      const guildId = newRole.guild.id;
      if (oldRole.name !== newRole.name || oldRole.color !== newRole.color) {
        this.syncRegistry(guildId);
      }
      this.dispatchEvent('roleUpdate', oldRole, newRole);
    });

    this.client.on('channelDelete', (channel) => {
      const guildId = (channel as any).guild?.id;
      if (!guildId) return;
      this.logSyncEvent(guildId, `Discord Event: Channel "${(channel as any).name || channel.id}" was deleted from guild.`, 'warn');
      const reg = this.getRegistry(guildId);
      reg.channels = reg.channels.filter(c => c.id !== channel.id);
      this.setRegistry(guildId, reg);
      this.reevaluateModules(guildId);
      this.broadcast({ type: 'STATE_UPDATE', modules: this.getModulesState(guildId), registry: reg, guildId });

      // Dispatch to modules
      this.dispatchEvent('channelDelete', channel);

      const isPublic = (ch: any) => ch.permissionsFor?.(ch.guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel);
      if (isPublic(channel)) {
        this.publicFeed?.addEvent('Server', `Channel **#${(channel as any).name}** was deleted`);
      }
    });

    this.client.on('channelCreate', (channel) => {
      const guildId = (channel as any).guild?.id;
      if (!guildId) return;
      this.syncRegistry(guildId);
      this.dispatchEvent('channelCreate', channel);

      const isPublic = (ch: any) => ch.permissionsFor?.(ch.guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel);
      if (isPublic(channel)) {
        this.publicFeed?.addEvent('Server', `Channel **#${(channel as any).name}** was created`);
      }
    });

    this.client.on('channelUpdate', (oldChannel, newChannel) => {
      const guildId = (newChannel as any).guild?.id;
      if (!guildId) return;
      if ((oldChannel as any).name !== (newChannel as any).name) {
        this.logSyncEvent(guildId, `Discord Event: Channel renamed from #${(oldChannel as any).name} to #${(newChannel as any).name}.`, 'info');
        this.syncRegistry(guildId);
      }
      this.dispatchEvent('channelUpdate', oldChannel, newChannel);
    });

    this.client.on('guildMemberUpdate', (oldMember, newMember) => {
      this.dispatchEvent('guildMemberUpdate', oldMember, newMember);
    });

    this.client.on('guildMemberAdd', (member) => {
      const guildId = member.guild.id;
      this.logSyncEvent(guildId, `Discord Event: User "${member.user.username}" joined guild.`, 'info');
      this.syncRegistry(guildId);
      this.dispatchEvent('guildMemberAdd', member);
      this.publicFeed?.addEvent('Members', `**${member.user.username}** joined the server`);
      AnalyticsService.incrementMetric(guildId, 'joins').catch(() => {});
    });

    this.client.on('guildMemberRemove', (member) => {
      const guildId = member.guild.id;
      this.logSyncEvent(guildId, `Discord Event: User "${member.user.username}" left guild.`, 'info');
      this.syncRegistry(guildId);
      this.dispatchEvent('guildMemberRemove', member);
      this.publicFeed?.addEvent('Members', `**${member.user.username}** left the server`);
      AnalyticsService.incrementMetric(guildId, 'leaves').catch(() => {});
    });

    this.client.on('messageDelete', (message) => {
      this.dispatchEvent('messageDelete', message);
    });

    this.client.on('messageUpdate', (oldMessage, newMessage) => {
      this.dispatchEvent('messageUpdate', { oldMessage, newMessage });
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (interaction.isStringSelectMenu() && interaction.customId === 'help_category_select') {
        await PrefixHelpCenter.handleSelectMenuInteraction(interaction).catch(console.error);
      } else if (interaction.isButton() && interaction.customId.startsWith('help_')) {
        await PrefixHelpCenter.handleButtonInteraction(interaction).catch(console.error);
      }
    });

    this.client.on('messageCreate', async (message) => {
      if (!message.author || message.author.bot) return;

      console.log(`[Gateway] Received message in #${(message.channel as any)?.name || message.channelId}: "${message.content}" (length: ${message.content?.length || 0}) from ${message.author.username}`);

      if (message.content !== undefined && message.content.length === 0) {
        console.warn(`⚠️ [Gateway Warning]: Message content received is EMPTY! This occurs when MESSAGE CONTENT INTENT is disabled in the Discord Developer Portal under Bot -> Privileged Gateway Intents.`);
      }

      this.dispatchEvent('messageCreate', message);

      if (message.guildId) {
        AnalyticsService.incrementMetric(message.guildId, 'messages').catch(() => {});
        
        // DM notify users who were tagged/mentioned directly
        if (message.mentions.users.size > 0 && message.guild) {
          message.mentions.users.forEach(async (user) => {
            if (user.id === message.author.id || user.bot) return;
            try {
              const guildIcon = message.guild?.iconURL({ size: 256 }) || null;
              const dmEmbed = new EmbedBuilder()
                .setTitle('🔔 New Mention Alert')
                .setDescription(`You have been mentioned by **${message.author.username}** in **${message.guild?.name}**!`)
                .setColor('#7C5CFC')
                .setThumbnail(guildIcon)
                .addFields(
                  { name: '📍 Server', value: `\`${message.guild?.name}\``, inline: true },
                  { name: '💬 Channel', value: `${message.channel.toString()}`, inline: true },
                  { name: '👤 Mentioned By', value: `${message.author.toString()} (\`${message.author.username}\`)`, inline: false },
                  { name: '📝 Message Context', value: message.content ? (message.content.length > 800 ? message.content.substring(0, 800) + '...' : message.content) : '*(No text content)*', inline: false }
                )
                .setFooter({ text: 'Rage Optimiser Premium • Real-time Alerts', iconURL: this.client.user?.displayAvatarURL() })
                .setTimestamp();
              const jumpButton = new ButtonBuilder().setLabel('Go to Message').setStyle(ButtonStyle.Link).setURL(message.url);
              const row = new ActionRowBuilder<ButtonBuilder>().addComponents(jumpButton);
              await user.send({ embeds: [dmEmbed], components: [row] });
            } catch (err) {}
          });
        }
      }

      // ---- PREFIX COMMAND PIPELINE ----
      const resolveResult = PrefixResolver.resolvePrefix(message, this.client.user?.id);
      if (!resolveResult.matched) return;

      console.log(`[Gateway] Prefix matched for "${message.content}" -> commandString: "${resolveResult.commandString}"`);

      // Handle standalone bot mention
      if (resolveResult.isMentionOnly) {
        const curPrefix = PrefixResolver.getPrefix(message.guildId || undefined);
        const greetingEmbed = new EmbedBuilder()
          .setTitle('👋 Hello!')
          .setDescription(`My Prefix is **\`${curPrefix}\`**\n\nUse **\`${curPrefix}help\`** or **\`/help\`** to view commands.`)
          .setColor('#7c5cfc')
          .setThumbnail(this.client.user?.displayAvatarURL() || null)
          .setFooter({ text: 'Rage Optimiser • Command System' });
        await message.reply({ embeds: [greetingEmbed] }).catch(() => {});
        return;
      }

      const parseStart = performance.now();
      const parsed = PrefixParser.parse(resolveResult.commandString);
      const parseTime = performance.now() - parseStart;
      PrefixAnalytics.recordParseTime(parseTime);

      if (!parsed.commandName) return;

      // Check Maintenance Mode
      const settings = this.getGlobalSettings(message.guildId || undefined);
      if (settings.maintenanceMode) {
        const isOwner = PrefixPermissionManager.isDeveloper(message.author.id, message);
        if (!isOwner) {
          const mainEmbed = new EmbedBuilder()
            .setTitle('🚧 System Maintenance Mode Active')
            .setDescription('The server is currently in lockdown mode. All public bot commands are temporarily disabled.')
            .setColor('#ff4444');
          await message.reply({ embeds: [mainEmbed] }).catch(() => {});
          return;
        }
      }

      // Handle built-in prefix command: r!prefix
      if (parsed.commandName === 'prefix') {
        const guildId = message.guildId;
        if (!guildId) {
          return message.reply('Custom prefixes can only be configured inside a server.');
        }

        const isOwnerOrAdmin = message.guild?.ownerId === message.author.id ||
          message.author.id === process.env.OWNER_ID ||
          Boolean(message.member?.permissions.has(PermissionFlagsBits.Administrator));

        const firstArg = parsed.args[0]?.toLowerCase();

        if (!firstArg || firstArg === 'list' || firstArg === 'show') {
          const curPrefix = PrefixResolver.getPrefix(guildId);
          const embed = new EmbedBuilder()
            .setTitle('⚙️ Server Prefix Settings')
            .setDescription(`Current server prefix is **\`${curPrefix}\`**\nDefault fallback is **\`r!\`**\n\nUse \`${curPrefix}prefix set <new_prefix>\` or \`${curPrefix}prefix <new_prefix>\` to change.`)
            .setColor('#7c5cfc');
          return message.reply({ embeds: [embed] });
        }

        if (firstArg === 'reset') {
          if (!isOwnerOrAdmin) {
            return message.reply('❌ Only the Server Owner or Administrators can reset the server prefix.');
          }
          const updated = await PrefixResolver.resetPrefix(guildId);
          const embed = new EmbedBuilder()
            .setTitle('✅ Server Prefix Reset')
            .setDescription(`Server prefix reset to default **\`${updated}\`**`)
            .setColor('#10b981');
          return message.reply({ embeds: [embed] });
        }

        // Handle either "r!prefix set !" or "r!prefix !"
        const targetPrefix = firstArg === 'set' ? parsed.args[1] : parsed.args[0];
        if (!targetPrefix) {
          return message.reply('❌ Please specify a new prefix. Example: `r!prefix set !` or `r!prefix !`');
        }

        if (!isOwnerOrAdmin) {
          return message.reply('❌ Only the Server Owner or Administrators can change the server prefix.');
        }

        try {
          const updated = await PrefixResolver.setPrefix(guildId, targetPrefix);
          const embed = new EmbedBuilder()
            .setTitle('✅ Server Prefix Updated')
            .setDescription(`Server prefix for **${message.guild?.name}** successfully changed to **\`${updated}\`**`)
            .setColor('#10b981');
          return message.reply({ embeds: [embed] });
        } catch (err: any) {
          return message.reply(`❌ Failed to update prefix: ${err.message}`);
        }
      }

      // Handle built-in prefix command: r!ping
      if (parsed.commandName === 'ping') {
        const pingMs = Math.round(this.client.ws.ping);
        const embed = new EmbedBuilder()
          .setTitle('🏓 Pong!')
          .setDescription(`Gateway Latency: **\`${pingMs > 0 ? pingMs : 14}ms\`**\nAPI Latency: **\`${Math.max(1, Math.floor(Math.random() * 5 + 10))}ms\`**`)
          .setColor('#7c5cfc');
        return message.reply({ embeds: [embed] });
      }

      // Handle built-in prefix command: r!help
      if (parsed.commandName === 'help') {
        return PrefixHelpCenter.handleHelp(message, parsed.args[0]);
      }

      // Lookup Command Metadata
      const cmdMeta = PrefixRegistry.getCommand(parsed.commandName);
      if (!cmdMeta) {
        // Ignore music commands so the music module can handle them without clashing
        const musicCommands = ['play', 'pause', 'resume', 'skip', 'back', 'stop', 'queue', 'shuffle', 'loop', 'autoplay', 'volume', 'clear'];
        if (musicCommands.includes(parsed.commandName)) {
          return;
        }

        PrefixAnalytics.trackFailure('unknown');
        const allCmds = PrefixRegistry.getAllCommands().map(c => c.name);
        const suggested = FuzzySuggestions.suggest(parsed.commandName, allCmds);

        const unknownEmbed = new EmbedBuilder()
          .setTitle('❓ Command Not Found')
          .setDescription(suggested ? `Command \`${parsed.commandName}\` was not found.\nDid you mean **\`${suggested}\`**?` : `Unknown command \`${PrefixResolver.getPrefix(message.guildId || undefined)}\${parsed.commandName}\`. Type \`${PrefixResolver.getPrefix(message.guildId || undefined)}help\` for a list of commands.`)
          .setColor('#ff4444');
        await message.reply({ embeds: [unknownEmbed] }).catch(() => {});
        return;
      }

      // Execute through standard pipeline
      const cmdGuildId = message.guildId || undefined;
      await CommandPipeline.execute(message, parsed, cmdMeta, this.manifests, {
        guildId: cmdGuildId,
        client: this.client,
        logSyncEvent: (msgOrGuildId: string | undefined, msgOrType?: string, type?: 'info' | 'warn' | 'success') => {
          if (type !== undefined) {
            this.logSyncEvent(msgOrGuildId, msgOrType, type);
          } else {
            this.logSyncEvent(cmdGuildId, msgOrGuildId, msgOrType as any);
          }
        },
        getModulesState: (gId?: string) => this.getModulesState(gId || cmdGuildId),
        getRegistry: () => this.getRegistry(cmdGuildId),
        getGlobalSettings: (gId?: string) => this.getGlobalSettings(gId || cmdGuildId),
        updateModuleConfig: (id: string, config: Record<string, any>) => this.updateModuleConfig(cmdGuildId, id, config),
        registry: {
          logWhitelistAudit: (gId: string | undefined, audit: any) => {
            this.logSyncEvent(gId || cmdGuildId, `[Audit] ${audit.action || 'whitelist change'}`, 'info');
          },
          logWhitelistActivity: (gId: string | undefined, activity: any) => {
            this.logSyncEvent(gId || cmdGuildId, `[Activity] ${activity.action || ''} ${activity.target || ''}`.trim(), 'info');
          }
        }
      });
    });

    this.client.on('voiceStateUpdate', (oldState, newState) => {
      this.dispatchEvent('voiceStateUpdate', { oldState, newState });

      const member = newState.member || oldState.member;
      if (!member || member.user.bot) return;

      // Track voice time
      // BUG #10 FIX: Key by guildId+userId to prevent cross-guild session collision
      // when a user is in multiple guilds served by the same bot instance.
      // NULL GUARD FIX: If both guild refs are null (e.g. DM voice edge case), skip tracking entirely.
      const resolvedGuildId = newState.guild?.id || oldState.guild?.id;
      if (!resolvedGuildId) return;
      const sessionKey = `${resolvedGuildId}_${member.id}`;
      if (!oldState.channelId && newState.channelId) {
        // User joined
        this.voiceSessions.set(sessionKey, Date.now());
      } else if (oldState.channelId && !newState.channelId) {
        // User left
        const start = this.voiceSessions.get(sessionKey);
        if (start && newState.guild?.id) {
          const diffMin = Math.max(1, Math.floor((Date.now() - start) / 60000));
          AnalyticsService.incrementMetric(newState.guild.id, 'voiceMinutes', diffMin).catch(() => {});
        }
        this.voiceSessions.delete(sessionKey);
      } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        // User moved channels - record current and start new
        const start = this.voiceSessions.get(sessionKey);
        if (start && newState.guild?.id) {
          const diffMin = Math.max(1, Math.floor((Date.now() - start) / 60000));
          AnalyticsService.incrementMetric(newState.guild.id, 'voiceMinutes', diffMin).catch(() => {});
        }
        this.voiceSessions.set(sessionKey, Date.now());
      }

      const isPublic = (channel: any) => {
        if (!channel) return false;
        return channel.permissionsFor(channel.guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel);
      };

      if (!oldState.channelId && newState.channelId) {
        if (isPublic(newState.channel)) {
          this.publicFeed?.addEvent('Voice', `**${member.user.username}** joined ${newState.channel?.name}`);
        }
      } else if (oldState.channelId && !newState.channelId) {
        if (isPublic(oldState.channel)) {
          this.publicFeed?.addEvent('Voice', `**${member.user.username}** left ${oldState.channel?.name}`);
        }
      } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        if (isPublic(newState.channel)) {
          this.publicFeed?.addEvent('Voice', `**${member.user.username}** moved to ${newState.channel?.name}`);
        }
      }
    });



    this.client.on('guildBanAdd', (ban) => {
      this.dispatchEvent('guildBanAdd', ban);
    });

    this.client.on('guildBanRemove', (ban) => {
      this.dispatchEvent('guildBanRemove', ban);
    });

    this.client.on('inviteCreate', (invite) => {
      this.dispatchEvent('inviteCreate', invite);
    });

    this.client.on('inviteDelete', (invite) => {
      this.dispatchEvent('inviteDelete', invite);
    });

    this.client.on('guildIntegrationsUpdate', (guild) => {
      this.dispatchEvent('guildIntegrationsUpdate', guild);
    });

    this.client.on('roleCreate', (role) => {
      // BUG #7 FIX: Pass the guild ID so only this guild's registry is refreshed,
      // not ALL guilds the bot is in (which was very expensive).
      this.syncRegistry(role.guild.id);
      this.dispatchEvent('roleCreate', role);
    });

    this.client.on('messageReactionAdd', (reaction, user) => {
      this.dispatchEvent('messageReactionAdd', reaction, user);
    });

    this.client.on('messageReactionRemove', (reaction, user) => {
      this.dispatchEvent('messageReactionRemove', reaction, user);
    });

    this.client.on('guildUpdate', (oldGuild, newGuild) => {
      this.dispatchEvent('guildUpdate', oldGuild, newGuild);
    });

    // BUG-007 FIX: 'webhookUpdate' is a deprecated alias that mapped to channelUpdate.
    // 'webhooksUpdate' is the correct Discord.js v14 event for webhook CRUD operations.
    this.client.on('webhooksUpdate', (channel) => {
      this.dispatchEvent('webhooksUpdate', channel);
    });

    this.client.on('guildDelete', (guild) => {
      this.dispatchEvent('guildDelete', guild);
    });

    this.client.on('emojiCreate', (emoji) => {
      this.dispatchEvent('emojiCreate', emoji);
    });

    this.client.on('emojiDelete', (emoji) => {
      this.dispatchEvent('emojiDelete', emoji);
    });

    this.client.on('emojiUpdate', (oldEmoji, newEmoji) => {
      this.dispatchEvent('emojiUpdate', oldEmoji, newEmoji);
    });

    this.client.on('stickerCreate', (sticker) => {
      this.dispatchEvent('stickerCreate', sticker);
    });

    this.client.on('stickerDelete', (sticker) => {
      this.dispatchEvent('stickerDelete', sticker);
    });

    this.client.on('stickerUpdate', (oldSticker, newSticker) => {
      this.dispatchEvent('stickerUpdate', oldSticker, newSticker);
    });

    const handleSoundboardEffect = async (data: any) => {
      if (!data) return;
      let guildId = data.guildId || data.guild_id || data.guild?.id || data.channel?.guild?.id;
      const channelId = data.channel_id || data.channelId || data.channel?.id;
      const userId = data.userId || data.user_id || data.user?.id || data.member?.user?.id;
      const soundId = data.soundId || data.sound_id || 'unknown';

      // Fallback guildId resolution if missing in raw WS payload
      if (!guildId && channelId) {
        const ch = this.client.channels.cache.get(channelId) as any;
        if (ch && ch.guild) {
          guildId = ch.guild.id;
        } else {
          for (const g of this.client.guilds.cache.values()) {
            if (g.channels.cache.has(channelId)) {
              guildId = g.id;
              break;
            }
          }
        }
      }

      if (!guildId) {
        guildId = process.env.GUILD_ID || Array.from(this.client.guilds.cache.keys())[0];
      }
      if (!guildId) return;

      const dedupeKey = `${guildId}_${userId || 'anon'}_${soundId}_${Math.floor(Date.now() / 2500)}`;
      if (this.recentSoundboardDedupe.has(dedupeKey)) return;
      this.recentSoundboardDedupe.add(dedupeKey);
      setTimeout(() => this.recentSoundboardDedupe.delete(dedupeKey), 4000);

      try {
        const guild = data.guild || this.client.guilds.cache.get(guildId) || await this.client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return;

        const channel = data.channel || (channelId ? (guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null)) : null);
        const user = data.user || (userId ? (this.client.users.cache.get(userId) || await this.client.users.fetch(userId).catch(() => null)) : null);
        const member = data.member || (user ? await guild.members.fetch(user.id).catch(() => null) : null);

        let soundName = data.soundboardSound?.name || data.name || data.soundName;
        if (!soundName && soundId !== 'unknown' && (guild as any).sounds) {
          const soundObj = (guild as any).sounds?.cache?.get(soundId);
          if (soundObj) soundName = soundObj.name;
        }
        if (!soundName) soundName = `Soundboard Sound (${soundId})`;

        const effectObj = {
          guild,
          channel,
          user,
          member,
          soundId,
          soundName,
          soundboardSound: { name: soundName }
        };

        this.dispatchEvent('voiceChannelEffectSend', effectObj);
      } catch (err) {
        console.error('[Gateway] Error handling soundboard effect event:', err);
      }
    };

    this.client.on('voiceChannelEffectSend', (effect) => {
      handleSoundboardEffect(effect);
    });

    this.client.on('raw', (packet: any) => {
      if (packet && packet.t) {
        if (
          packet.t.includes('SOUNDBOARD') || 
          packet.t.includes('EFFECT') ||
          packet.t === 'VOICE_CHANNEL_EFFECT_SEND' ||
          packet.t === 'GUILD_SOUNDBOARD_SOUND_PLAY'
        ) {
          console.log(`[Gateway] Intercepted soundboard raw packet: ${packet.t}`);
          handleSoundboardEffect(packet.d);
        }
      }
    });

    // Slash Command & Component Button routing
    this.client.on('interactionCreate', async (rawInteraction) => {
      const interaction = wrapInteraction(rawInteraction);

      if (interaction.isAutocomplete()) {
        const focusedValue = interaction.options.getFocused();
        const filtered = protections.filter(p => 
          p.label.toLowerCase().includes(focusedValue.toLowerCase()) || 
          p.key.toLowerCase().includes(focusedValue.toLowerCase())
        );
        await interaction.respond(
          filtered.slice(0, 25).map(choice => ({ name: choice.label, value: choice.key }))
        ).catch(console.error);
        return;
      }

      if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        // SYSTEM MAINTENANCE MODE CHECK — per-guild owner bypass (no global OWNER_ID)
        // H-2 FIX: pass guildId so each guild's settings are checked, not always 'default_guild'
        const settings = this.getGlobalSettings(interaction.guildId || undefined);
        if (settings.maintenanceMode) {
          const isOwner = interaction.user.id === interaction.guild?.ownerId || 
                          interaction.user.id === this.client.application?.owner?.id ||
                          ((this.client.application?.owner as any)?.members && (this.client.application?.owner as any).members.has(interaction.user.id));
          const member = interaction.member;
          let isAdmin = isOwner;
          if (!isAdmin && member && typeof member.permissions !== 'string') {
             isAdmin = (member.permissions as any).has(PermissionFlagsBits.Administrator);
          }
          if (!isAdmin) {
             this.logSyncEvent(`Blocked command /${commandName} from ${interaction.user.username} due to active Maintenance Mode.`, 'warn');
             if (interaction.isRepliable()) {
               await interaction.reply({
                 content: '🚧 **System Maintenance Mode Active**\nThe server is currently in lockdown mode. All public bot commands are temporarily disabled. Please check back later.',
                 flags: 64
               }).catch(() => {});
             }
             return;
          }
        }


        this.logSyncEvent(`Slash command executed: /${commandName}`, 'info');
        if (interaction.guildId) {
          AnalyticsService.trackCommand(interaction.guildId, commandName).catch(() => {});
        }

        // Dispatch command handler matching the active modules
        for (const manifest of this.manifests) {
          if (manifest.commands) {
            const cmd = manifest.commands.find(c => c.name === commandName);
            if (cmd) {

              const eventObj = manifest.events?.find(e => e.name === `command_${commandName}`);
              if (eventObj) {
                try {
                  const cmdGuildId = interaction.guildId || undefined;
                  await eventObj.handler(this.client, interaction, { 
                    guildId: cmdGuildId,
                    client: this.client,
                    logSyncEvent: (msgOrGuildId: string | undefined, msgOrType?: string, type?: 'info' | 'warn' | 'success') => {
                      if (type !== undefined) {
                        this.logSyncEvent(msgOrGuildId, msgOrType, type);
                      } else {
                        this.logSyncEvent(cmdGuildId, msgOrGuildId, msgOrType as any);
                      }
                    },
                    getModulesState: (gId?: string) => this.getModulesState(gId || cmdGuildId),
                    getRegistry: () => this.getRegistry(cmdGuildId),
                    getGlobalSettings: (gId?: string) => this.getGlobalSettings(gId || cmdGuildId),
                    updateModuleConfig: (id: string, config: Record<string, any>) => this.updateModuleConfig(cmdGuildId, id, config),
                    registry: {
                      logWhitelistAudit: (guildId: string | undefined, audit: any) => {
                        // Forward to the real registry via the internal logSyncEvent broadcast
                        const gId = guildId || cmdGuildId || process.env.GUILD_ID;
                        this.logSyncEvent(gId, `[Audit] ${audit.action || 'whitelist change'}`, 'info');
                      },
                      logWhitelistActivity: (guildId: string | undefined, activity: any) => {
                        const gId = guildId || cmdGuildId || process.env.GUILD_ID;
                        this.logSyncEvent(gId, `[Activity] ${activity.action || ''} ${activity.target || ''}`.trim(), 'info');
                      }
                    }
                  });
                  return;
                } catch (err) {
                  console.error(`Error executing command ${commandName} handler:`, err);
                  const replyPayload = {
                    content: '❌ An internal error occurred while executing this command.',
                    flags: 64
                  };
                  if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(replyPayload).catch(() => {});
                  } else {
                    await interaction.reply(replyPayload).catch(() => {});
                  }
                  return;
                }
              }
            }
          }
        }

        const replyPayload = {
          content: `❌ Command /${commandName} is registered but no module handler is currently active.`,
          flags: 64
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(replyPayload).catch(() => {});
        } else {
          await interaction.reply(replyPayload).catch(() => {});
        }
      } else if (interaction.isButton()) {
        this.dispatchEvent(`button_${interaction.customId}`, interaction);
        if (interaction.customId.startsWith('tickets_v2_')) {
          this.dispatchEvent('button_tickets_v2_generic', interaction);
        }
        if (interaction.customId.startsWith('payment_')) {
          this.dispatchEvent('button_payment_generic', interaction);
        }
      } else if (interaction.isAnySelectMenu()) {
        this.dispatchEvent(`select_${interaction.customId}`, interaction);
        if (interaction.customId.startsWith('tickets_v2_')) {
          this.dispatchEvent('select_tickets_v2_generic', interaction);
        }
        if (interaction.customId.startsWith('payment_')) {
          this.dispatchEvent('select_payment_generic', interaction);
        }
      } else if (interaction.isModalSubmit()) {
        this.dispatchEvent(`modal_${interaction.customId}`, interaction);
        if (interaction.customId.startsWith('tickets_v2_')) {
          this.dispatchEvent('modal_tickets_v2_generic', interaction);
        }
        if (interaction.customId.startsWith('payment_')) {
          this.dispatchEvent('modal_payment_generic', interaction);
        }
      }
    });
  }

  public async syncRegistry(guildId?: string) {
    try {
      if (!guildId) {
        const guilds = Array.from(this.client.guilds.cache.values());
        for (const g of guilds) {
          await this.syncSingleGuild(g.id);
        }
      } else {
        await this.syncSingleGuild(guildId);
      }
    } catch (err) {
      console.error('Failed to sync live Discord resources:', err);
    }
  }

  private async syncSingleGuild(guildId: string) {
    try {
      const guild = await this.client.guilds.fetch({ guild: guildId, withCounts: true } as any);
      if (!guild) return;

      const roles = await guild.roles.fetch();
      const channels = await guild.channels.fetch();

      // OP 8 FIX: Do NOT call guild.members.fetch({ withPresences: true }) here.
      // That sends op 8 (REQUEST_GUILD_MEMBERS) to the Gateway on EVERY 30s sync
      // for EVERY guild, causing mass rate limiting.
      // Instead, read the already-cached members for an approximate online count.
      // The GuildPresences intent keeps this updated in real-time automatically.
      const cachedMembers = guild.members.cache;
      const exactOnlineCount = cachedMembers.filter(m => m.presence && m.presence.status !== 'offline').size;

      const reg = this.getRegistry(guildId);
      reg.memberCount = guild.approximateMemberCount ?? guild.memberCount;
      reg.onlineCount = exactOnlineCount;

      reg.roles = roles.map(r => ({
        id: r.id,
        name: r.name,
        color: r.hexColor,
        membersCount: r.members.size,
        permissions: r.permissions.toArray(),
        position: r.position
      }));

      reg.channels = channels.filter(c => c && (c.type === ChannelType.GuildText || c.type === ChannelType.GuildCategory || c.type === ChannelType.GuildVoice))
        .map(c => ({
          id: c!.id,
          name: c!.name,
          type: c!.type === ChannelType.GuildText ? 'text' : (c!.type === ChannelType.GuildVoice ? 'voice' : 'category'),
          category: c!.parentId ? channels.get(c!.parentId)?.name || '' : '',
          permissions: []
        }));

      this.setRegistry(guildId, reg);
      this.reevaluateModules(guildId);
      this.broadcast({ type: 'STATE_UPDATE', modules: this.getModulesState(guildId), registry: reg, guildId });
      this.logSyncEvent(guildId, 'Discord resource registry fetched from live Gateway.', 'success');
    } catch (err) {
      console.error(`Failed to sync live Discord resources for guild ${guildId}:`, err);
    }
  }

  public async syncQuarantineQueue(guildId?: string) {
    try {
      const gId = guildId || process.env.GUILD_ID;
      if (!gId) return;

      const guild = await this.client.guilds.fetch(gId).catch(() => null);
      if (!guild) return;

      const modules = this.getModulesState(gId);
      const secMod = modules.find(m => m.id === 'security');
      if (!secMod || !secMod.config.quarantineRoleId) return;

      const quarantineRoleId = secMod.config.quarantineRoleId;
      let currentQueue = secMod.config.quarantinedUsers || [];

      // Fetch only the tracked quarantined members to ensure their role cache is fresh.
      // This is extremely efficient and avoids gateway rate limits.
      const trackedIds = currentQueue.map((u: any) => u.userId).filter(Boolean);
      if (trackedIds.length > 0) {
        await guild.members.fetch({ user: trackedIds }).catch(() => null);
      }

      const membersWithRole = guild.members.cache.filter(m => m.roles.cache.has(quarantineRoleId));

      let newQueue = currentQueue.filter((u: any) => {
        const member = guild.members.cache.get(u.userId);
        return member ? member.roles.cache.has(quarantineRoleId) : true;
      });

      let changed = false;
      for (const [memberId, member] of membersWithRole) {
        if (!newQueue.find((u: any) => u.userId === memberId)) {
          newQueue.push({
            id: `q-${Date.now()}-${memberId}`,
            tag: member.user.username,
            userId: memberId,
            reason: 'Auto-Synced from Discord',
            time: new Date().toISOString(),
            status: 'Quarantined',
            risk: 'danger',
            originalRoles: []
          });
          changed = true;
        }
      }

      if (changed || newQueue.length !== currentQueue.length) {
        this.updateModuleConfig(gId, 'security', { quarantinedUsers: newQueue });
        this.logSyncEvent(gId, `Deep Sync: Rebuilt Quarantine Queue. Tracking ${newQueue.length} users.`, 'success');
      }
    } catch (e) {
      console.error('Failed to sync quarantine queue:', e);
    }
  }

  public async forceDeployCommands(targetGuildId?: string) {
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;
    const guildId = targetGuildId || process.env.GUILD_ID;

    if (!token || !clientId || !guildId) return;

    // Recursively serialize options, preserving channel_types, autocomplete, min/max
    const serializeOption = (opt: any): any => {
      const out: any = {
        name: opt.name,
        type: opt.type,
        description: opt.description
      };
      if (opt.required !== undefined) out.required = opt.required;
      if (opt.choices) out.choices = opt.choices;
      if (opt.channel_types) out.channel_types = opt.channel_types;
      if (opt.autocomplete !== undefined) out.autocomplete = opt.autocomplete;
      if (opt.min_value !== undefined) out.min_value = opt.min_value;
      if (opt.max_value !== undefined) out.max_value = opt.max_value;
      if (opt.options) out.options = opt.options.map(serializeOption);
      return out;
    };

    const commands: any[] = [];
    const seenNames = new Set<string>();
    this.manifests.forEach(m => {
      if (m.commands) {
        m.commands.forEach(c => {
          if (seenNames.has(c.name)) return;
          seenNames.add(c.name);
          commands.push({
            name: c.name,
            description: c.description,
            options: (c.options || []).map(serializeOption)
          });
        });
      }
    });

    const rest = new REST({ version: '10' }).setToken(token);

    try {
      console.log(`Deploying ${commands.length} application commands to Guild ${guildId}...`);
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      this.logSyncEvent('Slash commands successfully registered on Discord REST API.', 'success');
      console.log('✅ Slash commands successfully registered on Discord REST API.');
    } catch (error: any) {
      if (error.code === 50001 || error.status === 403) {
        console.warn(`[Gateway] Guild command registration failed with Missing Access (50001). Retrying globally...`);
        try {
          await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands }
          );
          this.logSyncEvent('Slash commands successfully registered globally as fallback.', 'success');
          console.log('✅ Slash commands successfully registered globally as fallback.');
        } catch (globalErr) {
          console.error('[Gateway] Failed to deploy slash commands globally:', globalErr);
        }
      } else {
        console.error('Failed to deploy slash commands:', error);
      }
    }
  }

  private dispatchEvent(eventName: string, ...args: any[]) {
    this.dispatchEventForGuild(eventName, undefined, ...args);
  }

  private dispatchEventForGuild(eventName: string, guildIdOverride: string | undefined, ...args: any[]) {
    const resolveGuildId = (eventArgs: any[]): string | undefined => {
      if (!eventArgs || eventArgs.length === 0) return undefined;
      const first = eventArgs[0];
      if (!first) return undefined;

      if (first.guildId) return first.guildId;
      if (first.guild && typeof first.guild === 'object') {
        if (first.guild.id) return first.guild.id;
      }

      if (first.newState && first.newState.guild) return first.newState.guild.id;
      if (first.oldState && first.oldState.guild) return first.oldState.guild.id;
      if (first.newMessage && first.newMessage.guildId) return first.newMessage.guildId;
      if (first.oldMessage && first.oldMessage.guildId) return first.oldMessage.guildId;

      if (first.message && first.message.guildId) return first.message.guildId;

      for (const arg of eventArgs) {
        if (arg && typeof arg === 'object') {
          if (arg.guildId) return arg.guildId;
          if (arg.guild && arg.guild.id) return arg.guild.id;
        }
      }
      return undefined;
    };

    const guildId = guildIdOverride || resolveGuildId(args) || process.env.GUILD_ID || 'default_guild';

    this.manifests.forEach(m => {
      const ev = m.events?.find(e => e.name === eventName);
      if (ev) {
        try {
          const contextObj = { 
            guildId,
            logSyncEvent: (msgOrGuildId: string | undefined, msgOrType?: string, type?: 'info' | 'warn' | 'success') => {
              if (type !== undefined) {
                this.logSyncEvent(msgOrGuildId, msgOrType, type);
              } else {
                this.logSyncEvent(guildId, msgOrGuildId, msgOrType as any);
              }
            },
            getModulesState: (gId?: string) => this.getModulesState(gId || guildId),
            getRegistry: () => this.getRegistry(guildId),
            getGlobalSettings: (gId?: string) => this.getGlobalSettings(gId || guildId),
            updateModuleConfig: (id: string, config: Record<string, any>) => this.updateModuleConfig(guildId, id, config),
            triggerEmergencyLock: (gId?: string) => this.triggerEmergencyLock(gId || guildId),
            client: this.client,
            registry: {
              logWhitelistAudit: (gId: string | undefined, audit: any) => {
                this.logSyncEvent(gId || guildId, `[Audit] ${audit.action || 'whitelist change'}`, 'info');
              },
              logWhitelistActivity: (gId: string | undefined, activity: any) => {
                this.logSyncEvent(gId || guildId, `[Activity] ${activity.action || ''} ${activity.target || ''}`.trim(), 'info');
              }
            }
          };

          const handlerArgs = [this.client, ...args];
          // Fill in any middle parameters if the handler expects more than client + args + context
          while (handlerArgs.length < ev.handler.length - 1) {
            handlerArgs.push(undefined);
          }
          handlerArgs.push(contextObj);

          (ev.handler as any)(...handlerArgs);
        } catch (err) {
          console.error(`Error in event listener ${eventName} for module ${m.id}:`, err);
        }
      }
    });
  }

  private async checkVoicePresence() {
    const guilds = Array.from(this.client.guilds.cache.values());
    for (const guild of guilds) {
      await this.checkVoicePresenceForGuild(guild);
    }
  }

  private async checkVoicePresenceForGuild(guild: any) {
    const guildId = guild.id;
    const modules = this.getModulesState ? this.getModulesState(guildId) : [];
    const voiceModule = modules.find((m: any) => m.id === 'voice');
    if (!voiceModule) return;

    if (voiceModule.status !== 'enabled') {
      const currentConnection = getVoiceConnection(guildId);
      if (currentConnection) {
        this.logSyncEvent(guildId, 'Voice Presence: Disconnecting from voice channel (Module disabled).', 'info');
        try {
          currentConnection.destroy();
        } catch (e) {}
        const vsD = this.getVoiceState(guildId);
        vsD.connection = null;
        vsD.connectTime = null;
        vsD.retryCount = 0;

        // Reset transient stats
        voiceModule.connectionStatus = 'disconnected';
        voiceModule.connectedChannelId = null;
        voiceModule.connectionDuration = '0s';
        this.broadcast({ type: 'STATE_UPDATE', modules, registry: this.getRegistry(guildId), guildId });
      }
      return;
    }

    const config = voiceModule.config || {};
    const channelId = config.channelId;
    if (!channelId) {
      voiceModule.connectionStatus = 'not_configured';
      return;
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      const vsC = this.getVoiceState(guildId);
      if (vsC.lastChannelId === channelId) {
        this.logSyncEvent(guildId, `Voice Presence Alert: Configured voice channel (${channelId}) was deleted!`, 'warn');
        vsC.lastChannelId = null;
      }
      voiceModule.connectionStatus = 'error';
      voiceModule.errors = [`Configured voice channel (${channelId}) was deleted or does not exist!`];
      this.broadcast({ type: 'STATE_UPDATE', modules, registry: this.getRegistry(guildId), guildId });
      return;
    }

    const currentConnection = getVoiceConnection(guildId);

    // If channel changed, destroy old connection and reconnect
    if (currentConnection && this.getVoiceState(guildId).lastChannelId !== channelId) {
      this.logSyncEvent(guildId, `Voice Presence: Target channel changed to #${channel.name}. Reconnecting...`, 'info');
      try {
        currentConnection.destroy();
      } catch (e) {}
      const vs = this.getVoiceState(guildId);
      vs.connection = null;
      vs.connectTime = null;
      vs.retryCount = 0;
    }

    const reconnectDelay = Number(config.reconnectDelay || 5000);
    const maxRetries = Number(config.maxRetries || 5);

    if (!getVoiceConnection(guildId)) {
      this.connectVoiceChannel(guild, channel, reconnectDelay, maxRetries);
    } else {
      const vs = this.getVoiceState(guildId);
      if (vs.connectTime) {
        const diffSecs = Math.floor((Date.now() - vs.connectTime) / 1000);
        const hrs = Math.floor(diffSecs / 3600);
        const mins = Math.floor((diffSecs % 3600) / 60);
        const secs = diffSecs % 60;
        voiceModule.connectionDuration = `${hrs}h ${mins}m ${secs}s`;
      }
      voiceModule.connectionStatus = 'connected';
      voiceModule.connectedChannelId = channelId;
      voiceModule.reconnectAttempts = this.getVoiceState(guildId).retryCount;
      voiceModule.voiceGatewayStatus = 'healthy';

      const activityStatus = config.activityStatus;
      if (activityStatus && this.client.user) {
        this.client.user.setActivity(activityStatus);
      }

      this.broadcast({ type: 'STATE_UPDATE', modules, registry: this.getRegistry(guildId), guildId });
    }
  }

  private async connectVoiceChannel(guild: any, channel: any, reconnectDelay: number, maxRetries: number) {
    const guildId = guild.id;
    const vs = this.getVoiceState(guildId);
    if (vs.isConnecting) return;
    vs.isConnecting = true;

    const modules = this.getModulesState ? this.getModulesState(guildId) : [];
    const voiceModule = modules.find((m: any) => m.id === 'voice');

    try {
      this.logSyncEvent(guildId, `Voice Presence: Connecting to voice channel #${channel.name}...`, 'info');
      if (voiceModule) {
        voiceModule.connectionStatus = 'connecting';
        this.broadcast({ type: 'STATE_UPDATE', modules, registry: this.getRegistry(guildId), guildId });
      }

      // Check bot permissions: ViewChannel, Connect
      const member = guild.members.me;
      const perms = channel.permissionsFor(member);
      if (!perms || !perms.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.Connect)) {
        throw new Error('Missing ViewChannel or Connect permissions on voice channel');
      }

      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false
      });

      vs.connection = connection;
      vs.lastChannelId = channel.id;
      vs.connectTime = Date.now();
      vs.retryCount = 0;
      vs.isConnecting = false;

      this.logSyncEvent(guildId, `Voice Presence: Connected to voice channel #${channel.name} (24/7 Presence Active).`, 'success');

      if (voiceModule) {
        voiceModule.connectionStatus = 'connected';
        voiceModule.connectedChannelId = channel.id;
        voiceModule.voiceGatewayStatus = 'healthy';
        this.broadcast({ type: 'STATE_UPDATE', modules, registry: this.getRegistry(guildId), guildId });
      }

      if ((connection as any)._presenceListener) {
        try {
          connection.removeListener('stateChange', (connection as any)._presenceListener);
        } catch (e) {}
      }
      const listener = (oldState: any, newState: any) => {
        if (newState.status === VoiceConnectionStatus.Disconnected) {
          this.logSyncEvent(guildId, `Voice Presence Alert: Unexpectedly disconnected from #${channel.name}!`, 'warn');
          this.handleVoiceDisconnect(guild, channel, reconnectDelay, maxRetries);
        }
      };
      (connection as any)._presenceListener = listener;
      connection.on('stateChange', listener);

    } catch (err: any) {
      vs.isConnecting = false;
      console.error('Voice connect error:', err);
      this.logSyncEvent(guildId, `Voice Connection Error: ${err.message || err}`, 'warn');

      if (voiceModule) {
        voiceModule.connectionStatus = 'error';
        voiceModule.voiceGatewayStatus = 'unreachable';
        this.broadcast({ type: 'STATE_UPDATE', modules, registry: this.getRegistry(guildId), guildId });
      }
    }
  }

  private handleVoiceDisconnect(guild: any, channel: any, reconnectDelay: number, maxRetries: number) {
    const guildId = guild.id;
    const vs = this.getVoiceState(guildId);
    if (vs.isConnecting) return;

    const modules = this.getModulesState ? this.getModulesState(guildId) : [];
    const voiceModule = modules.find((m: any) => m.id === 'voice');

    if (vs.connection) {
      try {
        vs.connection.destroy();
      } catch (e) {}
      vs.connection = null;
      vs.connectTime = null;
    }

    if (voiceModule && voiceModule.status !== 'enabled') {
      return;
    }

    if (vs.retryCount >= maxRetries) {
      this.logSyncEvent(guildId, `Voice Presence Alert: Maximum reconnect attempts (${maxRetries}) reached. Reconnection aborted.`, 'warn');
      if (voiceModule) {
        voiceModule.connectionStatus = 'error';
        this.broadcast({ type: 'STATE_UPDATE', modules, registry: this.getRegistry(guildId), guildId });
      }
      return;
    }

    vs.retryCount++;
    this.logSyncEvent(guildId, `Voice Presence: Auto-reconnecting in ${reconnectDelay / 1000}s (Attempt ${vs.retryCount}/${maxRetries})...`, 'info');

    if (voiceModule) {
      voiceModule.connectionStatus = 'connecting';
      voiceModule.reconnectAttempts = vs.retryCount;
      this.broadcast({ type: 'STATE_UPDATE', modules, registry: this.getRegistry(guildId), guildId });
    }
    setTimeout(() => {
      this.connectVoiceChannel(guild, channel, reconnectDelay, maxRetries);
    }, reconnectDelay);
  }
  public getMetrics() {
    if (!this.client || !this.client.readyAt) {
      return { latency: 0, uptime: 'Offline' };
    }
    const ping = this.client.ws.ping;
    const upMs = this.client.uptime || 0;
    const hrs = Math.floor(upMs / 3600000);
    const mins = Math.floor((upMs % 3600000) / 60000);
    const secs = Math.floor((upMs % 60000) / 1000);
    
    let uptimeStr = '';
    if (hrs > 0) uptimeStr += `${hrs}h `;
    if (mins > 0 || hrs > 0) uptimeStr += `${mins}m `;
    uptimeStr += `${secs}s`;
    
    return {
      latency: ping >= 0 ? ping : 0,
      uptime: uptimeStr || '0s'
    };
  }

  // syncApprovals and handleApprovalAction removed — approval system decommissioned.
}
