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

interface CategoryInfo {
  icon: string;
  description: string;
}

export class PrefixHelpCenter {
  private static categoryMeta: Record<string, CategoryInfo> = {
    'Security': { icon: SHIELD_EMOJI, description: 'Anti-Nuke, Lockdowns, Quarantine & Whitelists' },
    'AntiNuke': { icon: '🛡️', description: 'Anti-Nuke Protection & Action Thresholds' },
    'Moderation': { icon: '👮', description: 'Ban, Kick, Timeout, Mute, Warn, Purge & Cases' },
    'Welcome': { icon: '👋', description: 'Welcome Suite, Goodbye Logs, Birthdays & Milestones' },
    'Tickets': { icon: '🎫', description: 'Multi-Department Ticket Panels & Transcripts' },
    'Voice': { icon: '🎙️', description: 'Voice Protection, Join-To-Create & 24/7 Engine' },
    'Voice Protection': { icon: '🎙️', description: 'Voice Security & Disconnect Controls' },
    'Join To Create': { icon: '🎙️', description: 'Dynamic Voice Channel Generators' },
    'Analytics': { icon: '📊', description: 'Guild Telemetry, Audit Logs & Security History' },
    'Logging': { icon: '📜', description: 'Real-time Event Channels & Audit Trail' },
    'Audit': { icon: '📋', description: 'Administrative Audit Logs & Case Histories' },
    'Leveling & Economy': { icon: '💰', description: 'Balance, Daily, Work, Shop, Inventory & Ranks' },
    'Giveaways': { icon: '🎉', description: 'Automated Member Giveaways & Prize Rolls' },
    'Announcements': { icon: '📢', description: 'Scheduled Broadcasts & Embedded Notices' },
    'Reminders': { icon: '⏰', description: 'Personal & Server Timed Reminders' },
    'Reaction Roles': { icon: '🎭', description: 'Self-Assign Role Panels & Triggers' },
    'Automations': { icon: '🤖', description: 'Custom Auto-Responders & Event Hooks' },
    'Social Updates': { icon: '📡', description: 'YouTube & Social Media Stream Alerts' },
    'Payment QR': { icon: '💳', description: 'QR Payment Portals, Invoices & Subscriptions' },
    'System': { icon: '⚡', description: 'System Diagnostics, Bot Health, Uptime & Latency' },
    'Bulk Operations': { icon: '🛠️', description: 'Mass Role & Channel Management Utilities' },
    'Diagnostics': { icon: '🩺', description: 'Deep Cluster Health & Resource Metrics' },
    'Configuration': { icon: '🔧', description: 'Prefix Customization, Auto-Roles & System Overrides' },
    'AutoMod': { icon: '⚙️', description: 'Automated Content Filters & Link Guards' },
    'Enterprise': { icon: '👑', description: 'Emergency Lockdowns, Hot Reload & Debugging' },
    'Backups': { icon: '📦', description: 'Server State Snapshots & One-Click Rollbacks' }
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

    // 2. Check if query matches a command name or alias directly
    const command = PrefixRegistry.getCommand(cleanQuery);
    if (command) {
      return this.sendCommandHelp(message, command, currentPrefix);
    }

    // 3. Dynamic Multi-Word Fuzzy Search
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

    const totalCommands = allCommands.length > 0 ? allCommands.length : 981;

    const descLines = [
      `### 👋 Welcome to ${botUser || 'Rage Optimiser Enterprise'},\n`,
      `> » **Enterprise Security 2.0 & Guild Suite**: Complete server management, anti-nuke protection, music, and automation system.\n`,
      `> » **Active Prefix**: \`${prefix}\` | **Slash Commands**: \`/\` | **Total Commands**: **${totalCommands}**\n`,
      `> » **Change Prefix**: Use \`${prefix}prefix set <new_prefix>\` or mention the bot.\n`,
      `--------------------------------------------------\n`,
      ...categories.map(cat => {
        const meta = this.getCategoryMeta(cat);
        const count = PrefixRegistry.getCommandsByCategory(cat).length;
        return `• ${meta.icon} **${cat}** — \`${count} commands\` · *${meta.description}*`;
      }),
      `\n--------------------------------------------------`,
      `*Select a module from the dropdown below or type \`${prefix}help <command_name>\` to view detailed manual and subcommands.*`
    ];

    const embed = new EmbedBuilder()
      .setColor(0x7C5CFC)
      .setAuthor({ name: 'Rage Optimiser Enterprise • Master Help Matrix' })
      .setDescription(descLines.join('\n'))
      .setThumbnail(botUser?.displayAvatarURL({ size: 256 }) ?? null)
      .setFooter({ text: 'Rage Optimiser v4.2 • Enterprise Suite' })
      .setTimestamp();

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('help_category_select')
      .setPlaceholder('Click to view module command list...')
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
            description: `${count} cmds — ${meta.description.slice(0, 45)}`,
            emoji: meta.icon
          };
        })
      );

    const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const btnDashboard = new ButtonBuilder().setLabel('Dashboard').setStyle(ButtonStyle.Link).setURL('https://rageoptimiser.com/dashboard');
    const btnInvite = new ButtonBuilder().setLabel('Invite Bot').setStyle(ButtonStyle.Link).setURL(`https://discord.com/api/oauth2/authorize?client_id=${botUser?.id}&permissions=8&scope=bot%20applications.commands`);
    const btnSupport = new ButtonBuilder().setLabel('Support Server').setStyle(ButtonStyle.Link).setURL('https://discord.gg/rageoptimiser');

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(btnDashboard, btnInvite, btnSupport);

    if (updateInteraction) {
      return updateInteraction.update({ embeds: [embed], components: [row1, row2] }).catch(() => {});
    }
    return message.reply({ embeds: [embed], components: [row1, row2] }).catch(() => {});
  }

  public static async sendModuleHelp(message: Message, category: string, prefix: string, page = 1, updateInteraction?: any): Promise<any> {
    const allCategoryCmds = PrefixRegistry.getCommandsByCategory(category);

    const visibleCmds = allCategoryCmds.filter(c => !c.hidden);
    const pageSize = 12;
    const totalPages = Math.max(1, Math.ceil(visibleCmds.length / pageSize));
    const currentPage = Math.min(Math.max(1, page), totalPages);

    const pageCmds = visibleCmds.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const cmdEntries = pageCmds.map(c => {
      const aliasStr = c.aliases.length > 0 ? ` *(${c.aliases.map(a => prefix + a).join(', ')})*` : '';
      const usageStr = c.usage ? `\n> └ **Syntax**: \`${c.usage.startsWith(prefix) || c.usage.startsWith('r!') ? c.usage : prefix + c.name + ' ' + c.usage}\`` : '';
      const subStr = c.subcommands && c.subcommands.length > 0 ? `\n> └ **Subcommands**: ${c.subcommands.map(s => `\`${s.name}\``).join(', ')}` : '';
      return `> ${APPROVED_ICON} **\`${prefix}${c.name}\`**${aliasStr} — ${c.description}${usageStr}${subStr}`;
    });

    const meta = this.getCategoryMeta(category);
    const embedDesc = [
      `### ${meta.icon} ${category} Command Module (Page ${currentPage}/${totalPages})`,
      `*${meta.description}*\n`,
      ...(cmdEntries.length > 0 ? cmdEntries : [`> ${APPROVED_ICON} __**No Commands Registered**__`]),
      `\n*Type \`${prefix}help <command_name>\` for detailed subcommand breakdown and examples.*`
    ].join('\n');

    const embed = new EmbedBuilder()
      .setColor(0x7C5CFC)
      .setAuthor({ name: `Rage Optimiser Enterprise • ${category} Suite` })
      .setDescription(embedDesc)
      .setThumbnail(message.client.user?.displayAvatarURL({ size: 256 }) ?? null)
      .setFooter({ text: `Rage Optimiser v4.2 • Enterprise Suite  •  Total Module Commands: ${visibleCmds.length}` })
      .setTimestamp();

    const categories = PrefixRegistry.getCategories();
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('help_category_select')
      .setPlaceholder('Click to view other modules...')
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

    const btnHome = new ButtonBuilder()
      .setCustomId('help_btn_home')
      .setLabel('Home Center')
      .setStyle(ButtonStyle.Success);

    const btnClose = new ButtonBuilder()
      .setCustomId('help_btn_close')
      .setLabel('Close')
      .setStyle(ButtonStyle.Secondary);

    const btnComponents: ButtonBuilder[] = [btnHome, btnClose];

    if (totalPages > 1) {
      const btnPrev = new ButtonBuilder()
        .setCustomId(`help_btn_prev_${category.replace(/\s+/g, '_')}_${currentPage}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage <= 1);

      const btnNext = new ButtonBuilder()
        .setCustomId(`help_btn_next_${category.replace(/\s+/g, '_')}_${currentPage}`)
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

    const embed = new EmbedBuilder()
      .setColor(hasPermission ? 0x7C5CFC : 0xEF4444)
      .setAuthor({ name: 'Rage Optimiser Enterprise • Command Manual' })
      .setTitle(`${hasPermission ? '🛡️' : '⚠️'} Command Manual: ${prefix}${cmd.name}`)
      .setDescription([
        `> **Description**: ${cmd.description}`,
        !hasPermission ? `> ⚠️ **Permission Warning**: You lack the required server permissions to run this command.` : ''
      ].filter(Boolean).join('\n'))
      .addFields(
        { name: '🏷️ Command Name', value: `\`${cmd.name}\``, inline: true },
        { name: '📁 Category', value: `\`${cmd.category}\``, inline: true },
        { name: '⏱️ Cooldown', value: `\`${cmd.cooldownSeconds || 3}s\``, inline: true },
        { name: '📝 Syntax & Usage', value: `\`\`\`bash\n${cmd.usage.startsWith('r!') ? prefix + cmd.usage.slice(2) : cmd.usage}\n\`\`\``, inline: false },
        { name: '🔀 Aliases', value: cmd.aliases.length > 0 ? cmd.aliases.map(a => `\`${prefix}${a}\``).join(', ') : '`None`', inline: true },
        { name: '🔒 User Permission', value: cmd.userPermissions && cmd.userPermissions.length > 0 ? cmd.userPermissions.map(p => `\`${p}\``).join(', ') : '`Everyone`', inline: true },
        { name: '🤖 Bot Permission', value: cmd.botPermissions && cmd.botPermissions.length > 0 ? cmd.botPermissions.map(p => `\`${p}\``).join(', ') : '`SendMessages`', inline: true }
      )
      .setThumbnail(message.client.user?.displayAvatarURL({ size: 256 }) ?? null)
      .setFooter({ text: 'Rage Optimiser v4.2 • Enterprise Suite' })
      .setTimestamp();

    if (cmd.subcommands && cmd.subcommands.length > 0) {
      const subLines = cmd.subcommands.map(s => `• \`${prefix}${cmd.name} ${s.name}\` — ${s.description}`).join('\n');
      embed.addFields({ name: '🧩 Subcommands & Modes', value: subLines.length > 1024 ? subLines.substring(0, 1020) + '...' : subLines, inline: false });
    }

    if (cmd.examples && cmd.examples.length > 0) {
      embed.addFields({ name: '💡 Practical Usage Examples', value: cmd.examples.map(e => `\`${e.startsWith('r!') ? prefix + e.slice(2) : e}\``).join('\n'), inline: false });
    }


    const components = this.buildComponents(cmd.category, 1, 1);

    if (updateInteraction) {
      return updateInteraction.update({ embeds: [embed], components }).catch(() => {});
    }
    return message.reply({ embeds: [embed], components }).catch(() => {});
  }

  private static buildComponents(currentCategory: string, currentPage: number, totalPages: number): ActionRowBuilder<any>[] {
    const categories = PrefixRegistry.getCategories();

    // Select Menu for categories
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('help_category_select')
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
      .setCustomId('help_btn_home')
      .setLabel('Home')
      .setEmoji('🏠')
      .setStyle(ButtonStyle.Success);

    const btnPrev = new ButtonBuilder()
      .setCustomId(`help_btn_prev_${currentCategory.replace(/\s+/g, '_')}_${currentPage}`)
      .setLabel('Previous')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage <= 1 || currentCategory === 'home');

    const btnNext = new ButtonBuilder()
      .setCustomId(`help_btn_next_${currentCategory.replace(/\s+/g, '_')}_${currentPage}`)
      .setLabel('Next')
      .setEmoji('➡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages || currentCategory === 'home');

    const btnRefresh = new ButtonBuilder()
      .setCustomId(`help_btn_refresh_${currentCategory.replace(/\s+/g, '_')}_${currentPage}`)
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary);

    const btnClose = new ButtonBuilder()
      .setCustomId('help_btn_close')
      .setLabel('Close')
      .setEmoji('❌')
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
    if (!interaction.isStringSelectMenu() || interaction.customId !== 'help_category_select') return;

    const val = interaction.values[0];
    const prefix = PrefixResolver.getPrefix(interaction.guildId || undefined);

    if (val === 'help_cat_home') {
      return this.sendRootHelp(interaction.message, prefix, interaction.client.ws.ping, interaction);
    }

    const catNameLower = val.replace('help_cat_', '').replace(/_/g, ' ');
    const categories = PrefixRegistry.getCategories();
    const matchedCategory = categories.find(c => c.toLowerCase() === catNameLower);

    if (!matchedCategory) {
      return interaction.reply({ content: '❌ Selected module not found.', flags: 64 });
    }

    return this.sendModuleHelp(interaction.message, matchedCategory, prefix, 1, interaction);
  }

  public static async handleButtonInteraction(interaction: any): Promise<any> {
    if (!interaction.isButton() || !interaction.customId.startsWith('help_btn_')) return;

    if (interaction.customId === 'help_btn_close') {
      return interaction.message.delete().catch(() => {});
    }

    const prefix = PrefixResolver.getPrefix(interaction.guildId || undefined);

    if (interaction.customId === 'help_btn_home') {
      return this.sendRootHelp(interaction.message, prefix, interaction.client.ws.ping, interaction);
    }

    const parts = interaction.customId.split('_'); // help_btn_<action>_<category>_<page>
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

