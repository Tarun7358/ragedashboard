import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder,
  TextInputBuilder, TextInputStyle, MessageFlags, TextChannel, Message
} from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { EmbedRepository } from './EmbedRepository.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';
import {
  Colors, buildLimeOverviewCard, VERIFIED_ICON, WRONG_ICON, BOT_ICON,
  MEMBER_ICON, INFO_ICON, TIMER_ICON, CONFIG_ICON, SHIELD_ICON, fmt
} from '../../core/UIFactory.js';

/**
 * Parse Hex or Named color to Discord integer color
 */
export function parseColor(colorInput?: string): number {
  if (!colorInput) return Colors.BRAND;
  const clean = colorInput.trim().toUpperCase();

  if (clean === 'BRAND' || clean === 'LIME') return Colors.BRAND;
  if (clean === 'GREEN' || clean === 'SUCCESS') return Colors.SUCCESS;
  if (clean === 'RED' || clean === 'DANGER') return Colors.DANGER;
  if (clean === 'YELLOW' || clean === 'WARN') return Colors.WARN;
  if (clean === 'GOLD') return Colors.GOLD;
  if (clean === 'BLUE' || clean === 'VOICE') return Colors.VOICE;
  if (clean === 'PURPLE' || clean === 'MUSIC') return Colors.MUSIC;
  if (clean === 'CYAN' || clean === 'INFO') return Colors.INFO;

  if (clean.startsWith('#')) {
    const hex = parseInt(clean.substring(1), 16);
    if (!isNaN(hex)) return hex;
  }
  const directHex = parseInt(clean, 16);
  if (!isNaN(directHex)) return directHex;

  return Colors.BRAND;
}

/**
 * Helper to build custom Discord EmbedBuilder from JSON object
 */
export function buildCustomEmbed(data: Record<string, any>): EmbedBuilder {
  const embed = new EmbedBuilder();

  if (data.title) embed.setTitle(String(data.title));
  if (data.description) embed.setDescription(String(data.description));
  if (data.color) embed.setColor(parseColor(String(data.color)));
  else embed.setColor(Colors.BRAND);

  if (data.url) embed.setURL(String(data.url));

  if (data.author) {
    if (typeof data.author === 'string') {
      embed.setAuthor({ name: data.author });
    } else if (typeof data.author === 'object' && data.author.name) {
      embed.setAuthor({
        name: data.author.name,
        iconURL: data.author.icon_url || data.author.iconURL,
        url: data.author.url
      });
    }
  }

  if (data.thumbnail) {
    const url = typeof data.thumbnail === 'string' ? data.thumbnail : data.thumbnail.url;
    if (url) embed.setThumbnail(url);
  }

  if (data.image) {
    const url = typeof data.image === 'string' ? data.image : data.image.url;
    if (url) embed.setImage(url);
  }

  if (data.footer) {
    if (typeof data.footer === 'string') {
      embed.setFooter({ text: data.footer });
    } else if (typeof data.footer === 'object' && data.footer.text) {
      embed.setFooter({
        text: data.footer.text,
        iconURL: data.footer.icon_url || data.footer.iconURL
      });
    }
  } else {
    embed.setFooter({ text: 'Rage Optimiser • Custom Embed Suite' });
  }

  if (data.timestamp) {
    embed.setTimestamp(new Date(data.timestamp));
  } else {
    embed.setTimestamp();
  }

  if (Array.isArray(data.fields) && data.fields.length > 0) {
    for (const f of data.fields.slice(0, 25)) {
      if (f.name && f.value) {
        embed.addFields({ name: String(f.name), value: String(f.value), inline: Boolean(f.inline) });
      }
    }
  }

  return embed;
}

/**
 * Register Prefix Command `r!embed`
 */
export function registerEmbedPrefixCommands(): void {
  PrefixRegistry.register({
    name: 'embed',
    category: 'Community',
    description: 'Design, save, load, export, and send high-level custom embeds with interactive elements.',
    usage: 'r!embed <send|create|list|json|save|delete> [args]',
    aliases: ['embedbuilder', 'customembed'],
    cooldownSeconds: 3,
    examples: [
      'r!embed send #announcements welcome_card',
      'r!embed create "Server Rules" "Be respectful to all members."',
      'r!embed list',
      'r!embed delete rules_card'
    ],
    moduleOwnerId: 'embed_builder',
    dangerLevel: 'Low',
    hidden: false,
    execute: async (message: Message, args: string[]) => {
      const sub = args[0]?.toLowerCase() || 'help';

      if (sub === 'help') {
        const embed = buildLimeOverviewCard({
          title: 'CUSTOM EMBED BUILDER SUITE',
          subtitle: 'HIGH-LEVEL EMBED SYSTEM & PRESET MANAGEMENT',
          color: Colors.BRAND,
          sections: [
            {
              title: '<:config:1532425712844144701> COMMAND SYNTAX & EXAMPLES',
              items: [
                '`r!embed create <title> <description> [color]` — Build quick custom embed',
                '`r!embed send <#channel> <preset_name>` — Post saved embed to a channel',
                '`r!embed list` — List all saved embed presets in this server',
                '`r!embed delete <preset_name>` — Remove a saved embed preset',
                '`/embed create` — Launch interactive Discord popup Modal builder'
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Custom Embed Suite'
        });
        return message.reply({ embeds: [embed] });
      }

      if (sub === 'send') {
        const channelMention = message.mentions.channels.first();
        const presetName = args[channelMention ? 2 : 1]?.toLowerCase();

        if (!presetName) {
          return message.reply({
            embeds: [buildLimeOverviewCard({
              title: 'Embed Send Syntax',
              subtitle: 'MISSING PRESET NAME',
              color: Colors.DANGER,
              sections: [{ title: 'Syntax', items: ['`r!embed send <#channel> <preset_name>`'] }]
            })]
          });
        }

        const targetChannel = (channelMention as TextChannel) || message.channel;
        const saved = await EmbedRepository.getEmbed(message.guild!.id, presetName);

        if (!saved) {
          return message.reply({ content: `${WRONG_ICON} No saved embed preset found named **"${presetName}"**.` });
        }

        try {
          const rawData = JSON.parse(saved.embedData);
          const embed = buildCustomEmbed(rawData);
          await targetChannel.send({ embeds: [embed] });
          return message.reply({ content: `${VERIFIED_ICON} Successfully posted **"${presetName}"** to ${targetChannel}.` });
        } catch (err: any) {
          return message.reply({ content: `${WRONG_ICON} Error constructing embed: ${err.message}` });
        }
      }

      if (sub === 'list') {
        const list = await EmbedRepository.listEmbeds(message.guild!.id);
        if (list.length === 0) {
          return message.reply({ content: `${INFO_ICON} No custom embed presets saved in this server yet.` });
        }

        const items = list.map(item => `• **${item.name}** — Created by <@${item.authorId}> (<t:${item.updatedAt}:R>)`);
        const embed = buildLimeOverviewCard({
          title: 'SAVED SERVER EMBED PRESETS',
          subtitle: `${list.length} TEMPLATES AVAILABLE`,
          color: Colors.BRAND,
          sections: [{ title: '<:config:1532425712844144701> PRESET TEMPLATES', items }],
          footerText: 'Rage Optimiser Enterprise • Embed Suite'
        });
        return message.reply({ embeds: [embed] });
      }

      if (sub === 'create') {
        const title = args[1] || 'Custom Embed Title';
        const description = args.slice(2).join(' ') || 'Custom Embed Description';

        const embedData = { title, description, color: '#99CC00' };
        const embed = buildCustomEmbed(embedData);

        return message.reply({
          content: `${VERIFIED_ICON} **Quick Embed Draft Created**:`,
          embeds: [embed]
        });
      }

      if (sub === 'delete') {
        const presetName = args[1]?.toLowerCase();
        if (!presetName) {
          return message.reply({ content: `${WRONG_ICON} Please specify the preset name to delete: \`r!embed delete <preset_name>\`` });
        }
        const ok = await EmbedRepository.deleteEmbed(message.guild!.id, presetName);
        if (ok) {
          return message.reply({ content: `${VERIFIED_ICON} Deleted saved embed preset **"${presetName}"**.` });
        } else {
          return message.reply({ content: `${WRONG_ICON} Preset **"${presetName}"** not found.` });
        }
      }
    }
  });
}

/**
 * Manifest Definition for Custom Embed Builder Suite
 */
export const EmbedBuilderManifest: ModuleManifest = {
  id: 'embed_builder',
  name: 'Custom Embed Builder Suite',
  version: '1.0.0',
  description: 'Design, customize, save, load, export, and post high-level rich embeds with interactive components.',
  configSchema: {
    requiredFields: [],
    validate: () => ({ progress: 100, errors: [] })
  },
  commands: [
    {
      name: 'embed',
      description: 'Custom embed builder suite for high-level rich messages and presets',
      options: [
        {
          name: 'create',
          description: 'Launch interactive modal or quick draft to create a custom embed',
          type: 1, // Subcommand
          options: [
            { name: 'title', description: 'Embed title text', type: 3, required: false },
            { name: 'description', description: 'Embed body description text', type: 3, required: false },
            { name: 'color', description: 'Color hex code (e.g. #99CC00) or name (LIME, RED, GOLD)', type: 3, required: false },
            { name: 'thumbnail', description: 'Thumbnail image URL', type: 3, required: false },
            { name: 'image', description: 'Large main banner image URL', type: 3, required: false },
            { name: 'footer', description: 'Footer text', type: 3, required: false }
          ]
        },
        {
          name: 'send',
          description: 'Post a saved embed preset or JSON payload directly to a target channel',
          type: 1,
          options: [
            { name: 'channel', description: 'Target text channel to send embed into', type: 7, required: true },
            { name: 'name', description: 'Name of the saved embed preset to send', type: 3, required: true }
          ]
        },
        {
          name: 'save',
          description: 'Save a custom embed template preset to database',
          type: 1,
          options: [
            { name: 'name', description: 'Unique identifier name for this preset', type: 3, required: true },
            { name: 'title', description: 'Embed title text', type: 3, required: true },
            { name: 'description', description: 'Embed main text description', type: 3, required: true },
            { name: 'color', description: 'Hex color or preset name', type: 3, required: false },
            { name: 'image', description: 'Banner image URL', type: 3, required: false }
          ]
        },
        {
          name: 'json',
          description: 'Import or export Discohook raw JSON embed payloads',
          type: 1,
          options: [
            { name: 'action', description: 'Action mode (import or export)', type: 3, required: true, choices: [
              { name: '📥 Import JSON Payload & Send', value: 'import' },
              { name: '📤 Export Saved Preset to Raw JSON', value: 'export' }
            ]},
            { name: 'json_data', description: 'Raw JSON payload string (for import)', type: 3, required: false },
            { name: 'name', description: 'Saved preset name (for export)', type: 3, required: false },
            { name: 'channel', description: 'Target channel (for import dispatch)', type: 7, required: false }
          ]
        },
        {
          name: 'field',
          description: 'Add a custom field to an embed draft',
          type: 1,
          options: [
            { name: 'title', description: 'Field title / name', type: 3, required: true },
            { name: 'value', description: 'Field text value content', type: 3, required: true },
            { name: 'inline', description: 'Whether field displays inline side-by-side', type: 5, required: false }
          ]
        },
        {
          name: 'list',
          description: 'List all saved custom embed presets in this server',
          type: 1
        },
        {
          name: 'delete',
          description: 'Delete a saved custom embed preset',
          type: 1,
          options: [
            { name: 'name', description: 'Name of the saved preset to delete', type: 3, required: true }
          ]
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_embed',
      handler: async (client: any, interaction: any) => {
        const sub = interaction.options.getSubcommand(false);

        // ─── CREATE MODAL OR DRAFT ──────────────────────────────
        if (sub === 'create') {
          const title = interaction.options.getString('title');
          const description = interaction.options.getString('description');
          const color = interaction.options.getString('color');
          const thumbnail = interaction.options.getString('thumbnail');
          const image = interaction.options.getString('image');
          const footer = interaction.options.getString('footer');

          // If no parameters passed, open Discord Interactive Modal Builder
          if (!title && !description) {
            const modal = new ModalBuilder()
              .setCustomId('embed_builder_modal_submit')
              .setTitle('Build Custom Rich Embed');

            const titleInput = new TextInputBuilder()
              .setCustomId('embed_title')
              .setLabel('Embed Title')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Enter embed header title...')
              .setRequired(true);

            const descInput = new TextInputBuilder()
              .setCustomId('embed_description')
              .setLabel('Embed Description / Content')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('Enter main body description text...')
              .setRequired(true);

            const colorInput = new TextInputBuilder()
              .setCustomId('embed_color')
              .setLabel('Color Hex Code or Name (Optional)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('#99CC00, BRAND, RED, BLUE, GOLD')
              .setRequired(false);

            const imageInput = new TextInputBuilder()
              .setCustomId('embed_image')
              .setLabel('Banner Image URL (Optional)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('https://example.com/banner.png')
              .setRequired(false);

            modal.addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
              new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
              new ActionRowBuilder<TextInputBuilder>().addComponents(colorInput),
              new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput)
            );

            return interaction.showModal(modal);
          }

          // Otherwise render quick draft from parameters
          const embedData = { title, description, color, thumbnail, image, footer };
          const embed = buildCustomEmbed(embedData);

          return interaction.reply({
            content: `${VERIFIED_ICON} **Custom Embed Draft Rendered**:`,
            embeds: [embed]
          });
        }

        // ─── SEND PRESET ─────────────────────────────────────────
        if (sub === 'send') {
          const channel = interaction.options.getChannel('channel');
          const name = interaction.options.getString('name');

          const saved = await EmbedRepository.getEmbed(interaction.guild.id, name);
          if (!saved) {
            return interaction.reply({
              content: `${WRONG_ICON} Saved embed preset **"${name}"** was not found in this server.`,
              flags: MessageFlags.Ephemeral
            });
          }

          try {
            const rawData = JSON.parse(saved.embedData);
            const embed = buildCustomEmbed(rawData);
            await channel.send({ embeds: [embed] });

            return interaction.reply({
              content: `${VERIFIED_ICON} Successfully posted saved embed preset **"${name}"** to ${channel}.`,
              flags: MessageFlags.Ephemeral
            });
          } catch (err: any) {
            return interaction.reply({
              content: `${WRONG_ICON} Failed to send embed: ${err.message}`,
              flags: MessageFlags.Ephemeral
            });
          }
        }

        // ─── SAVE PRESET ─────────────────────────────────────────
        if (sub === 'save') {
          const name = interaction.options.getString('name');
          const title = interaction.options.getString('title');
          const description = interaction.options.getString('description');
          const color = interaction.options.getString('color');
          const image = interaction.options.getString('image');

          const embedData = { title, description, color, image };
          await EmbedRepository.saveEmbed(interaction.guild.id, name, embedData, interaction.user.id);

          const embed = buildCustomEmbed(embedData);
          return interaction.reply({
            content: `${VERIFIED_ICON} Saved custom embed preset **"${name.toLowerCase()}"** to database! Preview:`,
            embeds: [embed]
          });
        }

        // ─── JSON IMPORT / EXPORT ────────────────────────────────
        if (sub === 'json') {
          const action = interaction.options.getString('action');
          const jsonStr = interaction.options.getString('json_data');
          const name = interaction.options.getString('name');
          const channel = interaction.options.getChannel('channel') || interaction.channel;

          if (action === 'import') {
            if (!jsonStr) {
              return interaction.reply({
                content: `${WRONG_ICON} Please provide the raw JSON string in the \`json_data\` parameter.`,
                flags: MessageFlags.Ephemeral
              });
            }

            try {
              const parsed = JSON.parse(jsonStr);
              const rawData = parsed.embeds ? parsed.embeds[0] : parsed;
              const embed = buildCustomEmbed(rawData);

              await channel.send({ embeds: [embed] });
              return interaction.reply({
                content: `${VERIFIED_ICON} Successfully imported and dispatched custom Discohook JSON embed to ${channel}!`,
                flags: MessageFlags.Ephemeral
              });
            } catch (err: any) {
              return interaction.reply({
                content: `${WRONG_ICON} Invalid JSON format: ${err.message}`,
                flags: MessageFlags.Ephemeral
              });
            }
          }

          if (action === 'export') {
            if (!name) {
              return interaction.reply({
                content: `${WRONG_ICON} Please specify the saved preset \`name\` to export.`,
                flags: MessageFlags.Ephemeral
              });
            }

            const saved = await EmbedRepository.getEmbed(interaction.guild.id, name);
            if (!saved) {
              return interaction.reply({
                content: `${WRONG_ICON} Preset **"${name}"** not found.`,
                flags: MessageFlags.Ephemeral
              });
            }

            const formattedJson = JSON.stringify({ embeds: [JSON.parse(saved.embedData)] }, null, 2);
            return interaction.reply({
              content: `${VERIFIED_ICON} **Raw Discohook JSON Payload for "${name}"**:\n\`\`\`json\n${formattedJson.substring(0, 1900)}\n\`\`\``,
              flags: MessageFlags.Ephemeral
            });
          }
        }

        // ─── FIELD ADD ───────────────────────────────────────────
        if (sub === 'field') {
          const title = interaction.options.getString('title');
          const value = interaction.options.getString('value');
          const inline = interaction.options.getBoolean('inline') ?? false;

          const embed = buildLimeOverviewCard({
            title: 'EMBED FIELD PREVIEW',
            subtitle: 'INSPECT FIELD FORMATTING',
            color: Colors.BRAND,
            sections: [
              {
                title: `${title} ${inline ? '(Inline)' : ''}`,
                items: [value]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Field Inspector'
          });

          return interaction.reply({
            content: `${VERIFIED_ICON} Rendered preview for field **"${title}"**:`,
            embeds: [embed]
          });
        }

        // ─── LIST PRESETS ────────────────────────────────────────
        if (sub === 'list') {
          const list = await EmbedRepository.listEmbeds(interaction.guild.id);
          if (list.length === 0) {
            return interaction.reply({
              content: `${INFO_ICON} No custom embed presets saved in this server yet.`,
              flags: MessageFlags.Ephemeral
            });
          }

          const items = list.map(item => `• **${item.name}** — Author: <@${item.authorId}> (<t:${item.updatedAt}:R>)`);
          const embed = buildLimeOverviewCard({
            title: 'SAVED SERVER EMBED PRESETS',
            subtitle: `${list.length} TEMPLATES REGISTERED`,
            color: Colors.BRAND,
            sections: [{ title: '<:config:1532425712844144701> PRESET TEMPLATES', items }],
            footerText: 'Rage Optimiser Enterprise • Custom Embed Suite'
          });
          return interaction.reply({ embeds: [embed] });
        }

        // ─── DELETE PRESET ───────────────────────────────────────
        if (sub === 'delete') {
          const name = interaction.options.getString('name');
          const ok = await EmbedRepository.deleteEmbed(interaction.guild.id, name);
          if (ok) {
            return interaction.reply({ content: `${VERIFIED_ICON} Successfully deleted custom embed preset **"${name}"**.` });
          } else {
            return interaction.reply({ content: `${WRONG_ICON} Preset **"${name}"** not found.` });
          }
        }
      }
    },
    {
      name: 'interaction_embed_builder_modal',
      handler: async (client: any, interaction: any) => {
        if (interaction.customId !== 'embed_builder_modal_submit') return;

        const title = interaction.fields.getTextInputValue('embed_title');
        const description = interaction.fields.getTextInputValue('embed_description');
        const color = interaction.fields.getTextInputValue('embed_color');
        const image = interaction.fields.getTextInputValue('embed_image');

        const embedData = { title, description, color, image };
        const embed = buildCustomEmbed(embedData);

        return interaction.reply({
          content: `${VERIFIED_ICON} **Interactive Custom Embed Created Successfully!**`,
          embeds: [embed]
        });
      }
    }
  ]
};
