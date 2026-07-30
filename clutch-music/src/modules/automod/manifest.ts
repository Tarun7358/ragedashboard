import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';

export const AutomodManifest: ModuleManifest = {
  id: 'automod',
  name: 'AI Automod',
  version: '1.0.0',
  description: 'Spam, phishing, bad words, and AI-powered chat filtering.',
  configSchema: {
    requiredFields: ['logChannelId'],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;

      const channelExists = (id: string) => registry.channels.some(c => c.id === id);

      if (config.logChannelId) {
        progress += 40;
        if (!channelExists(config.logChannelId)) errors.push(`Mod logs channel ID (${config.logChannelId}) was deleted!`);
      }
      
      if (config.badWords && config.badWords.length > 0) progress += 20;
      if (config.blockLinks) progress += 20;
      if (config.punishment) progress += 20;

      return { progress, errors };
    }
  },
  commands: [
    {
      name: 'automod',
      description: 'Check automod settings',
    }
  ],
  events: [
    {
      name: 'command_automod',
      handler: async (client: any, interaction: any, context: any) => {
        const modules = context.getModulesState();
        const amMod = modules.find((m: any) => m.id === 'automod');
        
        await interaction.reply({
          content: `🤖 **AutoMod Status**: \`${amMod?.status || 'unknown'}\`\nBlocking Links: \`${amMod?.config?.blockLinks ? 'Yes' : 'No'}\``,
          flags: 64
        });
      }
    },
    {
      name: 'messageCreate',
      handler: async (client: any, message: any, context: any) => {
        if (message.author?.bot) return;
        if ((message as any)._antiLinkHandled) return;
        
        const modules = context.getModulesState();
        const amMod = modules.find((m: any) => m.id === 'automod');
        if (!amMod || amMod.status !== 'enabled') return;

        const config = amMod.config || {};
        const content = message.content.toLowerCase();
        let deleted = false;
        let reason = '';

        // 1. Link Filter
        if (config.blockLinks && (content.includes('http://') || content.includes('https://'))) {
          // Check if user has bypass permissions
          if (!message.member.permissions.has('ManageMessages')) {
            deleted = true;
            reason = 'Posting unauthorized links';
          }
        }

        // 2. Bad Words Filter
        if (!deleted && config.badWords && config.badWords.length > 0) {
          for (const word of config.badWords) {
            if (content.includes(word.toLowerCase())) {
              deleted = true;
              reason = 'Using blacklisted words';
              break;
            }
          }
        }
        
        // 3. Caps Spam (Simple)
        if (!deleted && config.preventCapsSpam && message.content.length > 10) {
          const capsCount = message.content.replace(/[^A-Z]/g, '').length;
          if (capsCount / message.content.length > 0.7) {
            deleted = true;
            reason = 'Excessive capital letters';
          }
        }

        if (deleted) {
          try {
            await message.delete();
            (message as any)._antiLinkHandled = true;

            if (reason === 'Posting unauthorized links') {
              const dmEmbed = new EmbedBuilder()
                .setTitle(`🔗 Anti-Link Enforcement — ${message.guild.name}`)
                .setDescription(`Your message in **#${message.channel.name || 'channel'}** was removed because it contained an unauthorized link.\n\n**Server**: ${message.guild.name}\n**Action**: Message removed & link blocked.`)
                .setColor(0xF59E0B)
                .setFooter({ text: `${message.guild.name} • AutoMod Protection` })
                .setTimestamp();
              await message.member?.send({ embeds: [dmEmbed] }).catch(() => {});
            } else {
              await message.channel.send(`${message.author}, your message was removed. Reason: **${reason}**`)
                .then((m: any) => setTimeout(() => m.delete().catch(() => {}), 5000));
            }
            
            context.logSyncEvent(`AutoMod: Removed message from ${message.author.tag} in #${message.channel.name} (${reason})`, 'warn');
            
            // Log to discord channel
            if (config.logChannelId) {
              const logChannel = message.guild.channels.cache.get(config.logChannelId);
              if (logChannel && logChannel.isTextBased()) {
                const embed = new EmbedBuilder()
                  .setTitle('🛡️ AutoMod Intervention')
                  .setColor('#ff9900')
                  .addFields(
                    { name: 'User', value: `${message.author.tag} (${message.author.id})` },
                    { name: 'Channel', value: `<#${message.channel.id}>` },
                    { name: 'Reason', value: reason },
                    { name: 'Content', value: message.content.substring(0, 1000) }
                  )
                  .setTimestamp();
                await logChannel.send({ embeds: [embed] });
              }
            }

            // Handle punishment
            if (config.punishment === 'warn') {
               await message.member.send(`⚠️ **Warning from ${message.guild.name}**\nYour message was removed by AutoMod for: ${reason}`).catch(() => {});
            } else if (config.punishment === 'timeout') {
               await message.member.timeout(5 * 60 * 1000, 'AutoMod Timeout').catch(() => {});
            } else if (config.punishment === 'kick') {
               await message.member.kick('AutoMod Kick').catch(() => {});
            }

          } catch (e) {
            console.error('Automod delete error:', e);
          }
        }
      }
    }
  ]
};
