import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message
} from 'discord.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';
import { PrefixResolver } from '../../core/prefix/PrefixResolver.js';
import { buildLimeOverviewCard, Colors, VERIFIED_ICON, WRONG_ICON, SHIELD_ICON, CONFIG_ICON } from '../../core/UIFactory.js';
import { DEFAULT_SECURITY_RULES } from '../config/manifest.js';
import { isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';

const APPROVED_ICON = '<a:approved:1532390590707142956>';
const WRONG_EMOJI = '<:wrong:1532390628330307634>';
const SHIELD_EMOJI = '<:shield:1532403012751065179>';
const CONFIG_EMOJI = '<:config:1532425712844144701>';
const GAVEL_EMOJI = '<:gavel:1532621057318584380>';

export function registerEnableDisableCommands(): void {
  // 1. r!enable Command
  PrefixRegistry.register({
    name: 'enable',
    category: 'Security',
    description: 'Enable Anti-Nuke, AutoMod, Voice Protection, or all security sub-modules with standard defaults.',
    usage: 'r!enable <antinuke | automod | voice | all | module_id>',
    aliases: ['on', 'activate', 'enablemodule'],
    cooldownSeconds: 3,
    examples: [
      'r!enable antinuke',
      'r!enable automod',
      'r!enable all',
      'r!enable voice'
    ],
    moduleOwnerId: 'security',
    dangerLevel: 'Medium',
    execute: async (message: Message, args: string[], context?: any) => {
      const guildId = message.guildId;
      if (!guildId || !message.guild) {
        return message.reply({ content: `${WRONG_EMOJI} Command can only be executed within a server.` });
      }

      const isAuthorized = await isOwnerOrExtraOwner(message.author.id, message.guild);
      if (!isAuthorized) {
        return message.reply({
          content: `${WRONG_EMOJI} **Access Denied**: Enabling security modules is strictly restricted to the **Server Owner** and designated **Extra Owners**.`
        });
      }

      const prefix = PrefixResolver.getPrefix(guildId);
      const target = (args[0] || '').toLowerCase().trim();

      if (!target) {
        const usageEmbed = buildLimeOverviewCard({
          title: `${CONFIG_EMOJI} ONE-CLICK MODULE ACTIVATION CONTROL`,
          subtitle: 'ENABLE PROTECTION SUITES WITH OPTIMAL DEFAULT PARAMETERS',
          color: Colors.BRAND,
          sections: [
            {
              title: `${SHIELD_EMOJI} AVAILABLE ACTIVATION TARGETS`,
              items: [
                `• \`${prefix}enable antinuke\` — Enable all Anti-Nuke & Unbypassable rules`,
                `• \`${prefix}enable automod\` — Enable Anti-Link, Anti-Spam & Chat Filters`,
                `• \`${prefix}enable voice\` — Enable Voice Protection & Join-To-Create`,
                `• \`${prefix}enable all\` — Enable complete enterprise security suite`,
                `• \`${prefix}enable <module_id>\` — Enable a specific system module`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Security Control'
        });
        return message.reply({ embeds: [usageEmbed] });
      }

      const updateConfig = context?.updateModuleConfig;
      const toggleMod = context?.toggleModule;
      const modulesState = context?.getModulesState ? context.getModulesState() : [];

      // A. ENABLE ANTI-NUKE
      if (['antinuke', 'security', 'an'].includes(target)) {
        if (toggleMod) toggleMod('security', true);

        const secMod = modulesState.find((m: any) => m.id === 'security');
        const secConfig = secMod?.config || {};
        const rules = secConfig.rules || {};

        const updatedRules = { ...rules };
        for (const [ruleKey, defaultDef] of Object.entries(DEFAULT_SECURITY_RULES)) {
          updatedRules[ruleKey] = {
            ...defaultDef,
            enabled: true
          };
        }

        const newSecConfig = {
          ...secConfig,
          antiNukeEnabled: true,
          rules: updatedRules
        };

        if (updateConfig) updateConfig('security', newSecConfig);

        const card = buildLimeOverviewCard({
          title: `${APPROVED_ICON} ANTI-NUKE SYSTEM ENABLED`,
          subtitle: 'ALL ANTI-NUKE & UNBYPASSABLE PROTECTIONS ARE NOW LIVE',
          color: Colors.LIME,
          thumbnail: message.guild.iconURL({ size: 256 }) || undefined,
          sections: [
            {
              title: `${SHIELD_EMOJI} ACTIVE ANTI-NUKE PROTECTIONS`,
              items: [
                '• **Role Protections**: Role Create, Delete, Grant, Remove & Update',
                '• **Channel Protections**: Channel Create, Delete & Update Limits',
                '• **Bot & Webhook Guards**: Anti-Bot-Add, Anti-Webhook-Create/Delete',
                '• **Member Safeguards**: Anti-Ban, Anti-Kick, Anti-Timeout, Anti-Prune',
                '• **Server Guard**: Anti-Server-Update & Threshold Auto-Quarantine'
              ]
            },
            {
              title: `${CONFIG_EMOJI} CUSTOMIZATION SYNTAX`,
              items: [
                `Use \`${prefix}config antinuke\` or \`/security config-rule\` to adjust thresholds.`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Anti-Nuke System Active'
        });

        return message.reply({ embeds: [card] });
      }

      // B. ENABLE AUTOMOD
      if (['automod', 'am', 'antilink', 'antispam'].includes(target)) {
        if (toggleMod) toggleMod('automod', true);

        const amMod = modulesState.find((m: any) => m.id === 'automod');
        const amConfig = amMod?.config || {};

        const newAmConfig = {
          ...amConfig,
          autoModEnabled: true,
          blockLinks: true,
          antiLinkEnabled: true,
          antiSpamEnabled: true,
          maxSpamMessages: 5,
          spamWindowSeconds: 5,
          punishment: amConfig.punishment || 'warn'
        };

        if (updateConfig) updateConfig('automod', newAmConfig);

        const card = buildLimeOverviewCard({
          title: `${APPROVED_ICON} AUTOMOD & ANTILINK ENABLED`,
          subtitle: 'AUTOMATED CHAT RESTRICTIONS & LINK FILTERS ARE NOW ACTIVE',
          color: Colors.LIME,
          thumbnail: message.guild.iconURL({ size: 256 }) || undefined,
          sections: [
            {
              title: `${GAVEL_EMOJI} ACTIVE AUTOMOD MODULES`,
              items: [
                '• **Anti-Link Filter**: Automatically blocks & deletes unauthorized URLs',
                '• **Anti-Spam Limiter**: Rate-limits spam floods (Max 5 msgs / 5 sec)',
                '• **Bad Words & Caps Guard**: Filters prohibited phrases & caps spam',
                '• **Mention Spam Guard**: Prevents mass-pinging server members'
              ]
            },
            {
              title: `${CONFIG_EMOJI} BYPASS & EXEMPTION COMMANDS`,
              items: [
                `• \`${prefix}automod ignore-channel add #channel\` — Ignore channel from AntiLink`,
                `• \`${prefix}automod ignore-role add @role\` — Grant role AntiLink bypass`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • AutoMod Active'
        });

        return message.reply({ embeds: [card] });
      }

      // C. ENABLE VOICE
      if (['voice', 'vc', 'voice-protection', 'jointocreate'].includes(target)) {
        if (toggleMod) {
          toggleMod('voice-protection', true);
          toggleMod('joinToCreate', true);
        }

        const card = buildLimeOverviewCard({
          title: `${APPROVED_ICON} VOICE PROTECTION & JTC ENABLED`,
          subtitle: 'VOICE GUARDS & DYNAMIC VC CHANNELS ARE NOW ACTIVE',
          color: Colors.LIME,
          sections: [
            {
              title: `${SHIELD_EMOJI} VOICE PROTECTION FEATURES`,
              items: [
                '• **Voice Channel Guard**: Anti-mass mute, deafen, and disconnect protection',
                '• **Join-To-Create**: Dynamic automatic voice channel generation'
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Voice Engine Active'
        });

        return message.reply({ embeds: [card] });
      }

      // D. ENABLE ALL
      if (['all', 'full', 'everything'].includes(target)) {
        // Enable Security
        if (toggleMod) toggleMod('security', true);
        const secMod = modulesState.find((m: any) => m.id === 'security');
        const secConfig = secMod?.config || {};
        const updatedRules = { ...(secConfig.rules || {}) };
        for (const [ruleKey, defaultDef] of Object.entries(DEFAULT_SECURITY_RULES)) {
          updatedRules[ruleKey] = { ...defaultDef, enabled: true };
        }
        if (updateConfig) updateConfig('security', { ...secConfig, antiNukeEnabled: true, rules: updatedRules });

        // Enable AutoMod
        if (toggleMod) toggleMod('automod', true);
        const amMod = modulesState.find((m: any) => m.id === 'automod');
        if (updateConfig) updateConfig('automod', { ...(amMod?.config || {}), autoModEnabled: true, blockLinks: true, antiSpamEnabled: true });

        // Enable Voice & JoinGuard & Logging & Backups
        if (toggleMod) {
          toggleMod('voice-protection', true);
          toggleMod('joinToCreate', true);
          toggleMod('join-role-guard', true);
          toggleMod('logging', true);
          toggleMod('backups', true);
        }

        const card = buildLimeOverviewCard({
          title: `${APPROVED_ICON} COMPLETE ENTERPRISE DEFENSE SUITE ENABLED`,
          subtitle: 'ALL ANTI-NUKE, AUTOMOD, VOICE & SECURITY MODULES ARE FULLY ACTIVE',
          color: Colors.LIME,
          thumbnail: message.guild.iconURL({ size: 256 }) || undefined,
          sections: [
            {
              title: `${SHIELD_EMOJI} ACTIVATED ENTERPRISE MODULES`,
              items: [
                '• **Anti-Nuke Protection**: Active (24/24 unbypassable protections enabled)',
                '• **AI AutoMod & Anti-Link**: Active (chat filter & rate-limiting enabled)',
                '• **Voice Safeguards**: Active (anti-mass disconnect/mute enabled)',
                '• **Join-Role Guard & Logging**: Active (audit trail & role protection live)'
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • All Modules Enabled'
        });

        return message.reply({ embeds: [card] });
      }

      // E. SPECIFIC MODULE ENABLE BY ID
      if (toggleMod) {
        const result = toggleMod(target, true);
        if (result) {
          return message.reply({
            content: `${APPROVED_ICON} Module **${result.name}** (\`${result.id}\`) has been **enabled**.`
          });
        }
      }

      return message.reply({
        content: `${WRONG_EMOJI} Unknown target **${target}**. Valid options: \`antinuke\`, \`automod\`, \`voice\`, \`all\`.`
      });
    }
  });

  // 2. r!disable Command
  PrefixRegistry.register({
    name: 'disable',
    category: 'Security',
    description: 'Disable Anti-Nuke, AutoMod, Voice Protection, or a specific module.',
    usage: 'r!disable <antinuke | automod | voice | all | module_id>',
    aliases: ['off', 'deactivate', 'disablemodule'],
    cooldownSeconds: 3,
    examples: [
      'r!disable antinuke',
      'r!disable automod',
      'r!disable all'
    ],
    moduleOwnerId: 'security',
    dangerLevel: 'High',
    execute: async (message: Message, args: string[], context?: any) => {
      const guildId = message.guildId;
      if (!guildId || !message.guild) {
        return message.reply({ content: `${WRONG_EMOJI} Command can only be executed within a server.` });
      }

      const isAuthorized = await isOwnerOrExtraOwner(message.author.id, message.guild);
      if (!isAuthorized) {
        return message.reply({
          content: `${WRONG_EMOJI} **Access Denied**: Disabling security modules is strictly restricted to the **Server Owner** and designated **Extra Owners**.`
        });
      }

      const prefix = PrefixResolver.getPrefix(guildId);
      const target = (args[0] || '').toLowerCase().trim();

      if (!target) {
        return message.reply({
          content: `${WRONG_EMOJI} Please specify what to disable.\nUsage: \`${prefix}disable <antinuke | automod | voice | all | module_id>\``
        });
      }

      const updateConfig = context?.updateModuleConfig;
      const toggleMod = context?.toggleModule;
      const modulesState = context?.getModulesState ? context.getModulesState() : [];

      if (['antinuke', 'security', 'an'].includes(target)) {
        if (toggleMod) toggleMod('security', false);
        const secMod = modulesState.find((m: any) => m.id === 'security');
        if (updateConfig) updateConfig('security', { ...(secMod?.config || {}), antiNukeEnabled: false });

        const card = buildLimeOverviewCard({
          title: `${WRONG_EMOJI} ANTI-NUKE SYSTEM DISABLED`,
          subtitle: 'ANTI-NUKE PROTECTIONS TEMPORARILY TURNED OFF',
          color: Colors.DANGER,
          sections: [
            {
              title: `${SHIELD_EMOJI} SYSTEM STATUS`,
              items: [
                '• Anti-Nuke protections are now **disabled**.',
                `• Re-enable anytime using \`${prefix}enable antinuke\`.`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Security Warning'
        });

        return message.reply({ embeds: [card] });
      }

      if (['automod', 'am', 'antilink'].includes(target)) {
        if (toggleMod) toggleMod('automod', false);
        const amMod = modulesState.find((m: any) => m.id === 'automod');
        if (updateConfig) updateConfig('automod', { ...(amMod?.config || {}), autoModEnabled: false, blockLinks: false });

        const card = buildLimeOverviewCard({
          title: `${WRONG_EMOJI} AUTOMOD & ANTILINK DISABLED`,
          subtitle: 'AUTOMOD CHAT RESTRICTIONS TURNED OFF',
          color: Colors.DANGER,
          sections: [
            {
              title: `${GAVEL_EMOJI} SYSTEM STATUS`,
              items: [
                '• AutoMod and Anti-Link filters are now **disabled**.',
                `• Re-enable anytime using \`${prefix}enable automod\`.`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • AutoMod Standby'
        });

        return message.reply({ embeds: [card] });
      }

      if (['all', 'full', 'everything'].includes(target)) {
        if (toggleMod) {
          toggleMod('security', false);
          toggleMod('automod', false);
          toggleMod('voice-protection', false);
        }

        const card = buildLimeOverviewCard({
          title: `${WRONG_EMOJI} ALL DEFENSE MODULES DISABLED`,
          subtitle: 'SERVER DEFENSES ARE NOW IN STANDBY MODE',
          color: Colors.DANGER,
          sections: [
            {
              title: `${SHIELD_EMOJI} STANDBY NOTICE`,
              items: [
                'All security modules are turned off.',
                `Re-enable anytime using \`${prefix}enable all\`.`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Security Disabled'
        });

        return message.reply({ embeds: [card] });
      }

      if (toggleMod) {
        const result = toggleMod(target, false);
        if (result) {
          return message.reply({
            content: `${APPROVED_ICON} Module **${result.name}** (\`${result.id}\`) has been **disabled**.`
          });
        }
      }

      return message.reply({
        content: `${WRONG_EMOJI} Unknown target **${target}**. Valid options: \`antinuke\`, \`automod\`, \`voice\`, \`all\`.`
      });
    }
  });
}
