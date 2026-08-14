import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, Message } from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { Database } from '../../core/Database.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';
import { createLimeEmbed, VERIFIED_ICON, WRONG_ICON, SHIELD_ICON } from '../../core/UIFactory.js';

// Safe display name helper
function userTag(user: any): string {
  return user?.globalName ?? user?.username ?? user?.tag ?? user?.id ?? 'Unknown';
}

async function isUserVerified(guildId: string, userId: string): Promise<boolean> {
  try {
    const db = Database.getDb();
    if (!db) return false;
    const row = await db.get('SELECT 1 FROM guild_verifications WHERE guildId = ? AND userId = ?', [guildId, userId]);
    return !!row;
  } catch (err) {
    console.error('Failed to check user verification:', err);
    return false;
  }
}

async function markUserVerified(guildId: string, userId: string): Promise<void> {
  try {
    const db = Database.getDb();
    if (!db) return;
    await db.run(
      'INSERT OR REPLACE INTO guild_verifications (guildId, userId, verifiedAt) VALUES (?, ?, ?)',
      [guildId, userId, new Date().toISOString()]
    );
  } catch (err) {
    console.error('Failed to mark user as verified:', err);
  }
}

// Register Prefix Commands for Verification Module
PrefixRegistry.register({
  name: 'setup-verify',
  category: 'Verification',
  description: 'Post the interactive verification entry card button to the channel.',
  usage: 'r!setup-verify',
  aliases: ['verify-setup', 'setupverify'],
  cooldownSeconds: 5,
  userPermissions: ['ManageGuild'],
  botPermissions: ['ManageRoles'],
  execute: async (message: Message) => {
    try {
      const embed = new EmbedBuilder()
        .setTitle(`${SHIELD_ICON} Member Verification Required`)
        .setDescription('To gain access to the channels and features of this server, please click the verification button below.')
        .setColor(0x99CC00)
        .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
        .setTimestamp();

      const btn = new ButtonBuilder()
        .setCustomId('verify_btn_click')
        .setLabel('Verify Me')
        .setStyle(ButtonStyle.Success)
        .setEmoji(VERIFIED_ICON);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
      return message.reply({ embeds: [embed], components: [row] });
    } catch (err: any) {
      return message.reply({
        embeds: [createLimeEmbed({
          title: 'Verification Setup Failed',
          description: `${WRONG_ICON} Error: ${err.message}`
        })]
      });
    }
  }
});

PrefixRegistry.register({
  name: 'verify',
  category: 'Verification',
  description: 'Verify your membership in the server to claim access roles.',
  usage: 'r!verify [setup]',
  aliases: ['verification', 'v', 'chkverify', 'verify-me'],
  cooldownSeconds: 3,
  execute: async (message: Message, args?: string[], extra?: any) => {
    const member = message.member;
    const guild = message.guild;
    if (!member || !guild) return;

    const sub = args?.[0]?.toLowerCase();
    if (sub === 'setup' || sub === 'card' || sub === 'panel') {
      const setupCmd = PrefixRegistry.get('setup-verify');
      if (setupCmd && setupCmd.execute) {
        return setupCmd.execute(message, (args || []).slice(1), extra);
      }
    }

    try {
      const modules = extra?.getModulesState ? extra.getModulesState() : [];
      const verModule = modules.find((m: any) => m.id === 'verification');
      const config = verModule?.config || {};
      const verifiedRoleId = config.verifiedRoleId;
      const unverifiedRoleId = config.unverifiedRoleId;

      const isVerifiedInDb = await isUserVerified(guild.id, member.user.id);
      const hasVerifiedRole = verifiedRoleId ? member.roles.cache.has(verifiedRoleId) : false;

      if (isVerifiedInDb && (hasVerifiedRole || !verifiedRoleId)) {
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Already Verified',
            description: `${VERIFIED_ICON} You have already completed the verification process.`
          })]
        });
      }

      // Apply roles if configured
      if (verifiedRoleId) {
        const verifiedRole = guild.roles.cache.get(verifiedRoleId);
        if (verifiedRole) await member.roles.add(verifiedRole).catch(() => {});
      }
      if (unverifiedRoleId) {
        const unverifiedRole = guild.roles.cache.get(unverifiedRoleId);
        if (unverifiedRole && member.roles.cache.has(unverifiedRoleId)) {
          await member.roles.remove(unverifiedRole).catch(() => {});
        }
      }

      await markUserVerified(guild.id, member.user.id);
      if (extra?.logSyncEvent) {
        extra.logSyncEvent(`Verification Service: Verified member "${userTag(member.user)}" via command.`, 'success');
      }

      return message.reply({
        embeds: [createLimeEmbed({
          title: 'Verification Succeeded',
          description: `${VERIFIED_ICON} **Verification Complete!** Welcome to **${guild.name}**.`
        })]
      });
    } catch (err: any) {
      return message.reply({
        embeds: [createLimeEmbed({
          title: 'Verification Failed',
          description: `${WRONG_ICON} Unable to complete verification: ${err.message}`
        })]
      });
    }
  }
});

async function handleVerifyCommandInteraction(client: any, interaction: any, context: any) {
  const member = interaction.member;
  const guild = interaction.guild;
  if (!member || !guild) return;

  try {
    const modules = context.getModulesState ? context.getModulesState() : [];
    const verModule = modules.find((m: any) => m.id === 'verification');
    const config = verModule?.config || {};
    const verifiedRoleId = config.verifiedRoleId;
    const unverifiedRoleId = config.unverifiedRoleId;

    const isVerifiedInDb = await isUserVerified(guild.id, member.user.id);
    const hasVerifiedRole = verifiedRoleId ? member.roles.cache.has(verifiedRoleId) : false;

    if (isVerifiedInDb && (hasVerifiedRole || !verifiedRoleId)) {
      return interaction.reply({
        embeds: [createLimeEmbed({
          title: 'Already Verified',
          description: `${VERIFIED_ICON} You have already completed the verification process.`
        })],
        flags: 64
      });
    }

    if (verifiedRoleId) {
      const verifiedRole = guild.roles.cache.get(verifiedRoleId);
      if (verifiedRole) await member.roles.add(verifiedRole).catch(() => {});
    }
    if (unverifiedRoleId && member.roles.cache.has(unverifiedRoleId)) {
      const unverifiedRole = guild.roles.cache.get(unverifiedRoleId);
      if (unverifiedRole) await member.roles.remove(unverifiedRole).catch(() => {});
    }

    await markUserVerified(guild.id, member.user.id);
    context.logSyncEvent(`Verification Service: Verified member "${userTag(member.user)}" via interaction.`, 'success');

    return interaction.reply({
      embeds: [createLimeEmbed({
        title: 'Verification Succeeded',
        description: `${VERIFIED_ICON} **Verification Complete!** Welcome to **${guild.name}**.`
      })],
      flags: 64
    });
  } catch (err: any) {
    return interaction.reply({
      embeds: [createLimeEmbed({
        title: 'Verification Failed',
        description: `${WRONG_ICON} Unable to complete verification: ${err.message}`
      })],
      flags: 64
    });
  }
}

export const VerificationManifest: ModuleManifest = {
  id: 'verification',
  name: 'User Verification',
  version: '1.0.0',
  description: 'CAPTCHA entry gate, anti-bot screening, and automatic role assignment.',
  configSchema: {
    requiredFields: ['verifiedRoleId', 'unverifiedRoleId'],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;

      const roleExists = (id: string) => registry.roles.some(r => r.id === id);

      if (config.unverifiedRoleId) {
        progress += 50;
        if (!roleExists(config.unverifiedRoleId)) errors.push(`Unverified role ID (${config.unverifiedRoleId}) was deleted!`);
      }
      if (config.verifiedRoleId) {
        progress += 50;
        if (!roleExists(config.verifiedRoleId)) errors.push(`Verified role ID (${config.verifiedRoleId}) was deleted!`);
      }

      return { progress, errors };
    }
  },
  commands: [
    {
      name: 'setup-verify',
      description: 'Post the verification entry card button to the channel.'
    },
    {
      name: 'verify',
      description: 'Verify your membership in the server to claim access roles.'
    },
    {
      name: 'verification',
      description: 'Verify your membership in the server or manage verification settings.'
    }
  ],
  events: [
    {
      name: 'guildMemberAdd',
      handler: async (client: any, member: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const verModule = modules.find((m: any) => m.id === 'verification');
        if (!verModule || verModule.status !== 'enabled') return;

        const config = verModule.config;
        const unverifiedRoleId = config.unverifiedRoleId;
        if (!unverifiedRoleId) return;

        const unverifiedRole = member.guild.roles.cache.get(unverifiedRoleId);
        if (unverifiedRole) {
          try {
            await member.roles.add(unverifiedRole);
            context.logSyncEvent(`Verification Service: Quarantined new join "${userTag(member.user)}" (Applied Unverified Role).`, 'info');
          } catch (err) {
            console.error('Failed to apply unverified role on join:', err);
          }
        }
      }
    },
    {
      name: 'command_setup-verify',
      handler: async (client: any, interaction: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const verModule = modules.find((m: any) => m.id === 'verification');
        if (!verModule || verModule.status !== 'enabled') {
          return interaction.reply({ content: '<:wrong:1532390628330307634> Verification module is not enabled.', flags: 64 });
        }

        try {
          const embed = new EmbedBuilder()
            .setTitle('<:shield:1532403012751065179> Member Verification Required')
            .setDescription('To gain access to the channels and features of this server, please click the verification button below.')
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();

          const btn = new ButtonBuilder()
            .setCustomId('verify_btn_click')
            .setLabel('Verify Me')
            .setStyle(ButtonStyle.Success)
            .setEmoji('<a:approved:1532390590707142956>');

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);

          await interaction.reply({ embeds: [embed], components: [row] });
          context.logSyncEvent('Verification Service: Posted verification card to entry channel.', 'info');
        } catch (err) {
          console.error(err);
          await interaction.reply({ content: '<:wrong:1532390628330307634> Failed to post verification card.', flags: 64 });
        }
      }
    },
    {
      name: 'command_verify',
      handler: handleVerifyCommandInteraction
    },
    {
      name: 'command_verification',
      handler: handleVerifyCommandInteraction
    },
    {
      name: 'button_verify_btn_click',
      handler: async (client: any, interaction: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const verModule = modules.find((m: any) => m.id === 'verification');
        if (!verModule || verModule.status !== 'enabled') {
          return interaction.reply({ content: '<:wrong:1532390628330307634> Verification module is not enabled.', flags: 64 });
        }

        const config = verModule.config;
        const unverifiedRoleId = config.unverifiedRoleId;
        const verifiedRoleId = config.verifiedRoleId;

        // Toggles
        const preventDuplicates = config.preventDuplicates ?? true;
        const autoRestoreRole = config.autoRestoreRole ?? true;
        const logDuplicates = config.logDuplicates ?? true;
        const showAlreadyVerifiedMessage = config.showAlreadyVerifiedMessage ?? true;

        if (!unverifiedRoleId || !verifiedRoleId) {
          return interaction.reply({ content: '<:wrong:1532390628330307634> Verification role settings are not configured properly.', flags: 64 });
        }

        try {
          const member = interaction.member;
          if (!member) return;

          const guildId = interaction.guildId;
          const isVerifiedInDb = await isUserVerified(guildId, member.user.id);
          const hasVerifiedRole = member.roles.cache.has(verifiedRoleId);

          if (preventDuplicates && isVerifiedInDb) {
            // User is in DB but missing the role?
            if (!hasVerifiedRole && autoRestoreRole) {
              await member.roles.add(verifiedRoleId);
              if (member.roles.cache.has(unverifiedRoleId)) await member.roles.remove(unverifiedRoleId);
              
              context.logSyncEvent(`Verification Service: Restored missing verified role for returning user "${userTag(member.user)}".`, 'info');
              
              if (showAlreadyVerifiedMessage) {
                return interaction.reply({ 
                  content: '<a:approved:1532390590707142956> **Verification Confirmed**\n\nYou have already completed verification.\nYour verification role was missing and has now been restored.', 
                  flags: 64 
                });
              } else {
                return interaction.deferUpdate();
              }
            }

            // User is in DB and already has the role
            if (logDuplicates) {
              context.logSyncEvent(`Verification Service: Duplicate verification attempt by already verified user "${userTag(member.user)}".`, 'warn');
            }

            if (showAlreadyVerifiedMessage) {
              return interaction.reply({ 
                content: '<a:approved:1532390590707142956> **You\'re Already Verified**\n\nYou have already completed the verification process and successfully claimed your verification role.\nNo further action is required.', 
                flags: 64 
              });
            } else {
              return interaction.deferUpdate();
            }
          }

          // Proceed with new verification
          if (member.roles.cache.has(unverifiedRoleId)) {
            await member.roles.remove(unverifiedRoleId);
          }
          await member.roles.add(verifiedRoleId);

          await markUserVerified(guildId, member.user.id);

          await interaction.reply({ content: '<a:approved:1532390590707142956> **Verification Succeeded!** Welcome to the server.', flags: 64 });
          context.logSyncEvent(`Verification Service: Verified member "${userTag(member.user)}" successfully.`, 'success');
        } catch (err) {
          console.error(err);
          await interaction.reply({ content: '<:wrong:1532390628330307634> Failed to update your roles. Verify bot roles hierarchy.', flags: 64 });
        }
      }
    }
  ]
};
