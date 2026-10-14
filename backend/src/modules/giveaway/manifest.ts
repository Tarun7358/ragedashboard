import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';
import { IGiveaway } from '../../models/index.js';
import {
  Colors, Embeds, Components,
  buildRichCard, buildListCard, buildStatusCard, buildLimeOverviewCard,
  VERIFIED_ICON, WRONG_ICON, SHIELD_ICON, CART_ICON, TIMER_ICON, MEMBER_ICON,
  fmt, ts,
} from '../../core/UIFactory.js';
import { isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';

const activeGiveaways: Map<string, NodeJS.Timeout> = new Map();

function makeId() { return `gw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
function parseMs(str: string): number {
  if (!str) return 3_600_000;
  const unit = str.slice(-1);
  const val = parseInt(str);
  if (isNaN(val)) return 3_600_000;
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

    const endCard = buildLimeOverviewCard({
      title: `${CART_ICON} GIVEAWAY CONCLUDED`,
      subtitle: `PRIZE: ${gw.prize.toUpperCase()}`,
      color: Colors.GOLD,
      sections: [
        {
          title: `${VERIFIED_ICON} WINNER ANNOUNCEMENT`,
          items: [
            `• **Prize**: **${gw.prize}**`,
            `• **Winner(s)**: ${winnerMentions}`,
            `• **Host**: ${gw.hostTag}`,
            `• **Reason**: ${reason}`
          ]
        }
      ],
      footerText: 'Rage Optimiser Enterprise • Giveaway Engine'
    });

    if (msg) {
      await msg.edit({ embeds: [endCard], components: [] }).catch(() => {});
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
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_giveaway',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        if (!guild) {
          return interaction.reply({ content: `${WRONG_ICON} Giveaway commands can only be run inside a server.`, flags: 64 });
        }

        const cmdName = interaction.parsed?.commandName?.toLowerCase() || 'giveaway';
        let sub = interaction.options?.getSubcommand(false) || interaction.parsed?.args?.[0]?.toLowerCase();

        if (cmdName === 'gstart' || cmdName === 'gcreate') sub = 'create';
        if (cmdName === 'gend') sub = 'end';
        if (cmdName === 'greroll') sub = 'reroll';
        if (cmdName === 'glist') sub = 'list';
        if (!sub) sub = 'list';

        const modules = context.getModulesState ? context.getModulesState(guild.id) : [];
        const gwMod = modules.find((m: any) => m.id === 'giveaway');

        let giveaways: IGiveaway[] = gwMod?.config?.giveaways || [];
        const saveGiveaways = (updated: IGiveaway[]) => context.updateModuleConfig('giveaway', { giveaways: updated });

        // Admin check for management subcommands
        const adminSubs = ['create', 'end', 'reroll', 'delete', 'pause', 'resume', 'edit', 'cancel'];
        if (adminSubs.includes(sub)) {
          const isAuthorized = await isOwnerOrExtraOwner(interaction.user.id, guild);
          if (!isAuthorized) {
            return interaction.reply({ content: `${WRONG_ICON} Access Denied: Server Owner & Extra Owner permission required.`, flags: 64 });
          }
        }

        // ─── CREATE ───────────────────────────────────────────────
        if (sub === 'create') {
          const rawArgs = interaction.parsed?.args || [];
          let durationStr = interaction.options?.getString?.('duration');
          let prize = interaction.options?.getString?.('prize');
          let winnerCount = interaction.options?.getInteger?.('winners') || 1;
          const targetChannel = interaction.options?.getChannel?.('channel') || interaction.channel;
          const description = interaction.options?.getString?.('description') || '';
          const requiredRole = interaction.options?.getRole?.('required_role');

          if (!durationStr && rawArgs.length > 0) {
            const startIdx = (cmdName === 'giveaway' && rawArgs[0] === 'create') ? 1 : 0;
            durationStr = rawArgs[startIdx] || '1h';
            
            // If last argument is a number of winners
            if (rawArgs.length > startIdx + 2 && !isNaN(parseInt(rawArgs[rawArgs.length - 1]))) {
              winnerCount = parseInt(rawArgs.pop());
            }
            prize = rawArgs.slice(startIdx + 1).join(' ');
          }

          if (!prize) {
            return interaction.reply({ content: `${WRONG_ICON} Usage: \`r!gstart <duration> <prize> [winners]\` (e.g. \`r!gstart 1h Discord Nitro 2\`)`, flags: 64 });
          }

          const ms = parseMs(durationStr || '1h');
          const endsAt = new Date(Date.now() + ms);
          const gwId = makeId();

          const gwCard = buildLimeOverviewCard({
            title: `${CART_ICON} ENTERPRISE GIVEAWAY — ${prize.toUpperCase()}`,
            subtitle: `CLICK BUTTON BELOW TO PARTICIPATE`,
            color: Colors.GOLD,
            sections: [
              {
                title: `${CART_ICON} GIVEAWAY DETAILS`,
                items: [
                  `• **Prize**: **${prize}**`,
                  `• **Winners**: **${winnerCount}**`,
                  `• **Ends**: <t:${Math.floor(endsAt.getTime() / 1000)}:R> (<t:${Math.floor(endsAt.getTime() / 1000)}:f>)`,
                  `• **Hosted By**: ${interaction.user}`,
                  ...(requiredRole ? [`• **Required Role**: ${requiredRole}`] : []),
                  `• **Giveaway ID**: \`${gwId}\``
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Giveaway Engine'
          });

          const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`gw_enter_${gwId}`)
              .setLabel('Enter Giveaway')
              .setStyle(ButtonStyle.Success)
          );

          if (interaction.deferReply) {
            await interaction.deferReply({ flags: 64 }).catch(() => null);
          }

          const msg = await targetChannel.send({ embeds: [gwCard], components: [actionRow] });

          const giveaway: IGiveaway = {
            id: gwId,
            guildId: guild.id,
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

          if (interaction.editReply) {
            return interaction.editReply({ content: `${VERIFIED_ICON} Giveaway started in ${targetChannel}! ID: \`${gwId}\`` });
          } else {
            return interaction.reply({ content: `${VERIFIED_ICON} Giveaway started in ${targetChannel}! ID: \`${gwId}\``, flags: 64 });
          }
        }

        // ─── END ──────────────────────────────────────────────────
        else if (sub === 'end') {
          const id = interaction.options?.getString?.('id') || interaction.parsed?.args?.[1];
          const gw = giveaways.find(g => g.id === id || (g.prize.toLowerCase().includes((id || '').toLowerCase())));
          if (!gw) return interaction.reply({ content: `${WRONG_ICON} Active giveaway matching \`${id}\` not found. Usage: \`r!gend <id>\``, flags: 64 });
          if (gw.ended) return interaction.reply({ content: `${WRONG_ICON} This giveaway has already ended.`, flags: 64 });

          const existing = activeGiveaways.get(gw.id);
          if (existing) { clearTimeout(existing); activeGiveaways.delete(gw.id); }

          await endGiveaway(client, gw, context, 'Manually ended by host');
          return interaction.reply({ content: `${VERIFIED_ICON} Giveaway \`${gw.id}\` ended early.`, flags: 64 });
        }

        // ─── REROLL ───────────────────────────────────────────────
        else if (sub === 'reroll') {
          const id = interaction.options?.getString?.('id') || interaction.parsed?.args?.[1];
          const rerollCount = interaction.options?.getInteger?.('winners') || 1;
          const gw = giveaways.find(g => g.id === id || (g.prize.toLowerCase().includes((id || '').toLowerCase())));
          if (!gw || !gw.ended) return interaction.reply({ content: `${WRONG_ICON} Ended giveaway matching \`${id}\` not found. Usage: \`r!greroll <id>\``, flags: 64 });

          const entries = gw.entries || [];
          const newWinners = [...entries].sort(() => Math.random() - 0.5).slice(0, rerollCount);
          gw.winnerIds = newWinners;
          saveGiveaways(giveaways);

          const mentions = newWinners.length > 0 ? newWinners.map((id: string) => `<@${id}>`).join(', ') : 'No valid entries';
          const rerollCard = buildLimeOverviewCard({
            title: `${CART_ICON} GIVEAWAY REROLL COMPLETE`,
            subtitle: `NEW WINNER(S) SELECTED`,
            color: Colors.GOLD,
            sections: [
              {
                title: `${VERIFIED_ICON} NEW WINNERS`,
                items: [
                  `• **Prize**: **${gw.prize}**`,
                  `• **New Winner(s)**: ${mentions}`
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Giveaway Engine'
          });

          return interaction.reply({ embeds: [rerollCard] });
        }

        // ─── LIST ─────────────────────────────────────────────────
        else if (sub === 'list') {
          const active = giveaways.filter(g => !g.ended);
          if (active.length === 0) return interaction.reply({ content: `${WRONG_ICON} No active giveaways currently running.`, flags: 64 });

          const listCard = buildLimeOverviewCard({
            title: `${CART_ICON} ACTIVE SERVER GIVEAWAYS`,
            subtitle: `RUNNING GIVEAWAYS (${active.length})`,
            color: Colors.GOLD,
            sections: [
              {
                title: `${CART_ICON} LIVE GIVEAWAYS`,
                items: active.map(g => `• **${g.prize}** — Ends <t:${Math.floor(new Date(g.endsAt).getTime() / 1000)}:R> — ID: \`${g.id}\``)
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Giveaway Engine'
          });

          return interaction.reply({ embeds: [listCard], flags: 64 });
        }

        // ─── DELETE ───────────────────────────────────────────────
        else if (sub === 'delete') {
          const id = interaction.options?.getString?.('id') || interaction.parsed?.args?.[1];
          if (!giveaways.find(g => g.id === id)) return interaction.reply({ content: `${WRONG_ICON} Giveaway \`${id}\` not found.`, flags: 64 });
          const existing = activeGiveaways.get(id as string);
          if (existing) { clearTimeout(existing); activeGiveaways.delete(id as string); }
          saveGiveaways(giveaways.filter(g => g.id !== id));
          context.logSyncEvent(`[Giveaway] Deleted giveaway "${id}" by ${interaction.user.username}.`, 'info');
          return interaction.reply({ content: `${VERIFIED_ICON} Giveaway \`${id}\` deleted.`, flags: 64 });
        }

        // ─── INFO ─────────────────────────────────────────────────
        else if (sub === 'info') {
          const id = interaction.options?.getString?.('id') || interaction.parsed?.args?.[1];
          const gw = giveaways.find(g => g.id === id);
          if (!gw) return interaction.reply({ content: `${WRONG_ICON} Giveaway \`${id}\` not found.`, flags: 64 });

          const infoCard = buildLimeOverviewCard({
            title: `${CART_ICON} GIVEAWAY INFO — ${gw.prize.toUpperCase()}`,
            subtitle: `ID: ${gw.id}`,
            color: Colors.GOLD,
            sections: [
              {
                title: `${CART_ICON} GIVEAWAY TELEMETRY`,
                items: [
                  `• **Status**: ${gw.ended ? 'Ended' : 'Active'}`,
                  `• **Winners**: ${gw.winnerCount}`,
                  `• **Total Entries**: ${(gw.entries || []).length}`,
                  `• **Host**: ${gw.hostTag}`,
                  `• **Ends At**: <t:${Math.floor(new Date(gw.endsAt).getTime() / 1000)}:F>`
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Giveaway Engine'
          });

          return interaction.reply({ embeds: [infoCard], flags: 64 });
        }
      }
    },
    {
      name: 'button_gw_enter_generic',
      handler: async (client: any, interaction: any, context: any) => {
        if (!interaction.customId?.startsWith('gw_enter_')) return;
        const gwId = interaction.customId.replace('gw_enter_', '');

        const modules = context.getModulesState ? context.getModulesState(interaction.guildId) : [];
        const gwMod = modules.find((m: any) => m.id === 'giveaway');
        if (!gwMod) return;

        let giveaways: IGiveaway[] = gwMod.config?.giveaways || [];
        const gw = giveaways.find(g => g.id === gwId);
        if (!gw || gw.ended) {
          return interaction.reply({ content: `${WRONG_ICON} This giveaway has already ended.`, flags: 64 });
        }

        if (gw.requiredRoleId) {
          const hasr = interaction.member?.roles?.cache?.has(gw.requiredRoleId);
          if (!hasr) return interaction.reply({ content: `${WRONG_ICON} You need <@&${gw.requiredRoleId}> to enter this giveaway.`, flags: 64 });
        }

        if (!gw.entries) gw.entries = [];
        if (gw.entries.includes(interaction.user.id)) {
          return interaction.reply({ content: `${VERIFIED_ICON} You are already entered in this giveaway!`, flags: 64 });
        }

        gw.entries.push(interaction.user.id);
        context.updateModuleConfig('giveaway', { giveaways });
        context.logSyncEvent(`[Giveaway] ${interaction.user.username} entered giveaway "${gw.prize}".`, 'info');
        return interaction.reply({ content: `🎉 You've successfully entered the giveaway for **${gw.prize}**! Good luck!`, flags: 64 });
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

export function registerGiveawayCommands() {
  PrefixRegistry.register({
    name: 'giveaway',
    description: 'Enterprise Giveaway Engine — Create, end, reroll & manage server giveaways',
    category: 'Giveaways',
    usage: 'r!giveaway [create <duration> <prize> | end <id> | reroll <id> | list | delete <id> | info <id>]',
    aliases: ['g', 'gstart', 'gcreate', 'gend', 'greroll', 'glist'],
    userPermissions: [],
    cooldownSeconds: 3,
    examples: [
      'r!gstart 1h Discord Nitro',
      'r!gstart 30m VIP Role 2',
      'r!gend gw_12345',
      'r!greroll gw_12345',
      'r!glist'
    ],
    moduleOwnerId: 'giveaway',
    subcommands: [
      { name: 'create <duration> <prize>', description: 'Start a new giveaway with custom duration and prize', examples: ['r!gstart 1h Nitro', 'r!giveaway create 1d VIP 2'] },
      { name: 'end <id>', description: 'End an active giveaway early and pick winners', examples: ['r!gend gw_12345'] },
      { name: 'reroll <id>', description: 'Reroll new winners for an ended giveaway', examples: ['r!greroll gw_12345'] },
      { name: 'list', description: 'List all currently active giveaways in the server', examples: ['r!glist'] },
      { name: 'delete <id>', description: 'Delete a giveaway without picking winners', examples: ['r!giveaway delete gw_12345'] },
      { name: 'info <id>', description: 'View detailed information and entry stats for a giveaway', examples: ['r!giveaway info gw_12345'] }
    ]
  });
}
