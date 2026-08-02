import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';

export const AutomationManifest: ModuleManifest = {
  id: 'automation',
  name: 'Automation Studio',
  version: '1.0.0',
  description: 'Custom trigger actions, timers, and automatic role assignment panels.',
  configSchema: {
    requiredFields: ['roleId'],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;

      const roleExists = (id: string) => registry.roles.some(r => r.id === id);

      if (config.roleId) {
        progress += 100;
        if (!roleExists(config.roleId)) errors.push(`Auto-grant role ID (${config.roleId}) was deleted!`);
      }

      return { progress, errors };
    }
  },
  commands: [
    {
      name: 'automation',
      description: 'View and manage Automation Studio rules.',
      options: [
        { name: 'action', type: 3, description: 'Action: list, status', required: true }
      ]
    }
  ],
  events: [
    {
      name: 'command_automation',
      handler: async (client: any, interaction: any, context: any) => {
        const action = interaction.options.getString('action');
        const isOwner = interaction.guild?.ownerId === interaction.user?.id ||
                        interaction.member?.permissions?.has?.('Administrator');
        if (!isOwner) return interaction.reply({ content: '<:wrong:1532390628330307634> Requires Administrator.', flags: 64 });
        const modules = context.getModulesState();
        const autoMod = modules.find((m: any) => m.id === 'automation');
        if (action === 'status' || action === 'list') {
          const roleId = autoMod?.config?.roleId;
          const lines = [
            `<:config:1532425712844144701> **Automation Studio Status**`,
            `- **Module**: \`${autoMod?.status || 'unknown'}\``,
            `- **Auto-Role on Join**: ${roleId ? `<@&${roleId}>` : 'Not configured'}`,
            `- **Progress**: ${autoMod?.progress || 0}%`
          ];
          await interaction.reply({ content: lines.join('\n'), flags: 64 });
        }
      }
    },
    {
      name: 'guildMemberAdd',
      handler: async (client: any, member: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const autoModule = modules.find((m: any) => m.id === 'automation');
        if (!autoModule || autoModule.status !== 'enabled') return;

        const config = autoModule.config;
        const roleId = config.roleId;
        if (!roleId) return;

        try {
          const role = member.guild.roles.cache.get(roleId);
          if (role) {
            await member.roles.add(role);
            context.logSyncEvent(`Automation Studio: Automatically assigned role "${role.name}" to "${member.user.username}" on join.`, 'success');
          }
        } catch (err) {
          console.error('Failed to assign auto-role on join:', err);
        }
      }
    },
    {
      name: 'messageCreate',
      handler: async (client: any, message: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const autoModule = modules.find((m: any) => m.id === 'automation');
        if (!autoModule || autoModule.status !== 'enabled') return;

        if (message.author?.bot) return;

        try {
          const content = message.content?.toLowerCase();
          if (content === '!rage') {
            await message.reply('<a:approved:1532390590707142956> **RAGE OPTIMISER Core System is Online!**\nEverything is operational. Manage your settings on the local Dashboard.');
            context.logSyncEvent(`Automation Studio: Handled keyword trigger "!rage" in #${message.channel.name}.`, 'success');
          } else if (content === '!support' || content?.includes('need help')) {
            await message.reply('<:information:1532621274092929124> Need help? Please open a support ticket using the ticket board or by running the `/setup-tickets` slash command!');
            context.logSyncEvent(`Automation Studio: Handled keyword trigger for support help in #${message.channel.name}.`, 'info');
          }
        } catch (err) {
          console.error('Failed to handle automation keyword response:', err);
        }
      }
    }
  ]
};
