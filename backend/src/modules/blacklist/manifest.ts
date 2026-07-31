import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { IBlacklistEntry, BlacklistType } from '../../models/index.js';

let blacklistCache: Map<string, IBlacklistEntry[]> = new Map();

function getBlacklist(guildId: string, context: any): IBlacklistEntry[] {
  const modules = context.getModulesState ? context.getModulesState() : [];
  const mod = modules.find((m: any) => m.id === 'blacklist');
  return mod?.config?.entries || [];
}

function isBlacklisted(entries: IBlacklistEntry[], type: BlacklistType, value: string): IBlacklistEntry | null {
  return entries.find(e => e.type === type && e.value.toLowerCase() === value.toLowerCase()) || null;
}

export const BlacklistManifest: ModuleManifest = {
  id: 'blacklist',
  name: 'Blacklist System',
  version: '1.0.0',
  description: 'Multi-type blacklist: users, roles, channels, bots, domains, invites, words, regex, emoji, stickers.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const entries: IBlacklistEntry[] = config.entries || [];
      const errors: string[] = [];
      let progress = entries.length > 0 ? 100 : 80;
      return { progress, errors };
    }
  },
  commands: [
    {
      name: 'blacklist',
      description: 'Manage server blacklists',
      options: [
        {
          name: 'user',
          description: 'Blacklist a user',
          type: 2,
          options: [
            { name: 'add', description: 'Add user to blacklist', type: 1, options: [{ name: 'target', type: 6, description: 'User to blacklist', required: true }, { name: 'reason', type: 3, description: 'Reason', required: false }, { name: 'action', type: 3, description: 'Action: ban, kick, timeout, warn', required: false, choices: [{ name: 'Ban', value: 'ban' }, { name: 'Kick', value: 'kick' }, { name: 'Timeout', value: 'timeout' }, { name: 'Warn', value: 'warn' }] }] },
            { name: 'remove', description: 'Remove user from blacklist', type: 1, options: [{ name: 'target', type: 6, description: 'User to remove', required: true }] },
            { name: 'list', description: 'List blacklisted users', type: 1 }
          ]
        },
        {
          name: 'role',
          description: 'Blacklist a role',
          type: 2,
          options: [
            { name: 'add', description: 'Add role to blacklist', type: 1, options: [{ name: 'target', type: 8, description: 'Role to blacklist', required: true }, { name: 'reason', type: 3, description: 'Reason', required: false }] },
            { name: 'remove', description: 'Remove role from blacklist', type: 1, options: [{ name: 'target', type: 8, description: 'Role to remove', required: true }] },
            { name: 'list', description: 'List blacklisted roles', type: 1 }
          ]
        },
        {
          name: 'channel',
          description: 'Blacklist a channel',
          type: 2,
          options: [
            { name: 'add', description: 'Add channel to blacklist', type: 1, options: [{ name: 'target', type: 7, description: 'Channel to blacklist', required: true }, { name: 'reason', type: 3, description: 'Reason', required: false }] },
            { name: 'remove', description: 'Remove channel from blacklist', type: 1, options: [{ name: 'target', type: 7, description: 'Channel to remove', required: true }] },
            { name: 'list', description: 'List blacklisted channels', type: 1 }
          ]
        },
        {
          name: 'word',
          description: 'Blacklist a word or phrase',
          type: 2,
          options: [
            { name: 'add', description: 'Add word to blacklist', type: 1, options: [{ name: 'word', type: 3, description: 'Word or phrase', required: true }, { name: 'action', type: 3, description: 'Action: delete, warn, timeout, kick, ban', required: false, choices: [{ name: 'Delete', value: 'delete' }, { name: 'Warn', value: 'warn' }, { name: 'Timeout', value: 'timeout' }] }] },
            { name: 'remove', description: 'Remove word from blacklist', type: 1, options: [{ name: 'word', type: 3, description: 'Word or phrase', required: true }] },
            { name: 'list', description: 'List blacklisted words', type: 1 }
          ]
        },
        {
          name: 'domain',
          description: 'Blacklist a domain',
          type: 2,
          options: [
            { name: 'add', description: 'Add domain to blacklist', type: 1, options: [{ name: 'domain', type: 3, description: 'Domain to blacklist (e.g. example.com)', required: true }, { name: 'reason', type: 3, description: 'Reason', required: false }] },
            { name: 'remove', description: 'Remove domain from blacklist', type: 1, options: [{ name: 'domain', type: 3, description: 'Domain to remove', required: true }] },
            { name: 'list', description: 'List blacklisted domains', type: 1 }
          ]
        },
        {
          name: 'invite',
          description: 'Blacklist Discord invites',
          type: 2,
          options: [
            { name: 'add', description: 'Add invite pattern to blacklist', type: 1, options: [{ name: 'code', type: 3, description: 'Invite code or server name', required: true }, { name: 'reason', type: 3, description: 'Reason', required: false }] },
            { name: 'remove', description: 'Remove invite from blacklist', type: 1, options: [{ name: 'code', type: 3, description: 'Invite code', required: true }] },
            { name: 'list', description: 'List blacklisted invites', type: 1 }
          ]
        },
        {
          name: 'regex',
          description: 'Blacklist a regex pattern',
          type: 2,
          options: [
            { name: 'add', description: 'Add regex pattern to blacklist', type: 1, options: [{ name: 'pattern', type: 3, description: 'Regular expression pattern', required: true }, { name: 'action', type: 3, description: 'Action', required: false, choices: [{ name: 'Delete', value: 'delete' }, { name: 'Warn', value: 'warn' }, { name: 'Timeout', value: 'timeout' }] }] },
            { name: 'remove', description: 'Remove regex from blacklist', type: 1, options: [{ name: 'pattern', type: 3, description: 'Pattern to remove', required: true }] },
            { name: 'list', description: 'List blacklisted regex patterns', type: 1 }
          ]
        },
        {
          name: 'bot',
          description: 'Blacklist a bot',
          type: 2,
          options: [
            { name: 'add', description: 'Add bot to blacklist (auto-kick on join)', type: 1, options: [{ name: 'bot_id', type: 3, description: 'Bot user ID', required: true }, { name: 'reason', type: 3, description: 'Reason', required: false }] },
            { name: 'remove', description: 'Remove bot from blacklist', type: 1, options: [{ name: 'bot_id', type: 3, description: 'Bot user ID', required: true }] },
            { name: 'list', description: 'List blacklisted bots', type: 1 }
          ]
        },
        {
          name: 'emoji',
          description: 'Blacklist an emoji',
          type: 2,
          options: [
            { name: 'add', description: 'Add emoji to blacklist', type: 1, options: [{ name: 'emoji', type: 3, description: 'Emoji name or ID', required: true }] },
            { name: 'remove', description: 'Remove emoji from blacklist', type: 1, options: [{ name: 'emoji', type: 3, description: 'Emoji name or ID', required: true }] },
            { name: 'list', description: 'List blacklisted emojis', type: 1 }
          ]
        },
        {
          name: 'sticker',
          description: 'Blacklist a sticker',
          type: 2,
          options: [
            { name: 'add', description: 'Add sticker to blacklist', type: 1, options: [{ name: 'sticker', type: 3, description: 'Sticker name or ID', required: true }] },
            { name: 'remove', description: 'Remove sticker from blacklist', type: 1, options: [{ name: 'sticker', type: 3, description: 'Sticker name or ID', required: true }] },
            { name: 'list', description: 'List blacklisted stickers', type: 1 }
          ]
        },
        {
          name: 'view',
          description: 'View all blacklist entries',
          type: 1
        },
        {
          name: 'clear',
          description: 'Clear all entries of a specific type',
          type: 1,
          options: [{ name: 'type', type: 3, description: 'Type to clear', required: true, choices: [{ name: 'Words', value: 'word' }, { name: 'Domains', value: 'domain' }, { name: 'Invites', value: 'invite' }, { name: 'Regex', value: 'regex' }, { name: 'All', value: 'all' }] }]
        },
        {
          name: 'import',
          description: 'Import blacklist from JSON file (attach file)',
          type: 1
        },
        {
          name: 'export',
          description: 'Export current blacklist to JSON',
          type: 1
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_blacklist',
      handler: async (client: any, interaction: any, context: any) => {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '🔒 Administrator permissions required.', flags: 64 });
        }

        const modules = context.getModulesState ? context.getModulesState() : [];
        const blMod = modules.find((m: any) => m.id === 'blacklist');
        if (!blMod || blMod.status !== 'enabled') {
          return interaction.reply({ content: '❌ Blacklist module is not enabled.', flags: 64 });
        }

        let entries: IBlacklistEntry[] = blMod.config?.entries || [];
        const subGroup = interaction.options.getSubcommandGroup(false);
        const sub = interaction.options.getSubcommand(false);

        const saveEntries = (updated: IBlacklistEntry[]) => context.updateModuleConfig('blacklist', { entries: updated });

        // --- ADD ---
        if (sub === 'add') {
          let value = '', label = '', type: BlacklistType = 'word';
          if (subGroup === 'user') { const u = interaction.options.getUser('target'); value = u.id; label = u.username; type = 'user'; }
          else if (subGroup === 'role') { const r = interaction.options.getRole('target'); value = r.id; label = r.name; type = 'role'; }
          else if (subGroup === 'channel') { const c = interaction.options.getChannel('target'); value = c.id; label = c.name; type = 'channel'; }
          else if (subGroup === 'word') { value = interaction.options.getString('word'); label = value; type = 'word'; }
          else if (subGroup === 'domain') { value = interaction.options.getString('domain'); label = value; type = 'domain'; }
          else if (subGroup === 'invite') { value = interaction.options.getString('code'); label = value; type = 'invite'; }
          else if (subGroup === 'regex') { value = interaction.options.getString('pattern'); label = value; type = 'regex'; }
          else if (subGroup === 'bot') { value = interaction.options.getString('bot_id'); label = value; type = 'bot'; }
          else if (subGroup === 'emoji') { value = interaction.options.getString('emoji'); label = value; type = 'emoji'; }
          else if (subGroup === 'sticker') { value = interaction.options.getString('sticker'); label = value; type = 'sticker'; }

          if (isBlacklisted(entries, type, value)) {
            return interaction.reply({ content: `❌ \`${label}\` is already blacklisted as type **${type}**.`, flags: 64 });
          }

          const entry: IBlacklistEntry = {
            id: `bl_${Date.now()}`,
            guildId: interaction.guildId,
            type,
            value,
            label,
            reason: interaction.options.getString('reason') || undefined,
            action: (interaction.options.getString('action') as any) || 'delete',
            addedBy: interaction.user.id,
            addedByTag: interaction.user.username,
            createdAt: new Date()
          };
          entries.push(entry);
          saveEntries(entries);
          context.logSyncEvent(`[Blacklist] Added ${type} blacklist entry: ${label} by ${interaction.user.username}`, 'info');

          // Apply immediate enforcement if the member is present in the guild
          if (type === 'user' || type === 'bot') {
            interaction.guild.members.fetch(value).then(async (member: any) => {
              if (member) {
                if (type === 'bot') {
                  await member.kick('Blacklisted bot').catch(() => {});
                  context.logSyncEvent(`[Blacklist] Kicked blacklisted bot ${member.user.username} immediately.`, 'warn');
                } else {
                  const act = entry.action || 'ban';
                  if (act === 'ban') {
                    await member.ban({ reason: entry.reason || 'Blacklisted user' }).catch(() => {});
                    context.logSyncEvent(`[Blacklist] Banned blacklisted user ${member.user.username} immediately.`, 'warn');
                  } else if (act === 'kick') {
                    await member.kick(entry.reason || 'Blacklisted user').catch(() => {});
                    context.logSyncEvent(`[Blacklist] Kicked blacklisted user ${member.user.username} immediately.`, 'warn');
                  } else if (act === 'timeout') {
                    await member.timeout(5 * 60 * 1000, entry.reason || 'Blacklisted user').catch(() => {});
                    context.logSyncEvent(`[Blacklist] Timed out blacklisted user ${member.user.username} immediately.`, 'warn');
                  }
                }
              }
            }).catch(() => {});
          }

          return interaction.reply({ content: `✅ **${type.toUpperCase()}** \`${label}\` has been blacklisted and immediate actions applied.`, flags: 64 });
        }

        // --- REMOVE ---
        if (sub === 'remove') {
          let value = '';
          if (subGroup === 'user') value = interaction.options.getUser('target').id;
          else if (subGroup === 'role') value = interaction.options.getRole('target').id;
          else if (subGroup === 'channel') value = interaction.options.getChannel('target').id;
          else if (subGroup === 'word') value = interaction.options.getString('word');
          else if (subGroup === 'domain') value = interaction.options.getString('domain');
          else if (subGroup === 'invite') value = interaction.options.getString('code');
          else if (subGroup === 'regex') value = interaction.options.getString('pattern');
          else if (subGroup === 'bot') value = interaction.options.getString('bot_id');
          else if (subGroup === 'emoji') value = interaction.options.getString('emoji');
          else if (subGroup === 'sticker') value = interaction.options.getString('sticker');

          const before = entries.length;
          entries = entries.filter(e => !(e.type === subGroup && e.value === value));
          if (entries.length === before) return interaction.reply({ content: `❌ Entry not found in blacklist.`, flags: 64 });
          saveEntries(entries);
          context.logSyncEvent(`[Blacklist] Removed ${subGroup} blacklist entry: ${value} by ${interaction.user.username}`, 'info');
          return interaction.reply({ content: `🗑️ Removed \`${value}\` from **${subGroup}** blacklist.`, flags: 64 });
        }

        // --- LIST ---
        if (sub === 'list') {
          const filtered = entries.filter(e => e.type === (subGroup as BlacklistType));
          if (filtered.length === 0) return interaction.reply({ content: `📋 No ${subGroup} entries in the blacklist.`, flags: 64 });
          const lines = filtered.slice(0, 20).map((e, i) => `**${i + 1}.** \`${e.label || e.value}\` — ${e.reason || 'No reason'}`);
          return interaction.reply({ content: `🚫 **${subGroup?.toUpperCase()} Blacklist** (${filtered.length} entries):\n${lines.join('\n')}`, flags: 64 });
        }

        // --- VIEW ---
        if (sub === 'view') {
          const types: BlacklistType[] = ['user', 'role', 'channel', 'bot', 'domain', 'invite', 'word', 'regex', 'emoji', 'sticker'];
          const embed = new EmbedBuilder().setTitle('🚫 Server Blacklist Overview').setColor('#ff4444').setTimestamp();
          for (const t of types) {
            const count = entries.filter(e => e.type === t).length;
            if (count > 0) embed.addFields({ name: t.charAt(0).toUpperCase() + t.slice(1), value: `${count} entries`, inline: true });
          }
          if (entries.length === 0) embed.setDescription('No blacklist entries configured.');
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        // --- CLEAR ---
        if (sub === 'clear') {
          const type = interaction.options.getString('type');
          if (type === 'all') { entries = []; }
          else { entries = entries.filter(e => e.type !== type); }
          saveEntries(entries);
          return interaction.reply({ content: `🗑️ Cleared all **${type}** blacklist entries.`, flags: 64 });
        }

        // --- EXPORT ---
        if (sub === 'export') {
          const json = JSON.stringify(entries, null, 2);
          const { AttachmentBuilder } = await import('discord.js');
          const attachment = new AttachmentBuilder(Buffer.from(json), { name: `blacklist-${interaction.guildId}.json` });
          return interaction.reply({ content: '📤 Blacklist export:', files: [attachment], flags: 64 });
        }

        await interaction.reply({ content: '❌ Unknown subcommand.', flags: 64 });
      }
    },
    // --- Message enforcement ---
    {
      name: 'messageCreate',
      handler: async (client: any, message: any, context: any) => {
        if (message.author.bot) return;
        if (message.member?.permissions?.has(PermissionFlagsBits.Administrator)) return;

        const modules = context.getModulesState ? context.getModulesState() : [];
        const blMod = modules.find((m: any) => m.id === 'blacklist');
        if (!blMod || blMod.status !== 'enabled') return;

        const entries: IBlacklistEntry[] = blMod.config?.entries || [];
        const content = message.content.toLowerCase();
        let matched: IBlacklistEntry | null = null;

        // Word check
        for (const e of entries.filter(e => e.type === 'word')) {
          if (content.includes(e.value.toLowerCase())) { matched = e; break; }
        }

        // Regex check
        if (!matched) {
          for (const e of entries.filter(e => e.type === 'regex')) {
            try {
              if (new RegExp(e.value, 'i').test(message.content)) { matched = e; break; }
            } catch {}
          }
        }

        // Domain check
        if (!matched) {
          const urlMatches = content.match(/https?:\/\/([^/\s]+)/g) || [];
          for (const url of urlMatches) {
            const hostname = url.replace(/https?:\/\//, '').split('/')[0];
            for (const e of entries.filter(e => e.type === 'domain')) {
              if (hostname.includes(e.value.toLowerCase())) { matched = e; break; }
            }
            if (matched) break;
          }
        }

        // Discord invite check
        if (!matched) {
          const inviteRegex = /discord\.gg\/([a-zA-Z0-9]+)/g;
          const inviteMatches = content.match(inviteRegex);
          if (inviteMatches && entries.some(e => e.type === 'invite')) {
            matched = entries.find(e => e.type === 'invite') || null;
          }
        }

        // User check
        if (!matched) {
          matched = entries.find(e => e.type === 'user' && e.value === message.author.id) || null;
        }

        // Role check
        if (!matched && message.member?.roles?.cache) {
          matched = entries.find(e => e.type === 'role' && message.member.roles.cache.has(e.value)) || null;
        }

        // Channel check
        if (!matched) {
          matched = entries.find(e => e.type === 'channel' && e.value === message.channelId) || null;
        }

        // Sticker check
        if (!matched && message.stickers?.size > 0) {
          for (const sticker of message.stickers.values()) {
            for (const e of entries.filter(e => e.type === 'sticker')) {
              if (sticker.id === e.value || sticker.name.toLowerCase() === e.value.toLowerCase()) {
                matched = e;
                break;
              }
            }
            if (matched) break;
          }
        }

        // Emoji check
        if (!matched) {
          for (const e of entries.filter(e => e.type === 'emoji')) {
            if (content.includes(e.value)) { matched = e; break; }
          }
        }

        if (!matched) return;

        try {
          await message.delete();
          await message.channel.send(`${message.author} your message was removed. **Reason**: Blacklisted content.`)
            .then((m: any) => setTimeout(() => m.delete().catch(() => {}), 5000));

          context.logSyncEvent(`[Blacklist] Removed ${matched.type} content from ${message.author.username} in #${message.channel.name}`, 'warn');

          if (matched.action === 'warn') {
            await message.member?.send(`⚠️ Warning from **${message.guild.name}**: Your message was removed for containing blacklisted content.`).catch(() => {});
          } else if (matched.action === 'timeout') {
            await message.member?.timeout(5 * 60 * 1000, 'Blacklist violation').catch(() => {});
          } else if (matched.action === 'kick') {
            await message.member?.kick('Blacklist violation').catch(() => {});
          } else if (matched.action === 'ban') {
            await message.guild.members.ban(message.author.id, { reason: 'Blacklist violation' }).catch(() => {});
          }
        } catch (err) { console.error('[Blacklist] enforcement error:', err); }
      }
    },
    // --- Member join enforcement ---
    {
      name: 'guildMemberAdd',
      handler: async (client: any, member: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const blMod = modules.find((m: any) => m.id === 'blacklist');
        if (!blMod || blMod.status !== 'enabled') return;
        const entries: IBlacklistEntry[] = blMod.config?.entries || [];

        if (member.user.bot) {
          const botEntry = entries.find(e => e.type === 'bot' && e.value === member.user.id);
          if (botEntry) {
            await member.kick('Blacklisted bot').catch(() => {});
            context.logSyncEvent(`[Blacklist] Kicked blacklisted bot ${member.user.username} on join.`, 'warn');
          }
        } else {
          const userEntry = entries.find(e => e.type === 'user' && e.value === member.user.id);
          if (userEntry) {
            const action = userEntry.action || 'ban';
            if (action === 'ban') {
              await member.ban({ reason: userEntry.reason || 'Blacklisted user' }).catch(() => {});
              context.logSyncEvent(`[Blacklist] Banned blacklisted user ${member.user.username} on join.`, 'warn');
            } else if (action === 'kick') {
              await member.kick(userEntry.reason || 'Blacklisted user').catch(() => {});
              context.logSyncEvent(`[Blacklist] Kicked blacklisted user ${member.user.username} on join.`, 'warn');
            } else if (action === 'timeout') {
              await member.timeout(5 * 60 * 1000, userEntry.reason || 'Blacklisted user').catch(() => {});
              context.logSyncEvent(`[Blacklist] Timed out blacklisted user ${member.user.username} on join.`, 'warn');
            }
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
        const mod = modules.find((m: any) => m.id === 'blacklist');
        res.json({ entries: mod?.config?.entries || [] });
      }
    },
    {
      path: '/action',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        const { action, payload } = req.body;
        const modules = context.getModulesState();
        const mod = modules.find((m: any) => m.id === 'blacklist');
        let entries: IBlacklistEntry[] = mod?.config?.entries || [];

        if (action === 'add') {
          if (!entries.find(e => e.type === payload.type && e.value === payload.value)) {
            const entry = { ...payload, id: `bl_${Date.now()}`, createdAt: new Date() };
            entries.push(entry);

            // Execute immediate action if the client is connected
            if (context.client && context.guildId && (payload.type === 'user' || payload.type === 'bot')) {
              context.client.guilds.fetch(context.guildId).then(async (guild: any) => {
                if (guild) {
                  const member = await guild.members.fetch(payload.value).catch(() => null);
                  if (member) {
                    if (payload.type === 'bot') {
                      await member.kick('Blacklisted bot').catch(() => {});
                      context.logSyncEvent(`[Blacklist] Kicked blacklisted bot ${member.user.username} immediately (via dashboard).`, 'warn');
                    } else {
                      const act = payload.action || 'ban';
                      if (act === 'ban') {
                        await member.ban({ reason: payload.reason || 'Blacklisted user' }).catch(() => {});
                        context.logSyncEvent(`[Blacklist] Banned blacklisted user ${member.user.username} immediately (via dashboard).`, 'warn');
                      } else if (act === 'kick') {
                        await member.kick(payload.reason || 'Blacklisted user').catch(() => {});
                        context.logSyncEvent(`[Blacklist] Kicked blacklisted user ${member.user.username} immediately (via dashboard).`, 'warn');
                      } else if (act === 'timeout') {
                        await member.timeout(5 * 60 * 1000, payload.reason || 'Blacklisted user').catch(() => {});
                        context.logSyncEvent(`[Blacklist] Timed out blacklisted user ${member.user.username} immediately (via dashboard).`, 'warn');
                      }
                    }
                  }
                }
              }).catch((e: any) => console.error('[Blacklist] Dashboard fetch guild error:', e));
            }
          }
        } else if (action === 'remove') {
          entries = entries.filter(e => e.id !== payload.id);
        } else if (action === 'clear') {
          entries = payload.type === 'all' ? [] : entries.filter(e => e.type !== payload.type);
        }

        context.updateModuleConfig('blacklist', { entries });
        res.json({ success: true, entries });
      }
    }
  ]
};
