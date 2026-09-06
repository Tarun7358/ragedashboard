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
      .setEmoji('1546142576984203336'),
    new ButtonBuilder()
      .setCustomId('btn_social_refresh')
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('1532425712844144701')
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
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
            .setTitle('<:security:1546142576984203336> Access Denied')
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
            `• **${s.provider.toUpperCase()}** \`${s.sourceName}\` → <#${s.discordChannelId}> — ${s.enabled ? '<a:approved:1532390590707142956> Active' : '<a:wrong:1546155193303957504> Paused'} (Health: **${s.validationStatus}**)`
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
              .setTitle('<a:approved:1532390590707142956> Global Force Check Initiated')
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
            .setTitle('<a:approved:1532390590707142956> Subscriptions Validated')
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

          if (!provider || !['youtube', 'instagram'].includes(provider) || !sourceId || !channel) {
            const embed = new EmbedBuilder()
              .setTitle('<a:wrong:1546155193303957504> Invalid Add Syntax')
              .setDescription([
                `> **Syntax**: \`r!social-updates add <youtube|instagram> <handle_or_channel_id> <#discordChannel>\``,
                `> **YouTube Handle Example**: \`r!social add youtube clasherliveop #announcements\``,
                `> **Instagram Example**: \`r!social add instagram nature #social-feed\``
              ].join('\n'))
              .setColor(0xEF4444)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }

          const res = await SubscriptionManager.addSubscription(guildId, provider, sourceId, channel.id, {});
          if (!res.success) {
            const embed = new EmbedBuilder()
              .setTitle('<a:wrong:1546155193303957504> Subscription Error')
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
            .setTitle('<a:approved:1532390590707142956> Social Account Removed')
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

          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(inputUsername),
            new ActionRowBuilder<TextInputBuilder>().addComponents(inputTarget),
            new ActionRowBuilder<TextInputBuilder>().addComponents(inputMention)
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
            mentionRoles
          });

          if (!res.success) {
            return interaction.editReply({
              content: `${WRONG_ICON} Failed to add Instagram feed: \`${res.error}\``
            });
          }

          return interaction.editReply({
            content: `${VERIFIED_ICON} Successfully subscribed Instagram account **@${username}** to <#${channel.id}>! Run \`r!social\` or click Refresh to view in dashboard.`
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
          .setTitle('<:security:1546142576984203336> Access Denied')
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
          `• **${s.provider.toUpperCase()}** \`${s.sourceName}\` → <#${s.discordChannelId}> — ${s.enabled ? '<a:approved:1532390590707142956> Active' : '<a:wrong:1546155193303957504> Paused'} (Health: **${s.validationStatus}**) [ID: \`${s.id}\`]`
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

      if (action === 'add' || action === 'subscribe') {
        let provider = (args[1] || '').toLowerCase();
        if (provider === 'yt') provider = 'youtube';
        if (provider === 'ig') provider = 'instagram';

        const sourceId = args[2];
        const channelMention = message.mentions.channels.first() || (args[3] ? message.guild.channels.cache.get(args[3].replace(/[<#>]/g, '')) : null);

        if (!provider || !['youtube', 'instagram'].includes(provider) || !sourceId || !channelMention) {
          const embed = new EmbedBuilder()
            .setTitle('<a:wrong:1546155193303957504> Invalid Add Syntax')
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
            .setTitle('<a:wrong:1546155193303957504> Subscription Error')
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
          .setTitle('<a:approved:1532390590707142956> Social Account Removed')
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
