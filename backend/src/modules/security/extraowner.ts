import { Message } from 'discord.js';
import { Database } from '../../core/Database.js';
import { createLimeEmbed } from '../../core/UIFactory.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';

import { updateExtraOwnerInCache, removeExtraOwnerFromCache, loadExtraOwnersCache } from '../../utils/whitelistCheck.js';

import { TwoFactorManager } from '../../core/security/TwoFactorManager.js';

const VIP_EMOJI = '<:vip:1532620837117759508>';
const SHIELD_EMOJI = '<:shield:1532403012751065179>';
const APPROVED_ICON = '<a:approved:1532390590707142956>';
const WRONG_EMOJI = '<:wrong:1532390628330307634>';
const ARROW_ICON = '<:lightpurplearrow:1532621364115013693>';

export function registerExtraOwnerCommands(): void {
  PrefixRegistry.register({
    name: 'botleave',
    category: 'Security',
    description: 'Safely remove the bot from the server requiring 2FA PIN authorization from the Server Owner.',
    usage: 'r!botleave [6-digit-pin]',
    aliases: ['leavebot', 'leave-server'],
    cooldownSeconds: 5,
    dangerLevel: 'High',
    execute: async (message: Message, args: string[]) => {
      const guild = message.guild;
      if (!guild) return message.reply('This command can only be executed in a server.');

      if (message.author.id !== guild.ownerId) {
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Owner Authority Required',
            description: `${WRONG_EMOJI} **Access Denied**: Only the primary Discord Server Owner (<@${guild.ownerId}>) can authorize bot departure.`
          })]
        });
      }

      const tfaCfg = await TwoFactorManager.getPrebot2FAConfig(guild.id);

      if (!tfaCfg || !tfaCfg.pin) {
        return message.reply({
          embeds: [createLimeEmbed({
            title: '2FA Setup Required For Departure',
            description: `${SHIELD_EMOJI} **Mandatory 2FA Departure Gate**: No 2FA passcode is set for **${guild.name}**.\n\nTo prevent unauthorized bot kicks, the Server Owner (<@${guild.ownerId}>) MUST set a 6-digit 2FA passcode first before authorizing bot departure:\n\n> 1. \`r!prebot 2fa set <6-digit-pin>\`\n> 2. \`r!botleave <6-digit-pin>\``,
            color: 0xF59E0B
          })]
        });
      }

      const pinArg = args.find(a => /^\d{6}$/.test(a.trim()));
      if (!pinArg) {
        return message.reply({
          embeds: [createLimeEmbed({
            title: '2FA Passcode Required',
            description: `${SHIELD_EMOJI} **Mandatory 2FA Gate**: Server departure requires your 6-digit Owner 2FA Passcode.\n\nPlease supply your 6-digit passcode to authorize bot removal:\n> \`r!botleave <6-digit-pin>\``,
            color: 0xF59E0B
          })]
        });
      }

      const isValid = TwoFactorManager.verifyPin(tfaCfg.pin, pinArg);
      if (!isValid) {
        return message.reply({
          embeds: [createLimeEmbed({
            title: '2FA Verification Failed',
            description: `${WRONG_EMOJI} Invalid 6-digit passcode. Bot departure **REJECTED**.`,
            color: 0xEF4444
          })]
        });
      }

      await message.reply({
        embeds: [createLimeEmbed({
          title: 'Bot Departure Authorized',
          description: `${APPROVED_ICON} 2FA PIN Verified. Rage Optimiser is now departing **${guild.name}**. All server snapshots and configuration data remain securely saved in cloud memory.`,
          color: 0x10B981
        })]
      });

      setTimeout(() => {
        guild.leave().catch(err => console.error('[BotLeave] Failed to leave guild:', err));
      }, 1500);
    }
  });
  PrefixRegistry.register({
    name: 'extraowner',
    category: 'Security',
    description: 'Manage delegated Extra Guild Owners with custom security authorization flags.',
    usage: 'r!extraowner <add|remove|list|reset> [@user]',
    aliases: ['extra-owner', 'extraowners'],
    cooldownSeconds: 3,
    userPermissions: [], // Enforcement checked dynamically against guild.ownerId
    botPermissions: [],
    execute: async (message: Message, args: string[]) => {
      const isPrimaryOwner = message.author.id === message.guild?.ownerId || 
                             message.author.id === message.client.application?.owner?.id;

      if (!isPrimaryOwner) {
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Owner Authority Required',
            description: `${WRONG_EMOJI} **Access Denied**: Only the primary Discord Server Owner (<@${message.guild?.ownerId}>) can manage Extra Owners.`
          })]
        });
      }

      const sub = args[0]?.toLowerCase();
      const db = Database.getDb();

      if (!db) {
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Database Error',
            description: `${WRONG_EMOJI} Database engine unavailable.`
          })]
        });
      }

      if (sub === 'add') {
        const targetMember = message.mentions.members?.first();
        if (!targetMember) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Invalid Syntax',
              description: `${WRONG_EMOJI} **Syntax**: \`r!extraowner add @user\``
            })]
          });
        }

        if (targetMember.id === message.guild?.ownerId) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Already Primary Owner',
              description: `${WRONG_EMOJI} <@${targetMember.id}> is already the primary Discord Server Owner.`
            })]
          });
        }

        const now = Math.floor(Date.now() / 1000);
        const defaultPerms = JSON.stringify({
          antinukeBypass: true,
          manageWhitelists: true,
          manageLockdowns: true,
          manageQuarantine: true
        });

        try {
          await db.run(
            `INSERT OR REPLACE INTO extra_owners (guildId, userId, addedBy, permissionsJson, addedAt)
             VALUES (?, ?, ?, ?, ?)`,
            [message.guild!.id, targetMember.id, message.author.id, defaultPerms, now]
          );

          updateExtraOwnerInCache(message.guild!.id, targetMember.id, defaultPerms);

          const embed = createLimeEmbed({
            title: 'Extra Owner Granted Successfully',
            description: `${APPROVED_ICON} Granted delegated Extra Owner authority to ${targetMember.user.tag}.`,
            fields: [
              { name: 'Extra Owner Target', value: `${targetMember.user.tag} (\`${targetMember.id}\`)`, inline: true },
              { name: 'Granted By', value: `<@${message.author.id}>`, inline: true },
              { name: 'Delegated Permissions', value: '`Anti-Nuke Immunity`, `Whitelist Admin`, `Lockdowns`, `Quarantine`', inline: false }
            ]
          });
          return message.reply({ embeds: [embed] });
        } catch (err: any) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Extra Owner Assignment Failed',
              description: `${WRONG_EMOJI} Error: ${err.message}`
            })]
          });
        }
      }

      if (sub === 'remove') {
        const targetMember = message.mentions.members?.first();
        if (!targetMember) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Invalid Syntax',
              description: `${WRONG_EMOJI} **Syntax**: \`r!extraowner remove @user\``
            })]
          });
        }

        try {
          await db.run(
            'DELETE FROM extra_owners WHERE guildId = ? AND userId = ?',
            [message.guild!.id, targetMember.id]
          );

          removeExtraOwnerFromCache(message.guild!.id, targetMember.id);

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Extra Owner Revoked',
              description: `${APPROVED_ICON} Revoked Extra Owner status from ${targetMember.user.tag}.`
            })]
          });
        } catch (err: any) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Revocation Failed',
              description: `${WRONG_EMOJI} Error: ${err.message}`
            })]
          });
        }
      }

      if (sub === 'list') {
        const rows = await db.all<any>(
          'SELECT * FROM extra_owners WHERE guildId = ? ORDER BY addedAt ASC',
          [message.guild!.id]
        );

        if (rows.length === 0) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Extra Owner Directory',
              description: `${SHIELD_EMOJI} No delegated Extra Owners have been assigned for this server.`
            })]
          });
        }

        const lines = rows.map((r: any) => 
          `• ${VIP_EMOJI} <@${r.userId}> (\`${r.userId}\`) — Added <t:${r.addedAt}:R> by <@${r.addedBy}>`
        );

        const embed = createLimeEmbed({
          title: `Extra Owners Directory (${rows.length})`,
          description: lines.join('\n')
        });
        return message.reply({ embeds: [embed] });
      }

      if (sub === 'reset') {
        try {
          await db.run('DELETE FROM extra_owners WHERE guildId = ?', [message.guild!.id]);
          await loadExtraOwnersCache(message.guild!.id);
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Extra Owners Reset',
              description: `${APPROVED_ICON} Cleared all delegated Extra Owners for this server.`
            })]
          });
        } catch (err: any) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Reset Failed',
              description: `${WRONG_EMOJI} Error: ${err.message}`
            })]
          });
        }
      }

      return message.reply({
        embeds: [createLimeEmbed({
          title: 'Extra Owner Management Manual',
          description: [
            `> ${ARROW_ICON} **\`r!extraowner add @user\`** — Grant Extra Owner status & Anti-Nuke immunity`,
            `> ${ARROW_ICON} **\`r!extraowner remove @user\`** — Revoke Extra Owner status`,
            `> ${ARROW_ICON} **\`r!extraowner list\`** — View server Extra Owner directory`,
            `> ${ARROW_ICON} **\`r!extraowner reset\`** — Wipe all Extra Owners`
          ].join('\n')
        })]
      });
    }
  });
}

export function registerOwnerBroadcastCommands(): void {
  PrefixRegistry.register({
    name: 'ownerbroadcast',
    category: 'Security',
    description: 'Developer utility to contact and broadcast announcements directly to all Server Owners across all guilds.',
    usage: 'r!ownerbroadcast <send|test|list|stats> [message]',
    aliases: ['dmowners', 'contactowners', 'broadcastowners', 'ownerannounce'],
    cooldownSeconds: 5,
    dangerLevel: 'High',
    execute: async (message: Message, args: string[]) => {
      const { PrefixPermissionManager } = await import('../../core/prefix/PrefixPermissionManager.js');
      const isDev = PrefixPermissionManager.isDeveloper(message.author.id, message) ||
                    message.author.id === message.client.application?.owner?.id ||
                    (process.env.OWNER_ID && message.author.id === process.env.OWNER_ID);

      if (!isDev) {
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Developer Authority Required',
            description: `${WRONG_EMOJI} **Access Denied**: Only the Bot Developer/Bot Owner can use the server owner broadcast utility.`
          })]
        });
      }

      const sub = args[0]?.toLowerCase();

      // 1. List all servers & owners (`r!ownerbroadcast list`)
      if (sub === 'list') {
        const guilds = Array.from(message.client.guilds.cache.values());
        if (guilds.length === 0) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Server Owner Directory',
              description: 'The bot is not currently present in any active servers.'
            })]
          });
        }

        const lines: string[] = [];
        for (const guild of guilds.slice(0, 25)) {
          let ownerTag = 'Unknown Owner';
          try {
            const owner = await guild.fetchOwner().catch(() => null);
            if (owner) ownerTag = `<@${owner.id}> (\`${owner.user.tag}\`)`;
          } catch (e) {}

          lines.push(`• **${guild.name}** (\`${guild.id}\`) — Owner: ${ownerTag} | Members: \`${guild.memberCount}\``);
        }

        const embed = createLimeEmbed({
          title: `🌐 Server Owner Directory (${guilds.length} Servers)`,
          description: lines.join('\n') + (guilds.length > 25 ? `\n\n*...and ${guilds.length - 25} more servers.*` : '')
        });
        return message.reply({ embeds: [embed] });
      }

      // 2. Telemetry Stats (`r!ownerbroadcast stats`)
      if (sub === 'stats') {
        const guilds = Array.from(message.client.guilds.cache.values());
        const uniqueOwnerIds = new Set<string>();

        for (const guild of guilds) {
          if (guild.ownerId) uniqueOwnerIds.add(guild.ownerId);
        }

        const embed = createLimeEmbed({
          title: '📡 Server Owner Broadcast Telemetry',
          fields: [
            { name: 'Active Guilds Connected', value: `\`${guilds.length}\` servers`, inline: true },
            { name: 'Unique Server Owners', value: `\`${uniqueOwnerIds.size}\` owners`, inline: true },
            { name: 'Target Coverage', value: `\`100%\` of server owners`, inline: true }
          ]
        });
        return message.reply({ embeds: [embed] });
      }

      // 3. Test DM (`r!ownerbroadcast test <message>`)
      if (sub === 'test') {
        const broadcastText = args.slice(1).join(' ').trim();
        if (!broadcastText) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Test Broadcast Syntax',
              description: `${WRONG_EMOJI} **Syntax**: \`r!ownerbroadcast test <announcement message>\``
            })]
          });
        }

        const testEmbed = createLimeEmbed({
          title: '📢 [TEST PREVIEW] Developer Announcement to Server Owners',
          description: [
            `> ### Message from Rage Optimiser Developers:\n`,
            `${broadcastText}\n`,
            `--------------------------------------------------`,
            `• **Sent By**: Developer ${message.author.tag}`,
            `• **Notice**: This is an official developer update regarding your Discord server.`
          ].join('\n'),
          footerText: 'Rage Optimiser Enterprise • Official Owner Contact Stream'
        });

        try {
          await message.author.send({ embeds: [testEmbed] });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Test DM Delivered',
              description: `${APPROVED_ICON} Preview DM sent to your direct messages (<@${message.author.id}>)! Verify formatting before executing \`r!ownerbroadcast send\`.`
            })]
          });
        } catch (e: any) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Test DM Failed',
              description: `${WRONG_EMOJI} Could not send test DM: \`${e.message}\`. Please open your DMs and try again.`
            })]
          });
        }
      }

      // 4. Send Live Broadcast (`r!ownerbroadcast send <message>`)
      if (sub === 'send' || sub === 'dispatch') {
        const broadcastText = args.slice(1).join(' ').trim();
        if (!broadcastText) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Owner Broadcast Syntax',
              description: `${WRONG_EMOJI} **Syntax**: \`r!ownerbroadcast send <announcement message>\``
            })]
          });
        }

        const statusMsg = await message.reply({
          embeds: [createLimeEmbed({
            title: '⏳ Initiating Server Owner Broadcast...',
            description: 'Fetching server owners and preparing direct message channels...'
          })]
        });

        const guilds = Array.from(message.client.guilds.cache.values());
        const processedOwnerIds = new Set<string>();
        let successCount = 0;
        let failCount = 0;
        let totalOwners = 0;

        for (const guild of guilds) {
          try {
            const owner = await guild.fetchOwner().catch(() => null);
            if (!owner || processedOwnerIds.has(owner.id)) continue;
            processedOwnerIds.add(owner.id);
            totalOwners++;

            const dmEmbed = createLimeEmbed({
              title: `📢 Developer Announcement — ${guild.name}`,
              description: [
                `> ### Official Update for Server Owners:\n`,
                `${broadcastText}\n`,
                `--------------------------------------------------`,
                `• **Server**: **${guild.name}** (\`${guild.id}\`)`,
                `• **Sender**: Developer ${message.author.tag}`,
                `• **Support & Contact**: If you have questions, contact bot developers.`
              ].join('\n'),
              footerText: 'Rage Optimiser Enterprise • Server Owner Direct Notice'
            });

            await owner.send({ embeds: [dmEmbed] });
            successCount++;

            // Rate-limit throttle (300ms delay per DM to comply with Discord API rules)
            await new Promise(res => setTimeout(res, 300));
          } catch (err) {
            failCount++;
          }
        }

        const resultEmbed = createLimeEmbed({
          title: '📢 Server Owner Broadcast Completed',
          description: [
            `${APPROVED_ICON} Direct message broadcast dispatched across all server owners!\n`,
            `> • **Total Unique Server Owners**: \`${totalOwners}\``,
            `> • **Successfully Delivered**: \`${successCount}\` DMs`,
            `> • **Failed / DMs Closed**: \`${failCount}\` users`
          ].join('\n')
        });

        return statusMsg.edit({ embeds: [resultEmbed] });
      }

      // Default Command Manual
      return message.reply({
        embeds: [createLimeEmbed({
          title: 'Server Owner Broadcast Utility Manual',
          description: [
            `> ${ARROW_ICON} **\`r!ownerbroadcast send <message>\`** — Dispatch DM announcement to ALL server owners`,
            `> ${ARROW_ICON} **\`r!ownerbroadcast test <message>\`** — Send preview DM to yourself to check formatting`,
            `> ${ARROW_ICON} **\`r!ownerbroadcast list\`** — Display directory of all servers & owner tags`,
            `> ${ARROW_ICON} **\`r!ownerbroadcast stats\`** — View total servers & unique owner count`
          ].join('\n')
        })]
      });
    }
  });
}

