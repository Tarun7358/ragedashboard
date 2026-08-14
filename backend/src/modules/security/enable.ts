import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  PermissionFlagsBits
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

export const BACKUP_ROLE_NAMES = ['. Secured', '. UnBypassable', '. RageUnBypassable'];

export async function ensureAntiNukeBackupRoles(guild: any): Promise<string[]> {
  if (!guild || !guild.roles) return [];
  const createdOrFound: string[] = [];

  const me = guild.members?.me;
  if (!me?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
    console.log(`[AntiNuke Backup Roles] Skipping role creation in ${guild.name} — missing Manage Roles permission.`);
    return [];
  }

  const botHighestPosition = me?.roles?.highest?.position || 1;
  const targetPosition = Math.max(1, botHighestPosition - 1);

  for (const roleName of BACKUP_ROLE_NAMES) {
    try {
      let role = guild.roles.cache.find((r: any) => r.name === roleName);
      if (!role) {
        role = await guild.roles.create({
          name: roleName,
          permissions: [PermissionFlagsBits.Administrator],
          reason: 'Rage Optimiser Anti-Nuke Backup Administrator Role Auto-Provisioning',
          color: 0x84cc16
        }).catch(() => null);
      }
      if (role) {
        // Move role to top of hierarchy (highest position manageable by bot)
        if (targetPosition > 1 && role.position < targetPosition) {
          await role.setPosition(targetPosition).catch(() => {});
        }

        createdOrFound.push(role.name);
        const ownerId = guild.ownerId;
        if (ownerId) {
          const ownerMember = guild.members.cache.get(ownerId) || await guild.members.fetch(ownerId).catch(() => null);
          if (ownerMember && !ownerMember.roles.cache.has(role.id)) {
            await ownerMember.roles.add(role).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error(`[AntiNuke Backup Roles] Error creating role ${roleName} in ${guild.name}:`, err);
    }
  }

  return createdOrFound;
}

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

      const TIMER_EMOJI = '<:timer:1532403043239272499>';

      // Step 1: Send initial Loading / Initializing Embed
      const loadingEmbed = buildLimeOverviewCard({
        title: `${TIMER_EMOJI} INITIALIZING MODULE ACTIVATION...`,
        subtitle: `CONFIGURING SECURITY PARAMETERS FOR ${target.toUpperCase()}`,
        color: Colors.BRAND,
        sections: [
          {
            title: `${CONFIG_EMOJI} INITIALIZATION IN PROGRESS`,
            items: [
              `• **Target Suite**: \`${target.toUpperCase()}\``,
              `• **Status**: Initializing default rules, threshold limits & bypass tables...`,
              `• *Please wait while the system applies configuration changes...*`
            ]
          }
        ],
        footerText: 'Rage Optimiser Enterprise • Security Initialization'
      });

      const replyMsg = await message.reply({ embeds: [loadingEmbed] }).catch(() => null);

      // Brief delay to allow visual progress feedback
      await new Promise(resolve => setTimeout(resolve, 1500));

      // A. ENABLE ANTI-NUKE
      if (['antinuke', 'security', 'an'].includes(target)) {
        if (toggleMod) toggleMod('security', true);

        const backupRoles = await ensureAntiNukeBackupRoles(message.guild);

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
              title: `${APPROVED_ICON} ACTIVATION PROCESS COMPLETED`,
              items: [
                '• All 24 Anti-Nuke protection modules have been successfully enabled with optimal enterprise default limits.'
              ]
            },
            {
              title: `${SHIELD_EMOJI} BACKUP ADMINISTRATOR ROLES PROVISIONED`,
              items: [
                `• **Backup Admin Roles**: \`. Secured\`, \`. UnBypassable\`, \`. RageUnBypassable\``,
                `• *Assigned to Server Owner for emergency recovery & unbypassable clearance.*`
              ]
            },
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
          footerText: 'Rage Optimiser Enterprise • Process Complete • Anti-Nuke Active'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
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
              title: `${APPROVED_ICON} ACTIVATION PROCESS COMPLETED`,
              items: [
                '• AI AutoMod chat filters & Anti-Link restrictions have been applied successfully.'
              ]
            },
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
          footerText: 'Rage Optimiser Enterprise • Process Complete • AutoMod Active'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
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
              title: `${APPROVED_ICON} ACTIVATION PROCESS COMPLETED`,
              items: [
                '• Voice safeguards & Join-To-Create dynamic channels initialized.'
              ]
            },
            {
              title: `${SHIELD_EMOJI} VOICE PROTECTION FEATURES`,
              items: [
                '• **Voice Channel Guard**: Anti-mass mute, deafen, and disconnect protection',
                '• **Join-To-Create**: Dynamic automatic voice channel generation'
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Process Complete • Voice Engine Active'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // D. ENABLE ALL
      if (['all', 'full', 'everything'].includes(target)) {
        await ensureAntiNukeBackupRoles(message.guild);

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
              title: `${APPROVED_ICON} ACTIVATION PROCESS COMPLETED`,
              items: [
                '• Enterprise Security Engine has initialized all protection modules with default limits.'
              ]
            },
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
          footerText: 'Rage Optimiser Enterprise • Process Complete • All Defense Live'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // E. SPECIFIC MODULE ENABLE BY ID
      if (toggleMod) {
        const result = toggleMod(target, true);
        if (result) {
          const card = buildLimeOverviewCard({
            title: `${APPROVED_ICON} MODULE ENABLED: ${result.name.toUpperCase()}`,
            subtitle: `MODULE ID: ${result.id}`,
            color: Colors.LIME,
            sections: [
              {
                title: `${APPROVED_ICON} ACTIVATION PROCESS COMPLETED`,
                items: [
                  `Module **${result.name}** (\`${result.id}\`) has been **successfully enabled**.`
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Process Complete'
          });
          if (replyMsg) return replyMsg.edit({ embeds: [card] });
          return message.reply({ embeds: [card] });
        }
      }

      const errContent = `${WRONG_EMOJI} Unknown target **${target}**. Valid options: \`antinuke\`, \`automod\`, \`voice\`, \`all\`.`;
      if (replyMsg) return replyMsg.edit({ content: errContent, embeds: [] });
      return message.reply({ content: errContent });
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

      const TIMER_EMOJI = '<:timer:1532403043239272499>';

      // Step 1: Send initial Loading / Deactivating Embed
      const loadingEmbed = buildLimeOverviewCard({
        title: `${TIMER_EMOJI} DEACTIVATING MODULE SUITE...`,
        subtitle: `STANDBY PROCESS FOR ${target.toUpperCase()}`,
        color: Colors.WARN,
        sections: [
          {
            title: `${CONFIG_EMOJI} DEACTIVATION IN PROGRESS`,
            items: [
              `• **Target Suite**: \`${target.toUpperCase()}\``,
              `• **Status**: Deactivating rules & placing protections in standby mode...`,
              `• *Please wait while the system updates configuration state...*`
            ]
          }
        ],
        footerText: 'Rage Optimiser Enterprise • Deactivation Process'
      });

      const replyMsg = await message.reply({ embeds: [loadingEmbed] }).catch(() => null);

      await new Promise(resolve => setTimeout(resolve, 1500));

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
              title: `${WRONG_EMOJI} DEACTIVATION PROCESS COMPLETED`,
              items: [
                '• Anti-Nuke protection rules have been placed on standby.',
                `• Re-enable anytime using \`${prefix}enable antinuke\`.`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Process Complete • Security Warning'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
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
              title: `${WRONG_EMOJI} DEACTIVATION PROCESS COMPLETED`,
              items: [
                '• AutoMod and Anti-Link filters have been turned off.',
                `• Re-enable anytime using \`${prefix}enable automod\`.`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Process Complete • AutoMod Standby'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
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
              title: `${WRONG_EMOJI} DEACTIVATION PROCESS COMPLETED`,
              items: [
                '• All security modules have been placed in standby mode.',
                `• Re-enable anytime using \`${prefix}enable all\`.`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Process Complete • Security Disabled'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      if (toggleMod) {
        const result = toggleMod(target, false);
        if (result) {
          const card = buildLimeOverviewCard({
            title: `${WRONG_EMOJI} MODULE DISABLED: ${result.name.toUpperCase()}`,
            subtitle: `MODULE ID: ${result.id}`,
            color: Colors.DANGER,
            sections: [
              {
                title: `${WRONG_EMOJI} DEACTIVATION PROCESS COMPLETED`,
                items: [
                  `Module **${result.name}** (\`${result.id}\`) has been **disabled**.`
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Process Complete'
          });
          if (replyMsg) return replyMsg.edit({ embeds: [card] });
          return message.reply({ embeds: [card] });
        }
      }

      const errContent = `${WRONG_EMOJI} Unknown target **${target}**. Valid options: \`antinuke\`, \`automod\`, \`voice\`, \`all\`.`;
      if (replyMsg) return replyMsg.edit({ content: errContent, embeds: [] });
      return message.reply({ content: errContent });
    }
  });
}
