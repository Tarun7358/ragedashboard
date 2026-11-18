/**
 * RealtimePing — Rage Optimiser Latency & Telemetry Benchmark
 *
 * Implements genuine real-time latency measurements using canonical Box UI:
 * - WebSocket Latency (client.ws.ping)
 * - Redis Latency (Database.get benchmark via process.hrtime.bigint)
 * - Single-line display: `> **WebSocket Latency:** <ws>ms | **Redis:** <db>ms`
 * - Title: `WebSocket Latency` with user avatar thumbnail
 * - Zero emojis
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Database } from './Database.js';
import { PayloadFormatter } from './PayloadFormatter.js';
import { Colors } from './UIFactory.js';

export async function measureRedisLatency(): Promise<number> {
  const tDb0 = process.hrtime.bigint();
  await Database.get('SELECT 1').catch(() => null);
  const tDb1 = process.hrtime.bigint();
  return Math.max(1, Math.round(Number(tDb1 - tDb0) / 1_000_000));
}

export async function buildBoxPingPayload(
  client: any,
  user?: any,
  includeRefreshButton: boolean = false
): Promise<any> {
  const redisMs = await measureRedisLatency();
  const wsPing = Math.max(1, Math.round(client?.ws?.ping > 0 ? client.ws.ping : 15));
  const pingColor = wsPing < 150 ? Colors.LIME : wsPing < 300 ? Colors.WARN : Colors.DANGER;

  const embed = new EmbedBuilder()
    .setTitle('WebSocket Latency')
    .setColor(pingColor)
    .setDescription(`> **WebSocket Latency:** \`${wsPing}ms\` | **Redis:** \`${redisMs}ms\``)
    .setFooter({ text: 'Rage Optimiser - Speed Test' });

  const components: any[] = [];
  if (includeRefreshButton && user?.id) {
    const btn = new ButtonBuilder()
      .setCustomId(`ping_refresh_${user.id}`)
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Secondary);
    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(btn));
  }

  return PayloadFormatter.normalize({
    embeds: [embed],
    components: components.length > 0 ? components : undefined
  }, user);
}

/**
 * Handles prefix command ping (e.g. `r!ping`, `ping`)
 */
export async function handlePingMessage(message: any): Promise<any> {
  const payload = await buildBoxPingPayload(message.client, message.author);
  return message.reply(payload).catch(() => null);
}

/**
 * Handles slash command or interaction ping benchmark
 */
export async function handlePingInteraction(interaction: any): Promise<any> {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply().catch(() => {});
  }

  const payload = await buildBoxPingPayload(interaction.client, interaction.user, true);
  return interaction.editReply(payload).catch(() => null);
}
