import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { EmbedBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { IReminder } from '../../models/index.js';

const reminderTimers: Map<string, NodeJS.Timeout> = new Map();

function parseMs(str: string): number {
  const unit = str.slice(-1);
  const val = parseInt(str);
  if (unit === 's') return val * 1000;
  if (unit === 'm') return val * 60_000;
  if (unit === 'h') return val * 3_600_000;
  if (unit === 'd') return val * 86_400_000;
  if (unit === 'w') return val * 604_800_000;
  return val * 60_000;
}

async function fireReminder(client: any, reminder: IReminder, context: any) {
  try {
    const user = await client.users.fetch(reminder.userId).catch(() => null);
    if (!user) return;

    const embed = new EmbedBuilder()
      .setTitle('<:timer:1532620491662037123> Reminder!')
      .setDescription(reminder.message)
      .setColor(0x99CC00)
      .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
      .setTimestamp();

    // Try DM first
    await user.send({ embeds: [embed] }).catch(async () => {
      // Fall back to channel if DM fails
      if (reminder.channelId) {
        const channel = await client.channels.fetch(reminder.channelId).catch(() => null);
        if (channel?.isTextBased()) {
          await channel.send({ content: `<@${reminder.userId}>`, embeds: [embed] }).catch(() => {});
        }
      }
    });

    // Mark delivered
    const modules = context.getModulesState ? context.getModulesState() : [];
    const rMod = modules.find((m: any) => m.id === 'reminders');
    if (!rMod) return;

    const reminders: IReminder[] = rMod.config?.reminders || [];
    if (reminder.repeat) {
      const newRemindAt = new Date(Date.now() + parseMs(reminder.repeat === 'daily' ? '1d' : reminder.repeat === 'weekly' ? '7d' : '30d'));
      const updated = reminders.map(r => r.id === reminder.id ? { ...r, remindAt: newRemindAt } : r);
      context.updateModuleConfig('reminders', { reminders: updated });
      const timer = setTimeout(() => fireReminder(client, { ...reminder, remindAt: newRemindAt }, context), newRemindAt.getTime() - Date.now());
      reminderTimers.set(reminder.id, timer);
    } else {
      context.updateModuleConfig('reminders', { reminders: reminders.filter(r => r.id !== reminder.id) });
    }

    context.logSyncEvent(`[Reminders] Delivered reminder to ${reminder.userTag}: ${reminder.message.substring(0, 50)}`, 'info');
  } catch (err) { console.error('[Reminders] fire error:', err); }
}

export const RemindersManifest: ModuleManifest = {
  id: 'reminders',
  name: 'Reminder System',
  version: '1.0.0',
  description: 'Persistent reminders with DM delivery, snooze, list, cancel, and repeat options.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      return { progress: 100, errors: [] };
    }
  },
  commands: [
    {
      name: 'remind',
      description: 'Reminder management',
      options: [
        {
          name: 'set',
          description: 'Set a new reminder',
          type: 1,
          options: [
            { name: 'time', type: 3, description: 'Duration (e.g. 10m, 2h, 1d)', required: true },
            { name: 'message', type: 3, description: 'Reminder message', required: true },
            { name: 'repeat', type: 3, description: 'Repeat interval', required: false, choices: [{ name: 'Daily', value: 'daily' }, { name: 'Weekly', value: 'weekly' }, { name: 'Monthly', value: 'monthly' }] }
          ]
        },
        {
          name: 'list',
          description: 'List your active reminders',
          type: 1
        },
        {
          name: 'cancel',
          description: 'Cancel a reminder',
          type: 1,
          options: [{ name: 'id', type: 3, description: 'Reminder ID', required: true }]
        },
        {
          name: 'snooze',
          description: 'Snooze a reminder',
          type: 1,
          options: [
            { name: 'id', type: 3, description: 'Reminder ID', required: true },
            { name: 'time', type: 3, description: 'Snooze duration (e.g. 10m, 1h)', required: true }
          ]
        },
        {
          name: 'clear',
          description: 'Clear all your reminders',
          type: 1
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_remind',
      handler: async (client: any, interaction: any, context: any) => {
        const sub = interaction.options.getSubcommand(false);
        const modules = context.getModulesState ? context.getModulesState() : [];
        const rMod = modules.find((m: any) => m.id === 'reminders');

        if (!rMod || rMod.status !== 'enabled') {
          return interaction.reply({ content: '<:wrong:1532390628330307634> Reminder module is not enabled.', flags: 64 });
        }

        let reminders: IReminder[] = rMod.config?.reminders || [];
        const saveReminders = (updated: IReminder[]) => context.updateModuleConfig('reminders', { reminders: updated });

        if (sub === 'set') {
          const timeStr = interaction.options.getString('time');
          const message = interaction.options.getString('message');
          const repeat = interaction.options.getString('repeat') || null;
          const ms = parseMs(timeStr);

          if (ms < 5000) return interaction.reply({ content: '<:wrong:1532390628330307634> Minimum reminder time is 5 seconds.', flags: 64 });

          const userReminders = reminders.filter(r => r.userId === interaction.user.id);
          if (userReminders.length >= 10) return interaction.reply({ content: '<:wrong:1532390628330307634> You can only have up to 10 active reminders.', flags: 64 });

          const remindAt = new Date(Date.now() + ms);
          const reminder: IReminder = {
            id: `rm_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            userId: interaction.user.id,
            userTag: interaction.user.username,
            guildId: interaction.guildId || undefined,
            channelId: interaction.channelId,
            message,
            remindAt,
            delivered: false,
            repeat: repeat as any,
            createdAt: new Date()
          };

          reminders.push(reminder);
          saveReminders(reminders);

          const timer = setTimeout(() => fireReminder(client, reminder, context), ms);
          reminderTimers.set(reminder.id, timer);

          const embed = new EmbedBuilder()
            .setTitle('<:timer:1532620491662037123> Reminder Set!')
            .setDescription(`I'll remind you <t:${Math.floor(remindAt.getTime() / 1000)}:R>:\n**${message}**`)
            .setColor(0x99CC00)
            .addFields(
              { name: 'ID', value: `\`${reminder.id}\``, inline: true },
              { name: 'Repeat', value: repeat || 'None', inline: true }
            )
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });

          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'list') {
          const mine = reminders.filter(r => r.userId === interaction.user.id);
          if (mine.length === 0) return interaction.reply({ content: '<:information:1532621274092929124> You have no active reminders.', flags: 64 });
          const lines = mine.map((r, i) => `**${i + 1}.** \`${r.id}\` — <t:${Math.floor(new Date(r.remindAt).getTime() / 1000)}:R> — ${r.message.substring(0, 50)}${r.message.length > 50 ? '...' : ''}`);
          return interaction.reply({ content: `<:timer:1532620491662037123> **Your Reminders (${mine.length}):**\n${lines.join('\n')}`, flags: 64 });
        }

        if (sub === 'cancel') {
          const id = interaction.options.getString('id');
          const rem = reminders.find(r => r.id === id && r.userId === interaction.user.id);
          if (!rem) return interaction.reply({ content: `<:wrong:1532390628330307634> Reminder \`${id}\` not found.`, flags: 64 });
          const existing = reminderTimers.get(id);
          if (existing) { clearTimeout(existing); reminderTimers.delete(id); }
          saveReminders(reminders.filter(r => r.id !== id));
          return interaction.reply({ content: `<a:approved:1532390590707142956> Cancelled reminder \`${id}\`.`, flags: 64 });
        }

        if (sub === 'snooze') {
          const id = interaction.options.getString('id');
          const timeStr = interaction.options.getString('time');
          const rem = reminders.find(r => r.id === id && r.userId === interaction.user.id);
          if (!rem) return interaction.reply({ content: `<:wrong:1532390628330307634> Reminder \`${id}\` not found.`, flags: 64 });

          const existing = reminderTimers.get(id);
          if (existing) { clearTimeout(existing); reminderTimers.delete(id); }

          const ms = parseMs(timeStr);
          const newRemindAt = new Date(Date.now() + ms);
          const updated = reminders.map(r => r.id === id ? { ...r, remindAt: newRemindAt } : r);
          saveReminders(updated);

          const timer = setTimeout(() => fireReminder(client, { ...rem, remindAt: newRemindAt }, context), ms);
          reminderTimers.set(id, timer);

          return interaction.reply({ content: `<a:approved:1532390590707142956> Snoozed reminder \`${id}\` for **${timeStr}**! Will remind you <t:${Math.floor(newRemindAt.getTime() / 1000)}:R>.`, flags: 64 });
        }

        if (sub === 'clear') {
          const mine = reminders.filter(r => r.userId === interaction.user.id);
          for (const r of mine) {
            const t = reminderTimers.get(r.id);
            if (t) { clearTimeout(t); reminderTimers.delete(r.id); }
          }
          saveReminders(reminders.filter(r => r.userId !== interaction.user.id));
          return interaction.reply({ content: `<a:approved:1532390590707142956> Cleared all ${mine.length} of your reminders.`, flags: 64 });
        }
      }
    },
    {
      name: 'ready',
      handler: async (client: any, _: any, context: any) => {
        // Restore reminders on startup
        const modules = context.getModulesState ? context.getModulesState() : [];
        const rMod = modules.find((m: any) => m.id === 'reminders');
        if (!rMod) return;
        const reminders: IReminder[] = rMod.config?.reminders || [];
        const now = Date.now();
        for (const r of reminders.filter(rm => !rm.delivered)) {
          const ms = new Date(r.remindAt).getTime() - now;
          if (ms <= 0) {
            fireReminder(client, r, context);
          } else {
            const timer = setTimeout(() => fireReminder(client, r, context), ms);
            reminderTimers.set(r.id, timer);
          }
        }
        if (reminders.length > 0) context.logSyncEvent(`[Reminders] Restored ${reminders.length} reminder(s) after startup.`, 'info');
      }
    }
  ],
  routes: [
    {
      path: '/state',
      method: 'get',
      handler: async (req: any, res: any, context: any) => {
        const modules = context.getModulesState();
        const mod = modules.find((m: any) => m.id === 'reminders');
        res.json({ reminders: mod?.config?.reminders || [] });
      }
    },
    {
      path: '/cancel',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        const { id } = req.body;
        const modules = context.getModulesState();
        const rMod = modules.find((m: any) => m.id === 'reminders');
        if (!rMod) return res.status(404).json({ error: 'Reminders module not found' });
        let reminders = rMod.config?.reminders || [];
        const rem = reminders.find((r: any) => r.id === id);
        if (!rem) return res.status(404).json({ error: 'Reminder not found' });

        const existing = reminderTimers.get(id);
        if (existing) { clearTimeout(existing); reminderTimers.delete(id); }

        const updated = reminders.filter((r: any) => r.id !== id);
        context.updateModuleConfig('reminders', { reminders: updated });
        context.logSyncEvent(`[Reminders] Dashboard cancelled reminder \`${id}\`.`, 'warn');
        res.json({ success: true, reminders: updated });
      }
    },
    {
      path: '/create',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        const { message, userId, repeat, duration, channelId } = req.body;
        const ms = parseMs(duration || '10m');
        const modules = context.getModulesState();
        const rMod = modules.find((m: any) => m.id === 'reminders');
        if (!rMod) return res.status(404).json({ error: 'Reminders module not found' });

        let reminders = rMod.config?.reminders || [];
        const remindAt = new Date(Date.now() + ms);

        const client = context.client;
        let userTag = 'Dashboard User';
        if (client && userId) {
          try {
            const u = await client.users.fetch(userId).catch(() => null);
            if (u) userTag = u.username;
          } catch {}
        }

        const reminder = {
          id: `rm_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          userId: userId || 'dashboard',
          userTag,
          guildId: context.guildId,
          channelId: channelId || null,
          message,
          remindAt,
          delivered: false,
          repeat: repeat || null,
          createdAt: new Date()
        };

        reminders.push(reminder);
        context.updateModuleConfig('reminders', { reminders });

        if (client) {
          const timer = setTimeout(() => fireReminder(client, reminder, context), ms);
          reminderTimers.set(reminder.id, timer);
        }

        context.logSyncEvent(`[Reminders] Dashboard scheduled reminder for ${userTag}: ${message.substring(0, 50)}`, 'success');
        res.json({ success: true, reminders });
      }
    }
  ]
};
