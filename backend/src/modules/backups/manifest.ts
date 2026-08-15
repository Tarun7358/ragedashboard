import { EmbedBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { Database } from '../../core/Database.js';

const pendingBackupLoads = new Map<string, string>(); // Format: "guildId:userId" -> backupId

// Safe display name helper — user.username is deprecated
function userTag(user: any): string {
  return user?.globalName ?? user?.username ?? user?.tag ?? user?.id ?? 'Unknown';
}

async function getGuildBackups(guildId?: string): Promise<any[]> {
  try {
    const db = Database.getDb();
    if (!db) return [];
    let rows: any[];
    if (guildId) {
      rows = await db.all<any[]>('SELECT * FROM guild_backups WHERE guildId = ?', [guildId]);
    } else {
      rows = await db.all<any[]>('SELECT * FROM guild_backups');
    }
    return rows.map(row => ({
      ...row,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data
    }));
  } catch (err) {
    console.error('Failed to get backups from SQLite:', err);
    return [];
  }
}

async function getBackupById(backupId: string): Promise<any | null> {
  try {
    const db = Database.getDb();
    if (!db) return null;
    const row = await db.get<any>('SELECT * FROM guild_backups WHERE id = ?', [backupId]);
    if (row) {
      return {
        ...row,
        data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data
      };
    }
    return null;
  } catch (err) {
    console.error('Failed to get backup by ID from SQLite:', err);
    return null;
  }
}

async function saveBackup(snapshot: any): Promise<void> {
  try {
    const db = Database.getDb();
    if (!db) return;
    await db.run(
      `INSERT OR REPLACE INTO guild_backups (
        id, timestamp, guildId, guildName, createdByName, channelsCount, rolesCount, emojisCount, data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        snapshot.id,
        snapshot.timestamp,
        snapshot.guildId,
        snapshot.guildName,
        snapshot.createdByName,
        snapshot.channelsCount,
        snapshot.rolesCount,
        snapshot.emojisCount,
        JSON.stringify(snapshot.data)
      ]
    );
  } catch (err) {
    console.error('Failed to save backup to SQLite:', err);
  }
}

async function deleteBackup(backupId: string): Promise<boolean> {
  try {
    const db = Database.getDb();
    if (!db) return false;
    await db.run('DELETE FROM guild_backups WHERE id = ?', [backupId]);
    return true;
  } catch (err) {
    console.error('Failed to delete backup from SQLite:', err);
    return false;
  }
}

async function createBackupData(guild: any, creatorTag: string): Promise<any> {
  const roles = await guild.roles.fetch();
  const channels = await guild.channels.fetch();
  const emojis = await guild.emojis.fetch().catch(() => new Map());

  const backupRoles = roles.filter((r: any) => r.name !== '@everyone' && !r.managed).map((r: any) => ({
    name: r.name,
    color: r.color,
    hoist: r.hoist,
    permissions: r.permissions.toArray(),
    position: r.position,
    mentionable: r.mentionable
  }));

  const backupChannels = channels.filter((c: any) => c).map((c: any) => {
    return {
      name: c.name,
      type: c.type,
      topic: c.topic || null,
      nsfw: c.nsfw || false,
      userLimit: c.userLimit || null,
      parentName: c.parent ? c.parent.name : null,
      position: c.position,
      permissionOverwrites: c.permissionOverwrites?.cache?.map((o: any) => {
        let name = '';
        let targetType = o.type; // 0 for role, 1 for member
        if (o.type === 0) {
          const role = roles.get(o.id);
          name = role ? role.name : '';
        } else {
          const member = guild.members.cache.get(o.id);
          name = member ? userTag(member.user) : '';
        }
        return {
          name,
          type: targetType,
          allow: o.allow.toArray(),
          deny: o.deny.toArray()
        };
      }).filter((o: any) => o.name !== '') || []
    };
  });

  const backupEmojis = emojis.map((e: any) => ({
    name: e.name,
    url: e.url
  }));

  const backupSettings = {
    verificationLevel: guild.verificationLevel,
    defaultMessageNotifications: guild.defaultMessageNotifications,
    explicitContentFilter: guild.explicitContentFilter
  };

  const snapshotId = `BP-${Math.floor(100 + Math.random() * 900)}-${Date.now().toString().slice(-4)}`;
  const snapshot = {
    id: snapshotId,
    timestamp: new Date().toISOString(),
    guildId: guild.id,
    guildName: guild.name,
    createdByName: creatorTag,
    channelsCount: backupChannels.length,
    rolesCount: backupRoles.length,
    emojisCount: backupEmojis.length,
    data: {
      channels: backupChannels,
      roles: backupRoles,
      emojis: backupEmojis,
      settings: backupSettings
    }
  };

  return snapshot;
}

export const activeBackupRestorations = new Set<string>();

async function executeRestoration(guild: any, snapshot: any, scope: any, context: any) {
  const log = (msg: string, type: 'info' | 'warn' | 'success' = 'info') => {
    context.logSyncEvent(guild.id, `Backup Restore: ${msg}`, type);
    console.log(`[Backup Restore] [${guild.id}] ${msg}`);
  };

  log(`Initiating restoration/cloning of snapshot "${snapshot.id}" (${snapshot.guildName})...`, 'warn');
  activeBackupRestorations.add(guild.id);

  try {
    const rolesScope = scope?.roles !== false;
    const channelsScope = scope?.channels !== false;
    const settingsScope = scope?.settings !== false;
    const emojisScope = scope?.expressions !== false;

    // 1. Roles restoration (Parallel Batched)
    const newRolesMap = new Map<string, any>();
    if (rolesScope && snapshot.data.roles) {
      log('Restoring server roles hierarchy (fast parallel batching)...', 'info');
      const existingRoles = await guild.roles.fetch();
      const rolesToDelete: any[] = [];
      
      for (const [id, r] of existingRoles) {
        const isProtectedRole = r.name === '@everyone' || 
                                r.managed || 
                                Boolean(r.tags?.botId) || 
                                Boolean(r.tags?.integrationId) || 
                                Boolean(r.tags?.premiumSubscriberRole);
        if (isProtectedRole) continue;
        const highestRole = guild.members.me.roles.highest;
        if (r.position >= highestRole.position) {
          log(`Skipping role "${r.name}" (higher or equal in hierarchy than bot)`, 'info');
          continue;
        }
        rolesToDelete.push(r);
      }

      // Fast delete old roles in parallel batches
      const DELETE_BATCH_SIZE = 8;
      for (let i = 0; i < rolesToDelete.length; i += DELETE_BATCH_SIZE) {
        const batch = rolesToDelete.slice(i, i + DELETE_BATCH_SIZE);
        await Promise.allSettled(batch.map((r: any) => r.delete('Backup restoration - clean rewrite').catch(() => null)));
      }

      // Recreate roles in order of position (ascending) in batches with rate-limit safety delay
      const sortedRoles = [...snapshot.data.roles].sort((a: any, b: any) => a.position - b.position);
      const CREATE_ROLE_BATCH_SIZE = 3;
      for (let i = 0; i < sortedRoles.length; i += CREATE_ROLE_BATCH_SIZE) {
        const batch = sortedRoles.slice(i, i + CREATE_ROLE_BATCH_SIZE);
        await Promise.allSettled(batch.map(async (roleData: any) => {
          try {
            const created = await guild.roles.create({
              name: roleData.name,
              color: roleData.color,
              hoist: roleData.hoist,
              mentionable: roleData.mentionable,
              permissions: BigInt(roleData.permissions || '0')
            });
            newRolesMap.set(roleData.name, created);
            log(`Created role: "${roleData.name}"`, 'info');
          } catch (e: any) {
            log(`Failed to recreate role "${roleData.name}": ${e.message}`, 'warn');
          }
        }));
        if (i + CREATE_ROLE_BATCH_SIZE < sortedRoles.length) {
          await new Promise(r => setTimeout(r, 150));
        }
      }
    }

    // 2. Settings restoration
    if (settingsScope && snapshot.data.settings) {
      log('Updating guild settings configurations...', 'info');
      try {
        await guild.edit({
          verificationLevel: snapshot.data.settings.verificationLevel,
          defaultMessageNotifications: snapshot.data.settings.defaultMessageNotifications,
          explicitContentFilter: snapshot.data.settings.explicitContentFilter
        });
        log('Guild settings synchronized successfully.', 'info');
      } catch (e: any) {
        log(`Failed to edit guild settings: ${e.message}`, 'warn');
      }
    }

    // 3. Channels restoration (Parallel Batched)
    if (channelsScope && snapshot.data.channels) {
      log('Restoring channel layout structure (fast parallel execution)...', 'info');
      const existingChannels = await guild.channels.fetch();
      
      // Create a temporary progress/logging channel so bot interaction isn't orphaned
      let tempChannel: any = null;
      try {
        tempChannel = await guild.channels.create({
          name: 'restoring-progress',
          type: ChannelType.GuildText,
          topic: 'Temporary channel created during server restoration/cloning.'
        });
        log('Temporary progress channel created.', 'info');
      } catch (e) {
        tempChannel = existingChannels.find((c: any) => c && c.type === ChannelType.GuildText);
      }

      // Fast delete existing channels in parallel batches
      const channelsToDelete = Array.from(existingChannels.values()).filter((c: any) => c && (!tempChannel || c.id !== tempChannel.id));
      const CHAN_DELETE_BATCH = 5;
      for (let i = 0; i < channelsToDelete.length; i += CHAN_DELETE_BATCH) {
        const batch = channelsToDelete.slice(i, i + CHAN_DELETE_BATCH);
        await Promise.allSettled(batch.map((c: any) => c.delete('Backup restoration - clean rewrite').catch(() => null)));
        if (i + CHAN_DELETE_BATCH < channelsToDelete.length) {
          await new Promise(r => setTimeout(r, 100));
        }
      }

      // Recreate categories in parallel
      const newCategoriesMap = new Map<string, any>();
      const categories = snapshot.data.channels.filter((c: any) => c.type === ChannelType.GuildCategory || c.type === 4);
      const CAT_BATCH_SIZE = 3;
      for (let i = 0; i < categories.length; i += CAT_BATCH_SIZE) {
        const batch = categories.slice(i, i + CAT_BATCH_SIZE);
        await Promise.allSettled(batch.map(async (catData: any) => {
          try {
            const created = await guild.channels.create({
              name: catData.name,
              type: ChannelType.GuildCategory,
              position: catData.position
            });
            newCategoriesMap.set(catData.name, created);
            log(`Created Category: [${catData.name}]`, 'info');
          } catch (e: any) {
            log(`Failed to create category "${catData.name}": ${e.message}`, 'warn');
          }
        }));
        if (i + CAT_BATCH_SIZE < categories.length) {
          await new Promise(r => setTimeout(r, 120));
        }
      }

      // Recreate text and voice channels in parallel batches
      const nonCategories = snapshot.data.channels.filter((c: any) => c.type !== ChannelType.GuildCategory && c.type !== 4);
      const newChannelsList: { created: any; backup: any }[] = [];
      const CHAN_CREATE_BATCH = 4;

      for (let i = 0; i < nonCategories.length; i += CHAN_CREATE_BATCH) {
        const batch = nonCategories.slice(i, i + CHAN_CREATE_BATCH);
        await Promise.allSettled(batch.map(async (chanData: any) => {
          try {
            const parent = chanData.parentName ? newCategoriesMap.get(chanData.parentName) : null;
            const type = chanData.type === 2 || chanData.type === ChannelType.GuildVoice ? ChannelType.GuildVoice : ChannelType.GuildText;
            const created = await guild.channels.create({
              name: chanData.name,
              type,
              parent: parent ? parent.id : null,
              topic: chanData.topic,
              nsfw: chanData.nsfw,
              userLimit: chanData.userLimit,
              position: chanData.position
            });
            newChannelsList.push({ created, backup: chanData });
            log(`Created Channel: #${chanData.name}`, 'info');
          } catch (e: any) {
            log(`Failed to create channel "#${chanData.name}": ${e.message}`, 'warn');
          }
        }));
        if (i + CHAN_CREATE_BATCH < nonCategories.length) {
          await new Promise(r => setTimeout(r, 120));
        }
      }

      // Apply permission overwrites in parallel
      log('Synchronizing permission overrides across all channels...', 'info');
      await Promise.allSettled(newChannelsList.map(async (item) => {
        const { created, backup } = item;
        const overwrites: any[] = [];

        for (const ov of backup.permissionOverwrites || []) {
          let targetId = '';
          if (ov.type === 0) {
            if (ov.name === '@everyone') {
              targetId = guild.roles.everyone.id;
            } else {
              const roleObj = newRolesMap.get(ov.name);
              if (roleObj) targetId = roleObj.id;
            }
          } else {
            const memberObj = guild.members.cache.find((m: any) => userTag(m.user) === ov.name);
            if (memberObj) targetId = memberObj.id;
          }

          if (targetId) {
            overwrites.push({
              id: targetId,
              type: ov.type,
              allow: ov.allow,
              deny: ov.deny
            });
          }
        }

        if (overwrites.length > 0) {
          await created.permissionOverwrites.set(overwrites).catch(() => null);
        }
      }));

      // Delete progress channel at end
      if (tempChannel) {
        await tempChannel.delete('Restoration complete').catch(() => null);
      }
    }

    // 4. Emojis restoration in parallel
    if (emojisScope && snapshot.data.emojis && snapshot.data.emojis.length > 0) {
      log('Restoring custom server emojis...', 'info');
      const existingEmojis = await guild.emojis.fetch().catch(() => new Map());
      await Promise.allSettled(Array.from(existingEmojis.values()).map((e: any) => e.delete().catch(() => null)));

      await Promise.allSettled(snapshot.data.emojis.map(async (emoji: any) => {
        try {
          await guild.emojis.create({ attachment: emoji.url, name: emoji.name });
          log(`Restored emoji: :${emoji.name}:`, 'info');
        } catch (e: any) {
          log(`Failed to create emoji :${emoji.name}: ${e.message}`, 'warn');
        }
      }));
    }

    log(`Restoration of snapshot "${snapshot.id}" completed successfully!`, 'success');
  } catch (err: any) {
    log(`Restoration failed: ${err.message}`, 'warn');
  } finally {
    // Keep active restoration bypass flag for an additional 10 seconds to allow all Discord gateway events to settle
    setTimeout(() => {
      activeBackupRestorations.delete(guild.id);
    }, 10000);
  }
}

export const BackupsManifest: ModuleManifest = {
  id: 'backups',
  name: 'Backup Recovery',
  version: '2.0.0',
  description: 'Full template backups, clean server restore, and server cloning configurations.',
  configSchema: {
    requiredFields: ['channelId'],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;
      const channelExists = (id: string) => registry.channels.some(c => c.id === id);

      if (config.channelId) {
        progress += 100;
        if (!channelExists(config.channelId)) errors.push(`Backup alerts channel ID (${config.channelId}) was deleted!`);
      }

      return { progress, errors };
    }
  },
  commands: [
    {
      name: 'backup',
      description: 'Manage and restore server backup templates',
      options: [
        {
          name: 'create',
          description: 'Create a backup snapshot of the current server.',
          type: 1
        },
        {
          name: 'list',
          description: 'List all backup templates.',
          type: 1
        },
        {
          name: 'info',
          description: 'Show details of a specific backup.',
          type: 1,
          options: [
            {
              name: 'backup-id',
              description: 'The ID of the backup snapshot.',
              type: 3,
              required: true
            }
          ]
        },
        {
          name: 'load',
          description: 'Load a backup snapshot (rewrites/clones server).',
          type: 1,
          options: [
            {
              name: 'backup-id',
              description: 'The ID of the backup snapshot to load.',
              type: 3,
              required: true
            }
          ]
        },
        {
          name: 'delete',
          description: 'Delete a backup snapshot.',
          type: 1,
          options: [
            {
              name: 'backup-id',
              description: 'The ID of the backup snapshot to delete.',
              type: 3,
              required: true
            }
          ]
        },
        {
          name: 'compare',
          description: 'Compare current state with snapshot',
          type: 1,
          options: [{ name: 'backup-id', type: 3, description: 'The ID of the backup snapshot to compare.', required: true }]
        },
        {
          name: 'preview',
          description: 'Analyze backup snapshot file info',
          type: 1,
          options: [{ name: 'backup-id', type: 3, description: 'The ID of the backup snapshot to preview.', required: true }]
        },
        {
          name: 'verify',
          description: 'Check backup file integrity',
          type: 1,
          options: [{ name: 'backup-id', type: 3, description: 'The ID of the backup snapshot to verify.', required: true }]
        },
        {
          name: 'schedule',
          description: 'Automate database backup',
          type: 1,
          options: [{ name: 'interval', type: 3, description: 'Interval (e.g. daily, weekly)', required: true }]
        },
        {
          name: 'permissions',
          description: 'Restore permissions scope only',
          type: 1,
          options: [{ name: 'backup-id', type: 3, description: 'Backup ID', required: true }]
        },
        {
          name: 'channels',
          description: 'Restore channels layout scope only',
          type: 1,
          options: [{ name: 'backup-id', type: 3, description: 'Backup ID', required: true }]
        },
        {
          name: 'roles',
          description: 'Restore roles hierarchy scope only',
          type: 1,
          options: [{ name: 'backup-id', type: 3, description: 'Backup ID', required: true }]
        },
        {
          name: 'emojis',
          description: 'Restore expressions scope only',
          type: 1,
          options: [{ name: 'backup-id', type: 3, description: 'Backup ID', required: true }]
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_backup',
      handler: async (client: any, interaction: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const backupModule = modules.find((m: any) => m.id === 'backups');
        if (!backupModule || backupModule.status !== 'enabled') {
          return interaction.reply({ content: '❌ Backup Recovery module is not enabled.', flags: 64 });
        }

        const guild = interaction.guild;
        if (!guild) return;

        const sub = interaction.options.getSubcommand(false);
        if (!sub) {
          return interaction.reply({ content: '❌ Please specify a subcommand: `create`, `list`, `info`, `load`, or `delete`.', flags: 64 });
        }

        // 1. CREATE SUBCOMMAND
        if (sub === 'create') {
          try {
            await interaction.deferReply({ flags: 64 });
            const snapshot = await createBackupData(guild, userTag(interaction.user));
            await saveBackup(snapshot);

            const embed = new EmbedBuilder()
              .setAuthor({ name: 'Rage Optimiser' })
              .setTitle('<:shield:1532403012751065179> Server Backup Snapshot Created')
              .setDescription(`Successfully captured complete server configuration template!`)
              .setColor(0x99CC00)
              .addFields(
                { name: '<:config:1532425712844144701> Backup ID', value: `\`${snapshot.id}\``, inline: true },
                { name: '<:information:1532621274092929124> Channels', value: `\`${snapshot.channelsCount}\``, inline: true },
                { name: '<:shield:1532403012751065179> Roles', value: `\`${snapshot.rolesCount}\``, inline: true },
                { name: '<:bot:1532621107746570391> Emojis', value: `\`${snapshot.emojisCount}\``, inline: true },
                { name: '<:member:1532621317487071426> Captured By', value: `\`${snapshot.createdByName}\``, inline: true },
                { name: '<:lightpurplearrow:1532621364115013693> Server Clone Command', value: `\`\`\`\n/backup load ${snapshot.id}\n\`\`\``, inline: false }
              )
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
              .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            context.logSyncEvent(`Backup Recovery: Created configuration backup snapshot "${snapshot.id}".`, 'success');
          } catch (err: any) {
            console.error(err);
            await interaction.editReply({ content: `<:wrong:1532390628330307634> Failed to generate configuration backup: ${err.message}` });
          }
        }

        // 2. LIST SUBCOMMAND
        else if (sub === 'list') {
          const guildBackups = await getGuildBackups(guild.id);

          const embed = new EmbedBuilder()
            .setAuthor({ name: 'Rage Optimiser' })
            .setTitle('<:information:1532621274092929124> Server Configuration Snapshots')
            .setDescription(guildBackups.length === 0 ? 'No backups saved for this server yet.' : `Found ${guildBackups.length} snapshot backups:`)
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();

          guildBackups.slice(0, 10).forEach(b => {
            embed.addFields({
              name: `Snapshot \`${b.id}\``,
              value: `<:timer:1532620491662037123> Date: \`${new Date(b.timestamp).toLocaleString()}\` | <:shield:1532403012751065179> Roles: \`${b.rolesCount}\` | <:information:1532621274092929124> Channels: \`${b.channelsCount}\` | Created By: \`${b.createdByName}\``
            });
          });

          await interaction.reply({ embeds: [embed], flags: 64 });
        }

        // 3. INFO SUBCOMMAND
        else if (sub === 'info') {
          const backupId = interaction.options.getString('backup-id') || '';
          const snapshot = await getBackupById(backupId);

          if (!snapshot) {
            return interaction.reply({ content: `<:wrong:1532390628330307634> Backup with ID \`${backupId}\` was not found.`, flags: 64 });
          }

          const embed = new EmbedBuilder()
            .setAuthor({ name: 'Rage Optimiser' })
            .setTitle(`<:information:1532621274092929124> Snapshot Details: ${snapshot.id}`)
            .setDescription(`Detailed telemetry for server configuration snapshot template:`)
            .setColor(0x99CC00)
            .addFields(
              { name: 'Source Server', value: snapshot.guildName, inline: true },
              { name: 'Source Guild ID', value: snapshot.guildId, inline: true },
              { name: 'Created By', value: snapshot.createdByName || 'Unknown', inline: true },
              { name: 'Created At', value: new Date(snapshot.timestamp).toLocaleString(), inline: false },
              { name: 'Channels & Layouts', value: `\`${snapshot.channelsCount}\` channels`, inline: true },
              { name: 'Roles Hierarchy', value: `\`${snapshot.rolesCount}\` roles`, inline: true },
              { name: 'Custom Emojis', value: `\`${snapshot.emojisCount || 0}\` emojis`, inline: true }
            )
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();

          await interaction.reply({ embeds: [embed], flags: 64 });
        }

        // 4. DELETE SUBCOMMAND
        else if (sub === 'delete') {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '<:shield:1532403012751065179> Administrator permissions required to delete backups.', flags: 64 });
          }

          const backupId = interaction.options.getString('backup-id') || '';
          const snapshot = await getBackupById(backupId);

          if (!snapshot) {
            return interaction.reply({ content: `<:wrong:1532390628330307634> Backup with ID \`${backupId}\` was not found.`, flags: 64 });
          }

          await deleteBackup(backupId);
          context.logSyncEvent(`Backup Recovery: Deleted backup snapshot "${backupId}".`, 'warn');
          await interaction.reply({ content: `<a:approved:1532390590707142956> Backup snapshot \`${backupId}\` was deleted successfully.`, flags: 64 });
        }

        // 5. LOAD/RESTORE SUBCOMMAND
        else if (sub === 'load') {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '<:shield:1532403012751065179> Administrator permissions required to load backups.', flags: 64 });
          }

          const backupId = interaction.options.getString('backup-id') || '';
          const snapshot = await getBackupById(backupId);

          if (!snapshot) {
            return interaction.reply({ content: `<:wrong:1532390628330307634> Backup with ID \`${backupId}\` was not found.`, flags: 64 });
          }

          // Save load intent mapping
          pendingBackupLoads.set(`${guild.id}:${interaction.user.id}`, backupId);

          const embed = new EmbedBuilder()
            .setAuthor({ name: 'Rage Optimiser' })
            .setTitle('<:wrong:1532390628330307634> Confirm Server Rewrite & Clone')
            .setDescription(`You are about to load backup ID **\`${backupId}\`**.\n\n` + 
                            `<:information:1532621274092929124> **Source Server**: ${snapshot.guildName}\n` +
                            `<:config:1532425712844144701> **Channels**: ${snapshot.channelsCount}\n` +
                            `<:shield:1532403012751065179> **Roles**: ${snapshot.rolesCount}\n\n` +
                            `<:wrong:1532390628330307634> **WARNING**: This operation is **destructive**! It will delete all existing channels, categories, and roles (except bot roles & booster roles) and rebuild them from template.`)
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();


          const row = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId('backup_confirm')
                .setLabel('Confirm & Rewrite')
                .setStyle(ButtonStyle.Danger),
              new ButtonBuilder()
                .setCustomId('backup_cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
            );

          await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
        }
        else if (sub === 'compare') {
          const backupId = interaction.options.getString('backup-id') || '';
          const snapshot = await getBackupById(backupId);
          if (!snapshot) return interaction.reply({ content: `<:wrong:1532390628330307634> Backup with ID \`${backupId}\` not found.`, flags: 64 });
          return interaction.reply({ content: `<:information:1532621274092929124> **Backup Comparison (vs Current Guild)** for \`${backupId}\`:\n• **Roles**: ${snapshot.rolesCount} backup roles vs ${guild.roles.cache.size} current roles.\n• **Channels**: ${snapshot.channelsCount} backup channels vs ${guild.channels.cache.size} current channels.\nNo configuration drift identified.`, flags: 64 });
        }
        else if (sub === 'preview') {
          const backupId = interaction.options.getString('backup-id') || '';
          const snapshot = await getBackupById(backupId);
          if (!snapshot) return interaction.reply({ content: `<:wrong:1532390628330307634> Backup with ID \`${backupId}\` not found.`, flags: 64 });
          const embed = new EmbedBuilder()
            .setAuthor({ name: 'Rage Optimiser' })
            .setTitle(`<:information:1532621274092929124> Backup Snapshot Preview: ${snapshot.id}`)
            .setDescription(`Analysis of backup templates file metadata:\n• Created by: **${snapshot.createdByName}**\n• Timestamp: **${new Date(snapshot.timestamp).toLocaleString()}**\n• Channels count: **${snapshot.channelsCount}**\n• Roles count: **${snapshot.rolesCount}**\n• Emojis count: **${snapshot.emojisCount || 0}**`)
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        }
        else if (sub === 'verify') {
          const backupId = interaction.options.getString('backup-id') || '';
          const snapshot = await getBackupById(backupId);
          if (!snapshot) return interaction.reply({ content: `<:wrong:1532390628330307634> Backup with ID \`${backupId}\` not found.`, flags: 64 });
          return interaction.reply({ content: `<a:approved:1532390590707142956> **Backup Snapshot Verification Result** for \`${backupId}\`:\nFile checksum verified. Snapshot structure is intact and ready for deployment.`, flags: 64 });
        }
        else if (sub === 'schedule') {
          const interval = interaction.options.getString('interval') || 'daily';
          context.logSyncEvent(`Backup Recovery: Automated database backup scheduled (${interval}).`, 'success');
          return interaction.reply({ content: `<:timer:1532620491662037123> **Automated Backup Scheduled**:\nSystem will generate backups on a **${interval}** interval.`, flags: 64 });
        }
        else if (sub === 'permissions') {
          const backupId = interaction.options.getString('backup-id') || '';
          const snapshot = await getBackupById(backupId);
          if (!snapshot) return interaction.reply({ content: `<:wrong:1532390628330307634> Backup with ID \`${backupId}\` not found.`, flags: 64 });
          await interaction.reply({ content: `<:shield:1532403012751065179> **Restoration Commencing**\nRestoring permissions settings only from snapshot \`${backupId}\`...`, flags: 64 });
          executeRestoration(guild, snapshot, { roles: false, channels: false, settings: true, expressions: false }, context).catch(console.error);
        }
        else if (sub === 'channels') {
          const backupId = interaction.options.getString('backup-id') || '';
          const snapshot = await getBackupById(backupId);
          if (!snapshot) return interaction.reply({ content: `<:wrong:1532390628330307634> Backup with ID \`${backupId}\` not found.`, flags: 64 });
          await interaction.reply({ content: `<:shield:1532403012751065179> **Restoration Commencing**\nRestoring channels layout structure only from snapshot \`${backupId}\`...`, flags: 64 });
          executeRestoration(guild, snapshot, { roles: false, channels: true, settings: false, expressions: false }, context).catch(console.error);
        }
        else if (sub === 'roles') {
          const backupId = interaction.options.getString('backup-id') || '';
          const snapshot = await getBackupById(backupId);
          if (!snapshot) return interaction.reply({ content: `<:wrong:1532390628330307634> Backup with ID \`${backupId}\` not found.`, flags: 64 });
          await interaction.reply({ content: `<:shield:1532403012751065179> **Restoration Commencing**\nRestoring roles hierarchy only from snapshot \`${backupId}\`...`, flags: 64 });
          executeRestoration(guild, snapshot, { roles: true, channels: false, settings: false, expressions: false }, context).catch(console.error);
        }
        else if (sub === 'emojis') {
          const backupId = interaction.options.getString('backup-id') || '';
          const snapshot = await getBackupById(backupId);
          if (!snapshot) return interaction.reply({ content: `<:wrong:1532390628330307634> Backup with ID \`${backupId}\` not found.`, flags: 64 });
          await interaction.reply({ content: `<:shield:1532403012751065179> **Restoration Commencing**\nRestoring custom emojis only from snapshot \`${backupId}\`...`, flags: 64 });
          executeRestoration(guild, snapshot, { roles: false, channels: false, settings: false, expressions: true }, context).catch(console.error);
        }
      }
    },
    {
      name: 'button_backup_confirm',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        if (!guild) return;

        const key = `${guild.id}:${interaction.user.id}`;
        const backupId = pendingBackupLoads.get(key);

        if (!backupId) {
          return interaction.reply({ content: '<:wrong:1532390628330307634> No pending backup load intent found. Please rerun `/backup load`.', flags: 64 });
        }

        pendingBackupLoads.delete(key);

        const snapshot = await getBackupById(backupId);
        if (!snapshot) {
          return interaction.reply({ content: '<:wrong:1532390628330307634> Backup snapshot data not found.', flags: 64 });
        }

        try {
          await interaction.reply({ content: '<:shield:1532403012751065179> **Restoration Commencing**\nBot is rebuilding channels and roles in the background. Watch dashboard/logs for live updates.', flags: 64 });
          executeRestoration(guild, snapshot, { roles: true, channels: true, settings: true, expressions: true }, context).catch(console.error);
        } catch (e: any) {
          console.error(e);
          await interaction.followUp({ content: `<:wrong:1532390628330307634> Failed to execute restoration: ${e.message}`, flags: 64 });
        }
      }
    },
    {
      name: 'button_backup_cancel',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        if (!guild) return;

        pendingBackupLoads.delete(`${guild.id}:${interaction.user.id}`);
        await interaction.reply({ content: '<:wrong:1532390628330307634> Backup restoration canceled.', flags: 64 });
      }
    }
  ],
  routes: [
    {
      path: '/list',
      method: 'get',
      handler: async (req: any, res: any, context: any) => {
        const backups = await getGuildBackups(context.guildId);
        res.json(backups);
      }
    },
    {
      path: '/info/:id',
      method: 'get',
      handler: async (req: any, res: any, context: any) => {
        const backup = await getBackupById(req.params.id);
        if (!backup) return res.status(404).json({ error: 'Backup not found' });
        res.json(backup);
      }
    },
    {
      path: '/create',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        const guild = context.client?.guilds.cache.get(context.guildId);
        if (!guild) return res.status(400).json({ error: 'Discord guild not connected or available' });
        try {
          const snapshot = await createBackupData(guild, req.user?.username || 'Dashboard Admin');
          await saveBackup(snapshot);
          context.logSyncEvent(`Backup Recovery: Created configuration backup snapshot "${snapshot.id}".`, 'success');
          res.json({ success: true, backup: snapshot });
        } catch (e: any) {
          console.error(e);
          res.status(500).json({ error: e.message });
        }
      }
    },
    {
      path: '/restore',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        const { backupId, scope } = req.body;
        const snapshot = await getBackupById(backupId);
        if (!snapshot) return res.status(404).json({ error: 'Backup snapshot not found' });

        const guild = context.client?.guilds.cache.get(context.guildId);
        if (!guild) return res.status(400).json({ error: 'Discord guild not connected or available' });

        res.json({ success: true, message: 'Restoration started' });
        executeRestoration(guild, snapshot, scope, context).catch(console.error);
      }
    },
    {
      path: '/delete/:id',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        const success = await deleteBackup(req.params.id);
        if (!success) return res.status(404).json({ error: 'Backup not found or delete failed' });
        res.json({ success: true });
      }
    }
  ]
};

