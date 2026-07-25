import { AuditLogEvent, PermissionFlagsBits } from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';

export const SecurityManifest: ModuleManifest = {
  id: 'security',
  name: 'Security Guard',
  version: '1.0.0',
  description: 'Proactive server threat isolation, anti-raid mechanisms, and quarantine controls.',
  configSchema: {
    requiredFields: ['quarantineRoleId', 'alertChannelId', 'antiRaidLimit'],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;

      const roleExists = (id: string) => registry.roles.some(r => r.id === id);
      const channelExists = (id: string) => registry.channels.some(c => c.id === id);

      if (config.quarantineRoleId) {
        progress += 30;
        if (!roleExists(config.quarantineRoleId)) {
          errors.push(`Quarantine role ID (${config.quarantineRoleId}) was deleted from the server!`);
        } else if (config.quarantineRoleId === 'r-1' || config.quarantineRoleId === 'r-2') {
          errors.push('Conflict: Server Owners cannot be selected as the Quarantine Role!');
        }
      }
      if (config.alertChannelId) {
        progress += 30;
        if (!channelExists(config.alertChannelId)) {
          errors.push(`Alert logging channel ID (${config.alertChannelId}) was deleted from the server!`);
        }
      }
      if (config.antiRaidLimit) progress += 20;
      if (config.exceptionRoleIds && config.exceptionRoleIds.length > 0) {
        progress += 20;
        config.exceptionRoleIds.forEach((id: string) => {
          if (!roleExists(id)) errors.push(`Exception role ID (${id}) was deleted from the server!`);
        });
      }

      return { progress, errors };
    }
  },
  commands: [
    {
      name: 'quarantine',
      description: 'Forcefully isolate a suspect server member.',
      options: [
        {
          name: 'user',
          type: 6, // USER
          description: 'The member to quarantine',
          required: true
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_quarantine',
      handler: async (client: any, interaction: any, context: any) => {
        const member = interaction.options.getMember('user');
        if (!member) {
          return interaction.reply({ content: '❌ Member not found.', flags: 64 });
        }

        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        const config = secModule?.config || {};
        const quarantineRoleId = config.quarantineRoleId;

        if (!quarantineRoleId) {
          return interaction.reply({ content: '❌ Quarantine role is not configured in the dashboard.', flags: 64 });
        }

        // Apply quarantine
        try {
          const rolesToRemove = member.roles.cache.filter((r: any) => r.name !== '@everyone' && !r.managed);
          const originalRoleIds = Array.from(rolesToRemove.keys());
          
          try {
            await member.roles.add(quarantineRoleId);
          } catch(e) { console.error('Failed to add quarantine role:', e); }

          for (const roleId of originalRoleIds) {
            try {
              await member.roles.remove(roleId);
            } catch(e) {
              // Ignore hierarchy errors for specific roles
            }
          }
          
          const quarantinedUsers = config.quarantinedUsers || [];
          quarantinedUsers.push({
            id: `q-${Date.now()}`,
            tag: member.user.tag,
            userId: member.user.id,
            reason: 'Manual Quarantine via Slash Command',
            time: new Date().toISOString(),
            status: 'Quarantined',
            risk: 'danger',
            originalRoles: originalRoleIds
          });
          context.updateModuleConfig('security', { quarantinedUsers });
          
          context.logSyncEvent(`Quarantined user "${member.user.tag}" via Slash Command.`, 'warn');
          await interaction.reply({
            content: `🚨 **Member Quarantined**: Successfully isolated ${member.user} and applied protection rules.`
          });
        } catch (err) {
          console.error(err);
          await interaction.reply({
            content: '❌ Failed to apply quarantine. Verify bot roles hierarchy.',
            flags: 64
          });
        }
      }
    },
    {
      name: 'roleUpdate',
      handler: async (client: any, oldRole: any, newRole: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status !== 'enabled') return;

        const config = secModule.config;
        const mode = config.roleMonitorMode || 'All Bots (Default)';
        const monitoredIds: string[] = config.monitoredRoleIds || [];
        
        let isMonitored = false;
        if (mode === 'All Roles') isMonitored = true;
        else if (mode === 'Selected Roles') isMonitored = monitoredIds.includes(newRole.id);
        else if (mode === 'Privileged Only') {
          isMonitored = newRole.permissions.has(PermissionFlagsBits.Administrator) || oldRole.permissions.has(PermissionFlagsBits.Administrator);
        }
        else if (mode === 'Bots Only' || mode === 'All Bots (Default)') {
          isMonitored = newRole.managed;
        }

        if (!isMonitored) return;

        // Check if dangerous permissions were ADDED
        const dangerousPerms = [
          PermissionFlagsBits.Administrator,
          PermissionFlagsBits.ManageGuild,
          PermissionFlagsBits.ManageRoles,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.BanMembers,
          PermissionFlagsBits.KickMembers,
          PermissionFlagsBits.ManageWebhooks
        ];

        let hasNewDangerousPerm = false;
        let addedPerms: string[] = [];

        for (const perm of dangerousPerms) {
          if (!oldRole.permissions.has(perm) && newRole.permissions.has(perm)) {
            hasNewDangerousPerm = true;
            // Get string representation safely
            const permName = Object.keys(PermissionFlagsBits).find(key => (PermissionFlagsBits as any)[key] === perm) || String(perm);
            addedPerms.push(permName);
          }
        }

        if (hasNewDangerousPerm) {
          try {
            const guild = newRole.guild;
            // Try to find who did it
            const fetchedLogs = await guild.fetchAuditLogs({
              limit: 1,
              type: AuditLogEvent.RoleUpdate,
            });
            const roleUpdateLog = fetchedLogs.entries.first();
            let executorId = 'Unknown';
            let executorTag = 'Unknown';
            
            if (roleUpdateLog && roleUpdateLog.target.id === newRole.id && roleUpdateLog.createdTimestamp > (Date.now() - 5000)) {
              if (roleUpdateLog.executor.id === client.user.id) return; // Ignore if the bot did it
              executorId = roleUpdateLog.executor.id;
              executorTag = roleUpdateLog.executor.tag;
            }

            // Revert permissions
            await newRole.setPermissions(oldRole.permissions);
            context.logSyncEvent(`Role Monitoring: Reverted dangerous permissions added to "${newRole.name}" by ${executorTag}.`, 'success');

            // Alert
            if (config.alertChannelId) {
              const alertChan = guild.channels.cache.get(config.alertChannelId);
              if (alertChan && alertChan.isTextBased()) {
                await alertChan.send(`🚨 **[Role Monitoring Triggered]**\n- **Target Role**: <@&${newRole.id}>\n- **Action**: Unauthorized assignment of dangerous permissions (\`${addedPerms.join(', ')}\`)\n- **Executor**: <@${executorId}> (\`${executorId}\`)\n- **Status**: Changes were automatically reverted.`);
              }
            }
          } catch (error) {
            console.error('Failed to revert role permissions:', error);
            context.logSyncEvent(`Role Monitoring: Failed to revert dangerous permissions on "${newRole.name}". Check bot hierarchy.`, 'danger');
          }
        }
      }
    },
    {
      name: 'guildMemberUpdate',
      handler: async (client: any, oldMember: any, newMember: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status !== 'enabled') return;

        const config = secModule.config;
        const quarantineRoleId = config.quarantineRoleId;
        
        if (!quarantineRoleId) return;

        // Check if quarantine role was added manually (or by another bot)
        if (!oldMember.roles.cache.has(quarantineRoleId) && newMember.roles.cache.has(quarantineRoleId)) {
          const quarantinedUsers = config.quarantinedUsers || [];
          
          // If already in queue (e.g. from slash command), do nothing
          if (quarantinedUsers.find((u: any) => u.userId === newMember.id)) return;

          // Strip other roles for safety, acting as if the bot quarantined them
          try {
            const rolesToRemove = newMember.roles.cache.filter((r: any) => r.name !== '@everyone' && !r.managed && r.id !== quarantineRoleId);
            const originalRoleIds = Array.from(rolesToRemove.keys());
            
            for (const roleId of originalRoleIds) {
              try {
                await newMember.roles.remove(roleId);
              } catch (e) {} // ignore hierarchy errors
            }

            quarantinedUsers.push({
              id: `q-${Date.now()}`,
              tag: newMember.user.tag,
              userId: newMember.user.id,
              reason: 'Manual Quarantine via Discord UI',
              time: new Date().toISOString(),
              status: 'Quarantined',
              risk: 'danger',
              originalRoles: originalRoleIds
            });
            context.updateModuleConfig('security', { quarantinedUsers });
            context.logSyncEvent(`Security System: Detected manual quarantine assignment for "${newMember.user.tag}". Automatically stripped other roles and added to queue.`, 'warn');
          } catch (e) {
            console.error('Failed to process manual quarantine:', e);
          }
        }
      }
    },
    {
      name: 'channelDelete',
      handler: async (client: any, channel: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status !== 'enabled') return;

        const config = secModule.config;
        const alertChannelId = config.alertChannelId;
        const exceptionRoleIds = config.exceptionRoleIds || [];
        const quarantineRoleId = config.quarantineRoleId;

        try {
          const guild = channel.guild;
          if (!guild) return;

          // 1. Fetch Audit Logs to check who deleted the channel
          const fetchedLogs = await guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.ChannelDelete,
          });
          const deletionLog = fetchedLogs.entries.first();

          if (!deletionLog) {
            context.logSyncEvent(`Anti-Raid Alert: Channel #${channel.name} was deleted, but audit log could not be fetched.`, 'warn');
            return;
          }

          const executor = deletionLog.executor;
          if (!executor) return;

          // 2. Bypass rules check
          if (executor.id === guild.ownerId) {
            context.logSyncEvent(`Security Policy Bypass: Channel #${channel.name} was deleted by Server Owner (${executor.tag}). Restoration skipped.`, 'info');
            return;
          }

          const member = await guild.members.fetch(executor.id).catch(() => null);
          if (member) {
            const hasException = member.roles.cache.some((role: any) => exceptionRoleIds.includes(role.id));
            if (hasException) {
              context.logSyncEvent(`Security Policy Bypass: Channel #${channel.name} deleted by authorized administrator "${member.user.tag}". Restoration skipped.`, 'info');
              return;
            }
          }

          // 3. Auto-Restore: recreate the deleted channel!
          context.logSyncEvent(`🚨 [Anti-Raid]: Unauthorized channel deletion of #${channel.name} by user "${executor.tag}". RESTORING...`, 'warn');
          
          const restoredChannel = await guild.channels.create({
            name: channel.name,
            type: channel.type,
            parent: channel.parentId,
            permissionOverwrites: channel.permissionOverwrites.cache.map((overwrite: any) => ({
              id: overwrite.id,
              type: overwrite.type,
              allow: overwrite.allow,
              deny: overwrite.deny
            }))
          });

          context.logSyncEvent(`Auto-recovery completed: RESTORED deleted channel #${restoredChannel.name}.`, 'success');

          // 4. Alert & Quarantine the offender!
          if (alertChannelId) {
            const alertChan = guild.channels.cache.get(alertChannelId);
            if (alertChan && alertChan.isTextBased()) {
              await alertChan.send(`🚨 **[Anti-Raid Event Triggered]**\n- **Details**: Unauthorized deletion of channel \`#${channel.name}\`.\n- **Offender**: ${executor} (\`${executor.id}\`)\n- **Action**: Restored channel and quarantined offender.`);
            }
          }

          if (member && quarantineRoleId) {
            const rolesToRemove = member.roles.cache.filter((role: any) => role.name !== '@everyone' && !role.managed);
            try {
              const originalRoleIds = Array.from(rolesToRemove.keys());
              
              try {
                await member.roles.add(quarantineRoleId);
              } catch(e) { console.error('Failed to add quarantine role:', e); }

              for (const roleId of originalRoleIds) {
                try {
                  await member.roles.remove(roleId);
                } catch(e) {}
              }
              
              const quarantinedUsers = config.quarantinedUsers || [];
              quarantinedUsers.push({
                id: `q-${Date.now()}`,
                tag: executor.tag,
                userId: executor.id,
                reason: `Unauthorized channel deletion: #${channel.name}`,
                time: new Date().toISOString(),
                status: 'Quarantined',
                risk: 'danger',
                originalRoles: originalRoleIds
              });
              context.updateModuleConfig('security', { quarantinedUsers });
              
              context.logSyncEvent(`Anti-Raid Isolation: Revoked administrative roles from "${executor.tag}" and applied Quarantine role.`, 'success');
            } catch (err) {
              context.logSyncEvent(`Failed to quarantine offender "${executor.tag}" due to bot permissions hierarchy.`, 'warn');
            }
          }
        } catch (error) {
          console.error('Failed in Anti-Raid channelDelete auto-recovery handler:', error);
        }
      }
    }
  ],
  routes: [
    {
      path: '/quarantine/:userId/action',
      method: 'post',
      handler: async (req, res, context) => {
        const { userId } = req.params;
        const { action } = req.body; // 'release' | 'confirm'
        
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        const config = secModule?.config || {};
        
        const quarantinedUsers = config.quarantinedUsers || [];
        const userEntry = quarantinedUsers.find((u: any) => u.userId === userId);
        
        if (!userEntry) {
          return res.status(404).json({ error: 'User not found in quarantine queue' });
        }
        
        try {
          const client = context.client;
          if (client && process.env.GUILD_ID) {
            const guild = await client.guilds.fetch(process.env.GUILD_ID).catch(() => null);
            if (guild) {
              const member = await guild.members.fetch(userId).catch(() => null);
              
              if (action === 'release' && member) {
                // Remove quarantine role
                if (config.quarantineRoleId) {
                  await member.roles.remove(config.quarantineRoleId).catch(() => null);
                }
                // Restore original roles
                if (userEntry.originalRoles && userEntry.originalRoles.length > 0) {
                  await member.roles.add(userEntry.originalRoles).catch(() => null);
                }
                context.logSyncEvent(`Quarantine Release: Restored original roles for "${userEntry.tag}".`, 'success');
              } else if (action === 'confirm') {
                context.logSyncEvent(`Quarantine Confirmed: Action finalized for "${userEntry.tag}".`, 'warn');
              }
            }
          }
          
          // Remove from queue in both cases
          const updatedUsers = quarantinedUsers.filter((u: any) => u.userId !== userId);
          context.updateModuleConfig('security', { quarantinedUsers: updatedUsers });
          
          res.json({ success: true, updatedUsers });
        } catch (error: any) {
          res.status(500).json({ error: error.message });
        }
      }
    }
  ]
};
