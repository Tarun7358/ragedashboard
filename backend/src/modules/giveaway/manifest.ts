import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { IGiveaway } from '../../models/index.js';

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

    const embed = new EmbedBuilder()
      .setTitle('🎉 Giveaway Ended!')
      .setDescription(`**Prize:** ${gw.prize}\n**Winners:** ${winnerMentions}`)
      .setColor('#f1c40f')
      .setFooter({ text: `Hosted by ${gw.hostTag} • ${reason}` })
      .setTimestamp();

    if (msg) {
      await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
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

        // CREATE
        if (sub === 'create') {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
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

          const embed = new EmbedBuilder()
            .setTitle(`🎉 GIVEAWAY — ${prize}`)
            .setDescription(`${description ? description + '\n\n' : ''}🏆 **${winnerCount} winner${winnerCount > 1 ? 's' : ''}**\n📅 **Ends:** <t:${Math.floor(endsAt.getTime() / 1000)}:R>\n👤 **Hosted by:** ${interaction.user}${requiredRole ? `\n🎭 **Required Role:** ${requiredRole}` : ''}\n\nClick 🎉 to enter!`)
            .setColor('#f1c40f')
            .setFooter({ text: `ID: ${gwId} • ${winnerCount} winner(s)` })
            .setTimestamp(endsAt);

          const btn = new ButtonBuilder()
            .setCustomId(`gw_enter_${gwId}`)
            .setLabel('Enter Giveaway')
            .setEmoji('🎉')
            .setStyle(ButtonStyle.Success);

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);

          await interaction.deferReply({ flags: 64 });
          const msg = await targetChannel.send({ embeds: [embed], components: [row] });

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

          // Schedule auto-end
          const timeout = setTimeout(() => endGiveaway(client, giveaway, context), ms);
          activeGiveaways.set(gwId, timeout);

          await interaction.editReply({ content: `✅ Giveaway started in ${targetChannel}! ID: \`${gwId}\`` });
        }

        // END
        else if (sub === 'end') {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
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

        // REROLL
        else if (sub === 'reroll') {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
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
          await interaction.reply({ content: `🔄 **Reroll Complete!** New winner(s): ${mentions}` });
        }

        // LIST
        else if (sub === 'list') {
          const active = giveaways.filter(g => !g.ended);
          if (active.length === 0) return interaction.reply({ content: '📋 No active giveaways.', flags: 64 });
          const lines = active.map(g => `• **${g.prize}** — Ends <t:${Math.floor(new Date(g.endsAt).getTime() / 1000)}:R> — ID: \`${g.id}\``);
          await interaction.reply({ content: `🎉 **Active Giveaways (${active.length}):**\n${lines.join('\n')}`, flags: 64 });
        }

        // DELETE
        else if (sub === 'delete') {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
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

        // INFO
        else if (sub === 'info') {
          const id = interaction.options.getString('id');
          const gw = giveaways.find(g => g.id === id);
          if (!gw) return interaction.reply({ content: `❌ Giveaway \`${id}\` not found.`, flags: 64 });

          const embed = new EmbedBuilder()
            .setTitle(`🎉 Giveaway: ${gw.prize}`)
            .setColor('#f1c40f')
            .addFields(
              { name: 'Status', value: gw.ended ? '✅ Ended' : '🟢 Active', inline: true },
              { name: 'Winner Count', value: `${gw.winnerCount}`, inline: true },
              { name: 'Entries', value: `${(gw.entries || []).length}`, inline: true },
              { name: 'Host', value: `${gw.hostTag}`, inline: true },
              { name: 'Ends/Ended', value: `<t:${Math.floor(new Date(gw.endsAt).getTime() / 1000)}:F>`, inline: true },
              { name: 'ID', value: `\`${gw.id}\``, inline: true }
            );

          if (gw.ended && gw.winnerIds && gw.winnerIds.length > 0) {
            embed.addFields({ name: 'Winners', value: gw.winnerIds.map((id: string) => `<@${id}>`).join(', ') });
          }

          await interaction.reply({ embeds: [embed], flags: 64 });
        }
        else if (sub === 'pause') {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
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
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
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
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
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
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
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
          const lines = past.slice(0, 10).map(g => `• **${g.prize}** — Won by ${g.winnerIds?.map(w => `<@${w}>`).join(', ') || 'no one'} — ID: \`${g.id}\``);
          return interaction.reply({ content: `⏳ **Recent Giveaways History:**\n${lines.join('\n')}`, flags: 64 });
        }
        else if (sub === 'stats') {
          const total = giveaways.length;
          const active = giveaways.filter(g => !g.ended).length;
          return interaction.reply({ content: `📊 **Giveaway System Statistics**:\n• Active Giveaways: **${active}**\n• Ended Giveaways: **${total - active}**\n• Total Hosted: **${total}**`, flags: 64 });
        }
      }
    },
    {
      name: 'button',
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

        // Required role check
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
        // Restore timers for active giveaways on startup
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
