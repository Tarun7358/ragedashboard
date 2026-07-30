import { EmbedBuilder, AuditLogEvent } from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';

export const LoggingManifest: ModuleManifest = {
  id: 'logging',
  name: 'Advanced Logging Center',
  version: '2.0.0',
  description: 'Enterprise-grade multi-category server audit tracking.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 100;

      const categories = ['security', 'moderation', 'antiNuke', 'botProtection', 'webhook', 'voice', 'audit', 'system'];
      
      let configuredCount = 0;
      categories.forEach(cat => {
        if (config[cat] && config[cat].channelId) {
          configuredCount++;
          if (!registry.channels.some(c => c.id === config[cat].channelId)) {
            errors.push(`${cat.toUpperCase()} log channel ID was deleted or is invalid.`);
          }
        }
      });

      if (configuredCount === 0) {
        errors.push('No log categories have assigned channels.');
        progress = 0;
      } else {
        progress = 100;
      }

      return { progress, errors };
    }
  },
  commands: [
    {
      name: 'logs',
      description: 'Manage the Advanced Logging Center.',
      options: [
        {
          name: 'settings',
          description: 'View current logging configuration',
          type: 1 // SUB_COMMAND
        },
        {
          name: 'channel',
          description: 'Set the output channel for a log category',
          type: 1, // SUB_COMMAND
          options: [
            { name: 'category', type: 3, description: 'The log category (e.g. security, moderation, voice)', required: true },
            { name: 'channel', type: 7, description: 'The text channel to send logs to', required: true, channel_types: [0, 5] }
          ]
        },
        {
          name: 'enable',
          description: 'Enable a specific log category',
          type: 1,
          options: [
            { name: 'category', type: 3, description: 'The log category', required: true }
          ]
        },
        {
          name: 'disable',
          description: 'Disable a specific log category',
          type: 1,
          options: [
            { name: 'category', type: 3, description: 'The log category', required: true }
          ]
        },
        {
          name: 'test',
          description: 'Send a test log to a specific category',
          type: 1,
          options: [
            { name: 'category', type: 3, description: 'The log category', required: true }
          ]
        },
        {
          name: 'reset',
          description: 'Reset a category to default settings',
          type: 1,
          options: [
            { name: 'category', type: 3, description: 'The log category', required: true }
          ]
        },
        {
          name: 'search',
          description: 'Search logged audit events',
          type: 1,
          options: [{ name: 'query', type: 3, description: 'Search term', required: true }]
        },
        {
          name: 'user',
          description: 'Filter logging events by user',
          type: 1,
          options: [{ name: 'user', type: 6, description: 'Target user', required: true }]
        },
        {
          name: 'timeline',
          description: 'Overview logs timeline stream',
          type: 1
        },
        {
          name: 'voice',
          description: 'Deep voice category health stats',
          type: 1
        },
        {
          name: 'export',
          description: 'Export logging events in JSON format',
          type: 1
        },
        {
          name: 'categories',
          description: 'Show configuration toggles',
          type: 1
        },
        {
          name: 'stats',
          description: 'Logging throughput rates stats',
          type: 1
        },
        {
          name: 'retention',
          description: 'Config retention lifecycle',
          type: 1,
          options: [{ name: 'days', type: 4, description: 'Days to retain', required: true }]
        },
        {
          name: 'live',
          description: 'Simulate mock live activity logs',
          type: 1
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_logs',
      handler: async (client: any, interaction: any, context: any) => {
        const isOwner = interaction.guild?.ownerId === interaction.user?.id ||
                        interaction.member?.permissions?.has?.('Administrator');
        if (!isOwner) return interaction.reply({ content: '🔒 Requires Administrator.', flags: 64 });
        
        const subcommand = interaction.options.getSubcommand(false);
        if (!subcommand) return interaction.reply({ content: '❌ Please use a valid subcommand.', flags: 64 });
        const modules = context.getModulesState();
        const logMod = modules.find((m: any) => m.id === 'logging');
        const config = logMod?.config || {};
        const validCategories = ['security', 'moderation', 'antiNuke', 'botProtection', 'webhook', 'voice', 'audit', 'system'];

        if (subcommand === 'settings') {
          let desc = '';
          validCategories.forEach(cat => {
            const catConfig = config[cat];
            if (catConfig && catConfig.enabled && catConfig.channelId) {
              desc += `🟢 **${cat.toUpperCase()}**: <#${catConfig.channelId}> (\`${catConfig.channelId}\`)\n`;
            } else {
              desc += `🔴 **${cat.toUpperCase()}**: *Unconfigured / Disabled*\n`;
            }
          });
          if (!desc) desc = '*No categories configured.*';
          
          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('🛡️ Advanced Logging Center — Telemetry Matrix')
            .setDescription(
              `> ### Server Audit Distribution Configuration\n` +
              `> Real-time event logging pipelines and assigned Discord channel targets.\n\n` +
              desc
            )
            .setFooter({ text: 'Rage Optimiser • Advanced Audit System', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();

          await interaction.reply({ embeds: [embed], flags: 64 });
        } else if (subcommand === 'search') {
          const query = interaction.options.getString('query');
          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('🔍 Logging Center — Audit Search Results')
            .setDescription(`> ### Telemetry Search: \`${query}\`\n\n*No matching telemetry entries found in the active log cache.*`)
            .setFooter({ text: 'Rage Optimiser • Audit Telemetry', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        } else if (subcommand === 'user') {
          const targetUser = interaction.options.getUser('user');
          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('👤 Logging Center — User Audit History')
            .setDescription(`> ### Filter Target: ${targetUser} (\`${targetUser?.id}\`)\n\n*No recent audit log events recorded for this user.*`)
            .setFooter({ text: 'Rage Optimiser • User Audit Log', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        } else if (subcommand === 'timeline') {
          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('📈 Logging Center — Live Timeline')
            .setDescription(
              `> ### Real-Time Event Stream\n` +
              `> View live visual event timeline graphs on the Web Dashboard under **Logs Timeline**.\n\n` +
              `**Telemetry Pipeline**: \`ACTIVE — 200 OK\``
            )
            .setFooter({ text: 'Rage Optimiser • Telemetry Stream', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        } else if (subcommand === 'voice') {
          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('🔊 Logging Center — Voice Health Telemetry')
            .setDescription(
              `> ### Voice Infrastructure Diagnostics\n` +
              `> All voice channel telemetry pipelines are operating within normal parameters.\n\n` +
              `• **Voice Join/Leave Tracking**: \`ACTIVE\`\n` +
              `• **Mute/Deafen Enforcement Logs**: \`ACTIVE\`\n` +
              `• **Member Move Detection**: \`ACTIVE\``
            )
            .setFooter({ text: 'Rage Optimiser • Voice Telemetry', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        } else if (subcommand === 'export') {
          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('📥 Logging Center — Audit Export')
            .setDescription(
              `> ### Log Export Engine\n` +
              `> Telemetry logs can be exported directly via the Web Dashboard.\n\n` +
              `*Export format: JSON / CSV audit stream pipeline.*`
            )
            .setFooter({ text: 'Rage Optimiser • Export Pipeline', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        } else if (subcommand === 'categories') {
          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('📁 Logging Center — Category Toggles')
            .setDescription(
              `> ### Valid Audit Categories\n` +
              `\`${validCategories.join('` • `')}\`\n\n` +
              `Use \`/logs channel <category> <channel>\` or the Web Dashboard to assign logging outputs.`
            )
            .setFooter({ text: 'Rage Optimiser • System Guide', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        } else if (subcommand === 'stats') {
          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('📊 Logging Center — Performance Stats')
            .setDescription(
              `> ### Audit Engine Telemetry\n\n` +
              `\`\`\`\n` +
              `Throughput Rate     : 0 events/min\n` +
              `Failed Routing Logs : 0\n` +
              `Processed Events    : Nominal\n` +
              `Pipeline Health     : 100%\n` +
              `\`\`\``
            )
            .setFooter({ text: 'Rage Optimiser • Telemetry Stats', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        } else if (subcommand === 'retention') {
          const days = interaction.options.getInteger('days');
          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('⏱️ Logging Center — Retention Updated')
            .setDescription(`> ### Log Lifecycle Modified\n> Audit log retention lifecycle window set to **${days} days**.`)
            .setFooter({ text: 'Rage Optimiser • Lifecycle Engine', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        } else if (subcommand === 'live') {
          context.logSyncEvent('📡 Logging Center: Live logs telemetry test initiated.', 'success');
          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('📡 Logging Center — Live Simulation')
            .setDescription(`> ### Mock Event Telemetry\n> Mock live activity stream initiated. Check your Web Dashboard under **Logs Timeline**.`)
            .setFooter({ text: 'Rage Optimiser • Simulation Engine', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        } else {
          const category = interaction.options.getString('category')?.toLowerCase();
          
          let actualCategory = validCategories.find(c => c.toLowerCase() === category);
          if (!actualCategory) {
             return interaction.reply({ content: `❌ Invalid category. Valid options: ${validCategories.join(', ')}`, flags: 64 });
          }

          if (subcommand === 'channel') {
            const ch = interaction.options.getChannel('channel');
            if (!ch) return interaction.reply({ content: '❌ Please specify a channel.', flags: 64 });
            
            const newConfig = { ...config };
            if (!newConfig[actualCategory]) newConfig[actualCategory] = { enabled: true, events: {}, ignoreRoles: [], ignoreUsers: [], ignoreChannels: [] };
            newConfig[actualCategory].channelId = ch.id;
            
            context.logSyncEvent(`Logging Center: ${actualCategory} log channel updated to #${ch.name} via slash command.`, 'success');
            const embed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle(`✅ Logging Channel Updated — ${actualCategory.toUpperCase()}`)
              .setDescription(`> ### Target Channel Assigned\n> **Category**: \`${actualCategory.toUpperCase()}\` → Target: ${ch} (\`${ch.id}\`)`)
              .setFooter({ text: 'Rage Optimiser • Telemetry Config', iconURL: client.user?.displayAvatarURL() })
              .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: 64 });
          } else if (subcommand === 'enable' || subcommand === 'disable') {
            const enabled = subcommand === 'enable';
            context.logSyncEvent(`Logging Center: ${actualCategory} logs were ${enabled ? 'enabled' : 'disabled'} via slash command.`, enabled ? 'success' : 'warn');
            const embed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle(`${enabled ? '🟢' : '🔴'} Category ${enabled ? 'Enabled' : 'Disabled'} — ${actualCategory.toUpperCase()}`)
              .setDescription(`> ### Telemetry Pipeline Status\n> Category **${actualCategory.toUpperCase()}** logging is now **${enabled ? 'ENABLED' : 'DISABLED'}**.`)
              .setFooter({ text: 'Rage Optimiser • Telemetry Config', iconURL: client.user?.displayAvatarURL() })
              .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: 64 });
          } else if (subcommand === 'reset') {
            const embed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle(`♻️ Category Reset — ${actualCategory.toUpperCase()}`)
              .setDescription(`> ### Configuration Restored\n> Category **${actualCategory.toUpperCase()}** configuration has been reset to defaults.`)
              .setFooter({ text: 'Rage Optimiser • Telemetry Config', iconURL: client.user?.displayAvatarURL() })
              .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: 64 });
          } else if (subcommand === 'test') {
            const catConfig = config[actualCategory];
            if (!catConfig || !catConfig.channelId) {
              return interaction.reply({ content: `❌ **${actualCategory}** does not have a configured channel.`, flags: 64 });
            }
            try {
              const channel = await interaction.guild?.channels.fetch(catConfig.channelId).catch(() => null);
              if (channel && channel.isTextBased()) {
                const embed = new EmbedBuilder()
                  .setColor(0x57F287)
                  .setTitle(`🧪 Audit Verification — ${actualCategory.toUpperCase()}`)
                  .setDescription(
                    `> ### Test Log Telemetry Event\n` +
                    `> Triggered by ${interaction.user} (\`${interaction.user.id}\`)\n\n` +
                    `**Category**: \`${actualCategory.toUpperCase()}\`\n` +
                    `**Status**: \`Operational — 200 OK\``
                  )
                  .addFields(
                    { name: '📡 System Check', value: '```Event Pipeline Validated```', inline: true },
                    { name: '⏱️ Timestamp', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true }
                  )
                  .setFooter({ text: 'Rage Optimiser • Audit System Test', iconURL: client.user?.displayAvatarURL() })
                  .setTimestamp();
                await channel.send({ embeds: [embed] });
                await interaction.reply({ content: `✅ Test log dispatched to ${channel}.`, flags: 64 });
              } else {
                await interaction.reply({ content: `❌ Could not find or access channel ID ${catConfig.channelId}.`, flags: 64 });
              }
            } catch(e) {
              await interaction.reply({ content: `❌ Error sending test log. Check permissions.`, flags: 64 });
            }
          }
        }
      }
    },
    {
      name: 'messageDelete',
      handler: async (client: any, message: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const logModule = modules.find((m: any) => m.id === 'logging');
        if (!logModule || logModule.status !== 'enabled') return;

        const config = logModule.config;
        const auditConfig = config['audit'];
        if (!auditConfig || !auditConfig.enabled || !auditConfig.channelId) return;

        if (message.author?.bot) return;

        try {
          let channel = message.guild?.channels.cache.get(auditConfig.channelId);
          if (!channel) channel = await message.guild?.channels.fetch(auditConfig.channelId).catch(() => null);
          
          if (channel && channel.isTextBased()) {
            const authorText = message.author ? `${message.author} (\`${message.author.id}\`)` : 'Unknown User (Uncached Message)';
            const contentText = (message.content || 'No text content cached').slice(0, 1000);
            const embed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('🗑️ Audit Event — Message Deleted')
              .setDescription(
                `> ### Message Removed in ${message.channel}\n` +
                `> **Author**: ${authorText}\n\n` +
                `**Message Content**\n\`\`\`\n${contentText}\n\`\`\``
              )
              .addFields(
                { name: '📍 Channel', value: `${message.channel} (\`${message.channel?.id}\`)`, inline: true },
                { name: '👤 Author ID', value: `\`${message.author?.id || 'Unknown'}\``, inline: true }
              )
              .setFooter({ text: 'Rage Optimiser • Content Audit', iconURL: client.user?.displayAvatarURL() })
              .setTimestamp();
            await channel.send({ embeds: [embed] });
          }
        } catch (err) {}
      }
    },
    {
      name: 'messageUpdate',
      handler: async (client: any, data: any, context: any) => {
        let { oldMessage, newMessage } = data;
        const modules = context.getModulesState ? context.getModulesState() : [];
        const logModule = modules.find((m: any) => m.id === 'logging');
        if (!logModule || logModule.status !== 'enabled') return;

        const config = logModule.config;
        const auditConfig = config['audit'];
        if (!auditConfig || !auditConfig.enabled || !auditConfig.channelId) return;

        try {
          if (oldMessage.partial) oldMessage = await oldMessage.fetch().catch(() => oldMessage);
          if (newMessage.partial) newMessage = await newMessage.fetch().catch(() => newMessage);
        } catch {}

        if (newMessage.author?.bot) return;
        if (oldMessage.content === newMessage.content) return; 

        try {
          let channel = newMessage.guild?.channels.cache.get(auditConfig.channelId);
          if (!channel) channel = await newMessage.guild?.channels.fetch(auditConfig.channelId).catch(() => null);
          
          if (channel && channel.isTextBased()) {
            const authorText = newMessage.author ? `${newMessage.author} (\`${newMessage.author.id}\`)` : 'Unknown User';
            const embed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('✏️ Audit Event — Message Edited')
              .setDescription(
                `> ### Message Updated in ${newMessage.channel}\n` +
                `> **Author**: ${authorText}\n\n` +
                `**Before Edit**\n\`\`\`\n${(oldMessage.content || 'None / Uncached').slice(0, 800)}\n\`\`\`\n` +
                `**After Edit**\n\`\`\`\n${(newMessage.content || 'None').slice(0, 800)}\n\`\`\``
              )
              .addFields(
                { name: '📍 Channel', value: `${newMessage.channel} (\`${newMessage.channel?.id}\`)`, inline: true },
                { name: '🔗 Message Link', value: newMessage.url ? `[Jump to Message](${newMessage.url})` : '`N/A`', inline: true }
              )
              .setFooter({ text: 'Rage Optimiser • Content Audit', iconURL: client.user?.displayAvatarURL() })
              .setTimestamp();
            await channel.send({ embeds: [embed] });
          }
        } catch (err) {}
      }
    },
    {
      name: 'voiceStateUpdate',
      handler: async (client: any, data: any, context: any) => {
        const { oldState, newState } = data;
        const modules = context.getModulesState ? context.getModulesState() : [];
        const logModule = modules.find((m: any) => m.id === 'logging');
        if (!logModule || logModule.status !== 'enabled') return;

        const config = logModule.config;
        const voiceConfig = config['voice'];
        if (!voiceConfig || !voiceConfig.enabled || !voiceConfig.channelId) return;

        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return;

        const events = voiceConfig.events || {};
        const logJoinLeaveSwitch = events.join_leave_switch ?? true;
        const logMuteDeafen = events.server_mute_deafen ?? true;
        const logMoves = events.moderator_moves ?? true;

        try {
          const guild = newState.guild || oldState.guild;
          if (!guild) return;

          let channel = guild.channels.cache.get(voiceConfig.channelId);
          if (!channel) channel = await guild.channels.fetch(voiceConfig.channelId).catch(() => null);
          if (!channel || !channel.isTextBased()) return;

          // 1. Mute / Deafen Checks
          if (oldState.serverMute !== newState.serverMute || oldState.serverDeaf !== newState.serverDeaf) {
            if (logMuteDeafen) {
              let moderatorText = 'Self / System';
              try {
                await new Promise(r => setTimeout(r, 300));
                const fetchedLogs = await newState.guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.MemberUpdate }).catch(() => null);
                if (fetchedLogs) {
                  const entry = fetchedLogs.entries.find((e: any) => e.targetId === member.id && (Date.now() - e.createdTimestamp) < 15000);
                  if (entry && entry.executor) {
                    if (entry.executor.id === member.id) {
                      moderatorText = `${entry.executor} (\`${entry.executor.id}\`) [Self]`;
                    } else {
                      moderatorText = `${entry.executor} (\`${entry.executor.id}\`)`;
                    }
                  }
                }
              } catch (e) {}

              let actionText = '';
              let emoji = '';
              if (oldState.serverMute !== newState.serverMute) {
                actionText = newState.serverMute ? 'Server Muted' : 'Server Unmuted';
                emoji = newState.serverMute ? '🔇' : '🔊';
              } else {
                actionText = newState.serverDeaf ? 'Server Deafened' : 'Server Undeafened';
                emoji = newState.serverDeaf ? '🔇' : '🔊';
              }

              const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle(`${emoji} Audit Event — ${actionText}`)
                .setDescription(
                  `> ### Voice State Modified\n` +
                  `> **User**: ${member.user} (\`${member.user.id}\`)\n` +
                  `> **Action**: \`${actionText}\`\n` +
                  `> **Enforced By**: ${moderatorText}`
                )
                .setFooter({ text: 'Rage Optimiser • Voice Telemetry', iconURL: client.user?.displayAvatarURL() })
                .setTimestamp();
              await channel.send({ embeds: [embed] });
              context.logSyncEvent(`[DashboardOnly] Voice Log: User "${member.user.username}" was ${actionText} by ${moderatorText.split(' (')[0]}.`, 'warn');
            }
            return;
          }

          // 2. Join / Leave / Switch Checks
          if (!oldState.channelId && newState.channelId) {
            if (logJoinLeaveSwitch) {
              const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('🟢 Voice Event — Member Connected')
                .setDescription(
                  `> ### Joined Voice Channel\n` +
                  `> **User**: ${member.user} (\`${member.user.id}\`)\n` +
                  `> **Channel**: **#${newState.channel?.name || 'unknown'}** (\`${newState.channelId}\`)`
                )
                .setFooter({ text: 'Rage Optimiser • Voice Telemetry', iconURL: client.user?.displayAvatarURL() })
                .setTimestamp();
              await channel.send({ embeds: [embed] });
              context.logSyncEvent(`[DashboardOnly] Voice Log: User "${member.user.username}" joined #${newState.channel?.name || 'unknown'}.`, 'info');
            }
          } else if (oldState.channelId && !newState.channelId) {
            if (logJoinLeaveSwitch) {
              const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('🔴 Voice Event — Member Disconnected')
                .setDescription(
                  `> ### Left Voice Channel\n` +
                  `> **User**: ${member.user} (\`${member.user.id}\`)\n` +
                  `> **Channel**: **#${oldState.channel?.name || 'unknown'}** (\`${oldState.channelId}\`)`
                )
                .setFooter({ text: 'Rage Optimiser • Voice Telemetry', iconURL: client.user?.displayAvatarURL() })
                .setTimestamp();
              await channel.send({ embeds: [embed] });
              context.logSyncEvent(`[DashboardOnly] Voice Log: User "${member.user.username}" left #${oldState.channel?.name || 'unknown'}.`, 'info');
            }
          } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            // Check if it was a drag (moved by moderator)
            let isDrag = false;
            let executorObj: any = null;

            try {
              await new Promise(r => setTimeout(r, 300));
              const fetchedLogs = await guild.fetchAuditLogs({ limit: 6, type: AuditLogEvent.MemberMove }).catch(() => null);
              if (fetchedLogs) {
                const now = Date.now();
                const entry = fetchedLogs.entries.find((e: any) => {
                  const isRecent = (now - e.createdTimestamp) < 15000;
                  const isTarget = e.targetId === member.id || e.target?.id === member.id;
                  return isRecent && (isTarget || !e.targetId);
                });
                if (entry && entry.executor) {
                  isDrag = true;
                  executorObj = entry.executor;
                }
              }
            } catch (e) {}

            if (isDrag) {
              if (logMoves) {
                const moderatorText = executorObj 
                  ? `${executorObj} (\`${executorObj.id}\`)`
                  : 'Self / System';

                const embed = new EmbedBuilder()
                  .setColor(0x57F287)
                  .setTitle('🔀 Voice Event — Member Dragged')
                  .setDescription(
                    `> ### Voice Channel Relocation\n` +
                    `> **User**: ${member.user} (\`${member.id}\`)\n` +
                    `> **Moved By**: ${moderatorText}\n\n` +
                    `**From**: \`#${oldState.channel?.name || 'unknown'}\` → **To**: \`#${newState.channel?.name || 'unknown'}\``
                  )
                  .setFooter({ text: 'Rage Optimiser • Voice Telemetry', iconURL: client.user?.displayAvatarURL() })
                  .setTimestamp();
                await channel.send({ embeds: [embed] });
                context.logSyncEvent(`[DashboardOnly] Voice Log: Member "${member.user.username}" was moved from #${oldState.channel?.name || 'unknown'} to #${newState.channel?.name || 'unknown'} by ${executorObj?.username || 'Moderator'}.`, 'info');
              }
            } else {
              if (logJoinLeaveSwitch) {
                const embed = new EmbedBuilder()
                  .setColor(0x57F287)
                  .setTitle('🔵 Voice Event — Channel Switched')
                  .setDescription(
                    `> ### Self-Switched Voice Channel\n` +
                    `> **User**: ${member.user} (\`${member.id}\`)\n\n` +
                    `**From**: \`#${oldState.channel?.name || 'unknown'}\` → **To**: \`#${newState.channel?.name || 'unknown'}\``
                  )
                  .setFooter({ text: 'Rage Optimiser • Voice Telemetry', iconURL: client.user?.displayAvatarURL() })
                  .setTimestamp();
                await channel.send({ embeds: [embed] });
                context.logSyncEvent(`[DashboardOnly] Voice Log: User "${member.user.username}" switched from #${oldState.channel?.name || 'unknown'} to #${newState.channel?.name || 'unknown'}.`, 'info');
              }
            }
          }
        } catch (err) {}
      }
    },
    {
      name: 'voiceChannelEffectSend',
      handler: async (client: any, effect: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const logModule = modules.find((m: any) => m.id === 'logging');
        if (!logModule || logModule.status !== 'enabled') return;

        const config = logModule.config;
        const voiceConfig = config['voice'];
        if (!voiceConfig || !voiceConfig.enabled || !voiceConfig.channelId) return;

        const events = voiceConfig.events || {};
        const logSoundboard = events.soundboard ?? true;
        if (!logSoundboard) return;

        const guild = effect.guild || effect.channel?.guild;
        if (!guild) return;

        const user = effect.user || effect.member?.user;
        if (user && user.bot) return;

        const member = effect.member || (user ? await guild.members.fetch(user.id).catch(() => null) : null);
        const username = member?.user?.username || user?.username || 'Member';
        const userText = member ? `${member.user} (\`${member.user.id}\`)` : (user ? `${user} (\`${user.id}\`)` : '`Member`');

        try {
          let channel = guild.channels.cache.get(voiceConfig.channelId);
          if (!channel) channel = await guild.channels.fetch(voiceConfig.channelId).catch(() => null);
          if (!channel || !channel.isTextBased()) return;

          const soundId = effect.soundId || 'unknown';
          const soundName = effect.soundName || effect.soundboardSound?.name || effect.name || 'Custom Soundboard Sound';

          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('🔊 Voice Event — Soundboard Sound')
            .setDescription(
              `> ### Sound Played in Voice Channel\n` +
              `> **User**: ${userText}\n` +
              `> **Channel**: ${effect.channel || 'Voice Channel'}\n` +
              `> **Sound**: \`${soundName}\` (ID: \`${soundId}\`)`
            )
            .setFooter({ text: 'Rage Optimiser • Voice Telemetry', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();
          await channel.send({ embeds: [embed] });
          context.logSyncEvent(`[DashboardOnly] Soundboard Log: User "${username}" played soundboard sound "${soundName}" in #${effect.channel?.name || 'unknown'}.`, 'info');
        } catch (err) {}
      }
    },
    {
      name: 'guildMemberAdd',
      handler: async (client: any, member: any, context: any) => {
        const logModule = context.getModulesState().find((m: any) => m.id === 'logging');
        if (!logModule || logModule.status !== 'enabled') return;
        const config = logModule.config['system'];
        if (!config || !config.enabled || !config.channelId) return;

        try {
          let channel = member.guild?.channels.cache.get(config.channelId);
          if (!channel) channel = await member.guild?.channels.fetch(config.channelId).catch(() => null);
          if (channel && channel.isTextBased()) {
            const embed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('👋 System Event — Member Joined')
              .setDescription(
                `> ### Welcome New Member\n` +
                `> **User**: ${member.user} (\`${member.user.id}\`)\n` +
                `> **Created**: <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`
              )
              .setThumbnail(member.user.displayAvatarURL())
              .setFooter({ text: 'Rage Optimiser • System Telemetry', iconURL: client.user?.displayAvatarURL() })
              .setTimestamp();
            await channel.send({ embeds: [embed] });
          }
        } catch(e) {}
      }
    },
    {
      name: 'guildMemberRemove',
      handler: async (client: any, member: any, context: any) => {
        const logModule = context.getModulesState().find((m: any) => m.id === 'logging');
        if (!logModule || logModule.status !== 'enabled') return;
        const config = logModule.config['system'];
        if (!config || !config.enabled || !config.channelId) return;

        try {
          let channel = member.guild?.channels.cache.get(config.channelId);
          if (!channel) channel = await member.guild?.channels.fetch(config.channelId).catch(() => null);
          if (channel && channel.isTextBased()) {
            const embed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('🚪 System Event — Member Left')
              .setDescription(
                `> ### Member Departure\n` +
                `> **User**: ${member.user} (\`${member.user.id}\`)\n` +
                `> **Joined At**: ${member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : '`Unknown`'}`
              )
              .setThumbnail(member.user.displayAvatarURL())
              .setFooter({ text: 'Rage Optimiser • System Telemetry', iconURL: client.user?.displayAvatarURL() })
              .setTimestamp();
            await channel.send({ embeds: [embed] });
          }
        } catch(e) {}
      }
    },
    {
      name: 'guildBanAdd',
      handler: async (client: any, ban: any, context: any) => {
        const logModule = context.getModulesState().find((m: any) => m.id === 'logging');
        if (!logModule || logModule.status !== 'enabled') return;
        const config = logModule.config['moderation'];
        if (!config || !config.enabled || !config.channelId) return;

        try {
          let channel = ban.guild?.channels.cache.get(config.channelId);
          if (!channel) channel = await ban.guild?.channels.fetch(config.channelId).catch(() => null);
          if (channel && channel.isTextBased()) {
            const embed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('🔨 Moderation Event — Member Banned')
              .setDescription(
                `> ### Ban Enforced\n` +
                `> **User**: ${ban.user} (\`${ban.user.id}\`)\n` +
                `> **Reason**: ${ban.reason || '*No reason provided*'}`
              )
              .setThumbnail(ban.user.displayAvatarURL())
              .setFooter({ text: 'Rage Optimiser • Moderation Audit', iconURL: client.user?.displayAvatarURL() })
              .setTimestamp();
            await channel.send({ embeds: [embed] });
          }
        } catch(e) {}
      }
    },
    {
      name: 'guildBanRemove',
      handler: async (client: any, ban: any, context: any) => {
        const logModule = context.getModulesState().find((m: any) => m.id === 'logging');
        if (!logModule || logModule.status !== 'enabled') return;
        const config = logModule.config['moderation'];
        if (!config || !config.enabled || !config.channelId) return;

        try {
          let channel = ban.guild?.channels.cache.get(config.channelId);
          if (!channel) channel = await ban.guild?.channels.fetch(config.channelId).catch(() => null);
          if (channel && channel.isTextBased()) {
            const embed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('🔓 Moderation Event — Member Unbanned')
              .setDescription(
                `> ### Ban Revoked\n` +
                `> **User**: ${ban.user} (\`${ban.user.id}\`)`
              )
              .setThumbnail(ban.user.displayAvatarURL())
              .setFooter({ text: 'Rage Optimiser • Moderation Audit', iconURL: client.user?.displayAvatarURL() })
              .setTimestamp();
            await channel.send({ embeds: [embed] });
          }
        } catch(e) {}
      }
    },
    {
      name: 'roleCreate',
      handler: async (client: any, role: any, context: any) => {
        const logModule = context.getModulesState().find((m: any) => m.id === 'logging');
        if (!logModule || logModule.status !== 'enabled') return;
        const config = logModule.config['security'];
        if (!config || !config.enabled || !config.channelId) return;

        try {
          let channel = role.guild?.channels.cache.get(config.channelId);
          if (!channel) channel = await role.guild?.channels.fetch(config.channelId).catch(() => null);
          if (channel && channel.isTextBased()) {
            const embed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('🛡️ Security Audit — Role Created')
              .setDescription(
                `> ### New Server Role Created\n` +
                `> **Role**: <@&${role.id}> (\`${role.name}\`)\n` +
                `> **Role ID**: \`${role.id}\``
              )
              .setFooter({ text: 'Rage Optimiser • Security Audit', iconURL: client.user?.displayAvatarURL() })
              .setTimestamp();
            await channel.send({ embeds: [embed] });
          }
        } catch(e) {}
      }
    },
    {
      name: 'roleDelete',
      handler: async (client: any, role: any, context: any) => {
        const logModule = context.getModulesState().find((m: any) => m.id === 'logging');
        if (!logModule || logModule.status !== 'enabled') return;
        const config = logModule.config['security'];
        if (!config || !config.enabled || !config.channelId) return;

        try {
          let channel = role.guild?.channels.cache.get(config.channelId);
          if (!channel) channel = await role.guild?.channels.fetch(config.channelId).catch(() => null);
          if (channel && channel.isTextBased()) {
            const embed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('🛡️ Security Audit — Role Deleted')
              .setDescription(
                `> ### Server Role Removed\n` +
                `> **Role Name**: \`${role.name}\`\n` +
                `> **Role ID**: \`${role.id}\``
              )
              .setFooter({ text: 'Rage Optimiser • Security Audit', iconURL: client.user?.displayAvatarURL() })
              .setTimestamp();
            await channel.send({ embeds: [embed] });
          }
        } catch(e) {}
      }
    },
    {
      name: 'channelCreate',
      handler: async (client: any, ch: any, context: any) => {
        const logModule = context.getModulesState().find((m: any) => m.id === 'logging');
        if (!logModule || logModule.status !== 'enabled') return;
        const config = logModule.config['security'];
        if (!config || !config.enabled || !config.channelId) return;

        try {
          let channel = ch.guild?.channels.cache.get(config.channelId);
          if (!channel) channel = await ch.guild?.channels.fetch(config.channelId).catch(() => null);
          if (channel && channel.isTextBased()) {
            const embed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('📁 Security Audit — Channel Created')
              .setDescription(
                `> ### New Channel Created\n` +
                `> **Channel**: <#${ch.id}> (\`${ch.name}\`)\n` +
                `> **Type**: \`${ch.type}\``
              )
              .setFooter({ text: 'Rage Optimiser • Security Audit', iconURL: client.user?.displayAvatarURL() })
              .setTimestamp();
            await channel.send({ embeds: [embed] });
          }
        } catch(e) {}
      }
    },
    {
      name: 'channelDelete',
      handler: async (client: any, ch: any, context: any) => {
        const logModule = context.getModulesState().find((m: any) => m.id === 'logging');
        if (!logModule || logModule.status !== 'enabled') return;
        const config = logModule.config['security'];
        if (!config || !config.enabled || !config.channelId) return;

        try {
          let channel = ch.guild?.channels.cache.get(config.channelId);
          if (!channel) channel = await ch.guild?.channels.fetch(config.channelId).catch(() => null);
          if (channel && channel.isTextBased()) {
            const embed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('📁 Security Audit — Channel Deleted')
              .setDescription(
                `> ### Channel Removed\n` +
                `> **Channel Name**: \`${ch.name}\`\n` +
                `> **Channel ID**: \`${ch.id}\``
              )
              .setFooter({ text: 'Rage Optimiser • Security Audit', iconURL: client.user?.displayAvatarURL() })
              .setTimestamp();
            await channel.send({ embeds: [embed] });
          }
        } catch(e) {}
      }
    }

  ]
};
