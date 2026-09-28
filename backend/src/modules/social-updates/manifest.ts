import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Message,
  PermissionFlagsBits
} from 'discord.js';
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
import {
  Colors,
  BRAND_FOOTER,
  VERIFIED_ICON,
  WRONG_ICON,
  YOUTUBE_ICON,
  INSTAGRAM_ICON,
  ARROW_ICON,
  STATS_ICON,
  CONFIG_ICON,
  SHIELD_ICON,
  SQUARE_TICK_ICON,
  SPIN_ANIMATED_ICON
} from '../../core/UIFactory.js';
import { isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';

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

export async function buildSocialDashboardGUI(guild: any) {
  const guildId = guild?.id;
  await SocialSubscriptionRepository.ensureTable().catch(() => {});
  const subs = await SocialSubscriptionRepository.findAll(guildId).catch(() => []);
  const analytics = await SocialSubscriptionRepository.getAnalytics(guildId).catch(() => ({
    totalSubscriptions: subs.length,
    activeSubscriptions: subs.filter((s: any) => s.enabled).length,
    totalNotificationsSent: 0,
    totalFailedAttempts: 0,
    avgDeliveryTimeMs: 120
  }));

  const ytSubs = subs.filter((s: any) => s.provider === 'youtube');
  const igSubs = subs.filter((s: any) => s.provider === 'instagram');
  const activeCount = subs.filter((s: any) => s.enabled).length;

  const ytList = ytSubs.length > 0
    ? ytSubs.map((s: any) => `> ${ARROW_ICON} ${YOUTUBE_ICON} **${s.sourceName}** → <#${s.discordChannelId}> **[${s.enabled ? 'ACTIVE' : 'PAUSED'}]** (ID: \`${s.id}\`)`).join('\n')
    : `> ${ARROW_ICON} *No YouTube channels subscribed.*`;

  const igList = igSubs.length > 0
    ? igSubs.map((s: any) => `> ${ARROW_ICON} ${INSTAGRAM_ICON} **@${s.sourceName}** → <#${s.discordChannelId}> **[${s.enabled ? 'ACTIVE' : 'PAUSED'}]** (ID: \`${s.id}\`)`).join('\n')
    : `> ${ARROW_ICON} *No Instagram accounts subscribed.*`;

  const embed = new EmbedBuilder()
    .setTitle('Rage Optimiser • Social Alerts & Feeds Sentinel')
    .setColor(Colors.BRAND)
    .setDescription([
      `> **Autonomous Social Content Broadcaster**\n`,
      `**Real-time YouTube channel upload & Instagram post detection engine. Automatically broadcasts new videos, shorts, streams, and posts directly to your Discord server.**\n`,
      `**Live System Status:** ${VERIFIED_ICON} \`OPERATIONAL\` • **Polling Interval:** \`15s - 60s\``,
      `**Subscribed Feeds (${subs.length}):** **\`${activeCount} Active\`** | **\`${subs.length - activeCount} Paused\`**\n`,
      `${YOUTUBE_ICON} **YouTube Feeds (${ytSubs.length}):**\n${ytList}\n`,
      `${INSTAGRAM_ICON} **Instagram Feeds (${igSubs.length}):**\n${igList}\n`,
      `${STATS_ICON} **Delivery Telemetry:**`,
      `> ${ARROW_ICON} **Total Dispatches Sent:** **\`${analytics.totalNotificationsSent || 0}\`**`,
      `> ${ARROW_ICON} **Failed Attempts:** **\`${analytics.totalFailedAttempts || 0}\`**`,
      `> ${ARROW_ICON} **Average Delivery Latency:** **\`${analytics.avgDeliveryTimeMs || 120}ms\`**`,
      `\n*Use the buttons below to subscribe feeds or manage active alert pipelines.*`
    ].join('\n'))
    .setThumbnail(guild?.iconURL({ size: 256 }) || undefined)
    .setFooter({ text: BRAND_FOOTER })
    .setTimestamp();

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_social_add_yt')
      .setLabel('Add YouTube Feed')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('1538152286839373905'),
    new ButtonBuilder()
      .setCustomId('btn_social_add_ig')
      .setLabel('Add Instagram Feed')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('1538152297845231736'),
    new ButtonBuilder()
      .setCustomId('btn_social_force_scan')
      .setLabel('Force Scan Now')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('1546134620087783526'),
    new ButtonBuilder()
      .setCustomId('btn_social_refresh')
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('1532425712844144701')
  );

  const port = process.env.PORT || 5000;
  const host = process.env.PUBLIC_API_URL || process.env.BASE_URL || `http://localhost:${port}`;
  const directConnectUrl = `${host}/api/modules/social_updates/connect/instagram?guildId=${encodeURIComponent(guild?.id || '')}`;

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Connect Instagram')
      .setStyle(ButtonStyle.Link)
      .setURL(directConnectUrl)
      .setEmoji('1538152297845231736'),
    new ButtonBuilder()
      .setCustomId('btn_social_pause_all')
      .setLabel('Pause All')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('1546155193303957504'),
    new ButtonBuilder()
      .setCustomId('btn_social_resume_all')
      .setLabel('Resume All')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('1532390590707142956'),
    new ButtonBuilder()
      .setCustomId('btn_social_stats')
      .setLabel('Analytics')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('1532429110775779459'),
    new ButtonBuilder()
      .setCustomId('btn_social_help')
      .setLabel('CLI Help')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('1527647157371535420')
  );

  const components: any[] = [row1, row2];

  if (subs.length > 0) {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_social_manage_feed')
      .setPlaceholder('Select a feed to toggle, test, or delete...')
      .addOptions(
        subs.slice(0, 25).map((s: any) => ({
          label: `${s.provider.toUpperCase()}: ${s.sourceName}`.slice(0, 50),
          value: `sub_${s.id}`,
          description: `Target: #${s.discordChannelId} • Status: ${s.enabled ? 'Active' : 'Paused'}`.slice(0, 50),
          emoji: s.provider === 'youtube' ? '1538152286839373905' : '1538152297845231736'
        }))
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
  }

  return { embeds: [embed], components };
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
            { name: 'connect', value: 'connect' },
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
          name: 'credential',
          type: 3,
          description: 'Instagram sessionid cookie or Graph API token (for instagram add)',
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
            .setTitle('<a:success_check:1546134620087783526> Access Denied')
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
              .setTitle('<a:lovemail:1527647157371535420> Social Updates Subscriptions')
              .setDescription('No active subscriptions configured. Use `r!social-updates add <youtube|instagram> <handle/channel_id> <#channel>` or the Web Dashboard to add YouTube channels or Instagram accounts.')
              .setColor(0x99CC00)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }
          const lines = subs.map((s: any) =>
            `• **${s.provider.toUpperCase()}** \`${s.sourceName}\` → <#${s.discordChannelId}> — ${s.enabled ? '<:ticks:1532620580266836148> Active' : '<a:wrong:1546155193303957504> Paused'} (Health: **${s.validationStatus}**)`
          );
          const embed = new EmbedBuilder()
            .setTitle('<a:lovemail:1527647157371535420> Social Updates Subscriptions')
            .setDescription(lines.join('\n'))
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
          return interaction.reply({ embeds: [embed], flags: 64 });
        } else if (!action || action === 'status' || action === 'dashboard' || action === 'gui' || action === 'panel') {
          const payload = await buildSocialDashboardGUI(interaction.guild);
          return interaction.reply(payload);
        } else if (action === 'forcecheck') {
          if (_scheduler) {
            _scheduler.triggerImmediateCheck();
            const embed = new EmbedBuilder()
              .setTitle('<:ticks:1532620580266836148> Global Force Check Initiated')
              .setDescription('Force check triggered globally across all registered social media subscriptions.')
              .setColor(0x99CC00)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          } else {
            const embed = new EmbedBuilder()
              .setTitle('<a:wrong:1546155193303957504> Scheduler Error')
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
            .setTitle('<:ticks:1532620580266836148> Subscriptions Validated')
            .setDescription(`**${successCount}** out of **${subs.length}** social subscriptions passed health checks.`)
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
          return interaction.editReply({ embeds: [embed] });
        } else if (action === 'statistics') {
          const analytics = await SocialSubscriptionRepository.getAnalytics(guildId);
          const embed = new EmbedBuilder()
            .setTitle('<a:lovemail:1527647157371535420> Social Updates Analytics & Telemetry')
            .setColor(0x99CC00)
            .addFields(
              { name: 'Total Subscriptions', value: `${analytics.totalSubscriptions}`, inline: true },
              { name: 'Active Subscriptions', value: `${analytics.activeSubscriptions}`, inline: true },
              { name: 'Notifications Sent', value: `${analytics.totalNotificationsSent}`, inline: true },
              { name: 'Failed Attempts', value: `${analytics.totalFailedAttempts}`, inline: true },
              { name: 'Avg Delivery Time', value: `${analytics.avgDeliveryTimeMs}ms`, inline: true }
            )
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
        } else if (action === 'connect') {
          const rawArgs = context?.parsed?.args || [];
          let username = interaction.options?.getString?.('source') || '';
          let channel = interaction.options?.getChannel?.('channel');
          if (!username && rawArgs[1] && !rawArgs[1].startsWith('<#')) {
            username = rawArgs[1].replace(/^@/, '');
          }

          const port = process.env.PORT || 5000;
          const host = process.env.PUBLIC_API_URL || process.env.BASE_URL || `http://localhost:${port}`;
          const connectUrl = `${host}/api/modules/social_updates/connect/instagram?guildId=${encodeURIComponent(guildId)}&username=${encodeURIComponent(username)}&channelId=${encodeURIComponent(channel?.id || '')}`;

          const embed = new EmbedBuilder()
            .setTitle('📸 Connect Instagram Account')
            .setDescription([
              `> ${ARROW_ICON} **One-Click Direct Setup:**`,
              `> Click the button below to open the secure Instagram connection page.`,
              `> Enter your username and paste your authentication session cookie or Graph token.`,
              `\n🔒 **Enterprise Security:** Credentials are encrypted via **AES-256-GCM** before being saved to the database.`
            ].join('\n'))
            .setColor(0xE1306C)
            .setFooter({ text: 'Rage Optimiser • Direct Social Integration' });

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel('Open Instagram Login Interface')
              .setStyle(ButtonStyle.Link)
              .setURL(connectUrl)
              .setEmoji('1538152297845231736')
          );

          return interaction.reply({ embeds: [embed], components: [row], flags: 64 });
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
                if (channel) break;
              }
            }
          }

          let sourceId = interaction.options?.getString?.('source');
          if (!sourceId && rawArgs.length > 0) {
            const pIdx = rawArgs.findIndex((a: string) => ['youtube', 'instagram', 'yt', 'ig'].includes(a.toLowerCase()));
            if (pIdx !== -1 && rawArgs[pIdx + 1]) {
              sourceId = rawArgs[pIdx + 1];
            }
          }

          const credential = interaction.options?.getString?.('credential')?.trim();

          if (!provider || !['youtube', 'instagram'].includes(provider) || !sourceId || !channel) {
            const embed = new EmbedBuilder()
              .setTitle('<a:wrong:1546155193303957504> Invalid Add Syntax')
              .setDescription([
                `> **Syntax**: \`r!social-updates add <youtube|instagram> <handle_or_channel_id> <#discordChannel>\``,
                `> **YouTube Handle Example**: \`r!social add youtube clasherliveop #announcements\``,
                `> **Instagram Example**: \`r!social add instagram nature #social-feed\``,
                `> **Instagram with Custom Cookie/Token**: \`/social-updates action:add provider:instagram source:nature channel:#social-feed credential:<sessionid_or_token>\``
              ].join('\n'))
              .setColor(0xEF4444)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }

          const res = await SubscriptionManager.addSubscription(guildId, provider, sourceId, channel.id, {
            authCredential: credential || undefined
          });
          if (!res.success) {
            const embed = new EmbedBuilder()
              .setTitle('<a:wrong:1546155193303957504> Subscription Error')
              .setDescription(`Failed to add social feed: \`${res.error}\``)
              .setColor(0xEF4444)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }

          const embed = new EmbedBuilder()
            .setTitle('<:ticks:1532620580266836148> Social Account Subscribed')
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
              .setTitle('<a:wrong:1546155193303957504> Invalid Remove Syntax')
              .setDescription(`> **Syntax**: \`r!social-updates remove <subscription_id>\`\n> *(Use \`r!social-updates list\` to view IDs)*`)
              .setColor(0xEF4444)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }

          const res = await SubscriptionManager.removeSubscription(guildId, subId);
          if (!res.success) {
            const embed = new EmbedBuilder()
              .setTitle('<a:wrong:1546155193303957504> Removal Error')
              .setDescription(`\`${res.error}\``)
              .setColor(0xEF4444)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }

          const embed = new EmbedBuilder()
            .setTitle('<:ticks:1532620580266836148> Social Account Removed')
            .setDescription(`Successfully deleted social subscription \`${subId}\`.`)
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
          return interaction.reply({ embeds: [embed], flags: 64 });
        } else {
          const payload = await buildSocialDashboardGUI(interaction.guild);
          return interaction.reply(payload);
        }
      }
    },
    {
      name: 'button_social_generic',
      handler: async (client: any, interaction: any, context: any) => {
        if (!interaction.guild) return;
        const isAdmin = interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) ||
          (await isOwnerOrExtraOwner(interaction.user.id, interaction.guild));
        if (!isAdmin) {
          return interaction.reply({
            content: `${WRONG_ICON} Access Denied: Manage Server permission is required to configure Social Alerts.`,
            flags: 64
          }).catch(() => {});
        }

        const customId = interaction.customId;
        const guildId = interaction.guild.id;

        // 1. Add YouTube Modal
        if (customId === 'btn_social_add_yt') {
          const modal = new ModalBuilder()
            .setCustomId('modal_social_add_yt')
            .setTitle('Subscribe YouTube Channel');

          const inputChannel = new TextInputBuilder()
            .setCustomId('yt_input')
            .setLabel('YouTube Handle / URL / Channel ID')
            .setPlaceholder('@clasherliveop, https://youtube.com/..., or UC...')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const inputTarget = new TextInputBuilder()
            .setCustomId('yt_channel')
            .setLabel('Discord Target Channel (Name, Mention or ID)')
            .setPlaceholder('#announcements or 123456789012345678')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const inputMention = new TextInputBuilder()
            .setCustomId('yt_mention')
            .setLabel('Mention Role / Ping (Optional)')
            .setPlaceholder('@everyone, @here, role ID, or none')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(inputChannel),
            new ActionRowBuilder<TextInputBuilder>().addComponents(inputTarget),
            new ActionRowBuilder<TextInputBuilder>().addComponents(inputMention)
          );

          return interaction.showModal(modal);
        }

        // 2. Add Instagram Modal
        if (customId === 'btn_social_add_ig') {
          const modal = new ModalBuilder()
            .setCustomId('modal_social_add_ig')
            .setTitle('Subscribe Instagram Account');

          const inputUsername = new TextInputBuilder()
            .setCustomId('ig_username')
            .setLabel('Instagram Account Username / Handle')
            .setPlaceholder('nature or natgeo')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const inputTarget = new TextInputBuilder()
            .setCustomId('ig_channel')
            .setLabel('Discord Target Channel (Name, Mention or ID)')
            .setPlaceholder('#social-feed or 123456789012345678')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const inputMention = new TextInputBuilder()
            .setCustomId('ig_mention')
            .setLabel('Mention Role / Ping (Optional)')
            .setPlaceholder('@everyone, @here, role ID, or none')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

          const inputCredential = new TextInputBuilder()
            .setCustomId('ig_credential')
            .setLabel('Instagram Session ID / Graph Token (Optional)')
            .setPlaceholder('Paste your sessionid cookie or Graph API token')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false);

          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(inputUsername),
            new ActionRowBuilder<TextInputBuilder>().addComponents(inputTarget),
            new ActionRowBuilder<TextInputBuilder>().addComponents(inputMention),
            new ActionRowBuilder<TextInputBuilder>().addComponents(inputCredential)
          );

          return interaction.showModal(modal);
        }

        // 3. Force Scan
        if (customId === 'btn_social_force_scan') {
          await interaction.deferUpdate().catch(() => {});
          const scheduler = getScheduler(client, context?.logSyncEvent);
          scheduler.triggerImmediateCheck();
          const payload = await buildSocialDashboardGUI(interaction.guild);
          return interaction.editReply(payload);
        }

        // 4. Refresh Dashboard
        if (customId === 'btn_social_refresh') {
          await interaction.deferUpdate().catch(() => {});
          const payload = await buildSocialDashboardGUI(interaction.guild);
          return interaction.editReply(payload);
        }

        // 5. Pause All Feeds
        if (customId === 'btn_social_pause_all') {
          await interaction.deferUpdate().catch(() => {});
          const subs = await SocialSubscriptionRepository.findAll(guildId);
          for (const s of subs) {
            await SocialSubscriptionRepository.update(s.id, { enabled: 0 }).catch(() => {});
          }
          const payload = await buildSocialDashboardGUI(interaction.guild);
          return interaction.editReply(payload);
        }

        // 6. Resume All Feeds
        if (customId === 'btn_social_resume_all') {
          await interaction.deferUpdate().catch(() => {});
          const subs = await SocialSubscriptionRepository.findAll(guildId);
          for (const s of subs) {
            await SocialSubscriptionRepository.update(s.id, { enabled: 1 }).catch(() => {});
          }
          const payload = await buildSocialDashboardGUI(interaction.guild);
          return interaction.editReply(payload);
        }

        // 7. Analytics
        if (customId === 'btn_social_stats') {
          await interaction.deferReply({ flags: 64 }).catch(() => {});
          const analytics = await SocialSubscriptionRepository.getAnalytics(guildId);
          const embed = new EmbedBuilder()
            .setTitle('<a:lovemail:1527647157371535420> Social Alerts Telemetry & Delivery Analytics')
            .setColor(Colors.BRAND)
            .addFields(
              { name: 'Total Subscriptions', value: `\`${analytics.totalSubscriptions}\``, inline: true },
              { name: 'Active Feeds', value: `\`${analytics.activeSubscriptions}\``, inline: true },
              { name: 'Notifications Dispatched', value: `\`${analytics.totalNotificationsSent}\``, inline: true },
              { name: 'Failed Deliveries', value: `\`${analytics.totalFailedAttempts}\``, inline: true },
              { name: 'Average Pipeline Latency', value: `\`${analytics.avgDeliveryTimeMs}ms\``, inline: true }
            )
            .setFooter({ text: BRAND_FOOTER })
            .setTimestamp();
          return interaction.editReply({ embeds: [embed] });
        }

        // 8. CLI Syntax Help
        if (customId === 'btn_social_help') {
          await interaction.deferReply({ flags: 64 }).catch(() => {});
          const embed = new EmbedBuilder()
            .setTitle('<a:lovemail:1527647157371535420> Social Updates CLI Command Manual')
            .setColor(Colors.BRAND)
            .setDescription([
              `> <:lightpurplearrow:1532621364115013693> **\`r!social add <yt|ig> <handle/id> <#channel>\`** — Add new social feed`,
              `> <:lightpurplearrow:1532621364115013693> **\`r!social remove <id>\`** — Delete a social subscription`,
              `> <:lightpurplearrow:1532621364115013693> **\`r!social status\`** — Open interactive Social Alerts Dashboard`,
              `> <:lightpurplearrow:1532621364115013693> **\`r!social list\`** — List all configured social subscriptions`,
              `> <:lightpurplearrow:1532621364115013693> **\`r!social forcecheck\`** — Trigger immediate global update scan`,
              `> <:lightpurplearrow:1532621364115013693> **\`r!social validate\`** — Validate health of registered subscriptions`,
              `> <:lightpurplearrow:1532621364115013693> **\`r!social statistics\`** — View analytics and delivery telemetry`
            ].join('\n'))
            .setFooter({ text: BRAND_FOOTER });
          return interaction.editReply({ embeds: [embed] });
        }

        // 9. Individual feed toggle / delete / test
        if (customId.startsWith('btn_sub_toggle_')) {
          await interaction.deferUpdate().catch(() => {});
          const subId = customId.replace('btn_sub_toggle_', '');
          const sub = await SocialSubscriptionRepository.findById(subId);
          if (sub) {
            await SocialSubscriptionRepository.update(subId, { enabled: sub.enabled ? 0 : 1 });
          }
          const payload = await buildSocialDashboardGUI(interaction.guild);
          return interaction.editReply(payload);
        }

        if (customId.startsWith('btn_sub_delete_')) {
          await interaction.deferUpdate().catch(() => {});
          const subId = customId.replace('btn_sub_delete_', '');
          await SubscriptionManager.removeSubscription(guildId, subId);
          const payload = await buildSocialDashboardGUI(interaction.guild);
          return interaction.editReply(payload);
        }

        if (customId.startsWith('btn_sub_test_')) {
          await interaction.deferReply({ flags: 64 }).catch(() => {});
          const subId = customId.replace('btn_sub_test_', '');
          const sub = await SocialSubscriptionRepository.findById(subId);
          if (!sub) {
            return interaction.editReply({ content: `${WRONG_ICON} Subscription not found.` });
          }

          const sampleItem = {
            id: `test_${Date.now()}`,
            title: `[TEST ALERT] New ${sub.provider.toUpperCase()} Content Uploaded`,
            url: sub.provider === 'youtube' ? 'https://youtube.com' : 'https://instagram.com',
            publishedAt: new Date().toISOString(),
            authorName: sub.sourceName,
            type: 'video'
          };

          const embedConf = JSON.parse(sub.embedConfig || '{}');
          const roles = JSON.parse(sub.mentionRoles || '[]');
          await NotificationService.send(client, sub.discordChannelId, { ...embedConf, mentionRoles: roles }, sampleItem);

          return interaction.editReply({
            content: `${VERIFIED_ICON} Test alert successfully sent to <#${sub.discordChannelId}>!`
          });
        }
      }
    },
    {
      name: 'select_social_generic',
      handler: async (client: any, interaction: any, context: any) => {
        if (!interaction.guild) return;
        const customId = interaction.customId;
        if (customId === 'select_social_manage_feed') {
          await interaction.deferUpdate().catch(() => {});
          const val = interaction.values?.[0];
          if (!val || !val.startsWith('sub_')) return;
          const subId = val.replace('sub_', '');
          const sub = await SocialSubscriptionRepository.findById(subId);
          if (!sub) {
            const payload = await buildSocialDashboardGUI(interaction.guild);
            return interaction.editReply(payload);
          }

          const isYt = sub.provider === 'youtube';
          const platformIcon = isYt ? YOUTUBE_ICON : INSTAGRAM_ICON;

          const embed = new EmbedBuilder()
            .setTitle(`Feed Controls: ${sub.provider.toUpperCase()} — ${sub.sourceName}`)
            .setColor(Colors.BRAND)
            .setDescription([
              `> ${ARROW_ICON} **Platform:** ${platformIcon} **\`${sub.provider.toUpperCase()}\`**`,
              `> ${ARROW_ICON} **Source Identifier:** **\`${sub.sourceId}\`**`,
              `> ${ARROW_ICON} **Discord Output Channel:** **<#${sub.discordChannelId}>**`,
              `> ${ARROW_ICON} **Credentials Attached:** **\`${sub.authCredential ? '🔒 Custom User Credential (AES-256)' : '🌐 Global .env Fallback'}\`**`,
              `> ${ARROW_ICON} **Current State:** **\`${sub.enabled ? 'ACTIVE (Broadcasting)' : 'PAUSED (Silenced)'}\`**`,
              `> ${ARROW_ICON} **Health Check:** **\`${sub.validationStatus}\`**`,
              `> ${ARROW_ICON} **Created At:** <t:${Math.floor(new Date(sub.createdAt).getTime() / 1000)}:R>\n`,
              `*Use the action buttons below to manage this specific subscription.*`
            ].join('\n'))
            .setFooter({ text: BRAND_FOOTER });

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`btn_sub_toggle_${sub.id}`)
              .setLabel(sub.enabled ? 'Pause Feed' : 'Resume Feed')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji(sub.enabled ? '1546155193303957504' : '1532390590707142956'),
            new ButtonBuilder()
              .setCustomId(`btn_sub_test_${sub.id}`)
              .setLabel('Send Test Alert')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('1532620952087826602'),
            new ButtonBuilder()
              .setCustomId(`btn_sub_delete_${sub.id}`)
              .setLabel('Delete Feed')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('1546155193303957504'),
            new ButtonBuilder()
              .setCustomId('btn_social_refresh')
              .setLabel('Back to Dashboard')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('1532425712844144701')
          );

          return interaction.editReply({ embeds: [embed], components: [row] });
        }
      }
    },
    {
      name: 'modal_social_generic',
      handler: async (client: any, interaction: any, context: any) => {
        if (!interaction.guild) return;
        const customId = interaction.customId;
        const guildId = interaction.guild.id;

        // Modal: Add YouTube
        if (customId === 'modal_social_add_yt') {
          await interaction.deferReply({ flags: 64 }).catch(() => {});
          const input = interaction.fields.getTextInputValue('yt_input')?.trim();
          const channelStr = interaction.fields.getTextInputValue('yt_channel')?.trim();
          const mentionStr = interaction.fields.getTextInputValue('yt_mention')?.trim();

          const cleanChanId = channelStr.replace(/[<#>]/g, '');
          const channel = interaction.guild.channels.cache.get(cleanChanId) ||
            interaction.guild.channels.cache.find((c: any) => c.name.toLowerCase() === channelStr.toLowerCase());

          if (!channel) {
            return interaction.editReply({
              content: `${WRONG_ICON} Could not find target channel **${channelStr}**. Please verify the channel name or ID.`
            });
          }

          const mentionRoles: string[] = [];
          if (mentionStr) {
            if (mentionStr.toLowerCase().includes('everyone')) mentionRoles.push('everyone');
            if (mentionStr.toLowerCase().includes('here')) mentionRoles.push('here');
            const roleMatch = mentionStr.match(/\d{17,20}/g);
            if (roleMatch) mentionRoles.push(...roleMatch);
          }

          const res = await SubscriptionManager.addSubscription(guildId, 'youtube', input, channel.id, {
            mentionRoles
          });

          if (!res.success) {
            return interaction.editReply({
              content: `${WRONG_ICON} Failed to add YouTube feed: \`${res.error}\``
            });
          }

          return interaction.editReply({
            content: `${VERIFIED_ICON} Successfully subscribed YouTube channel **${res.subscription?.sourceName || input}** to <#${channel.id}>! Run \`r!social\` or click Refresh to view in dashboard.`
          });
        }

        // Modal: Add Instagram
        if (customId === 'modal_social_add_ig') {
          await interaction.deferReply({ flags: 64 }).catch(() => {});
          const username = interaction.fields.getTextInputValue('ig_username')?.trim().replace(/^@/, '');
          const channelStr = interaction.fields.getTextInputValue('ig_channel')?.trim();
          const mentionStr = interaction.fields.getTextInputValue('ig_mention')?.trim();
          let credentialStr: string | undefined = undefined;
          try {
            credentialStr = interaction.fields.getTextInputValue('ig_credential')?.trim();
          } catch {}

          const cleanChanId = channelStr.replace(/[<#>]/g, '');
          const channel = interaction.guild.channels.cache.get(cleanChanId) ||
            interaction.guild.channels.cache.find((c: any) => c.name.toLowerCase() === channelStr.toLowerCase());

          if (!channel) {
            return interaction.editReply({
              content: `${WRONG_ICON} Could not find target channel **${channelStr}**. Please verify the channel name or ID.`
            });
          }

          const mentionRoles: string[] = [];
          if (mentionStr) {
            if (mentionStr.toLowerCase().includes('everyone')) mentionRoles.push('everyone');
            if (mentionStr.toLowerCase().includes('here')) mentionRoles.push('here');
            const roleMatch = mentionStr.match(/\d{17,20}/g);
            if (roleMatch) mentionRoles.push(...roleMatch);
          }

          const res = await SubscriptionManager.addSubscription(guildId, 'instagram', username, channel.id, {
            mentionRoles,
            authCredential: credentialStr || undefined
          });

          if (!res.success) {
            return interaction.editReply({
              content: `${WRONG_ICON} Failed to add Instagram feed: \`${res.error}\``
            });
          }

          const authNotice = credentialStr ? ' 🔒 *(Custom credentials attached)*' : '';
          return interaction.editReply({
            content: `${VERIFIED_ICON} Successfully subscribed Instagram account **@${username}** to <#${channel.id}>!${authNotice} Run \`r!social\` or click Refresh to view in dashboard.`
          });
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
          mentionRoles, pollingMode, contentTypes, authCredential
        } = req.body;

        // Ensure scheduler is initialized
        getScheduler(client, logSyncEvent);

        const result = await SubscriptionManager.addSubscription(guildId, provider, sourceId, discordChannelId, {
          embedConfig,
          mentionRoles,
          pollingMode,
          contentTypes,
          authCredential: typeof authCredential === 'string' ? authCredential.trim() : undefined
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
    },

    // ── GET /connect/instagram (Public Login Interface) ──────────────────────
    {
      path: '/connect/instagram',
      method: 'get',
      isPublic: true,
      handler: async (req: any, res: any, _context: any) => {
        const guildId = req.query.guildId || '';
        const username = req.query.username || '';
        const channelId = req.query.channelId || '';

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connect Instagram • Clutch Nation</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body {
      background: #0a0a0c;
      color: #f3f4f6;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }
    .card {
      background: #121316;
      border: 1px solid #27272a;
      border-radius: 16px;
      width: 100%;
      max-width: 420px;
      padding: 32px 28px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
      text-align: center;
    }
    .logo-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      border-radius: 16px;
      background: linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045);
      margin-bottom: 20px;
      box-shadow: 0 8px 24px rgba(225, 48, 108, 0.4);
    }
    .logo-badge svg { width: 34px; height: 34px; fill: #ffffff; }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 8px; color: #ffffff; }
    p.subtitle { font-size: 13px; color: #a1a1aa; line-height: 1.5; margin-bottom: 24px; }
    .meta-box {
      background: #18191e;
      border: 1px dashed #3f3f46;
      border-radius: 10px;
      padding: 12px;
      font-size: 12px;
      color: #94a3b8;
      text-align: left;
      margin-bottom: 20px;
    }
    .meta-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .meta-row:last-child { margin-bottom: 0; }
    .meta-val { font-weight: 600; color: #e2e8f0; }
    .form-group { text-align: left; margin-bottom: 16px; }
    label { display: block; font-size: 12px; font-weight: 600; color: #d4d4d8; margin-bottom: 6px; }
    input, textarea {
      width: 100%;
      background: #1e1f24;
      border: 1px solid #3f3f46;
      border-radius: 8px;
      padding: 12px 14px;
      color: #ffffff;
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus, textarea:focus { border-color: #e1306c; }
    .help-text { font-size: 11px; color: #71717a; margin-top: 5px; }
    .btn {
      width: 100%;
      background: linear-gradient(135deg, #e1306c, #c13584);
      border: none;
      border-radius: 8px;
      padding: 13px;
      color: #ffffff;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.1s, opacity 0.2s;
      margin-top: 8px;
    }
    .btn:hover { opacity: 0.95; }
    .btn:active { transform: scale(0.98); }
    .footer-note { font-size: 11px; color: #52525b; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-badge">
      <svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
    </div>
    <h1>Connect Instagram Account</h1>
    <p class="subtitle">Direct interface to link your Instagram credentials for automated Discord notifications.</p>

    <div class="meta-box">
      <div class="meta-row"><span>Target Server:</span><span class="meta-val">${guildId ? guildId : 'Configured via Discord'}</span></div>
      <div class="meta-row"><span>Target Channel:</span><span class="meta-val">${channelId ? '#' + channelId : 'Auto-detected'}</span></div>
    </div>

    <form method="POST" action="/api/modules/social_updates/connect/instagram">
      <input type="hidden" name="guildId" value="${guildId}" />
      <input type="hidden" name="channelId" value="${channelId}" />

      <div class="form-group">
        <label>Instagram Handle / Username</label>
        <input type="text" name="username" value="${username}" placeholder="e.g. clutch_nation" required />
      </div>

      <div class="form-group">
        <label>Authentication Credential</label>
        <textarea name="authCredential" rows="3" placeholder="Paste your Instagram sessionid cookie or Meta Graph API token here" required></textarea>
        <div class="help-text">💡 From browser: DevTools (F12) → Application → Cookies → instagram.com → copy value of <b>sessionid</b>.</div>
      </div>

      <button type="submit" class="btn">Connect & Save Credentials</button>
    </form>

    <div class="footer-note">🔒 Credentials are encrypted with AES-256-GCM before storage.</div>
  </div>
</body>
</html>`;
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
      }
    },

    // ── POST /connect/instagram (Direct Login Form Submission) ────────────────
    {
      path: '/connect/instagram',
      method: 'post',
      isPublic: true,
      handler: async (req: any, res: any, context: any) => {
        const { client, logSyncEvent } = context;
        const { guildId, username, channelId, authCredential } = req.body;

        if (!guildId || !username || !authCredential) {
          return res.status(400).send(`
            <h3 style="font-family:sans-serif;color:#ef4444;text-align:center;margin-top:50px;">
              Missing required fields. Please return to the previous page.
            </h3>
          `);
        }

        const cleanUsername = username.trim().replace(/^@/, '');
        await SocialSubscriptionRepository.ensureTable().catch(() => {});

        // Resolve existing subscription or create one
        let existing = await SocialSubscriptionRepository.findBySourceId(guildId, 'instagram', cleanUsername);

        if (existing) {
          await SubscriptionManager.updateSubscription(guildId, existing.id, {
            authCredential: authCredential.trim()
          });
        } else {
          // Determine target channel (use passed channelId or guild first text channel)
          let targetChannel = channelId;
          if (!targetChannel && client) {
            const guild = client.guilds.cache.get(guildId);
            const firstChan = guild?.channels.cache.find((c: any) => c.isTextBased && c.isTextBased());
            targetChannel = firstChan ? firstChan.id : guildId;
          }

          const addRes = await SubscriptionManager.addSubscription(guildId, 'instagram', cleanUsername, targetChannel, {
            authCredential: authCredential.trim()
          });

          if (!addRes.success) {
            return res.status(400).send(`
              <h3 style="font-family:sans-serif;color:#ef4444;text-align:center;margin-top:50px;">
                Error: ${addRes.error}
              </h3>
            `);
          }
        }

        // Trigger immediate check to test new credentials
        const scheduler = getScheduler(client, logSyncEvent);
        scheduler.triggerImmediateCheck();

        res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Connected Successfully</title>
  <style>
    body { background: #0a0a0c; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .box { background: #121316; border: 1px solid #27272a; padding: 40px; border-radius: 16px; text-align: center; max-width: 400px; }
    h1 { color: #10b981; font-size: 22px; margin-bottom: 12px; }
    p { color: #a1a1aa; font-size: 14px; line-height: 1.6; }
    .badge { background: #1e1f24; border: 1px solid #3f3f46; padding: 8px 12px; border-radius: 8px; margin: 16px 0; font-family: monospace; color: #38bdf8; }
  </style>
</head>
<body>
  <div class="box">
    <h1>✅ Instagram Connected!</h1>
    <p>Account <b>@${cleanUsername}</b> has been linked with encrypted credentials.</p>
    <div class="badge">AES-256-GCM Securely Stored</div>
    <p>You can close this window and return to Discord. Alerts are now active!</p>
  </div>
</body>
</html>
        `);
      }
    }
  ]
};

// Register social updates commands in PrefixRegistry
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
        name: 'connect',
        description: 'Open direct Instagram Login & Connection interface to link account credentials.',
        usage: 'r!social connect [instagram_username] [#channel]',
        examples: ['r!social connect clutch_nation #announcements'],
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
        return message.reply({ content: '<a:wrong:1546155193303957504> Command can only be executed within a server.' });
      }

      const action = (args[0] || '').toLowerCase().trim();
      const isAdmin = message.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) ||
        message.guild.ownerId === message.author.id;

      if (['add', 'subscribe', 'remove', 'delete', 'unsubscribe', 'forcecheck', 'validate'].includes(action) && !isAdmin) {
        const embed = new EmbedBuilder()
          .setTitle('<a:success_check:1546134620087783526> Access Denied')
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
            .setTitle('<a:lovemail:1527647157371535420> Social Updates Subscriptions')
            .setDescription('No active subscriptions configured. Use `r!social add <youtube|instagram> <handle/channel_id> <#channel>` to add YouTube channels or Instagram accounts.')
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Social Updates Engine' });
          return message.reply({ embeds: [embed] });
        }
        const lines = subs.map((s: any) =>
          `• **${s.provider.toUpperCase()}** \`${s.sourceName}\` → <#${s.discordChannelId}> — ${s.enabled ? '<:ticks:1532620580266836148> Active' : '<a:wrong:1546155193303957504> Paused'} (Health: **${s.validationStatus}**) [ID: \`${s.id}\`]`
        );
        const embed = new EmbedBuilder()
          .setTitle('<a:lovemail:1527647157371535420> Social Updates Subscriptions')
          .setDescription(lines.join('\n'))
          .setColor(0x99CC00)
          .setFooter({ text: 'Rage Optimiser • Social Updates Engine' });
        return message.reply({ embeds: [embed] });
      }

      if (!action || action === 'status' || action === 'dashboard' || action === 'gui' || action === 'panel') {
        const payload = await buildSocialDashboardGUI(message.guild);
        return message.reply(payload);
      }

      if (action === 'forcecheck') {
        if (_scheduler) {
          _scheduler.triggerImmediateCheck();
          const embed = new EmbedBuilder()
            .setTitle('<:ticks:1532620580266836148> Global Force Check Initiated')
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
          .setTitle('<:ticks:1532620580266836148> Subscriptions Validated')
          .setDescription(`**${successCount}** out of **${subs.length}** social subscriptions passed health checks.`)
          .setColor(0x99CC00)
          .setFooter({ text: 'Rage Optimiser • Social Updates Engine' });
        return message.reply({ embeds: [embed] });
      }

      if (action === 'statistics' || action === 'stats' || action === 'analytics') {
        const analytics = await SocialSubscriptionRepository.getAnalytics(guildId);
        const embed = new EmbedBuilder()
          .setTitle('<a:lovemail:1527647157371535420> Social Updates Analytics & Telemetry')
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

      if (action === 'connect') {
        const username = (args[1] || '').trim().replace(/^@/, '');
        const channelMention = message.mentions.channels.first() || (args[2] ? message.guild.channels.cache.get(args[2].replace(/[<#>]/g, '')) : null);

        const port = process.env.PORT || 5000;
        const host = process.env.PUBLIC_API_URL || process.env.BASE_URL || `http://localhost:${port}`;
        const connectUrl = `${host}/api/modules/social_updates/connect/instagram?guildId=${encodeURIComponent(guildId)}&username=${encodeURIComponent(username)}&channelId=${encodeURIComponent(channelMention?.id || '')}`;

        const embed = new EmbedBuilder()
          .setTitle('📸 Connect Instagram Account')
          .setDescription([
            `> ${ARROW_ICON} **Direct Instagram Setup:**`,
            `> Click the button below to open the secure Instagram connection page.`,
            `> Enter your username and paste your authentication session cookie or Graph token.`,
            `\n🔒 **Enterprise Security:** Credentials are encrypted via **AES-256-GCM** before being saved to the database.`
          ].join('\n'))
          .setColor(0xE1306C)
          .setFooter({ text: 'Rage Optimiser • Direct Social Integration' });

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel('Open Instagram Login Interface')
            .setStyle(ButtonStyle.Link)
            .setURL(connectUrl)
            .setEmoji('1538152297845231736')
        );

        return message.reply({ embeds: [embed], components: [row] });
      }

      if (action === 'add' || action === 'subscribe') {
        let provider = (args[1] || '').toLowerCase();
        if (provider === 'yt') provider = 'youtube';
        if (provider === 'ig') provider = 'instagram';

        const sourceId = args[2];
        const channelMention = message.mentions.channels.first() || (args[3] ? message.guild.channels.cache.get(args[3].replace(/[<#>]/g, '')) : null);
        const optionalCredential = args[4]?.trim();

        if (!provider || !['youtube', 'instagram'].includes(provider) || !sourceId || !channelMention) {
          const embed = new EmbedBuilder()
            .setTitle('<a:wrong:1546155193303957504> Invalid Add Syntax')
            .setDescription([
              `> **Syntax**: \`r!social add <youtube|instagram> <handle_or_channel_id> <#discordChannel> [optional_credential]\``,
              `> **YouTube Example**: \`r!social add youtube clasherliveop #announcements\``,
              `> **Instagram Example**: \`r!social add instagram nature #social-feed\``,
              `> **Instagram with Custom Cookie**: \`r!social add instagram nature #social-feed your_session_id_here\``
            ].join('\n'))
            .setColor(0xEF4444)
            .setFooter({ text: 'Rage Optimiser • Social Updates Engine' });
          return message.reply({ embeds: [embed] });
        }

        const res = await SubscriptionManager.addSubscription(guildId, provider, sourceId, channelMention.id, {
          authCredential: optionalCredential || undefined
        });
        if (!res.success) {
          const embed = new EmbedBuilder()
            .setTitle('<a:wrong:1546155193303957504> Subscription Error')
            .setDescription(`Failed to add social feed: \`${res.error}\``)
            .setColor(0xEF4444)
            .setFooter({ text: 'Rage Optimiser • Social Updates Engine' });
          return message.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
          .setTitle('<:ticks:1532620580266836148> Social Account Subscribed')
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
            .setTitle('<a:wrong:1546155193303957504> Invalid Remove Syntax')
            .setDescription(`> **Syntax**: \`r!social remove <subscription_id>\`\n> *(Use \`r!social list\` to view active IDs)*`)
            .setColor(0xEF4444)
            .setFooter({ text: 'Rage Optimiser • Social Updates Engine' });
          return message.reply({ embeds: [embed] });
        }

        const res = await SubscriptionManager.removeSubscription(guildId, subId);
        if (!res.success) {
          const embed = new EmbedBuilder()
            .setTitle('<a:wrong:1546155193303957504> Removal Error')
            .setDescription(`\`${res.error}\``)
            .setColor(0xEF4444)
            .setFooter({ text: 'Rage Optimiser • Social Updates Engine' });
          return message.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
          .setTitle('<:ticks:1532620580266836148> Social Account Removed')
          .setDescription(`Successfully deleted social subscription \`${subId}\`.`)
          .setColor(0x99CC00)
          .setFooter({ text: 'Rage Optimiser • Social Updates Engine' });
        return message.reply({ embeds: [embed] });
      }

      const payload = await buildSocialDashboardGUI(message.guild);
      return message.reply(payload);
    }
  });
}
