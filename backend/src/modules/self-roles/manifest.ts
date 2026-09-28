import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import {
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ButtonBuilder, ButtonStyle, MessageFlags, ComponentType, PermissionFlagsBits, EmbedBuilder
} from 'discord.js';
import {
  Colors, Embeds, buildLimeOverviewCard, createLimeEmbed,
  VERIFIED_ICON, WRONG_ICON, SHIELD_ICON, MEMBER_ICON, CONFIG_ICON, VIP_ICON, TIMER_ICON
} from '../../core/UIFactory.js';
import { isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';

export interface ISelfRoleOption {
  roleId: string;
  label: string;
  description?: string;
  emoji?: string;
}

export interface ISelfRoleMenu {
  id: string;
  guildId: string;
  name: string;
  channelId: string;
  messageId?: string;
  title: string;
  description?: string;
  placeholder?: string;
  type: 'select' | 'buttons';
  mode: 'single' | 'multi'; // single = mutually exclusive, multi = toggle any
  options: ISelfRoleOption[];
  createdAt: number;
}

export const SelfRolesManifest: ModuleManifest = {
  id: 'self-roles',
  name: 'Self Roles Manager',
  version: '1.0.0',
  description: 'Enterprise Self-Assignable Role Menus (Interactive Select Menus, Buttons, Direct r!iam commands)',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      return { progress: 100, errors: [] };
    }
  },
  commands: [
    {
      name: 'selfroles',
      description: 'Manage interactive self-assignable role panels',
      options: [
        {
          name: 'create',
          description: 'Create a new self-role panel menu',
          type: 1,
          options: [
            { name: 'name', type: 3, description: 'Unique internal menu name', required: true },
            { name: 'title', type: 3, description: 'Panel Title', required: true },
            { name: 'channel', type: 7, description: 'Target channel', required: false, channel_types: [0, 5] },
            { name: 'mode', type: 3, description: 'Single-select or Multi-select', required: false, choices: [{ name: 'Multi (Toggle multiple)', value: 'multi' }, { name: 'Single (Choose 1)', value: 'single' }] },
            { name: 'type', type: 3, description: 'Display format', required: false, choices: [{ name: 'Dropdown Menu', value: 'select' }, { name: 'Buttons', value: 'buttons' }] }
          ]
        },
        {
          name: 'addrole',
          description: 'Add a role to a self-role menu',
          type: 1,
          options: [
            { name: 'menu', type: 3, description: 'Menu name', required: true },
            { name: 'role', type: 8, description: 'Role to assign', required: true },
            { name: 'label', type: 3, description: 'Display name in menu', required: false },
            { name: 'emoji', type: 3, description: 'Emoji icon', required: false },
            { name: 'description', type: 3, description: 'Option description', required: false }
          ]
        },
        {
          name: 'removerole',
          description: 'Remove a role from a self-role menu',
          type: 1,
          options: [
            { name: 'menu', type: 3, description: 'Menu name', required: true },
            { name: 'role', type: 8, description: 'Role to remove', required: true }
          ]
        },
        {
          name: 'send',
          description: 'Send/Publish the self-role panel to a channel',
          type: 1,
          options: [
            { name: 'menu', type: 3, description: 'Menu name', required: true },
            { name: 'channel', type: 7, description: 'Target channel', required: false, channel_types: [0, 5] }
          ]
        },
        {
          name: 'list',
          description: 'List all configured self-role menus',
          type: 1
        },
        {
          name: 'delete',
          description: 'Delete a self-role menu',
          type: 1,
          options: [{ name: 'menu', type: 3, description: 'Menu name', required: true }]
        }
      ]
    },
    {
      name: 'iam',
      description: 'Self-assign an allowed self-role',
      options: [{ name: 'role', type: 8, description: 'Role to gain', required: true }]
    },
    {
      name: 'iamnot',
      description: 'Remove a self-assigned role from yourself',
      options: [{ name: 'role', type: 8, description: 'Role to remove', required: true }]
    }
  ],
  events: [
    {
      name: 'command_selfroles',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        if (!guild) {
          return interaction.reply({ content: `${WRONG_ICON} Self-roles can only be managed inside a server.`, flags: 64 });
        }

        const cmdName = interaction.commandName?.toLowerCase() || interaction.parsed?.commandName?.toLowerCase() || 'selfroles';
        const sub = interaction.options?.getSubcommand?.(false) || interaction.parsed?.args?.[0]?.toLowerCase();

        const modules = context.getModulesState ? context.getModulesState(guild.id) : [];
        const srMod = modules.find((m: any) => m.id === 'self-roles');
        let menus: ISelfRoleMenu[] = srMod?.config?.menus || [];
        const saveMenus = (updated: ISelfRoleMenu[]) => context.updateModuleConfig('self-roles', { menus: updated });

        // Direct IAM / IAMNOT handlers
        if (cmdName === 'iam' || cmdName === 'iamnot') {
          const roleArg = interaction.options?.getRole('role') || interaction.parsed?.args?.[0];
          let targetRole: any = null;
          if (roleArg?.id) targetRole = roleArg;
          else if (typeof roleArg === 'string') {
            const cleanId = roleArg.replace(/[<@&>]/g, '');
            targetRole = guild.roles.cache.get(cleanId) || guild.roles.cache.find((r: any) => r.name.toLowerCase() === roleArg.toLowerCase());
          }

          if (!targetRole) {
            return interaction.reply({ content: `${WRONG_ICON} Could not resolve role. Please mention or specify a valid role name.`, flags: 64 });
          }

          // Check if role is in any configured menu
          const isAllowed = menus.some(m => m.options.some(o => o.roleId === targetRole.id));
          if (!isAllowed) {
            return interaction.reply({ content: `${WRONG_ICON} **${targetRole.name}** is not configured as a self-assignable role in this server.`, flags: 64 });
          }

          const member = await guild.members.fetch(interaction.user.id).catch(() => null);
          if (!member) return interaction.reply({ content: `${WRONG_ICON} Member context unavailable.`, flags: 64 });

          const hasRole = member.roles.cache.has(targetRole.id);

          if (cmdName === 'iam') {
            if (hasRole) {
              return interaction.reply({ content: `<a:lovemail:1527647157371535420> You already have the **${targetRole.name}** role.`, flags: 64 });
            }
            await member.roles.add(targetRole.id, 'Self-roles: r!iam command').catch(() => null);
            return interaction.reply({ content: `${VERIFIED_ICON} Added role **${targetRole.name}** to your profile!`, flags: 64 });
          } else {
            if (!hasRole) {
              return interaction.reply({ content: `${WRONG_ICON} You do not have the **${targetRole.name}** role.`, flags: 64 });
            }
            await member.roles.remove(targetRole.id, 'Self-roles: r!iamnot command').catch(() => null);
            return interaction.reply({ content: `${VERIFIED_ICON} Removed role **${targetRole.name}** from your profile!`, flags: 64 });
          }
        }

        // Administrative commands check
        if (!await isOwnerOrExtraOwner(interaction.user.id, guild)) {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: `${WRONG_ICON} Administrator permissions required to manage self-role menus.`, flags: 64 });
          }
        }

        // --- CREATE MENU ---
        if (sub === 'create') {
          const name = (interaction.options?.getString('name') || interaction.parsed?.args?.[1])?.toLowerCase();
          const title = interaction.options?.getString('title') || interaction.parsed?.args?.slice(2).join(' ') || 'Self-Assignable Roles';
          const mode = interaction.options?.getString('mode') || 'multi';
          const type = interaction.options?.getString('type') || 'select';

          if (!name) {
            return interaction.reply({ content: `${WRONG_ICON} Syntax: \`r!selfroles create <name> <title>\``, flags: 64 });
          }

          if (menus.some(m => m.name === name)) {
            return interaction.reply({ content: `${WRONG_ICON} Menu \`${name}\` already exists. Choose a different name or edit the existing menu.`, flags: 64 });
          }

          const newMenu: ISelfRoleMenu = {
            id: `smenu_${Date.now()}`,
            guildId: guild.id,
            name,
            title,
            channelId: interaction.channelId,
            type: type as any,
            mode: mode as any,
            placeholder: 'Select your roles...',
            options: [],
            createdAt: Date.now()
          };

          menus.push(newMenu);
          saveMenus(menus);

          return interaction.reply({
            embeds: [
              createLimeEmbed({
                title: `${CONFIG_ICON} SELF ROLE MENU CREATED`,
                description: `Created menu **${name}**!\n\n> **Title**: ${title}\n> **Type**: ${type}\n> **Mode**: ${mode}\n\nNext step: Add roles with \`r!selfroles addrole ${name} @Role [emoji] [label]\``,
                color: Colors.BRAND
              })
            ],
            flags: 64
          });
        }

        // --- ADD ROLE TO MENU ---
        if (sub === 'addrole') {
          const menuName = (interaction.options?.getString('menu') || interaction.parsed?.args?.[1])?.toLowerCase();
          const roleArg = interaction.options?.getRole('role') || interaction.parsed?.args?.[2];
          const labelInput = interaction.options?.getString('label') || interaction.parsed?.args?.[4];
          const emojiInput = interaction.options?.getString('emoji') || interaction.parsed?.args?.[3];

          if (!menuName || !roleArg) {
            return interaction.reply({ content: `${WRONG_ICON} Syntax: \`r!selfroles addrole <menu_name> <@role> [emoji] [label]\``, flags: 64 });
          }

          const menu = menus.find(m => m.name === menuName);
          if (!menu) {
            return interaction.reply({ content: `${WRONG_ICON} Menu \`${menuName}\` not found. List active menus with \`r!selfroles list\`.`, flags: 64 });
          }

          let roleObj: any = null;
          if (roleArg?.id) roleObj = roleArg;
          else if (typeof roleArg === 'string') {
            const cleanId = roleArg.replace(/[<@&>]/g, '');
            roleObj = guild.roles.cache.get(cleanId) || guild.roles.cache.find((r: any) => r.name.toLowerCase() === roleArg.toLowerCase());
          }

          if (!roleObj) {
            return interaction.reply({ content: `${WRONG_ICON} Could not resolve role.`, flags: 64 });
          }

          if (menu.options.some(o => o.roleId === roleObj.id)) {
            return interaction.reply({ content: `${WRONG_ICON} Role **${roleObj.name}** is already in menu \`${menuName}\`.`, flags: 64 });
          }

          menu.options.push({
            roleId: roleObj.id,
            label: labelInput || roleObj.name,
            emoji: emojiInput || undefined
          });

          saveMenus(menus);

          return interaction.reply({
            embeds: [
              createLimeEmbed({
                title: `${VERIFIED_ICON} ROLE ADDED TO MENU`,
                description: `Added **${roleObj.name}** to menu \`${menuName}\`! (Total options: ${menu.options.length})\nPublish panel with \`r!selfroles send ${menuName}\`.`,
                color: Colors.BRAND
              })
            ],
            flags: 64
          });
        }

        // --- PUBLISH / SEND MENU ---
        if (sub === 'send' || sub === 'publish') {
          const menuName = (interaction.options?.getString('menu') || interaction.parsed?.args?.[1])?.toLowerCase();
          const targetChan = interaction.options?.getChannel('channel') || interaction.channel;

          if (!menuName) {
            return interaction.reply({ content: `${WRONG_ICON} Syntax: \`r!selfroles send <menu_name> [#channel]\``, flags: 64 });
          }

          const menu = menus.find(m => m.name === menuName);
          if (!menu) {
            return interaction.reply({ content: `${WRONG_ICON} Menu \`${menuName}\` not found.`, flags: 64 });
          }

          if (menu.options.length === 0) {
            return interaction.reply({ content: `${WRONG_ICON} Cannot send menu \`${menuName}\` because it has 0 roles configured. Add roles first using \`r!selfroles addrole ${menuName} @Role\`.`, flags: 64 });
          }

          const cardEmbed = buildLimeOverviewCard({
            title: `${VIP_ICON} ${menu.title.toUpperCase()}`,
            subtitle: `${menu.mode === 'single' ? 'SELECT 1 ROLE' : 'TOGGLE ROLES BELOW'}`,
            color: Colors.BRAND,
            sections: [
              {
                title: `${MEMBER_ICON} AVAILABLE ROLES`,
                items: menu.options.map(o => `${o.emoji ? o.emoji + ' ' : '▪️ '}**${o.label}** — <@&${o.roleId}>`)
              }
            ],
            footerText: `Rage Optimiser • Self Roles System • Menu: ${menu.name}`
          });

          const components: any[] = [];

          if (menu.type === 'select') {
            const select = new StringSelectMenuBuilder()
              .setCustomId(`sr_select:${menu.id}`)
              .setPlaceholder(menu.placeholder || 'Select roles to add or remove...')
              .setMinValues(0)
              .setMaxValues(menu.mode === 'single' ? 1 : menu.options.length);

            menu.options.forEach(o => {
              const opt = new StringSelectMenuOptionBuilder()
                .setLabel(o.label)
                .setValue(o.roleId)
                .setDescription(o.description || `Toggle ${o.label} role`);
              if (o.emoji) opt.setEmoji(o.emoji);
              select.addOptions(opt);
            });

            components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
          } else {
            // Buttons format (up to 5 per row)
            const rows: ActionRowBuilder<ButtonBuilder>[] = [];
            let currentRow = new ActionRowBuilder<ButtonBuilder>();

            menu.options.forEach((o, i) => {
              if (i > 0 && i % 5 === 0) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder<ButtonBuilder>();
              }
              const btn = new ButtonBuilder()
                .setCustomId(`sr_btn:${menu.id}:${o.roleId}`)
                .setLabel(o.label)
                .setStyle(ButtonStyle.Primary);
              if (o.emoji) btn.setEmoji(o.emoji);
              currentRow.addComponents(btn);
            });

            if (currentRow.components.length > 0) rows.push(currentRow);
            components.push(...rows);
          }

          const sent = await targetChan.send({ embeds: [cardEmbed], components }).catch(() => null);
          if (!sent) {
            return interaction.reply({ content: `${WRONG_ICON} Failed to send menu to #${targetChan.name}. Check bot channel permissions.`, flags: 64 });
          }

          menu.messageId = sent.id;
          menu.channelId = targetChan.id;
          saveMenus(menus);

          return interaction.reply({ content: `${VERIFIED_ICON} Published self-role panel **${menuName}** to ${targetChan}!`, flags: 64 });
        }

        // --- LIST MENUS ---
        if (sub === 'list') {
          if (menus.length === 0) {
            return interaction.reply({ content: `<a:lovemail:1527647157371535420> No self-role menus configured. Create one with \`r!selfroles create <name> <title>\`.`, flags: 64 });
          }

          const listItems = menus.map((m, i) =>
            `**${i + 1}. \`${m.name}\`** — ${m.title} (${m.options.length} roles) | Format: \`${m.type}\` | Mode: \`${m.mode}\``
          );

          return interaction.reply({
            embeds: [
              buildLimeOverviewCard({
                title: `${CONFIG_ICON} CONFIGURED SELF ROLE MENUS`,
                subtitle: `TOTAL MENUS: ${menus.length}`,
                color: Colors.BRAND,
                sections: [{ title: `${SHIELD_ICON} ACTIVE PANELS`, items: listItems }]
              })
            ],
            flags: 64
          });
        }

        // --- DELETE MENU ---
        if (sub === 'delete') {
          const menuName = (interaction.options?.getString('menu') || interaction.parsed?.args?.[1])?.toLowerCase();
          if (!menuName) {
            return interaction.reply({ content: `${WRONG_ICON} Syntax: \`r!selfroles delete <menu_name>\``, flags: 64 });
          }

          const before = menus.length;
          menus = menus.filter(m => m.name !== menuName);
          if (menus.length === before) {
            return interaction.reply({ content: `${WRONG_ICON} Menu \`${menuName}\` not found.`, flags: 64 });
          }

          saveMenus(menus);
          return interaction.reply({ content: `${VERIFIED_ICON} Deleted self-role menu \`${menuName}\`.`, flags: 64 });
        }

        return interaction.reply({ content: `${WRONG_ICON} Unknown selfroles subcommand. Use \`r!help selfroles\`.`, flags: 64 });
      }
    },
    {
      name: 'command_iam',
      handler: async (client: any, interaction: any, context: any) => {
        const cmd = SelfRolesManifest.events?.find((e: any) => e.name === 'command_selfroles');
        if (cmd) return cmd.handler(client, interaction, context);
      }
    },
    {
      name: 'command_iamnot',
      handler: async (client: any, interaction: any, context: any) => {
        const cmd = SelfRolesManifest.events?.find((e: any) => e.name === 'command_selfroles');
        if (cmd) return cmd.handler(client, interaction, context);
      }
    },

    // --- INTERACTION BUTTON / SELECT MENU HANDLER ---
    {
      name: 'interactionCreate',
      handler: async (client: any, interaction: any, context: any) => {
        if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;
        const customId = interaction.customId;
        if (!customId.startsWith('sr_select:') && !customId.startsWith('sr_btn:')) return;

        const guild = interaction.guild;
        if (!guild) return;

        const modules = context.getModulesState ? context.getModulesState(guild.id) : [];
        const srMod = modules.find((m: any) => m.id === 'self-roles');
        const menus: ISelfRoleMenu[] = srMod?.config?.menus || [];

        const member = await guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member) return;

        // --- DROPDOWN SELECT MENU ---
        if (customId.startsWith('sr_select:')) {
          const menuId = customId.replace('sr_select:', '');
          const menu = menus.find(m => m.id === menuId);
          if (!menu) return interaction.reply({ content: `${WRONG_ICON} Self-role menu no longer exists.`, flags: MessageFlags.Ephemeral });

          const selectedRoleIds = interaction.values as string[];
          const allMenuRoleIds = menu.options.map(o => o.roleId);

          const addedRoles: string[] = [];
          const removedRoles: string[] = [];

          for (const rId of allMenuRoleIds) {
            const shouldHave = selectedRoleIds.includes(rId);
            const currentlyHas = member.roles.cache.has(rId);

            if (shouldHave && !currentlyHas) {
              await member.roles.add(rId, 'Self-roles selection').catch(() => null);
              addedRoles.push(rId);
            } else if (!shouldHave && currentlyHas) {
              await member.roles.remove(rId, 'Self-roles deselection').catch(() => null);
              removedRoles.push(rId);
            }
          }

          let responseText = '';
          if (addedRoles.length > 0) responseText += `${VERIFIED_ICON} **Granted**: ${addedRoles.map(id => `<@&${id}>`).join(', ')}\n`;
          if (removedRoles.length > 0) responseText += `${WRONG_ICON} **Removed**: ${removedRoles.map(id => `<@&${id}>`).join(', ')}\n`;
          if (!responseText) responseText = `<a:lovemail:1527647157371535420> Roles updated! No changes detected.`;

          return interaction.reply({ content: responseText, flags: MessageFlags.Ephemeral });
        }

        // --- BUTTON HANDLER ---
        if (customId.startsWith('sr_btn:')) {
          const parts = customId.split(':');
          const menuId = parts[1];
          const roleId = parts[2];

          const menu = menus.find(m => m.id === menuId);
          if (!menu) return interaction.reply({ content: `${WRONG_ICON} Self-role menu no longer exists.`, flags: MessageFlags.Ephemeral });

          const role = guild.roles.cache.get(roleId);
          if (!role) return interaction.reply({ content: `${WRONG_ICON} Target role no longer exists in this server.`, flags: MessageFlags.Ephemeral });

          const hasRole = member.roles.cache.has(roleId);

          if (hasRole) {
            await member.roles.remove(roleId, 'Self-roles button toggle').catch(() => null);
            return interaction.reply({ content: `${WRONG_ICON} Removed role **${role.name}**!`, flags: MessageFlags.Ephemeral });
          } else {
            // Single-select mode enforce
            if (menu.mode === 'single') {
              const otherRoleIds = menu.options.map(o => o.roleId).filter(id => id !== roleId);
              for (const otherId of otherRoleIds) {
                if (member.roles.cache.has(otherId)) {
                  await member.roles.remove(otherId, 'Self-roles single-select swap').catch(() => null);
                }
              }
            }
            await member.roles.add(roleId, 'Self-roles button toggle').catch(() => null);
            return interaction.reply({ content: `${VERIFIED_ICON} Granted role **${role.name}**!`, flags: MessageFlags.Ephemeral });
          }
        }
      }
    }
  ],
  routes: [
    {
      path: '/state',
      method: 'get',
      handler: async (req: any, res: any, context: any) => {
        const modules = context.getModulesState();
        const mod = modules.find((m: any) => m.id === 'self-roles');
        res.json({ menus: mod?.config?.menus || [] });
      }
    },
    {
      path: '/action',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        const { action, payload } = req.body;
        const modules = context.getModulesState();
        const mod = modules.find((m: any) => m.id === 'self-roles');
        let menus: ISelfRoleMenu[] = mod?.config?.menus || [];

        if (action === 'save') {
          const idx = menus.findIndex(m => m.id === payload.id);
          if (idx >= 0) menus[idx] = payload;
          else menus.push(payload);
        } else if (action === 'delete') {
          menus = menus.filter(m => m.id !== payload.id);
        }

        context.updateModuleConfig('self-roles', { menus });
        res.json({ success: true, menus });
      }
    }
  ]
};

export function registerSelfRolesCommands() {
  PrefixRegistry.register({
    name: 'selfroles',
    description: 'Enterprise Interactive Self-Roles Engine (Select Menus, Buttons, Direct r!iam commands)',
    category: 'Roles',
    usage: 'r!selfroles [create <name> <title> | addrole <menu> <@role> | send <menu> [#channel] | list | delete <menu>]',
    aliases: ['selfrole', 'roleselect', 'rolemenu', 'iam', 'iamnot'],
    userPermissions: ['Administrator'],
    cooldownSeconds: 3,
    examples: [
      'r!selfroles create region Region Roles',
      'r!selfroles addrole region @NA 🌎 North America',
      'r!selfroles send region #roles',
      'r!iam @NA',
      'r!iamnot @NA'
    ],
    moduleOwnerId: 'self-roles',
    subcommands: [
      { name: 'create <name> <title>', description: 'Create a new interactive self-role category panel', examples: ['r!selfroles create platform Choose Platform'] },
      { name: 'addrole <menu> <@role> [emoji] [label]', description: 'Add a role with optional emoji & label to a self-role panel', examples: ['r!selfroles addrole platform @PC 💻 PC Gaming'] },
      { name: 'send <menu> [#channel]', description: 'Publish the interactive self-role panel to a channel', examples: ['r!selfroles send platform #roles'] },
      { name: 'list', description: 'List all active self-role panels configured in the server', examples: ['r!selfroles list'] },
      { name: 'delete <menu>', description: 'Delete a self-role panel configuration', examples: ['r!selfroles delete platform'] }
    ]
  });
}
