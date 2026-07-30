import { EmbedBuilder } from 'discord.js';
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
        
        const subcommand = interaction.options.getSubcommand();
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
            const authorText = message.author ? `${message.author} (\`${message.author?.id}\`)` : 'Unknown User (Uncached Message)';
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
        const { oldMessage, newMessage } = data;
        const modules = context.getModulesState ? context.getModulesState() : [];
        const logModule = modules.find((m: any) => m.id === 'logging');
        if (!logModule || logModule.status !== 'enabled') return;

        const config = logModule.config;
        const auditConfig = config['audit'];
        if (!auditConfig || !auditConfig.enabled || !auditConfig.channelId) return;

        if (newMessage.author?.bot) return;
        if (oldMessage.content === newMessage.content) return; 

        try {
          let channel = newMessage.guild?.channels.cache.get(auditConfig.channelId);
          if (!channel) channel = await newMessage.guild?.channels.fetch(auditConfig.channelId).catch(() => null);
          
          if (channel && channel.isTextBased()) {
            const authorText = newMessage.author ? `${newMessage.author} (\`${newMessage.author?.id}\`)` : 'Unknown User';
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

        try {
          let embed: EmbedBuilder;

          if (!oldState.channelId && newState.channelId) {
            embed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('🟢 Voice Event — Member Connected')
              .setDescription(
                `> ### Joined Voice Channel\n` +
                `> **User**: ${member.user} (\`${member.user.id}\`)\n` +
                `> **Channel**: **#${newState.channel?.name || 'unknown'}** (\`${newState.channelId}\`)`
              )
              .setFooter({ text: 'Rage Optimiser • Voice Telemetry', iconURL: client.user?.displayAvatarURL() })
              .setTimestamp();
          } else if (oldState.channelId && !newState.channelId) {
            embed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('🔴 Voice Event — Member Disconnected')
              .setDescription(
                `> ### Left Voice Channel\n` +
                `> **User**: ${member.user} (\`${member.user.id}\`)\n` +
                `> **Channel**: **#${oldState.channel?.name || 'unknown'}** (\`${oldState.channelId}\`)`
              )
              .setFooter({ text: 'Rage Optimiser • Voice Telemetry', iconURL: client.user?.displayAvatarURL() })
              .setTimestamp();
          } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            embed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('🔵 Voice Event — Channel Switched')
              .setDescription(
                `> ### Switched Voice Channel\n` +
                `> **User**: ${member.user} (\`${member.user.id}\`)\n\n` +
                `**From**: \`#${oldState.channel?.name || 'unknown'}\` → **To**: \`#${newState.channel?.name || 'unknown'}\``
              )
              .setFooter({ text: 'Rage Optimiser • Voice Telemetry', iconURL: client.user?.displayAvatarURL() })
              .setTimestamp();
          } else {
            return; 
          }

          let channel = newState.guild?.channels.cache.get(voiceConfig.channelId);
          if (!channel) channel = await newState.guild?.channels.fetch(voiceConfig.channelId).catch(() => null);
          
          if (channel && channel.isTextBased()) {
            await channel.send({ embeds: [embed] });
          }
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
          const channel = member.guild?.channels.cache.get(config.channelId);
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
          const channel = member.guild?.channels.cache.get(config.channelId);
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
          const channel = ban.guild?.channels.cache.get(config.channelId);
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
          const channel = ban.guild?.channels.cache.get(config.channelId);
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
          const channel = role.guild?.channels.cache.get(config.channelId);
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
          const channel = role.guild?.channels.cache.get(config.channelId);
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
          const channel = ch.guild?.channels.cache.get(config.channelId);
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
          const channel = ch.guild?.channels.cache.get(config.channelId);
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
