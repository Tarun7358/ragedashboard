import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';
import { IGiveaway } from '../../models/index.js';
import {
  Colors, Embeds, Components,
  buildRichCard, buildListCard, buildStatusCard,
  fmt, ts,
} from '../../core/UIFactory.js';

const activeGiveaways: Map<string, NodeJS.Timeout> = new Map();

function makeId() { return `gw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
function parseMs(str: string): number {
  const unit = str.slice(-1);
  const val = parseInt(str);
  if (unit === 's') return val * 1000;
  if (unit === 'm') return val * 60_000;
  if (unit === 'h') return val * 3_600_000;
  if (unit === 'd') return val * 86_400_000;
  return val * 60_000;
}

async function endGiveaway(client: any, giveaway: IGiveaway, context: any, reason = 'Ended naturally') {
  const gws: IGiveaway[] = context.getModulesState?.()?.find((m: any) => m.id === 'giveaway')?.config?.giveaways || [];
  const gw = gws.find(g => g.id === giveaway.id);
  if (!gw || gw.ended) return;

  const entries = gw.entries || [];
  const winnerCount = Math.min(gw.winnerCount, entries.length);
  const shuffled = [...entries].sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, winnerCount);

  gw.ended = true;
  gw.winnerIds = winners;
  context.updateModuleConfig('giveaway', { giveaways: gws });

  try {
    const guild = await client.guilds.fetch(gw.guildId).catch(() => null);
    if (!guild) return;
    const channel = await guild.channels.fetch(gw.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const msg = gw.messageId ? await channel.messages.fetch(gw.messageId).catch(() => null) : null;
    const winnerMentions = winners.length > 0 ? winners.map((id: string) => `<@${id}>`).join(', ') : 'No valid entries';

    // End card — Components V2
    const { embeds, components, flags } = buildRichCard({
      emoji: '<:booster:1532621228492460172>',
      title: `Giveaway Ended — ${gw.prize}`,
      accentColor: Colors.GOLD,
      fields: [
        { label: '<:member:1532621317487071426> Winners',  value: winnerMentions },
        { label: '📦 Prize',    value: gw.prize },
        { label: '👤 Hosted by', value: gw.hostTag },
        { label: '<:information:1532621274092929124> Reason',   value: reason },
      ],
      footerNote: `Rage Optimiser Enterprise  •  Giveaway Manager`,
    });

    if (msg) {
      await msg.edit({ embeds, components, flags }).catch(() => {});
    }

    if (winners.length > 0) {
      await channel.send({ content: `🎉 Congratulations ${winnerMentions}! You won **${gw.prize}**!` });
    } else {
      await channel.send({ content: `😢 No valid entries for **${gw.prize}**.` });
    }

    context.logSyncEvent(`[Giveaway] Ended giveaway "${gw.prize}" (${winners.length} winner(s)).`, 'success');
  } catch (err) { console.error('[Giveaway] end error:', err); }
}

export const GiveawayManifest: ModuleManifest = {
  id: 'giveaway',
  name: 'Giveaway Manager',
  version: '1.0.0',
  description: 'Full giveaway management: create, end, reroll, list, delete, with persistent storage.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const active = (config.giveaways || []).filter((g: IGiveaway) => !g.ended).length;
      return { progress: 100, errors: [] };
    }
  },
  commands: [
    {
      name: 'giveaway',
      description: 'Giveaway management',
      options: [
        {
          name: 'create',
          description: 'Create a new giveaway',
          type: 1,
          options: [
            { name: 'duration', type: 3, description: 'Duration (e.g. 1h, 30m, 1d)', required: true },
            { name: 'prize', type: 3, description: 'The giveaway prize', required: true },
            { name: 'winners', type: 4, description: 'Number of winners (default 1)', required: false },
            { name: 'channel', type: 7, description: 'Channel for the giveaway (defaults to current)', required: false, channel_types: [0, 5] },
            { name: 'description', type: 3, description: 'Giveaway description', required: false },
            { name: 'required_role', type: 8, description: 'Required role to enter', required: false }
          ]
        },
        {
          name: 'end',
          description: 'End a giveaway early',
          type: 1,
          options: [{ name: 'id', type: 3, description: 'Giveaway ID', required: true }]
        },
        {
          name: 'reroll',
          description: 'Reroll winners for a giveaway',
          type: 1,
          options: [
            { name: 'id', type: 3, description: 'Giveaway ID', required: true },
            { name: 'winners', type: 4, description: 'Number of new winners (default 1)', required: false }
          ]
        },
        {
          name: 'list',
          description: 'List active giveaways',
          type: 1
        },
        {
          name: 'delete',
          description: 'Delete a giveaway without picking winners',
          type: 1,
          options: [{ name: 'id', type: 3, description: 'Giveaway ID', required: true }]
        },
        {
          name: 'info',
          description: 'View info about a specific giveaway',
          type: 1,
          options: [{ name: 'id', type: 3, description: 'Giveaway ID', required: true }]
        },
        {
          name: 'pause',
          description: 'Pause an active giveaway',
          type: 1,
          options: [{ name: 'id', type: 3, description: 'Giveaway ID', required: true }]
        },
        {
          name: 'resume',
          description: 'Resume a paused giveaway',
          type: 1,
          options: [{ name: 'id', type: 3, description: 'Giveaway ID', required: true }]
        },
        {
          name: 'edit',
          description: 'Edit prize or duration of giveaway',
          type: 1,
          options: [
            { name: 'id', type: 3, description: 'Giveaway ID', required: true },
            { name: 'prize', type: 3, description: 'New prize name', required: false },
            { name: 'duration', type: 3, description: 'New duration (e.g. 2h)', required: false }
          ]
        },
        {
          name: 'cancel',
          description: 'Cancel a giveaway',
          type: 1,
          options: [{ name: 'id', type: 3, description: 'Giveaway ID', required: true }]
        },
        {
          name: 'history',
          description: 'Show recent giveaway host history',
          type: 1
        },
        {
          name: 'stats',
          description: 'Giveaway system throughput rates stats',
          type: 1
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_giveaway',
      handler: async (client: any, interaction: any, context: any) => {
        const sub = interaction.options.getSubcommand(false);
        const modules = context.getModulesState ? context.getModulesState() : [];
        const gwMod = modules.find((m: any) => m.id === 'giveaway');

        if (!gwMod || gwMod.status !== 'enabled') {
          return interaction.reply({ content: '❌ Giveaway module is not enabled.', flags: 64 });
        }

        let giveaways: IGiveaway[] = gwMod.config?.giveaways || [];
        const saveGiveaways = (updated: IGiveaway[]) => context.updateModuleConfig('giveaway', { giveaways: updated });

        // ─── CREATE ───────────────────────────────────────────────
        if (sub === 'create') {
          if (!interaction.memberPermissions?.has('ManageGuild')) {
            return interaction.reply({ content: '🔒 Manage Server permission required.', flags: 64 });
          }
          const durationStr = interaction.options.getString('duration');
          const prize = interaction.options.getString('prize');
          const winnerCount = interaction.options.getInteger('winners') || 1;
          const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
          const description = interaction.options.getString('description') || '';
          const requiredRole = interaction.options.getRole('required_role');

          const ms = parseMs(durationStr);
          const endsAt = new Date(Date.now() + ms);
          const gwId = makeId();

          // Giveaway panel — Components V2 with enter button
          const { embeds, components, flags } = buildRichCard({
            emoji: '<:booster:1532621228492460172>',
            title: `GIVEAWAY — ${prize}`,
            description: description || undefined,
            accentColor: Colors.GOLD,
            fields: [
              { label: '<:member:1532621317487071426> Winners',         value: `**${winnerCount}** winner${winnerCount > 1 ? 's' : ''}` },
              { label: '<:timer:1532620491662037123> Ends',            value: ts(Math.floor(endsAt.getTime() / 1000)) },
              { label: '👤 Hosted By',       value: `${interaction.user}` },
              ...(requiredRole ? [{ label: '🎭 Required Role', value: `${requiredRole}` }] : []),
              { label: '🆔 Giveaway ID',     value: `\`${gwId}\`` },
            ],
            footerNote: `Rage Optimiser Enterprise  •  Giveaway Manager  •  Click Enter to participate!`,
            actionRow: new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`gw_enter_${gwId}`)
                .setLabel('Enter Giveaway')
                .setStyle(ButtonStyle.Success)
                .setEmoji('<:booster:1532621228492460172>')
            ) as any,
          });

          await interaction.deferReply({ flags: 64 });
          const msg = await targetChannel.send({ embeds, components, flags });

          const giveaway: IGiveaway = {
            id: gwId,
            guildId: interaction.guildId,
            channelId: targetChannel.id,
            messageId: msg.id,
            hostId: interaction.user.id,
            hostTag: interaction.user.username,
            prize,
            description,
            winnerCount,
            endsAt,
            ended: false,
            entries: [],
            requiredRoleId: requiredRole?.id,
            createdAt: new Date()
          };

          giveaways.push(giveaway);
          saveGiveaways(giveaways);
          context.logSyncEvent(`[Giveaway] Created giveaway "${prize}" by ${interaction.user.username}.`, 'success');

          const timeout = setTimeout(() => endGiveaway(client, giveaway, context), ms);
          activeGiveaways.set(gwId, timeout);

          await interaction.editReply({ content: `✅ Giveaway started in ${targetChannel}! ID: \`${gwId}\`` });
        }

        // ─── END ──────────────────────────────────────────────────
        else if (sub === 'end') {
          if (!interaction.memberPermissions?.has('ManageGuild')) {
            return interaction.reply({ content: '🔒 Manage Server permission required.', flags: 64 });
          }
          const id = interaction.options.getString('id');
          const gw = giveaways.find(g => g.id === id);
          if (!gw) return interaction.reply({ content: `❌ Giveaway \`${id}\` not found.`, flags: 64 });
          if (gw.ended) return interaction.reply({ content: '❌ This giveaway has already ended.', flags: 64 });

          const existing = activeGiveaways.get(id);
          if (existing) { clearTimeout(existing); activeGiveaways.delete(id); }

          await endGiveaway(client, gw, context, 'Manually ended');
          await interaction.reply({ content: `✅ Giveaway \`${id}\` ended early.`, flags: 64 });
        }

        // ─── REROLL ───────────────────────────────────────────────
        else if (sub === 'reroll') {
          if (!interaction.memberPermissions?.has('ManageGuild')) {
            return interaction.reply({ content: '🔒 Manage Server permission required.', flags: 64 });
          }
          const id = interaction.options.getString('id');
          const rerollCount = interaction.options.getInteger('winners') || 1;
          const gw = giveaways.find(g => g.id === id);
          if (!gw || !gw.ended) return interaction.reply({ content: `❌ Giveaway \`${id}\` not found or still active.`, flags: 64 });

          const entries = gw.entries || [];
          const newWinners = [...entries].sort(() => Math.random() - 0.5).slice(0, rerollCount);
          gw.winnerIds = newWinners;
          saveGiveaways(giveaways);

          const mentions = newWinners.map((id: string) => `<@${id}>`).join(', ');
          const { embeds, components } = buildStatusCard({
            emoji: '<:booster:1532621228492460172>',
            title: 'Reroll Complete!',
            body: `New winner(s): ${mentions}`,
            accentColor: Colors.BRAND,
          });
          await interaction.reply({ embeds, components });
        }

        // ─── LIST ─────────────────────────────────────────────────
        else if (sub === 'list') {
          const active = giveaways.filter(g => !g.ended);
          if (active.length === 0) return interaction.reply({ content: '📋 No active giveaways.', flags: 64 });
          const lines = active.map(g =>
            `<:booster:1532621228492460172> **${g.prize}** — Ends ${ts(Math.floor(new Date(g.endsAt).getTime() / 1000))} — ID: \`${g.id}\``
          );
          const { embeds, components } = buildListCard({
            emoji: '<:booster:1532621228492460172>',
            title: `Active Giveaways (${active.length})`,
            entries: lines,
            accentColor: Colors.GOLD,
          });
          await interaction.reply({ embeds, components });
        }

        // ─── DELETE ───────────────────────────────────────────────
        else if (sub === 'delete') {
          if (!interaction.memberPermissions?.has('ManageGuild')) {
            return interaction.reply({ content: '🔒 Manage Server permission required.', flags: 64 });
          }
          const id = interaction.options.getString('id');
          if (!giveaways.find(g => g.id === id)) return interaction.reply({ content: `❌ Giveaway \`${id}\` not found.`, flags: 64 });
          const existing = activeGiveaways.get(id);
          if (existing) { clearTimeout(existing); activeGiveaways.delete(id); }
          saveGiveaways(giveaways.filter(g => g.id !== id));
          context.logSyncEvent(`[Giveaway] Deleted giveaway "${id}" by ${interaction.user.username}.`, 'info');
          await interaction.reply({ content: `🗑️ Giveaway \`${id}\` deleted.`, flags: 64 });
        }

        // ─── INFO ─────────────────────────────────────────────────
        else if (sub === 'info') {
          const id = interaction.options.getString('id');
          const gw = giveaways.find(g => g.id === id);
          if (!gw) return interaction.reply({ content: `❌ Giveaway \`${id}\` not found.`, flags: 64 });

          const statusIcon = (gw as any).paused ? '⏸️ Paused' : gw.ended ? '<a:approved:1532390590707142956> Ended' : '<a:approved:1532390590707142956> Active';
          const { embeds, components, flags } = buildRichCard({
            emoji: '<:booster:1532621228492460172>',
            title: `Giveaway Info — ${gw.prize}`,
            accentColor: Colors.GOLD,
            fields: [
              { label: '<:information:1532621274092929124> Status',       value: statusIcon },
              { label: '<:member:1532621317487071426> Winners',      value: `${gw.winnerCount}` },
              { label: '<:information:1532621274092929124> Entries',      value: `${(gw.entries || []).length}` },
              { label: '👤 Host',         value: gw.hostTag },
              { label: '<:timer:1532620491662037123> Ends / Ended', value: ts(Math.floor(new Date(gw.endsAt).getTime() / 1000), 'F') },
              { label: '🆔 ID',           value: `\`${gw.id}\`` },
              ...(gw.ended && gw.winnerIds && gw.winnerIds.length > 0
                ? [{ label: '<:member:1532621317487071426> Winners', value: gw.winnerIds.map((id: string) => `<@${id}>`).join(', ') }]
                : []),
            ],
            footerNote: `Rage Optimiser Enterprise  •  Giveaway Manager`,
          });
          await interaction.reply({ embeds, components, flags });
        }

        else if (sub === 'pause') {
          if (!interaction.memberPermissions?.has('ManageGuild')) {
            return interaction.reply({ content: '🔒 Manage Server permission required.', flags: 64 });
          }
          const id = interaction.options.getString('id');
          const gw = giveaways.find(g => g.id === id) as any;
          if (!gw) return interaction.reply({ content: `❌ Giveaway \`${id}\` not found.`, flags: 64 });
          if (gw.ended) return interaction.reply({ content: '❌ This giveaway has already ended.', flags: 64 });

          const existing = activeGiveaways.get(id);
          if (existing) { clearTimeout(existing); activeGiveaways.delete(id); }
          gw.paused = true;
          saveGiveaways(giveaways);
          context.logSyncEvent(`[Giveaway] Paused giveaway "${id}".`, 'warn');
          return interaction.reply({ content: `⏸️ Giveaway \`${id}\` has been paused.`, flags: 64 });
        }

        else if (sub === 'resume') {
          if (!interaction.memberPermissions?.has('ManageGuild')) {
            return interaction.reply({ content: '🔒 Manage Server permission required.', flags: 64 });
          }
          const id = interaction.options.getString('id');
          const gw = giveaways.find(g => g.id === id) as any;
          if (!gw) return interaction.reply({ content: `❌ Giveaway \`${id}\` not found.`, flags: 64 });
          if (!gw.paused) return interaction.reply({ content: '❌ This giveaway is not paused.', flags: 64 });

          gw.paused = false;
          const ms = new Date(gw.endsAt).getTime() - Date.now();
          if (ms <= 0) {
            await endGiveaway(client, gw, context, 'Ended upon resume');
          } else {
            const timeout = setTimeout(() => endGiveaway(client, gw, context), ms);
            activeGiveaways.set(gw.id, timeout);
          }
          saveGiveaways(giveaways);
          context.logSyncEvent(`[Giveaway] Resumed giveaway "${id}".`, 'success');
          return interaction.reply({ content: `▶️ Giveaway \`${id}\` has been resumed.`, flags: 64 });
        }

        else if (sub === 'edit') {
          if (!interaction.memberPermissions?.has('ManageGuild')) {
            return interaction.reply({ content: '🔒 Manage Server permission required.', flags: 64 });
          }
          const id = interaction.options.getString('id');
          const prize = interaction.options.getString('prize');
          const durationStr = interaction.options.getString('duration');
          const gw = giveaways.find(g => g.id === id) as any;
          if (!gw) return interaction.reply({ content: `❌ Giveaway \`${id}\` not found.`, flags: 64 });

          if (prize) gw.prize = prize;
          if (durationStr) {
            const ms = parseMs(durationStr);
            gw.endsAt = new Date(Date.now() + ms);
            const existing = activeGiveaways.get(id);
            if (existing) { clearTimeout(existing); activeGiveaways.delete(id); }
            const timeout = setTimeout(() => endGiveaway(client, gw, context), ms);
            activeGiveaways.set(gw.id, timeout);
          }
          saveGiveaways(giveaways);
          context.logSyncEvent(`[Giveaway] Edited giveaway "${id}".`, 'info');
          return interaction.reply({ content: `📝 Giveaway \`${id}\` has been edited.`, flags: 64 });
        }

        else if (sub === 'cancel') {
          if (!interaction.memberPermissions?.has('ManageGuild')) {
            return interaction.reply({ content: '🔒 Manage Server permission required.', flags: 64 });
          }
          const id = interaction.options.getString('id');
          if (!giveaways.find(g => g.id === id)) return interaction.reply({ content: `❌ Giveaway \`${id}\` not found.`, flags: 64 });
          const existing = activeGiveaways.get(id);
          if (existing) { clearTimeout(existing); activeGiveaways.delete(id); }
          saveGiveaways(giveaways.filter(g => g.id !== id));
          context.logSyncEvent(`[Giveaway] Canceled giveaway "${id}".`, 'warn');
          return interaction.reply({ content: `❌ Giveaway \`${id}\` has been canceled.`, flags: 64 });
        }

        else if (sub === 'history') {
          const past = giveaways.filter(g => g.ended);
          if (past.length === 0) return interaction.reply({ content: '📋 No giveaway history cached.', flags: 64 });
          const lines = past.slice(0, 10).map(g =>
            `🏆 **${g.prize}** — Won by ${g.winnerIds?.map(w => `<@${w}>`).join(', ') || 'no one'} — \`${g.id}\``
          );
          const { embeds, components } = buildListCard({
            emoji: '<:timer:1532620491662037123>',
            title: 'Giveaway History',
            subtitle: `Last ${Math.min(10, past.length)} giveaways`,
            entries: lines,
            accentColor: Colors.MUTED,
          });
          return interaction.reply({ embeds, components });
        }

        else if (sub === 'stats') {
          const total = giveaways.length;
          const active = giveaways.filter(g => !g.ended).length;
          const { embeds, components, flags } = buildRichCard({
            emoji: '<:stats:1532429110775779459>',
            title: 'Giveaway System Statistics',
            accentColor: Colors.BRAND,
            fields: [
              { label: '<a:approved:1532390590707142956> Active Giveaways', value: `**${active}**` },
              { label: '<a:approved:1532390590707142956> Ended Giveaways',  value: `**${total - active}**` },
              { label: '📦 Total Hosted',     value: `**${total}**` },
            ],
            footerNote: `Rage Optimiser Enterprise  •  Giveaway Manager`,
          });
          return interaction.reply({ embeds, components, flags });
        }
      }
    },
    {
      name: 'button_gw_enter_generic',
      handler: async (client: any, interaction: any, context: any) => {
        if (!interaction.customId?.startsWith('gw_enter_')) return;
        const gwId = interaction.customId.replace('gw_enter_', '');

        const modules = context.getModulesState ? context.getModulesState() : [];
        const gwMod = modules.find((m: any) => m.id === 'giveaway');
        if (!gwMod || gwMod.status !== 'enabled') return;

        let giveaways: IGiveaway[] = gwMod.config?.giveaways || [];
        const gw = giveaways.find(g => g.id === gwId);
        if (!gw || gw.ended) {
          return interaction.reply({ content: '❌ This giveaway has already ended.', flags: 64 });
        }

        if (gw.requiredRoleId) {
          const hasr = interaction.member?.roles?.cache?.has(gw.requiredRoleId);
          if (!hasr) return interaction.reply({ content: `❌ You need <@&${gw.requiredRoleId}> to enter this giveaway.`, flags: 64 });
        }

        if (!gw.entries) gw.entries = [];
        if (gw.entries.includes(interaction.user.id)) {
          return interaction.reply({ content: '✅ You are already entered in this giveaway!', flags: 64 });
        }

        gw.entries.push(interaction.user.id);
        context.updateModuleConfig('giveaway', { giveaways });
        context.logSyncEvent(`[Giveaway] ${interaction.user.username} entered giveaway "${gw.prize}".`, 'info');
        await interaction.reply({ content: `🎉 You've entered the giveaway for **${gw.prize}**! Good luck!`, flags: 64 });
      }
    },
    {
      name: 'ready',
      handler: async (client: any, _: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const gwMod = modules.find((m: any) => m.id === 'giveaway');
        if (!gwMod) return;
        const giveaways: IGiveaway[] = gwMod.config?.giveaways || [];
        const now = Date.now();
        for (const gw of giveaways.filter(g => !g.ended)) {
          const ms = new Date(gw.endsAt).getTime() - now;
          if (ms <= 0) {
            await endGiveaway(client, gw, context, 'Catch-up after restart');
          } else {
            const timeout = setTimeout(() => endGiveaway(client, gw, context), ms);
            activeGiveaways.set(gw.id, timeout);
          }
        }
      }
    }
  ],
  routes: [
    {
      path: '/state',
      method: 'get',
      handler: async (req: any, res: any, context: any) => {
        const modules = context.getModulesState();
        const mod = modules.find((m: any) => m.id === 'giveaway');
        res.json({ giveaways: mod?.config?.giveaways || [] });
      }
    }
  ]
};
