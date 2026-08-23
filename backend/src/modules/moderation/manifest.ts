import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { Database } from '../../core/Database.js';
import { DashboardSyncService } from '../../services/DashboardSyncService.js';
import { buildRichCard, Colors, VERIFIED_ICON, WRONG_ICON, SHIELD_ICON, GAVEL_ICON } from '../../core/UIFactory.js';

// Safe display name helper — user.username is deprecated in new Discord username system
function userTag(user: any): string {
  return user?.globalName ?? user?.username ?? user?.tag ?? user?.id ?? 'Unknown';
}

// Firestore-backed warnings helpers — stored under guild_warnings/{guildId}/users/{userId}
async function loadUserWarnings(guildId: string, userId: string): Promise<any[]> {
  try {
    const db = Database.getDb();
    if (!db) return [];
    const row = await db.get<any>('SELECT warnings FROM guild_warnings WHERE guildId = ? AND userId = ?', [guildId, userId]);
    return row ? (JSON.parse(row.warnings || '[]')) : [];
  } catch (e) {
    console.error('[Moderation] Failed to load warnings from SQLite:', e);
    return [];
  }
}

async function saveUserWarnings(guildId: string, userId: string, warnings: any[]): Promise<void> {
  try {
    const db = Database.getDb();
    if (!db) return;
    await db.run(
      'INSERT OR REPLACE INTO guild_warnings (guildId, userId, warnings) VALUES (?, ?, ?)',
      [guildId, userId, JSON.stringify(warnings)]
    );
  } catch (e) {
    console.error('[Moderation] Failed to save warnings to SQLite:', e);
  }
}

async function clearUserWarnings(guildId: string, userId: string): Promise<void> {
  try {
    const db = Database.getDb();
    if (!db) return;
    await db.run('DELETE FROM guild_warnings WHERE guildId = ? AND userId = ?', [guildId, userId]);
  } catch (e) {
    console.error('[Moderation] Failed to clear warnings from SQLite:', e);
  }
}

async function handlePurgeExecution(client: any, interaction: any, context: any) {
  if (!hasModAccess(interaction, context)) {
    const errEmbed = new EmbedBuilder()
      .setTitle('<:wrong:1532390628330307634> Access Denied')
      .setDescription('You do not possess the required administrative clearances to execute this command.')
      .setColor('#ff4444')
      .setFooter({ text: 'Rage Optimiser • Access Control System' });
    return interaction.reply({ embeds: [errEmbed], flags: 64 });
  }

  const optAmount = interaction.options?.getInteger?.('amount');
  const arg0 = context?.parsed?.args?.[0];
  const parsedArg = arg0 ? parseInt(arg0, 10) : null;
  const rawAmount = optAmount ?? (parsedArg && !isNaN(parsedArg) ? parsedArg : null);

  let purgeAll = false;
  let amount = 0;

  if (rawAmount !== null && !isNaN(rawAmount)) {
    amount = rawAmount;
    if (amount < 1 || amount > 100) {
      const errEmbed = new EmbedBuilder()
        .setTitle('<:wrong:1532390628330307634> Invalid Parameter')
        .setDescription('The quantity parameter for message deletion must be between 1 and 100.')
        .setColor('#ff4444')
        .setFooter({ text: 'Rage Optimiser • Validation Check' });
      return interaction.reply({ embeds: [errEmbed], flags: 64 });
    }
  } else {
    purgeAll = true;
  }

  try {
    let totalDeleted = 0;
    if (purgeAll) {
      let fetched;
      do {
        fetched = await interaction.channel.messages.fetch({ limit: 100 }).catch(() => null);
        if (!fetched || fetched.size === 0) break;
        const deleted = await interaction.channel.bulkDelete(fetched, true).catch(() => null);
        if (!deleted || deleted.size === 0) break;
        totalDeleted += deleted.size;
      } while (fetched && fetched.size === 100 && totalDeleted < 1000);
    } else {
      const deleted = await interaction.channel.bulkDelete(amount, true);
      totalDeleted = deleted?.size ?? amount;
    }

    const successEmbed = new EmbedBuilder()
      .setTitle('<a:approved:1532390590707142956> Channel Message Deletion Complete')
      .setDescription(purgeAll 
        ? `<a:approved:1532390590707142956> **All channel messages have been cleared.**` 
        : `A bulk deletion request of **${totalDeleted}** messages was successfully executed.`)
      .addFields(
        { name: 'Deleted Messages Count', value: `\`${totalDeleted}\``, inline: true },
        { name: 'Target Channel', value: `${interaction.channel}`, inline: true },
        { name: 'Purge Mode', value: purgeAll ? '`FULL CHANNEL CLEAR`' : `\`SPECIFIED COUNT (${amount})\``, inline: true }
      )
      .setColor('#10b981')
      .setTimestamp()
      .setFooter({ text: 'Rage Optimiser • Security System' });

    const replyMsg = await interaction.reply({ embeds: [successEmbed], flags: 64 });
    
    setTimeout(() => {
      if (replyMsg?.delete) replyMsg.delete().catch(() => {});
    }, 5000);

    context?.logSyncEvent?.(`Moderation: ${interaction.user.username} purged ${totalDeleted} messages in #${interaction.channel.name} (Full Clear: ${purgeAll}).`, 'info');
  } catch (e: any) {
    const errEmbed = new EmbedBuilder()
      .setTitle('<:wrong:1532390628330307634> Bulk Deletion Failed')
      .setDescription('An error occurred while attempting to delete messages. Messages older than 14 days cannot be bulk deleted.')
      .setColor('#ff4444')
      .setFooter({ text: 'Rage Optimiser • Error Logs' });
    await interaction.reply({ embeds: [errEmbed], flags: 64 });
  }
}

export const ModerationManifest: ModuleManifest = {
  id: 'moderation',
  name: 'Moderation Console',
  version: '1.0.0',
  description: 'Warnings, timeouts, temporary bans, and automated chat offense tracking.',
  configSchema: {
    requiredFields: ['logChannelId', 'modRoleIds', 'warnsToTimeout', 'warnsToBan'],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;

      const roleExists = (id: string) => registry.roles.some(r => r.id === id);
      const channelExists = (id: string) => registry.channels.some(c => c.id === id);

      if (config.logChannelId) {
        progress += 40;
        if (!channelExists(config.logChannelId)) errors.push(`Mod logs channel ID (${config.logChannelId}) was deleted!`);
      }
      if (config.modRoleIds && config.modRoleIds.length > 0) {
        progress += 30;
        config.modRoleIds.forEach((id: string) => {
          if (!roleExists(id)) errors.push(`Moderator role ID (${id}) was deleted!`);
        });
      }
      if (config.warnsToTimeout) progress += 15;
      if (config.warnsToBan) progress += 15;

      return { progress, errors };
    }
  },
  commands: [
    { name: 'ban', description: 'Ban a user from the server', options: [{ name: 'user', type: 6, description: 'User to ban', required: true }, { name: 'reason', type: 3, description: 'Reason for ban', required: false }] },
    { name: 'kick', description: 'Kick a user from the server', options: [{ name: 'user', type: 6, description: 'User to kick', required: true }, { name: 'reason', type: 3, description: 'Reason for kick', required: false }] },
    { name: 'mute', description: 'Mute a user', options: [{ name: 'user', type: 6, description: 'User to mute', required: true }, { name: 'duration', type: 3, description: 'Duration', required: false }] },
    { name: 'unmute', description: 'Unmute a user', options: [{ name: 'user', type: 6, description: 'User to unmute', required: true }] },
    { name: 'warn', description: 'Warn a user', options: [{ name: 'user', type: 6, description: 'User to warn', required: true }, { name: 'reason', type: 3, description: 'Reason for warning', required: true }] },
    { name: 'warnings', description: 'Check a user\'s warnings', options: [{ name: 'user', type: 6, description: 'User to check', required: true }] },
    { name: 'clearwarnings', description: 'Clear a user\'s warnings', options: [{ name: 'user', type: 6, description: 'User to clear', required: true }] },
    { name: 'purge', description: 'Delete multiple messages', options: [{ name: 'amount', type: 4, description: 'Number of messages to delete', required: true }] },
    {
      name: 'lock',
      description: 'Lock a text or voice channel to restrict member access',
      options: [
        { name: 'channel', type: 7, description: 'The text or voice channel to lock (defaults to current)', required: false },
        { name: 'private', type: 5, description: 'Whether to hide the channel completely (ViewChannel: false)', required: false }
      ]
    },
    {
      name: 'unlock',
      description: 'Unlock a text or voice channel to restore member access',
      options: [
        { name: 'channel', type: 7, description: 'The text or voice channel to unlock (defaults to current)', required: false }
      ]
    },
    { name: 'slowmode', description: 'Set channel slowmode', options: [{ name: 'seconds', type: 4, description: 'Slowmode duration in seconds', required: true }] },
    { name: 'timeout', description: 'Timeout a user', options: [{ name: 'user', type: 6, description: 'User to timeout', required: true }, { name: 'duration', type: 3, description: 'Duration (e.g. 10m, 1h)', required: true }] },
    { name: 'untimeout', description: 'Remove timeout from a user', options: [{ name: 'user', type: 6, description: 'User to remove timeout', required: true }] },
    { name: 'unban', description: 'Unban a user from the server', options: [{ name: 'user_id', type: 3, description: 'ID of the user to unban', required: true }, { name: 'reason', type: 3, description: 'Reason for unbanning', required: false }] },
    { name: 'softban', description: 'Kick a user and clear their messages', options: [{ name: 'user', type: 6, description: 'User to softban', required: true }, { name: 'reason', type: 3, description: 'Reason for softban', required: false }] },
    { name: 'tempban', description: 'Temporarily ban a user', options: [{ name: 'user', type: 6, description: 'User to ban', required: true }, { name: 'duration', type: 3, description: 'Duration (e.g. 1d, 7d)', required: true }, { name: 'reason', type: 3, description: 'Reason', required: false }] },
    { name: 'nick', description: 'Change a member nickname', options: [{ name: 'user', type: 6, description: 'User to nickname', required: true }, { name: 'nickname', type: 3, description: 'New nickname', required: true }] },
    { name: 'history', description: 'Show user infraction history', options: [{ name: 'user', type: 6, description: 'User to check history', required: true }] }
  ],
  events: [
    {
      name: 'command_ban',
      handler: async (client: any, interaction: any, context: any) => {
        if (!hasModAccess(interaction, context)) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        try {
          await interaction.guild.members.ban(user, { reason });
          const { buildMinimalAction } = await import('../../core/UIFactory.js');
          const successEmbed = buildMinimalAction({
            user: interaction.user,
            action: 'Has Banned',
            target: user,
            reason: reason !== 'No reason provided' ? reason : undefined
          });
          await interaction.reply({ embeds: [successEmbed] });
          logModAction(interaction.guild, user, interaction.user, 'Ban', reason, context);
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Banishment Execution Failed')
            .setDescription('Failed to ban the user. This is usually due to permission hierarchy mismatch.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          await interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
      }
    },
    {
      name: 'command_kick',
      handler: async (client: any, interaction: any, context: any) => {
        if (!hasModAccess(interaction, context)) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const member = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        if (!member) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Member Location Failed')
            .setDescription('The specified user is not present in this server.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        try {
          await member.kick(reason);
          const { buildMinimalAction } = await import('../../core/UIFactory.js');
          const successEmbed = buildMinimalAction({
            user: interaction.user,
            action: 'Has Kicked',
            target: member.user,
            reason: reason !== 'No reason provided' ? reason : undefined
          });
          await interaction.reply({ embeds: [successEmbed] });
          logModAction(interaction.guild, member.user, interaction.user, 'Kick', reason, context);
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Expulsion Execution Failed')
            .setDescription('Failed to kick the user. Check Bot permission hierarchy constraints.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          await interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
      }
    },
    {
      name: 'command_timeout',
      handler: async (client: any, interaction: any, context: any) => {
        if (!hasModAccess(interaction, context)) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const member = interaction.options.getMember('user');
        const durationStr = interaction.options.getString('duration');
        if (!member) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Member Location Failed')
            .setDescription('The specified user is not present in this server.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        
        let ms = 60000;
        if (durationStr.endsWith('m')) ms = parseInt(durationStr) * 60000;
        else if (durationStr.endsWith('h')) ms = parseInt(durationStr) * 3600000;
        else if (durationStr.endsWith('d')) ms = parseInt(durationStr) * 86400000;
        else ms = parseInt(durationStr) * 60000;

        try {
          await member.timeout(ms, 'Moderator Timeout');
          const { buildMinimalAction } = await import('../../core/UIFactory.js');
          const successEmbed = buildMinimalAction({
            user: interaction.user,
            action: 'Has Timed Out',
            target: member.user,
            duration: durationStr
          });
          await interaction.reply({ embeds: [successEmbed] });
          logModAction(interaction.guild, member.user, interaction.user, 'Timeout', durationStr, context);
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Suspension Execution Failed')
            .setDescription('Failed to issue member timeout. Check roles hierarchy.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          await interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
      }
    },
    {
      name: 'command_untimeout',
      handler: async (client: any, interaction: any, context: any) => {
        if (!hasModAccess(interaction, context)) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const member = interaction.options.getMember('user');
        if (!member) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Member Location Failed')
            .setDescription('The specified user is not present in this server.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        try {
          await member.timeout(null, 'Timeout removed by Moderator');
          const { buildMinimalAction } = await import('../../core/UIFactory.js');
          const successEmbed = buildMinimalAction({
            user: interaction.user,
            action: 'Has Removed Timeout From',
            target: member.user
          });
          await interaction.reply({ embeds: [successEmbed] });
          logModAction(interaction.guild, member.user, interaction.user, 'Untimeout', 'N/A', context);
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Restoration Execution Failed')
            .setDescription('Failed to revoke member timeout.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          await interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
      }
    },
    {
      name: 'command_mute',
      handler: async (client: any, interaction: any, context: any) => {
        if (!hasModAccess(interaction, context)) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const member = interaction.options.getMember('user');
        if (!member) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Member Location Failed')
            .setDescription('The specified user is not present in this server.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        try {
          await member.timeout(60 * 60 * 1000, 'Moderator Mute');
          const { buildMinimalAction } = await import('../../core/UIFactory.js');
          const successEmbed = buildMinimalAction({
            user: interaction.user,
            action: 'Has Muted',
            target: member.user,
            duration: '1h'
          });
          await interaction.reply({ embeds: [successEmbed] });
          logModAction(interaction.guild, member.user, interaction.user, 'Mute', '1h', context);
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Mute Execution Failed')
            .setDescription('Failed to mute the member.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          await interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
      }
    },
    {
      name: 'command_unmute',
      handler: async (client: any, interaction: any, context: any) => {
        if (!hasModAccess(interaction, context)) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const member = interaction.options.getMember('user');
        if (!member) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Member Location Failed')
            .setDescription('The specified user is not present in this server.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        try {
          await member.timeout(null, 'Unmuted by Moderator');
          const { buildMinimalAction } = await import('../../core/UIFactory.js');
          const successEmbed = buildMinimalAction({
            user: interaction.user,
            action: 'Has Unmuted',
            target: member.user
          });
          await interaction.reply({ embeds: [successEmbed] });
          logModAction(interaction.guild, member.user, interaction.user, 'Unmute', 'N/A', context);
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Unmute Execution Failed')
            .setDescription('Failed to unmute the member.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          await interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
      }
    },
    {
      name: 'command_warn',
      handler: async (client: any, interaction: any, context: any) => {
        if (!hasModAccess(interaction, context)) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const guildId = interaction.guildId;

        const warnings = await loadUserWarnings(guildId, user.id);
        warnings.push({ reason, date: new Date().toISOString(), by: interaction.user.id, byTag: userTag(interaction.user) });
        await saveUserWarnings(guildId, user.id, warnings);

        const { buildMinimalAction } = await import('../../core/UIFactory.js');
        const successEmbed = buildMinimalAction({
          user: interaction.user,
          action: 'Has Warned',
          target: user,
          reason: reason !== 'No reason provided' ? reason : undefined,
          extra: `*(Total Warnings: ${warnings.length})*`
        });
        await interaction.reply({ embeds: [successEmbed] });
        logModAction(interaction.guild, user, interaction.user, 'Warn', reason, context);
      }
    },
    {
      name: 'command_warnings',
      handler: async (client: any, interaction: any, context: any) => {
        const user = interaction.options.getUser('user');
        const guildId = interaction.guildId;
        const userWarns = await loadUserWarnings(guildId, user.id);
        
        const embed = new EmbedBuilder()
          .setTitle(`<a:lovemail:1527647157371535420> Infraction Warning Log: ${userTag(user)}`)
          .setColor('#99CC00')
          .setTimestamp()
          .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });

        if (userWarns.length === 0) {
          embed.setDescription('This member currently has zero active warning logs.');
          return interaction.reply({ embeds: [embed], flags: 64 });
        }
        
        const lines = userWarns.map((w: any, i: number) => `**${i+1}.** ${w.reason} (by <@${w.by}>) - <t:${Math.floor(new Date(w.date).getTime()/1000)}:d>`);
        embed.setDescription(lines.join('\n'));
        await interaction.reply({ embeds: [embed], flags: 64 });
      }
    },
    {
      name: 'command_clearwarnings',
      handler: async (client: any, interaction: any, context: any) => {
        if (!hasModAccess(interaction, context)) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const user = interaction.options.getUser('user');
        const guildId = interaction.guildId;
        await clearUserWarnings(guildId, user.id);

        const { buildMinimalAction } = await import('../../core/UIFactory.js');
        const successEmbed = buildMinimalAction({
          user: interaction.user,
          action: 'Has Cleared Warnings For',
          target: user
        });
        await interaction.reply({ embeds: [successEmbed] });
        logModAction(interaction.guild, user, interaction.user, 'Clear Warnings', 'N/A', context);
      }
    },
    {
      name: 'command_purge',
      handler: (client: any, interaction: any, context: any) => handlePurgeExecution(client, interaction, context)
    },
    {
      name: 'command_clear',
      handler: (client: any, interaction: any, context: any) => handlePurgeExecution(client, interaction, context)
    },
    {
      name: 'command_lock',
      handler: async (client: any, interaction: any, context: any) => {
        if (!hasModAccess(interaction, context)) {
          const { embeds, components, flags } = buildRichCard({
            emoji: WRONG_ICON,
            title: 'Access Denied',
            description: 'You do not possess the required administrative clearances to execute this command.',
            accentColor: Colors.DANGER,
            footerNote: 'Rage Optimiser • Access Control System',
          });
          return interaction.reply({ embeds, components, flags: 64 });
        }

        let targetChannel: any = interaction.options?.getChannel?.('channel');
        const arg0 = context?.parsed?.args?.[0]?.toLowerCase();
        
        if (!targetChannel) {
          if (arg0 === 'vc' && interaction.member?.voice?.channel) {
            targetChannel = interaction.member.voice.channel;
          } else {
            targetChannel = interaction.channel;
          }
        }

        if (!targetChannel || !targetChannel.permissionOverwrites) {
          const { embeds, components, flags } = buildRichCard({
            emoji: WRONG_ICON,
            title: 'Channel Resolution Error',
            description: 'Could not resolve a valid target channel for lockdown.',
            accentColor: Colors.DANGER,
            footerNote: 'Rage Optimiser • Validation Check',
          });
          return interaction.reply({ embeds, components, flags: 64 });
        }

        const makePrivate = interaction.options?.getBoolean?.('private') === true || 
          context?.parsed?.flags?.private === true || 
          context?.parsed?.rawInput?.includes('--private');

        const isVoice = targetChannel.isVoiceBased?.() || targetChannel.type === 2 || targetChannel.type === 13;

        try {
          if (isVoice) {
            const overwrites: any = { Connect: false, SendMessages: false };
            if (makePrivate) overwrites.ViewChannel = false;
            await targetChannel.permissionOverwrites.edit(interaction.guild.id, overwrites);
          } else {
            const overwrites: any = { SendMessages: false, AddReactions: false, CreatePublicThreads: false, CreatePrivateThreads: false };
            if (makePrivate) overwrites.ViewChannel = false;
            await targetChannel.permissionOverwrites.edit(interaction.guild.id, overwrites);
          }

          const { embeds, components, flags } = buildRichCard({
            emoji: SHIELD_ICON,
            title: `${isVoice ? '<:voicechannelgreen:1532425750278438962> Voice Channel' : '<:shield:1532403012751065179> Text Channel'} Lockdown Active`,
            description: `Permissions for ${targetChannel} have been restricted to enforce security isolation.`,
            accentColor: Colors.DANGER,
            fields: [
              { label: '<a:lovemail:1527647157371535420> Target Channel', value: `${targetChannel} (\`${targetChannel.name}\`)`, inline: true },
              { label: '<:shield:1532403012751065179> Authorized By', value: `${interaction.user}`, inline: true },
              { label: '<:config:1532425712844144701> Lock Type', value: isVoice ? (makePrivate ? '`Voice & View Hidden`' : '`Voice Connect Blocked`') : (makePrivate ? '`Text & View Hidden`' : '`Send Messages Restricted`'), inline: true },
              { label: '<:wrong:1532390628330307634> Channel Status', value: '<:wrong:1532390628330307634> **LOCKED / PRIVATE**', inline: true },
            ],
            footerNote: 'Rage Optimiser Enterprise • Channel Access Control',
          });

          await interaction.reply({ embeds, components, flags });
          context.logSyncEvent?.(`Moderation: ${interaction.user.username} locked ${targetChannel.name}.`, 'warn');
        } catch (e: any) {
          const { embeds, components, flags } = buildRichCard({
            emoji: WRONG_ICON,
            title: 'Lockdown Execution Failed',
            description: `Failed to modify channel permissions: \`${e?.message || 'Permission Error'}\``,
            accentColor: Colors.DANGER,
            footerNote: 'Rage Optimiser • Error Logs',
          });
          await interaction.reply({ embeds, components, flags: 64 });
        }
      }
    },
    {
      name: 'command_unlock',
      handler: async (client: any, interaction: any, context: any) => {
        if (!hasModAccess(interaction, context)) {
          const { embeds, components, flags } = buildRichCard({
            emoji: WRONG_ICON,
            title: 'Access Denied',
            description: 'You do not possess the required administrative clearances to execute this command.',
            accentColor: Colors.DANGER,
            footerNote: 'Rage Optimiser • Access Control System',
          });
          return interaction.reply({ embeds, components, flags: 64 });
        }

        let targetChannel: any = interaction.options?.getChannel?.('channel');
        const arg0 = context?.parsed?.args?.[0]?.toLowerCase();
        
        if (!targetChannel) {
          if (arg0 === 'vc' && interaction.member?.voice?.channel) {
            targetChannel = interaction.member.voice.channel;
          } else {
            targetChannel = interaction.channel;
          }
        }

        if (!targetChannel || !targetChannel.permissionOverwrites) {
          const { embeds, components, flags } = buildRichCard({
            emoji: WRONG_ICON,
            title: 'Channel Resolution Error',
            description: 'Could not resolve a valid target channel for restoration.',
            accentColor: Colors.DANGER,
            footerNote: 'Rage Optimiser • Validation Check',
          });
          return interaction.reply({ embeds, components, flags: 64 });
        }

        const isVoice = targetChannel.isVoiceBased?.() || targetChannel.type === 2 || targetChannel.type === 13;

        try {
          if (isVoice) {
            await targetChannel.permissionOverwrites.edit(interaction.guild.id, {
              Connect: null,
              SendMessages: null,
              ViewChannel: null
            });
          } else {
            await targetChannel.permissionOverwrites.edit(interaction.guild.id, {
              SendMessages: null,
              AddReactions: null,
              CreatePublicThreads: null,
              CreatePrivateThreads: null,
              ViewChannel: null
            });
          }

          const { embeds, components, flags } = buildRichCard({
            emoji: VERIFIED_ICON,
            title: `${isVoice ? '<:voicechannelgreen:1532425750278438962> Voice Channel' : '<a:approved:1532390590707142956> Text Channel'} Unlocked`,
            description: `Permissions for ${targetChannel} have been restored. Member access is active.`,
            accentColor: Colors.SUCCESS,
            fields: [
              { label: '<a:lovemail:1527647157371535420> Target Channel', value: `${targetChannel} (\`${targetChannel.name}\`)`, inline: true },
              { label: '<:shield:1532403012751065179> Authorized By', value: `${interaction.user}`, inline: true },
              { label: '<a:approved:1532390590707142956> Restoration', value: isVoice ? '`Voice Connection Restored`' : '`Messaging Restored`', inline: true },
              { label: '<a:approved:1532390590707142956> Channel Status', value: '<a:approved:1532390590707142956> **UNLOCKED / PUBLIC**', inline: true },
            ],
            footerNote: 'Rage Optimiser Enterprise • Channel Access Control',
          });

          await interaction.reply({ embeds, components, flags });
          context.logSyncEvent?.(`Moderation: ${interaction.user.username} unlocked ${targetChannel.name}.`, 'success');
        } catch (e: any) {
          const { embeds, components, flags } = buildRichCard({
            emoji: WRONG_ICON,
            title: 'Unlock Execution Failed',
            description: `Failed to restore channel permissions: \`${e?.message || 'Permission Error'}\``,
            accentColor: Colors.DANGER,
            footerNote: 'Rage Optimiser • Error Logs',
          });
          await interaction.reply({ embeds, components, flags: 64 });
        }
      }
    },
    {
      name: 'command_slowmode',
      handler: async (client: any, interaction: any, context: any) => {
        if (!hasModAccess(interaction, context)) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const seconds = interaction.options.getInteger('seconds');
        try {
          await interaction.channel.setRateLimitPerUser(seconds);
          const { buildMinimalAction } = await import('../../core/UIFactory.js');
          const successEmbed = buildMinimalAction({
            user: interaction.user,
            action: 'Has Updated Slowmode',
            target: interaction.channel,
            extra: seconds === 0 ? 'Disabled' : `*(Delay: ${seconds}s)*`
          });
          await interaction.reply({ embeds: [successEmbed] });
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Slowmode Configuration Failed')
            .setDescription('Failed to configure rate limit for this channel.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          await interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
      }
    },
    {
      name: 'command_unban',
      handler: async (client: any, interaction: any, context: any) => {
        if (!hasModAccess(interaction, context)) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const userId = interaction.options.getString('user_id');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        try {
          await interaction.guild.members.unban(userId, reason);
          const { buildMinimalAction } = await import('../../core/UIFactory.js');
          const successEmbed = buildMinimalAction({
            user: interaction.user,
            action: 'Has Unbanned User ID',
            target: `\`${userId}\``,
            reason: reason !== 'No reason provided' ? reason : undefined
          });
          await interaction.reply({ embeds: [successEmbed] });
          logModAction(interaction.guild, { id: userId, tag: userId }, interaction.user, 'Unban', reason, context);
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Re-authorization Failed')
            .setDescription('Failed to unban the user. Verify the User ID exists and is currently banned.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          await interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
      }
    },
    {
      name: 'command_softban',
      handler: async (client: any, interaction: any, context: any) => {
        if (!hasModAccess(interaction, context)) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const member = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        if (!member) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Member Location Failed')
            .setDescription('The specified user is not present in this server.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        try {
          await interaction.guild.members.ban(member.user.id, { deleteMessageSeconds: 7 * 24 * 60 * 60, reason });
          await interaction.guild.members.unban(member.user.id, 'Softban automatic unban');
          const { buildMinimalAction } = await import('../../core/UIFactory.js');
          const successEmbed = buildMinimalAction({
            user: interaction.user,
            action: 'Has Softbanned',
            target: member.user,
            reason: reason !== 'No reason provided' ? reason : undefined
          });
          await interaction.reply({ embeds: [successEmbed] });
          logModAction(interaction.guild, member.user, interaction.user, 'Softban', reason, context);
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Softban Protocol Failed')
            .setDescription('Failed to softban the member.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          await interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
      }
    },
    {
      name: 'command_tempban',
      handler: async (client: any, interaction: any, context: any) => {
        if (!hasModAccess(interaction, context)) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const member = interaction.options.getMember('user');
        const durationStr = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        if (!member) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Member Location Failed')
            .setDescription('The specified user is not present in this server.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }

        let ms = 86400000;
        if (durationStr.endsWith('m')) ms = parseInt(durationStr) * 60000;
        else if (durationStr.endsWith('h')) ms = parseInt(durationStr) * 3600000;
        else if (durationStr.endsWith('d')) ms = parseInt(durationStr) * 86400000;

        try {
          await interaction.guild.members.ban(member.user.id, { reason });
          const { buildMinimalAction } = await import('../../core/UIFactory.js');
          const successEmbed = buildMinimalAction({
            user: interaction.user,
            action: 'Has Tempbanned',
            target: member.user,
            duration: durationStr,
            reason: reason !== 'No reason provided' ? reason : undefined
          });
          await interaction.reply({ embeds: [successEmbed] });
          logModAction(interaction.guild, member.user, interaction.user, `Tempban (${durationStr})`, reason, context);

          setTimeout(async () => {
            await interaction.guild.members.unban(member.user.id, 'Tempban duration expired.').catch(() => {});
            context.logSyncEvent(`Moderation: Auto-unbanned ${member.user.username} (tempban expired).`, 'success');
          }, ms);
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Temporary Suspension Failed')
            .setDescription('Failed to ban the member.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          await interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
      }
    },
    {
      name: 'command_nick',
      handler: async (client: any, interaction: any, context: any) => {
        if (!hasModAccess(interaction, context)) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const member = interaction.options.getMember('user');
        const nickname = interaction.options.getString('nickname');
        if (!member) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Member Location Failed')
            .setDescription('The specified user is not present in this server.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        try {
          await member.setNickname(nickname);
          const { buildMinimalAction } = await import('../../core/UIFactory.js');
          const successEmbed = buildMinimalAction({
            user: interaction.user,
            action: 'Has Changed Nickname Of',
            target: member.user,
            extra: `to \`${nickname}\``
          });
          await interaction.reply({ embeds: [successEmbed] });
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('<:wrong:1532390628330307634> Nickname Modification Failed')
            .setDescription('Failed to change nickname. Verify bot permission hierarchy limits.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          await interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
      }
    },
    {
      name: 'command_history',
      handler: async (client: any, interaction: any, context: any) => {
        const user = interaction.options.getUser('user');
        const guildId = interaction.guildId;
        const userWarns = await loadUserWarnings(guildId, user.id);
        const embed = new EmbedBuilder()
          .setTitle(`<a:lovemail:1527647157371535420> Infraction History: ${userTag(user)}`)
          .setDescription(`Recorded historical warnings and administrative offenses for the specified account.`)
          .setColor('#ff4444')
          .setTimestamp()
          .setFooter({ text: 'Rage Optimiser • Security System' });

        if (userWarns.length === 0) {
          embed.setDescription('No infraction warnings have been registered for this user.');
        } else {
          const lines = userWarns.map((w: any, i: number) => `**${i+1}.** Warning: ${w.reason} (by <@${w.by}>) - <t:${Math.floor(new Date(w.date).getTime()/1000)}:d>`);
          embed.setDescription(lines.join('\n'));
        }
        await interaction.reply({ embeds: [embed], flags: 64 });
      }
    }
  ]
};

async function fetchStatusFromContext(context: any) {
  try {
    const modules = context.registry.getModulesState();
    return { modules };
  } catch {
    return null;
  }
}

function hasModAccess(interaction: any, context: any): boolean {
  if (interaction.guild?.ownerId === interaction.user?.id) return true;
  if (interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  
  const modules = context.getModulesState ? context.getModulesState() : [];
  const modModule = modules.find((m: any) => m.id === 'moderation');
  if (modModule && modModule.config && modModule.config.modRoleIds) {
    const roleIds = modModule.config.modRoleIds;
    return interaction.member.roles.cache.some((role: any) => roleIds.includes(role.id));
  }
  return false;
}

function logModAction(guild: any, target: any, moderator: any, action: string, reason: string, context: any) {
  const modName = moderator?.globalName ?? moderator?.username ?? moderator?.tag ?? moderator?.id ?? 'Unknown';
  const targetName = target?.globalName ?? target?.username ?? target?.tag ?? target?.id ?? 'Unknown';
  context.logSyncEvent(`Moderation: ${modName} executed **${action}** on ${targetName}. Reason: ${reason}`, 'warn');
  
  if (guild?.id) {
    Database.saveAuditLog({
      guildId: guild.id,
      action: action.toUpperCase(),
      targetId: target?.id || null,
      targetType: 'User',
      targetName: targetName,
      executorId: moderator?.id || null,
      executorTag: modName,
      reason: reason || 'Moderation action',
      details: { action, reason },
      type: 'warn',
      timestamp: Date.now()
    }).catch(() => {});

    DashboardSyncService.triggerSync(guild.id);
  }

  const modules = context.getModulesState ? context.getModulesState() : [];
  const modModule = modules.find((m: any) => m.id === 'moderation');
  if (modModule && modModule.config && modModule.config.logChannelId) {
    const channelId = modModule.config.logChannelId;
    const channel = guild.channels.cache.get(channelId);
    if (channel && channel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setTitle(`🛡️ Moderation: ${action}`)
        .setColor('#ff4444')
        .addFields(
          { name: 'Target', value: `<@${target?.id ?? 'unknown'}> (${targetName})`, inline: true },
          { name: 'Moderator', value: `<@${moderator?.id ?? 'unknown'}> (${modName})`, inline: true },
          { name: 'Reason', value: reason }
        )
        .setTimestamp();
      channel.send({ embeds: [embed] }).catch(() => {});
    }
  }
}
