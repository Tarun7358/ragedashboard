import { EmbedBuilder, Role, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { Database } from '../../core/Database.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';
import { buildLimeOverviewCard, createLimeEmbed, Colors, VERIFIED_ICON, WRONG_ICON, CONFIG_ICON, MEMBER_ICON } from '../../core/UIFactory.js';

// Safe user tag helper
function userTag(user: any): string {
  return user?.globalName ?? user?.username ?? user?.tag ?? user?.id ?? 'Unknown';
}

// Variable parser engine supporting all requested Lime/Koya tokens and dynamic channel links
function parseWelcomeVariables(str: string, member: any, countOverride?: number, config?: any): string {
  if (!str) return '';
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const memberCount = countOverride ?? (member.guild ? member.guild.memberCount : 1);
  const targetUser = member.user || member;
  const serverName = member.guild ? member.guild.name : 'Server';

  const rulesRef = config?.rulesChannelId ? `<#${config.rulesChannelId}>` : '**#rules**';
  const rolesRef = config?.rolesChannelId ? `<#${config.rolesChannelId}>` : '**#roles**';
  const chatRef = config?.chatChannelId ? `<#${config.chatChannelId}>` : '**#chat**';

  return str
    .replace(/{user}/g, targetUser.toString())
    .replace(/{username}/g, targetUser.username || targetUser.displayName || 'User')
    .replace(/{userTag}/g, userTag(targetUser))
    .replace(/{user\.tag}/g, userTag(targetUser))
    .replace(/{userId}/g, targetUser.id || '0')
    .replace(/{server}/g, serverName)
    .replace(/{memberCount}/g, memberCount.toString())
    .replace(/{date}/g, dateStr)
    .replace(/{boosts}/g, (member.guild?.premiumSubscriptionCount || 0).toString())
    .replace(/{boostTier}/g, (member.guild?.premiumTier || 0).toString())
    .replace(/{rules}/g, rulesRef)
    .replace(/{roles}/g, rolesRef)
    .replace(/{chat}/g, chatRef);
}

export const DEFAULT_LIME_HEADER = '.<:member:1532621317487071426> ~ <a:approved:1532390590707142956> ~ Welcome {user} to **{server}** !!!';
export const DEFAULT_LIME_DESCRIPTION = [
  '.                 • Welcome to **{server}** <:member:1532621317487071426>',
  '<:shield:1532403012751065179> • Please make sure to read and follow {rules} !',
  '.           • Unleash Maximum Performance & Dominate with Rage Optimiser <a:boost:1531667085807583262>',
  '<:config:1532425712844144701> . {roles} . <:information:1532621274092929124> . {chat} . <:link:1532620952087826602> . {server} .'
].join('\n');
export const DEFAULT_LIME_COLOR = '#CBF528';
export const DEFAULT_LIME_FOOTER = '{server} • Member #{memberCount}';

// Build Lime GG aesthetic welcome payload
export function buildLimeWelcomePayload(config: any, member: any, countOverride?: number) {
  const cfg = config || {};
  const embedCfg = cfg.welcomeEmbed || {};
  const style = cfg.style || 'lime';

  const rawContent = cfg.welcomeMessage ?? cfg.content ?? DEFAULT_LIME_HEADER;
  const content = parseWelcomeVariables(rawContent, member, countOverride, cfg);

  if (style === 'classic') {
    return { content };
  }

  const colorHex = embedCfg.color || cfg.color || DEFAULT_LIME_COLOR;
  const rawDesc = embedCfg.description ?? cfg.description ?? DEFAULT_LIME_DESCRIPTION;
  const description = parseWelcomeVariables(rawDesc, member, countOverride, cfg);

  const embed = new EmbedBuilder().setColor(colorHex as any);

  if (description) {
    embed.setDescription(description);
  }

  if (embedCfg.title || cfg.title) {
    embed.setTitle(parseWelcomeVariables(embedCfg.title || cfg.title, member, countOverride, cfg));
  }

  if (embedCfg.showAvatar !== false && cfg.showAvatar !== false) {
    const avatarUrl = member.user?.displayAvatarURL
      ? member.user.displayAvatarURL({ forceStatic: false })
      : (member.displayAvatarURL ? member.displayAvatarURL({ forceStatic: false }) : null);
    if (avatarUrl) embed.setThumbnail(avatarUrl);
  }

  const imgUrl = embedCfg.imageUrl || cfg.imageUrl || cfg.bannerUrl;
  if (imgUrl && imgUrl !== 'none') {
    embed.setImage(imgUrl);
  }

  const rawFooter = embedCfg.footer ?? cfg.footer ?? DEFAULT_LIME_FOOTER;
  if (rawFooter && rawFooter !== 'none') {
    embed.setFooter({ text: parseWelcomeVariables(rawFooter, member, countOverride, cfg) });
  }

  return { content, embeds: [embed] };
}

// Build standard embed wrapper fallback
function buildWelcomeEmbed(config: any, member: any, countOverride?: number): EmbedBuilder | null {
  if (!config) return null;
  const embed = new EmbedBuilder().setColor((config.color || '#4f8cff') as any);
  let hasContent = false;

  if (config.title) {
    embed.setTitle(parseWelcomeVariables(config.title, member, countOverride));
    hasContent = true;
  }
  if (config.description) {
    embed.setDescription(parseWelcomeVariables(config.description, member, countOverride));
    hasContent = true;
  }
  if (config.author) {
    embed.setAuthor({ name: parseWelcomeVariables(config.author, member, countOverride) });
    hasContent = true;
  }
  if (config.showAvatar) {
    const avatarUrl = member.user?.displayAvatarURL
      ? member.user.displayAvatarURL({ forceStatic: false })
      : (member.displayAvatarURL ? member.displayAvatarURL({ forceStatic: false }) : null);
    if (avatarUrl) embed.setThumbnail(avatarUrl);
    hasContent = true;
  }
  if (config.imageUrl) {
    embed.setImage(config.imageUrl);
    hasContent = true;
  }
  if (config.footer) {
    embed.setFooter({ text: parseWelcomeVariables(config.footer, member, countOverride) });
    hasContent = true;
  }
  if (config.timestamp) {
    embed.setTimestamp();
    hasContent = true;
  }
  if (config.fields && Array.isArray(config.fields)) {
    config.fields.forEach((f: any) => {
      embed.addFields({
        name: parseWelcomeVariables(f.name, member, countOverride),
        value: parseWelcomeVariables(f.value, member, countOverride),
        inline: !!f.inline
      });
    });
    hasContent = true;
  }

  return hasContent ? embed : null;
}

// Check member birthdays for the current day
async function checkBirthdays(client: any, context: any) {
  try {
    const guildId = context.guildId;
    const modules = context.getModulesState ? context.getModulesState() : [];
    const welcomeMod = modules.find((m: any) => m.id === 'welcome-v2');

    if (!welcomeMod || welcomeMod.status !== 'enabled') return;
    const config = welcomeMod.config || {};
    if (!config.birthdaysEnabled || !config.birthdaysChannelId) return;

    const db = Database.getDb();
    if (!db) return;

    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${mm}-${dd}`;

    const birthdayRows = await db.all<any>(
      `SELECT userId FROM member_birthdays WHERE guildId = ? AND birthday LIKE ?`,
      [guildId, `%${todayStr}`]
    );

    if (birthdayRows.length === 0) return;

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    const channel = await guild.channels.fetch(config.birthdaysChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    for (const row of birthdayRows) {
      try {
        const member = await guild.members.fetch(row.userId).catch(() => null);
        if (!member) continue;

        const defaultEmbed = {
          title: '<:information:1532621274092929124> Happy Birthday, {user}!',
          description: 'Wishing **{userTag}** a fantastic birthday today!',
          color: '#d4af37',
          showAvatar: true
        };

        const embedConfig = config.birthdaysEmbed || defaultEmbed;
        const embed = new EmbedBuilder().setColor((embedConfig.color || '#d4af37') as any);

        if (embedConfig.title) {
          embed.setTitle(parseWelcomeVariables(embedConfig.title, member));
        }
        if (embedConfig.description) {
          embed.setDescription(parseWelcomeVariables(embedConfig.description, member));
        }
        if (embedConfig.showAvatar) {
          embed.setThumbnail(member.user.displayAvatarURL({ forceStatic: false }));
        }
        if (embedConfig.footer) {
          embed.setFooter({ text: parseWelcomeVariables(embedConfig.footer, member) });
        }
        if (embedConfig.timestamp) {
          embed.setTimestamp();
        }

        const content = config.birthdaysMessage
          ? parseWelcomeVariables(config.birthdaysMessage, member)
          : `<:information:1532621274092929124> Happy Birthday ${member}!`;

        await channel.send({ content, embeds: [embed] });
        context.logSyncEvent(`Welcome vNext: Dispatched birthday greetings for "${userTag(member.user)}"`, 'success');
      } catch (err) {
        console.error('Error dispatching birthday message:', err);
      }
    }
  } catch (err) {
    console.error('Error running daily birthdays check:', err);
  }
}

// Register dynamic CLI command r!welcome into PrefixRegistry
export function registerWelcomeCommands(): void {
  PrefixRegistry.register({
    name: 'welcome',
    category: 'Welcome',
    description: 'Configure and test the customizable Lime GG style welcome greeting message.',
    usage: 'r!welcome <status|test|channel|header|text|title|color|banner|footer|style|reset>',
    aliases: ['welc', 'setwelcome', 'welcomemsg'],
    subcommands: [
      { name: 'status', description: 'View current welcome configuration matrix and live preview.' },
      { name: 'test', description: 'Send a live Lime GG welcome greeting test card in the current channel.' },
      { name: 'channel <#channel|none>', description: 'Set or disable the welcome message destination channel.' },
      { name: 'header <text>', description: 'Set outer ping/header content text above the embed.' },
      { name: 'text <text>', description: 'Set description body text inside the welcome embed.' },
      { name: 'title <text|none>', description: 'Set title text for the welcome embed.' },
      { name: 'color <#hex_code>', description: 'Set border accent color (default: #CBF528 lime green).' },
      { name: 'banner <image_url|none>', description: 'Set bottom banner image URL for the card.' },
      { name: 'footer <text|none>', description: 'Set footer text at the bottom of the embed.' },
      { name: 'style <lime|minimal|embed|classic>', description: 'Select welcome aesthetic preset.' },
      { name: 'autorole <add|remove> <@role>', description: 'Configure auto-assigned join roles.' },
      { name: 'reset', description: 'Reset welcome settings back to default Lime GG layout.' }
    ],
    examples: [
      'r!welcome status',
      'r!welcome test',
      'r!welcome channel #welcome',
      'r!welcome header .           • 🖤 ~ 📖 ~ {user} !!!',
      'r!welcome color #CBF528',
      'r!welcome banner https://i.imgur.com/example.png',
      'r!welcome reset'
    ],
    cooldownSeconds: 2,
    userPermissions: ['Administrator'],
    execute: async (message: any, args: string[], extra?: any) => {
      const sub = args[0]?.toLowerCase();
      const modules = extra?.getModulesState ? extra.getModulesState() : [];
      const welcomeMod = modules.find((m: any) => m.id === 'welcome-v2');
      const config = welcomeMod?.config || {};

      const updateConfig = (newCfg: Record<string, any>) => {
        if (extra?.updateModuleConfig) {
          extra.updateModuleConfig('welcome-v2', { ...config, ...newCfg });
        }
        if (extra?.logSyncEvent) {
          extra.logSyncEvent(message.guild?.id, 'Welcome Config: Updated welcome settings via CLI.', 'success');
        }
      };

      // 1. Live Test Command (`r!welcome test`)
      if (sub === 'test' || sub === 'testwelcome') {
        const payload = buildLimeWelcomePayload(config, message.member || message.author);
        await message.reply(payload);
        return message.channel.send({
          embeds: [createLimeEmbed({
            title: 'Welcome Card Test Dispatched',
            description: `${VERIFIED_ICON} Live test message printed above. Destination channel: **<#${config.welcomeChannelId || message.channel.id}>**.`
          })]
        });
      }

      // 2. Set Channel (`r!welcome channel <#channel|none>`)
      if (sub === 'channel') {
        const targetChannel = message.mentions?.channels?.first();
        const option = args[1]?.toLowerCase();

        if (option === 'none' || option === 'off' || option === 'disable') {
          updateConfig({ welcomeEnabled: false, welcomeChannelId: null, channelId: null });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Welcome Greetings Disabled',
              description: `${VERIFIED_ICON} Welcome greetings channel disabled.`
            })]
          });
        }

        if (!targetChannel) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Welcome Channel Syntax',
              description: `${WRONG_ICON} **Syntax**: \`r!welcome channel <#channel|none>\`\nExample: \`r!welcome channel #lounge\``
            })]
          });
        }

        updateConfig({ welcomeEnabled: true, welcomeChannelId: targetChannel.id, channelId: targetChannel.id });
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Welcome Channel Saved',
            description: `${VERIFIED_ICON} Welcome greetings route set to **<#${targetChannel.id}>**.`
          })]
        });
      }

      // 3. Header / Content (`r!welcome header <text...>` or `r!welcome content <text...>`)
      if (sub === 'header' || sub === 'content' || sub === 'message') {
        const textInput = args.slice(1).join(' ').trim();
        if (!textInput) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Welcome Header Syntax',
              description: `${WRONG_ICON} **Syntax**: \`r!welcome header <text>\`\nAvailable variables: \`{user}\`, \`{username}\`, \`{server}\`, \`{memberCount}\`, \`{date}\`\nDefault: \`${DEFAULT_LIME_HEADER}\``
            })]
          });
        }

        updateConfig({ welcomeMessage: textInput, content: textInput });
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Welcome Header Text Saved',
            description: `${VERIFIED_ICON} Header content text updated to:\n> ${textInput}`
          })]
        });
      }

      // 4. Description Body (`r!welcome text <text...>` or `r!welcome description <text...>`)
      if (sub === 'text' || sub === 'description' || sub === 'desc') {
        const textInput = args.slice(1).join(' ').trim();
        if (!textInput) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Welcome Embed Description Syntax',
              description: `${WRONG_ICON} **Syntax**: \`r!welcome text <text>\`\nVariables: \`{user}\`, \`{server}\`, \`{memberCount}\`, \`{date}\``
            })]
          });
        }

        const updatedEmbed = { ...(config.welcomeEmbed || {}), description: textInput };
        updateConfig({ welcomeEmbed: updatedEmbed, description: textInput });
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Welcome Description Text Saved',
            description: `${VERIFIED_ICON} Embed description updated to:\n\`\`\`${textInput}\`\`\``
          })]
        });
      }

      // 5. Embed Title (`r!welcome title <text...>`)
      if (sub === 'title') {
        const titleInput = args.slice(1).join(' ').trim();
        const newTitle = (titleInput.toLowerCase() === 'none' || !titleInput) ? null : titleInput;
        const updatedEmbed = { ...(config.welcomeEmbed || {}), title: newTitle };
        updateConfig({ welcomeEmbed: updatedEmbed, title: newTitle });
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Welcome Embed Title Updated',
            description: `${VERIFIED_ICON} Title set to: **${newTitle || '*None (Blank)*'}**`
          })]
        });
      }

      // 6. Accent Color (`r!welcome color <#hex>`)
      if (sub === 'color' || sub === 'hex') {
        let hex = args[1]?.trim();
        if (!hex || !/^#?[0-9A-Fa-f]{6}$/.test(hex)) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Welcome Color Syntax',
              description: `${WRONG_ICON} **Syntax**: \`r!welcome color <#hex_code>\`\nExample: \`r!welcome color #CBF528\` (Lime Green)`
            })]
          });
        }
        if (!hex.startsWith('#')) hex = '#' + hex;

        const updatedEmbed = { ...(config.welcomeEmbed || {}), color: hex };
        updateConfig({ welcomeEmbed: updatedEmbed, color: hex });
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Welcome Accent Color Saved',
            description: `${VERIFIED_ICON} Embed accent color set to **\`${hex}\`**.`
          })]
        });
      }

      // 7. Banner Image (`r!welcome banner <url|none>`)
      if (sub === 'banner' || sub === 'image') {
        const urlInput = args[1]?.trim();
        const bannerUrl = (urlInput?.toLowerCase() === 'none' || !urlInput) ? null : urlInput;
        const updatedEmbed = { ...(config.welcomeEmbed || {}), imageUrl: bannerUrl };
        updateConfig({ welcomeEmbed: updatedEmbed, bannerUrl, imageUrl: bannerUrl });

        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Welcome Banner Image Updated',
            description: `${VERIFIED_ICON} Banner image set to: ${bannerUrl ? `\`${bannerUrl}\`` : '**None**'}`
          })]
        });
      }

      // 8. Footer (`r!welcome footer <text...>`)
      if (sub === 'footer') {
        const footerInput = args.slice(1).join(' ').trim();
        const newFooter = (footerInput.toLowerCase() === 'none' || !footerInput) ? null : footerInput;
        const updatedEmbed = { ...(config.welcomeEmbed || {}), footer: newFooter };
        updateConfig({ welcomeEmbed: updatedEmbed, footer: newFooter });

        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Welcome Footer Text Saved',
            description: `${VERIFIED_ICON} Footer text updated to: **${newFooter || '*None*'}**`
          })]
        });
      }

      // 9. Style Presets (`r!welcome style <lime|minimal|embed|classic>`)
      if (sub === 'style' || sub === 'preset') {
        const styleInput = args[1]?.toLowerCase();
        if (!['lime', 'minimal', 'embed', 'classic'].includes(styleInput)) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Welcome Style Presets Syntax',
              description: `${WRONG_ICON} **Syntax**: \`r!welcome style <lime|minimal|embed|classic>\`\n\n• **lime**: Signature Lime GG aesthetic with neon border and hearts/books formatting\n• **minimal**: Clean text embed with avatar\n• **embed**: Standard box embed card\n• **classic**: Plain text message without embed`
            })]
          });
        }

        let newSettings: Record<string, any> = { style: styleInput };
        if (styleInput === 'lime') {
          newSettings = {
            style: 'lime',
            color: DEFAULT_LIME_COLOR,
            welcomeMessage: DEFAULT_LIME_HEADER,
            welcomeEmbed: {
              color: DEFAULT_LIME_COLOR,
              description: DEFAULT_LIME_DESCRIPTION,
              showAvatar: true,
              footer: DEFAULT_LIME_FOOTER
            }
          };
        }

        updateConfig(newSettings);
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Welcome Style Preset Applied',
            description: `${VERIFIED_ICON} Applied **\`${styleInput.toUpperCase()}\`** welcome preset. Use \`r!welcome test\` to preview!`
          })]
        });
      }

      // 10. Auto-role subcommands (`r!welcome autorole add/remove <@role>`)
      if (sub === 'autorole') {
        const subAct = args[1]?.toLowerCase();
        const role = message.mentions?.roles?.first();
        const currentRoles: string[] = config.autoroleRoleIds || config.autoroleIds || [];

        if (subAct === 'add' && role) {
          const merged = Array.from(new Set([...currentRoles, role.id]));
          updateConfig({ autoroleEnabled: true, autoroleRoleIds: merged, autoroleIds: merged });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Welcome Auto-Role Added',
              description: `${VERIFIED_ICON} Added **<@&${role.id}>** to join auto-roles.`
            })]
          });
        }

        if (subAct === 'remove' && role) {
          const filtered = currentRoles.filter(r => r !== role.id);
          updateConfig({ autoroleRoleIds: filtered, autoroleIds: filtered });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Welcome Auto-Role Removed',
              description: `${VERIFIED_ICON} Removed **<@&${role.id}>** from join auto-roles.`
            })]
          });
        }

        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Auto-Role Configuration',
            description: `${CONFIG_ICON} **Auto-Roles**: ${currentRoles.length > 0 ? currentRoles.map(r => `<@&${r}>`).join(', ') : '*None*'}\n\n**Syntax**: \`r!welcome autorole <add|remove> <@role>\``
          })]
        });
      }

      // 10b. Channel link tokens (`r!welcome rules/roles/chat <#channel>`)
      if (sub === 'rules') {
        const channel = message.mentions?.channels?.first();
        if (!channel) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Rules Channel Link Syntax',
              description: `${WRONG_ICON} **Syntax**: \`r!welcome rules <#channel>\`\nExample: \`r!welcome rules #rules\`\nUse \`{rules}\` inside description text to dynamically link this channel.`
            })]
          });
        }
        updateConfig({ rulesChannelId: channel.id });
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Rules Channel Linked',
            description: `${VERIFIED_ICON} Linked rules channel to **<#${channel.id}>**. Placeholder \`{rules}\` updated.`
          })]
        });
      }

      if (sub === 'roles') {
        const channel = message.mentions?.channels?.first();
        if (!channel) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Roles Channel Link Syntax',
              description: `${WRONG_ICON} **Syntax**: \`r!welcome roles <#channel>\`\nExample: \`r!welcome roles #self-roles\`\nUse \`{roles}\` inside description text to dynamically link this channel.`
            })]
          });
        }
        updateConfig({ rolesChannelId: channel.id });
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Roles Channel Linked',
            description: `${VERIFIED_ICON} Linked roles channel to **<#${channel.id}>**. Placeholder \`{roles}\` updated.`
          })]
        });
      }

      if (sub === 'chat') {
        const channel = message.mentions?.channels?.first();
        if (!channel) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'General Chat Channel Link Syntax',
              description: `${WRONG_ICON} **Syntax**: \`r!welcome chat <#channel>\`\nExample: \`r!welcome chat #general\`\nUse \`{chat}\` inside description text to dynamically link this channel.`
            })]
          });
        }
        updateConfig({ chatChannelId: channel.id });
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'General Chat Channel Linked',
            description: `${VERIFIED_ICON} Linked general chat channel to **<#${channel.id}>**. Placeholder \`{chat}\` updated.`
          })]
        });
      }

      // 11. Reset Configuration (`r!welcome reset`)
      if (sub === 'reset') {
        updateConfig({
          style: 'lime',
          welcomeEnabled: true,
          color: DEFAULT_LIME_COLOR,
          welcomeMessage: DEFAULT_LIME_HEADER,
          welcomeEmbed: {
            color: DEFAULT_LIME_COLOR,
            description: DEFAULT_LIME_DESCRIPTION,
            showAvatar: true,
            footer: DEFAULT_LIME_FOOTER
          }
        });
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Welcome Configuration Reset',
            description: `${VERIFIED_ICON} Restored default Lime GG welcome card layout and color settings.`
          })]
        });
      }

      // 12. Default Overview Status Matrix (`r!welcome` / `r!welcome status`)
      const welcomeChannelId = config.welcomeChannelId || config.channelId;
      const channelStr = welcomeChannelId ? `<#${welcomeChannelId}>` : '`Not Set`';
      const isEnabledStr = (config.welcomeEnabled !== false && welcomeChannelId) ? VERIFIED_ICON + ' `ACTIVE`' : WRONG_ICON + ' `INACTIVE`';
      const colorStr = config.welcomeEmbed?.color || config.color || DEFAULT_LIME_COLOR;
      const headerStr = (config.welcomeMessage || DEFAULT_LIME_HEADER).slice(0, 50);
      const autorolesStr = (config.autoroleRoleIds || config.autoroleIds || []).map((r: string) => `<@&${r}>`).join(', ') || '`None`';

      const overviewCard = buildLimeOverviewCard({
        title: 'LIME GG WELCOME CONFIGURATION MATRIX',
        subtitle: 'CUSTOMIZABLE ONBOARDING CARD & AUTO-ROLES',
        color: Colors.BRAND,
        sections: [
          {
            title: `${MEMBER_ICON} WELCOME PARAMETERS`,
            items: [
              `Status: ${isEnabledStr}`,
              `Destination Channel: ${channelStr}`,
              `Preset Style: \`${(config.style || 'lime').toUpperCase()}\``,
              `Border Accent Color: \`${colorStr}\``,
              `Header Content: \`${headerStr}\``,
              `Auto-Assigned Join Roles: ${autorolesStr}`
            ]
          },
          {
            title: `${CONFIG_ICON} QUICK MANAGEMENT COMMANDS`,
            items: [
              `• \`r!welcome channel <#channel>\` — Set greeting channel`,
              `• \`r!welcome test\` — Send live test welcome card`,
              `• \`r!welcome header <text>\` — Set outer ping text`,
              `• \`r!welcome text <text>\` — Set embed description body`,
              `• \`r!welcome color <#hex>\` — Set border accent color`,
              `• \`r!welcome banner <url>\` — Set bottom image banner`,
              `• \`r!welcome reset\` — Reset to default Lime GG layout`
            ]
          }
        ],
        footerText: 'Rage Optimiser Enterprise • Welcome Suite'
      });

      const btnTest = new ButtonBuilder().setCustomId('welc_test_cmd').setLabel('Test Greeting Card').setStyle(ButtonStyle.Primary).setEmoji('🧪');
      const btnReset = new ButtonBuilder().setCustomId('welc_reset_cmd').setLabel('Reset to Lime GG').setStyle(ButtonStyle.Secondary).setEmoji('⚙️');
      const rowButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(btnTest, btnReset);

      return message.reply({ embeds: [overviewCard], components: [rowButtons] });
    }
  });
}

// Auto-register commands on module load
registerWelcomeCommands();

export const WelcomeV2Manifest: ModuleManifest = {
  id: 'welcome-v2',
  name: 'Welcome System vNext',
  version: '2.0.0',
  description: 'Lime GG style customizable welcome suite including graphic cards, auto-roles, boosting triggers, milestone trackers, and birthdays.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;

      const channelExists = (id: string) => registry.channels.some(c => c.id === id);
      const roleExists = (id: string) => registry.roles.some(r => r.id === id);

      if (config.welcomeEnabled && config.welcomeChannelId) {
        progress += 20;
        if (!channelExists(config.welcomeChannelId)) {
          errors.push(`Welcome channel ID (${config.welcomeChannelId}) is invalid!`);
        }
      }
      if (config.goodbyeEnabled && config.goodbyeChannelId) {
        progress += 20;
        if (!channelExists(config.goodbyeChannelId)) {
          errors.push(`Goodbye channel ID (${config.goodbyeChannelId}) is invalid!`);
        }
      }
      if (config.autoroleEnabled && config.autoroleRoleIds) {
        progress += 20;
        config.autoroleRoleIds.forEach((rid: string) => {
          if (!roleExists(rid)) {
            errors.push(`Auto-assigned role ID (${rid}) is invalid!`);
          }
        });
      }

      return { progress: Math.min(100, progress || 50), errors };
    }
  },
  commands: [],
  events: [
    {
      name: 'ready',
      handler: async (client: any, context: any) => {
        // Run daily birthdays checker
        setTimeout(() => checkBirthdays(client, context), 8000);
        setInterval(() => checkBirthdays(client, context), 24 * 60 * 60 * 1000);
      }
    },
    {
      name: 'interactionCreate',
      handler: async (client: any, interaction: any, context: any) => {
        if (!interaction.isButton()) return;
        const customId = interaction.customId;

        if (customId === 'welc_test_cmd' || customId === 'welc_test_welcome') {
          const modules = context.getModulesState ? context.getModulesState() : [];
          const welcomeMod = modules.find((m: any) => m.id === 'welcome-v2');
          const config = welcomeMod?.config || {};
          const member = interaction.member || interaction.user;

          const payload = buildLimeWelcomePayload(config, member);
          await interaction.reply({
            content: `🧪 **Lime GG Welcome Test Card Preview:**`,
            flags: 64
          });
          return interaction.followUp(payload);
        }

        if (customId === 'welc_reset_cmd') {
          const modules = context.getModulesState ? context.getModulesState() : [];
          const welcomeMod = modules.find((m: any) => m.id === 'welcome-v2');
          const config = welcomeMod?.config || {};

          const newConfig = {
            ...config,
            style: 'lime',
            welcomeEnabled: true,
            color: DEFAULT_LIME_COLOR,
            welcomeMessage: DEFAULT_LIME_HEADER,
            welcomeEmbed: {
              color: DEFAULT_LIME_COLOR,
              description: DEFAULT_LIME_DESCRIPTION,
              showAvatar: true,
              footer: DEFAULT_LIME_FOOTER
            }
          };

          if (context.updateModuleConfig) {
            context.updateModuleConfig('welcome-v2', newConfig);
          }

          return interaction.reply({
            content: `${VERIFIED_ICON} Restored default Lime GG welcome card layout!`,
            flags: 64
          });
        }
      }
    },
    {
      name: 'guildMemberAdd',
      handler: async (client: any, member: any, context: any) => {
        const globalSettings = context.getGlobalSettings ? context.getGlobalSettings() : {};
        if (globalSettings.useV2Welcome === false) return;

        const modules = context.getModulesState ? context.getModulesState() : [];
        const welcomeMod = modules.find((m: any) => m.id === 'welcome-v2');
        if (!welcomeMod || welcomeMod.status !== 'enabled') return;

        const config = welcomeMod.config || {};

        // 1. Auto-role Assignment
        if (config.autoroleEnabled && config.autoroleRoleIds && config.autoroleRoleIds.length > 0) {
          const delayMs = Math.max(0, Number(config.autoroleDelay || 0) * 1000);
          setTimeout(async () => {
            try {
              const rolesToAssign = config.autoroleRoleIds
                .map((rid: string) => member.guild.roles.cache.get(rid))
                .filter(Boolean);
              if (rolesToAssign.length > 0) {
                await member.roles.add(rolesToAssign);
                context.logSyncEvent(`Welcome vNext: Assigned auto-roles [${rolesToAssign.map((r: Role) => r.name).join(', ')}] to "${userTag(member.user)}"`, 'success');
              }
            } catch (err: any) {
              console.error('[WelcomeV2] Failed to assign auto-roles:', err);
              context.logSyncEvent(`Welcome vNext: Failed to assign auto-roles: ${err.message}`, 'warn');
            }
          }, delayMs);
        }

        // 2. DM welcome
        if (config.dmEnabled && config.dmMessage) {
          try {
            const payload: any = {
              content: parseWelcomeVariables(config.dmMessage, member)
            };
            const dmEmbed = buildWelcomeEmbed(config.dmEmbed, member);
            if (dmEmbed) {
              payload.embeds = [dmEmbed];
            }
            await member.send(payload);
          } catch (err: any) {
            console.warn(`[WelcomeV2] Failed to DM user ${member.user.username}:`, err.message);
          }
        }

        // 3. Welcome channel message & Lime GG aesthetic card
        const welcomeChannelId = config.welcomeChannelId || config.channelId;
        if ((config.welcomeEnabled !== false) && welcomeChannelId) {
          try {
            const channel = await member.guild.channels.fetch(welcomeChannelId).catch(() => null);
            if (channel && channel.isTextBased()) {
              const payload = buildLimeWelcomePayload(config, member);
              await channel.send(payload);
              context.logSyncEvent(`Welcome vNext: Dispatched Lime GG welcome greetings for "${userTag(member.user)}"`, 'success');
            }
          } catch (err) {
            console.error('[WelcomeV2] Failed to send welcome channel message:', err);
          }
        }

        // 4. Milestone Tracker
        if (config.milestonesEnabled && config.milestonesChannelId && config.milestonesInterval) {
          const currentCount = member.guild.memberCount;
          const interval = Number(config.milestonesInterval);
          if (interval > 0 && currentCount % interval === 0) {
            try {
              const channel = await member.guild.channels.fetch(config.milestonesChannelId).catch(() => null);
              if (channel && channel.isTextBased()) {
                const defaultMileEmbed = {
                  title: '<:information:1532621274092929124> Server Milestone Reached!',
                  description: 'Congratulations! **{server}** has officially hit **{memberCount}** members!',
                  color: '#99CC00'
                };
                const embedConfig = config.milestonesEmbed || defaultMileEmbed;
                const embed = buildWelcomeEmbed(embedConfig, member);

                const content = config.milestonesMessage
                  ? parseWelcomeVariables(config.milestonesMessage, member)
                  : `<:information:1532621274092929124> Server Milestone Reached!`;

                await channel.send({
                  content,
                  embeds: embed ? [embed] : []
                });
                context.logSyncEvent(`Welcome vNext: Server milestone of ${currentCount} members reached and announced.`, 'info');
              }
            } catch (err) {
              console.error('[WelcomeV2] Failed to send milestone announcement:', err);
            }
          }
        }
      }
    },
    {
      name: 'guildMemberRemove',
      handler: async (client: any, member: any, context: any) => {
        const globalSettings = context.getGlobalSettings ? context.getGlobalSettings() : {};
        if (globalSettings.useV2Welcome === false) return;

        const modules = context.getModulesState ? context.getModulesState() : [];
        const welcomeMod = modules.find((m: any) => m.id === 'welcome-v2');
        if (!welcomeMod || welcomeMod.status !== 'enabled') return;

        const config = welcomeMod.config || {};

        if (config.goodbyeEnabled && config.goodbyeChannelId) {
          try {
            const channel = await member.guild.channels.fetch(config.goodbyeChannelId).catch(() => null);
            if (channel && channel.isTextBased()) {
              const payload: any = {};

              if (config.goodbyeMessage) {
                payload.content = parseWelcomeVariables(config.goodbyeMessage, member);
              }

              const goodbyeEmbed = buildWelcomeEmbed(config.goodbyeEmbed, member);
              if (goodbyeEmbed) {
                payload.embeds = [goodbyeEmbed];
              }

              if (payload.content || (payload.embeds && payload.embeds.length > 0)) {
                await channel.send(payload);
                context.logSyncEvent(`Welcome vNext: Dispatched goodbye leave log for "${userTag(member.user)}"`, 'info');
              }
            }
          } catch (err) {
            console.error('[WelcomeV2] Failed to send goodbye channel message:', err);
          }
        }
      }
    },
    {
      name: 'guildMemberUpdate',
      handler: async (client: any, oldMember: any, newMember: any, context: any) => {
        const globalSettings = context.getGlobalSettings ? context.getGlobalSettings() : {};
        if (globalSettings.useV2Welcome === false) return;

        const modules = context.getModulesState ? context.getModulesState() : [];
        const welcomeMod = modules.find((m: any) => m.id === 'welcome-v2');
        if (!welcomeMod || welcomeMod.status !== 'enabled') return;

        const config = welcomeMod.config || {};

        const oldBoost = oldMember.premiumSince;
        const newBoost = newMember.premiumSince;

        // 1. Check if user started boosting
        if (!oldBoost && newBoost) {
          if (config.boostEnabled && config.boostChannelId) {
            try {
              const channel = await newMember.guild.channels.fetch(config.boostChannelId).catch(() => null);
              if (channel && channel.isTextBased()) {
                const defaultBoostEmbed = {
                  title: '<:booster:1532621228492460172> Server Boosted!',
                  description: 'Thank you so much to {user} for boosting the server!',
                  color: '#99CC00',
                  showAvatar: true
                };
                const embedConfig = config.boostEmbed || defaultBoostEmbed;
                const embed = buildWelcomeEmbed(embedConfig, newMember);

                const content = config.boostMessage
                  ? parseWelcomeVariables(config.boostMessage, newMember)
                  : `<:booster:1532621228492460172> Server Boosted by ${newMember}!`;

                await channel.send({
                  content,
                  embeds: embed ? [embed] : []
                });
                context.logSyncEvent(`Welcome vNext: Boost event announced for "${userTag(newMember.user)}"`, 'success');
              }
            } catch (err) {
              console.error('[WelcomeV2] Failed to send boost announcement:', err);
            }
          }
        }

        // 2. Check if user stopped boosting
        if (oldBoost && !newBoost) {
          if (config.unboostEnabled && config.unboostChannelId) {
            try {
              const channel = await newMember.guild.channels.fetch(config.unboostChannelId).catch(() => null);
              if (channel && channel.isTextBased()) {
                const defaultUnboostEmbed = {
                  title: '<:wrong:1532390628330307634> Server Unboosted',
                  description: 'Oh no! **{userTag}** is no longer boosting the server.',
                  color: '#99CC00'
                };
                const embedConfig = config.unboostEmbed || defaultUnboostEmbed;
                const embed = buildWelcomeEmbed(embedConfig, newMember);

                const content = config.unboostMessage
                  ? parseWelcomeVariables(config.unboostMessage, newMember)
                  : `<:wrong:1532390628330307634> Server Unboosted by ${newMember}`;

                await channel.send({
                  content,
                  embeds: embed ? [embed] : []
                });
                context.logSyncEvent(`Welcome vNext: Unboost event announced for "${userTag(newMember.user)}"`, 'info');
              }
            } catch (err) {
              console.error('[WelcomeV2] Failed to send unboost announcement:', err);
            }
          }
        }
      }
    }
  ]
};

registerWelcomeCommands();

