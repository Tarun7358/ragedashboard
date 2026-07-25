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

export class PrefixHelpCenter {
  private static categoryIcons: Record<string, string> = {
    'AntiNuke': '🛡️',
    'AutoMod': '⚙️',
    'Ticket': '🎫',
    'Welcome': '👋',
    'Utility': '🛠️',
    'Music': '🎵',
    'Moderation': '🔨',
    'Logging': '📜',
    'Giveaway': '🎉',
    'Leaderboard': '🏆',
    'Leveling': '🏆',
    'Voice Protection': '🎤',
    'VoiceMaster': '🎙️',
    'Reaction Roles': '🎭',
    'Custom Roles': '⭐',
    'Automations': '🤖',
    'Backup': '📦',
    'Security': '🔐',
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
    const embed = new EmbedBuilder()
      .setTitle('🔍 Command Engine — No Match Found')
      .setDescription(`No module or command matching **\`${query}\`** was found.\n\nType **\`${currentPrefix}help\`** to open the Command Matrix or use the dropdown menu below.`)
      .setColor('#ff4444')
      .setFooter({ text: 'Rage Optimiser • Command Engine' });

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
    const embed = new EmbedBuilder()
      .setTitle(`🔍 Search Results: "${query}"`)
      .setDescription(`Found **${results.length}** commands matching your query:\n\n` + 
        results.map(c => `• **\`${prefix}${c.name}\`** — ${c.description} (\`${c.category}\`)`).join('\n'))
      .setColor('#7c5cfc')
      .setFooter({ text: 'Rage Optimiser • Search Index Engine' })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  public static async sendRootHelp(message: Message, prefix: string, latency: number, updateInteraction?: any): Promise<any> {
    const categories = PrefixRegistry.getCategories();
    const totalCommands = PrefixRegistry.getAllCommands().length;

    // Organized Matrix Grouping
    const securityGroup = ['AntiNuke', 'Security', 'AutoMod', 'Voice Protection'].filter(c => categories.includes(c as any));
    const modGroup = ['Administration', 'Moderation', 'Backup', 'Logging'].filter(c => categories.includes(c as any));
    const commGroup = ['Leveling', 'Welcome', 'Giveaway', 'Ticket', 'Reaction Roles'].filter(c => categories.includes(c as any));
    const autoGroup = ['Automations', 'VoiceMaster', 'Utility', 'Music', 'Core'].filter(c => categories.includes(c as any));

    // Fallback for remaining uncategorized modules
    const mapped = new Set([...securityGroup, ...modGroup, ...commGroup, ...autoGroup]);
    const extraGroup = categories.filter(c => !mapped.has(c));

    const formatGroupPills = (list: string[]) => list.map(c => `\`${c}\``).join('  •  ');

    const descLines = [
      `*Enterprise Guild Protection & Command Center*\n`,
      `> 💬 **Prefix:** \`${prefix}\`   •   🤖 **Slash:** \`/\``,
      `> 🏓 **Latency:** \`${latency}ms\`   •   🧩 **Modules:** \`${categories.length}\`   •   ⚡ **Commands:** \`${totalCommands > 0 ? totalCommands : '85+'}\`\n`,
      `🛡️ **Security & AntiNuke**`,
      `${formatGroupPills(securityGroup) || '`None`'}\n`,
      `🔨 **Moderation & Management**`,
      `${formatGroupPills(modGroup) || '`None`'}\n`,
      `🎁 **Community & Engagement**`,
      `${formatGroupPills(commGroup) || '`None`'}\n`,
      `🤖 **Automations & Utilities**`,
      `${formatGroupPills(autoGroup) || '`None`'}`
    ];

    if (extraGroup.length > 0) {
      descLines.push(`\n📁 **Other Modules**\n${formatGroupPills(extraGroup)}`);
    }

    descLines.push(`\n*Select a command module from the dropdown below or run \`${prefix}help <query>\` to filter syntax.*`);

    const embed = new EmbedBuilder()
      .setTitle('⚡ Rage Optimiser Command Hub')
      .setDescription(descLines.join('\n'))
      .setColor('#7c5cfc')
      .setThumbnail(message.client.user?.displayAvatarURL() || null)
      .setFooter({
        text: `Rage Optimiser Enterprise • Engine v3.0`,
        iconURL: message.client.user?.displayAvatarURL()
      })
      .setTimestamp();

    // Select Menu for categories
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('help_category_select')
      .setPlaceholder('Select a Command Module...')
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
    const btnInvite = new ButtonBuilder().setLabel('Invite Bot').setStyle(ButtonStyle.Link).setURL(`https://discord.com/api/oauth2/authorize?client_id=${message.client.user?.id}&permissions=8&scope=bot%20applications.commands`);
    const btnSupport = new ButtonBuilder().setLabel('Support Server').setStyle(ButtonStyle.Link).setURL('https://discord.gg/rageoptimiser');
    const btnWebsite = new ButtonBuilder().setLabel('Website').setStyle(ButtonStyle.Link).setURL('https://rageoptimiser.com');

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(btnDashboard, btnInvite, btnSupport, btnWebsite);

    if (updateInteraction) {
      return updateInteraction.update({ embeds: [embed], components: [row1, row2] });
    }
    return message.reply({ embeds: [embed], components: [row1, row2] });
  }

  public static async sendModuleHelp(message: Message, category: string, prefix: string, page = 1, updateInteraction?: any): Promise<any> {
    const commands = PrefixRegistry.getCommandsByCategory(category);
    const pageSize = 10;
    const totalPages = Math.max(1, Math.ceil(commands.length / pageSize));
    const currentPage = Math.min(Math.max(1, page), totalPages);

    const pageCmds = commands.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const cmdList = pageCmds.map(c => `🔹 **\`${prefix}${c.name}\`** — ${c.description}`).join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`${this.categoryIcons[category] || '📁'} Module: ${category}`)
      .setDescription(`Available commands in this module (**Page ${currentPage}/${totalPages}**):\n\n${cmdList || 'No commands registered.'}`)
      .setColor('#7c5cfc')
      .setFooter({ text: `Use ${prefix}help <command> for detailed parameter guide` })
      .setTimestamp();

    // Select Menu
    const categories = PrefixRegistry.getCategories();
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('help_category_select')
      .setPlaceholder('Select a Command Module...')
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

    // Pagination buttons
    const btnHome = new ButtonBuilder()
      .setCustomId('help_btn_home')
      .setLabel('Home')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🏠');

    const btnPrev = new ButtonBuilder()
      .setCustomId(`help_btn_prev_${category.replace(/\s+/g, '_')}_${currentPage}`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage <= 1);

    const btnNext = new ButtonBuilder()
      .setCustomId(`help_btn_next_${category.replace(/\s+/g, '_')}_${currentPage}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage >= totalPages);

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(btnHome, btnPrev, btnNext);

    if (updateInteraction) {
      return updateInteraction.update({ embeds: [embed], components: [row1, row2] });
    }
    return message.reply({ embeds: [embed], components: [row1, row2] });
  }

  public static async sendCommandHelp(message: Message, cmd: PrefixCommandMeta, prefix: string): Promise<any> {
    const hasPermission = message.member ? PrefixPermissionManager.checkPermissions(message, cmd).allowed : true;

    const embed = new EmbedBuilder()
      .setTitle(`📖 Command Manual: ${prefix}${cmd.name}`)
      .setDescription(`*${cmd.description}*` + (hasPermission ? '' : '\n\n⚠️ **WARNING**: You lack the required server permissions to run this command.'))
      .addFields(
        { name: '🏷️ Command', value: `\`${cmd.name}\``, inline: true },
        { name: '📁 Category', value: `\`${cmd.category}\``, inline: true },
        { name: '⏱️ Cooldown', value: `\`${cmd.cooldownSeconds || 3}s\``, inline: true },
        { name: '📝 Syntax & Usage', value: `\`\`\`bash\n${cmd.usage}\n\`\`\``, inline: false },
        { name: '🔀 Aliases', value: cmd.aliases.length > 0 ? cmd.aliases.map(a => `\`${a}\``).join(', ') : '`None`', inline: true },
        { name: '🔒 User Required Permission', value: cmd.userPermissions && cmd.userPermissions.length > 0 ? cmd.userPermissions.map(p => `\`${p}\``).join(', ') : '`Everyone`', inline: true },
        { name: '🤖 Bot Required Permission', value: cmd.botPermissions && cmd.botPermissions.length > 0 ? cmd.botPermissions.map(p => `\`${p}\``).join(', ') : '`SendMessages`', inline: true }
      )
      .setColor(hasPermission ? '#7c5cfc' : '#f59e0b')
      .setFooter({ text: 'Rage Optimiser • Enterprise Documentation Engine' })
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
