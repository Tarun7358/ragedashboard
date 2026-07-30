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
import { Embeds, Colors, Components } from '../UIFactory.js';

export class PrefixHelpCenter {
  private static categoryIcons: Record<string, string> = {
    'AntiNuke': '🛡️',
    'Security': '🔐',
    'AutoMod': '⚙️',
    'Voice Protection': '🎤',
    'Logging': '📜',
    'Backups': '📦',
    'Audit': '📋',
    'Bulk Operations': '🛠️',
    'Diagnostics': '🩺',
    'Leveling & Economy': '🏆',
    'Welcome': '👋',
    'Giveaways': '🎉',
    'Tickets': '🎫',
    'Reaction Roles': '🎭',
    'Social Updates': '📡',
    'Announcements': '📢',
    'Automations': '🤖',
    'Reminders': '⏰',
    'Join To Create': '🎙️',
    'Voice': '🔊',
    'Music': '🎵',
    'Analytics': '📊',
    'Payment QR': '💳',
    'System': '⚙️',
    'Core': '👑',
    'Administration': '⚙️'
  };

  public static async handleHelp(message: Message, query?: string): Promise<any> {
    const guildId = message.guildId || undefined;
    const currentPrefix = PrefixResolver.getPrefix(guildId);
    const latency = message.client.ws.ping > 0 ? message.client.ws.ping : 14;

    if (!query) {
      return this.sendRootHelp(message, currentPrefix, latency);
    }

    const cleanQuery = query.trim().toLowerCase();

    // Check if query is a category / module
    const categories = PrefixRegistry.getCategories();
    const matchedCategory = categories.find(c => c.toLowerCase() === cleanQuery);

    if (matchedCategory) {
      return this.sendModuleHelp(message, matchedCategory, currentPrefix, 1);
    }

    // Check if query is a command name or alias
    const command = PrefixRegistry.getCommand(cleanQuery);
    if (command) {
      return this.sendCommandHelp(message, command, currentPrefix);
    }

    // Dynamic Multi-Word Fuzzy/Prefix Search
    const searchResults = this.searchCommands(cleanQuery);
    if (searchResults.length > 0) {
      return this.sendSearchResults(message, cleanQuery, searchResults, currentPrefix);
    }

    // Unknown module/command fallback
    const embed = Embeds.error(
      '🔍 Command Engine — No Match Found',
      `No module or command matching **\`${query}\`** was found.\n\nType **\`${currentPrefix}help\`** to open the Command Matrix or use the dropdown menu below.`,
      { module: 'help' }
    );

    return message.reply({ embeds: [embed] });
  }

  private static searchCommands(query: string): PrefixCommandMeta[] {
    const all = PrefixRegistry.getAllCommands();
    const keywords = query.split(/\s+/).filter(Boolean);
    
    return all.filter(cmd => {
      // Direct exact matches
      if (cmd.name === query || cmd.aliases.includes(query)) return true;
      
      // Prefix/Fuzzy matches against name, aliases, or description
      return keywords.every(kw => 
        cmd.name.includes(kw) || 
        cmd.aliases.some(a => a.includes(kw)) ||
        cmd.description.toLowerCase().includes(kw)
      );
    }).slice(0, 10);
  }

  private static async sendSearchResults(message: Message, query: string, results: PrefixCommandMeta[], prefix: string): Promise<any> {
    const embed = Embeds.info(
      `🔍 Search Results: "${query}"`,
      `Found **${results.length}** commands matching your query:\n\n` + 
        results.map(c => `<a:animatedarrowwhite:1527647357473132554> **\`${prefix}${c.name}\`** — ${c.description} (\`${c.category}\`)`).join('\n'),
      { module: 'help' }
    );

    return message.reply({ embeds: [embed] });
  }

  public static async sendRootHelp(message: Message, prefix: string, latency: number, updateInteraction?: any): Promise<any> {
    const categories = PrefixRegistry.getCategories();
    const totalCommands = PrefixRegistry.getAllCommands().length;
    const botUser = message.client.user;
    const verifiedIcon = '<a:approved:1532390590707142956>';

    const descLines = [
      `### Hey !!! , I am ${botUser} ,\n`,
      `> » **Welcome to Security 2.0** A bot which is made for unbypassable security features and community management! View down and see our server management modules listed below: **Total Commands: ${totalCommands > 0 ? totalCommands : '981'}**\n`,
      `> » **To set Custom Prefix use** ${botUser} **prefix " your custom prefix "**\n`,
      ...categories.map(c => `> <a:animatedarrowwhite:1527647357473132554> __**${c}**__`)
    ];

    const embed = new EmbedBuilder()
      .setColor(0x84cc16)
      .setDescription(descLines.join('\n'))
      .setThumbnail(botUser?.displayAvatarURL({ size: 256 }) ?? null)
      .setFooter({ text: 'Rage Optimiser • Security Engine' })
      .setTimestamp();

    // Select Menu for categories
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('help_category_select')
      .setPlaceholder('Click to view modules')
      .addOptions(
        {
          label: 'Back to Home Center',
          value: 'help_cat_home',
          description: 'View all modules and status statistics',
          emoji: '🏠'
        },
        ...categories.slice(0, 24).map(cat => ({
          label: cat,
          value: `help_cat_${cat.toLowerCase()}`,
          description: `View all ${cat} commands and syntax`,
          emoji: this.categoryIcons[cat] || '📁'
        }))
      );

    const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const btnDashboard = new ButtonBuilder().setLabel('Dashboard').setStyle(ButtonStyle.Link).setURL('https://rageoptimiser.com/dashboard');
    const btnInvite = new ButtonBuilder().setLabel('Invite Bot').setStyle(ButtonStyle.Link).setURL(`https://discord.com/api/oauth2/authorize?client_id=${botUser?.id}&permissions=8&scope=bot%20applications.commands`);
    const btnSupport = new ButtonBuilder().setLabel('Support Server').setStyle(ButtonStyle.Link).setURL('https://discord.gg/rageoptimiser');

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(btnDashboard, btnInvite, btnSupport);

    if (updateInteraction) {
      return updateInteraction.update({ embeds: [embed], components: [row1, row2] });
    }
    return message.reply({ embeds: [embed], components: [row1, row2] });
  }

  public static async sendModuleHelp(message: Message, category: string, prefix: string, page = 1, updateInteraction?: any): Promise<any> {
    const commands = PrefixRegistry.getCommandsByCategory(category);
    const pageSize = 12;
    const totalPages = Math.max(1, Math.ceil(commands.length / pageSize));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const verifiedIcon = '<a:approved:1532390590707142956>';

    const pageCmds = commands.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const cmdList = pageCmds.map(c => `> ${verifiedIcon} __**${c.name}**__`);

    const embedDesc = [
      `> • **${category.toUpperCase()} STATUS**`,
      `> • **RAGE OPTIMISER**`,
      `> `,
      ...(cmdList.length > 0 ? cmdList : [`> ${verifiedIcon} __**No Commands Registered**__`])
    ].join('\n');

    const embed = new EmbedBuilder()
      .setColor(0x84cc16)
      .setDescription(embedDesc)
      .setThumbnail(message.client.user?.displayAvatarURL({ size: 256 }) ?? null)
      .setFooter({ text: 'Rage Optimiser • Security Engine' })
      .setTimestamp();

    // Select Menu
    const categories = PrefixRegistry.getCategories();
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('help_category_select')
      .setPlaceholder('Click to view modules')
      .addOptions(
        {
          label: 'Back to Home Center',
          value: 'help_cat_home',
          description: 'View all modules and status statistics',
          emoji: '🏠'
        },
        ...categories.slice(0, 24).map(cat => ({
          label: cat,
          value: `help_cat_${cat.toLowerCase()}`,
          description: `View all ${cat} commands and syntax`,
          emoji: this.categoryIcons[cat] || '📁',
          default: cat.toLowerCase() === category.toLowerCase()
        }))
      );

    const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    // Buttons
    const btnHome = new ButtonBuilder()
      .setCustomId('help_btn_home')
      .setLabel('Open Modules Manager')
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
      return updateInteraction.update({ embeds: [embed], components: [row1, row2] });
    }
    return message.reply({ embeds: [embed], components: [row1, row2] });
  }

  public static async sendCommandHelp(message: Message, cmd: PrefixCommandMeta, prefix: string): Promise<any> {
    const hasPermission = message.member ? PrefixPermissionManager.checkPermissions(message, cmd).allowed : true;
    const verifiedIcon = '<a:approved:1532390590707142956>';
    const wrongIcon = '<:wrong:1532390628330307634>';

    const embed = new EmbedBuilder()
      .setColor(hasPermission ? 0x84cc16 : 0xef4444)
      .setDescription([
        `### ${hasPermission ? verifiedIcon : wrongIcon} **COMMAND MANUAL**: \`${prefix}${cmd.name}\`\n`,
        `> » **Description**: ${cmd.description}`,
        !hasPermission ? `> » ⚠️ **Permission Warning**: You lack required server permissions to run this command.` : ''
      ].filter(Boolean).join('\n'))
      .addFields(
        { name: '🏷️ Command', value: `\`${cmd.name}\``, inline: true },
        { name: '📁 Category', value: `\`${cmd.category}\``, inline: true },
        { name: '⏱️ Cooldown', value: `\`${cmd.cooldownSeconds || 3}s\``, inline: true },
        { name: '📝 Syntax & Usage', value: `\`\`\`bash\n${cmd.usage}\n\`\`\``, inline: false },
        { name: '🔀 Aliases', value: cmd.aliases.length > 0 ? cmd.aliases.map(a => `\`${a}\``).join(', ') : '`None`', inline: true },
        { name: '🔒 User Required Permission', value: cmd.userPermissions && cmd.userPermissions.length > 0 ? cmd.userPermissions.map(p => `\`${p}\``).join(', ') : '`Everyone`', inline: true },
        { name: '🤖 Bot Required Permission', value: cmd.botPermissions && cmd.botPermissions.length > 0 ? cmd.botPermissions.map(p => `\`${p}\``).join(', ') : '`SendMessages`', inline: true }
      )
      .setThumbnail(message.client.user?.displayAvatarURL({ size: 256 }) ?? null)
      .setFooter({ text: 'Rage Optimiser • Security Engine' })
      .setTimestamp();

    if (cmd.examples && cmd.examples.length > 0) {
      embed.addFields({ name: '💡 Practical Examples', value: cmd.examples.map(e => `\`${e}\``).join('\n'), inline: false });
    }

    return message.reply({ embeds: [embed] });
  }

  public static async handleSelectMenuInteraction(interaction: any): Promise<any> {
    if (!interaction.isStringSelectMenu() || interaction.customId !== 'help_category_select') return;

    const val = interaction.values[0];
    if (val === 'help_cat_home') {
      const prefix = PrefixResolver.getPrefix(interaction.guildId || undefined);
      return this.sendRootHelp(interaction.message, prefix, interaction.client.ws.ping, interaction);
    }

    const catNameLower = val.replace('help_cat_', '').replace(/_/g, ' ');
    const categories = PrefixRegistry.getCategories();
    const matchedCategory = categories.find(c => c.toLowerCase() === catNameLower);

    if (!matchedCategory) {
      return interaction.reply({ content: '❌ Selected module not found.', flags: 64 });
    }

    const prefix = PrefixResolver.getPrefix(interaction.guildId || undefined);
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

    const parts = interaction.customId.split('_'); // help_btn_prev_<category>_<page>
    const action = parts[2]; // prev or next
    const rawCategory = parts.slice(3, parts.length - 1).join(' ').replace(/_/g, ' ');
    const pageNum = parseInt(parts[parts.length - 1]);

    const categories = PrefixRegistry.getCategories();
    const matchedCategory = categories.find(c => c.toLowerCase() === rawCategory.toLowerCase());

    if (!matchedCategory) {
      return interaction.reply({ content: '❌ Module context lost.', flags: 64 });
    }

    const targetPage = action === 'prev' ? pageNum - 1 : pageNum + 1;
    return this.sendModuleHelp(interaction.message, matchedCategory, prefix, targetPage, interaction);
  }
}
