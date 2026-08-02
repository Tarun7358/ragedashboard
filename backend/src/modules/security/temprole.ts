import { Message, EmbedBuilder, Client } from 'discord.js';
import { Database } from '../../core/Database.js';
import { createLimeEmbed } from '../../core/UIFactory.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';

const TIMER_EMOJI = '<:timer:1532620491662037123>';
const SHIELD_EMOJI = '<:shield:1532403012751065179>';
const APPROVED_ICON = '<a:approved:1532390590707142956>';
const WRONG_EMOJI = '<:wrong:1532390628330307634>';
const ARROW_ICON = '<:lightpurplearrow:1532621364115013693>';

export function parseDurationToMs(str: string): number | null {
  if (!str) return null;
  const regex = /^(\d+)\s*([smhdw])$/i;
  const match = str.trim().match(regex);
  if (!match) return null;

  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 's': return amount * 1000;
    case 'm': return amount * 60 * 1000;
    case 'h': return amount * 60 * 60 * 1000;
    case 'd': return amount * 24 * 60 * 60 * 1000;
    case 'w': return amount * 7 * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

export function formatMsToHuman(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export async function checkExpiredTempRoles(client: Client): Promise<void> {
  const db = Database.getDb();
  if (!db) return;

  try {
    const now = Math.floor(Date.now() / 1000);
    const expiredRows = await db.all<any>(
      'SELECT * FROM temp_roles WHERE expiresAt <= ?',
      [now]
    );

    for (const row of expiredRows) {
      try {
        const guild = await client.guilds.fetch(row.guildId).catch(() => null);
        if (guild) {
          const member = await guild.members.fetch(row.userId).catch(() => null);
          const role = await guild.roles.fetch(row.roleId).catch(() => null);

          if (member && role && member.roles.cache.has(role.id)) {
            await member.roles.remove(role.id, 'Temporary role duration expired');

            // Send DM to member
            try {
              const dmEmbed = new EmbedBuilder()
                .setColor(0xF59E0B)
                .setTitle(`${TIMER_EMOJI} Temporary Role Expired`)
                .setDescription(`Your temporary role **${role.name}** in **${guild.name}** has expired and been removed.`)
                .setTimestamp();
              await member.send({ embeds: [dmEmbed] });
            } catch { /* DMs off */ }
          }
        }
      } catch (err: any) {
        console.error(`[TempRole Expiry Error] Row ID ${row.id}:`, err.message);
      } finally {
        await db.run('DELETE FROM temp_roles WHERE id = ?', [row.id]);
      }
    }
  } catch (err: any) {
    console.error('[TempRole Engine] Worker ticker error:', err.message);
  }
}

// Register prefix commands for temprole
export function registerTempRoleCommands(): void {
  PrefixRegistry.register({
    name: 'temprole',
    category: 'Security',
    description: 'Assign or manage temporary role durations for members.',
    usage: 'r!temprole <add|remove|list> [@user] [@role] [duration] [reason]',
    aliases: ['temp-role', 'trole'],
    cooldownSeconds: 3,
    userPermissions: ['ManageRoles'],
    botPermissions: ['ManageRoles'],
    execute: async (message: Message, args: string[]) => {
      const sub = args[0]?.toLowerCase();
      const db = Database.getDb();

      if (!db) {
        return message.reply({ embeds: [createLimeEmbed({ title: 'Database Error', description: `${WRONG_EMOJI} Database engine unavailable.` })] });
      }

      if (sub === 'add') {
        const targetMember = message.mentions.members?.first();
        const role = message.mentions.roles?.first();
        const durationStr = args[3];
        const reason = args.slice(4).join(' ') || 'No reason provided';

        if (!targetMember || !role || !durationStr) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Invalid Temporary Role Syntax',
              description: `${WRONG_EMOJI} **Syntax**: \`r!temprole add @user @role <duration> [reason]\`\nExample: \`r!temprole add @User @VIP 1d Temporary Perk\``
            })]
          });
        }

        const durationMs = parseDurationToMs(durationStr);
        if (!durationMs) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Invalid Duration Format',
              description: `${WRONG_EMOJI} Supported duration units: \`s\` (seconds), \`m\` (minutes), \`h\` (hours), \`d\` (days), \`w\` (weeks).\nExample: \`30m\`, \`2h\`, \`7d\`.`
            })]
          });
        }

        const now = Math.floor(Date.now() / 1000);
        const expiresAt = now + Math.floor(durationMs / 1000);

        try {
          await targetMember.roles.add(role.id, `Temporary Role assigned by ${message.author.tag}`);
          await db.run(
            `INSERT INTO temp_roles (guildId, userId, roleId, assignedBy, reason, expiresAt, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [message.guild!.id, targetMember.id, role.id, message.author.id, reason, expiresAt, now]
          );

          const humanDuration = formatMsToHuman(durationMs);
          const embed = createLimeEmbed({
            title: 'Temporary Role Assigned Successfully',
            description: `${APPROVED_ICON} Assigned temporary role ${role} to ${targetMember.user.tag}.`,
            fields: [
              { name: 'Target User', value: `${targetMember.user.tag} (\`${targetMember.id}\`)`, inline: true },
              { name: 'Role', value: `${role.name}`, inline: true },
              { name: 'Duration', value: `\`${humanDuration}\` (Expires <t:${expiresAt}:R>)`, inline: true },
              { name: 'Reason', value: reason, inline: false }
            ]
          });
          return message.reply({ embeds: [embed] });
        } catch (err: any) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Role Assignment Failed',
              description: `${WRONG_EMOJI} Failed to assign role: ${err.message}`
            })]
          });
        }
      }

      if (sub === 'remove') {
        const targetMember = message.mentions.members?.first();
        const role = message.mentions.roles?.first();

        if (!targetMember || !role) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Invalid Syntax',
              description: `${WRONG_EMOJI} **Syntax**: \`r!temprole remove @user @role\``
            })]
          });
        }

        try {
          await targetMember.roles.remove(role.id, `Temporary Role revoked by ${message.author.tag}`);
          await db.run(
            'DELETE FROM temp_roles WHERE guildId = ? AND userId = ? AND roleId = ?',
            [message.guild!.id, targetMember.id, role.id]
          );

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Temporary Role Revoked',
              description: `${APPROVED_ICON} Revoked temporary role ${role} from ${targetMember.user.tag}.`
            })]
          });
        } catch (err: any) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Role Revocation Failed',
              description: `${WRONG_EMOJI} Failed to remove role: ${err.message}`
            })]
          });
        }
      }

      if (sub === 'list') {
        const rows = await db.all<any>(
          'SELECT * FROM temp_roles WHERE guildId = ? ORDER BY expiresAt ASC',
          [message.guild!.id]
        );

        if (rows.length === 0) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Active Temporary Roles',
              description: `${SHIELD_EMOJI} There are currently no active temporary role assignments in this server.`
            })]
          });
        }

        const lines = rows.map((r: any) => 
          `• <@${r.userId}> — <@&${r.roleId}> | Expires <t:${r.expiresAt}:R> | Reason: *${r.reason || 'N/A'}*`
        );

        const embed = createLimeEmbed({
          title: `Active Temporary Roles (${rows.length})`,
          description: lines.join('\n')
        });
        return message.reply({ embeds: [embed] });
      }

      return message.reply({
        embeds: [createLimeEmbed({
          title: 'Temporary Role Manual',
          description: [
            `> ${ARROW_ICON} **\`r!temprole add @user @role <duration> [reason]\`** — Assign temp role`,
            `> ${ARROW_ICON} **\`r!temprole remove @user @role\`** — Revoke active temp role`,
            `> ${ARROW_ICON} **\`r!temprole list\`** — List active server temp roles`
          ].join('\n')
        })]
      });
    }
  });
}
