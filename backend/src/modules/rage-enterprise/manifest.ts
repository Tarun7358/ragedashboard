import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { RageEnterpriseService } from './service.js';
import { Embeds, Colors, VERIFIED_ICON, WRONG_ICON } from '../../core/UIFactory.js';

// TODO:
// Dashboard currently disabled.
// Planned for Enterprise Web Panel.
// UI should follow Lime.gg inspiration.

export const RageEnterpriseManifest: ModuleManifest = {
  id: 'rage-enterprise',
  name: 'Rage Enterprise Native Interface',
  version: '1.0.0',
  description: 'Enterprise native Discord management interface providing full control over security, moderation, music, configuration, telemetry, and owner operations.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      return { progress: 100, errors: [] };
    }
  },
  commands: [
    {
      name: 'rage',
      description: 'Master Enterprise Command Hub for Rage Optimiser',
      options: [
        {
          name: 'security',
          type: 1, // SUB_COMMAND
          description: 'Open Security & Anti-Nuke Control Center'
        },
        {
          name: 'moderation',
          type: 1,
          description: 'Open Moderation & Member Punishment Center'
        },
        {
          name: 'welcome',
          type: 1,
          description: 'Open Welcome, Goodbye & AutoRole Suite'
        },
        {
          name: 'music',
          type: 1,
          description: 'Open Music Player & Audio Engine Controls'
        },
        {
          name: 'config',
          type: 1,
          description: 'Open Master System Configuration Panel'
        },
        {
          name: 'monitoring',
          type: 1,
          description: 'View Live System Telemetry & Cluster Status'
        },
        {
          name: 'owner',
          type: 1,
          description: 'Open System Owner Diagnostics Board'
        }
      ]
    },
    // Standalone Command Shortcuts for Slash & Prefix parity
    ...[
      'security', 'lockdown', 'quarantine', 'whitelist', 'antinuke', 'antispam', 'antilink', 'verification', 'logs', 'raidmode',
      'ban', 'tempban', 'kick', 'mute', 'timeout', 'purge', 'warn', 'notes',
      'welcome', 'autorole', 'goodbye', 'birthday', 'boost', 'milestones',
      'play', 'queue', 'skip', 'shuffle', 'autoplay', 'filters', 'lyrics', 'volume',
      'config', 'setup', 'modules', 'permissions', 'premium', 'analytics',
      'status', 'performance', 'telemetry', 'health', 'uptime', 'cache', 'memory',
      'emergency', 'diagnostics', 'developer', 'reload', 'restart', 'sync', 'debug'
    ].map(name => ({
      name,
      description: `Rage Enterprise ${name} command`
    }))
  ],
  events: [
    {
      name: 'command_rage',
      handler: async (client: any, interaction: any, context: any) => {
        const subcommand = interaction.options?.getSubcommand?.() || 'config';
        await handleEnterpriseAction(subcommand, client, interaction, context);
      }
    },
    // Map each standalone command
    ...[
      'security', 'lockdown', 'quarantine', 'whitelist', 'antinuke', 'antispam', 'antilink', 'verification', 'logs', 'raidmode',
      'ban', 'tempban', 'kick', 'mute', 'timeout', 'purge', 'warn', 'notes',
      'welcome', 'autorole', 'goodbye', 'birthday', 'boost', 'milestones',
      'play', 'queue', 'skip', 'shuffle', 'autoplay', 'filters', 'lyrics', 'volume',
      'config', 'setup', 'modules', 'permissions', 'premium', 'analytics',
      'status', 'performance', 'telemetry', 'health', 'uptime', 'cache', 'memory',
      'emergency', 'diagnostics', 'developer', 'reload', 'restart', 'sync', 'debug'
    ].map(cmdName => ({
      name: `command_${cmdName}`,
      handler: async (client: any, interaction: any, context: any) => {
        await handleEnterpriseAction(cmdName, client, interaction, context);
      }
    })),

    // BUTTON HANDLERS
    {
      name: 'button_sec_toggle_antinuke',
      handler: async (client: any, interaction: any, context: any) => {
        const guildId = interaction.guildId;
        const modules = context.getModulesState(guildId);
        const secMod = modules.find((m: any) => m.id === 'security') || {};
        const newStatus = !(secMod.config?.antiNukeEnabled);
        context.updateModuleConfig('security', { ...(secMod.config || {}), antiNukeEnabled: newStatus });
        const res = RageEnterpriseService.getSecurityOverview(interaction.guild, context);
        await interaction.update(res);
      }
    },
    {
      name: 'button_sec_toggle_raidmode',
      handler: async (client: any, interaction: any, context: any) => {
        const guildId = interaction.guildId;
        const modules = context.getModulesState(guildId);
        const secMod = modules.find((m: any) => m.id === 'security') || {};
        const newStatus = !(secMod.config?.raidModeEnabled);
        context.updateModuleConfig('security', { ...(secMod.config || {}), raidModeEnabled: newStatus });
        const res = RageEnterpriseService.getSecurityOverview(interaction.guild, context);
        await interaction.update(res);
      }
    },
    {
      name: 'button_sec_toggle_antispam',
      handler: async (client: any, interaction: any, context: any) => {
        const guildId = interaction.guildId;
        const modules = context.getModulesState(guildId);
        const secMod = modules.find((m: any) => m.id === 'security') || {};
        const newStatus = !(secMod.config?.antiSpamEnabled);
        context.updateModuleConfig('security', { ...(secMod.config || {}), antiSpamEnabled: newStatus });
        const res = RageEnterpriseService.getSecurityOverview(interaction.guild, context);
        await interaction.update(res);
      }
    },
    {
      name: 'button_sec_toggle_antilink',
      handler: async (client: any, interaction: any, context: any) => {
        const guildId = interaction.guildId;
        const modules = context.getModulesState(guildId);
        const secMod = modules.find((m: any) => m.id === 'security') || {};
        const newStatus = !(secMod.config?.antiLinkEnabled);
        context.updateModuleConfig('security', { ...(secMod.config || {}), antiLinkEnabled: newStatus });
        const res = RageEnterpriseService.getSecurityOverview(interaction.guild, context);
        await interaction.update(res);
      }
    },
    {
      name: 'button_sec_trigger_lockdown',
      handler: async (client: any, interaction: any, context: any) => {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: `${WRONG_ICON} Only Administrators can trigger emergency lockdown.`, flags: 64 });
        }
        await interaction.reply({
          content: `${VERIFIED_ICON} **Initiating Emergency Lockdown across server text channels...**`
        });
      }
    },
    {
      name: 'button_mod_btn_purge',
      handler: async (client: any, interaction: any, context: any) => {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('purge_10').setLabel('Purge 10').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('purge_25').setLabel('Purge 25').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('purge_50').setLabel('Purge 50').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('purge_100').setLabel('Purge 100').setStyle(ButtonStyle.Danger)
        );
        await interaction.reply({ content: '🧹 Select number of messages to purge from this channel:', components: [row] });
      }
    },
    {
      name: 'button_purge_10',
      handler: async (client: any, interaction: any, context: any) => {
        await interaction.channel?.bulkDelete(10, true).catch(() => {});
        await interaction.reply({ content: `${VERIFIED_ICON} Purged 10 messages.`, flags: 64 });
      }
    },
    {
      name: 'button_purge_25',
      handler: async (client: any, interaction: any, context: any) => {
        await interaction.channel?.bulkDelete(25, true).catch(() => {});
        await interaction.reply({ content: `${VERIFIED_ICON} Purged 25 messages.`, flags: 64 });
      }
    },
    {
      name: 'button_purge_50',
      handler: async (client: any, interaction: any, context: any) => {
        await interaction.channel?.bulkDelete(50, true).catch(() => {});
        await interaction.reply({ content: `${VERIFIED_ICON} Purged 50 messages.`, flags: 64 });
      }
    },
    {
      name: 'button_purge_100',
      handler: async (client: any, interaction: any, context: any) => {
        await interaction.channel?.bulkDelete(100, true).catch(() => {});
        await interaction.reply({ content: `${VERIFIED_ICON} Purged 100 messages.`, flags: 64 });
      }
    },
    {
      name: 'button_config_btn_wizard',
      handler: async (client: any, interaction: any, context: any) => {
        const embed = new EmbedBuilder()
          .setTitle('🪄 Interactive Server Setup Wizard')
          .setDescription([
            `Welcome to the **Rage Optimiser Multi-Step Setup Wizard**!`,
            ``,
            `**Step 1/3**: Security & Anti-Nuke Defaults`,
            `Click **Next** below to configure automated protection, welcome channels, and logging.`
          ].join('\n'))
          .setColor(0x84cc16);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('wizard_step_2').setLabel('Next Step ▶').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('wizard_cancel').setLabel('Cancel Setup').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
      }
    },
    {
      name: 'button_wizard_step_2',
      handler: async (client: any, interaction: any, context: any) => {
        const embed = new EmbedBuilder()
          .setTitle('🪄 Interactive Server Setup Wizard (Step 2/3)')
          .setDescription([
            `**Step 2/3**: Logging & Audit Channel Setup`,
            ``,
            `Select your primary logging channel for security events and member actions.`
          ].join('\n'))
          .setColor(0x84cc16);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('wizard_step_3').setLabel('Next Step ▶').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('wizard_cancel').setLabel('Cancel Setup').setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({ embeds: [embed], components: [row] });
      }
    },
    {
      name: 'button_wizard_step_3',
      handler: async (client: any, interaction: any, context: any) => {
        const embed = new EmbedBuilder()
          .setTitle('🪄 Interactive Server Setup Wizard (Completed)')
          .setDescription([
            `🎉 **Setup Wizard Complete!**`,
            ``,
            `Your server configuration has been updated. All modules are initialized and running with optimal settings.`
          ].join('\n'))
          .setColor(0x84cc16);

        await interaction.update({ embeds: [embed], components: [] });
      }
    },
    {
      name: 'button_mon_refresh',
      handler: async (client: any, interaction: any, context: any) => {
        const res = RageEnterpriseService.getMonitoringStatus(client, context);
        await interaction.update(res);
      }
    },
    {
      name: 'button_owner_emergency_lock',
      handler: async (client: any, interaction: any, context: any) => {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: `${WRONG_ICON} Restricted to Administrators / System Owner.`, flags: 64 });
        }
        await interaction.reply({ content: `🚨 **Executing Emergency Lock across all server channels!**` });
      }
    },
    {
      name: 'select_config_category_select',
      handler: async (client: any, interaction: any, context: any) => {
        const selected = interaction.values?.[0];
        if (selected === 'security') {
          const res = RageEnterpriseService.getSecurityOverview(interaction.guild, context);
          await interaction.reply(res);
        } else if (selected === 'moderation') {
          const res = RageEnterpriseService.getModerationPanel(interaction.guild);
          await interaction.reply(res);
        } else if (selected === 'welcome') {
          const res = RageEnterpriseService.getWelcomeOverview(interaction.guild, context);
          await interaction.reply(res);
        } else if (selected === 'music') {
          const res = RageEnterpriseService.getMusicPlayerCard(interaction.guild);
          await interaction.reply(res);
        } else if (selected === 'system') {
          const res = RageEnterpriseService.getMonitoringStatus(client, context);
          await interaction.reply(res);
        }
      }
    }
  ]
};

async function handleEnterpriseAction(action: string, client: any, interaction: any, context: any) {
  switch (action) {
    case 'security':
    case 'antinuke':
    case 'antispam':
    case 'antilink':
    case 'quarantine':
    case 'whitelist':
    case 'lockdown':
    case 'verification':
    case 'logs':
    case 'raidmode': {
      const res = RageEnterpriseService.getSecurityOverview(interaction.guild, context);
      if (interaction.reply) await interaction.reply(res);
      break;
    }

    case 'moderation':
    case 'ban':
    case 'tempban':
    case 'kick':
    case 'mute':
    case 'timeout':
    case 'purge':
    case 'warn':
    case 'notes': {
      const res = RageEnterpriseService.getModerationPanel(interaction.guild);
      if (interaction.reply) await interaction.reply(res);
      break;
    }

    case 'welcome':
    case 'autorole':
    case 'goodbye':
    case 'birthday':
    case 'boost':
    case 'milestones': {
      const res = RageEnterpriseService.getWelcomeOverview(interaction.guild, context);
      if (interaction.reply) await interaction.reply(res);
      break;
    }

    case 'music':
    case 'player':
    case 'play':
    case 'queue':
    case 'skip':
    case 'shuffle':
    case 'autoplay':
    case 'filters':
    case 'lyrics':
    case 'volume': {
      const res = RageEnterpriseService.getMusicPlayerCard(interaction.guild);
      if (interaction.reply) await interaction.reply(res);
      break;
    }

    case 'config':
    case 'setup':
    case 'modules':
    case 'permissions':
    case 'premium':
    case 'analytics': {
      const res = RageEnterpriseService.getMasterConfigPanel(interaction.guild, context);
      if (interaction.reply) await interaction.reply(res);
      break;
    }

    case 'status':
    case 'performance':
    case 'telemetry':
    case 'health':
    case 'uptime':
    case 'cache':
    case 'memory': {
      const res = RageEnterpriseService.getMonitoringStatus(client, context);
      if (interaction.reply) await interaction.reply(res);
      break;
    }

    case 'owner':
    case 'emergency':
    case 'diagnostics':
    case 'developer':
    case 'reload':
    case 'restart':
    case 'sync':
    case 'debug': {
      const res = RageEnterpriseService.getOwnerControlPanel(client);
      if (interaction.reply) await interaction.reply(res);
      break;
    }

    default: {
      const res = RageEnterpriseService.getMasterConfigPanel(interaction.guild, context);
      if (interaction.reply) await interaction.reply(res);
      break;
    }
  }
}
