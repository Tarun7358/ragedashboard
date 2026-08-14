import { EmbedBuilder, Message, PermissionFlagsBits } from 'discord.js';
import { ModuleManifest } from '../../core/types.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';
import { SocialSubscriptionRepository } from './SocialSubscriptionRepository.js';
import { ProviderManager } from './ProviderManager.js';
import { TemplateEngine } from './TemplateEngine.js';
import { NotificationService } from './NotificationService.js';
import { Scheduler } from './Scheduler.js';
import { SubscriptionManager } from './SubscriptionManager.js';
import { InstagramFetcher } from './providers/InstagramFetcher.js';
import { NotificationQueue } from './NotificationQueue.js';

let _scheduler: Scheduler | null = null;

function getScheduler(client: any, logFn?: (msg: string, type: any) => void): Scheduler {
  if (!_scheduler) {
    _scheduler = new Scheduler(client, logFn);
    _scheduler.initAll().catch((err: any) => console.error('[SocialUpdates] Scheduler init failed:', err));
  } else if (client) {
    _scheduler.updateClient(client);
  }
  return _scheduler;
}

export const SocialUpdatesManifest: ModuleManifest = {
  id: 'social_updates',
  name: 'Social Updates',
  version: '1.0.0',
  description: 'Monitor YouTube channels and Instagram accounts, sending customizable Discord notifications for new content.',

  configSchema: {
    requiredFields: [],
    validate: (_config: Record<string, any>, _registry: any) => {
      return { progress: 100, errors: [] };
    }
  },

  commands: [
    {
      name: 'social-updates',
      description: 'Manage Social Updates subscriptions',
      options: [
        {
          name: 'action',
          type: 3,
          description: 'Action: status, list, add, remove, forcecheck, validate, statistics',
          required: true,
          choices: [
            { name: 'status', value: 'status' },
            { name: 'list', value: 'list' },
            { name: 'add', value: 'add' },
            { name: 'remove', value: 'remove' },
            { name: 'forcecheck', value: 'forcecheck' },
            { name: 'validate', value: 'validate' },
            { name: 'statistics', value: 'statistics' }
          ]
        },
        {
          name: 'provider',
          type: 3,
          description: 'Provider: youtube or instagram (for add)',
          required: false,
          choices: [
            { name: 'youtube', value: 'youtube' },
            { name: 'instagram', value: 'instagram' }
          ]
        },
        {
          name: 'source',
          type: 3,
          description: 'Channel ID, handle, or username (for add)',
          required: false
        },
        {
          name: 'channel',
          type: 7,
          description: 'Target Discord channel (for add)',
          required: false
        },
        {
          name: 'id',
          type: 3,
          description: 'Subscription ID (for remove)',
          required: false
        }
      ]
    }
  ],

  events: [
    {
      name: 'command_social-updates',
      handler: async (client: any, interaction: any, context: any) => {
        const action = interaction.options.getString('action');
        const isAdmin = interaction.member?.permissions?.has?.('ManageGuild') ||
          interaction.guild?.ownerId === interaction.user?.id;
        if (!isAdmin) {
          const embed = new EmbedBuilder()
            .setTitle('<:shield:1532403012751065179> Access Denied')
            .setDescription('Requires Manage Server permission to manage social updates.')
            .setColor(0xEF4444)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        const guildId = interaction.guildId;
        await SocialSubscriptionRepository.ensureTable().catch(() => { });

        if (action === 'list') {
          const subs = await SocialSubscriptionRepository.findAll(guildId);
          if (subs.length === 0) {
            const embed = new EmbedBuilder()
              .setTitle('<:information:1532621274092929124> Social Updates Subscriptions')
              .setDescription('No active subscriptions configured. Use `r!social-updates add <youtube|instagram> <handle/channel_id> <#channel>` or the Web Dashboard to add YouTube channels or Instagram accounts.')
              .setColor(0x99CC00)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }
          const lines = subs.map((s: any) =>
            `• **${s.provider.toUpperCase()}** \`${s.sourceName}\` → <#${s.discordChannelId}> — ${s.enabled ? '<a:approved:1532390590707142956> Active' : '<:wrong:1532390628330307634> Paused'} (Health: **${s.validationStatus}**)`
          );
          const embed = new EmbedBuilder()
            .setTitle('<:information:1532621274092929124> Social Updates Subscriptions')
            .setDescription(lines.join('\n'))
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
          return interaction.reply({ embeds: [embed], flags: 64 });
        } else if (action === 'status') {
          const subs = await SocialSubscriptionRepository.findAll(guildId);
          const active = subs.filter((s: any) => s.enabled).length;
          const embed = new EmbedBuilder()
            .setTitle('<:information:1532621274092929124> Social Updates Status')
            .setDescription(`**Active Subscriptions:** ${active} / ${subs.length}\n**System Diagnostics:** <a:approved:1532390590707142956> Operational`)
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
          return interaction.reply({ embeds: [embed], flags: 64 });
        } else if (action === 'forcecheck') {
          if (_scheduler) {
            _scheduler.triggerImmediateCheck();
            const embed = new EmbedBuilder()
              .setTitle('<a:approved:1532390590707142956> Global Force Check Initiated')
              .setDescription('Force check triggered globally across all registered social media subscriptions.')
              .setColor(0x99CC00)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          } else {
            const embed = new EmbedBuilder()
              .setTitle('<:wrong:1532390628330307634> Scheduler Error')
              .setDescription('Scheduler process is currently offline or not initialized.')
              .setColor(0xEF4444)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }
        } else if (action === 'validate') {
          await interaction.deferReply({ flags: 64 });
          const subs = await SocialSubscriptionRepository.findAll(guildId);
          let successCount = 0;
          for (const sub of subs) {
            const ok = await SubscriptionManager.validateSubscription(sub.id).catch(() => false);
            if (ok) successCount++;
          }
          const embed = new EmbedBuilder()
            .setTitle('<a:approved:1532390590707142956> Subscriptions Validated')
            .setDescription(`**${successCount}** out of **${subs.length}** social subscriptions passed health checks.`)
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
          return interaction.editReply({ embeds: [embed] });
        } else if (action === 'statistics') {
          const analytics = await SocialSubscriptionRepository.getAnalytics(guildId);
          const embed = new EmbedBuilder()
            .setTitle('<:information:1532621274092929124> Social Updates Analytics & Telemetry')
            .setColor(0x99CC00)
            .addFields(
              { name: 'Total Subscriptions', value: `${analytics.totalSubscriptions}`, inline: true },
              { name: 'Active Subscriptions', value: `${analytics.activeSubscriptions}`, inline: true },
              { name: 'Notifications Sent', value: `${analytics.totalNotificationsSent}`, inline: true },
              { name: 'Failed Attempts', value: `${analytics.totalFailedAttempts}`, inline: true },
              { name: 'Avg Delivery Time', value: `${analytics.avgDeliveryTimeMs}ms`, inline: true }
            )
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
          return interaction.reply({ embeds: [embed], flags: 64 });
        } else if (action === 'add' || action === 'subscribe') {
          const rawArgs = context?.parsed?.args || [];
          let provider: string | undefined = interaction.options?.getString?.('provider')?.toLowerCase();
          if (!provider || !['youtube', 'instagram', 'yt', 'ig'].includes(provider)) {
            const pToken = rawArgs.find((a: string) => ['youtube', 'instagram', 'yt', 'ig'].includes(a.toLowerCase()));
            if (pToken) provider = pToken.toLowerCase();
          }
          if (provider === 'yt') provider = 'youtube';
          if (provider === 'ig') provider = 'instagram';

          let channel = interaction.options?.getChannel?.('channel') || interaction.message?.mentions?.channels?.first();
          if (!channel && interaction.guild) {
            const fetchedChannels = await interaction.guild.channels.fetch().catch(() => null);
            for (const arg of rawArgs) {
              if (!arg) continue;
              const cleanId = arg.replace(/[<#>]/g, '').trim();
              if (/^\d{17,20}$/.test(cleanId)) {
                channel = interaction.guild.channels.cache.get(cleanId) ||
                  (fetchedChannels && typeof (fetchedChannels as any).get === 'function' ? (fetchedChannels as any).get(cleanId) : null);
                if (!channel) {
                  channel = await interaction.guild.channels.fetch(cleanId).catch(() => null);
                }
                if (!channel && interaction.client) {
                  channel = await interaction.client.channels.fetch(cleanId).catch(() => null);
                }
                if (channel) break;
              }

              const cleanName = arg.toLowerCase().replace(/^[#<>]*/, '').replace(/>$/, '').trim();
              if (!cleanName) continue;

              const searchPool = fetchedChannels || interaction.guild.channels.cache;
              const foundByName = searchPool.find((c: any) => {
                if (!c || !c.name) return false;
                const cn = c.name.toLowerCase();
                if (cn === cleanName) return true;
                const cnNorm = cn.replace(/[^a-z0-9]/g, '');
                const cleanNorm = cleanName.replace(/[^a-z0-9]/g, '');
                return cnNorm.length > 0 && cleanNorm.length > 0 && (cnNorm === cleanNorm || cnNorm.includes(cleanNorm) || cleanNorm.includes(cnNorm));
              });

              if (foundByName) {
                channel = foundByName;
                break;
              }
            }
          }

          let sourceId = interaction.options?.getString?.('source');
          const isChannelArg = (s: string) => {
            if (!s) return false;
            if (s.startsWith('<#') && s.endsWith('>')) return true;
            const clean = s.replace(/[<#>]/g, '').trim();
            if (channel && (clean === channel.id || clean.toLowerCase() === channel.name?.toLowerCase())) return true;
            return false;
          };

          if (!sourceId || isChannelArg(sourceId)) {
            const candidateArgs = rawArgs.filter((a: string) => {
              if (!a) return false;
              const lower = a.toLowerCase();
              if (lower === 'add' || lower === 'subscribe') return false;
              if (['youtube', 'instagram', 'yt', 'ig'].includes(lower)) return false;
              if (isChannelArg(a)) return false;
              return true;
            });
            if (candidateArgs.length > 0) {
              sourceId = candidateArgs[0];
            }
          }

          if (!provider || !['youtube', 'instagram'].includes(provider) || !sourceId || !channel) {
            const embed = new EmbedBuilder()
              .setTitle('<:wrong:1532390628330307634> Invalid Add Syntax')
              .setDescription([
                `> **Syntax**: \`r!social-updates add <youtube|instagram> <handle_or_channel> <#discordChannel>\``,
                `> **Example YouTube (Handle)**: \`r!social-updates add youtube clasherliveop #announcements\``,
                `> **Example YouTube (Channel ID)**: \`r!social-updates add youtube UC_x5XG1OV2P6uZZ5FSM9Ttw #announcements\``,
                `> **Example Instagram**: \`r!social-updates add instagram nature #social-feed\``
              ].join('\n'))
              .setColor(0xEF4444)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }

          const res = await SubscriptionManager.addSubscription(guildId, provider, sourceId, channel.id, {});
          if (!res.success) {
            const embed = new EmbedBuilder()
              .setTitle('<:wrong:1532390628330307634> Subscription Error')
              .setDescription(`Failed to add social feed: \`${res.error}\``)
              .setColor(0xEF4444)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }

          const embed = new EmbedBuilder()
            .setTitle('<a:approved:1532390590707142956> Social Account Subscribed')
            .setDescription(`Successfully subscribed **${provider.toUpperCase()}** account \`${res.subscription?.sourceName || sourceId}\` to **<#${channel.id}>**.`)
            .addFields(
              { name: 'Subscription ID', value: `\`${res.subscription?.id}\``, inline: true },
              { name: 'Platform', value: `\`${provider.toUpperCase()}\``, inline: true },
              { name: 'Target Channel', value: `<#${channel.id}>`, inline: true }
            )
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
          return interaction.reply({ embeds: [embed], flags: 64 });
        } else if (action === 'remove' || action === 'delete' || action === 'unsubscribe') {
          const subId = interaction.options?.getString?.('id') || context?.parsed?.args[1];
          if (!subId) {
            const embed = new EmbedBuilder()
              .setTitle('<:wrong:1532390628330307634> Invalid Remove Syntax')
              .setDescription(`> **Syntax**: \`r!social-updates remove <subscription_id>\`\n> *(Use \`r!social-updates list\` to view IDs)*`)
              .setColor(0xEF4444)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }

          const res = await SubscriptionManager.removeSubscription(guildId, subId);
          if (!res.success) {
            const embed = new EmbedBuilder()
              .setTitle('<:wrong:1532390628330307634> Removal Error')
              .setDescription(`\`${res.error}\``)
              .setColor(0xEF4444)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }

          const embed = new EmbedBuilder()
            .setTitle('<a:approved:1532390590707142956> Social Account Removed')
            .setDescription(`Successfully deleted social subscription \`${subId}\`.`)
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
          return interaction.reply({ embeds: [embed], flags: 64 });
        } else {
          const embed = new EmbedBuilder()
            .setTitle('<:information:1532621274092929124> Social Updates Control Manual')
            .setDescription([
              `> <:lightpurplearrow:1532621364115013693> **\`r!social-updates add <yt|ig> <handle/id> <#channel>\`** — Add new social feed`,
              `> <:lightpurplearrow:1532621364115013693> **\`r!social-updates remove <id>\`** — Remove a social subscription`,
              `> <:lightpurplearrow:1532621364115013693> **\`r!social-updates status\`** — View overall system operational status`,
              `> <:lightpurplearrow:1532621364115013693> **\`r!social-updates list\`** — List all configured social subscriptions`,
              `> <:lightpurplearrow:1532621364115013693> **\`r!social-updates forcecheck\`** — Trigger immediate global update scan`,
              `> <:lightpurplearrow:1532621364115013693> **\`r!social-updates validate\`** — Validate health of registered subscriptions`,
              `> <:lightpurplearrow:1532621364115013693> **\`r!social-updates statistics\`** — View analytics and delivery telemetry`
            ].join('\n'))
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
          return interaction.reply({ embeds: [embed], flags: 64 });
        }
      }
    },
    {
      name: 'ready',
      handler: async (client: any, _: any, context: any) => {
        const scheduler = getScheduler(client, (msg, type) => {
          if (context?.logSyncEvent) context.logSyncEvent(msg, type);
        });
        scheduler.updateClient(client);
        SubscriptionManager.setScheduler(scheduler);
      }
    }
  ],

  routes: [
    // ── GET /status ─────────────────────────────────────────────────────────
    {
      path: '/status',
      method: 'get',
      handler: async (req: any, res: any, context: any) => {
        const { guildId, client, logSyncEvent } = context;
        await SocialSubscriptionRepository.ensureTable().catch(() => { });

        // Ensure scheduler is active
        getScheduler(client, logSyncEvent);

        const subs = await SocialSubscriptionRepository.findAll(guildId);
        const analytics = await SocialSubscriptionRepository.getAnalytics(guildId);
        const auditLogs = await SocialSubscriptionRepository.getAuditLogs(guildId, 25);

        res.json({
          subscriptions: subs.map((s: any) => SubscriptionManager.deserialize(s)),
          analytics,
          auditLogs,
          queueLength: NotificationQueue.getQueueLength()
        });
      }
    },

    // ── POST /validate ───────────────────────────────────────────────────────
    {
      path: '/validate',
      method: 'post',
      handler: async (req: any, res: any, _context: any) => {
        const { provider, input } = req.body;
        if (!provider || !input) {
          return res.status(400).json({ error: 'provider and input are required' });
        }

        if (!ProviderManager.has(provider)) {
          return res.status(400).json({ error: `Unknown provider: ${provider}` });
        }

        try {
          const providerInstance = ProviderManager.getProvider(provider);
          const validation = await providerInstance.validate(input);
          res.json(validation);
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      }
    },

    // ── POST /subscribe ──────────────────────────────────────────────────────
    {
      path: '/subscribe',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        const { guildId, client, logSyncEvent } = context;
        const {
          provider, sourceId, sourceName, sourceAvatar,
          discordChannelId, embedConfig, notificationTemplate,
          mentionRoles, pollingMode, contentTypes
        } = req.body;

        // Ensure scheduler is initialized
        getScheduler(client, logSyncEvent);

        const result = await SubscriptionManager.addSubscription(guildId, provider, sourceId, discordChannelId, {
          embedConfig,
          mentionRoles,
          pollingMode,
          contentTypes
        });

        if (!result.success) {
          return res.status(400).json({ error: result.error });
        }

        res.json({
          success: true,
          subscription: result.subscription
        });
      }
    },

    // ── POST /unsubscribe ────────────────────────────────────────────────────
    {
      path: '/unsubscribe',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        const { guildId } = context;
        const { id } = req.body;

        if (!id) return res.status(400).json({ error: 'id is required' });

        const result = await SubscriptionManager.removeSubscription(guildId, id);
        if (!result.success) {
          return res.status(400).json({ error: result.error });
        }

        res.json({ success: true });
      }
    },

    // ── POST /update ─────────────────────────────────────────────────────────
    {
      path: '/update',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        const { guildId } = context;
        const { id, ...updates } = req.body;

        if (!id) return res.status(400).json({ error: 'id is required' });

        const result = await SubscriptionManager.updateSubscription(guildId, id, updates);
        if (!result.success) {
          return res.status(400).json({ error: result.error });
        }

        res.json({
          success: true,
          subscription: result.subscription
        });
      }
    },

    // ── POST /test ────────────────────────────────────────────────────────────
    {
      path: '/test',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        const { guildId, client } = context;
        const { id } = req.body;

        if (!id) return res.status(400).json({ error: 'id is required' });

        const sub = await SocialSubscriptionRepository.findById(id);
        if (!sub || sub.guildId !== guildId) {
          return res.status(404).json({ error: 'Subscription not found' });
        }

        if (!client) return res.status(503).json({ error: 'Discord client not connected' });

        try {
          let embedConfig: any = {};
          try { embedConfig = JSON.parse(sub.embedConfig); } catch { }

          const sampleData = TemplateEngine.getSampleData(sub.provider as 'youtube' | 'instagram');

          const channel = await client.channels.fetch(sub.discordChannelId).catch(() => null);
          const guild = channel?.guild;
          if (guild) {
            sampleData['discord.guild'] = guild.name;
            sampleData['server.name'] = guild.name;
          }
          if (channel) {
            sampleData['discord.channel'] = `#${channel.name}`;
          }

          const result = await NotificationService.send(
            client,
            sub.discordChannelId,
            { ...embedConfig, mentionRoles: JSON.parse(sub.mentionRoles || '[]') },
            sampleData
          );

          res.json(result);
        } catch (err: any) {
          res.status(500).json({ success: false, error: err.message });
        }
      }
    },

    // ── POST /sandbox/trigger ────────────────────────────────────────────────
    {
      path: '/sandbox/trigger',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        const { client, logSyncEvent } = context;
        const { username, type, title } = req.body;

        if (!username || !type) {
          return res.status(400).json({ error: 'username and type are required' });
        }

        const validTypes = ['post', 'reel', 'carousel', 'story'];
        if (!validTypes.includes(type)) {
          return res.status(400).json({ error: `Invalid type. Choose from: ${validTypes.join(', ')}` });
        }

        try {
          const item = InstagramFetcher.triggerUpload(username, type, title);

          // Force scheduler check immediately to discover the new mock item
          const scheduler = getScheduler(client, logSyncEvent);
          scheduler.triggerImmediateCheck();

          res.json({
            success: true,
            message: `Mock Instagram ${type} triggered for @${username}.`,
            item
          });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      }
    },

    // ── GET /analytics ────────────────────────────────────────────────────────
    {
      path: '/analytics',
      method: 'get',
      handler: async (req: any, res: any, context: any) => {
        const { guildId } = context;
        await SocialSubscriptionRepository.ensureTable().catch(() => { });
        const analytics = await SocialSubscriptionRepository.getAnalytics(guildId);
        res.json(analytics);
      }
    },

    // ── GET /providers ────────────────────────────────────────────────────────
    {
      path: '/providers',
      method: 'get',
      handler: async (_req: any, res: any, _context: any) => {
        res.json({
          providers: ProviderManager.getRegisteredTypes().map((t: any) => {
            const p = ProviderManager.getProvider(t);
            return { type: t, displayName: p.displayName };
          })
        });
      }
    }
  ]
};

export function registerSocialUpdatesCommands(): void {
  PrefixRegistry.register({
    name: 'social-updates',
    category: 'Social Updates',
    description: 'Monitor YouTube channels and Instagram accounts, sending customizable Discord notifications for new content.',
    usage: 'r!social-updates <add | remove | list | status | forcecheck | validate | statistics>',
    aliases: ['social', 'socials', 'yt', 'ig'],
    cooldownSeconds: 3,
    examples: [
      'r!social add youtube clasherliveop #announcements',
      'r!social add instagram nature #social-feed',
      'r!social list',
      'r!social remove sub_12345',
      'r!social forcecheck',
      'r!social status'
    ],
    moduleOwnerId: 'social_updates',
    dangerLevel: 'Low',
    subcommands: [
      {
        name: 'add',
        description: 'Subscribe a YouTube channel or Instagram account to send automated Discord alerts for new posts & videos.',
        usage: 'r!social add <youtube|instagram> <handle_or_channel_id> <#discordChannel>',
        examples: [
          'r!social add youtube clasherliveop #announcements',
          'r!social add instagram nature #social-feed'
        ],
        userPermissions: ['ManageGuild']
      },
      {
        name: 'remove',
        description: 'Delete an active YouTube or Instagram social subscription by ID.',
        usage: 'r!social remove <subscription_id>',
        examples: ['r!social remove sub_12345'],
        userPermissions: ['ManageGuild']
      },
      {
        name: 'list',
        description: 'List all active social media subscriptions, target Discord channels, status, and health metrics.',
        usage: 'r!social list',
        examples: ['r!social list']
      },
      {
        name: 'status',
        description: 'Check overall operational status, active subscriptions count, and diagnostics of the social notification engine.',
        usage: 'r!social status',
        examples: ['r!social status']
      },
      {
        name: 'forcecheck',
        description: 'Trigger an immediate manual scan across all registered social media accounts for new uploads.',
        usage: 'r!social forcecheck',
        examples: ['r!social forcecheck'],
        userPermissions: ['ManageGuild']
      },
      {
        name: 'validate',
        description: 'Validate health and API status of all registered social subscriptions.',
        usage: 'r!social validate',
        examples: ['r!social validate'],
        userPermissions: ['ManageGuild']
      },
      {
        name: 'statistics',
        description: 'Display delivery telemetry, total notifications sent, failed attempts, and average delivery speed.',
        usage: 'r!social statistics',
        examples: ['r!social statistics']
      }
    ],
    execute: async (message: Message, args: string[], context?: any) => {
      const guildId = message.guildId;
      if (!guildId || !message.guild) {
        return message.reply({ content: '<:wrong:1532390628330307634> Command can only be executed within a server.' });
      }

      const action = (args[0] || '').toLowerCase().trim();
      const isAdmin = message.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) ||
        message.guild.ownerId === message.author.id;

      if (['add', 'subscribe', 'remove', 'delete', 'unsubscribe', 'forcecheck', 'validate'].includes(action) && !isAdmin) {
        const embed = new EmbedBuilder()
          .setTitle('<:shield:1532403012751065179> Access Denied')
          .setDescription('Requires Manage Server permission to modify social update settings.')
          .setColor(0xEF4444)
          .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
        return message.reply({ embeds: [embed] });
      }

      await SocialSubscriptionRepository.ensureTable().catch(() => {});

      if (action === 'list') {
        const subs = await SocialSubscriptionRepository.findAll(guildId);
        if (subs.length === 0) {
          const embed = new EmbedBuilder()
            .setTitle('<:information:1532621274092929124> Social Updates Subscriptions')
            .setDescription('No active subscriptions configured. Use `r!social add <youtube|instagram> <handle/channel_id> <#channel>` to add YouTube channels or Instagram accounts.')
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Social Updates Engine' });
          return message.reply({ embeds: [embed] });
        }
        const lines = subs.map((s: any) =>
          `• **${s.provider.toUpperCase()}** \`${s.sourceName}\` → <#${s.discordChannelId}> — ${s.enabled ? '<a:approved:1532390590707142956> Active' : '<:wrong:1532390628330307634> Paused'} (Health: **${s.validationStatus}**) [ID: \`${s.id}\`]`
        );
        const embed = new EmbedBuilder()
          .setTitle('<:information:1532621274092929124> Social Updates Subscriptions')
          .setDescription(lines.join('\n'))
          .setColor(0x99CC00)
          .setFooter({ text: 'Rage Optimiser • Social Updates Engine' });
        return message.reply({ embeds: [embed] });
      }

      if (action === 'status') {
        const subs = await SocialSubscriptionRepository.findAll(guildId);
        const active = subs.filter((s: any) => s.enabled).length;
        const embed = new EmbedBuilder()
          .setTitle('<:information:1532621274092929124> Social Updates Engine Status')
          .setDescription(`**Active Subscriptions:** ${active} / ${subs.length}\n**System Diagnostics:** <a:approved:1532390590707142956> Operational`)
          .setColor(0x99CC00)
          .setFooter({ text: 'Rage Optimiser • Social Updates Engine' });
        return message.reply({ embeds: [embed] });
      }

      if (action === 'forcecheck') {
        if (_scheduler) {
          _scheduler.triggerImmediateCheck();
          const embed = new EmbedBuilder()
            .setTitle('<a:approved:1532390590707142956> Global Force Check Initiated')
            .setDescription('Force check triggered globally across all registered social media subscriptions.')
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Social Updates Engine' });
          return message.reply({ embeds: [embed] });
        }
      }

      if (action === 'validate') {
        const subs = await SocialSubscriptionRepository.findAll(guildId);
        let successCount = 0;
        for (const sub of subs) {
          const ok = await SubscriptionManager.validateSubscription(sub.id).catch(() => false);
          if (ok) successCount++;
        }
        const embed = new EmbedBuilder()
          .setTitle('<a:approved:1532390590707142956> Subscriptions Validated')
          .setDescription(`**${successCount}** out of **${subs.length}** social subscriptions passed health checks.`)
          .setColor(0x99CC00)
          .setFooter({ text: 'Rage Optimiser • Social Updates Engine' });
        return message.reply({ embeds: [embed] });
      }

      if (action === 'statistics' || action === 'stats' || action === 'analytics') {
        const analytics = await SocialSubscriptionRepository.getAnalytics(guildId);
        const embed = new EmbedBuilder()
          .setTitle('<:information:1532621274092929124> Social Updates Analytics & Telemetry')
          .setColor(0x99CC00)
          .addFields(
            { name: 'Total Subscriptions', value: `${analytics.totalSubscriptions}`, inline: true },
            { name: 'Active Subscriptions', value: `${analytics.activeSubscriptions}`, inline: true },
            { name: 'Notifications Sent', value: `${analytics.totalNotificationsSent}`, inline: true },
            { name: 'Failed Attempts', value: `${analytics.totalFailedAttempts}`, inline: true },
            { name: 'Avg Delivery Time', value: `${analytics.avgDeliveryTimeMs}ms`, inline: true }
          )
          .setFooter({ text: 'Rage Optimiser • Social Updates Engine' });
        return message.reply({ embeds: [embed] });
      }

      if (action === 'add' || action === 'subscribe') {
        let provider = (args[1] || '').toLowerCase();
        if (provider === 'yt') provider = 'youtube';
        if (provider === 'ig') provider = 'instagram';

        const sourceId = args[2];
        const channelMention = message.mentions.channels.first() || (args[3] ? message.guild.channels.cache.get(args[3].replace(/[<#>]/g, '')) : null);

        if (!provider || !['youtube', 'instagram'].includes(provider) || !sourceId || !channelMention) {
          const embed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Invalid Add Syntax')
            .setDescription([
              `> **Syntax**: \`r!social add <youtube|instagram> <handle_or_channel_id> <#discordChannel>\``,
              `> **YouTube Handle Example**: \`r!social add youtube clasherliveop #announcements\``,
              `> **Instagram Example**: \`r!social add instagram nature #social-feed\``
            ].join('\n'))
            .setColor(0xEF4444)
            .setFooter({ text: 'Rage Optimiser • Social Updates Engine' });
          return message.reply({ embeds: [embed] });
        }

        const res = await SubscriptionManager.addSubscription(guildId, provider, sourceId, channelMention.id, {});
        if (!res.success) {
          const embed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Subscription Error')
            .setDescription(`Failed to add social feed: \`${res.error}\``)
            .setColor(0xEF4444)
            .setFooter({ text: 'Rage Optimiser • Social Updates Engine' });
          return message.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
          .setTitle('<a:approved:1532390590707142956> Social Account Subscribed')
          .setDescription(`Successfully subscribed **${provider.toUpperCase()}** account \`${res.subscription?.sourceName || sourceId}\` to **<#${channelMention.id}>**.`)
          .addFields(
            { name: 'Subscription ID', value: `\`${res.subscription?.id}\``, inline: true },
            { name: 'Platform', value: `\`${provider.toUpperCase()}\``, inline: true },
            { name: 'Target Channel', value: `<#${channelMention.id}>`, inline: true }
          )
          .setColor(0x99CC00)
          .setFooter({ text: 'Rage Optimiser • Social Updates Engine' });
        return message.reply({ embeds: [embed] });
      }

      if (action === 'remove' || action === 'delete' || action === 'unsubscribe') {
        const subId = args[1];
        if (!subId) {
          const embed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Invalid Remove Syntax')
            .setDescription(`> **Syntax**: \`r!social remove <subscription_id>\`\n> *(Use \`r!social list\` to view active IDs)*`)
            .setColor(0xEF4444)
            .setFooter({ text: 'Rage Optimiser • Social Updates Engine' });
          return message.reply({ embeds: [embed] });
        }

        const res = await SubscriptionManager.removeSubscription(guildId, subId);
        if (!res.success) {
          const embed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Removal Error')
            .setDescription(`\`${res.error}\``)
            .setColor(0xEF4444)
            .setFooter({ text: 'Rage Optimiser • Social Updates Engine' });
          return message.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
          .setTitle('<a:approved:1532390590707142956> Social Account Removed')
          .setDescription(`Successfully deleted social subscription \`${subId}\`.`)
          .setColor(0x99CC00)
          .setFooter({ text: 'Rage Optimiser • Social Updates Engine' });
        return message.reply({ embeds: [embed] });
      }

      // Default Help Manual
      const embed = new EmbedBuilder()
        .setTitle('<:information:1532621274092929124> Social Updates Control Manual')
        .setDescription([
          `> <:lightpurplearrow:1532621364115013693> **\`r!social add <yt|ig> <handle/id> <#channel>\`** — Add new social feed`,
          `> <:lightpurplearrow:1532621364115013693> **\`r!social remove <id>\`** — Remove a social subscription`,
          `> <:lightpurplearrow:1532621364115013693> **\`r!social status\`** — View overall system operational status`,
          `> <:lightpurplearrow:1532621364115013693> **\`r!social list\`** — List all configured social subscriptions`,
          `> <:lightpurplearrow:1532621364115013693> **\`r!social forcecheck\`** — Trigger immediate global update scan`,
          `> <:lightpurplearrow:1532621364115013693> **\`r!social validate\`** — Validate health of registered subscriptions`,
          `> <:lightpurplearrow:1532621364115013693> **\`r!social statistics\`** — View analytics and delivery telemetry`
        ].join('\n'))
        .setColor(0x99CC00)
        .setFooter({ text: 'Rage Optimiser • Social Updates Engine' });
      return message.reply({ embeds: [embed] });
    }
  });
}
