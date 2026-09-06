import { Message, EmbedBuilder, Client } from 'discord.js';
import { Database } from '../../core/Database.js';
import { createLimeEmbed } from '../../core/UIFactory.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';

const TIMER_EMOJI = '<:timer:1532620491662037123>';
const SHIELD_EMOJI = '<:security:1546142576984203336>';
const APPROVED_ICON = '<a:approved:1532390590707142956>';
const WRONG_EMOJI = '<a:wrong:1546155193303957504>';
const ARROW_ICON = '<:lightpurplearrow:1532621364115013693>';

export function parseDurationToMs(str: string): number | null {
  if (!str) return null;
  const regex = /^(\d+)\s*([smhdw])$/i;
  const match = str.trim().match(regex);
  if (!match) return null;

  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  let ms: number;
  switch (unit) {
    case 's': ms = amount * 1000; break;
    case 'm': ms = amount * 60 * 1000; break;
    case 'h': ms = amount * 60 * 60 * 1000; break;
    case 'd': ms = amount * 24 * 60 * 60 * 1000; break;
    case 'w': ms = amount * 7 * 24 * 60 * 60 * 1000; break;
    default:  return null;
  }

  // BUG-15 FIX: Cap at 365 days to prevent near-permanent "temporary" roles
  const MAX_MS = 365 * 24 * 60 * 60 * 1000;
  if (ms > MAX_MS) return -1; // Sentinel: exceeded cap

  return ms;
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
      if (message.guild && (sub === 'add' || sub === 'remove')) {
        const { isOwnerOrExtraOwner, checkWhitelistPermission } = await import('../../utils/whitelistCheck.js');
        const isOwner = await isOwnerOrExtraOwner(message.author.id, message.guild);
        const isWhitelisted = await checkWhitelistPermission(message.author.id, message.guild, {}, sub === 'add' ? 'anti_role_grant' : 'anti_role_remove');
        if (!isOwner && !isWhitelisted) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Access Denied',
              description: `${WRONG_EMOJI} 🔒 **Restricted Command**: Temporary role commands can only be executed by the **Server Owner**, **Extra Owners**, and **Whitelisted Members**.\nNormal Administrator permissions are not sufficient.`
            })]
          });
        }
      }

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

        // BUG-15 FIX: Reject durations exceeding 365 days
        if (durationMs === -1) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Duration Exceeds Maximum',
              description: `${WRONG_EMOJI} Temporary role duration cannot exceed **365 days**. Please use a shorter duration.`
            })]
          });
        }

        const now = Math.floor(Date.now() / 1000);
        const expiresAt = now + Math.floor(durationMs / 1000);

        try {
          // BUG-09 FIX: Write DB record FIRST, then assign the Discord role.
          // If the DB write fails, no role is added on Discord.
          // If the Discord role add fails, we clean up the DB record.
          await db.run(
            `INSERT INTO temp_roles (guildId, userId, roleId, assignedBy, reason, expiresAt, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [message.guild!.id, targetMember.id, role.id, message.author.id, reason, expiresAt, now]
          );

          try {
            await targetMember.roles.add(role.id, `Temporary Role assigned by ${message.author.tag}`);
          } catch (roleErr: any) {
            // Roll back the DB record if the Discord API call failed
            await db.run(
              'DELETE FROM temp_roles WHERE guildId = ? AND userId = ? AND roleId = ? AND expiresAt = ?',
              [message.guild!.id, targetMember.id, role.id, expiresAt]
            );
            throw roleErr; // Re-throw so the outer catch block reports the error
          }

          const humanDuration = formatMsToHuman(durationMs);
          const { buildMinimalAction } = await import('../../core/UIFactory.js');
          const embed = buildMinimalAction({
            user: message.author,
            action: 'Has Given',
            target: role,
            toOrFrom: 'to',
            extra: targetMember,
            duration: humanDuration,
            reason: reason !== 'No reason provided' ? reason : undefined
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

          const { buildMinimalAction } = await import('../../core/UIFactory.js');
          const embed = buildMinimalAction({
            user: message.author,
            action: 'Has Revoked',
            target: role,
            toOrFrom: 'from',
            extra: targetMember
          });
          return message.reply({ embeds: [embed] });
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
          `• <@${r.userId}> — <@&${r.roleId}> | Expires <t:${r.expiresAt}:R> | Reason: **${r.reason || 'N/A'}**`
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
