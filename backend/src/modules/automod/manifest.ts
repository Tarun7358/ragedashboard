import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';

function userTag(user: any): string {
  return user?.globalName ?? user?.username ?? user?.tag ?? user?.id ?? 'Unknown';
}

export const AutomodManifest: ModuleManifest = {
  id: 'automod',
  name: 'AI Automod',
  version: '1.1.0',
  description: 'Spam, phishing, bad words, AntiLink protection with ignored channel and role bypasses.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;

      const channelExists = (id: string) => registry.channels.some(c => c.id === id);

      if (config.logChannelId) {
        progress += 40;
        if (!channelExists(config.logChannelId)) errors.push(`Mod logs channel ID (${config.logChannelId}) was deleted!`);
      }
      
      if (config.badWords && config.badWords.length > 0) progress += 20;
      if (config.blockLinks) progress += 20;
      if (config.punishment) progress += 20;

      return { progress: Math.min(100, progress || 50), errors };
    }
  },
  commands: [
    {
      name: 'automod',
      description: 'Enterprise AntiLink & AutoMod configuration',
      options: [
        {
          name: 'status',
          description: 'View AutoMod status, AntiLink settings, ignored channels and roles',
          type: 1
        },
        {
          name: 'antilink',
          description: 'Configure AntiLink protection settings',
          type: 1,
          options: [
            {
              name: 'action',
              type: 3,
              description: 'Action (enable / disable / status)',
              required: true,
              choices: [
                { name: 'Enable AntiLink', value: 'enable' },
                { name: 'Disable AntiLink', value: 'disable' },
                { name: 'View Status', value: 'status' }
              ]
            }
          ]
        },
        {
          name: 'ignore-channel',
          description: 'Manage ignored channels for AntiLink bypass',
          type: 1,
          options: [
            {
              name: 'action',
              type: 3,
              description: 'Action (add / remove / list)',
              required: true,
              choices: [
                { name: 'Add Ignored Channel', value: 'add' },
                { name: 'Remove Ignored Channel', value: 'remove' },
                { name: 'List Ignored Channels', value: 'list' }
              ]
            },
            {
              name: 'channel',
              type: 7,
              description: 'Target text channel to ignore',
              required: false
            }
          ]
        },
        {
          name: 'ignore-role',
          description: 'Manage ignored roles for AntiLink bypass',
          type: 1,
          options: [
            {
              name: 'action',
              type: 3,
              description: 'Action (add / remove / list)',
              required: true,
              choices: [
                { name: 'Add Ignored Role', value: 'add' },
                { name: 'Remove Ignored Role', value: 'remove' },
                { name: 'List Ignored Roles', value: 'list' }
              ]
            },
            {
              name: 'role',
              type: 8,
              description: 'Target role allowed to post links',
              required: false
            }
          ]
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_automod',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: '❌ AutoMod commands must be run inside a server.', flags: 64 });

        const modules = context.getModulesState ? context.getModulesState() : [];
        const amMod = modules.find((m: any) => m.id === 'automod');
        const config = amMod?.config || {};

        const sub = interaction.options.getSubcommand(false);
        const actionArg = interaction.options.getString('action');

        // IGNORE CHANNEL
        if (sub === 'ignore-channel' || interaction.parsed?.args?.[0] === 'ignore-channel') {
          const action = actionArg || interaction.parsed?.args?.[1]?.toLowerCase();
          const targetChannel = interaction.options.getChannel('channel');

          let ignoredChannels: string[] = config.ignoredChannels || [];

          if (action === 'add') {
            if (!targetChannel) {
              return interaction.reply({ content: '❌ Please mention or specify a target channel to ignore.', flags: 64 });
            }
            if (!ignoredChannels.includes(targetChannel.id)) {
              ignoredChannels.push(targetChannel.id);
              context.updateModuleConfig('automod', { ...config, ignoredChannels });
              context.logSyncEvent(`AutoMod: Added #${targetChannel.name} to AntiLink ignored channels.`, 'success');
            }
            return interaction.reply({ content: `✅ Added ${targetChannel} to AntiLink **ignored channels**. Links posted in this channel will now be bypassed.`, flags: 64 });
          }

          if (action === 'remove') {
            if (!targetChannel) {
              return interaction.reply({ content: '❌ Please mention or specify a target channel to remove.', flags: 64 });
            }
            ignoredChannels = ignoredChannels.filter((id: string) => id !== targetChannel.id);
            context.updateModuleConfig('automod', { ...config, ignoredChannels });
            context.logSyncEvent(`AutoMod: Removed #${targetChannel.name} from AntiLink ignored channels.`, 'warn');
            return interaction.reply({ content: `✅ Removed ${targetChannel} from AntiLink **ignored channels**. Links in this channel are now filtered.`, flags: 64 });
          }

          // list
          const channelMentions = ignoredChannels.map((id: string) => `<#${id}>`).join(', ');
          return interaction.reply({
            content: `📢 **AntiLink Ignored Channels**:\n${channelMentions || '*No ignored channels configured.*'}`,
            flags: 64
          });
        }

        // IGNORE ROLE
        if (sub === 'ignore-role' || interaction.parsed?.args?.[0] === 'ignore-role') {
          const action = actionArg || interaction.parsed?.args?.[1]?.toLowerCase();
          const targetRole = interaction.options.getRole('role');

          let ignoredRoles: string[] = config.ignoredRoles || [];

          if (action === 'add') {
            if (!targetRole) {
              return interaction.reply({ content: '❌ Please mention or specify a target role to ignore.', flags: 64 });
            }
            if (!ignoredRoles.includes(targetRole.id)) {
              ignoredRoles.push(targetRole.id);
              context.updateModuleConfig('automod', { ...config, ignoredRoles });
              context.logSyncEvent(`AutoMod: Added @${targetRole.name} to AntiLink ignored roles.`, 'success');
            }
            return interaction.reply({ content: `✅ Added ${targetRole} to AntiLink **ignored roles**. Members with this role can now post links anywhere.`, flags: 64 });
          }

          if (action === 'remove') {
            if (!targetRole) {
              return interaction.reply({ content: '❌ Please mention or specify a target role to remove.', flags: 64 });
            }
            ignoredRoles = ignoredRoles.filter((id: string) => id !== targetRole.id);
            context.updateModuleConfig('automod', { ...config, ignoredRoles });
            context.logSyncEvent(`AutoMod: Removed @${targetRole.name} from AntiLink ignored roles.`, 'warn');
            return interaction.reply({ content: `✅ Removed ${targetRole} from AntiLink **ignored roles**. Link restrictions re-enabled for this role.`, flags: 64 });
          }

          // list
          const roleMentions = ignoredRoles.map((id: string) => `<@&${id}>`).join(', ');
          return interaction.reply({
            content: `👑 **AntiLink Ignored Roles**:\n${roleMentions || '*No ignored roles configured.*'}`,
            flags: 64
          });
        }

        // ANTILINK ENABLE / DISABLE
        if (sub === 'antilink' || interaction.parsed?.args?.[0] === 'antilink') {
          const action = actionArg || interaction.parsed?.args?.[1]?.toLowerCase();
          if (action === 'enable') {
            context.updateModuleConfig('automod', { ...config, blockLinks: true });
            return interaction.reply({ content: '✅ AntiLink protection has been **ENABLED**.', flags: 64 });
          }
          if (action === 'disable') {
            context.updateModuleConfig('automod', { ...config, blockLinks: false });
            return interaction.reply({ content: '⚠️ AntiLink protection has been **DISABLED**.', flags: 64 });
          }
        }

        // DEFAULT STATUS & OVERVIEW
        const ignoredChannelsList = (config.ignoredChannels || []).map((id: string) => `<#${id}>`).join(', ') || '*None*';
        const ignoredRolesList = (config.ignoredRoles || []).map((id: string) => `<@&${id}>`).join(', ') || '*None*';

        const statusEmbed = new EmbedBuilder()
          .setTitle('🤖 AutoMod & AntiLink Protection Center')
          .setDescription('*Automated chat filtering, anti-link rules, ignored channels, and role bypasses.*')
          .addFields(
            { name: '⚡ AutoMod Module Status', value: `\`${amMod?.status || 'enabled'}\``, inline: true },
            { name: '🔗 AntiLink Filter', value: config.blockLinks !== false ? '🟢 **Enabled**' : '🔴 **Disabled**', inline: true },
            { name: '⚠️ Punishment Mode', value: `\`${config.punishment || 'warn'}\``, inline: true },
            { name: '📢 Ignored Channels (Bypassed)', value: ignoredChannelsList, inline: false },
            { name: '👑 Ignored Roles (Bypassed)', value: ignoredRolesList, inline: false },
            { name: '📝 Configure Commands Guide', value: '• `r!automod ignore-channel <add|remove|list> #channel`\n• `r!automod ignore-role <add|remove|list> @role`\n• `r!automod antilink <enable|disable>`', inline: false }
          )
          .setColor('#7c5cfc')
          .setFooter({ text: 'Rage Optimiser • AutoMod Engine' })
          .setTimestamp();

        return interaction.reply({ embeds: [statusEmbed] });
      }
    },
    {
      name: 'messageCreate',
      handler: async (client: any, message: any, context: any) => {
        if (message.author.bot) return;
        if (!message.guild) return;
        
        const modules = context.getModulesState ? context.getModulesState() : [];
        const amMod = modules.find((m: any) => m.id === 'automod');
        if (!amMod || amMod.status !== 'enabled') return;

        const config = amMod.config || {};
        const content = message.content.toLowerCase();
        let deleted = false;
        let reason = '';

        // 1. AntiLink Filter with Ignored Channels & Ignored Roles Bypass
        const blockLinks = config.blockLinks !== false;
        const hasLink = content.includes('http://') || content.includes('https://') || content.includes('discord.gg/');

        if (blockLinks && hasLink) {
          const ignoredChannels: string[] = config.ignoredChannels || [];
          const ignoredRoles: string[] = config.ignoredRoles || [];

          // Bypass checks:
          // A) Message is in an ignored channel
          const isChannelIgnored = ignoredChannels.includes(message.channel.id);
          // B) Member has an ignored role
          const hasIgnoredRole = message.member?.roles?.cache?.some((r: any) => ignoredRoles.includes(r.id));
          // C) Member is Server Owner or has ManageMessages / Administrator permissions
          const isOwnerOrAdmin = message.guild.ownerId === message.author.id ||
            Boolean(message.member?.permissions?.has?.('ManageMessages')) ||
            Boolean(message.member?.permissions?.has?.(PermissionFlagsBits.Administrator));

          if (!isChannelIgnored && !hasIgnoredRole && !isOwnerOrAdmin) {
            deleted = true;
            reason = 'Posting unauthorized links';
          }
        }

        // 2. Bad Words Filter
        if (!deleted && config.badWords && config.badWords.length > 0) {
          for (const word of config.badWords) {
            if (content.includes(word.toLowerCase())) {
              deleted = true;
              reason = 'Using blacklisted words';
              break;
            }
          }
        }
        
        // 3. Caps Spam
        if (!deleted && config.preventCapsSpam && message.content.length > 10) {
          const capsCount = message.content.replace(/[^A-Z]/g, '').length;
          if (capsCount / message.content.length > 0.7) {
            deleted = true;
            reason = 'Excessive capital letters';
          }
        }

        if (deleted) {
          try {
            await message.delete();
            const warningEmbed = new EmbedBuilder()
              .setTitle('🛡️ AutoMod Enforcement')
              .setDescription(`**User**: ${message.author} (\`${message.author.id}\`)\n**Reason**: ${reason}\n**Action**: Message removed.`)
              .setColor('#ff9900')
              .setTimestamp();

            await message.channel.send({ embeds: [warningEmbed] })
              .then((m: any) => setTimeout(() => m.delete().catch(() => {}), 6000));
            
            context.logSyncEvent(`AutoMod: Removed message from ${userTag(message.author)} in #${message.channel.name} (${reason})`, 'warn');
            
            // Log to discord channel
            if (config.logChannelId) {
              const logChannel = message.guild.channels.cache.get(config.logChannelId);
              if (logChannel && logChannel.isTextBased()) {
                const embed = new EmbedBuilder()
                  .setTitle('🛡️ AutoMod Intervention')
                  .setDescription(`**User**: ${userTag(message.author)} (\`${message.author.id}\`)\n**Channel**: ${message.channel}\n**Reason**: \`${reason}\`\n\n**Content**:\n${message.content.length > 900 ? message.content.substring(0, 900) + '...' : message.content}`)
                  .setColor('#ff9900')
                  .setTimestamp();
                await logChannel.send({ embeds: [embed] });
              }
            }

            // Handle punishment
            if (config.punishment === 'warn') {
              const dmEmbed = new EmbedBuilder()
                .setTitle(`⚠️ AutoMod Warning — ${message.guild.name}`)
                .setDescription(`Your message in **#${message.channel.name || 'channel'}** was removed by AutoMod.\n\n**Server**: ${message.guild.name}\n**Reason**: ${reason}`)
                .setColor('#ff9900')
                .setFooter({ text: `${message.guild.name} • AutoMod Protection` })
                .setTimestamp();
              await message.member.send({ embeds: [dmEmbed] }).catch(() => {});
            } else if (config.punishment === 'timeout') {
              await message.member.timeout(5 * 60 * 1000, 'AutoMod Timeout').catch(() => {});
            } else if (config.punishment === 'kick') {
              await message.member.kick('AutoMod Kick').catch(() => {});
            }

          } catch (e) {
            console.error('Automod delete error:', e);
          }
        }
      }
    }
  ]
};
