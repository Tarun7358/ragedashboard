import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, Role, ButtonBuilder, ButtonStyle } from 'discord.js';
import { checkWhitelistPermission, getGuildAndCheckPermission, protections, migrateToUnifiedWhitelist, WHITELIST_MENU_OPTIONS, mapSelectedOptionsToRules, resolveSelectedOptions } from '../../utils/whitelistCheck.js';
// BUG-008 FIX: Import the canonical wrapInteraction from Gateway to eliminate the
// copy-pasted duplicate that caused double-wrapping and divergent bug-fix paths.
import { wrapInteraction } from '../../core/Gateway.js';
function resolveUserTag(user: any): string {
  if (!user) return 'Unknown User';
  const tag = user.username;
  if (tag && tag !== 'undefined' && tag !== 'null' && !tag.includes('[object Object]')) return tag;
  const username = user.username;
  if (username && username !== 'undefined' && username !== 'null' && !username.includes('[object Object]')) return username;
  return `User-${user.id || 'unknown'}`;
}

function resolveRoleName(role: any): string {
  if (!role) return 'Unknown Role';
  const name = role.name;
  if (name && name !== 'undefined' && name !== 'null' && !name.includes('[object Object]')) return name;
  return `Role-${role.id || 'unknown'}`;
}

function sanitizeWhitelistMembers(members: any[]): any[] {
  if (!Array.isArray(members)) return [];
  return members.map(m => {
    if (m === null || typeof m !== 'object') return m;
    const cleaned: any = {};
    for (const key in m) {
      if (Object.prototype.hasOwnProperty.call(m, key) && m[key] !== undefined) {
        cleaned[key] = m[key];
      }
    }
    return cleaned;
  });
}

const PUNISHMENTS = [
  { value: 'quarantine',  label: 'Quarantine',  emoji: '🔒', desc: 'Strip all roles & isolate in quarantine channel' },
  { value: 'ban',         label: 'Ban',          emoji: '🔨', desc: 'Permanently ban the violator from the server' },
  { value: 'kick',        label: 'Kick',         emoji: '👟', desc: 'Remove the violator from the server' },
  { value: 'strip_roles', label: 'Strip Roles',  emoji: '🪄', desc: 'Strip admin roles only, no further action' },
  { value: 'timeout',     label: 'Timeout',      emoji: '⏱️', desc: 'Temporary mute/timeout the violator' },
];
const P_EMOJI: Record<string, string> = { quarantine: '🔒', ban: '🔨', kick: '👟', strip_roles: '🪄', timeout: '⏱️' };

function buildPunishEmbed(guild: any, rules: Record<string, any>) {
  const midPoint = Math.ceil(protections.length / 2);
  const leftRules = protections.slice(0, midPoint);
  const rightRules = protections.slice(midPoint);

  const leftLines = leftRules.map(p => {
    const action = rules[p.key]?.action || 'quarantine';
    const on = rules[p.key]?.enabled !== false ? '🟢' : '🔴';
    return `${on} **${p.label}** — ${P_EMOJI[action] || '🔒'} \`${action.toUpperCase()}\``;
  }).join('\n');

  const rightLines = rightRules.map(p => {
    const action = rules[p.key]?.action || 'quarantine';
    const on = rules[p.key]?.enabled !== false ? '🟢' : '🔴';
    return `${on} **${p.label}** — ${P_EMOJI[action] || '🔒'} \`${action.toUpperCase()}\``;
  }).join('\n');

  return new EmbedBuilder()
    .setTitle('⚔️  Whitelist Violation Punishments')
    .setColor(0x7C5CFC)
    .setThumbnail(guild.iconURL({ size: 256 }) || null)
    .setDescription('> Configure the punishment applied to **non-whitelisted** members who trigger Anti-Nuke rules.\n> Use the menu to change a rule\'s punishment type.\n\u200b')
    .addFields(
      { name: '🛡️ Rules & Punishments (Part 1)', value: leftLines || 'No rules configured.', inline: true },
      { name: '🛡️ Rules & Punishments (Part 2)', value: rightLines || 'No rules configured.', inline: true }
    )
    .setFooter({ text: `${guild.name} • Rage Optimiser Security` })
    .setTimestamp();
}

export interface MemberWhitelistRecord {
  id: string; // userId or roleId
  userId?: string;
  roleId?: string;
  tag?: string;
  name?: string;
  type?: 'member' | 'bot' | 'role';
  status: 'active' | 'disabled';
  enabledModules: string[];
  addedBy?: string;
  createdDate: string;
  notes?: string;
}

export const MemberWhitelistManifest: ModuleManifest = {
  id: 'member_whitelist',
  name: 'Member Whitelist',
  version: '1.0.0',
  description: 'Manage trusted members who can bypass specific protection modules.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      let progress = 100;
      return { progress, errors: [] };
    }
  },
  commands: [
    {
      name: 'whitelist',
      description: 'Global Whitelist Management & Punishment Config',
      options: [
        { name: 'overview', description: 'Show whitelist overview', type: 1 },
        { name: 'activity', description: 'Show whitelist activity', type: 1 },
        { name: 'list', description: '📋 List all whitelisted members, bots, and roles', type: 1 },
        {
          name: 'add',
          description: '➕ Add a user or role to the global whitelist',
          type: 1,
          options: [
            { name: 'target', type: 9, description: 'The user or role to whitelist', required: true },
            { name: 'notes', type: 3, description: 'Optional purpose note', required: false }
          ]
        },
        {
          name: 'remove',
          description: '➖ Remove a user or role from the global whitelist',
          type: 1,
          options: [
            { name: 'target', type: 9, description: 'The user or role to remove', required: true }
          ]
        },
        {
          name: 'punishment',
          description: 'Configure punishments for non-whitelisted violators',
          type: 2,
          options: [
            { name: 'view', description: 'View all rule punishments (interactive)', type: 1 },
            {
              name: 'set',
              description: 'Set punishment for a specific protection rule',
              type: 1,
              options: [
                {
                  name: 'rule', type: 3, description: 'Protection rule to configure', required: true,
                  autocomplete: true
                },
                {
                  name: 'action', type: 3, description: 'Punishment to apply for violators', required: true,
                  choices: PUNISHMENTS.map(p => ({ name: `${p.emoji} ${p.label} — ${p.desc}`, value: p.value }))
                }
              ]
            },
            {
              name: 'set-all',
              description: 'Apply one punishment to ALL protection rules',
              type: 1,
              options: [
                {
                  name: 'action', type: 3, description: 'Global punishment action', required: true,
                  choices: PUNISHMENTS.map(p => ({ name: `${p.emoji} ${p.label} — ${p.desc}`, value: p.value }))
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  events: [
    {
      name: 'ready',
      handler: async (client: any, _ignored: any, context: any) => {
        migrateToUnifiedWhitelist(context);
      }
    },
    {
      name: 'command_whitelist',
      handler: async (client: any, interaction: any, context: any) => {
        await interaction.deferReply({ flags: 64 }).catch(() => {});
        const hasPermission = await checkWhitelistPermission(interaction.user.id, interaction.guild, context);
        if (!hasPermission) {
          const embed = new EmbedBuilder()
            .setTitle('🔒 Access Denied')
            .setColor(0xEF4444)
            .setDescription('Only the **Server Owner** and whitelisted administrators can manage Whitelist punishment settings.')
            .setTimestamp();
          return interaction.editReply({ embeds: [embed] }).catch(() => {});
        }

        const sub = interaction.options.getSubcommand(false);
        const group = interaction.options.getSubcommandGroup(false);

        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        const secConfig = secModule?.config || {};
        const rules = secConfig.rules || {};

        if (group === 'punishment') {
          if (sub === 'view') {
            const embed = buildPunishEmbed(interaction.guild, rules);
            const midPoint = Math.ceil(protections.length / 2);
            const leftProtections = protections.slice(0, midPoint);
            const rightProtections = protections.slice(midPoint);

            const selectMenu1 = new StringSelectMenuBuilder()
              .setCustomId(`wl_punish_select1_${interaction.user.id}`)
              .setPlaceholder('⚙️ Select a protection rule (Part 1)…')
              .setMinValues(1)
              .setMaxValues(1)
              .addOptions(
                leftProtections.map(p => {
                  const currentAction = rules[p.key]?.action || 'quarantine';
                  return new StringSelectMenuOptionBuilder()
                    .setLabel(p.label)
                    .setValue(p.key)
                    .setDescription(`Current Action: ${currentAction.toUpperCase()}`);
                })
              );

            const selectMenu2 = new StringSelectMenuBuilder()
              .setCustomId(`wl_punish_select2_${interaction.user.id}`)
              .setPlaceholder('⚙️ Select a protection rule (Part 2)…')
              .setMinValues(1)
              .setMaxValues(1)
              .addOptions(
                rightProtections.map(p => {
                  const currentAction = rules[p.key]?.action || 'quarantine';
                  return new StringSelectMenuOptionBuilder()
                    .setLabel(p.label)
                    .setValue(p.key)
                    .setDescription(`Current Action: ${currentAction.toUpperCase()}`);
                })
              );

            const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu1);
            const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu2);
            const reply = await interaction.editReply({
              embeds: [embed],
              components: [row1, row2]
            });

            const collector = reply.createMessageComponentCollector({
              componentType: ComponentType.StringSelect,
              filter: (idx: any) => idx.customId.startsWith('wl_punish_select1_') || idx.customId.startsWith('wl_punish_select2_'),
              time: 300000 // 5 minutes
            });

            collector.on('collect', async (rawI: any) => {
              const i = wrapInteraction(rawI);
              if (i.user.id !== interaction.user.id) {
                const embedErr = new EmbedBuilder()
                  .setTitle('❌ Interactivity Denied')
                  .setColor(0xEF4444)
                  .setDescription('Only the command executor can interact with this menu.')
                  .setTimestamp();
                return i.reply({ embeds: [embedErr], flags: 64 });
              }

              const ruleKey = i.values[0];
              const protection = protections.find(p => p.key === ruleKey)!;
              const currentAction = rules[ruleKey]?.action || 'quarantine';

              const actionMenu = new StringSelectMenuBuilder()
                .setCustomId(`wl_punish_action_${ruleKey}_${interaction.user.id}`)
                .setPlaceholder(`⚡ Select punishment for ${protection.label}…`)
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(
                  PUNISHMENTS.map(p =>
                    new StringSelectMenuOptionBuilder()
                      .setLabel(`${p.emoji} ${p.label}`)
                      .setValue(p.value)
                      .setDescription(p.desc)
                      .setDefault(p.value === currentAction)
                  )
                );

              const actionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(actionMenu);
              const detailEmbed = new EmbedBuilder()
                .setTitle(`Configure Action — ${protection.label}`)
                .setColor(0x7C5CFC)
                .setDescription(`**Current Action:** ${P_EMOJI[currentAction]} \`${currentAction.toUpperCase()}\`\n\nChoose the enforcement action that should trigger when a non-whitelisted entity performs this action.`)
                .setFooter({ text: 'Changes take effect immediately' })
                .setTimestamp();

              await i.update({ embeds: [detailEmbed], components: [actionRow] });

              // Collect the final action choice
              const actionCollector = reply.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: (idx: any) => idx.customId.startsWith(`wl_punish_action_${ruleKey}_`),
                time: 120000,
                max: 1
              });

              actionCollector.on('collect', async (rawIAction: any) => {
                const iAction = wrapInteraction(rawIAction);
                if (iAction.user.id !== interaction.user.id) {
                  const embedErr = new EmbedBuilder()
                    .setTitle('❌ Interactivity Denied')
                    .setColor(0xEF4444)
                    .setDescription('Only the command executor can interact with this menu.')
                    .setTimestamp();
                  return iAction.reply({ embeds: [embedErr], flags: 64 });
                }

                const newAction = iAction.values[0];
                const freshModules = context.getModulesState ? context.getModulesState() : [];
                const freshSec = freshModules.find((m: any) => m.id === 'security');
                const freshConfig = freshSec?.config || {};
                const freshRules = { ...(freshConfig.rules || {}) };

                freshRules[ruleKey] = { ...(freshRules[ruleKey] || {}), action: newAction };
                context.updateModuleConfig('security', { ...freshConfig, rules: freshRules });
                context.logSyncEvent(`[Whitelist Punishment] Updated ${ruleKey} action to ${newAction} via Discord.`, 'info');

                const successEmbed = new EmbedBuilder()
                  .setTitle('✅ Punishment Configured')
                  .setColor(0x10B981)
                  .setDescription(`Successfully updated violation punishment for **${protection.label}**.`)
                  .addFields(
                    { name: '🛡️ Protection Rule', value: `\`${protection.label}\``, inline: true },
                    { name: '⚡ Punishment Action', value: `${P_EMOJI[newAction]} \`${newAction.toUpperCase()}\``, inline: true }
                  )
                  .setTimestamp();

                await iAction.update({ embeds: [successEmbed], components: [] });
              });
            });
            return;
          }

          if (sub === 'set') {
            const ruleKey = interaction.options.getString('rule', true);
            const action = interaction.options.getString('action', true);
            const protection = protections.find(p => p.key === ruleKey);

            if (!protection) {
              const embedErr = new EmbedBuilder()
                .setTitle('❌ Unknown Rule')
                .setColor(0xEF4444)
                .setDescription('Unknown protection rule key.')
                .setTimestamp();
              return interaction.editReply({ embeds: [embedErr] }).catch(() => {});
            }

            const freshRules = { ...rules };
            freshRules[ruleKey] = { ...(freshRules[ruleKey] || {}), action };
            context.updateModuleConfig('security', { ...secConfig, rules: freshRules });
            context.logSyncEvent(`[Whitelist Punishment] Set ${ruleKey} punishment to ${action} via Discord.`, 'info');

            const embed = new EmbedBuilder()
              .setTitle('✅ Punishment Configured')
              .setColor(0x10B981)
              .setDescription(`Violation punishment for **${protection.label}** has been successfully updated.`)
              .addFields(
                { name: '🛡️ Protection Rule', value: `\`${protection.label}\``, inline: true },
                { name: '⚡ New Action', value: `${P_EMOJI[action]} \`${action.toUpperCase()}\``, inline: true }
              )
              .setTimestamp();

            return interaction.editReply({ embeds: [embed] }).catch(() => {});
          }

          if (sub === 'set-all') {
            const action = interaction.options.getString('action', true);
            const freshRules = { ...rules };

            for (const p of protections) {
              freshRules[p.key] = { ...(freshRules[p.key] || {}), action };
            }

            context.updateModuleConfig('security', { ...secConfig, rules: freshRules });
            context.logSyncEvent(`[Whitelist Punishment] Set ALL rule punishments to ${action} via Discord.`, 'info');

            const embed = new EmbedBuilder()
              .setTitle('✅ Global Punishment Applied')
              .setColor(0x7C5CFC)
              .setDescription(`All protection rules have been updated to trigger ${P_EMOJI[action]} \`${action.toUpperCase()}\` for non-whitelisted violators.`)
              .setTimestamp();

            return interaction.editReply({ embeds: [embed] }).catch(() => {});
          }
        }

        if (sub === 'list') {
          const mwMod = modules.find((m: any) => m.id === 'member_whitelist');
          const secMod = modules.find((m: any) => m.id === 'security');
          const vpMod = modules.find((m: any) => m.id === 'voice-protection');

          const userSet = new Map<string, string>(); // userId -> tag
          const botSet = new Map<string, string>();  // userId -> tag
          const roleSet = new Map<string, string>(); // roleId -> name

          // Helper to register user
          const registerUser = (userId: string, tag?: string) => {
            if (!userId || userId === 'undefined' || userId === 'null') return;
            const existing = userSet.get(userId);
            const cleanTag = (tag && tag !== 'undefined' && tag !== 'null' && !tag.includes('[object Object]')) ? tag : `User-${userId}`;
            if (!existing || existing.startsWith('User-')) {
              userSet.set(userId, cleanTag);
            }
          };

          // Helper to register bot
          const registerBot = (userId: string, tag?: string) => {
            if (!userId || userId === 'undefined' || userId === 'null') return;
            const existing = botSet.get(userId);
            const cleanTag = (tag && tag !== 'undefined' && tag !== 'null' && !tag.includes('[object Object]')) ? tag : `Bot-${userId}`;
            if (!existing || existing.startsWith('Bot-')) {
              botSet.set(userId, cleanTag);
            }
          };

          // Helper to register role
          const registerRole = (roleId: string, name?: string) => {
            if (!roleId || roleId === 'undefined' || roleId === 'null') return;
            const existing = roleSet.get(roleId);
            const cleanName = (name && name !== 'undefined' && name !== 'null' && !name.includes('[object Object]')) ? name : `Role-${roleId}`;
            if (!existing || existing.startsWith('Role-')) {
              roleSet.set(roleId, cleanName);
            }
          };

          // Process unified member_whitelist config
          const mwMembers = mwMod?.config?.members || [];
          for (const entry of mwMembers) {
            if (entry && entry.status === 'active') {
              if (entry.type === 'bot') {
                registerBot(entry.userId, entry.username);
              } else if (entry.type === 'role') {
                registerRole(entry.roleId || entry.id, entry.name);
              } else {
                registerUser(entry.userId || entry.id, entry.username);
              }
            }
          }

          // Process security whitelist
          const secConfig = secMod?.config || {};
          const secWhitelist = secConfig.whitelist || [];
          for (const w of secWhitelist) {
            if (w) {
              const uId = typeof w === 'string' ? w : w.targetId;
              const tag = typeof w === 'string' ? undefined : w.username;
              registerUser(uId, tag);
            }
          }

          // Process security exception roles
          const exceptionRoleIds: string[] = secConfig.exceptionRoleIds || secConfig.whitelistRoles || [];
          for (const rId of exceptionRoleIds) {
            registerRole(rId);
          }

          // Process UPM users & roles
          const upm = secConfig.upm || {};
          const upmUsers = upm.whitelistUsers || [];
          for (const uId of upmUsers) {
            registerUser(uId);
          }
          const upmRoles = upm.whitelistRoles || [];
          for (const rId of upmRoles) {
            registerRole(rId);
          }

          // Process voice protection
          const vpConfig = vpMod?.config || {};
          const vpUsers = vpConfig.whitelistedUsers || [];
          for (const uId of vpUsers) {
            registerUser(uId);
          }
          const vpRoles = vpConfig.whitelistedRoles || [];
          for (const rId of vpRoles) {
            registerRole(rId);
          }

          // Render names safely
          const memberLinesArr: string[] = [];
          for (const [uId, tag] of userSet.entries()) {
            const cached = interaction.guild.members.cache.get(uId);
            const nameStr = cached ? `@${cached.user.username}` : (tag && tag !== 'undefined' && tag !== 'null' && !tag.includes('[object Object]') ? tag : `User-${uId}`);
            memberLinesArr.push(`<@${uId}> (\`${nameStr}\`)`);
          }

          const botLinesArr: string[] = [];
          for (const [uId, tag] of botSet.entries()) {
            const cached = interaction.guild.members.cache.get(uId);
            const nameStr = cached ? `@${cached.user.username}` : (tag && tag !== 'undefined' && tag !== 'null' && !tag.includes('[object Object]') ? tag : `Bot-${uId}`);
            botLinesArr.push(`<@${uId}> (\`${nameStr}\`)`);
          }

          const roleLinesArr: string[] = [];
          for (const [rId, name] of roleSet.entries()) {
            const cached = interaction.guild.roles.cache.get(rId);
            const nameStr = cached ? cached.name : (name && name !== 'undefined' && name !== 'null' && !name.includes('[object Object]') ? name : `Role-${rId}`);
            roleLinesArr.push(`<@&${rId}> (\`${nameStr}\`)`);
          }

          const memberLines = memberLinesArr.join('\n') || '*None*';
          const botLines = botLinesArr.join('\n') || '*None*';
          const roleLines = roleLinesArr.join('\n') || '*None*';

          const embed = new EmbedBuilder()
            .setTitle('🛡️ Server Global Whitelist')
            .setDescription('These users, bots, and roles bypass all protection and security modules.')
            .setColor(0x7C5CFC)
            .addFields(
              { name: `👥 Whitelisted Members (${userSet.size})`, value: memberLines, inline: false },
              { name: `🤖 Whitelisted Bots (${botSet.size})`, value: botLines, inline: false },
              { name: `🎖️ Whitelisted Roles (${roleSet.size})`, value: roleLines, inline: false }
            )
            .setFooter({ text: `${interaction.guild.name} • Rage Optimiser` })
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] }).catch(() => {});
        }

        if (sub === 'add') {
          const target = interaction.options.getMentionable('target', true);
          const notes = interaction.options.getString('notes') || '';

          const mwModule = modules.find((m: any) => m && m.id === 'member_whitelist');
          let members = [...(mwModule?.config?.members || [])].filter(Boolean);
          const allBypasses = [...protections.map(p => p.key), 'voice_protection'];

          let tagOrName = '';
          let type: 'member' | 'bot' | 'role' = 'member';
          let isAlready = false;

          const isRole = target instanceof Role || (target && (target.constructor?.name === 'Role' || (typeof target === 'object' && 'name' in target && !('user' in target) && !('username' in target))));

          if (isRole) {
            type = 'role';
            tagOrName = resolveRoleName(target);
            isAlready = members.some((e: any) => target.id && e.type === 'role' && (e.roleId === target.id || e.id === target.id));
            if (!isAlready) {
              members.push({
                id: target.id,
                roleId: target.id,
                name: tagOrName,
                status: 'active',
                type: 'role',
                enabledModules: allBypasses,
                notes,
                createdDate: new Date().toISOString()
              });

            }
          } else {
            const user = target.user || target;
            type = user.bot ? 'bot' : 'member';
            tagOrName = resolveUserTag(user);
            isAlready = members.some((e: any) => user.id && e.type !== 'role' && (e.userId === user.id || e.id === user.id));
            if (!isAlready) {
              members.push({
                id: user.id,
                userId: user.id,
                tag: tagOrName,
                status: 'active',
                type,
                enabledModules: allBypasses,
                notes,
                createdDate: new Date().toISOString()
              });

              if (type !== 'bot') {
                // Downward Sync: security config update
                const secModule = modules.find((m: any) => m && m.id === 'security');
                if (secModule) {
                  const secWhitelist = [...(secModule.config?.whitelist || [])].filter(Boolean);
                  const isPresent = secWhitelist.some((w: any) => {
                    if (!w) return false;
                    const id = typeof w === 'string' ? w : w.targetId;
                    return id === user.id;
                  });
                  if (!isPresent) {
                    secWhitelist.push({
                      targetId: user.id,
                      tag: tagOrName,
                      addedAt: new Date().toISOString()
                    });
                    context.updateModuleConfig('security', { ...secModule.config, whitelist: secWhitelist });
                  }
                }
              }
            }
          }

          if (isAlready) {
            const embedErr = new EmbedBuilder()
              .setTitle('❌ Already Whitelisted')
              .setColor(0xEF4444)
              .setDescription(`**${tagOrName}** is already present in the global whitelist.`)
              .setTimestamp();
            return interaction.editReply({ embeds: [embedErr] }).catch(() => {});
          }

          const sanitizedMembers = sanitizeWhitelistMembers(members);
          context.updateModuleConfig('member_whitelist', { members: sanitizedMembers });
          context.logSyncEvent(`[Global Whitelist] Added ${type} ${tagOrName} via unified command.`, 'success');

          const targetId = target.id;
          const buildEmbed = (currentBypasses: string[]) => {
            const lines = protections.map(p => {
              const active = currentBypasses.includes(p.key);
              return `${active ? '✅' : '❌'} : **${p.label}**`;
            }).join('\n');

            return new EmbedBuilder()
              .setTitle(`Whitelist Configuration for ${interaction.guild.name}`)
              .setThumbnail(interaction.guild.iconURL({ size: 256 }) || null)
              .setColor(0x7C5CFC)
              .setDescription(lines)
              .addFields(
                { name: 'Target', value: isRole ? `<@&${targetId}>` : `<@${targetId}>`, inline: true },
                { name: 'Notes', value: notes || '*None provided*', inline: true }
              )
              .setFooter({ text: 'Powered by Rage Optimiser Security' })
              .setTimestamp();
          };

          const buildComponents = (currentBypasses: string[]) => {
            const selectedVals = resolveSelectedOptions(currentBypasses);

            const selectMenu = new StringSelectMenuBuilder()
              .setCustomId(`wl_config_select_${targetId}_${interaction.user.id}`)
              .setPlaceholder('⚙️ Choose Permissions to Grant')
              .setMinValues(0)
              .setMaxValues(WHITELIST_MENU_OPTIONS.length)
              .addOptions(
                WHITELIST_MENU_OPTIONS.map(opt => {
                  const option = new StringSelectMenuOptionBuilder()
                    .setLabel(opt.label)
                    .setValue(opt.value)
                    .setDescription(opt.desc);
                  if (selectedVals.includes(opt.value)) {
                    option.setDefault(true);
                  }
                  return option;
                })
              );

            const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

            const allKeys = [...protections.map(p => p.key), 'voice_protection'];
            const hasAll = allKeys.every(k => currentBypasses.includes(k));

            const button = new ButtonBuilder()
              .setCustomId(`wl_config_btn_${targetId}_${interaction.user.id}`)
              .setLabel(hasAll ? 'Revoke All Permissions' : 'Grant All Permissions')
              .setStyle(hasAll ? ButtonStyle.Danger : ButtonStyle.Success);

            const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

            return [selectRow, buttonRow];
          };

          const reply = await interaction.editReply({
            embeds: [buildEmbed(allBypasses)],
            components: buildComponents(allBypasses)
          });

          const collector = reply.createMessageComponentCollector({
            time: 600000 // 10 minutes
          });

          collector.on('collect', async (rawI: any) => {
            const i = wrapInteraction(rawI);
            if (i.user.id !== interaction.user.id) {
              const embedErr = new EmbedBuilder()
                .setTitle('❌ Interactivity Denied')
                .setColor(0xEF4444)
                .setDescription('Only the command executor can interact with this configuration.')
                .setTimestamp();
              return i.reply({ embeds: [embedErr], flags: 64 });
            }

            // Fetch fresh configuration state
            const freshModules = context.getModulesState ? context.getModulesState() : [];
            const freshMw = freshModules.find((m: any) => m.id === 'member_whitelist');
            let freshMembers = [...(freshMw?.config?.members || [])].filter(Boolean);

            let currentRecord = freshMembers.find((m: any) => m.id === targetId);
            if (!currentRecord) {
              return i.reply({ content: '❌ Whitelist record not found.', flags: 64 });
            }

            let newBypasses = [...currentRecord.enabledModules];

            if (i.isStringSelectMenu()) {
              const selectedVals = i.values || [];
              newBypasses = mapSelectedOptionsToRules(selectedVals);
            } else if (i.isButton()) {
              const allKeys = [...protections.map(p => p.key), 'voice_protection'];
              const hasAll = allKeys.every(k => newBypasses.includes(k));
              if (hasAll) {
                newBypasses = [];
              } else {
                newBypasses = allKeys;
              }
            }

            // Update member_whitelist record
            currentRecord.enabledModules = newBypasses;
            freshMembers = freshMembers.map((m: any) => m.id === targetId ? currentRecord : m);
            context.updateModuleConfig('member_whitelist', { members: sanitizeWhitelistMembers(freshMembers) });



            context.logSyncEvent(`[Global Whitelist] Updated permissions for ${type} ${tagOrName} via Discord UI.`, 'success');

            await i.update({
              embeds: [buildEmbed(newBypasses)],
              components: buildComponents(newBypasses)
            });
          });
        }

        if (sub === 'remove') {
          const target = interaction.options.getMentionable('target', true);

          const mwModule = modules.find((m: any) => m && m.id === 'member_whitelist');
          let members = [...(mwModule?.config?.members || [])].filter(Boolean);

          const isRole = target instanceof Role || (target && (target.constructor?.name === 'Role' || (typeof target === 'object' && 'name' in target && !('user' in target) && !('username' in target))));
          let found = false;
          let tagOrName = '';

          if (isRole) {
            tagOrName = resolveRoleName(target);
            const roleRecord = members.find((e: any) => e && target.id && e.type === 'role' && (e.roleId === target.id || e.id === target.id));
            if (roleRecord) {
              found = true;
              members = members.filter((e: any) => e && !(target.id && e.type === 'role' && (e.roleId === target.id || e.id === target.id)));

            }
          } else {
            const user = target.user || target;
            tagOrName = resolveUserTag(user);
            const userRecord = members.find((e: any) => e && user.id && e.type !== 'role' && (e.userId === user.id || e.id === user.id));
            if (userRecord) {
              found = true;
              members = members.filter((e: any) => e && !(user.id && e.type !== 'role' && (e.userId === user.id || e.id === user.id)));

              if (userRecord.type !== 'bot' && !user.bot) {
                // Downward Sync: remove from security whitelist
                const secModule = modules.find((m: any) => m && m.id === 'security');
                if (secModule) {
                  const secWhitelist = (secModule.config?.whitelist || []).filter(Boolean).filter((w: any) => {
                    if (!w) return false;
                    const id = typeof w === 'string' ? w : w.targetId;
                    return id !== user.id;
                  });
                  context.updateModuleConfig('security', { ...secModule.config, whitelist: secWhitelist });
                }
              }
            }
          }

          if (!found) {
            const embedErr = new EmbedBuilder()
              .setTitle('❌ Not Whitelisted')
              .setColor(0xEF4444)
              .setDescription(`**${tagOrName}** was not found in the global whitelist.`)
              .setTimestamp();
            return interaction.editReply({ embeds: [embedErr] }).catch(() => {});
          }

          const sanitizedMembers = sanitizeWhitelistMembers(members);
          context.updateModuleConfig('member_whitelist', { members: sanitizedMembers });
          context.logSyncEvent(`[Global Whitelist] Removed ${tagOrName} via unified command.`, 'info');

          const embedSuccess = new EmbedBuilder()
            .setTitle('🗑️ Removed from Whitelist')
            .setColor(0x7C5CFC)
            .setDescription(`Successfully removed **${tagOrName}** from the global whitelist.`)
            .setTimestamp();
          return interaction.editReply({ embeds: [embedSuccess] }).catch(() => {});
        }


        if (sub === 'activity') {
          const reg = context.getRegistry ? context.getRegistry() : null;
          const activity = reg && reg.whitelistActivity ? reg.whitelistActivity : [];
          const lines = activity.slice(0, 10).map((a: any) => {
            const time = a.timestamp ? `<t:${Math.floor(a.timestamp / 1000)}:R>` : '';
            return `• **${a.actor}** ${a.action} \`${a.target}\` (${a.type}) ${time}`;
          }).join('\n');

          const embed = new EmbedBuilder()
            .setTitle('📋 Whitelist Audit Timeline')
            .setColor(0x7C5CFC)
            .setDescription(lines || '*No recent whitelist activity logged.*')
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] }).catch(() => {});
        }

        const mwMod = modules.find((m: any) => m.id === 'member_whitelist');
        const mwMembers = mwMod?.config?.members || [];

        const memberCount = mwMembers.filter((m: any) => !m.type || m.type === 'member').length;
        const botCount = mwMembers.filter((m: any) => m.type === 'bot').length;
        const roleCount = mwMembers.filter((m: any) => m.type === 'role').length;

        const embed = new EmbedBuilder()
          .setTitle('🛡️ Whitelist System Hub')
          .setColor(0x7C5CFC)
          .setThumbnail(interaction.guild.iconURL({ size: 256 }) || null)
          .setDescription('Central control panel for member, bot, and role whitelists.')
          .addFields(
            { name: '👥 Whitelisted Members', value: `\`${memberCount}\` entries`, inline: true },
            { name: '🤖 Whitelisted Bots', value: `\`${botCount}\` entries`, inline: true },
            { name: '🎖️ Whitelisted Roles', value: `\`${roleCount}\` entries`, inline: true }
          )
          .setFooter({ text: 'Use /whitelist punishment view to customize violation punishments' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] }).catch(() => {});
      }
    }
  ],
  routes: [
    {
      path: '/state',
      method: 'get',
      handler: async (req: any, res: any, context: any) => {
        const modules = context.getModulesState();
        const mod = modules.find((m: any) => m.id === 'member_whitelist');
        res.json({ members: mod?.config?.members || [] });
      }
    },
    {
      path: '/action',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        if (!req.user) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        const hasPermission = await getGuildAndCheckPermission(req.user, context);
        if (!hasPermission) {
          return res.status(403).json({ success: false, error: 'Access Denied: Only the Owner and whitelisted users can manage the whitelist.' });
        }

        const { action, payload } = req.body;
        const modules = context.getModulesState();
        const mod = modules.find((m: any) => m.id === 'member_whitelist');
        let members = mod?.config?.members || [];

        const actor = req.user?.username || 'admin';
        const actorId = req.user?.id || '111';
        const logId = Math.random().toString(36).substring(2, 11);

        if (action === 'add') {
          // If no enabledModules provided (e.g. from web UI), default to all
          if (!payload.enabledModules || payload.enabledModules.length === 0) {
            payload.enabledModules = protections.map(p => p.key);
          }
          members.push(payload);
          context.logSyncEvent(`[Member Whitelist] Added ${payload.type || 'member'} ${payload.username || payload.name}.`, 'success');

          // Downward propagation
          if (payload.type !== 'role' && payload.type !== 'bot') {
            const secModule = modules.find((m: any) => m.id === 'security');
            if (secModule) {
              const secWhitelist = [...(secModule.config?.whitelist || [])];
              const isPresent = secWhitelist.some((w: any) => {
                const id = typeof w === 'string' ? w : w?.targetId;
                return id === payload.userId;
              });
              if (!isPresent) {
                secWhitelist.push({
                  targetId: payload.userId,
                  tag: payload.username || `User-${payload.userId}`,
                  addedAt: payload.createdDate || new Date().toISOString()
                });
                context.updateModuleConfig('security', { ...secModule.config, whitelist: secWhitelist });
              }
            }
          }

          context.registry.logWhitelistAudit(context.guildId, {
            id: logId,
            actor,
            actorId,
            action: `Added ${payload.type || 'member'} ${payload.username || payload.name} to whitelist`,
            category: payload.type || 'member',
            targetBefore: null,
            targetAfter: payload,
            timestamp: Date.now()
          });
          context.registry.logWhitelistActivity(context.guildId, {
            id: logId,
            type: payload.type || 'member',
            action: 'added',
            target: payload.username || payload.name,
            targetId: payload.userId || payload.roleId,
            actor,
            timestamp: Date.now()
          });
        } else if (action === 'remove') {
          const targetKey = payload.userId || payload.roleId || payload.id;
          const targetType = payload.type || 'member';
          if (!targetKey) {
            return res.status(400).json({ success: false, error: 'Missing target identifier' });
          }

          const targetMember = members.find((m: MemberWhitelistRecord) =>
            targetType === 'role'
              ? (m.type === 'role' && (m.roleId === targetKey || m.id === targetKey))
              : (m.type !== 'role' && (m.userId === targetKey || m.id === targetKey))
          );

          members = members.filter((m: MemberWhitelistRecord) => {
            if (targetType === 'role') {
              return !(m.type === 'role' && (m.roleId === targetKey || m.id === targetKey));
            } else {
              return !(m.type !== 'role' && (m.userId === targetKey || m.id === targetKey));
            }
          });

          context.logSyncEvent(`[Member Whitelist] Removed entry ${targetKey}.`, 'info');

          if (targetMember) {
            if (targetMember.type !== 'role' && targetMember.type !== 'bot') {
              const secModule = modules.find((m: any) => m.id === 'security');
              if (secModule) {
                const secWhitelist = (secModule.config?.whitelist || []).filter((w: any) => {
                  const id = typeof w === 'string' ? w : w?.targetId;
                  return id !== targetMember.userId;
                });
                context.updateModuleConfig('security', { ...secModule.config, whitelist: secWhitelist });
              }
            }
          }

          context.registry.logWhitelistAudit(context.guildId, {
            id: logId,
            actor,
            actorId,
            action: `Removed ${targetMember?.type || 'entry'} ${targetMember?.tag || targetMember?.name || targetKey} from whitelist`,
            category: targetMember?.type || 'member',
            targetBefore: targetMember || null,
            targetAfter: null,
            timestamp: Date.now()
          });
          context.registry.logWhitelistActivity(context.guildId, {
            id: logId,
            type: targetMember?.type || 'member',
            action: 'removed',
            target: targetMember?.tag || targetMember?.name || targetKey,
            targetId: targetKey,
            actor,
            timestamp: Date.now()
          });
        } else if (action === 'edit') {
          const targetKey = payload.userId || payload.roleId || payload.id;
          const targetType = payload.type || 'member';
          if (!targetKey) {
            return res.status(400).json({ success: false, error: 'Missing target identifier' });
          }

          const oldMember = members.find((m: MemberWhitelistRecord) =>
            targetType === 'role'
              ? (m.type === 'role' && (m.roleId === targetKey || m.id === targetKey))
              : (m.type !== 'role' && (m.userId === targetKey || m.id === targetKey))
          );

          members = members.map((m: MemberWhitelistRecord) => {
            const matches = targetType === 'role'
              ? (m.type === 'role' && (m.roleId === targetKey || m.id === targetKey))
              : (m.type !== 'role' && (m.userId === targetKey || m.id === targetKey));
            return matches ? { ...m, ...payload } : m;
          });

          context.logSyncEvent(`[Member Whitelist] Updated configuration for ${targetKey}.`, 'info');

          if (oldMember) {
            // No downward sync needed
          }

          context.registry.logWhitelistAudit(context.guildId, {
            id: logId,
            actor,
            actorId,
            action: `Modified whitelisted ${oldMember?.type || 'entry'} ${payload.username || payload.name || oldMember?.tag || oldMember?.name || targetKey}`,
            category: oldMember?.type || 'member',
            targetBefore: oldMember || null,
            targetAfter: { ...oldMember, ...payload },
            timestamp: Date.now()
          });
          context.registry.logWhitelistActivity(context.guildId, {
            id: logId,
            type: oldMember?.type || 'member',
            action: 'modified',
            target: payload.username || payload.name || oldMember?.tag || oldMember?.name || targetKey,
            targetId: targetKey,
            actor,
            timestamp: Date.now()
          });
        }

        const sanitizedMembers = sanitizeWhitelistMembers(members);
        context.updateModuleConfig('member_whitelist', { members: sanitizedMembers });
        res.json({ success: true, members: sanitizedMembers });
      }
    }
  ]
};
