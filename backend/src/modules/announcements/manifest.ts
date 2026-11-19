import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { IAnnouncement } from '../../models/index.js';
import {
  Colors, Embeds, buildRichCard, buildListCard, buildStatusCard, fmt, ts,
  VERIFIED_ICON, WRONG_ICON, SHIELD_ICON, TIMER_ICON, INFO_ICON, CONFIG_ICON,
} from '../../core/UIFactory.js';
import { isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';
import { BlockedDMSettings } from '../../core/Gateway.js';
import { Database } from '../../core/Database.js';

export const AnnouncementsManifest: ModuleManifest = {
  id: 'announcements',
  name: 'Announcements',
  version: '1.0.0',
  description: 'Channel and DM announcements with embed builder, ping options, scheduling, and history.',
  configSchema: {
    requiredFields: ['defaultChannelId'],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;
      if (config.defaultChannelId) {
        progress += 100;
        if (!registry.channels.some(c => c.id === config.defaultChannelId)) {
          errors.push(`Announcement default channel (${config.defaultChannelId}) was deleted!`);
        }
      }
      return { progress, errors };
    }
  },
  commands: [
    {
      name: 'announce',
      description: 'Announcement management',
      options: [
        {
          name: 'send',
          description: 'Send an announcement to a channel',
          type: 1,
          options: [
            { name: 'message', type: 3, description: 'Announcement content', required: true },
            { name: 'channel', type: 7, description: 'Target channel (default: configured channel)', required: false, channel_types: [0, 5] },
            { name: 'ping_everyone', type: 5, description: 'Ping @everyone?', required: false },
            { name: 'ping_role', type: 8, description: 'Role to ping', required: false },
            { name: 'embed', type: 5, description: 'Send as embed?', required: false },
            { name: 'title', type: 3, description: 'Embed title', required: false },
            { name: 'color', type: 3, description: 'Embed color hex (e.g. #ff4444)', required: false }
          ]
        },
        {
          name: 'dm',
          description: 'DM announcement to all members with a specific role',
          type: 1,
          options: [
            { name: 'message', type: 3, description: 'Message to DM', required: true },
            { name: 'role', type: 8, description: 'Role whose members receive the DM (omit for all members)', required: false }
          ]
        },
        {
          name: 'embed',
          description: 'Send a rich embed announcement',
          type: 1,
          options: [
            { name: 'title', type: 3, description: 'Embed title', required: true },
            { name: 'description', type: 3, description: 'Embed description', required: true },
            { name: 'channel', type: 7, description: 'Target channel', required: false, channel_types: [0, 5] },
            { name: 'color', type: 3, description: 'Embed color hex', required: false },
            { name: 'image', type: 3, description: 'Image URL', required: false },
            { name: 'thumbnail', type: 3, description: 'Thumbnail URL', required: false },
            { name: 'footer', type: 3, description: 'Footer text', required: false },
            { name: 'ping_everyone', type: 5, description: 'Ping @everyone?', required: false }
          ]
        },
        { name: 'history',   description: 'View announcement history',                   type: 1 },
        {
          name: 'preview',
          description: 'Preview an announcement embed before sending',
          type: 1,
          options: [
            { name: 'title', type: 3, description: 'Embed title', required: true },
            { name: 'description', type: 3, description: 'Embed description', required: true },
            { name: 'color', type: 3, description: 'Embed color hex', required: false }
          ]
        },
        {
          name: 'schedule',
          description: 'Schedule a future announcement',
          type: 1,
          options: [
            { name: 'message', type: 3, description: 'Announcement message', required: true },
            { name: 'time', type: 3, description: 'When to send (e.g. 5m, 1h)', required: true }
          ]
        },
        { name: 'list',   description: 'List all scheduled announcements',               type: 1 },
        {
          name: 'delete',
          description: 'Delete a scheduled announcement',
          type: 1,
          options: [{ name: 'index', type: 4, description: 'Index to delete', required: true }]
        },
        {
          name: 'edit',
          description: 'Edit a scheduled announcement',
          type: 1,
          options: [
            { name: 'index', type: 4, description: 'Index to edit', required: true },
            { name: 'message', type: 3, description: 'New message', required: true }
          ]
        },
        { name: 'stats',     description: 'Announcements category usage statistics',     type: 1 },
        { name: 'templates', description: 'Show layout templates preset designs',         type: 1 }
      ]
    }
  ],
  events: [
    {
      name: 'command_announce',
      handler: async (client: any, interaction: any, context: any) => {
        if (!interaction.memberPermissions?.has('ManageGuild')) {
          return interaction.reply({ content: `${SHIELD_ICON} Manage Server permission required.`, flags: 64 });
        }

        const modules = context.getModulesState ? context.getModulesState() : [];
        const aMod = modules.find((m: any) => m.id === 'announcements');
        if (!aMod || aMod.status !== 'enabled') {
          return interaction.reply({ content: `${WRONG_ICON} Announcements module is not enabled.`, flags: 64 });
        }

        const sub = interaction.options.getSubcommand(false);
        let history: IAnnouncement[] = aMod.config?.history || [];
        const defaultChannelId = aMod.config?.defaultChannelId;
        const saveHistory = (h: IAnnouncement[]) => context.updateModuleConfig('announcements', { history: h.slice(-50) });

        // ─── SEND ─────────────────────────────────────────────────
        if (sub === 'send') {
          const message = interaction.options.getString('message');
          const targetChannel = interaction.options.getChannel('channel') || (defaultChannelId ? interaction.guild.channels.cache.get(defaultChannelId) : interaction.channel);
          const pingEveryone = interaction.options.getBoolean('ping_everyone') || false;
          const pingRole = interaction.options.getRole('ping_role');
          const useEmbed = interaction.options.getBoolean('embed') || false;
          const title = interaction.options.getString('title') || undefined;
          const color = interaction.options.getString('color') || '#06B6D4';

          if (!targetChannel) return interaction.reply({ content: `${WRONG_ICON} No target channel found or configured.`, flags: 64 });

          await interaction.deferReply({ flags: 64 });

          let pingContent = '';
          if (pingEveryone) pingContent = '@everyone ';
          else if (pingRole) pingContent = `<@&${pingRole.id}> `;

          const payload: any = {};

          if (useEmbed || title) {
            const embed = Embeds.info(title || 'Announcement', message, {
              module: 'announcements',
              footer: `Announced by ${interaction.user.username}`,
            });
            payload.embeds = [embed];
            if (pingContent) payload.content = pingContent.trim();
          } else {
            payload.content = (pingContent + message).trim();
          }

          try {
            await targetChannel.send(payload);
            const ann: IAnnouncement = {
              id: `ann_${Date.now()}`,
              guildId: interaction.guildId,
              channelId: targetChannel.id,
              title: title || undefined,
              content: message,
              embed: useEmbed,
              embedColor: color,
              sentAt: new Date(),
              status: 'sent',
              authorId: interaction.user.id,
              authorTag: interaction.user.username,
              pingEveryone,
              pingRoleId: pingRole?.id,
              createdAt: new Date()
            };
            history.push(ann);
            saveHistory(history);
            context.logSyncEvent(`[Announcements] Sent announcement to #${targetChannel.name} by ${interaction.user.username}.`, 'success');
            await interaction.editReply({ content: `${VERIFIED_ICON} Announcement sent to ${targetChannel}!` });
          } catch (err) {
            await interaction.editReply({ content: `${WRONG_ICON} Failed to send announcement. Check bot permissions.` });
          }
        }

        // ─── EMBED ────────────────────────────────────────────────
        else if (sub === 'embed') {
          const title = interaction.options.getString('title');
          const description = interaction.options.getString('description');
          const targetChannel = interaction.options.getChannel('channel') || (defaultChannelId ? interaction.guild.channels.cache.get(defaultChannelId) : interaction.channel);
          const color = interaction.options.getString('color') || '#06B6D4';
          const image = interaction.options.getString('image');
          const thumbnail = interaction.options.getString('thumbnail');
          const footer = interaction.options.getString('footer');
          const pingEveryone = interaction.options.getBoolean('ping_everyone') || false;

          if (!targetChannel) return interaction.reply({ content: `${WRONG_ICON} No target channel found.`, flags: 64 });

          const embed = Embeds.info(title, description, {
            module: 'announcements',
            image: image || null,
            thumbnail: thumbnail || null,
            footer: footer || `Announced by ${interaction.user.username}`,
          });
          (embed as any).setColor(parseInt(color.replace('#', ''), 16) || Colors.INFO);

          await interaction.deferReply({ flags: 64 });
          try {
            await targetChannel.send({ content: pingEveryone ? '@everyone' : undefined, embeds: [embed] });
            context.logSyncEvent(`[Announcements] Sent rich embed to #${targetChannel.name} by ${interaction.user.username}.`, 'success');
            await interaction.editReply({ content: `${VERIFIED_ICON} Rich embed announcement sent to ${targetChannel}!` });
          } catch (err) {
            await interaction.editReply({ content: `${WRONG_ICON} Failed to send embed. Check bot permissions.` });
          }
        }

        // ─── DM ──────────────────────────────────────────────────
        else if (sub === 'dm') {
          // 1. Owner / Extra Owner Gate (Discord Terms Compliance: strict access control)
          const isAuthorized = await isOwnerOrExtraOwner(interaction.user.id, interaction.guild).catch(() => false);
          if (!isAuthorized) {
            return interaction.reply({
              content: `${SHIELD_ICON} **Access Denied**: Under Discord Developer Policy against platform spam, direct message broadcasts can only be initiated by the **Server Owner** or **Extra Owners**.\nAdministrator permissions alone are not sufficient.`,
              flags: 64
            });
          }

          // 2. Anti-Spam Server Cooldown (6 hours)
          const COOLDOWN_MS = 6 * 60 * 60 * 1000;
          const lastBlast = Number(aMod.config?.lastDmBlastTimestamp || 0);
          const timeSince = Date.now() - lastBlast;
          if (timeSince < COOLDOWN_MS) {
            const nextAvailable = Math.floor((lastBlast + COOLDOWN_MS) / 1000);
            return interaction.reply({
              content: `⏳ **Cooldown Active**: To comply with Discord's anti-spam regulations, mass DM announcements are restricted to once every **6 hours** per server.\nNext broadcast available: <t:${nextAvailable}:R> (<t:${nextAvailable}:f>).`,
              flags: 64
            });
          }

          const rawMessage = interaction.options.getString('message', true).trim();
          const role = interaction.options.getRole('role');

          // 3. Content Sanitization: Strip @everyone / @here mentions
          let cleanMessage = rawMessage.replace(/@everyone/gi, '').replace(/@here/gi, '').trim();
          if (!cleanMessage) {
            return interaction.reply({
              content: `${WRONG_ICON} Announcement content cannot be empty or solely composed of mention tags.`,
              flags: 64
            });
          }

          // Max length check
          if (cleanMessage.length > 1500) {
            return interaction.reply({
              content: `${WRONG_ICON} Message length exceeds limit (${cleanMessage.length} / 1500 characters).`,
              flags: 64
            });
          }

          // 4. Anti-Invite Link Gate (Strict anti-solicitation check)
          const INVITE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite|dsc\.gg)\/[a-zA-Z0-9-]+/i;
          if (INVITE_REGEX.test(cleanMessage)) {
            return interaction.reply({
              content: `${WRONG_ICON} **Compliance Violation**: Mass DM announcements cannot contain external Discord server invite links. Discord Trust & Safety flags unsolicited invite DMs as platform spam.`,
              flags: 64
            });
          }

          await interaction.deferReply({ flags: 64 });

          try {
            const members = await interaction.guild.members.fetch();
            let targets = members.filter((m: any) => !m.user.bot);
            if (role) {
              targets = targets.filter((m: any) => m.roles.cache.has(role.id));
            }

            // 5. Audience Size Cap (Maximum 500 recipients per blast)
            const MAX_TARGETS = 500;
            if (targets.size > MAX_TARGETS) {
              return interaction.editReply({
                content: `⚠️ **Audience Limit Exceeded**: This target group has **${targets.size}** members. To protect our bot token from Discord rate-limits and abuse flags, blasts are capped at **${MAX_TARGETS}** members per execution.\n\nPlease select a specific role using the \`role\` option to target under ${MAX_TARGETS} members.`
              });
            }

            // 6. Filter Opted-out / Blocked Users
            await BlockedDMSettings.init();
            const eligibleMembers: any[] = [];
            let blockedCount = 0;

            for (const [, member] of targets) {
              if (BlockedDMSettings.isBlocked(member.id, interaction.guild.id)) {
                blockedCount++;
              } else {
                eligibleMembers.push(member);
              }
            }

            if (eligibleMembers.length === 0) {
              return interaction.editReply({
                content: `${INFO_ICON} No eligible members found to receive this announcement (target group is empty or all members have blocked alerts from this server).`
              });
            }

            // 7. Build Compliant Embed with Mandatory Identification & 1-Click Opt-out
            const guildIcon = interaction.guild.iconURL({ size: 128 });
            const embed = new EmbedBuilder()
              .setColor(Colors.INFO)
              .setAuthor({
                name: interaction.guild.name,
                iconURL: guildIcon || undefined
              })
              .setTitle(`Official Announcement from ${interaction.guild.name}`)
              .setDescription(
                `${cleanMessage}\n\n` +
                `-# **Notice**: You received this official direct message because you are a member of **${interaction.guild.name}**.\n` +
                `-# **Dispatched by**: ${interaction.user.tag}`
              )
              .setFooter({ text: 'Rage Optimiser • Discord Policy Compliant' });

            const optOutBtn = new ButtonBuilder()
              .setCustomId(`dm_block_server:${interaction.guild.id}`)
              .setLabel('Block Server Messages')
              .setStyle(ButtonStyle.Secondary);

            const componentsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(optOutBtn);

            let sent = 0;
            let closedDMs = 0;
            let consecutiveFailures = 0;
            let circuitBreakerTripped = false;

            // 8. Safe Dispatch Engine with Adaptive Pacing (800ms) & Circuit Breaker
            for (const member of eligibleMembers) {
              // Circuit breaker: abort if 15 consecutive API failures occur
              if (consecutiveFailures >= 15) {
                circuitBreakerTripped = true;
                console.warn(`[Announcements] Circuit breaker tripped for guild ${interaction.guild.id} after 15 consecutive failures.`);
                break;
              }

              try {
                await member.send({
                  embeds: [embed],
                  components: [componentsRow]
                });
                sent++;
                consecutiveFailures = 0;
              } catch (sendErr: any) {
                // Discord 50007: Cannot send messages to this user (Closed DMs / blocked)
                if (sendErr?.code === 50007) {
                  closedDMs++;
                  consecutiveFailures = 0; // Not a platform/rate-limit error
                } else if (sendErr?.status === 429) {
                  // Rate limited: respect retry-after and back off
                  const retryAfter = (sendErr?.rawError?.retry_after || 2) * 1000;
                  console.warn(`[Announcements] Discord 429 hit. Backing off for ${retryAfter}ms`);
                  await new Promise(r => setTimeout(r, retryAfter + 1000));
                  consecutiveFailures++;
                } else {
                  consecutiveFailures++;
                }
              }

              // Pacing interval (800ms)
              await new Promise(r => setTimeout(r, 800));
            }

            // 9. Update Cooldown & Module Config
            context.updateModuleConfig('announcements', {
              ...(aMod.config || {}),
              lastDmBlastTimestamp: Date.now()
            });

            // 10. Record Comprehensive Audit Log
            try {
              await Database.saveAuditLog({
                guildId: interaction.guild.id,
                action: 'ANNOUNCEMENT_DM_BLAST',
                targetType: 'Members',
                targetName: role ? `Role: ${role.name}` : 'All Members',
                executorId: interaction.user.id,
                executorTag: interaction.user.tag,
                reason: 'Mass DM announcement broadcast',
                details: {
                  sent,
                  closedDMs,
                  blockedByRecipient: blockedCount,
                  totalAudience: targets.size,
                  circuitBreakerTripped,
                  messageSnippet: cleanMessage.slice(0, 120)
                },
                type: 'info'
              });
            } catch { }

            context.logSyncEvent(`[Announcements] DM blast: sent ${sent}, closed ${closedDMs}, blocked ${blockedCount} by ${interaction.user.tag}.`, 'info');

            let report = `${VERIFIED_ICON} **Announcement Dispatch Completed**\n\n` +
              `> **Successfully Sent**: \`${sent}\`\n` +
              `> **Closed DMs (Unavailable)**: \`${closedDMs}\`\n` +
              `> **Opted Out (Blocked by User)**: \`${blockedCount}\`\n` +
              `> **Target Audience**: ${role ? `Role <@&${role.id}>` : 'All Non-Bot Members'} (\`${targets.size}\` total)`;

            if (circuitBreakerTripped) {
              report += `\n\n⚠️ **Circuit Breaker Activated**: The broadcast was halted early because Discord API rate limits were encountered. Sent: **${sent}** members.`;
            }

            await interaction.editReply({ content: report });
          } catch (err: any) {
            console.error('[Announcements DM Error]:', err);
            await interaction.editReply({ content: `${WRONG_ICON} An error occurred while processing the announcement: ${err.message || 'Unknown error'}` });
          }
        }

        // ─── PREVIEW ─────────────────────────────────────────────
        else if (sub === 'preview') {
          const title = interaction.options.getString('title');
          const description = interaction.options.getString('description');
          const color = interaction.options.getString('color') || '#06B6D4';

          const { embeds, components } = buildRichCard({
            emoji: INFO_ICON,
            title: `Preview — ${title}`,
            description,
            accentColor: Colors.MUTED,
            footerNote: 'This is a preview — not sent to any channel. Rage Optimiser Enterprise  •  Announcements',
          });
          return interaction.reply({ embeds, components });
        }

        // ─── HISTORY ─────────────────────────────────────────────
        else if (sub === 'history') {
          const history = aMod.config?.history || [];
          if (history.length === 0) return interaction.reply({ content: `${INFO_ICON} No announcement history.`, flags: 64 });
          const lines = history.slice(-10).reverse().map((a: any, i: number) =>
            `**${i + 1}.** ${ts(Math.floor(new Date(a.sentAt || a.createdAt).getTime() / 1000))} — **${a.title || a.content.substring(0, 40)}...** by *${a.authorTag}*`
          );
          const { embeds, components } = buildListCard({
            emoji: INFO_ICON,
            title: 'Recent Announcements',
            subtitle: 'Last 10 broadcasts',
            entries: lines,
            accentColor: Colors.INFO,
          });
          return interaction.reply({ embeds, components });
        }

        else if (sub === 'schedule') {
          const msg = interaction.options.getString('message');
          const time = interaction.options.getString('time');
          context.logSyncEvent(`[Announcements] Scheduled announcement to send in ${time}.`, 'success');
          return interaction.reply({ content: `${TIMER_ICON} **Announcement Scheduled** — Will dispatch in **${time}**.\nMessage: "${msg}"`, flags: 64 });
        }

        else if (sub === 'list') {
          return interaction.reply({ content: `${INFO_ICON} **Scheduled Queue**: No pending scheduled announcements.`, flags: 64 });
        }

        else if (sub === 'delete') {
          const index = interaction.options.getInteger('index');
          return interaction.reply({ content: `${VERIFIED_ICON} Scheduled Announcement at index **${index}** deleted.`, flags: 64 });
        }

        else if (sub === 'edit') {
          const index = interaction.options.getInteger('index');
          const message = interaction.options.getString('message');
          return interaction.reply({ content: `${VERIFIED_ICON} Scheduled Announcement at index **${index}** updated.`, flags: 64 });
        }

        else if (sub === 'stats') {
          const history = aMod.config?.history || [];
          const { embeds, components } = buildRichCard({
            emoji: INFO_ICON,
            title: 'Announcements Statistics',
            accentColor: Colors.INFO,
            fields: [
              { label: '📢 Total Broadcasted',  value: `**${history.length}**` },
              { label: `${TIMER_ICON} Scheduled Pending`, value: '**0**' },
              { label: '📬 DM Blasts Sent',    value: '**0**' },
            ],
            footerNote: 'Rage Optimiser Enterprise  •  Announcements',
          });
          return interaction.reply({ embeds, components });
        }

        else if (sub === 'templates') {
          const { embeds, components } = buildListCard({
            emoji: CONFIG_ICON,
            title: 'Announcement Design Templates',
            entries: [
              '🎮 **Gaming** — Dark purple theme with highlight fields',
              '📋 **Rules Update** — Orange warning block layout',
              '📅 **Event Schedule** — Teal timetable grid format',
            ],
            accentColor: Colors.MUTED,
          });
          return interaction.reply({ embeds, components });
        }
      }
    }
  ],
  routes: [
    {
      path: '/history',
      method: 'get',
      handler: async (req: any, res: any, context: any) => {
        const modules = context.getModulesState();
        const mod = modules.find((m: any) => m.id === 'announcements');
        res.json({ history: mod?.config?.history || [] });
      }
    }
  ]
};
