import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { Database } from '../../core/Database.js';

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
    { name: 'lock', description: 'Lock the current channel' },
    { name: 'unlock', description: 'Unlock the current channel' },
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
            .setTitle('🔒 Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        try {
          await interaction.guild.members.ban(user, { reason });
          const successEmbed = new EmbedBuilder()
            .setTitle('🛡️ Security Action: Member Permanently Banishment')
            .setDescription(`The selected member has been permanently removed from the server.\nAll moderation actions have been securely recorded in the audit log.`)
            .addFields(
              { name: 'Target Account', value: `${user} (${user.id})`, inline: true },
              { name: 'Authorized Moderator', value: `${interaction.user}`, inline: true },
              { name: 'Incident Reason', value: reason }
            )
            .setColor('#f43f5e')
            .setTimestamp()
            .setFooter({ text: 'Rage Optimiser • Security System' });
          await interaction.reply({ embeds: [successEmbed] });
          logModAction(interaction.guild, user, interaction.user, 'Ban', reason, context);
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Banishment Execution Failed')
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
            .setTitle('🔒 Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const member = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        if (!member) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Member Location Failed')
            .setDescription('The specified user is not present in this server.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        try {
          await member.kick(reason);
          const successEmbed = new EmbedBuilder()
            .setTitle('🛡️ Security Action: Member Successfully Removed')
            .setDescription(`The selected member has been successfully kicked from the server.\nAll moderation actions have been securely recorded in the audit log.`)
            .addFields(
              { name: 'Target Account', value: `${member.user} (${member.user.id})`, inline: true },
              { name: 'Authorized Moderator', value: `${interaction.user}`, inline: true },
              { name: 'Incident Reason', value: reason }
            )
            .setColor('#eab308')
            .setTimestamp()
            .setFooter({ text: 'Rage Optimiser • Security System' });
          await interaction.reply({ embeds: [successEmbed] });
          logModAction(interaction.guild, member.user, interaction.user, 'Kick', reason, context);
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Expulsion Execution Failed')
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
            .setTitle('🔒 Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const member = interaction.options.getMember('user');
        const durationStr = interaction.options.getString('duration');
        if (!member) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Member Location Failed')
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
          const successEmbed = new EmbedBuilder()
            .setTitle('⏱️ Security Action: Temporary Session Suspension')
            .setDescription(`The selected member's messaging privileges have been temporarily suspended.\nAll moderation actions have been securely recorded in the audit log.`)
            .addFields(
              { name: 'Target Account', value: `${member.user} (${member.user.id})`, inline: true },
              { name: 'Authorized Moderator', value: `${interaction.user}`, inline: true },
              { name: 'Suspension Duration', value: durationStr, inline: true }
            )
            .setColor('#eab308')
            .setTimestamp()
            .setFooter({ text: 'Rage Optimiser • Security System' });
          await interaction.reply({ embeds: [successEmbed] });
          logModAction(interaction.guild, member.user, interaction.user, 'Timeout', durationStr, context);
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Suspension Execution Failed')
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
            .setTitle('🔒 Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const member = interaction.options.getMember('user');
        if (!member) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Member Location Failed')
            .setDescription('The specified user is not present in this server.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        try {
          await member.timeout(null, 'Timeout removed by Moderator');
          const successEmbed = new EmbedBuilder()
            .setTitle('🔓 Security Action: Session Restoration Protocol')
            .setDescription(`The temporary session suspension has been revoked. Privileges are fully restored.`)
            .addFields(
              { name: 'Target Account', value: `${member.user} (${member.user.id})`, inline: true },
              { name: 'Authorized Moderator', value: `${interaction.user}`, inline: true }
            )
            .setColor('#10b981')
            .setTimestamp()
            .setFooter({ text: 'Rage Optimiser • Security System' });
          await interaction.reply({ embeds: [successEmbed] });
          logModAction(interaction.guild, member.user, interaction.user, 'Untimeout', 'N/A', context);
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Restoration Execution Failed')
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
            .setTitle('🔒 Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const member = interaction.options.getMember('user');
        if (!member) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Member Location Failed')
            .setDescription('The specified user is not present in this server.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        try {
          await member.timeout(60 * 60 * 1000, 'Moderator Mute');
          const successEmbed = new EmbedBuilder()
            .setTitle('🔇 Security Action: Temporary Voice & Text Mute')
            .setDescription(`The member has been placed under temporary silence restrictions for 1 hour.`)
            .addFields(
              { name: 'Target Account', value: `${member.user} (${member.user.id})`, inline: true },
              { name: 'Authorized Moderator', value: `${interaction.user}`, inline: true }
            )
            .setColor('#eab308')
            .setTimestamp()
            .setFooter({ text: 'Rage Optimiser • Security System' });
          await interaction.reply({ embeds: [successEmbed] });
          logModAction(interaction.guild, member.user, interaction.user, 'Mute', '1h', context);
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Mute Execution Failed')
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
            .setTitle('🔒 Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const member = interaction.options.getMember('user');
        if (!member) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Member Location Failed')
            .setDescription('The specified user is not present in this server.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        try {
          await member.timeout(null, 'Unmuted by Moderator');
          const successEmbed = new EmbedBuilder()
            .setTitle('🔊 Security Action: Silence Restrictions Revoked')
            .setDescription(`The silence restrictions have been successfully revoked. Voice and text privileges are active.`)
            .addFields(
              { name: 'Target Account', value: `${member.user} (${member.user.id})`, inline: true },
              { name: 'Authorized Moderator', value: `${interaction.user}`, inline: true }
            )
            .setColor('#10b981')
            .setTimestamp()
            .setFooter({ text: 'Rage Optimiser • Security System' });
          await interaction.reply({ embeds: [successEmbed] });
          logModAction(interaction.guild, member.user, interaction.user, 'Unmute', 'N/A', context);
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Unmute Execution Failed')
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
            .setTitle('🔒 Access Denied')
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

        const successEmbed = new EmbedBuilder()
          .setTitle('⚠️ Security Action: Formal Notification Issued')
          .setDescription(`A formal warning has been issued to the selected member.\nThe infraction has been securely saved to the warnings log registry.`)
          .addFields(
            { name: 'Target Account', value: `${user} (${user.id})`, inline: true },
            { name: 'Authorized Moderator', value: `${interaction.user}`, inline: true },
            { name: 'Warning Reason', value: reason },
            { name: 'Total Warnings', value: `\`${warnings.length}\``, inline: true }
          )
          .setColor('#eab308')
          .setTimestamp()
          .setFooter({ text: 'Rage Optimiser • Security System' });
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
          .setTitle(`📜 Infraction Warning Log: ${userTag(user)}`)
          .setColor('#4f8cff')
          .setTimestamp()
          .setFooter({ text: 'Rage Optimiser • Infraction Logs' });

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
            .setTitle('🔒 Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const user = interaction.options.getUser('user');
        const guildId = interaction.guildId;
        await clearUserWarnings(guildId, user.id);

        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Warning Logs Revoked')
          .setDescription(`All warning logs have been successfully cleared for the specified member.`)
          .addFields(
            { name: 'Target Account', value: `${user} (${user.id})`, inline: true },
            { name: 'Authorized Moderator', value: `${interaction.user}`, inline: true }
          )
          .setColor('#10b981')
          .setTimestamp()
          .setFooter({ text: 'Rage Optimiser • Security System' });
        await interaction.reply({ embeds: [successEmbed] });
        logModAction(interaction.guild, user, interaction.user, 'Clear Warnings', 'N/A', context);
      }
    },
    {
      name: 'command_purge',
      handler: async (client: any, interaction: any, context: any) => {
        if (!hasModAccess(interaction, context)) {
          const errEmbed = new EmbedBuilder()
            .setTitle('🔒 Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const amount = interaction.options.getInteger('amount');
        if (amount < 1 || amount > 100) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Invalid Parameter')
            .setDescription('The quantity parameters for message deletion must be between 1 and 100.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Validation Check' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        try {
          await interaction.channel.bulkDelete(amount, true);
          const successEmbed = new EmbedBuilder()
            .setTitle('🗑️ Bulk Message Deletion Protocol')
            .setDescription(`A bulk deletion request was successfully executed.`)
            .addFields(
              { name: 'Deleted Messages Count', value: `\`${amount}\``, inline: true },
              { name: 'Target Channel', value: `${interaction.channel}`, inline: true }
            )
            .setColor('#10b981')
            .setTimestamp()
            .setFooter({ text: 'Rage Optimiser • Security System' });
          await interaction.reply({ embeds: [successEmbed], flags: 64 });
          context.logSyncEvent(`Moderation: ${interaction.user.username} purged ${amount} messages in #${interaction.channel.name}.`, 'info');
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Bulk Deletion Failed')
            .setDescription('An error occurred while attempting to delete messages. Messages older than 14 days cannot be bulk deleted.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          await interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
      }
    },
    {
      name: 'command_lock',
      handler: async (client: any, interaction: any, context: any) => {
        if (!hasModAccess(interaction, context)) {
          const errEmbed = new EmbedBuilder()
            .setTitle('🔒 Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        try {
          await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: false });
          const successEmbed = new EmbedBuilder()
            .setTitle('🔒 Channel Lockdown Status: Active')
            .setDescription(`Channel permissions have been restricted. Standard members can no longer send messages in this channel.`)
            .addFields(
              { name: 'Locked Channel', value: `${interaction.channel}`, inline: true },
              { name: 'Authorized Moderator', value: `${interaction.user}`, inline: true }
            )
            .setColor('#f43f5e')
            .setTimestamp()
            .setFooter({ text: 'Rage Optimiser • Security System' });
          await interaction.reply({ embeds: [successEmbed] });
          context.logSyncEvent(`Moderation: ${interaction.user.username} locked #${interaction.channel.name}.`, 'warn');
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Lockdown Execution Failed')
            .setDescription('Failed to edit permissions for this channel.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          await interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
      }
    },
    {
      name: 'command_unlock',
      handler: async (client: any, interaction: any, context: any) => {
        if (!hasModAccess(interaction, context)) {
          const errEmbed = new EmbedBuilder()
            .setTitle('🔒 Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        try {
          await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: null });
          const successEmbed = new EmbedBuilder()
            .setTitle('🔓 Channel Lockdown Status: Inactive')
            .setDescription(`Channel permissions have been restored. Standard members can now send messages.`)
            .addFields(
              { name: 'Unlocked Channel', value: `${interaction.channel}`, inline: true },
              { name: 'Authorized Moderator', value: `${interaction.user}`, inline: true }
            )
            .setColor('#10b981')
            .setTimestamp()
            .setFooter({ text: 'Rage Optimiser • Security System' });
          await interaction.reply({ embeds: [successEmbed] });
          context.logSyncEvent(`Moderation: ${interaction.user.username} unlocked #${interaction.channel.name}.`, 'success');
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Unlock Execution Failed')
            .setDescription('Failed to restore permissions for this channel.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          await interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
      }
    },
    {
      name: 'command_slowmode',
      handler: async (client: any, interaction: any, context: any) => {
        if (!hasModAccess(interaction, context)) {
          const errEmbed = new EmbedBuilder()
            .setTitle('🔒 Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const seconds = interaction.options.getInteger('seconds');
        try {
          await interaction.channel.setRateLimitPerUser(seconds);
          const successEmbed = new EmbedBuilder()
            .setTitle('⏱️ Slowmode Status: Updated')
            .setDescription(`The message rate limit per user has been configured.`)
            .addFields(
              { name: 'Message Interval Delay', value: seconds === 0 ? 'Disabled' : `\`${seconds} seconds\``, inline: true },
              { name: 'Target Channel', value: `${interaction.channel}`, inline: true }
            )
            .setColor('#10b981')
            .setTimestamp()
            .setFooter({ text: 'Rage Optimiser • Security System' });
          await interaction.reply({ embeds: [successEmbed] });
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Slowmode Configuration Failed')
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
            .setTitle('🔒 Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const userId = interaction.options.getString('user_id');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        try {
          await interaction.guild.members.unban(userId, reason);
          const successEmbed = new EmbedBuilder()
            .setTitle('🔓 Security Action: Member Re-authorized')
            .setDescription(`The banishment registry has been updated to re-authorize the specified user ID.`)
            .addFields(
              { name: 'Re-authorized ID', value: `\`${userId}\``, inline: true },
              { name: 'Authorized Moderator', value: `${interaction.user}`, inline: true },
              { name: 'Revocation Reason', value: reason }
            )
            .setColor('#10b981')
            .setTimestamp()
            .setFooter({ text: 'Rage Optimiser • Security System' });
          await interaction.reply({ embeds: [successEmbed] });
          logModAction(interaction.guild, { id: userId, tag: userId }, interaction.user, 'Unban', reason, context);
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Re-authorization Failed')
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
            .setTitle('🔒 Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const member = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        if (!member) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Member Location Failed')
            .setDescription('The specified user is not present in this server.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        try {
          await interaction.guild.members.ban(member.user.id, { deleteMessageSeconds: 7 * 24 * 60 * 60, reason });
          await interaction.guild.members.unban(member.user.id, 'Softban automatic unban');
          const successEmbed = new EmbedBuilder()
            .setTitle('🔨 Security Action: Softban Protocol Executed')
            .setDescription(`The selected member has been softbanned (removed, and message history cleared).`)
            .addFields(
              { name: 'Target Account', value: `${member.user} (${member.user.id})`, inline: true },
              { name: 'Authorized Moderator', value: `${interaction.user}`, inline: true },
              { name: 'Incident Reason', value: reason }
            )
            .setColor('#f43f5e')
            .setTimestamp()
            .setFooter({ text: 'Rage Optimiser • Security System' });
          await interaction.reply({ embeds: [successEmbed] });
          logModAction(interaction.guild, member.user, interaction.user, 'Softban', reason, context);
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Softban Protocol Failed')
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
            .setTitle('🔒 Access Denied')
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
            .setTitle('❌ Member Location Failed')
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
          const successEmbed = new EmbedBuilder()
            .setTitle('⏱️ Security Action: Temporary Guild Suspension')
            .setDescription(`The selected member has been temporarily suspended from the server.`)
            .addFields(
              { name: 'Target Account', value: `${member.user} (${member.user.id})`, inline: true },
              { name: 'Authorized Moderator', value: `${interaction.user}`, inline: true },
              { name: 'Suspension Duration', value: durationStr, inline: true }
            )
            .setColor('#f43f5e')
            .setTimestamp()
            .setFooter({ text: 'Rage Optimiser • Security System' });
          await interaction.reply({ embeds: [successEmbed] });
          logModAction(interaction.guild, member.user, interaction.user, `Tempban (${durationStr})`, reason, context);

          setTimeout(async () => {
            await interaction.guild.members.unban(member.user.id, 'Tempban duration expired.').catch(() => {});
            context.logSyncEvent(`Moderation: Auto-unbanned ${member.user.username} (tempban expired).`, 'success');
          }, ms);
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Temporary Suspension Failed')
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
            .setTitle('🔒 Access Denied')
            .setDescription('You do not possess the required administrative clearances to execute this command.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Access Control System' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        const member = interaction.options.getMember('user');
        const nickname = interaction.options.getString('nickname');
        if (!member) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Member Location Failed')
            .setDescription('The specified user is not present in this server.')
            .setColor('#ff4444')
            .setFooter({ text: 'Rage Optimiser • Error Logs' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
        try {
          await member.setNickname(nickname);
          const successEmbed = new EmbedBuilder()
            .setTitle('✏️ Nickname Status: Updated')
            .setDescription(`The user's display nickname has been successfully modified.`)
            .addFields(
              { name: 'Target Account', value: `${member.user}`, inline: true },
              { name: 'New Nickname', value: `\`${nickname}\``, inline: true }
            )
            .setColor('#10b981')
            .setTimestamp()
            .setFooter({ text: 'Rage Optimiser • Configuration System' });
          await interaction.reply({ embeds: [successEmbed] });
        } catch (e) {
          const errEmbed = new EmbedBuilder()
            .setTitle('❌ Nickname Modification Failed')
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
          .setTitle(`📜 Infraction History: ${userTag(user)}`)
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
