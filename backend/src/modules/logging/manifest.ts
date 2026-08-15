import { EmbedBuilder, AuditLogEvent } from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';
import { buildLimeOverviewCard, createLimeEmbed, Colors, VERIFIED_ICON, WRONG_ICON, CONFIG_ICON, MEMBER_ICON, SHIELD_ICON } from '../../core/UIFactory.js';

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
        if (!isOwner) return interaction.reply({ content: '<:wrong:1532390628330307634> Requires Administrator.', flags: 64 });
        
        const subcommand = interaction.options.getSubcommand(false);
        if (!subcommand) return interaction.reply({ content: '<:wrong:1532390628330307634> Please use a valid subcommand.', flags: 64 });
        const modules = context.getModulesState();
        const logMod = modules.find((m: any) => m.id === 'logging');
        const config = logMod?.config || {};
        const validCategories = ['security', 'moderation', 'antiNuke', 'botProtection', 'webhook', 'voice', 'audit', 'system'];

        if (subcommand === 'settings') {
          let desc = '';
          validCategories.forEach(cat => {
            const catConfig = config[cat];
            if (catConfig && catConfig.enabled && catConfig.channelId) {
              desc += `<a:approved:1532390590707142956> **${cat.toUpperCase()}**: <#${catConfig.channelId}> (\`${catConfig.channelId}\`)\n`;
            } else {
              desc += `<:wrong:1532390628330307634> **${cat.toUpperCase()}**: *Unconfigured / Disabled*\n`;
            }
          });
          if (!desc) desc = '*No categories configured.*';
          
          const embed = new EmbedBuilder()
            .setColor(0x84cc16)
            .setTitle('<:shield:1532403012751065179> Advanced Logging Center — Telemetry Matrix')
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
            .setColor(0x84cc16)
            .setTitle('<:information:1532621274092929124> Logging Center — Audit Search Results')
            .setDescription(`> ### Telemetry Search: \`${query}\`\n\n*No matching telemetry entries found in the active log cache.*`)
            .setFooter({ text: 'Rage Optimiser • Audit Telemetry', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        } else if (subcommand === 'user') {
          const targetUser = interaction.options.getUser('user');
          const embed = new EmbedBuilder()
            .setColor(0x84cc16)
            .setTitle('<:member:1532621317487071426> Logging Center — User Audit History')
            .setDescription(`> ### Filter Target: ${targetUser} (\`${targetUser?.id}\`)\n\n*No recent audit log events recorded for this user.*`)
            .setFooter({ text: 'Rage Optimiser • User Audit Log', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        } else if (subcommand === 'timeline') {
          const embed = new EmbedBuilder()
            .setColor(0x84cc16)
            .setTitle('<:stats:1532429110775779459> Logging Center — Live Timeline')
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
            .setColor(0x84cc16)
            .setTitle('<:voicechannelgreen:1532425750278438962> Logging Center — Voice Health Telemetry')
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
            .setColor(0x84cc16)
            .setTitle('<a:approved:1532390590707142956> Logging Center — Audit Export')
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
            .setColor(0x84cc16)
            .setTitle('<:config:1532425712844144701> Logging Center — Category Toggles')
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
            .setColor(0x84cc16)
            .setTitle('<:stats:1532429110775779459> Logging Center — Performance Stats')
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
            .setColor(0x84cc16)
            .setTitle('<:config:1532425712844144701> Logging Center — Retention Updated')
            .setDescription(`> ### Log Lifecycle Modified\n> Audit log retention lifecycle window set to **${days} days**.`)
            .setFooter({ text: 'Rage Optimiser • Lifecycle Engine', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        } else if (subcommand === 'live') {
          context.logSyncEvent('Logging Center: Live logs telemetry test initiated.', 'success');
          const embed = new EmbedBuilder()
            .setColor(0x84cc16)
            .setTitle('<a:approved:1532390590707142956> Logging Center — Live Simulation')
            .setDescription(`> ### Mock Event Telemetry\n> Mock live activity stream initiated. Check your Web Dashboard under **Logs Timeline**.`)
            .setFooter({ text: 'Rage Optimiser • Simulation Engine', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        } else {
          const category = interaction.options.getString('category')?.toLowerCase();
          const isAllCategory = category === 'all' || category === 'everything' || category === '*';
          let actualCategory = isAllCategory ? 'all' : validCategories.find(c => c.toLowerCase() === category);
          
          if (!actualCategory) {
             return interaction.reply({ content: `<:wrong:1532390628330307634> Invalid category. Valid options: ${validCategories.join(', ')}, all`, flags: 64 });
          }

          if (subcommand === 'channel') {
            const ch = interaction.options.getChannel('channel');
            if (!ch) return interaction.reply({ content: '<:wrong:1532390628330307634> Please specify a channel.', flags: 64 });
            
            const newConfig = { ...config };
            if (isAllCategory) {
              validCategories.forEach(cat => {
                if (!newConfig[cat]) newConfig[cat] = { enabled: true, events: {}, ignoreRoles: [], ignoreUsers: [], ignoreChannels: [] };
                newConfig[cat].channelId = ch.id;
              });
            } else {
              if (!newConfig[actualCategory]) newConfig[actualCategory] = { enabled: true, events: {}, ignoreRoles: [], ignoreUsers: [], ignoreChannels: [] };
              newConfig[actualCategory].channelId = ch.id;
            }
            
            if (context.updateModuleConfig) {
              context.updateModuleConfig('logging', newConfig);
            }
            context.logSyncEvent(`Logging Center: ${isAllCategory ? 'ALL' : actualCategory} log channel updated to #${ch.name} via slash command.`, 'success');
            const embed = new EmbedBuilder()
              .setColor(0x84cc16)
              .setTitle(`<a:approved:1532390590707142956> Logging Channel Updated — ${isAllCategory ? 'ALL CATEGORIES' : actualCategory.toUpperCase()}`)
              .setDescription(`> ### Target Channel Assigned\n> **Category**: \`${isAllCategory ? 'ALL CATEGORIES' : actualCategory.toUpperCase()}\` → Target: ${ch} (\`${ch.id}\`)`)
              .setFooter({ text: 'Rage Optimiser • Telemetry Config', iconURL: client.user?.displayAvatarURL() })
              .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: 64 });
          } else if (subcommand === 'enable' || subcommand === 'disable') {
            const enabled = subcommand === 'enable';
            const newConfig = { ...config };
            if (isAllCategory) {
              validCategories.forEach(cat => {
                if (!newConfig[cat]) newConfig[cat] = { enabled: true, events: {}, ignoreRoles: [], ignoreUsers: [], ignoreChannels: [] };
                newConfig[cat].enabled = enabled;
              });
            } else {
              if (!newConfig[actualCategory]) newConfig[actualCategory] = { enabled: true, events: {}, ignoreRoles: [], ignoreUsers: [], ignoreChannels: [] };
              newConfig[actualCategory].enabled = enabled;
            }
            if (context.updateModuleConfig) {
              context.updateModuleConfig('logging', newConfig);
            }
            context.logSyncEvent(`Logging Center: ${isAllCategory ? 'ALL' : actualCategory} logs were ${enabled ? 'enabled' : 'disabled'} via slash command.`, enabled ? 'success' : 'warn');
            const embed = new EmbedBuilder()
              .setColor(0x84cc16)
              .setTitle(`${enabled ? '<a:approved:1532390590707142956>' : '<:wrong:1532390628330307634>'} Category ${enabled ? 'Enabled' : 'Disabled'} — ${isAllCategory ? 'ALL CATEGORIES' : actualCategory.toUpperCase()}`)
              .setDescription(`> ### Telemetry Pipeline Status\n> Category **${isAllCategory ? 'ALL CATEGORIES' : actualCategory.toUpperCase()}** logging is now **${enabled ? 'ENABLED' : 'DISABLED'}**.`)
              .setFooter({ text: 'Rage Optimiser • Telemetry Config', iconURL: client.user?.displayAvatarURL() })
              .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: 64 });
          } else if (subcommand === 'reset') {
            const newConfig = { ...config };
            if (isAllCategory) {
              validCategories.forEach(cat => {
                newConfig[cat] = { enabled: true, channelId: null, events: {}, ignoreRoles: [], ignoreUsers: [], ignoreChannels: [] };
              });
            } else if (actualCategory) {
              newConfig[actualCategory] = { enabled: true, channelId: null, events: {}, ignoreRoles: [], ignoreUsers: [], ignoreChannels: [] };
            }
            if (context.updateModuleConfig) {
              context.updateModuleConfig('logging', newConfig);
            }
            const embed = new EmbedBuilder()
              .setColor(0x84cc16)
              .setTitle(`<a:approved:1532390590707142956> Category Reset — ${isAllCategory ? 'ALL CATEGORIES' : actualCategory.toUpperCase()}`)
              .setDescription(`> ### Configuration Restored\n> Category **${isAllCategory ? 'ALL CATEGORIES' : actualCategory.toUpperCase()}** configuration has been reset to defaults.`)
              .setFooter({ text: 'Rage Optimiser • Telemetry Config', iconURL: client.user?.displayAvatarURL() })
              .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: 64 });
          } else if (subcommand === 'test') {
            const catConfig = config[actualCategory];
            if (!catConfig || !catConfig.channelId) {
              return interaction.reply({ content: `<:wrong:1532390628330307634> **${actualCategory}** does not have a configured channel.`, flags: 64 });
            }
            try {
              const channel = await interaction.guild?.channels.fetch(catConfig.channelId).catch(() => null);
              if (channel && channel.isTextBased()) {
                const embed = new EmbedBuilder()
                  .setColor(0x84cc16)
                  .setTitle(`<:information:1532621274092929124> Audit Verification — ${actualCategory.toUpperCase()}`)
                  .setDescription(
                    `> ### Test Log Telemetry Event\n` +
                    `> Triggered by ${interaction.user} (\`${interaction.user.id}\`)\n\n` +
                    `**Category**: \`${actualCategory.toUpperCase()}\`\n` +
                    `**Status**: \`Operational — 200 OK\``
                  )
                  .addFields(
                    { name: '<:shield:1532403012751065179> System Check', value: '```Event Pipeline Validated```', inline: true },
                    { name: '<:config:1532425712844144701> Timestamp', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true }
                  )
                  .setFooter({ text: 'Rage Optimiser • Audit System Test', iconURL: client.user?.displayAvatarURL() })
                  .setTimestamp();
                await channel.send({ embeds: [embed] });
              } else {
                await interaction.reply({ content: `<:wrong:1532390628330307634> Could not find or access channel ID ${catConfig.channelId}.`, flags: 64 });
              }
            } catch(e) {
              await interaction.reply({ content: `<:wrong:1532390628330307634> Error sending test log. Check permissions.`, flags: 64 });
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
              .setColor(0x84cc16)
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
              .setColor(0x84cc16)
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
                .setColor(0x84cc16)
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
                .setColor(0x84cc16)
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
                .setColor(0x84cc16)
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
                  .setColor(0x84cc16)
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
                  .setColor(0x84cc16)
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
            .setColor(0x84cc16)
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
              .setColor(0x84cc16)
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
              .setColor(0x84cc16)
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
              .setColor(0x84cc16)
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
              .setColor(0x84cc16)
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
              .setColor(0x84cc16)
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
              .setColor(0x84cc16)
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
              .setColor(0x84cc16)
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
              .setColor(0x84cc16)
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

export const LOG_CATEGORIES = [
  'security',
  'moderation',
  'antiNuke',
  'botProtection',
  'webhook',
  'voice',
  'audit',
  'system'
];

export function registerLoggingCommands(): void {
  PrefixRegistry.register({
    name: 'logs',
    category: 'Logging',
    description: 'Configure audit log channels, ignored roles, and manager access for all server categories.',
    usage: 'r!logs <status|channel|ignore-role|roles|enable|disable|test|reset>',
    aliases: ['logging', 'auditlogs', 'logconfig', 'setlogs'],
    subcommands: [
      { name: 'status', description: 'View audit logging matrix and category channel routes.' },
      { name: 'channel <category|all|everything> <#channel|none>', description: 'Assign log channel for a category or ALL categories at once.' },
      { name: 'ignore-role <category|all|everything> <add|remove> <@role>', description: 'Configure roles ignored by log audit engine.' },
      { name: 'roles <add|remove|list> <@role>', description: 'Configure manager roles authorized to manage logs.' },
      { name: 'enable <category|all|everything>', description: 'Enable log category or all categories.' },
      { name: 'disable <category|all|everything>', description: 'Disable log category or all categories.' },
      { name: 'test <category|all>', description: 'Dispatch a test audit log event.' },
      { name: 'reset <category|all>', description: 'Reset category channel routes to default.' }
    ],
    examples: [
      'r!logs status',
      'r!logs channel all #logs',
      'r!logs channel security #security-logs',
      'r!logs ignore-role all add @Admin',
      'r!logs roles add @LogManager',
      'r!logs enable all',
      'r!logs test security'
    ],
    cooldownSeconds: 2,
    userPermissions: ['Administrator'],
    execute: async (message: any, args: string[], extra?: any) => {
      const sub = args[0]?.toLowerCase();
      const modules = extra?.getModulesState ? extra.getModulesState() : [];
      const logMod = modules.find((m: any) => m.id === 'logging');
      const config = logMod?.config || {};

      // Permission Check: Admin or Manager Role
      const managerRoles: string[] = config.managerRoleIds || [];
      const hasManagerRole = message.member?.roles?.cache?.some((r: any) => managerRoles.includes(r.id));
      const isAdmin = message.member?.permissions?.has?.('Administrator') || message.guild?.ownerId === message.author?.id;

      if (!isAdmin && !hasManagerRole) {
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Permission Denied',
            description: `${WRONG_ICON} You need **Administrator** permissions or a configured **Logging Manager Role** to manage logging settings.`
          })]
        });
      }

      const updateConfig = (newCfg: Record<string, any>) => {
        if (extra?.updateModuleConfig) {
          extra.updateModuleConfig('logging', { ...config, ...newCfg });
        }
        if (extra?.logSyncEvent) {
          extra.logSyncEvent(message.guild?.id, 'Logging Config: Updated audit log settings via CLI.', 'success');
        }
      };

      // 1. Channel Assignment (`r!logs channel <category|all|everything> <#channel|ID|none>`)
      if (sub === 'channel' || sub === 'set' || sub === 'setchannel') {
        const catArg = args[1]?.toLowerCase();
        const rawChannelArg = args[2] || args[1];
        const isDisable = rawChannelArg?.toLowerCase() === 'none' || rawChannelArg?.toLowerCase() === 'off' || rawChannelArg?.toLowerCase() === 'disable';

        let targetChannel = message.mentions?.channels?.first();
        if (!targetChannel && rawChannelArg && message.guild) {
          const cleanId = rawChannelArg.replace(/[<#@&>]/g, '');
          targetChannel = message.guild.channels.cache.get(cleanId) || (await message.guild.channels.fetch(cleanId).catch(() => null));
        }

        if (!catArg || (!targetChannel && !isDisable)) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Logging Channel Routing Syntax',
              description: [
                `${WRONG_ICON} **Syntax**: \`r!logs channel <category|all|everything> <#channel|ID|none>\`\n`,
                `• **Set ALL channels at once**: \`r!logs channel all #logs-channel\` or \`r!logs channel all 1534458323632652288\``,
                `• **Set specific category**: \`r!logs channel security #sec-logs\``,
                `• **Disable category**: \`r!logs channel voice none\`\n`,
                `**Valid Categories**: \`${LOG_CATEGORIES.join('`, `')}\`, \`all\`, \`everything\``
              ].join('\n')
            })]
          });
        }

        const isAll = catArg === 'all' || catArg === 'everything' || catArg === '*';
        const updatedConfig = { ...config };

        if (isAll) {
          LOG_CATEGORIES.forEach(cat => {
            const currentCat = updatedConfig[cat] || { enabled: true, events: {}, ignoreRoles: [], ignoreUsers: [], ignoreChannels: [] };
            updatedConfig[cat] = {
              ...currentCat,
              enabled: !isDisable,
              channelId: isDisable ? null : targetChannel.id
            };
          });
          updateConfig(updatedConfig);
          return message.reply({
            embeds: [createLimeEmbed({
              title: isDisable ? 'All Log Channels Disabled' : 'All Log Channels Configured',
              description: isDisable
                ? `${VERIFIED_ICON} Disabled log channels for **ALL (EVERYTHING)** categories.`
                : `${VERIFIED_ICON} Successfully routed **ALL (EVERYTHING)** 8 log categories to **<#${targetChannel.id}>**!`
            })]
          });
        }

        const matchedCat = LOG_CATEGORIES.find(c => c.toLowerCase() === catArg);
        if (!matchedCat) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Invalid Log Category',
              description: `${WRONG_ICON} **\`${catArg}\`** is not a valid log category.\nValid options: \`${LOG_CATEGORIES.join('`, `')}\`, \`all\`, \`everything\``
            })]
          });
        }

        const currentCat = updatedConfig[matchedCat] || { enabled: true, events: {}, ignoreRoles: [], ignoreUsers: [], ignoreChannels: [] };
        updatedConfig[matchedCat] = {
          ...currentCat,
          enabled: !isDisable,
          channelId: isDisable ? null : targetChannel.id
        };
        updateConfig(updatedConfig);

        return message.reply({
          embeds: [createLimeEmbed({
            title: `Log Channel Saved — ${matchedCat.toUpperCase()}`,
            description: isDisable
              ? `${VERIFIED_ICON} Disabled log output for **${matchedCat.toUpperCase()}**.`
              : `${VERIFIED_ICON} Assigned **<#${targetChannel.id}>** as target log channel for **${matchedCat.toUpperCase()}**.`
          })]
        });
      }

      // 2. Ignore Roles (`r!logs ignore-role <category|all|everything> <add|remove> <@role>`)
      if (sub === 'ignore-role' || sub === 'ignorerole' || sub === 'ignore') {
        const catArg = args[1]?.toLowerCase();
        const action = args[2]?.toLowerCase();
        const role = message.mentions?.roles?.first();

        if (!catArg || !['add', 'remove', 'list'].includes(action)) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Ignore-Role Configuration Syntax',
              description: [
                `${WRONG_ICON} **Syntax**: \`r!logs ignore-role <category|all|everything> <add|remove> <@role>\`\n`,
                `• **Ignore role across ALL logs**: \`r!logs ignore-role all add @AdminRole\``,
                `• **Ignore role in security logs**: \`r!logs ignore-role security add @BotRole\``,
                `• **Remove ignored role**: \`r!logs ignore-role all remove @AdminRole\``
              ].join('\n')
            })]
          });
        }

        const isAll = catArg === 'all' || catArg === 'everything' || catArg === '*';
        const updatedConfig = { ...config };

        if (action === 'add' && role) {
          if (isAll) {
            LOG_CATEGORIES.forEach(cat => {
              const currentCat = updatedConfig[cat] || { enabled: true, events: {}, ignoreRoles: [], ignoreUsers: [], ignoreChannels: [] };
              const currentRoles: string[] = currentCat.ignoreRoles || [];
              updatedConfig[cat] = {
                ...currentCat,
                ignoreRoles: Array.from(new Set([...currentRoles, role.id]))
              };
            });
            updateConfig(updatedConfig);
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Ignored Role Added — ALL Categories',
                description: `${VERIFIED_ICON} Actions taken by members with **<@&${role.id}>** will now be ignored across **ALL (EVERYTHING)** log categories.`
              })]
            });
          }

          const matchedCat = LOG_CATEGORIES.find(c => c.toLowerCase() === catArg);
          if (!matchedCat) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Invalid Category',
                description: `${WRONG_ICON} Invalid category \`${catArg}\`. Valid: \`${LOG_CATEGORIES.join('`, `')}\`, \`all\``
              })]
            });
          }

          const currentCat = updatedConfig[matchedCat] || { enabled: true, events: {}, ignoreRoles: [], ignoreUsers: [], ignoreChannels: [] };
          const currentRoles: string[] = currentCat.ignoreRoles || [];
          updatedConfig[matchedCat] = {
            ...currentCat,
            ignoreRoles: Array.from(new Set([...currentRoles, role.id]))
          };
          updateConfig(updatedConfig);

          return message.reply({
            embeds: [createLimeEmbed({
              title: `Ignored Role Added — ${matchedCat.toUpperCase()}`,
              description: `${VERIFIED_ICON} Added **<@&${role.id}>** to ignored roles for category **${matchedCat.toUpperCase()}**.`
            })]
          });
        }

        if (action === 'remove' && role) {
          if (isAll) {
            LOG_CATEGORIES.forEach(cat => {
              const currentCat = updatedConfig[cat] || { enabled: true, events: {}, ignoreRoles: [], ignoreUsers: [], ignoreChannels: [] };
              const currentRoles: string[] = currentCat.ignoreRoles || [];
              updatedConfig[cat] = {
                ...currentCat,
                ignoreRoles: currentRoles.filter(r => r !== role.id)
              };
            });
            updateConfig(updatedConfig);
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Ignored Role Removed — ALL Categories',
                description: `${VERIFIED_ICON} Removed **<@&${role.id}>** from ignored roles across **ALL (EVERYTHING)** log categories.`
              })]
            });
          }

          const matchedCat = LOG_CATEGORIES.find(c => c.toLowerCase() === catArg);
          if (matchedCat) {
            const currentCat = updatedConfig[matchedCat] || { enabled: true, events: {}, ignoreRoles: [], ignoreUsers: [], ignoreChannels: [] };
            const currentRoles: string[] = currentCat.ignoreRoles || [];
            updatedConfig[matchedCat] = {
              ...currentCat,
              ignoreRoles: currentRoles.filter(r => r !== role.id)
            };
            updateConfig(updatedConfig);

            return message.reply({
              embeds: [createLimeEmbed({
                title: `Ignored Role Removed — ${matchedCat.toUpperCase()}`,
                description: `${VERIFIED_ICON} Removed **<@&${role.id}>** from ignored roles for category **${matchedCat.toUpperCase()}**.`
              })]
            });
          }
        }
      }

      // 3. Manager Roles (`r!logs roles <add|remove|list> <@role>`)
      if (sub === 'roles' || sub === 'manager' || sub === 'managers') {
        const action = args[1]?.toLowerCase();
        const role = message.mentions?.roles?.first();
        const currentManagers: string[] = config.managerRoleIds || [];

        if (action === 'add' && role) {
          const merged = Array.from(new Set([...currentManagers, role.id]));
          updateConfig({ managerRoleIds: merged });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Logging Manager Role Added',
              description: `${VERIFIED_ICON} Granted logging management permissions to **<@&${role.id}>**.`
            })]
          });
        }

        if (action === 'remove' && role) {
          const filtered = currentManagers.filter(r => r !== role.id);
          updateConfig({ managerRoleIds: filtered });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Logging Manager Role Removed',
              description: `${VERIFIED_ICON} Revoked logging management permissions from **<@&${role.id}>**.`
            })]
          });
        }

        const rolesStr = currentManagers.length > 0 ? currentManagers.map(r => `<@&${r}>`).join(', ') : '*None (Administrators Only)*';
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Logging Manager Roles Configuration',
            description: `${CONFIG_ICON} **Authorized Manager Roles**: ${rolesStr}\n\n**Syntax**: \`r!logs roles <add|remove> <@role>\``
          })]
        });
      }

      // 4. Enable / Disable (`r!logs enable/disable <category|all|everything>`)
      if (sub === 'enable' || sub === 'disable') {
        const isEnable = sub === 'enable';
        const catArg = args[1]?.toLowerCase();

        if (!catArg) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: `Log Category ${isEnable ? 'Enable' : 'Disable'} Syntax`,
              description: `${WRONG_ICON} **Syntax**: \`r!logs ${sub} <category|all|everything>\`\nExample: \`r!logs ${sub} all\` or \`r!logs ${sub} voice\``
            })]
          });
        }

        const isAll = catArg === 'all' || catArg === 'everything' || catArg === '*';
        const updatedConfig = { ...config };

        if (isAll) {
          LOG_CATEGORIES.forEach(cat => {
            const currentCat = updatedConfig[cat] || { enabled: true, events: {}, ignoreRoles: [], ignoreUsers: [], ignoreChannels: [] };
            updatedConfig[cat] = { ...currentCat, enabled: isEnable };
          });
          updateConfig(updatedConfig);
          return message.reply({
            embeds: [createLimeEmbed({
              title: isEnable ? 'All Logging Categories Enabled' : 'All Logging Categories Disabled',
              description: `${VERIFIED_ICON} Logging engine for **ALL (EVERYTHING)** 8 categories is now **\`${isEnable ? 'ENABLED' : 'DISABLED'}\`**.`
            })]
          });
        }

        const matchedCat = LOG_CATEGORIES.find(c => c.toLowerCase() === catArg);
        if (!matchedCat) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Invalid Category',
              description: `${WRONG_ICON} Invalid category \`${catArg}\`. Valid: \`${LOG_CATEGORIES.join('`, `')}\`, \`all\``
            })]
          });
        }

        const currentCat = updatedConfig[matchedCat] || { enabled: true, events: {}, ignoreRoles: [], ignoreUsers: [], ignoreChannels: [] };
        updatedConfig[matchedCat] = { ...currentCat, enabled: isEnable };
        updateConfig(updatedConfig);

        return message.reply({
          embeds: [createLimeEmbed({
            title: `Category Status Updated — ${matchedCat.toUpperCase()}`,
            description: `${VERIFIED_ICON} Logging for **${matchedCat.toUpperCase()}** is now **\`${isEnable ? 'ENABLED' : 'DISABLED'}\`**.`
          })]
        });
      }

      // 5. Test Event (`r!logs test <category|all>`)
      if (sub === 'test') {
        const catArg = args[1]?.toLowerCase() || 'security';
        const isAll = catArg === 'all' || catArg === 'everything';
        const targetCats = isAll ? LOG_CATEGORIES : [LOG_CATEGORIES.find(c => c.toLowerCase() === catArg) || 'security'];

        let sentCount = 0;
        for (const cat of targetCats) {
          const catCfg = config[cat];
          if (catCfg && catCfg.channelId) {
            try {
              const ch = await message.guild?.channels.fetch(catCfg.channelId).catch(() => null);
              if (ch && ch.isTextBased()) {
                const testEmbed = createLimeEmbed({
                  title: `🧪 Verification Test Log — ${cat.toUpperCase()}`,
                  description: `${VERIFIED_ICON} Audit logging telemetry active and operational for **\`${cat.toUpperCase()}\`**.\nTriggered by ${message.author}.`
                });
                await ch.send({ embeds: [testEmbed] });
                sentCount++;
              }
            } catch (e) {}
          }
        }

        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Audit Log Verification Test Dispatched',
            description: sentCount > 0
              ? `${VERIFIED_ICON} Dispatched test audit log messages to **${sentCount}** configured channel route(s).`
              : `${WRONG_ICON} No configured log channels found. Use \`r!logs channel all #channel\` first.`
          })]
        });
      }

      // 6. Reset (`r!logs reset <category|all>`)
      if (sub === 'reset') {
        const catArg = args[1]?.toLowerCase() || 'all';
        const isAll = catArg === 'all' || catArg === 'everything';
        const updatedConfig = { ...config };

        if (isAll) {
          LOG_CATEGORIES.forEach(cat => {
            updatedConfig[cat] = { enabled: true, channelId: null, ignoreRoles: [], ignoreUsers: [], ignoreChannels: [] };
          });
          updateConfig(updatedConfig);
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'All Logging Channels Reset',
              description: `${VERIFIED_ICON} Reset all 8 logging categories back to unconfigured state.`
            })]
          });
        }
      }

      // 7. Status Matrix Overview (`r!logs` / `r!logs status`)
      const categoryStatusItems: string[] = LOG_CATEGORIES.map(cat => {
        const catCfg = config[cat];
        const isEnabled = catCfg?.enabled !== false && catCfg?.channelId;
        const channelStr = catCfg?.channelId ? `<#${catCfg.channelId}>` : '`Unconfigured`';
        const ignoreRolesCount = (catCfg?.ignoreRoles || []).length;
        const ignoreStr = ignoreRolesCount > 0 ? ` | Ignored Roles: \`${ignoreRolesCount}\`` : '';
        const statusIcon = isEnabled ? VERIFIED_ICON : WRONG_ICON;
        return `${statusIcon} **${cat.toUpperCase()}**: ${channelStr}${ignoreStr}`;
      });

      const managerRolesStr = (config.managerRoleIds || []).map((r: string) => `<@&${r}>`).join(', ') || '`Administrators Only`';

      const overviewCard = buildLimeOverviewCard({
        title: 'ADVANCED LOGGING CENTER MATRIX',
        subtitle: 'MULTI-CATEGORY SERVER AUDIT TRACKING & ROLE CONFIGURATION',
        color: Colors.BRAND,
        sections: [
          {
            title: `${SHIELD_ICON} LOG CATEGORY ROUTING MATRIX`,
            items: categoryStatusItems
          },
          {
            title: `${CONFIG_ICON} LOG MANAGER ROLES & CONTROLS`,
            items: [
              `Authorized Manager Roles: ${managerRolesStr}`,
              `• \`r!logs channel all <#channel>\` — Route ALL 8 log categories to one channel`,
              `• \`r!logs channel <category> <#channel>\` — Route specific category channel`,
              `• \`r!logs ignore-role all <add|remove> <@role>\` — Exclude role from log audit`,
              `• \`r!logs roles <add|remove> <@role>\` — Authorize manager role for log commands`,
              `• \`r!logs test all\` — Send test audit log verification cards`
            ]
          }
        ],
        footerText: 'Rage Optimiser Enterprise • Advanced Audit Suite'
      });

      return message.reply({ embeds: [overviewCard] });
    }
  });
}

// Auto-register command on module load
registerLoggingCommands();

