import { Client, GatewayIntentBits, REST, Routes, PermissionFlagsBits, ChannelType, Events, MessageFlags, Options, ActivityType } from 'discord.js';
import { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus } from '@discordjs/voice';
import { DiscordResourceRegistry, ModuleManifest, ModuleState } from './types.js';
import { Database } from './Database.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Embeds, Colors, Components, buildRichCard, buildStatusCard, buildLimeOverviewCard, VERIFIED_ICON, WRONG_ICON, SHIELD_ICON, CONFIG_ICON, BOT_ICON, LINK_ICON, MEMBER_ICON, TIMER_ICON } from './UIFactory.js';
import type { PublicFeedManager } from './PublicFeedManager.js';
import { AnalyticsService } from './AnalyticsService.js';
import { protections, isOwnerOrExtraOwner } from '../utils/whitelistCheck.js';
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
import { InteractionRouter } from './InteractionRouter.js';
import { PayloadFormatter } from './PayloadFormatter.js';
import { BrainEventInterceptor } from '../brain/BrainEventInterceptor.js';
import { OAuthService } from './OAuthService.js';
import { ensureAntiNukeBackupRoles } from '../modules/security/enable.js';

/**
 * transformContentToLimeCard — now a thin passthrough to PayloadFormatter.normalize().
 * All formatting logic lives in PayloadFormatter (single source of truth).
 */
function transformContentToLimeCard(options: any, user: any) {
  return PayloadFormatter.normalize(options, user);
}

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
    interaction.deferReply = async function (options?: any) {
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
    interaction.reply = async function (options?: any) {
      options = transformContentToLimeCard(options, interaction.user);
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
    interaction.editReply = async function (options?: any) {
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
    interaction.followUp = async function (options?: any) {
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
    interaction.update = async function (options?: any) {
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
  private router!: InteractionRouter;

  // Per-guild voice tracking for 24/7 Voice Presence module
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
      ],
      sweepers: {
        ...Options.DefaultSweeperSettings,
        guildMembers: {
          interval: 900, // Sweep inactive offline members every 15 minutes (900 seconds)
          filter: () => (member) => {
            // Preserve primary server owner, bot itself, and members active in voice
            if (member.id === member.guild?.ownerId) return false;
            if (member.id === member.client?.user?.id) return false;
            if (member.voice?.channelId) return false;
            return true; // Prune inactive member object to conserve RAM heap
          }
        }
      }
    });

    this.setupListeners();
  }

  public registerModuleManifests(manifests: ModuleManifest[]) {
    this.manifests = manifests;
    if (this.router) {
      this.router.updateManifests(manifests);
    }
    PrefixRegistry.initialize(manifests);

    console.log(`[Gateway] ═══════════════════════════════════════`);
    console.log(`[Gateway] InteractionRouter active routes: slash, button, selectMenu, modal, autocomplete, help`);
    console.log(`[Gateway] Pipeline middleware stack: permissions → cooldown → moduleGuard → analytics → executor`);
    console.log(`[Gateway] Duplicate command warnings: ${PrefixRegistry.getDuplicateWarnings()}`);
    console.log(`[Gateway] ═══════════════════════════════════════`);
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

      // ── Rage Brain: guaranteed bot user ID available here ──────────────────
      // Init is idempotent — calling twice is safe (init guards with _initialized flag)
      BrainEventInterceptor.init(this.client.user?.id ?? 'unknown');

      await PrefixResolver.loadAllPrefixes().catch(console.error);
      await this.client.application?.fetch().catch(() => null);
      this.syncRegistry();

      // Set Rich Activity Status
      const updateActivity = () => {
        if (!this.client.user) return;
        const totalGuilds = this.client.guilds.cache.size;
        const totalUsers = this.client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);

        const activities = [
          { name: `Fu4king Nukers | r!help`, type: ActivityType.Custom },
          { name: `Securing ${totalGuilds} Servers | r!config`, type: ActivityType.Watching },
          { name: `Protecting ${totalUsers.toLocaleString()} Members`, type: ActivityType.Competing },
          { name: `r!help | /config`, type: ActivityType.Listening }
        ];

        const selected = activities[Math.floor(Math.random() * activities.length)];
        this.client.user.setPresence({
          activities: [selected],
          status: 'online'
        });
      };

      updateActivity();
      setInterval(updateActivity, 30000);

      // Deploy commands globally across all servers on startup.
      await this.forceDeployCommands().catch((err) => {
        console.error('[Gateway] Global startup deploy failed:', err);
      });

      const readyGuildIds = Array.from(this.client.guilds.cache.keys());
      for (const gId of readyGuildIds) {
        const g = this.client.guilds.cache.get(gId);
        if (g) {
          ensureAntiNukeBackupRoles(g).catch(() => {});
        }
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

      // Broadcast real-time update to web dashboard
      this.broadcast({
        type: 'GUILD_JOINED',
        guildId: guild.id,
        guildName: guild.name
      });

      // Synchronize SQLite approvals table if record exists
      try {
        const db = Database.getDb();
        if (db) {
          await db.run('UPDATE approvals set status = ? WHERE guildId = ?', ['Approved', guild.id]);
        }
      } catch (e) { }

      // Send welcome message to server owner (DM) and guild channel
      try {
        const musicClientId = process.env.MUSIC_CLIENT_ID || '1520323151928623125';
        const musicPerms = process.env.MUSIC_BOT_PERMISSIONS || '36700160';
        const musicInviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${musicClientId}&permissions=${musicPerms}&scope=bot%20applications.commands&guild_id=${guild.id}`;

        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel('Add Rage Music Bot')
            .setStyle(ButtonStyle.Link)
            .setURL(musicInviteUrl),
          new ButtonBuilder()
            .setLabel('Support Server')
            .setStyle(ButtonStyle.Link)
            .setURL('https://discord.gg/mK8HVJGzYt')
        );

        const welcomeEmbed = buildLimeOverviewCard({
          title: 'WELCOME TO RAGE OPTIMISER ENTERPRISE',
          subtitle: `EXECUTIVE SECURITY & MANAGEMENT GUIDE FOR ${guild.name.toUpperCase()}`,
          color: Colors.BRAND,
          thumbnail: guild.iconURL({ size: 256 }) || undefined,
          sections: [
            {
              title: `⚡ QUICK ACTIVATION & MODULE CONTROLS (OFF BY DEFAULT)`,
              items: [
                'For maximum setup safety, **all protection modules start OFF by default** in new servers.',
                'Use the commands below to turn on security modules with optimal default values:',
                '',
                '• `r!enable antinuke` — Enable all Anti-Nuke, Anti-Bot & Protection modules',
                '• `r!enable automod` — Enable Anti-Link, Anti-Spam & Chat Filters',
                '• `r!enable voice` — Enable Voice Safeguards & Join-To-Create',
                '• `r!enable all` — Enable complete enterprise security suite instantly',
                '• `r!config` or `/config` — Access full interactive server dashboard'
              ]
            },
            {
              title: `${SHIELD_ICON} CONFIDENTIAL SECURITY ENGINE: PREBOT WHITELIST & 2FA`,
              items: [
                'Rage Optimiser features an unbypassable **PreBot Whitelist & 2FA Suite** to pre-approve trusted bots with custom role profiles upon join and block unauthorized bots.',
                '',
                '**Confidential Owner Commands (Hidden from public slash & help menus)**:',
                '• `r!prebot add <bot_id | @bot>` — Pre-approve & configure permission profile',
                '• `r!prebot quickadd <bot_id | @bot>` — Quick add with standard permissions',
                '• `r!prebot 2fa setup` — Setup Google Authenticator 2FA (Owner Only)',
                '• `r!prebot 2fa confirm <code>` — Confirm & activate 2FA protection',
                '• `r!prebot 2fa status` — Check live 2FA enforcement status',
                '• `r!prebot 2fa disable <code>` — Disable 2FA enforcement',
                '• `r!prebot remove <bot_id | @bot>` — Revoke bot whitelist entry',
                '• `r!prebot list` — View approved bot registry',
                '• `r!extraowner add <@user>` — Delegate owner clearance to trusted team members',
                '',
                '*Keep these commands confidential to maintain maximum server security.*'
              ]
            },
            {
              title: `${LINK_ICON} ADD RAGE MUSIC BOT (OPTIONAL)`,
              items: [
                'Music streaming and voice features run on a **dedicated high-performance audio engine**.',
                `[${VERIFIED_ICON} Click Here to Invite Rage Music to ${guild.name}](${musicInviteUrl})`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Server Owner Security Clearance'
        });

        // 1. Direct Message to Server Owner
        const owner = await guild.fetchOwner().catch(() => null);
        if (owner) {
          await owner.user.send({ embeds: [welcomeEmbed], components: [actionRow] }).catch(() => { });
        }

        // 2. Channel Message to Guild System Channel or first sendable text channel
        const systemChan = guild.systemChannel || guild.channels.cache.find(
          (c: any) => c.isTextBased() && c.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages)
        );
        if (systemChan) {
          const channelEmbed = buildLimeOverviewCard({
            title: 'RAGE OPTIMISER ENTERPRISE • BOT INITIALIZATION',
            subtitle: `UNBYPASSABLE PROTECTION & MANAGEMENT ENGINE FOR ${guild.name.toUpperCase()}`,
            color: Colors.BRAND,
            thumbnail: guild.iconURL({ size: 256 }) || undefined,
            sections: [
              {
                title: `${SHIELD_ICON} INITIAL STATE: OFF BY DEFAULT`,
                items: [
                  'Protection modules start **OFF** for seamless server setup.'
                ]
              },
              {
                title: `⚡ ONE-CLICK ACTIVATION COMMANDS`,
                items: [
                  '• `r!enable antinuke` — Activate all Anti-Nuke protections with standard limits',
                  '• `r!enable automod` — Activate Anti-Link & Anti-Spam filters',
                  '• `r!enable all` — Activate full enterprise protection suite',
                  '• `r!config` or `/config` — Open interactive server control dashboard'
                ]
              },
              {
                title: `${LINK_ICON} RAGE MUSIC BOT INTEGRATION`,
                items: [
                  `High-performance audio streaming is available via **Rage Music Bot**.\n[${VERIFIED_ICON} Click Here to Add Rage Music](${musicInviteUrl})`
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • System Initialized'
          });

          await (systemChan as any).send({ embeds: [channelEmbed], components: [actionRow] }).catch(() => { });
        }
      } catch (e) {
        console.error('[Gateway] Error handling guildCreate welcome onboarding:', e);
      }
    });

    this.client.on('guildDelete', async (guild) => {
      this.logSyncEvent(guild.id, `CRITICAL ALERT: Bot was removed/kicked from server "${guild.name}" (${guild.id}).`, 'warn');
      this.broadcast({ type: 'GUILD_REMOVED', guildId: guild.id, guildName: guild.name });

      try {
        const reinviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${this.client.user?.id}&permissions=8&scope=bot%20applications.commands&guild_id=${guild.id}`;
        const owner = await this.client.users.fetch(guild.ownerId).catch(() => null);
        if (owner) {
          const alertEmbed = buildLimeOverviewCard({
            title: 'ALERT • BOT REMOVED FROM SERVER',
            subtitle: `SECURITY INCIDENT IN ${guild.name.toUpperCase()}`,
            color: Colors.DANGER,
            sections: [
              {
                title: '<:shield:1532403012751065179> BOT REMOVAL DETECTED',
                items: [
                  `Rage Optimiser was removed from **${guild.name}**.`,
                  `If this kick was unauthorized or an anti-nuke attack, click below to re-authorize the bot instantly.`
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Security Auto-Recovery'
          });

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setLabel('Re-Authorize Bot Now').setStyle(ButtonStyle.Link).setURL(reinviteUrl)
          );

          await owner.send({ embeds: [alertEmbed], components: [row] }).catch(() => { });
        }

        // Trigger OAuth2 silent user auto-rejoin using stored access tokens with guilds.join scope
        const result = await OAuthService.attemptAutoRejoinForGuild(guild.id);
        if (result.attempted > 0) {
          this.logSyncEvent(guild.id, `OAuth Auto-Rejoin Engine: Processed ${result.attempted} members, restored ${result.joined}.`, 'info');
        }
      } catch (e) {
        console.error('[Gateway] Error handling guildDelete recovery:', e);
      }
    });

    this.client.on('roleCreate', (role) => {
      const guildId = role.guild.id;
      this.syncRegistry(guildId);
      this.dispatchEvent('roleCreate', role);
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
      AnalyticsService.incrementMetric(guildId, 'joins').catch(() => { });
    });

    this.client.on('guildMemberRemove', (member) => {
      const guildId = member.guild.id;
      this.logSyncEvent(guildId, `Discord Event: User "${member.user.username}" left guild.`, 'info');
      this.syncRegistry(guildId);
      this.dispatchEvent('guildMemberRemove', member);
      this.publicFeed?.addEvent('Members', `**${member.user.username}** left the server`);
      AnalyticsService.incrementMetric(guildId, 'leaves').catch(() => { });
    });

    this.client.on('messageDelete', (message) => {
      this.dispatchEvent('messageDelete', message);
    });

    this.client.on('messageUpdate', (oldMessage, newMessage) => {
      this.dispatchEvent('messageUpdate', { oldMessage, newMessage });
    });

    // ── Single interactionCreate listener via InteractionRouter ─────────────
    // All interaction types (slash, button, selectMenu, modal, autocomplete, help)
    // are routed through InteractionRouter.route() — no double-dispatch, no race conditions.
    this.router = new InteractionRouter({
      dispatchEvent: (name: string, ...args: any[]) => this.dispatchEvent(name, ...args),
      wrapInteraction: (i: any) => wrapInteraction(i),
      manifests: this.manifests,
      getManifests: () => this.manifests,
      logSyncEvent: (msg: string, type?: 'info' | 'warn' | 'success') => this.logSyncEvent(msg, type || 'info'),
      getModulesState: (gId?: string) => this.getModulesState(gId),
      getRegistry: (gId?: string) => this.getRegistry(gId),
      getGlobalSettings: (gId?: string) => this.getGlobalSettings(gId),
      updateModuleConfig: (gId: string | undefined, id: string, config: Record<string, any>) => this.updateModuleConfig(gId, id, config),
    });
    this.client.on('interactionCreate', (raw) => this.router.route(raw));

    this.client.on('messageCreate', async (message) => {
      if (!message.author || message.author.bot) return;

      console.log(`[Gateway] Received message in #${(message.channel as any)?.name || message.channelId}: "${message.content}" (length: ${message.content?.length || 0}) from ${message.author.username}`);

      if (message.content !== undefined && message.content.length === 0) {
        console.warn(`⚠️ [Gateway Warning]: Message content received is EMPTY! This occurs when MESSAGE CONTENT INTENT is disabled in the Discord Developer Portal under Bot -> Privileged Gateway Intents.`);
      }

      this.dispatchEvent('messageCreate', message);

      if (message.guildId) {
        AnalyticsService.incrementMetric(message.guildId, 'messages').catch(() => { });

        // DM notify users who were tagged/mentioned directly
        if (message.mentions.users.size > 0 && message.guild) {
          const verifiedIcon = '<a:approved:1532390590707142956>';
          const shieldIcon = '<:shield:1532403012751065179>';
          message.mentions.users.forEach(async (user) => {
            if (user.id === message.author.id || user.bot) return;
            try {
              const guildIcon = message.guild?.iconURL({ size: 256 }) ?? undefined;
              const msgContext = message.content
                ? (message.content.length > 500 ? message.content.substring(0, 500) + '…' : message.content)
                : '*(No text content)*';

              const dmEmbed = new EmbedBuilder()
                .setColor(0x84cc16)
                .setThumbnail(guildIcon || message.author.displayAvatarURL({ size: 256 }) || null)
                .setDescription([
                  `> • **MENTION ALERT NOTIFICATION**`,
                  `> • **RAGE OPTIMISER ALERT SYSTEM**`,
                  `> `,
                  `> ${verifiedIcon} **Mentioned By**: ${message.author} (\`${message.author.username}\`)`,
                  `> ${shieldIcon} **Server**: **${message.guild?.name}**`,
                  `> ${shieldIcon} **Channel**: ${message.channel.toString()}`,
                  `> `,
                  `> ${verifiedIcon} __**Message Content**__`,
                  `> ${msgContext}`
                ].join('\n'))
                .setFooter({ text: 'Rage Optimiser • Mention Alert Engine' })
                .setTimestamp();

              const jumpRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setLabel('Jump to Message').setURL(message.url).setStyle(ButtonStyle.Link)
              );

              await user.send({ embeds: [dmEmbed], components: [jumpRow] }).catch(() => { });
            } catch (err) { }
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
        const verifiedIcon = '<a:approved:1532390590707142956>';
        const shieldIcon = '<:shield:1532403012751065179>';
        const greetingEmbed = new EmbedBuilder()
          .setColor(0x84cc16)
          .setDescription([
            `### Hey !!! , I am ${this.client.user} ,\n`,
            `> » **Welcome to Security 2.0** A bot which is made for unbypassable features and community management!\n`,
            `> » **Server Prefix**: \`${curPrefix}\`   •   **Slash Commands**: \`/\``,
            `> » **To set Custom Prefix use** ${this.client.user} **prefix " your custom prefix "**\n`,
            `> » **Type \`${curPrefix}help\` or \`/help\` to view all modules.**`
          ].join('\n'))
          .setThumbnail(this.client.user?.displayAvatarURL({ size: 256 }) ?? null)
          .setFooter({ text: 'Rage Optimiser • Command Engine' })
          .setTimestamp();

        const btnDashboard = new ButtonBuilder().setLabel('Dashboard').setStyle(ButtonStyle.Link).setURL('https://rageoptimiser.com/dashboard');
        const btnInvite = new ButtonBuilder().setLabel('Invite Bot').setStyle(ButtonStyle.Link).setURL(`https://discord.com/api/oauth2/authorize?client_id=${this.client.user?.id}&permissions=8&scope=bot%20applications.commands`);
        const btnSupport = new ButtonBuilder().setLabel('Support Server').setStyle(ButtonStyle.Link).setURL('https://discord.gg/mK8HVJGzYt');
        const greetRow = new ActionRowBuilder<ButtonBuilder>().addComponents(btnDashboard, btnInvite, btnSupport);

        await message.reply({ embeds: [greetingEmbed], components: [greetRow] }).catch(() => { });

        // Send detailed DM documentation message to message.author
        try {
          const botUser = this.client.user;
          const dmDetailEmbed = new EmbedBuilder()
            .setColor(0x84cc16)
            .setThumbnail(botUser?.displayAvatarURL({ size: 256 }) ?? null)
            .setDescription([
              `> • **RAGE OPTIMISER COMMAND MANUAL**`,
              `> • **SYSTEM DOCUMENTATION & CONTROL PANEL**`,
              `> `,
              `> ${verifiedIcon} **Bot Tag**: ${botUser} (\`${botUser?.username}\`)`,
              `> ${verifiedIcon} **Server Prefix**: \`${curPrefix}\` (Default: \`r!\`)`,
              `> ${shieldIcon} **Slash Commands**: Supported (\`/\`)`,
              `> `,
              `> ${shieldIcon} __**Core Security Modules**__`,
              `> ${verifiedIcon} **Anti-Nuke**: Protection against mass channel, role, ban & kick attacks`,
              `> ${verifiedIcon} **Unified Whitelist**: Bypass controls for trusted members, bots, and roles`,
              `> ${verifiedIcon} **Voice Guard**: Anti-ghosting, channel lock, and temporary voice manager`,
              `> ${verifiedIcon} **AI Automod**: Anti-link filter, spam detection, and word censors`,
              `> `,
              `> ${shieldIcon} __**Quick Start Commands**__`,
              `> • \`${curPrefix}help\` — Open interactive module manager`,
              `> • \`${curPrefix}whitelist config @user\` — Configure bypass permissions`,
              `> • \`${curPrefix}antinuke status\` — Check Anti-Nuke protection status`,
              `> • \`${curPrefix}dashboard\` — Spawn live interactive server control panel`,
              `> `,
              `> ${verifiedIcon} __**Need Further Assistance?**__`,
              `> Visit the web control dashboard or join our support server below!`
            ].join('\n'))
            .setFooter({ text: 'Rage Optimiser • Security Engine' })
            .setTimestamp();

          const rowDm = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setLabel('Web Dashboard').setStyle(ButtonStyle.Link).setURL('https://rageoptimiser.com/dashboard'),
            new ButtonBuilder().setLabel('Invite Bot').setStyle(ButtonStyle.Link).setURL(`https://discord.com/api/oauth2/authorize?client_id=${botUser?.id}&permissions=8&scope=bot%20applications.commands`),
            new ButtonBuilder().setLabel('Support Server').setStyle(ButtonStyle.Link).setURL('https://discord.gg/mK8HVJGzYt')
          );

          await message.author.send({ embeds: [dmDetailEmbed], components: [rowDm] }).catch(() => { });
        } catch (e) { }

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
          const mainEmbed = Embeds.warn(
            '🚧 Maintenance Mode Active',
            'The server is currently in **lockdown mode**. All public bot commands are temporarily disabled.\n\nPlease check back shortly.',
            { module: 'system', footer: 'Rage Optimiser Enterprise  •  System Maintenance' }
          );
          await message.reply({ embeds: [mainEmbed] }).catch(() => { });
          return;
        }
      }

      // Handle built-in prefix command: r!prefix & r!setprefix
      if (parsed.commandName === 'prefix' || parsed.commandName === 'setprefix') {
        const guildId = message.guildId;
        if (!guildId) {
          return message.reply(`${WRONG_ICON} Custom prefixes can only be configured inside a server.`);
        }

        const isAuthorized = await isOwnerOrExtraOwner(message.author.id, message.guild!);

        const firstArg = parsed.args[0]?.toLowerCase();

        if (!firstArg || firstArg === 'list' || firstArg === 'show') {
          const curPrefix = PrefixResolver.getPrefix(guildId);
          const embed = Embeds.info(
            `${CONFIG_ICON} Server Prefix Settings`,
            `Current prefix: **\`${curPrefix}\`**   •   Default fallback: **\`r!\`**\n\nChange with: \`${curPrefix}prefix set <new>\` or \`${curPrefix}setprefix <new>\`\n*Restricted to Server Owner & Extra Owners.*`,
            { module: 'system' }
          );
          return message.reply({ embeds: [embed] });
        }

        if (firstArg === 'reset') {
          if (!isAuthorized) {
            return message.reply(`${WRONG_ICON} **Access Denied**: Resetting the server prefix is strictly restricted to the **Server Owner** (<@${message.guild?.ownerId}>) and designated **Extra Owners**.`);
          }
          const updated = await PrefixResolver.resetPrefix(guildId);
          const embed = Embeds.success(
            `${VERIFIED_ICON} Prefix Reset`,
            `Server prefix has been reset to the default: **\`${updated}\`**`,
            { module: 'system' }
          );
          return message.reply({ embeds: [embed] });
        }

        // Handle either "r!prefix set !" or "r!prefix !" or "r!setprefix !"
        const targetPrefix = parsed.commandName === 'setprefix' ? parsed.args[0] : (firstArg === 'set' ? parsed.args[1] : parsed.args[0]);
        if (!targetPrefix) {
          return message.reply(`${WRONG_ICON} Please specify a new prefix. Example: \`r!prefix set !\` or \`r!setprefix !\``);
        }

        if (!isAuthorized) {
          return message.reply(`${WRONG_ICON} **Access Denied**: Changing the server prefix is strictly restricted to the **Server Owner** (<@${message.guild?.ownerId}>) and designated **Extra Owners**.`);
        }

        try {
          const updated = await PrefixResolver.setPrefix(guildId, targetPrefix);
          const embed = Embeds.success(
            `${VERIFIED_ICON} Server Prefix Updated`,
            `Prefix for **${message.guild?.name}** has been changed to **\`${updated}\`**`,
            { module: 'system' }
          );
          return message.reply({ embeds: [embed] });
        } catch (err: any) {
          return message.reply(`${WRONG_ICON} Failed to update prefix: ${err.message}`);
        }
      }

      // Handle built-in prefix command: r!ping
      if (parsed.commandName === 'ping') {
        const wsPing = Math.max(1, Math.round(this.client.ws.ping));
        const uptimeSec = process.uptime();
        const startTime = Math.floor((Date.now() - uptimeSec * 1000) / 1000);
        const heapMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

        const getStatus = (ms: number) => {
          if (ms < 100) return `${VERIFIED_ICON} Ultra Fast`;
          if (ms < 250) return `${TIMER_ICON} Normal Speed`;
          if (ms < 500) return `${TIMER_ICON} Moderate Lag`;
          return `${WRONG_ICON} High Latency`;
        };

        const sentMsg = await message.reply(`${TIMER_ICON} Measuring ping...`).catch(() => null);
        const roundTrip = sentMsg ? Math.max(1, sentMsg.createdTimestamp - message.createdTimestamp) : 10;
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
                `REST Round-Trip: \`${roundTrip}ms\` — ${getStatus(roundTrip)}`,
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

        if (sentMsg) {
          return sentMsg.edit({ content: null, embeds: [embed] }).catch(() => { });
        } else {
          return message.reply({ embeds: [embed] }).catch(() => { });
        }
      }

      // Handle built-in prefix command: r!help
      if (parsed.commandName === 'help') {
        return PrefixHelpCenter.handleHelp(message, parsed.args[0]);
      }

      // Lookup Command Metadata — single registry path, no executeMap fallback needed
      const cmdMeta = PrefixRegistry.get(parsed.commandName);
      if (!cmdMeta) {
        PrefixAnalytics.trackFailure('unknown');
        const allCmds = PrefixRegistry.getAllCommands().map(c => c.name);
        const suggested = FuzzySuggestions.suggest(parsed.commandName, allCmds);
        const curPfx = PrefixResolver.getPrefix(message.guildId || undefined);
        const unknownDesc = suggested
          ? `Command \`${parsed.commandName}\` was not found.\n\n> <:information:1532621274092929124> Did you mean **\`${curPfx}${suggested}\`**?`
          : `Unknown command \`${curPfx}${parsed.commandName}\`.\n\nType **\`${curPfx}help\`** or **\`/help\`** to view all commands.`;
        const unknownEmbed = Embeds.error('Command Not Found', unknownDesc, { module: 'system' });
        await message.reply({ embeds: [unknownEmbed] }).catch(() => { });
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
          AnalyticsService.incrementMetric(newState.guild.id, 'voiceMinutes', diffMin).catch(() => { });
        }
        this.voiceSessions.delete(sessionKey);
      } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        // User moved channels - record current and start new
        const start = this.voiceSessions.get(sessionKey);
        if (start && newState.guild?.id) {
          const diffMin = Math.max(1, Math.floor((Date.now() - start) / 60000));
          AnalyticsService.incrementMetric(newState.guild.id, 'voiceMinutes', diffMin).catch(() => { });
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

    this.client.on('guildDelete', async (guild) => {
      console.log(`[Gateway] Bot removed from server "${guild.name || guild.id}" (${guild.id})`);
      this.logSyncEvent(guild.id, `Discord Event: Bot was removed from server "${guild.name || guild.id}".`, 'warn');
      this.dispatchEvent('guildDelete', guild);

      // Broadcast real-time update to web dashboard
      this.broadcast({
        type: 'GUILD_REMOVED',
        guildId: guild.id,
        guildName: guild.name || guild.id
      });

      // Send emergency DM notification to server owner & all designated Extra Owners
      try {
        const recipients = new Set<string>();
        if (guild.ownerId) recipients.add(guild.ownerId);

        // Fetch Extra Owners for this guild from SQLite
        const db = Database.getDb();
        if (db) {
          const extraRows = await db.all<any>('SELECT userId FROM extra_owners WHERE guildId = ?', [guild.id]).catch(() => []);
          for (const r of extraRows) {
            if (r.userId) recipients.add(r.userId);
          }
        }

        const alertEmbed = new EmbedBuilder()
          .setColor(0xEF4444)
          .setAuthor({ name: 'Rage Optimiser • Security Engine' })
          .setTitle('🚨 URGENT SECURITY ALERT: Bot Removed From Server')
          .setDescription(
            `> **Rage Optimiser** was just kicked or removed from your server **${guild.name || guild.id}**.\n\n` +
            `• **Server ID**: \`${guild.id}\`\n` +
            `• **Primary Owner**: <@${guild.ownerId}>\n` +
            `• **Security Protection Status**: \`Suspended until re-invited\`\n\n` +
            `**⚠️ POTENTIAL ACCOUNT COMPROMISE / RAID THREAT**\n` +
            `If the Primary Owner's account was compromised, designated **Extra Owners** must **re-invite Rage Optimiser immediately** to re-activate Anti-Nuke protections.\n\n` +
            `**🛡️ Automatic Snapshot Vault**\n` +
            `All server configurations, whitelists, rules, and Anti-Nuke settings remain **100% saved in cloud memory**.`
          )
          .setFooter({ text: 'Rage Optimiser Enterprise • Unbypassable Security' })
          .setTimestamp();

        for (const userId of recipients) {
          const u = await this.client.users.fetch(userId).catch(() => null);
          if (u) {
            await u.send({ embeds: [alertEmbed] }).catch(() => {});
          }
        }
      } catch (dmErr) {
        console.warn('[Gateway] Could not dispatch DM alert to owner/extra-owners on guildDelete:', dmErr);
      }

      // Synchronize SQLite approvals table if record exists
      try {
        const db = Database.getDb();
        if (db) {
          await db.run('UPDATE approvals set status = ? WHERE guildId = ?', ['Not Registered', guild.id]);
        }
      } catch (e) {
        console.error('[Gateway] Failed to update approval status on guildDelete:', e);
      }
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

  }

  public async syncRegistry(guildId?: string) {
    if (!this.client || !this.client.isReady() || !this.client.token) return;
    try {
      if (!guildId) {
        const guilds = Array.from(this.client.guilds.cache.values());
        for (const g of (guilds as any[])) {
          await this.syncSingleGuild(g.id);
        }
      } else {
        await this.syncSingleGuild(guildId);
      }
    } catch (err: any) {
      if (!err?.message?.includes('Expected token to be set')) {
        console.error('Failed to sync live Discord resources:', err);
      }
    }
  }

  private async syncSingleGuild(guildId: string) {
    if (!this.client || !this.client.isReady() || !this.client.token) return;
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

    if (!token || !clientId) return;

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
      console.log(`[Gateway] Deploying ${commands.length} application commands GLOBALLY to ALL servers...`);
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      this.logSyncEvent('Slash commands successfully registered globally for all servers.', 'success');
      console.log('✅ Slash commands successfully registered globally for all servers.');

      // Clear legacy per-guild command overrides across ALL servers to prevent duplicate commands
      const cachedGuilds = Array.from(this.client.guilds.cache.values());
      for (const g of cachedGuilds as any[]) {
        await rest.put(
          Routes.applicationGuildCommands(clientId, g.id),
          { body: [] }
        ).catch(() => { });
      }
      console.log(`✅ Cleared per-guild command overrides across ${cachedGuilds.length} servers to eliminate duplicate commands.`);
    } catch (error: any) {
      console.error('[Gateway] Failed to deploy slash commands globally:', error);
    }
  }

  private async dispatchEvent(eventName: string, ...args: any[]): Promise<void> {
    // ── Rage Brain silent tap (fire-and-forget — NEVER blocks bot logic) ──
    BrainEventInterceptor.observe(eventName, args, {
      getModulesState: (gId?: string) => this.getModulesState(gId),
      getGlobalSettings: (gId?: string) => this.getGlobalSettings(gId)
    }).catch(() => { });

    return this.dispatchEventForGuild(eventName, undefined, ...args);
  }

  private async dispatchEventForGuild(eventName: string, guildIdOverride: string | undefined, ...args: any[]): Promise<void> {
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

    // Collect and await all matching handler promises so callers (like InteractionRouter)
    // can await the full round-trip before Discord's 3-second interaction window closes.
    const handlerPromises: Promise<void>[] = [];

    this.manifests.forEach(m => {
      const ev = m.events?.find((e: any) => e.name === eventName);
      if (ev) {
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

        const p = Promise.resolve()
          .then(() => (ev.handler as any)(...handlerArgs))
          .catch((err: any) => {
            console.error(`Error in event listener ${eventName} for module ${m.id}:`, err);
          });
        handlerPromises.push(p);
      }
    });

    await Promise.allSettled(handlerPromises);
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
        } catch (e) { }
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
      } catch (e) { }
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
        } catch (e) { }
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
      } catch (e) { }
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
