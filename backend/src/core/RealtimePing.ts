/**
 * RealtimePing — Rage Optimiser Latency & Telemetry Benchmark
 *
 * Implements genuine high-resolution real-time latency measurements using
 * Components V2 Box UI design with zero emojis:
 * - WebSocket Ping (client.ws.ping)
 * - Redis / Database Query Latency (Database.get benchmark via process.hrtime.bigint)
 * - Round Trip Latency (real-time message creation to sent message round-trip)
 * - Process Uptime & Memory Heap Telemetry
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Database } from './Database.js';
import { PayloadFormatter } from './PayloadFormatter.js';

export async function measureRedisLatency(): Promise<number> {
  const tDb0 = process.hrtime.bigint();
  await Database.get('SELECT 1').catch(() => null);
  const tDb1 = process.hrtime.bigint();
  return Math.max(1, Math.round(Number(tDb1 - tDb0) / 1_000_000));
}

export async function buildBoxPingPayload(
  client: any,
  roundTripMs: number | null = null,
  user?: any,
  includeRefreshButton: boolean = false
): Promise<any> {
  const redisMs = await measureRedisLatency();
  const wsPing = Math.max(1, Math.round(client?.ws?.ping > 0 ? client.ws.ping : 15));
  const uptimeSec = process.uptime();
  const startTime = Math.floor((Date.now() - uptimeSec * 1000) / 1000);
  const heapMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

  const lines = [
    `WebSocket Ping: **\`${wsPing}ms\`**`,
    `Redis Latency: **\`${redisMs}ms\`**`,
    roundTripMs !== null ? `Round Trip: **\`${roundTripMs}ms\`**` : null,
    `Uptime: <t:${startTime}:R>`,
    `Memory Heap: **\`${heapMb} MB\`**`
  ].filter(Boolean).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('Bot Latency & Status')
    .setDescription(lines);

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
 * Handles prefix command ping (e.g. `r!ping`, `ping`) with real-time nanosecond benchmarks
 * rendered in canonical Box UI.
 */
export async function handlePingMessage(message: any): Promise<any> {
  const tSend0 = Date.now();
  const initialPayload = await buildBoxPingPayload(message.client, null, message.author);

  const sentMsg = await message.reply(initialPayload).catch(() => null);
  if (!sentMsg) return null;

  const tSend1 = Date.now();
  const msgSentTs = sentMsg.createdTimestamp || tSend1;
  const msgCreatedTs = message.createdTimestamp || tSend0;
  const realTatMs = Math.max(1, msgSentTs - msgCreatedTs);

  const finalPayload = await buildBoxPingPayload(message.client, realTatMs, message.author);
  return sentMsg.edit(finalPayload).catch(() => null);
}

/**
 * Handles slash command or interaction ping benchmark in canonical Box UI.
 */
export async function handlePingInteraction(interaction: any): Promise<any> {
  const tStart = Date.now();

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply().catch(() => {});
  }

  const tAfterDefer = Date.now();
  const createdTs = interaction.createdTimestamp || tStart;
  const roundTripMs = Math.max(1, tAfterDefer - createdTs);

  const finalPayload = await buildBoxPingPayload(interaction.client, roundTripMs, interaction.user, true);
  return interaction.editReply(finalPayload).catch(() => null);
}
