import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';

export const ReactionRolesManifest: ModuleManifest = {
  id: 'reaction_roles',
  name: 'Reaction Roles',
  version: '1.0.0',
  description: 'Self-assignable role panels linked to emoji reactions.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 100;
      
      const roleMap = config.roleMap || {};
      for (const [emoji, roleId] of Object.entries(roleMap)) {
        if (!registry.roles.some(r => r.id === roleId)) {
          errors.push(`Mapped role for emoji ${emoji} (${roleId}) no longer exists.`);
          progress = 50;
        }
      }

      return { progress, errors };
    }
  },
  commands: [
    {
      name: 'reactionrole',
      description: 'Reaction Role Management Engine',
      options: [
        {
          name: 'spawn',
          description: 'Spawn a reaction role panel in a channel',
          type: 1,
          options: [
            { name: 'channel', type: 7, description: 'Channel to spawn panel in', required: true, channel_types: [0, 5] }
          ]
        },
        {
          name: 'add',
          description: 'Add an emoji to role mapping for reaction roles',
          type: 1,
          options: [
            { name: 'emoji', type: 3, description: 'Emoji symbol or name (e.g. ⭐)', required: true },
            { name: 'role', type: 8, description: 'Role to assign when reacted', required: true }
          ]
        },
        {
          name: 'remove',
          description: 'Remove an emoji mapping',
          type: 1,
          options: [
            { name: 'emoji', type: 3, description: 'Emoji symbol or name to remove', required: true }
          ]
        },
        {
          name: 'list',
          description: 'List all configured reaction role mappings',
          type: 1
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_reactionrole',
      handler: async (client: any, interaction: any, context: any) => {
        const isOwner = interaction.guild?.ownerId === interaction.user?.id ||
                        interaction.member?.permissions?.has?.('Administrator');
        if (!isOwner) return interaction.reply({ content: '<:shield:1532403012751065179> Requires Administrator.', flags: 64 });
        
        const sub = interaction.options.getSubcommand(false) || 'spawn';
        const modules = context.getModulesState ? context.getModulesState() : [];
        const rrMod = modules.find((m: any) => m.id === 'reaction_roles');

        if (sub === 'add') {
          const emoji = interaction.options.getString('emoji', true);
          const role = interaction.options.getRole('role', true);
          const roleMap = { ...(rrMod?.config?.roleMap || {}) };
          roleMap[emoji] = role.id;
          context.updateModuleConfig('reaction_roles', { roleMap });
          context.logSyncEvent(`Reaction Roles: Mapped emoji ${emoji} to role @${role.name}.`, 'success');
          return interaction.reply({ content: `<a:approved:1532390590707142956> Successfully mapped emoji ${emoji} to role ${role}.`, flags: 64 });
        }
        
        if (sub === 'remove') {
          const emoji = interaction.options.getString('emoji', true);
          const roleMap = { ...(rrMod?.config?.roleMap || {}) };
          delete roleMap[emoji];
          context.updateModuleConfig('reaction_roles', { roleMap });
          context.logSyncEvent(`Reaction Roles: Removed emoji ${emoji} mapping.`, 'info');
          return interaction.reply({ content: `<a:approved:1532390590707142956> Removed mapping for ${emoji}.`, flags: 64 });
        }
        
        if (sub === 'list') {
          const roleMap = rrMod?.config?.roleMap || {};
          if (Object.keys(roleMap).length === 0) {
            return interaction.reply({ content: '<:information:1532621274092929124> No reaction roles currently configured.', flags: 64 });
          }
          const lines = Object.entries(roleMap).map(([e, rId]) => `${e} ➔ <@&${rId}>`);
          return interaction.reply({ content: `**Reaction Role Mappings:**\n${lines.join('\n')}`, flags: 64 });
        }

        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const roleMap = rrMod?.config?.roleMap || {};
        
        if (Object.keys(roleMap).length === 0) {
          return interaction.reply({ content: '<:wrong:1532390628330307634> No reaction roles mapped yet. Use `/reactionrole add` to add mappings first.', flags: 64 });
        }

        const lines = ['**Self-Assign Roles**\nReact below to assign yourself roles:'];
        for (const [emoji, roleId] of Object.entries(roleMap)) {
          lines.push(`${emoji} - <@&${roleId}>`);
        }

        try {
          const msg = await channel.send({ content: lines.join('\n') });
          for (const emoji of Object.keys(roleMap)) {
            await msg.react(emoji).catch(() => {});
          }
          await interaction.reply({ content: `<a:approved:1532390590707142956> Reaction role panel spawned in ${channel}.`, flags: 64 });
          context.logSyncEvent(`Reaction Roles: Panel spawned in #${channel.name}.`, 'success');
        } catch (e) {
          await interaction.reply({ content: '<:wrong:1532390628330307634> Failed to send panel. Check bot permissions.', flags: 64 });
        }
      }
    },
    {
      name: 'messageReactionAdd',
      handler: async (client: any, reaction: any, user: any, context: any) => {
        if (user.bot) return;
        if (reaction.partial) await reaction.fetch().catch(() => {});
        const modules = context.getModulesState();
        const rrMod = modules.find((m: any) => m.id === 'reaction_roles');
        if (!rrMod || rrMod.status !== 'enabled') return;

        const roleMap = rrMod.config.roleMap || {};
        const emojiName = reaction.emoji.name;
        const roleId = roleMap[emojiName];

        if (roleId) {
          try {
            const member = await reaction.message.guild.members.fetch(user.id);
            if (member && !member.roles.cache.has(roleId)) {
              await member.roles.add(roleId);
              context.logSyncEvent(`Reaction Roles: ${user.username} assigned themselves <@&${roleId}> via ${emojiName}.`, 'info');
            }
          } catch (e) {
            console.error(e);
          }
        }
      }
    },
    {
      name: 'messageReactionRemove',
      handler: async (client: any, reaction: any, user: any, context: any) => {
        if (user.bot) return;
        if (reaction.partial) await reaction.fetch().catch(() => {});
        const modules = context.getModulesState();
        const rrMod = modules.find((m: any) => m.id === 'reaction_roles');
        if (!rrMod || rrMod.status !== 'enabled') return;

        const roleMap = rrMod.config.roleMap || {};
        const emojiName = reaction.emoji.name;
        const roleId = roleMap[emojiName];

        if (roleId) {
          try {
            const member = await reaction.message.guild.members.fetch(user.id);
            if (member && member.roles.cache.has(roleId)) {
              await member.roles.remove(roleId);
              context.logSyncEvent(`Reaction Roles: ${user.username} removed their <@&${roleId}> via ${emojiName}.`, 'info');
            }
          } catch (e) {
            console.error(e);
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
        const mod = modules.find((m: any) => m.id === 'reaction_roles');
        res.json({ roleMap: mod?.config?.roleMap || {} });
      }
    },
    {
      path: '/update',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        const { roleMap } = req.body;
        context.updateModuleConfig('reaction_roles', { roleMap });
        context.logSyncEvent(`Reaction Roles: Mappings updated from dashboard.`, 'success');
        res.json({ success: true, roleMap });
      }
    }
  ]
};
