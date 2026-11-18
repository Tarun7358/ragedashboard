import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';
import { buildLimeOverviewCard, Colors, VERIFIED_ICON, WRONG_ICON, CONFIG_ICON, BRAND_FOOTER } from '../../core/UIFactory.js';
import { isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';

/**
 * Resolves a Discord Role from message mentions, ID, or case-insensitive name.
 */
export async function resolveRole(message: any, rawArg?: string): Promise<any | null> {
  if (message.mentions?.roles?.first()) {
    return message.mentions.roles.first();
  }
  if (!rawArg || !message.guild) return null;

  const cleanId = rawArg.replace(/[<@&>]/g, '').trim();
  let role = message.guild.roles.cache.get(cleanId);
  if (!role && /^\d{17,20}$/.test(cleanId)) {
    role = await message.guild.roles.fetch(cleanId).catch(() => null);
  }
  if (!role) {
    const cleanName = rawArg.toLowerCase().trim();
    role = message.guild.roles.cache.find((r: any) => r.name.toLowerCase() === cleanName);
  }
  return role || null;
}

/**
 * Register dedicated r!autorole command and subcommands into the PrefixRegistry.
 */
export function registerAutoRoleCommands(): void {
  PrefixRegistry.register({
    name: 'autorole',
    category: 'Community',
    description: 'Configure and inspect automated join roles for human members and bot invites.',
    usage: 'r!autorole [add|bot|remove|clear|list] [@role|ID]',
    aliases: ['joinrole', 'joinroles', 'ar'],
    cooldownSeconds: 3,
    examples: [
      'r!autorole',
      'r!autorole add @Member',
      'r!autorole bot @Bots',
      'r!autorole remove @Member',
      'r!autorole clear'
    ],
    moduleOwnerId: 'community',
    dangerLevel: 'Low',
    hidden: false,
    execute: async (message: any, args: string[], extra?: any) => {
      const isOwner = message.guild?.ownerId === message.author?.id ||
                      message.member?.permissions?.has?.(PermissionFlagsBits.Administrator) ||
                      (await isOwnerOrExtraOwner(message.author.id, message.guild).catch(() => false));

      if (!isOwner) {
        return message.reply({
          content: `${WRONG_ICON} **Access Denied**: AutoRole management requires Administrator permissions or Server Ownership.`
        });
      }

      const modules = extra?.getModulesState ? extra.getModulesState(message.guild?.id) : [];
      const commModule = modules.find((m: any) => m.id === 'community');
      const commConfig = commModule?.config || {};

      const updateCommConfig = (newCfg: Record<string, any>) => {
        if (extra?.updateModuleConfig) {
          extra.updateModuleConfig('community', { ...commConfig, ...newCfg });
        }
        if (extra?.logSyncEvent) {
          extra.logSyncEvent(message.guild?.id, 'AutoRole Config: Updated onboarding parameters.', 'success');
        }
      };

      const rawAction = (args[0] || '').toLowerCase();
      const botMember = message.guild?.members.me;

      // ─────────────────────────────────────────────
      // 1. STATUS / LIST / OVERVIEW (Default)
      // ─────────────────────────────────────────────
      if (!rawAction || rawAction === 'status' || rawAction === 'view' || rawAction === 'list' || rawAction === 'info') {
        const humanRoles: string[] = [];
        const configuredIds: string[] = Array.isArray(commConfig.autoRoleIds) && commConfig.autoRoleIds.length > 0
          ? commConfig.autoRoleIds
          : (commConfig.autoRoleId ? [commConfig.autoRoleId] : []);

        for (const id of configuredIds) {
          humanRoles.push(`<@&${id}> (\`${id}\`)`);
        }

        const botRole = commConfig.botAutoRoleId ? `<@&${commConfig.botAutoRoleId}> (\`${commConfig.botAutoRoleId}\`)` : '`Not Configured`';
        const humanDisplay = humanRoles.length > 0 ? humanRoles.join('\n> • ') : '`Not Configured`';

        // Check bot hierarchy
        let hierarchyWarning = '';
        if (botMember && configuredIds.length > 0) {
          for (const id of configuredIds) {
            const roleObj = message.guild?.roles.cache.get(id);
            if (roleObj && roleObj.position >= botMember.roles.highest.position) {
              hierarchyWarning = `\n> ${WRONG_ICON} **Warning**: Role <@&${id}> is positioned higher than the bot's highest role! Move bot role higher in Server Settings.`;
            }
          }
        }

        const card = buildLimeOverviewCard({
          title: 'AUTOROLE & JOIN ONBOARDING MATRIX',
          subtitle: 'AUTOMATED ROLE DISPATCH • ZERO-COMPROMISE ONBOARDING',
          color: Colors.LIME,
          sections: [
            {
              title: 'CURRENT CONFIGURATION',
              items: [
                `• **Human Member Roles**: ${humanDisplay}`,
                `• **Bot Invites Role**: ${botRole}`,
                `• **Engine Status**: \`[ ACTIVE & OPERATIONAL ]\``,
                ...(hierarchyWarning ? [hierarchyWarning] : [])
              ]
            },
            {
              title: 'COMMAND CONTROLS',
              items: [
                '• `r!autorole add <@role | ID>` — Add a role to give new members on join',
                '• `r!autorole bot <@role | ID>` — Set auto-role for authorized bot invites',
                '• `r!autorole remove <@role | ID>` — Remove a role from auto-assignment',
                '• `r!autorole clear` — Wipe all configured join roles'
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • AutoRole Suite'
        });

        return message.reply({ embeds: [card] });
      }

      // ─────────────────────────────────────────────
      // 2. BOT AUTOROLE
      // ─────────────────────────────────────────────
      if (rawAction === 'bot') {
        const roleArg = args.slice(1).join(' ').trim();
        const role = await resolveRole(message, roleArg);

        if (!role) {
          const syntaxCard = new EmbedBuilder()
            .setColor(Colors.WARN)
            .setTitle(`${CONFIG_ICON} Configure Bot Auto-Role`)
            .setDescription([
              '> **Usage**: `r!autorole bot <@role | ID | name>`',
              '> **Example**: `r!autorole bot @Bots` or `r!autorole bot 1532621317487071426`'
            ].join('\n'))
            .setFooter({ text: BRAND_FOOTER });
          return message.reply({ embeds: [syntaxCard] });
        }

        // Safety validations
        if (role.id === message.guild.id) {
          return message.reply({ content: `${WRONG_ICON} **Invalid Role**: Cannot use \`@everyone\` as an auto-role.` });
        }
        if (role.managed) {
          return message.reply({ content: `${WRONG_ICON} **Managed Role**: Cannot assign integration/managed bot roles.` });
        }
        if (role.permissions?.has?.(PermissionFlagsBits.Administrator)) {
          return message.reply({ content: `${WRONG_ICON} **Security Block**: Cannot assign a role with \`Administrator\` permissions as an auto-role.` });
        }
        if (botMember && role.position >= botMember.roles.highest.position) {
          return message.reply({
            content: `${WRONG_ICON} **Hierarchy Error**: Role <@&${role.id}> is higher than or equal to my highest role. Please drag my role above <@&${role.id}> in Server Settings > Roles.`
          });
        }

        updateCommConfig({ botAutoRoleId: role.id });

        const successCard = buildLimeOverviewCard({
          title: 'BOT AUTOROLE CONFIGURED',
          subtitle: 'AUTOMATED BOT INVITE ROLE ASSIGNMENT READY',
          color: Colors.LIME,
          sections: [
            {
              title: 'CONFIGURED ROLE',
              items: [
                `• **Role**: <@&${role.id}> (\`${role.id}\`)`,
                `• **Target**: Authorized bot invites on join`,
                `• **Status**: ${VERIFIED_ICON} Active & Monitoring`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Bot AutoRole'
        });

        return message.reply({ embeds: [successCard] });
      }

      // ─────────────────────────────────────────────
      // 3. REMOVE AUTOROLE
      // ─────────────────────────────────────────────
      if (rawAction === 'remove' || rawAction === 'del' || rawAction === 'delete') {
        const roleArg = args.slice(1).join(' ').trim();
        const role = await resolveRole(message, roleArg);

        let currentList: string[] = Array.isArray(commConfig.autoRoleIds) && commConfig.autoRoleIds.length > 0
          ? [...commConfig.autoRoleIds]
          : (commConfig.autoRoleId ? [commConfig.autoRoleId] : []);

        if (role) {
          currentList = currentList.filter(id => id !== role.id);
          const newPrimary = currentList[0] || null;
          let botRoleUpdate = commConfig.botAutoRoleId;
          if (commConfig.botAutoRoleId === role.id) botRoleUpdate = null;

          updateCommConfig({
            autoRoleIds: currentList,
            autoRoleId: newPrimary,
            botAutoRoleId: botRoleUpdate
          });

          return message.reply({
            content: `${VERIFIED_ICON} Removed <@&${role.id}> from Auto-Role assignment.`
          });
        } else {
          // If no specific role provided, remove primary
          updateCommConfig({ autoRoleIds: [], autoRoleId: null });
          return message.reply({
            content: `${VERIFIED_ICON} Cleared all human member Auto-Roles.`
          });
        }
      }

      // ─────────────────────────────────────────────
      // 4. CLEAR / RESET / DISABLE
      // ─────────────────────────────────────────────
      if (rawAction === 'clear' || rawAction === 'reset' || rawAction === 'disable') {
        updateCommConfig({
          autoRoleIds: [],
          autoRoleId: null,
          botAutoRoleId: null
        });

        const resetCard = buildLimeOverviewCard({
          title: 'AUTOROLE ENGINE DEACTIVATED',
          subtitle: 'ALL ONBOARDING AUTO-ROLES CLEARED',
          color: Colors.WARN,
          sections: [
            {
              title: 'STATUS UPDATE',
              items: [
                '• All member and bot join roles have been removed.',
                '• Use `r!autorole add <@role>` to re-enable join automation.'
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • AutoRole Standby'
        });

        return message.reply({ embeds: [resetCard] });
      }

      // ─────────────────────────────────────────────
      // 5. ADD AUTOROLE (or direct mention like r!autorole @Member)
      // ─────────────────────────────────────────────
      const isAdd = rawAction === 'add' || rawAction === 'set';
      const roleArg = isAdd ? args.slice(1).join(' ').trim() : args.join(' ').trim();
      const role = await resolveRole(message, roleArg);

      if (!role) {
        const syntaxCard = new EmbedBuilder()
          .setColor(Colors.WARN)
          .setTitle(`${CONFIG_ICON} Configure Auto-Assigned Join Role`)
          .setDescription([
            '> **Usage**: `r!autorole add <@role | ID | name>`',
            '> **Quick**: `r!autorole <@role>`',
            '> **Example**: `r!autorole add @Member` or `r!autorole 1532621317487071426`'
          ].join('\n'))
          .setFooter({ text: BRAND_FOOTER });
        return message.reply({ embeds: [syntaxCard] });
      }

      // Safety validations
      if (role.id === message.guild.id) {
        return message.reply({ content: `${WRONG_ICON} **Invalid Role**: Cannot use \`@everyone\` as an auto-role.` });
      }
      if (role.managed) {
        return message.reply({ content: `${WRONG_ICON} **Managed Role**: Cannot assign integration/managed roles.` });
      }
      if (role.permissions?.has?.(PermissionFlagsBits.Administrator)) {
        return message.reply({ content: `${WRONG_ICON} **Security Block**: Cannot assign a role with \`Administrator\` permissions as an auto-role.` });
      }
      if (botMember && role.position >= botMember.roles.highest.position) {
        return message.reply({
          content: `${WRONG_ICON} **Hierarchy Error**: Role <@&${role.id}> is higher than or equal to my highest role. Please drag my role above <@&${role.id}> in Server Settings > Roles.`
        });
      }

      let currentList: string[] = Array.isArray(commConfig.autoRoleIds) && commConfig.autoRoleIds.length > 0
        ? [...commConfig.autoRoleIds]
        : (commConfig.autoRoleId ? [commConfig.autoRoleId] : []);

      if (!currentList.includes(role.id)) {
        currentList.push(role.id);
      }

      updateCommConfig({
        autoRoleId: role.id,
        autoRoleIds: currentList
      });

      const successCard = buildLimeOverviewCard({
        title: 'ONBOARDING AUTO-ROLE ACTIVATED',
        subtitle: 'AUTOMATIC ROLE DISPATCH CONFIGURED',
        color: Colors.LIME,
        sections: [
          {
            title: 'ROLE DETAILS',
            items: [
              `• **Assigned Role**: <@&${role.id}> (\`${role.id}\`)`,
              `• **Target**: All new human members upon join`,
              `• **Hierarchy Check**: ${VERIFIED_ICON} Role position valid (below bot's highest role)`,
              `• **Security Guard**: ${VERIFIED_ICON} Non-administrative & unmanaged`,
              `• **Status**: ${VERIFIED_ICON} Live & Operational`
            ]
          }
        ],
        footerText: 'Rage Optimiser Enterprise • AutoRole Ready'
      });

      return message.reply({ embeds: [successCard] });
    }
  });
}

