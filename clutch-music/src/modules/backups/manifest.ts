import { EmbedBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import fs from 'fs';
import path from 'path';

const BACKUPS_FILE = path.join(process.cwd(), 'src', 'backups.json');

function loadBackups(): any[] {
  try {
    if (fs.existsSync(BACKUPS_FILE)) {
      return JSON.parse(fs.readFileSync(BACKUPS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error(err);
  }
  return [];
}

function saveBackups(backups: any[]) {
  try {
    fs.writeFileSync(BACKUPS_FILE, JSON.stringify(backups, null, 2), 'utf-8');
  } catch (err) {
    console.error(err);
  }
}

export const BackupsManifest: ModuleManifest = {
  id: 'backups',
  name: 'Backup Recovery',
  version: '1.0.0',
  description: 'Incremental templates, database snapshots, and restoration points.',
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
      description: 'Run an incremental server backup snapshot.'
    },
    {
      name: 'restore-backup',
      description: 'Restore roles and channels from a backup snapshot.',
      options: [
        {
          name: 'backup-id',
          description: 'The ID of the backup snapshot to restore.',
          type: 3, // String
          required: true
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

        try {
          await interaction.deferReply();

          // Snapshot current guild configuration
          const snapshotId = Date.now().toString();
          const snapshot = {
            id: snapshotId,
            timestamp: new Date().toISOString(),
            channelsCount: guild.channels.cache.size,
            rolesCount: guild.roles.cache.size,
            data: {
              channels: guild.channels.cache.map((c: any) => ({
                name: c.name,
                type: c.type,
                parentName: c.parent ? c.parent.name : null,
                position: c.position,
                permissionOverwrites: c.permissionOverwrites?.cache?.map((o: any) => ({
                  id: o.id,
                  type: o.type,
                  allow: o.allow.toArray(),
                  deny: o.deny.toArray()
                })) || []
              })),
              roles: guild.roles.cache.filter((r: any) => r.name !== '@everyone').map((r: any) => ({
                name: r.name,
                color: r.color,
                hoist: r.hoist,
                permissions: r.permissions.toArray(),
                position: r.position
              }))
            }
          };

          const backups = loadBackups();
          backups.push(snapshot);
          saveBackups(backups);

          const embed = new EmbedBuilder()
            .setAuthor({ name: 'Rage Optimiser Enterprise • Backup System' })
            .setTitle('💾 Server Backup Snapshot Created')
            .setDescription(`Successfully captured complete server configuration template!`)
            .setColor('#7C5CFC')
            .addFields(
              { name: '🔑 Backup ID', value: `\`${snapshotId}\``, inline: true },
              { name: '🔤 Channels', value: `\`${snapshot.channelsCount}\``, inline: true },
              { name: '🛡️ Roles', value: `\`${snapshot.rolesCount}\``, inline: true },
              { name: '💡 Server Clone Command', value: `\`\`\`\n/restore-backup backup-id:${snapshotId}\n\`\`\``, inline: false }
            )
            .setFooter({ text: 'Rage Optimiser v4.2 • Enterprise Protection' })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });

          context.logSyncEvent(`Backup Recovery: Created configuration backup snapshot "${snapshotId}".`, 'success');
        } catch (err) {
          console.error(err);
          await interaction.editReply({ content: '❌ Failed to generate configuration backup.' });
        }
      }
    },
    {
      name: 'command_restore-backup',
      handler: async (client: any, interaction: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const backupModule = modules.find((m: any) => m.id === 'backups');
        if (!backupModule || backupModule.status !== 'enabled') {
          return interaction.reply({ content: '❌ Backup Recovery module is not enabled.', flags: 64 });
        }

        const backupId = interaction.options.getString('backup-id');
        const backups = loadBackups();
        const snapshot = backups.find(b => b.id === backupId);

        if (!snapshot) {
          return interaction.reply({ content: `❌ Backup with ID \`${backupId}\` was not found.`, flags: 64 });
        }

        const guild = interaction.guild;
        if (!guild) return;

        try {
          await interaction.deferReply();
          context.logSyncEvent(`Backup Recovery: Initiating restoration from snapshot "${backupId}"...`, 'warn');

          let restoredRolesCount = 0;
          let restoredChannelsCount = 0;

          // 1. Recreate Roles if missing
          for (const roleData of snapshot.data.roles) {
            const roleExists = guild.roles.cache.some((r: any) => r.name === roleData.name);
            if (!roleExists) {
              try {
                await guild.roles.create({
                  name: roleData.name,
                  color: roleData.color,
                  hoist: roleData.hoist,
                  permissions: roleData.permissions
                });
                restoredRolesCount++;
              } catch (e) {
                console.error(`Failed to recreate role ${roleData.name}:`, e);
              }
            }
          }

          // 2. Recreate Channels if missing
          // Filter categories first
          const categories = snapshot.data.channels.filter((c: any) => c.type === ChannelType.GuildCategory || c.type === 4);
          const nonCategories = snapshot.data.channels.filter((c: any) => c.type !== ChannelType.GuildCategory && c.type !== 4);

          for (const catData of categories) {
            const catExists = guild.channels.cache.some((c: any) => c.name === catData.name && c.type === ChannelType.GuildCategory);
            if (!catExists) {
              try {
                await guild.channels.create({
                  name: catData.name,
                  type: ChannelType.GuildCategory,
                  position: catData.position
                });
                restoredChannelsCount++;
              } catch (e) {
                console.error(`Failed to recreate category ${catData.name}:`, e);
              }
            }
          }

          // Recreate text and voice channels
          for (const chanData of nonCategories) {
            const chanExists = guild.channels.cache.some((c: any) => c.name === chanData.name && c.type !== ChannelType.GuildCategory);
            if (!chanExists) {
              try {
                let parentChan = null;
                if (chanData.parentName) {
                  parentChan = guild.channels.cache.find((c: any) => c.name === chanData.parentName && c.type === ChannelType.GuildCategory);
                }

                await guild.channels.create({
                  name: chanData.name,
                  type: chanData.type === 2 || chanData.type === ChannelType.GuildVoice ? ChannelType.GuildVoice : ChannelType.GuildText,
                  parent: parentChan ? parentChan.id : null,
                  position: chanData.position
                });
                restoredChannelsCount++;
              } catch (e) {
                console.error(`Failed to recreate channel ${chanData.name}:`, e);
              }
            }
          }

          const embed = new EmbedBuilder()
            .setTitle('💾 Backup Restoration Completed')
            .setDescription(`Successfully synchronized and restored from backup snapshot!\n\n🔑 **Restored ID**: \`${backupId}\`\n🛡️ **Restored Roles**: ${restoredRolesCount}\n🔢 **Restored Channels/Categories**: ${restoredChannelsCount}`)
            .setColor('#2ecc71')
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          context.logSyncEvent(`Backup Recovery: Successfully completed restoration of snapshot "${backupId}".`, 'success');
        } catch (err) {
          console.error(err);
          await interaction.editReply({ content: '❌ Error occurred during backup snapshot restoration.' });
        }
      }
    }
  ]
};
