import {
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  Message,
  PermissionFlagsBits
} from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { Database } from '../../core/Database.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';
import {
  createLimeEmbed,
  Colors,
  VERIFIED_ICON,
  WRONG_ICON,
  SHIELD_ICON,
  CONFIG_ICON,
  MEMBER_ICON,
  BRAND_FOOTER
} from '../../core/UIFactory.js';

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

async function getVerifiedUsersCount(guildId: string): Promise<number> {
  try {
    const db = Database.getDb();
    if (!db) return 0;
    const row = await db.get('SELECT COUNT(*) as count FROM guild_verifications WHERE guildId = ?', [guildId]);
    return row?.count || 0;
  } catch {
    return 0;
  }
}

export function buildPublicVerificationCard(guild: any) {
  const embed = new EmbedBuilder()
    .setTitle('Rage Optimiser • Member Verification Gate')
    .setColor(Colors.BRAND)
    .setDescription(
      `> **Welcome to ${guild.name}**\n` +
      `To gain access to all server channels, protect our community against automated raid bots, and claim your member roles, please click the button below.\n\n` +
      `• **Instant Authorization**: Takes less than 1 second\n` +
      `• **Role Assignment**: Automatically grants member access\n` +
      `• **Enterprise Security**: Powered by Rage Optimiser Anti-Bot Guard`
    )
    .setThumbnail(guild.iconURL({ size: 256 }) || undefined)
    .setFooter({ text: BRAND_FOOTER })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('verify_btn_click')
      .setLabel('Verify Me')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('verify_btn_info')
      .setLabel('Why Verification?')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

export function buildVerificationAdminDashboardGUI(guild: any, config: any, verifiedCount: number = 0) {
  const isMasterEnabled = config.enabled !== false;
  const verifiedRole = config.verifiedRoleId ? `<@&${config.verifiedRoleId}>` : '`Not Configured (Click Setup Below)`';
  const unverifiedRole = config.unverifiedRoleId ? `<@&${config.unverifiedRoleId}>` : '`None Configured`';

  const embed = new EmbedBuilder()
    .setTitle('Rage Optimiser • User Verification Control Center')
    .setColor(isMasterEnabled ? Colors.BRAND : Colors.DANGER)
    .setDescription(
      `> **Automated Member Entry Gatekeeper**\n` +
      `Manages automatic captcha/one-click verification, anti-bot screening, quarantine on join, and instant role assignment for new server members.\n\n` +
      `**Verification Gate Status:** \`${isMasterEnabled ? 'ACTIVE & PROTECTED' : 'DISABLED'}\`\n` +
      `**Verified Access Role:** ${verifiedRole}\n` +
      `**Unverified Quarantine Role:** ${unverifiedRole}\n` +
      `**Verified Members in Database:** \`${verifiedCount} Members Registered\`\n` +
      `**Auto-Restore on Rejoin:** \`ENABLED\``
    )
    .setThumbnail(guild.iconURL({ size: 256 }) || undefined)
    .setFooter({ text: BRAND_FOOTER });

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('ver_btn_toggle_module')
      .setLabel(isMasterEnabled ? 'Gate: ACTIVE' : 'Gate: DISABLED')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ver_btn_setup_verified_role')
      .setLabel('Auto-Setup Verified Role')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ver_btn_setup_unverified_role')
      .setLabel('Auto-Setup Unverified Role')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('ver_btn_send_card')
      .setLabel('Send Verification Card')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ver_btn_reset_db')
      .setLabel('Reset Verification DB')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ver_btn_refresh')
      .setLabel('Refresh Dashboard')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

export async function handleVerificationGuiInteraction(interaction: any, context: any) {
  if (!interaction || !interaction.guild) return;
  const customId = interaction.customId || '';

  if (customId === 'verify_btn_info') {
    return interaction.reply({
      content: `${SHIELD_ICON} **Why Verification?**\n\nOur server uses automated verification to protect members against spambots, mass-dm raids, and phishing accounts. Clicking **Verify Me** instantly grants you access!`,
      flags: 64
    });
  }

  if (!customId.startsWith('ver_btn_')) return;

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: `${WRONG_ICON} Administrator permission required.`, flags: 64 });
  }

  const modules = context.getModulesState ? context.getModulesState() : [];
  const verModule = modules.find((m: any) => m.id === 'verification');
  const config = verModule?.config || {};
  const saveConfig = (updated: any) => context.updateModuleConfig('verification', { ...config, ...updated });

  // 1. Toggle Master Status
  if (customId === 'ver_btn_toggle_module') {
    await interaction.deferUpdate().catch(() => {});
    const currentState = config.enabled !== false;
    const newState = !currentState;
    saveConfig({ enabled: newState });
    context.logSyncEvent(`[Verification] Module toggled to ${newState ? 'ENABLED' : 'DISABLED'}.`, newState ? 'success' : 'warn');

    const count = await getVerifiedUsersCount(interaction.guildId);
    const payload = buildVerificationAdminDashboardGUI(interaction.guild, { ...config, enabled: newState }, count);
    return interaction.editReply(payload);
  }

  // 2. Auto-Setup Verified Role
  if (customId === 'ver_btn_setup_verified_role') {
    await interaction.deferUpdate().catch(() => {});
    let role = interaction.guild.roles.cache.find((r: any) => r.name.toLowerCase() === '. verified' || r.name.toLowerCase() === 'verified');
    if (!role) {
      role = await interaction.guild.roles.create({
        name: '. Verified',
        color: 0x99CC00,
        reason: 'Auto-provisioned by Verification Control Center'
      }).catch(() => null);
    }
    if (role) {
      saveConfig({ verifiedRoleId: role.id });
      context.logSyncEvent(`[Verification] Bound verified access role to "${role.name}" (${role.id}).`, 'success');
    }

    const count = await getVerifiedUsersCount(interaction.guildId);
    const payload = buildVerificationAdminDashboardGUI(interaction.guild, { ...config, verifiedRoleId: role?.id }, count);
    return interaction.editReply(payload);
  }

  // 3. Auto-Setup Unverified Role
  if (customId === 'ver_btn_setup_unverified_role') {
    await interaction.deferUpdate().catch(() => {});
    let role = interaction.guild.roles.cache.find((r: any) => r.name.toLowerCase() === '. unverified' || r.name.toLowerCase() === 'unverified');
    if (!role) {
      role = await interaction.guild.roles.create({
        name: '. Unverified',
        color: 0x808080,
        reason: 'Auto-provisioned by Verification Control Center'
      }).catch(() => null);
    }
    if (role) {
      saveConfig({ unverifiedRoleId: role.id });
      context.logSyncEvent(`[Verification] Bound unverified quarantine role to "${role.name}" (${role.id}).`, 'success');
    }

    const count = await getVerifiedUsersCount(interaction.guildId);
    const payload = buildVerificationAdminDashboardGUI(interaction.guild, { ...config, unverifiedRoleId: role?.id }, count);
    return interaction.editReply(payload);
  }

  // 4. Send Verification Card to Channel
  if (customId === 'ver_btn_send_card') {
    const payload = buildPublicVerificationCard(interaction.guild);
    await interaction.channel?.send(payload);
    return interaction.reply({ content: `<:ticks:1532620580266836148> Posted interactive Verification Card to ${interaction.channel}!`, flags: 64 });
  }

  // 5. Reset Verification DB
  if (customId === 'ver_btn_reset_db') {
    await interaction.deferUpdate().catch(() => {});
    const db = Database.getDb();
    if (db) {
      await db.run('DELETE FROM guild_verifications WHERE guildId = ?', [interaction.guildId]).catch(() => {});
      context.logSyncEvent(`[Verification] Purged verification database cache for guild.`, 'warn');
    }
    const payload = buildVerificationAdminDashboardGUI(interaction.guild, config, 0);
    return interaction.editReply(payload);
  }

  // 6. Refresh Dashboard
  if (customId === 'ver_btn_refresh') {
    await interaction.deferUpdate().catch(() => {});
    const count = await getVerifiedUsersCount(interaction.guildId);
    const payload = buildVerificationAdminDashboardGUI(interaction.guild, config, count);
    return interaction.editReply(payload);
  }
}

// Register Prefix Commands for Verification Module
PrefixRegistry.register({
  name: 'setup-verify',
  category: 'Verification',
  description: 'Post the interactive verification entry card button to the channel.',
  usage: 'r!setup-verify',
  aliases: ['verify-setup', 'setupverify'],
  cooldownSeconds: 3,
  userPermissions: ['ManageGuild'],
  botPermissions: ['ManageRoles'],
  execute: async (message: Message) => {
    try {
      if (!message.guild) return;
      const payload = buildPublicVerificationCard(message.guild);
      return message.reply(payload);
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
  name: 'verification',
  category: 'Verification',
  description: 'Launch the Verification Control Center GUI or verify membership.',
  usage: 'r!verification [setup|config]',
  aliases: ['verify', 'v', 'chkverify', 'verify-me'],
  cooldownSeconds: 2,
  execute: async (message: Message, args?: string[], extra?: any) => {
    const member = message.member;
    const guild = message.guild;
    if (!member || !guild) return;

    const sub = args?.[0]?.toLowerCase();
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageGuild);

    if (sub === 'setup' || sub === 'card' || sub === 'panel') {
      const payload = buildPublicVerificationCard(guild);
      return message.reply(payload);
    }

    if (isAdmin && (!sub || sub === 'config' || sub === 'gui' || sub === 'admin')) {
      const modules = extra?.getModulesState ? extra.getModulesState(guild.id) : [];
      const verModule = modules.find((m: any) => m.id === 'verification');
      const config = verModule?.config || {};
      const count = await getVerifiedUsersCount(guild.id);
      const payload = buildVerificationAdminDashboardGUI(guild, config, count);
      return message.reply(payload);
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
          return interaction.reply({ content: '<a:wrong:1546155193303957504> Verification module is not enabled.', flags: 64 });
        }

        try {
          const embed = new EmbedBuilder()
            .setTitle('<a:success_check:1546134620087783526> Member Verification Required')
            .setDescription('To gain access to the channels and features of this server, please click the verification button below.')
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();

          const btn = new ButtonBuilder()
            .setCustomId('verify_btn_click')
            .setLabel('Verify Me')
            .setStyle(ButtonStyle.Success)
            .setEmoji('<:ticks:1532620580266836148>');

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);

          await interaction.reply({ embeds: [embed], components: [row] });
          context.logSyncEvent('Verification Service: Posted verification card to entry channel.', 'info');
        } catch (err) {
          console.error(err);
          await interaction.reply({ content: '<a:wrong:1546155193303957504> Failed to post verification card.', flags: 64 });
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
          return interaction.reply({ content: '<a:wrong:1546155193303957504> Verification module is not enabled.', flags: 64 });
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
          return interaction.reply({ content: '<a:wrong:1546155193303957504> Verification role settings are not configured properly.', flags: 64 });
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
                  content: '<:ticks:1532620580266836148> **Verification Confirmed**\n\nYou have already completed verification.\nYour verification role was missing and has now been restored.', 
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
                content: '<:ticks:1532620580266836148> **You\'re Already Verified**\n\nYou have already completed the verification process and successfully claimed your verification role.\nNo further action is required.', 
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

          await interaction.reply({ content: '<:ticks:1532620580266836148> **Verification Succeeded!** Welcome to the server.', flags: 64 });
          context.logSyncEvent(`Verification Service: Verified member "${userTag(member.user)}" successfully.`, 'success');
        } catch (err) {
          console.error(err);
          await interaction.reply({ content: '<a:wrong:1546155193303957504> Failed to update your roles. Verify bot roles hierarchy.', flags: 64 });
        }
      }
    },
    {
      name: 'interactionCreate',
      handler: async (client: any, interaction: any, context: any) => {
        await handleVerificationGuiInteraction(interaction, context);
      }
    },
    {
      name: 'button_ver_generic',
      handler: async (client: any, interaction: any, context: any) => {
        await handleVerificationGuiInteraction(interaction, context);
      }
    }
  ]
};
