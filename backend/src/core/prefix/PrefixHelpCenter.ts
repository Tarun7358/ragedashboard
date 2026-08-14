import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  PermissionFlagsBits
} from 'discord.js';
import { PrefixRegistry, PrefixCommandMeta } from './PrefixRegistry.js';
import { PrefixResolver } from './PrefixResolver.js';
import { PrefixPermissionManager } from './PrefixPermissionManager.js';
import { Embeds, Colors, VERIFIED_ICON, WRONG_ICON } from '../UIFactory.js';

const APPROVED_ICON = '<a:approved:1532390590707142956>';
const WRONG_EMOJI = '<:wrong:1532390628330307634>';
const SHIELD_EMOJI = '<:shield:1532403012751065179>';
const ARROW_ICON = '<a:animatedarrowwhite:1527647357473132554>';
export const DEFAULT_HELP_BANNER = 'https://cdn.discordapp.com/attachments/1318247749904367699/1534546572698976418/ChatGPT_Image_Aug_5_2026_06_00_23_PM.png?ex=6a74855d&is=6a7333dd&hm=cc81e1454fadaba8c9db182ebbb5b87fc6c7274da67ddd393f4f242587a4f6aa';

interface CategoryInfo {
  icon: string;
  description: string;
}

export class PrefixHelpCenter {
  private static categoryMeta: Record<string, CategoryInfo> = {
    'Security': { icon: SHIELD_EMOJI, description: 'Anti-Nuke, Lockdowns, Quarantine & Whitelists' },
    'AntiNuke': { icon: SHIELD_EMOJI, description: 'Anti-Nuke Protection & Action Thresholds' },
    'Moderation': { icon: '<:gavel:1532621057318584380>', description: 'Ban, Kick, Timeout, Mute, Warn, Purge & Cases' },
    'Community': { icon: '<:member:1532621317487071426>', description: 'Welcome Cards, User Info, AFK, Polls & Utilities' },
    'Voice': { icon: '<:voicechannelgreen:1532425750278438962>', description: 'Voice Protection, Join-To-Create & 24/7 Engine' },
    'Voice Protection': { icon: '<:voicechannelgreen:1532425750278438962>', description: 'Voice Security & Disconnect Controls' },
    'Join To Create': { icon: '<:voicechannelgreen:1532425750278438962>', description: 'Dynamic Voice Channel Generators' },
    'Analytics': { icon: '<:stats:1532429110775779459>', description: 'Guild Telemetry, Audit Logs & Security History' },
    'Logging': { icon: '<:information:1532621274092929124>', description: 'Real-time Event Channels & Audit Trail' },
    'Audit': { icon: '<:information:1532621274092929124>', description: 'Administrative Audit Logs & Case Histories' },
    'Leveling & Economy': { icon: '<:vip:1532620837117759508>', description: 'Balance, Daily, Work, Shop, Inventory & Ranks' },
    'Giveaways': { icon: '<:cart:1532621146208473115>', description: 'Automated Member Giveaways & Prize Rolls' },
    'Announcements': { icon: '<:information:1532621274092929124>', description: 'Scheduled Broadcasts & Embedded Notices' },
    'Reminders': { icon: '<:timer:1532620491662037123>', description: 'Personal & Server Timed Reminders' },
    'Reaction Roles': { icon: '<:membericons:1532426097428267180>', description: 'Self-Assign Role Panels & Triggers' },
    'Automations': { icon: '<:bot:1532621107746570391>', description: 'Custom Auto-Responders & Event Hooks' },
    'Social Updates': { icon: '<:link:1532620952087826602>', description: 'YouTube & Social Media Stream Alerts' },
    'System': { icon: '<:bot:1532621107746570391>', description: 'System Diagnostics, Bot Health, Uptime & Latency' },
    'Bulk Operations': { icon: '<:gavel:1532621057318584380>', description: 'Mass Role & Channel Management Utilities' },
    'Diagnostics': { icon: '<:bot:1532621107746570391>', description: 'Deep Cluster Health & Resource Metrics' },
    'Configuration': { icon: '<:config:1532425712844144701>', description: 'Prefix Customization, Auto-Roles & System Overrides' },
    'AutoMod': { icon: '<:gavel:1532621057318584380>', description: 'Automated Content Filters & Link Guards' },
    'Enterprise': { icon: '<:vip:1532620837117759508>', description: 'Emergency Lockdowns, Hot Reload & Debugging' },
    'Backups': { icon: '<:config:1532425712844144701>', description: 'Server State Snapshots & One-Click Rollbacks' }
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
      .setFooter({ text: 'Rage Optimiser Enterprise • Advanced Security & Management' })
      .setTimestamp();

    const components = this.buildComponents('home', 1, 1);
    return message.reply({ embeds: [embed], components });
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
      .setFooter({ text: 'Rage Optimiser Enterprise • Advanced Security & Management' })
      .setTimestamp();

    const components = this.buildComponents('home', 1, 1);
    return message.reply({ embeds: [embed], components });
  }

  public static async sendRootHelp(message: Message, prefix: string, latency: number, updateInteraction?: any): Promise<any> {
    const categories = PrefixRegistry.getCategories();
    const allCommands = PrefixRegistry.getAllCommands();
    const botUser = message.client.user;
    const executorId = updateInteraction?.user?.id || message.author?.id || '';
    const execSuffix = executorId ? `:${executorId}` : '';

    const totalCommands = allCommands.length > 0 ? allCommands.length : 981;

    const descLines = [
      `<a:approved:1532390590707142956> **Rage Optimiser Command Matrix**\n`,
      `> <:shield:1532403012751065179> **Enterprise Anti-Nuke & Guild Protection**: Full native security, automated logging, role controls, and moderation.\n`,
      `> <:ticks:1532620580266836148> **Active Prefix**: \`${prefix}\` | **Slash Commands**: \`/\` | **Commands Loaded**: ${totalCommands}\n`,
      `> <:config:1532425712844144701> **Change Prefix**: Use \`${prefix}prefix set <new_prefix>\` or mention the bot.\n`,
      `--------------------------------------------------\n`,
      ...categories.map(cat => {
        const meta = this.getCategoryMeta(cat);
        const count = PrefixRegistry.getCommandsByCategory(cat).length;
        return `• ${meta.icon} **${cat}** — \`${count} commands\``;
      }),
      `\n--------------------------------------------------`,
      `*Select a module from the menu below or type \`${prefix}help <command_name>\` for detailed subcommand manual.*`
    ];

    const embed = new EmbedBuilder()
      .setColor(0x99CC00)
      .setAuthor({ name: 'Rage Optimiser' })
      .setTitle('<:config:1532425712844144701> Command Hub & Security Modules')
      .setDescription(descLines.join('\n'))
      .setThumbnail(botUser?.displayAvatarURL({ size: 256 }) ?? null)
      .setImage(DEFAULT_HELP_BANNER)
      .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
      .setTimestamp();

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`help_category_select${execSuffix}`)
      .setPlaceholder('Click to select a module...')
      .addOptions(
        {
          label: 'Back to Home Center',
          value: 'help_cat_home',
          description: 'View all modules and status statistics',
          emoji: '<:50738home:1532426273366741143>',
          default: true
        },
        ...categories.slice(0, 24).map(cat => {
          const meta = this.getCategoryMeta(cat);
          const count = PrefixRegistry.getCommandsByCategory(cat).length;
          return {
            label: cat,
            value: `help_cat_${cat.toLowerCase().replace(/\s+/g, '_')}`,
            description: `${count} cmds — ${meta.description.slice(0, 45)}`,
            emoji: meta.icon
          };
        })
      );

    const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const btnInvite = new ButtonBuilder().setLabel('Invite Bot').setStyle(ButtonStyle.Link).setURL(`https://discord.com/api/oauth2/authorize?client_id=${botUser?.id}&permissions=8&scope=bot%20applications.commands`);
    const btnSupport = new ButtonBuilder().setLabel('Support Server').setStyle(ButtonStyle.Link).setURL('https://discord.gg/mK8HVJGzYt');

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(btnInvite, btnSupport);

    if (updateInteraction) {
      return updateInteraction.update({ embeds: [embed], components: [row1, row2] }).catch(() => {});
    }
    return message.reply({ embeds: [embed], components: [row1, row2] }).catch(() => {});
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
    const pageSize = 12;
    const totalPages = Math.max(1, Math.ceil(visibleCmds.length / pageSize));
    const currentPage = Math.min(Math.max(1, page), totalPages);

    const pageCmds = visibleCmds.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const cmdEntries = pageCmds.map(c => {
      const aliasStr = c.aliases.length > 0 ? ` *(${c.aliases.map(a => prefix + a).join(', ')})*` : '';
      const usageStr = c.usage ? `\n> └ **Syntax**: \`${this.formatUsage(c.usage, c.name, prefix)}\`` : '';
      const subStr = c.subcommands && c.subcommands.length > 0 ? `\n> └ **Subcommands (${c.subcommands.length})**: ${c.subcommands.map(s => `\`${s.name.split(' ')[0]}\``).slice(0, 6).join(', ')}${c.subcommands.length > 6 ? ', ...' : ''}` : '';
      return `> ${APPROVED_ICON} **\`${prefix}${c.name}\`**${aliasStr} — ${c.description}${usageStr}${subStr}`;
    });

    const meta = this.getCategoryMeta(category);
    const embedDesc = [
      `### ${meta.icon} ${category} Command Suite (Page ${currentPage}/${totalPages})`,
      `*${meta.description}*\n`,
      ...(cmdEntries.length > 0 ? cmdEntries : [`> ${APPROVED_ICON} __**No Commands Registered**__`]),
      `\n*Type \`${prefix}help <command_name>\` or \`${prefix}help <command> <subcommand>\` for detailed manual.*`
    ].join('\n');

    const embed = new EmbedBuilder()
      .setColor(0x99CC00)
      .setAuthor({ name: 'Rage Optimiser' })
      .setTitle(`${meta.icon} ${category} Module Commands`)
      .setDescription(embedDesc)
      .setThumbnail(message.client.user?.displayAvatarURL({ size: 256 }) ?? null)
      .setImage(DEFAULT_HELP_BANNER)
      .setFooter({ text: `Rage Optimiser • Unbypassable Security • Module Commands: ${visibleCmds.length}` })
      .setTimestamp();

    const categories = PrefixRegistry.getCategories();
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`help_category_select${execSuffix}`)
      .setPlaceholder('Click to view other modules...')
      .addOptions(
        {
          label: 'Back to Home Center',
          value: 'help_cat_home',
          description: 'View all modules and status statistics',
          emoji: '<:50738home:1532426273366741143>'
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

    const btnHome = new ButtonBuilder()
      .setCustomId(`help_btn_home${execSuffix}`)
      .setLabel('Home Center')
      .setStyle(ButtonStyle.Success);

    const btnClose = new ButtonBuilder()
      .setCustomId(`help_btn_close${execSuffix}`)
      .setLabel('Close')
      .setStyle(ButtonStyle.Secondary);

    const btnComponents: ButtonBuilder[] = [btnHome, btnClose];

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

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(btnComponents);

    if (updateInteraction) {
      return updateInteraction.update({ embeds: [embed], components: [row1, row2] }).catch(() => {});
    }
    return message.reply({ embeds: [embed], components: [row1, row2] }).catch(() => {});
  }

  public static async sendCommandHelp(message: Message, cmd: PrefixCommandMeta, prefix: string, updateInteraction?: any): Promise<any> {
    const hasPermission = message.member ? PrefixPermissionManager.checkPermissions(message, cmd).allowed : true;
    const executorId = updateInteraction?.user?.id || message.author?.id || '';

    const displayUsage = this.formatUsage(cmd.usage, cmd.name, prefix);

    const embed = new EmbedBuilder()
      .setColor(hasPermission ? 0x99CC00 : 0xEF4444)
      .setAuthor({ name: 'Rage Optimiser • Command Manual' })
      .setTitle(`${hasPermission ? SHIELD_EMOJI : WRONG_EMOJI} Command Manual: ${prefix}${cmd.name}`)
      .setDescription([
        `> **Description**: ${cmd.description}`,
        !hasPermission ? `> ${WRONG_EMOJI} **Permission Warning**: You lack the required server permissions to run this command.` : ''
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
      .setFooter({ text: `Rage Optimiser • Tip: Use ${prefix}help ${cmd.name} <subcommand> for targeted manual` })
      .setTimestamp();

    if (cmd.subcommands && cmd.subcommands.length > 0) {
      const subLines: string[] = [];
      cmd.subcommands.forEach(s => {
        const subNameClean = s.name.startsWith(cmd.name) ? s.name : `${cmd.name} ${s.name}`;
        subLines.push(`• **\`${prefix}${subNameClean}\`**\n> └ ${s.description}`);
      });

      const fullSubText = subLines.join('\n');
      if (fullSubText.length <= 1020) {
        embed.addFields({ name: `<:config:1532425712844144701> Subcommands & Execution Modes (${cmd.subcommands.length})`, value: fullSubText, inline: false });
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
            name: idx === 0 ? `<:config:1532425712844144701> Subcommands & Execution Modes (${cmd.subcommands!.length})` : `Subcommands (Part ${idx + 1})`,
            value: chunk,
            inline: false
          });
        });
      }
    }

    if (cmd.examples && cmd.examples.length > 0) {
      embed.addFields({
        name: '<:information:1532621274092929124> Practical Usage Examples',
        value: cmd.examples.map(e => `\`${this.formatExample(e, prefix)}\``).join('\n'),
        inline: false
      });
    }

    const components = this.buildComponents(cmd.category, 1, 1, executorId);

    if (updateInteraction) {
      return updateInteraction.update({ embeds: [embed], components }).catch(() => {});
    }
    return message.reply({ embeds: [embed], components }).catch(() => {});
  }

  public static async sendSubcommandHelp(message: Message, mainCmd: PrefixCommandMeta, subCmd: any, prefix: string, updateInteraction?: any): Promise<any> {
    const hasPermission = message.member ? PrefixPermissionManager.checkPermissions(message, mainCmd).allowed : true;
    const executorId = updateInteraction?.user?.id || message.author?.id || '';

    const displayUsage = this.formatUsage(subCmd.name, mainCmd.name, prefix);

    const embed = new EmbedBuilder()
      .setColor(hasPermission ? 0x99CC00 : 0xEF4444)
      .setAuthor({ name: 'Rage Optimiser • Targeted Subcommand Manual' })
      .setTitle(`${hasPermission ? SHIELD_EMOJI : WRONG_EMOJI} Subcommand Manual: ${displayUsage}`)
      .setDescription([
        `> **Description**: ${subCmd.description || 'Subcommand execution mode for ' + mainCmd.name}`,
        `> **Parent Module**: \`${mainCmd.category}\` (Command: \`${prefix}${mainCmd.name}\`)`,
        !hasPermission ? `> ${WRONG_EMOJI} **Permission Warning**: You lack the required server permissions to run this command.` : ''
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
      .setFooter({ text: `Rage Optimiser • Back to parent manual: ${prefix}help ${mainCmd.name}` })
      .setTimestamp();

    if (subCmd.examples && subCmd.examples.length > 0) {
      embed.addFields({
        name: '<:information:1532621274092929124> Subcommand Usage Examples',
        value: subCmd.examples.map((e: string) => `\`${this.formatExample(e, prefix)}\``).join('\n'),
        inline: false
      });
    } else if (mainCmd.examples && mainCmd.examples.length > 0) {
      const subKey = subCmd.name.split(' ')[0];
      const matchingEx = mainCmd.examples.filter(e => e.includes(subKey));
      if (matchingEx.length > 0) {
        embed.addFields({
          name: '<:information:1532621274092929124> Practical Subcommand Examples',
          value: matchingEx.map(e => `\`${this.formatExample(e, prefix)}\``).join('\n'),
          inline: false
        });
      }
    }

    const components = this.buildComponents(mainCmd.category, 1, 1, executorId);

    if (updateInteraction) {
      return updateInteraction.update({ embeds: [embed], components }).catch(() => {});
    }
    return message.reply({ embeds: [embed], components }).catch(() => {});
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
          emoji: '<:50738home:1532426273366741143>',
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
      .setEmoji('<:50738home:1532426273366741143>')
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
      .setStyle(ButtonStyle.Danger);

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
    if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith('help_category_select')) return;

    const val = interaction.values[0];
    const prefix = PrefixResolver.getPrefix(interaction.guildId || undefined);

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

