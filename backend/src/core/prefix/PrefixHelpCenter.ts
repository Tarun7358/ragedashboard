import { PayloadFormatter } from '../PayloadFormatter.js';
import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  PermissionFlagsBits,
  AttachmentBuilder
} from 'discord.js';
import { HelpBannerGenerator } from './HelpBannerGenerator.js';
import { PrefixRegistry, PrefixCommandMeta } from './PrefixRegistry.js';
import { PrefixResolver } from './PrefixResolver.js';
import { PrefixPermissionManager } from './PrefixPermissionManager.js';
import {
  Embeds,
  Colors,
  VERIFIED_ICON,
  WRONG_ICON,
  SUCCESS_CHECK_ICON,
  LOADING_ANIMATED_ICON,
  TIMER_ICON,
  TICKET_ICON,
  SHIELD_ICON,
  CONFIG_ICON,
  GAVEL_ICON,
  BOT_ICON,
  MEMBER_ICON,
  VIP_ICON,
  LINK_ICON,
  VOICE_ICON,
  STATS_ICON,
  CART_ICON,
  ANNOUNCEMENTS_ICON,
  ANIMATED_APPROVED_ICON,
  SQUARE_TICK_ICON,
  GOLD_CROWN_ICON,
  ARROW_ICON,
  INFO_ICON
} from '../UIFactory.js';

const APPROVED_ICON = SUCCESS_CHECK_ICON;
const WRONG_EMOJI = WRONG_ICON;
const SHIELD_EMOJI = SHIELD_ICON;
export const DEFAULT_HELP_BANNER = 'https://cdn.discordapp.com/attachments/1499055667238146289/1538212292980773004/ChatGPT_Image_Aug_15_2026_09_14_48_PM.png?ex=6a81db55&is=6a8089d5&hm=4e8308bbc0423a9b1fa28776ba323ebc65e14534cf9fa9487546a50d6e172d3b';

interface CategoryInfo {
  icon: string;
  description: string;
}

export class PrefixHelpCenter {
  private static categoryMeta: Record<string, CategoryInfo> = {
    'Security': { icon: SHIELD_ICON, description: '29 Anti-Nuke Rules, Lockdowns, Quarantine & Whitelists' },
    'AntiNuke': { icon: SHIELD_ICON, description: 'Anti-Nuke Protection, Instant Rollback & 1/1 Kick Defaults' },
    'AutoMod': { icon: SHIELD_ICON, description: 'Anti-Link, Anti-Spam Rate Limiters & Malicious Content Filters' },
    'Moderation': { icon: GAVEL_ICON, description: 'Ban, Kick, Timeout, Mute, Warn, Purge & Mod Cases' },
    'Community': { icon: MEMBER_ICON, description: 'Welcome Cards, User Info, AFK, Polls & Custom Embed Builder' },
    'Voice': { icon: VOICE_ICON, description: 'Voice Safeguards, Dynamic Join-To-Create & 24/7 Presence' },
    'Voice Protection': { icon: VOICE_ICON, description: 'Anti-Disconnect, Voice Abuse Gates & Channel Safeguards' },
    'Join To Create': { icon: VOICE_ICON, description: 'Dynamic Voice Channel Generators & Temp Channels' },
    'Logging': { icon: INFO_ICON, description: 'Real-time Server Audit Telemetry & 8 Event Categories (#rage-logs)' },
    'Audit': { icon: INFO_ICON, description: 'Administrative Audit Logs, Case History & Telemetry' },
    'Backups': { icon: CONFIG_ICON, description: 'Server Snapshots, Vault Sync & One-Click Disaster Recovery' },
    'Tickets': { icon: TICKET_ICON, description: 'Support Ticket Panels, Custom Guidelines & Transcripts' },
    'Support': { icon: TICKET_ICON, description: 'Support Ticket Panels, Custom Guidelines & Staff Controls' },
    'General Support': { icon: TICKET_ICON, description: 'Support Panel Dispatch & Ticket Category Routing' },
    'Verification': { icon: SHIELD_ICON, description: 'Captcha Gatekeeper, Click-to-Verify & Anti-Raid Isolation' },
    'Leveling & Economy': { icon: VIP_ICON, description: 'XP Progression, Rank Cards, Leaderboard, Daily & Work' },
    'Giveaways': { icon: CART_ICON, description: 'Automated Member Giveaways & Prize Rolls' },
    'Reaction Roles': { icon: MEMBER_ICON, description: 'Self-Assign Role Grid Panels & Numbered Buttons' },
    'Roles': { icon: VIP_ICON, description: 'Interactive Dropdown Self Roles, Button Menus & r!autorole' },
    'Management': { icon: CONFIG_ICON, description: 'Reaction Roles, Channel Controls & Guild Overrides' },
    'Configuration': { icon: CONFIG_ICON, description: 'Prefix, 1-Click Module Enabler (r!enable), Auto-Roles & Overrides' },
    'Reminders': { icon: TIMER_ICON, description: 'Personal & Server Timed Reminders with Animated Timer' },
    'Announcements': { icon: ANNOUNCEMENTS_ICON, description: 'Scheduled Broadcasts & Embedded Server Notices' },
    'Promotion': { icon: LINK_ICON, description: '24h Auto-Clearing Promotion Channels & Cooldowns' },
    'Social Updates': { icon: LINK_ICON, description: 'YouTube Video Alerts & Twitch Stream Live Sentinel' },
    'Analytics': { icon: STATS_ICON, description: 'Guild Telemetry, Audit Logs & Security History' },
    'Diagnostics': { icon: BOT_ICON, description: 'Deep Cluster Health & Resource Metrics' },
    'System': { icon: BOT_ICON, description: 'System Diagnostics, Bot Health, Uptime & Latency' },
    'Bulk Operations': { icon: GAVEL_ICON, description: 'Mass Role & Channel Management Utilities' },
    'Enterprise': { icon: GOLD_CROWN_ICON, description: 'Emergency Lockdowns, 2FA Sentinel & Threat Matrix' },
    'Automations': { icon: BOT_ICON, description: 'Custom Auto-Responders & Event Hooks' }
  };

  private static getCategoryMeta(cat: string): CategoryInfo {
    return this.categoryMeta[cat] || { icon: '📁', description: `${cat} commands and modules` };
  }

  public static async handleHelp(message: Message, query?: string): Promise<any> {
    const guildId = message.guildId || undefined;
    const currentPrefix = PrefixResolver.getPrefix(guildId);
    const latency = message.client.ws.ping > 0 ? message.client.ws.ping : 14;

    if (!query) {
      return this.sendRootHelp(message, currentPrefix, latency);
    }

    const cleanQuery = query.trim().toLowerCase();

    // 1. Check if query is an exact category match
    const categories = PrefixRegistry.getCategories();
    const matchedCategory = categories.find(c => c.toLowerCase() === cleanQuery);
    if (matchedCategory) {
      return this.sendModuleHelp(message, matchedCategory, currentPrefix, 1);
    }

    // 2. Check for multi-word command + subcommand queries (e.g. "logs channel", "config antinuke", "clear vc")
    const parts = cleanQuery.split(/\s+/);
    if (parts.length > 1) {
      const mainCmdName = parts[0];
      const subCmdQuery = parts.slice(1).join(' ');
      const mainCmd = PrefixRegistry.getCommand(mainCmdName);

      if (mainCmd && mainCmd.subcommands && mainCmd.subcommands.length > 0) {
        const subCmd = mainCmd.subcommands.find(s => {
          const sName = s.name.toLowerCase();
          const targetSub = subCmdQuery.toLowerCase();
          return sName === targetSub ||
                 sName.startsWith(targetSub) ||
                 sName.split(/\s+/)[0] === targetSub ||
                 sName.includes(targetSub);
        });

        if (subCmd) {
          return this.sendSubcommandHelp(message, mainCmd, subCmd, currentPrefix);
        }
      }
    }

    // 3. Check if query matches a command name or alias directly
    const command = PrefixRegistry.getCommand(cleanQuery);
    if (command) {
      return this.sendCommandHelp(message, command, currentPrefix);
    }

    // 4. Check if cleanQuery matches any subcommand across all registered commands
    const allCmds = PrefixRegistry.getAllCommands();
    for (const mainCmd of allCmds) {
      if (mainCmd.subcommands && mainCmd.subcommands.length > 0) {
        const subMatch = mainCmd.subcommands.find(s => {
          const sName = s.name.toLowerCase();
          return sName === cleanQuery || sName.split(/\s+/)[0] === cleanQuery;
        });
        if (subMatch) {
          return this.sendSubcommandHelp(message, mainCmd, subMatch, currentPrefix);
        }
      }
    }

    // 5. Dynamic Multi-Word Fuzzy Search
    const searchResults = this.searchCommands(cleanQuery);
    if (searchResults.length === 1) {
      return this.sendCommandHelp(message, searchResults[0], currentPrefix);
    } else if (searchResults.length > 1) {
      return this.sendSearchResults(message, cleanQuery, searchResults, currentPrefix);
    }

    // Fallback: No command found
    const embed = new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle(`${WRONG_EMOJI} Command Engine — No Match Found`)
      .setDescription([
        `No command or module matching **\`${query}\`** was found.\n`,
        `> ${ARROW_ICON} Type **\`${currentPrefix}help\`** to open the Master Command Matrix.`,
        `> ${ARROW_ICON} Use the select menu below to explore available command modules.`
      ].join('\n'))
      .setFooter({ text: 'Rage Optimiser Enterprise - Advanced Security & Management' })
      .setTimestamp();

    const components = this.buildComponents('home', 1, 1);
    return message.reply(PayloadFormatter.normalize({ embeds: [embed], components }, message.client.user));
  }

  private static searchCommands(query: string): PrefixCommandMeta[] {
    const all = PrefixRegistry.getAllCommands();
    const keywords = query.split(/\s+/).filter(Boolean);

    return all.filter(cmd => {
      if (cmd.hidden) return false;
      if (cmd.name === query || cmd.aliases.includes(query)) return true;
      return keywords.every(kw =>
        cmd.name.includes(kw) ||
        cmd.aliases.some(a => a.includes(kw)) ||
        cmd.description.toLowerCase().includes(kw)
      );
    }).slice(0, 10);
  }

  private static async sendSearchResults(message: Message, query: string, results: PrefixCommandMeta[], prefix: string): Promise<any> {
    const embed = new EmbedBuilder()
      .setColor(0x4f8cff)
      .setTitle(`🔍 Search Results: "${query}"`)
      .setDescription([
        `Found **${results.length}** commands matching your search query:\n`,
        ...results.map(c => `> ${ARROW_ICON} **\`${prefix}${c.name}\`** — ${c.description} (\`${c.category}\`)`)
      ].join('\n'))
      .setFooter({ text: 'Rage Optimiser Enterprise - Advanced Security & Management' })
      .setTimestamp();

    const components = this.buildComponents('home', 1, 1);
    return message.reply(PayloadFormatter.normalize({ embeds: [embed], components }, message.client.user));
  }

  public static async sendRootHelp(message: Message, prefix: string, latency: number, updateInteraction?: any): Promise<any> {
    const categories = PrefixRegistry.getCategories();
    const allCommands = PrefixRegistry.getAllCommands();
    const botUser = message.client.user;
    const executorId = updateInteraction?.user?.id || message.author?.id || '';
    const execSuffix = executorId ? `:${executorId}` : '';

    const totalCommands = allCommands.length > 0 ? allCommands.length : 366;
    const bannerBuffer = await HelpBannerGenerator.generate('Help', null).catch(() => null);
    const files: AttachmentBuilder[] = [];
    if (bannerBuffer) {
      files.push(new AttachmentBuilder(bannerBuffer, { name: 'help-box-home.png' }));
    }

    const previewPills = categories.slice(0, 8).map(c => `\`${c}\``).join(' ') + (categories.length > 8 ? ` \`+${categories.length - 8} more\`` : '');

    const descLines = [
      `\`R A G E   O P T I M I S E R\`\n`,
      `**${totalCommands} commands · ${categories.length} modules · Maintained by @RageTeam**\n`,
      `Welcome to **@${botUser?.username || 'Rage Optimiser'}**, an enterprise security and community management bot trusted by **25+ servers** and **121,500+ users**, with **10,000+ commands** used so far. Hosted on **High-Speed Infrastructure**, with guides and updates on the **Rage Official Support** channel.\n`,
      `${previewPills}\n`,
      `<@${executorId || 'User'}> help with a module? Tag <@${botUser?.id}> and ask \`how to enable <module name>\`. our self-teaching guide walks you through it.\n`,
      `Use **Select Category** below or \`${prefix}help <command>\`.\n`
    ];

    const embed = new EmbedBuilder()
      .setColor(0x18181B)
      .setDescription(descLines.join('\n'))
      .setFooter({ text: `Requested by ${message.author?.username || 'User'}`, iconURL: message.author?.displayAvatarURL() || undefined })
      .setTimestamp();

    if (bannerBuffer) {
      embed.setImage('attachment://help-box-home.png');
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`help_category_select${execSuffix}`)
      .setPlaceholder('Select Category')
      .addOptions(
        {
          label: 'Back to Home Center',
          value: 'help_cat_home',
          description: 'View all modules and status statistics',
          emoji: '🏠',
          default: true
        },
        ...categories.slice(0, 24).map(cat => {
          const meta = this.getCategoryMeta(cat);
          const count = PrefixRegistry.getCommandsByCategory(cat).length;
          return {
            label: cat,
            value: `help_cat_${cat.toLowerCase().replace(/\s+/g, '_')}`,
            description: `${count} commands · ${meta.description.slice(0, 45)}`,
            emoji: meta.icon
          };
        })
      );

    const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const btnHome = new ButtonBuilder().setCustomId(`help_btn_home${execSuffix}`).setLabel('|<').setStyle(ButtonStyle.Secondary);
    const btnSelect = new ButtonBuilder().setCustomId(`help_btn_dummy${execSuffix}`).setLabel('Select Category').setStyle(ButtonStyle.Secondary);
    const btnEnd = new ButtonBuilder().setCustomId(`help_btn_end${execSuffix}`).setLabel('>|').setStyle(ButtonStyle.Secondary);
    const btnDash = new ButtonBuilder().setLabel('Dashboard').setStyle(ButtonStyle.Link).setURL('https://ragesecuredashboard.netlify.app/');
    const btnRefresh = new ButtonBuilder().setCustomId(`help_btn_refresh_home_1${execSuffix}`).setLabel('🔄').setStyle(ButtonStyle.Secondary);

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(btnHome, btnSelect, btnEnd, btnDash, btnRefresh);

    const helpPayload = PayloadFormatter.normalize({ embeds: [embed], components: [row1, row2], files }, botUser);
    if (updateInteraction) {
      return updateInteraction.update(helpPayload).catch((err: any) => {
        console.error('[PrefixHelpCenter] Failed to update root help:', err?.message || err);
      });
    }
    try {
      return await message.reply(helpPayload);
    } catch (err: any) {
      console.error('[PrefixHelpCenter] Failed to send root help embed:', err?.message || err);
      const plain = `**Rage Optimiser Command Hub**\nPrefix: \`${prefix}\`\nModules: ${categories.map(c => `\`${c}\``).join(', ')}\n\nUse \`${prefix}help <module>\` or \`${prefix}help <command>\`.`;
      return message.reply({ content: plain.slice(0, 1990) }).catch(() => {});
    }
  }

  /** Ensures the root help description never exceeds Discord's 4096-char embed limit. */
  private static fitDescription(lines: string[], categories: string[], prefix: string): string {
    const full = lines.join('\n');
    if (full.length <= 4000) return full;
    const compact = [
      ...lines.slice(0, 7),
      categories.map(cat => `\`${cat}\` (${PrefixRegistry.getCommandsByCategory(cat).length})`).join(' - '),
      `\n*Select a module from the menu below or type \`${prefix}help <command_name>\` for detailed manuals.*`
    ].join('\n');
    return compact.length <= 4000 ? compact : compact.slice(0, 3990) + '…';
  }

  private static formatUsage(usage: string, commandName: string, prefix: string): string {
    if (!usage) return `${prefix}${commandName}`;
    const clean = usage.replace(/^(r!|r\?|r\.|!|\/)/i, '').trim();
    if (clean.toLowerCase().startsWith(commandName.toLowerCase())) {
      return `${prefix}${clean}`;
    }
    return `${prefix}${commandName} ${clean}`;
  }

  private static formatExample(example: string, prefix: string): string {
    if (!example) return '';
    const clean = example.replace(/^(r!|r\?|r\.|!|\/)/i, '').trim();
    return `${prefix}${clean}`;
  }

  public static async sendModuleHelp(message: Message, category: string, prefix: string, page = 1, updateInteraction?: any): Promise<any> {
    const allCategoryCmds = PrefixRegistry.getCommandsByCategory(category);
    const executorId = updateInteraction?.user?.id || message.author?.id || '';
    const execSuffix = executorId ? `:${executorId}` : '';

    const visibleCmds = allCategoryCmds.filter(c => !c.hidden);
    const meta = this.getCategoryMeta(category);

    const bannerBuffer = await HelpBannerGenerator.generate(`Help > ${meta.icon} ${category}`, `${visibleCmds.length} commands`).catch(() => null);
    const files: AttachmentBuilder[] = [];
    if (bannerBuffer) {
      files.push(new AttachmentBuilder(bannerBuffer, { name: 'help-box-category.png' }));
    }

    const pageSize = 8;
    const totalPages = Math.max(1, Math.ceil(visibleCmds.length / pageSize));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const pageCmds = visibleCmds.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    // Group commands into pill boxes
    const commandSections = pageCmds.map(c => {
      const allNames = [c.name, ...(c.aliases || []), ...(c.subcommands?.map(s => s.name.split(' ')[0]) || [])];
      const uniqueNames = [...new Set(allNames)];
      const pillList = uniqueNames.map(n => `\`${n}\``).join(' ');
      return `**${meta.icon} ${c.name.toUpperCase()} [${uniqueNames.length}]**\n${pillList}`;
    });

    const embedDesc = [
      `\`R A G E   O P T I M I S E R\`\n`,
      ...(commandSections.length > 0 ? commandSections : [`> ${WRONG_ICON} __**No Commands Registered in this Module**__`]),
      `\n*open a module from the sub module menu below, then pick a command to see its full explanation, or use \`${prefix}help <cmd name>\`*`
    ].join('\n\n');

    const embed = new EmbedBuilder()
      .setColor(0x18181B)
      .setDescription(embedDesc)
      .setFooter({ text: `Requested by ${message.author?.username || 'User'}`, iconURL: message.author?.displayAvatarURL() || undefined })
      .setTimestamp();

    if (bannerBuffer) {
      embed.setImage('attachment://help-box-category.png');
    }

    const categories = PrefixRegistry.getCategories();
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`help_category_select${execSuffix}`)
      .setPlaceholder('Select Category')
      .addOptions(
        {
          label: 'Back to Home Center',
          value: 'help_cat_home',
          description: 'View all modules and status statistics',
          emoji: '🏠'
        },
        ...categories.slice(0, 24).map(cat => {
          const catMeta = this.getCategoryMeta(cat);
          return {
            label: cat,
            value: `help_cat_${cat.toLowerCase().replace(/\s+/g, '_')}`,
            description: `View all ${cat} commands and syntax`,
            emoji: catMeta.icon,
            default: cat.toLowerCase() === category.toLowerCase()
          };
        })
      );

    const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    // Sub-module / command selection menu
    const subOptions = visibleCmds.slice(0, 25).map(c => ({
      label: `${prefix}${c.name}`,
      value: `help_cmd_${c.name.toLowerCase()}`,
      description: `${c.description.slice(0, 50)}`,
      emoji: meta.icon
    }));

    const rows: ActionRowBuilder<any>[] = [row1];
    if (subOptions.length > 0) {
      const subMenu = new StringSelectMenuBuilder()
        .setCustomId(`help_command_select${execSuffix}`)
        .setPlaceholder('Select a sub module or command...')
        .addOptions(subOptions);
      rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(subMenu));
    }

    const btnHome = new ButtonBuilder().setCustomId(`help_btn_home${execSuffix}`).setLabel('|<').setStyle(ButtonStyle.Secondary);
    const btnDash = new ButtonBuilder().setLabel('Dashboard').setStyle(ButtonStyle.Link).setURL('https://ragesecuredashboard.netlify.app/');
    const btnSupport = new ButtonBuilder().setLabel('Support Server').setStyle(ButtonStyle.Link).setURL('https://discord.gg/mK8HVJGzYt');
    const btnClose = new ButtonBuilder().setCustomId(`help_btn_close${execSuffix}`).setLabel('Close').setStyle(ButtonStyle.Secondary);

    const btnComponents: ButtonBuilder[] = [btnHome];
    if (totalPages > 1) {
      const btnPrev = new ButtonBuilder()
        .setCustomId(`help_btn_prev_${category.replace(/\s+/g, '_')}_${currentPage}${execSuffix}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage <= 1);

      const btnNext = new ButtonBuilder()
        .setCustomId(`help_btn_next_${category.replace(/\s+/g, '_')}_${currentPage}${execSuffix}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= totalPages);

      btnComponents.push(btnPrev, btnNext);
    }
    btnComponents.push(btnDash, btnSupport, btnClose);

    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(btnComponents));

    const modPayload = PayloadFormatter.normalize({ embeds: [embed], components: rows, files }, message.client.user);
    if (updateInteraction) {
      return updateInteraction.update(modPayload).catch(() => {});
    }
    return message.reply(modPayload).catch(() => {});
  }

  public static async sendCommandHelp(message: Message, cmd: PrefixCommandMeta, prefix: string, updateInteraction?: any): Promise<any> {
    const hasPermission = message.member ? PrefixPermissionManager.checkPermissions(message, cmd).allowed : true;
    const executorId = updateInteraction?.user?.id || message.author?.id || '';

    const displayUsage = this.formatUsage(cmd.usage, cmd.name, prefix);

    const embed = new EmbedBuilder()
      .setColor(hasPermission ? 0x84cc16 : 0xEF4444)
      .setAuthor({ name: 'Rage Optimiser Enterprise - Command Manual' })
      .setTitle(`${hasPermission ? SHIELD_ICON : WRONG_ICON} Command Manual: ${prefix}${cmd.name}`)
      .setDescription([
        `> **Description**: ${cmd.description}`,
        !hasPermission ? `> ${WRONG_ICON} **Permission Warning**: You lack the required server permissions to run this command.` : ''
      ].filter(Boolean).join('\n'))
      .addFields(
        { name: 'Command Name', value: `\`${cmd.name}\``, inline: true },
        { name: 'Category', value: `\`${cmd.category}\``, inline: true },
        { name: 'Cooldown', value: `\`${cmd.cooldownSeconds || 3}s\``, inline: true },
        { name: 'Syntax & Master Usage', value: `\`\`\`bash\n${displayUsage}\n\`\`\``, inline: false },
        { name: 'Aliases', value: cmd.aliases.length > 0 ? cmd.aliases.map(a => `\`${prefix}${a}\``).join(', ') : '`None`', inline: true },
        { name: 'User Permission', value: cmd.userPermissions && cmd.userPermissions.length > 0 ? cmd.userPermissions.map(p => `\`${p}\``).join(', ') : '`Everyone`', inline: true },
        { name: 'Bot Permission', value: cmd.botPermissions && cmd.botPermissions.length > 0 ? cmd.botPermissions.map(p => `\`${p}\``).join(', ') : '`SendMessages`', inline: true }
      )
      .setThumbnail(message.client.user?.displayAvatarURL({ size: 256 }) ?? null)
      .setFooter({ text: `Rage Optimiser - Tip: Use ${prefix}help ${cmd.name} <subcommand> for targeted manual` })
      .setTimestamp();

    if (cmd.subcommands && cmd.subcommands.length > 0) {
      const subLines: string[] = [];
      cmd.subcommands.forEach(s => {
        const subNameClean = s.name.startsWith(cmd.name) ? s.name : `${cmd.name} ${s.name}`;
        subLines.push(`- **\`${prefix}${subNameClean}\`**\n> └ ${s.description}`);
      });

      const fullSubText = subLines.join('\n');
      if (fullSubText.length <= 1020) {
        embed.addFields({ name: `${CONFIG_ICON} Subcommands & Execution Modes (${cmd.subcommands.length})`, value: fullSubText, inline: false });
      } else {
        const chunks: string[] = [];
        let currentChunk = '';
        subLines.forEach(line => {
          if ((currentChunk + '\n' + line).length > 1000) {
            chunks.push(currentChunk);
            currentChunk = line;
          } else {
            currentChunk += (currentChunk ? '\n' : '') + line;
          }
        });
        if (currentChunk) chunks.push(currentChunk);

        chunks.forEach((chunk, idx) => {
          embed.addFields({
            name: idx === 0 ? `${CONFIG_ICON} Subcommands & Execution Modes (${cmd.subcommands!.length})` : `Subcommands (Part ${idx + 1})`,
            value: chunk,
            inline: false
          });
        });
      }
    }

    if (cmd.examples && cmd.examples.length > 0) {
      embed.addFields({
        name: `${INFO_ICON} Practical Usage Examples`,
        value: cmd.examples.map(e => `\`${this.formatExample(e, prefix)}\``).join('\n'),
        inline: false
      });
    }

    const components = this.buildComponents(cmd.category, 1, 1, executorId);

    const cmdPayload = PayloadFormatter.normalize({ embeds: [embed], components }, message.client.user);
    if (updateInteraction) {
      return updateInteraction.update(cmdPayload).catch(() => {});
    }
    return message.reply(cmdPayload).catch(() => {});
  }

  public static async sendSubcommandHelp(message: Message, mainCmd: PrefixCommandMeta, subCmd: any, prefix: string, updateInteraction?: any): Promise<any> {
    const hasPermission = message.member ? PrefixPermissionManager.checkPermissions(message, mainCmd).allowed : true;
    const executorId = updateInteraction?.user?.id || message.author?.id || '';

    const displayUsage = this.formatUsage(subCmd.name, mainCmd.name, prefix);

    const embed = new EmbedBuilder()
      .setColor(hasPermission ? 0x84cc16 : 0xEF4444)
      .setAuthor({ name: 'Rage Optimiser Enterprise - Targeted Subcommand Manual' })
      .setTitle(`${hasPermission ? SHIELD_ICON : WRONG_ICON} Subcommand Manual: ${displayUsage}`)
      .setDescription([
        `> **Description**: ${subCmd.description || 'Subcommand execution mode for ' + mainCmd.name}`,
        `> **Parent Module**: \`${mainCmd.category}\` (Command: \`${prefix}${mainCmd.name}\`)`,
        !hasPermission ? `> ${WRONG_ICON} **Permission Warning**: You lack the required server permissions to run this command.` : ''
      ].filter(Boolean).join('\n'))
      .addFields(
        { name: 'Parent Command', value: `\`${prefix}${mainCmd.name}\``, inline: true },
        { name: 'Subcommand Key', value: `\`${subCmd.name}\``, inline: true },
        { name: 'Cooldown', value: `\`${mainCmd.cooldownSeconds || 3}s\``, inline: true },
        { name: 'Full Command Syntax', value: `\`\`\`bash\n${displayUsage}\n\`\`\``, inline: false },
        { name: 'User Permission', value: mainCmd.userPermissions && mainCmd.userPermissions.length > 0 ? mainCmd.userPermissions.map(p => `\`${p}\``).join(', ') : '`Everyone`', inline: true },
        { name: 'Bot Permission', value: mainCmd.botPermissions && mainCmd.botPermissions.length > 0 ? mainCmd.botPermissions.map(p => `\`${p}\``).join(', ') : '`SendMessages`', inline: true }
      )
      .setThumbnail(message.client.user?.displayAvatarURL({ size: 256 }) ?? null)
      .setFooter({ text: `Rage Optimiser - Back to parent manual: ${prefix}help ${mainCmd.name}` })
      .setTimestamp();

    if (subCmd.examples && subCmd.examples.length > 0) {
      embed.addFields({
        name: `${INFO_ICON} Subcommand Usage Examples`,
        value: subCmd.examples.map((e: string) => `\`${this.formatExample(e, prefix)}\``).join('\n'),
        inline: false
      });
    } else if (mainCmd.examples && mainCmd.examples.length > 0) {
      const subKey = subCmd.name.split(' ')[0];
      const matchingEx = mainCmd.examples.filter(e => e.includes(subKey));
      if (matchingEx.length > 0) {
        embed.addFields({
          name: `${INFO_ICON} Practical Subcommand Examples`,
          value: matchingEx.map(e => `\`${this.formatExample(e, prefix)}\``).join('\n'),
          inline: false
        });
      }
    }

    const components = this.buildComponents(mainCmd.category, 1, 1, executorId);

    const subPayload = PayloadFormatter.normalize({ embeds: [embed], components }, message.client.user);
    if (updateInteraction) {
      return updateInteraction.update(subPayload).catch(() => {});
    }
    return message.reply(subPayload).catch(() => {});
  }

  private static buildComponents(currentCategory: string, currentPage: number, totalPages: number, executorId?: string): ActionRowBuilder<any>[] {
    const categories = PrefixRegistry.getCategories();
    const execSuffix = executorId ? `:${executorId}` : '';

    // Select Menu for categories
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`help_category_select${execSuffix}`)
      .setPlaceholder('Click to select module...')
      .addOptions(
        {
          label: 'Home Center',
          value: 'help_cat_home',
          description: 'View command matrix and live system telemetry',
          emoji: '🏠',
          default: currentCategory === 'home'
        },
        ...categories.slice(0, 24).map(cat => {
          const meta = this.getCategoryMeta(cat);
          const count = PrefixRegistry.getCommandsByCategory(cat).length;
          return {
            label: cat,
            value: `help_cat_${cat.toLowerCase().replace(/\s+/g, '_')}`,
            description: `${count} commands — ${meta.description.slice(0, 45)}`,
            emoji: meta.icon,
            default: cat.toLowerCase() === currentCategory.toLowerCase()
          };
        })
      );

    const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    // Buttons Row
    const btnHome = new ButtonBuilder()
      .setCustomId(`help_btn_home${execSuffix}`)
      .setLabel('Home')
      .setStyle(ButtonStyle.Success);

    const btnPrev = new ButtonBuilder()
      .setCustomId(`help_btn_prev_${currentCategory.replace(/\s+/g, '_')}_${currentPage}${execSuffix}`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage <= 1 || currentCategory === 'home');

    const btnNext = new ButtonBuilder()
      .setCustomId(`help_btn_next_${currentCategory.replace(/\s+/g, '_')}_${currentPage}${execSuffix}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages || currentCategory === 'home');

    const btnRefresh = new ButtonBuilder()
      .setCustomId(`help_btn_refresh_${currentCategory.replace(/\s+/g, '_')}_${currentPage}${execSuffix}`)
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Secondary);

    const btnClose = new ButtonBuilder()
      .setCustomId(`help_btn_close${execSuffix}`)
      .setLabel('Close')
      .setStyle(ButtonStyle.Secondary);

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      btnHome,
      btnPrev,
      btnNext,
      btnRefresh,
      btnClose
    );

    return [row1, row2];
  }

  public static async handleSelectMenuInteraction(interaction: any): Promise<any> {
    if (!interaction.isStringSelectMenu()) return;

    const prefix = PrefixResolver.getPrefix(interaction.guildId || undefined);

    if (interaction.customId.startsWith('help_command_select')) {
      const val = interaction.values[0];
      const cmdName = val.replace('help_cmd_', '');
      const cmd = PrefixRegistry.getCommand(cmdName);
      if (cmd) {
        return this.sendCommandHelp(interaction.message, cmd, prefix, interaction);
      }
      return interaction.reply({ content: `${WRONG_EMOJI} Command not found.`, flags: 64 });
    }

    if (!interaction.customId.startsWith('help_category_select')) return;

    const val = interaction.values[0];

    if (val === 'help_cat_home') {
      return this.sendRootHelp(interaction.message, prefix, interaction.client.ws.ping, interaction);
    }

    const catNameLower = val.replace('help_cat_', '').replace(/_/g, ' ');
    const categories = PrefixRegistry.getCategories();
    const matchedCategory = categories.find(c => c.toLowerCase() === catNameLower);

    if (!matchedCategory) {
      return interaction.reply({ content: `${WRONG_EMOJI} Selected module not found.`, flags: 64 });
    }

    return this.sendModuleHelp(interaction.message, matchedCategory, prefix, 1, interaction);
  }

  public static async handleButtonInteraction(interaction: any): Promise<any> {
    if (!interaction.isButton() || !interaction.customId.startsWith('help_btn_')) return;

    // Remove any :executorId suffix before splitting action parts
    const rawId = interaction.customId.split(':')[0];

    if (rawId === 'help_btn_close') {
      return interaction.message.delete().catch(() => {});
    }

    const prefix = PrefixResolver.getPrefix(interaction.guildId || undefined);

    if (rawId === 'help_btn_home') {
      return this.sendRootHelp(interaction.message, prefix, interaction.client.ws.ping, interaction);
    }

    const parts = rawId.split('_'); // help_btn_<action>_<category>_<page>
    const action = parts[2]; // prev, next, or refresh
    const rawCategory = parts.slice(3, parts.length - 1).join(' ').replace(/_/g, ' ');
    const pageNum = parseInt(parts[parts.length - 1]) || 1;

    if (rawCategory === 'home' || !rawCategory) {
      return this.sendRootHelp(interaction.message, prefix, interaction.client.ws.ping, interaction);
    }

    const categories = PrefixRegistry.getCategories();
    const matchedCategory = categories.find(c => c.toLowerCase() === rawCategory.toLowerCase());

    if (!matchedCategory) {
      return this.sendRootHelp(interaction.message, prefix, interaction.client.ws.ping, interaction);
    }

    let targetPage = pageNum;
    if (action === 'prev') targetPage = pageNum - 1;
    if (action === 'next') targetPage = pageNum + 1;

    return this.sendModuleHelp(interaction.message, matchedCategory, prefix, targetPage, interaction);
  }
}

