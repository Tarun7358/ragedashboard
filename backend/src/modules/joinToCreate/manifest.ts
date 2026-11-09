import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import {
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ThumbnailBuilder,
  MessageFlags
} from 'discord.js';
import { IJoinToCreate } from '../../models/index.js';
import {
  buildLimeOverviewCard,
  createLimeEmbed,
  Colors,
  VERIFIED_ICON,
  WRONG_ICON,
  SHIELD_ICON,
  CONFIG_ICON,
  VOICE_ICON,
  VIP_ICON,
  BRAND_FOOTER
} from '../../core/UIFactory.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';

const creatingUsers = new Set<string>();

export function buildJTCAdminDashboardGUI(guild: any, config: IJoinToCreate, noticeText?: string) {
  const isMasterEnabled = config.enabled !== false;
  const triggers = config.triggers || [];
  const activeChannels = config.activeChannels || [];
  const categoryStr = config.categoryId ? `<#${config.categoryId}>` : '`Auto-Detect (Inherit from Trigger)`';
  const guildIcon = guild?.iconURL({ size: 512 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

  const triggerList = triggers.length > 0
    ? triggers.map((t: any, i: number) => `> **${i + 1}.** <#${t.triggerChannelId}> | \`${t.label || 'Default'}\` | \`Privacy: ${(t.privacy || 'public').toUpperCase()}\``).join('\n')
    : '> ⚠️ *No Trigger Channels Configured (Click 1-Click Setup below)*';

  const cleanNotice = noticeText ? `${noticeText.trim()}\n\n` : '';

  const embed = new EmbedBuilder()
    .setTitle('Rage Optimiser • Join-To-Create Voice Control Center')
    .setColor(isMasterEnabled ? Colors.BRAND : Colors.DANGER)
    .setDescription(
      cleanNotice +
      `# **Dynamic Automated Voice Channel Manager**\n` +
      `Automatically provisions customized temporary voice channels with full room owner permissions when members connect to a trigger channel.\n\n` +
      `## **System Telemetry**\n` +
      `> **Master Engine Status:** \`${isMasterEnabled ? 'ACTIVE & RUNNING' : 'DISABLED'}\`\n` +
      `> **Spawn Category:** ${categoryStr}\n` +
      `> **Live Active Rooms:** \`${activeChannels.length} Active Channels\`\n` +
      `> **Room Owner Permissions:** \`Rename, Lock, Hide, Limit, Kick, Claim\`\n\n` +
      `## **Configured Trigger Channels (${triggers.length})**\n${triggerList}`
    )
    .setThumbnail(guildIcon)
    .setFooter({ text: BRAND_FOOTER });

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('jtc_btn_auto_setup')
      .setLabel('1-Click Auto Setup')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('jtc_btn_toggle_master')
      .setLabel(isMasterEnabled ? 'JTC Master: ON' : 'JTC Master: OFF')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('jtc_btn_clean_stale')
      .setLabel('Clean Stale Channels')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('jtc_btn_set_category')
      .setLabel('Set Category')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('jtc_btn_send_voice_panel')
      .setLabel('Send Voice Controller')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('jtc_btn_refresh_admin')
      .setLabel('Refresh Dashboard')
      .setStyle(ButtonStyle.Secondary)
  );

  // Native Discord Components V2 Container (Box UI)
  const sec = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# **Rage Optimiser • Join-To-Create Voice Hub**')
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(guildIcon)
    );

  const sep = new SeparatorBuilder().setDivider(true);

  const body = new TextDisplayBuilder().setContent(
    `# **Dynamic Automated Voice Channel Manager**\n` +
    `> **Automatically provisions customized temporary voice channels with full room owner permissions when members connect to a trigger channel.**\n\n` +
    `## **System Telemetry & Controls**\n` +
    `> **Master Engine Status:** \`${isMasterEnabled ? 'ACTIVE & RUNNING' : 'DISABLED'}\`\n` +
    `> **Spawn Category:** ${categoryStr}\n` +
    `> **Live Active Rooms:** \`${activeChannels.length} Active Rooms\`\n` +
    `> **Room Owner Privileges:** \`Rename, Lock, Hide, Limit, Kick, Claim\`\n\n` +
    `## **Configured Trigger Channels (${triggers.length})**\n${triggerList}\n\n` +
    `### **Admin Quick Actions**\n` +
    `> **Click 1-Click Auto Setup to create the voice category & trigger voice channel automatically.**\n` +
    `> **Use JTC Master to toggle voice provisioning server-wide.**\n` +
    `> **Use Clean Stale Channels to sweep and purge all empty rooms immediately.**`
  );

  const footer = new TextDisplayBuilder().setContent(`-# ${BRAND_FOOTER}`);

  const container = new ContainerBuilder();
  if (noticeText && noticeText.trim()) {
    container
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(noticeText.trim()))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  }
  container
    .addSectionComponents(sec)
    .addSeparatorComponents(sep)
    .addTextDisplayComponents(body)
    .addActionRowComponents(row1, row2)
    .addTextDisplayComponents(footer);

  return {
    container,
    embed,
    components: [row1, row2],
    getSendPayload: () => ({
      flags: MessageFlags.IsComponentsV2,
      components: [container]
    }),
    getFallbackPayload: () => ({
      embeds: [embed],
      components: [row1, row2]
    })
  };
}

export function buildJTCVoiceControllerGUI(channel: any, activeChannelData?: any) {
  const isLocked = channel.permissionOverwrites?.cache?.get(channel.guild?.id)?.deny?.has(PermissionFlagsBits.Connect) || false;
  const isHidden = channel.permissionOverwrites?.cache?.get(channel.guild?.id)?.deny?.has(PermissionFlagsBits.ViewChannel) || false;
  const userLimit = channel.userLimit || 0;
  const limitStr = userLimit === 0 ? 'Unlimited' : `${userLimit} Members`;
  const bitrateStr = `${Math.round(channel.bitrate / 1000)} kbps`;
  const ownerId = activeChannelData?.ownerId;
  const ownerStr = ownerId ? `<@${ownerId}>` : '`Open for Claim`';
  const guildIcon = channel.guild?.iconURL({ size: 512 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

  const embed = new EmbedBuilder()
    .setTitle(`Rage Optimiser • Voice Room Control Panel`)
    .setColor(Colors.BRAND)
    .setDescription(
      `# **Managing Room:** **${channel.name}**\n` +
      `**Welcome to your private voice room. Use the control buttons below to manage room access and audio settings.**\n\n` +
      `## **Room Details**\n` +
      `> **Room Owner:** ${ownerStr}\n` +
      `> **Access Lock:** \`${isLocked ? 'LOCKED' : 'UNLOCKED'}\`\n` +
      `> **Visibility:** \`${isHidden ? 'HIDDEN' : 'VISIBLE'}\`\n` +
      `> **User Limit:** \`${limitStr}\`\n` +
      `> **Audio Bitrate:** \`${bitrateStr}\``
    )
    .setFooter({ text: 'Rage Optimiser • Voice Room Controller' });

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`jtc_btn_lock_${channel.id}`)
      .setLabel(isLocked ? 'Unlock Room' : 'Lock Room')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`jtc_btn_hide_${channel.id}`)
      .setLabel(isHidden ? 'Unhide Room' : 'Hide Room')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`jtc_btn_limit_${channel.id}`)
      .setLabel(`Limit: ${userLimit === 0 ? '∞' : userLimit}`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`jtc_btn_rename_${channel.id}`)
      .setLabel('Rename Room')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`jtc_btn_claim_${channel.id}`)
      .setLabel('Claim Room')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`jtc_btn_mute_all_${channel.id}`)
      .setLabel('Mute Room')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`jtc_btn_bitrate_${channel.id}`)
      .setLabel(`${bitrateStr}`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`jtc_btn_delete_${channel.id}`)
      .setLabel('Delete Room')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`jtc_btn_refresh_vc_${channel.id}`)
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Secondary)
  );

  // Native Discord Components V2 Container (Box UI)
  const sec = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# **Voice Room Controller : ${channel.name}**`)
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(guildIcon)
    );

  const sep = new SeparatorBuilder().setDivider(true);

  const body = new TextDisplayBuilder().setContent(
    `# **Private Voice Room Settings**\n` +
    `> Use the interactive buttons inside this control card to manage your room security, capacity, and permissions.\n\n` +
    `## **Live Telemetry**\n` +
    `> **Current Room:** \`${channel.name}\`\n` +
    `> **Designated Owner:** ${ownerStr}\n` +
    `> **Room Security:** \`${isLocked ? 'LOCKED (Connect Denied)' : 'OPEN (Public Access)'}\`\n` +
    `> **Visibility:** \`${isHidden ? 'HIDDEN (ViewChannel Denied)' : 'VISIBLE'}\`\n` +
    `> **Capacity Limit:** \`${limitStr}\`\n` +
    `> **Voice Bitrate:** \`${bitrateStr}\``
  );

  const footer = new TextDisplayBuilder().setContent('-# Rage Optimiser • Voice Room Controller');

  const container = new ContainerBuilder()
    .addSectionComponents(sec)
    .addSeparatorComponents(sep)
    .addTextDisplayComponents(body)
    .addActionRowComponents(row1, row2)
    .addTextDisplayComponents(footer);

  return {
    container,
    embed,
    components: [row1, row2],
    getSendPayload: () => ({
      flags: MessageFlags.IsComponentsV2,
      components: [container]
    }),
    getFallbackPayload: () => ({
      embeds: [embed],
      components: [row1, row2]
    })
  };
}

export async function respondJtcGui(target: any, gui: any) {
  // If target is a prefix Message
  if (typeof target.reply === 'function' && !target.isButton && !target.isChatInputCommand && !target.isStringSelectMenu && !target.isModalSubmit) {
    try {
      return await target.reply(gui.getSendPayload());
    } catch {
      return await target.reply(gui.getFallbackPayload());
    }
  }

  // If target is an Interaction
  if (target.replied || target.deferred) {
    try {
      return await target.editReply(gui.getSendPayload());
    } catch {
      return await target.editReply(gui.getFallbackPayload());
    }
  }

  if (typeof target.update === 'function') {
    try {
      return await target.update(gui.getSendPayload());
    } catch {
      try {
        return await target.update(gui.getFallbackPayload());
      } catch {
        return await target.editReply(gui.getSendPayload()).catch(() => target.editReply(gui.getFallbackPayload()));
      }
    }
  }

  if (typeof target.reply === 'function') {
    try {
      return await target.reply(gui.getSendPayload());
    } catch {
      return await target.reply(gui.getFallbackPayload());
    }
  }
}

export async function handleJtcInteraction(interaction: any, context: any) {
  if (!interaction || !interaction.guild) return;
  const customId = interaction.customId || '';

  if (!customId.startsWith('jtc_')) return;

  const modules = context.getModulesState ? context.getModulesState() : [];
  const jtcMod = modules.find((m: any) => m.id === 'join_to_create');
  const config: IJoinToCreate = jtcMod?.config || {};
  let activeChannels: IJoinToCreate['activeChannels'] = config.activeChannels || [];
  const saveConfig = (updated: Partial<IJoinToCreate>) => context.updateModuleConfig('join_to_create', { ...config, ...updated });

  // Handle modal submit for configure category
  if (interaction.isModalSubmit && interaction.isModalSubmit() && customId === 'jtc_modal_set_category') {
    const { isOwnerOrExtraOwner } = await import('../../utils/whitelistCheck.js');
    if (!(await isOwnerOrExtraOwner(interaction.user.id, interaction.guild))) {
      return interaction.reply({ content: `${WRONG_ICON} **Access Denied**: Only the **Server Owner** and designated **Extra Owners** can configure JTC settings.`, flags: 64 });
    }
    const catQuery = (interaction.fields.getTextInputValue('category_query') || '').trim();
    if (catQuery.toLowerCase() === 'auto' || catQuery.toLowerCase() === 'reset' || catQuery.toLowerCase() === 'none') {
      saveConfig({ categoryId: null });
      config.categoryId = null;
      context.logSyncEvent(`[JTC] Spawn category set to auto-detect.`, 'info');
      return interaction.reply({ content: '<:ticks:1532620580266836148> Target category reset to **Auto-Detect** (temporary channels will spawn inside each trigger\'s own category).', flags: 64 });
    }

    const rawId = catQuery.replace(/[<#>]/g, '').trim();
    let foundCat: any = null;
    if (/^\d{17,20}$/.test(rawId)) {
      foundCat = interaction.guild.channels.cache.get(rawId);
    }
    if (!foundCat) {
      foundCat = interaction.guild.channels.cache.find((c: any) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === catQuery.toLowerCase());
    }
    if (!foundCat) {
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/gi, '');
      const qNorm = norm(catQuery);
      if (qNorm) {
        foundCat = interaction.guild.channels.cache.find((c: any) => c.type === ChannelType.GuildCategory && norm(c.name).includes(qNorm));
      }
    }

    if (!foundCat || foundCat.type !== ChannelType.GuildCategory) {
      return interaction.reply({ content: `${WRONG_ICON} Could not find a valid category matching "` + catQuery + `". Please provide the exact name or category ID.`, flags: 64 });
    }

    saveConfig({ categoryId: foundCat.id });
    config.categoryId = foundCat.id;
    context.logSyncEvent(`[JTC] Target spawn category updated to #${foundCat.name} (${foundCat.id}).`, 'success');

    return interaction.reply({
      content: '<:ticks:1532620580266836148> **JTC Target Category Updated**!\n> **Category:** <#' + foundCat.id + '> (`' + foundCat.name + '`)\n> **Category ID:** `' + foundCat.id + '`\n> All new temporary voice rooms will now spawn inside this category.',
      flags: 64
    });
  }

  // Handle modal submit for rename
  if (interaction.isModalSubmit && interaction.isModalSubmit() && customId.startsWith('jtc_modal_rename_')) {
    const channelId = customId.replace('jtc_modal_rename_', '');
    const newName = interaction.fields.getTextInputValue('new_name');
    const targetChannel = interaction.guild.channels.cache.get(channelId);
    if (targetChannel && newName) {
      await targetChannel.setName(newName).catch(() => { });
      const activeData = activeChannels.find((c: any) => c.channelId === channelId);
      if (activeData) activeData.name = newName;
      saveConfig({ activeChannels });
      return interaction.reply({ content: `<:ticks:1532620580266836148> Renamed room to **${newName}**!`, flags: 64 });
    }
    return interaction.reply({ content: `${WRONG_ICON} Failed to rename room.`, flags: 64 });
  }

  const { isOwnerOrExtraOwner } = await import('../../utils/whitelistCheck.js');
  // 1. Admin: 1-Click Auto Setup
  if (customId === 'jtc_btn_auto_setup') {
    if (!(await isOwnerOrExtraOwner(interaction.user.id, interaction.guild))) {
      return interaction.reply({ content: `${WRONG_ICON} **Access Denied**: Only the **Server Owner** and designated **Extra Owners** can access JTC administration.`, flags: 64 });
    }
    await interaction.deferUpdate().catch(() => { });

    let category = interaction.guild.channels.cache.find((c: any) => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('voice channels'));
    if (!category) {
      category = await interaction.guild.channels.create({
        name: '🔊 ┃ VOICE CHANNELS',
        type: ChannelType.GuildCategory
      }).catch(() => null);
    }

    const currentVoice = interaction.member?.voice?.channel;
    let triggerCh = currentVoice || interaction.guild.channels.cache.find((c: any) => {
      if (c.type !== ChannelType.GuildVoice) return false;
      const n = c.name.toLowerCase();
      return /join to create|temp\s*vc|create\s*vc|➕/i.test(n) || /^[.﹒]?\s*temp/i.test(n);
    });

    if (!triggerCh) {
      triggerCh = await interaction.guild.channels.create({
        name: '➕・Join to Create',
        type: ChannelType.GuildVoice,
        parent: category?.id || null
      }).catch(() => null);
    }

    if (triggerCh) {
      const existingTriggers = [...(config.triggers || [])];
      const idx = existingTriggers.findIndex((t: any) => t.triggerChannelId === triggerCh.id);
      const newTrig = {
        id: `trigger_${triggerCh.id}`,
        label: triggerCh.name,
        triggerChannelId: triggerCh.id,
        categoryId: triggerCh.parentId || category?.id || null,
        defaultName: "{username}'s Room",
        defaultLimit: 0,
        privacy: 'public' as const
      };
      if (idx >= 0) existingTriggers[idx] = newTrig;
      else existingTriggers.push(newTrig);

      saveConfig({
        enabled: true,
        triggers: existingTriggers,
        activeChannels: config.activeChannels || []
      });
      context.toggleModule?.('join_to_create', true);
      context.logSyncEvent(`[JTC] Auto-setup completed: #${triggerCh.name} bound to category.`, 'success');
    }

    const gui = buildJTCAdminDashboardGUI(interaction.guild, { ...config, enabled: true });
    return respondJtcGui(interaction, gui);
  }

  // 2. Admin: Toggle Master Module
  if (customId === 'jtc_btn_toggle_master') {
    if (!(await isOwnerOrExtraOwner(interaction.user.id, interaction.guild))) {
      return interaction.reply({ content: `${WRONG_ICON} **Access Denied**: Only the **Server Owner** and designated **Extra Owners** can access JTC administration.`, flags: 64 });
    }
    await interaction.deferUpdate().catch(() => { });
    const currentState = config.enabled !== false;
    const newState = !currentState;
    saveConfig({ enabled: newState });
    context.logSyncEvent(`[JTC] Master status toggled to ${newState ? 'ENABLED' : 'DISABLED'}.`, newState ? 'success' : 'warn');

    const gui = buildJTCAdminDashboardGUI(interaction.guild, { ...config, enabled: newState });
    return respondJtcGui(interaction, gui);
  }

  // 3. Admin: Clean Stale Channels
  if (customId === 'jtc_btn_clean_stale') {
    if (!(await isOwnerOrExtraOwner(interaction.user.id, interaction.guild))) {
      return interaction.reply({ content: `${WRONG_ICON} **Access Denied**: Only the **Server Owner** and designated **Extra Owners** can access JTC administration.`, flags: 64 });
    }
    await interaction.deferUpdate().catch(() => { });

    let cleaned = 0;
    const remaining: any[] = [];
    for (const ac of activeChannels) {
      const ch = interaction.guild.channels.cache.get(ac.channelId);
      if (!ch || (ch.isVoiceBased() && ch.members.filter((m: any) => !m.user.bot).size === 0)) {
        if (ch) await ch.delete('JTC Admin Manual Clean').catch(() => { });
        cleaned++;
      } else {
        remaining.push(ac);
      }
    }
    saveConfig({ activeChannels: remaining });
    context.logSyncEvent(`[JTC] Cleaned ${cleaned} stale voice channels.`, 'info');

    const gui = buildJTCAdminDashboardGUI(interaction.guild, { ...config, activeChannels: remaining });
    return respondJtcGui(interaction, gui);
  }

  // 4. Admin: Send Voice Controller Panel
  if (customId === 'jtc_btn_send_voice_panel') {
    if (!(await isOwnerOrExtraOwner(interaction.user.id, interaction.guild))) {
      return interaction.reply({ content: `${WRONG_ICON} **Access Denied**: Only the **Server Owner** and designated **Extra Owners** can access JTC administration.`, flags: 64 });
    }
    const currentVoice = interaction.member?.voice?.channel;
    if (currentVoice) {
      const activeData = activeChannels.find((c: any) => c.channelId === currentVoice.id);
      const gui = buildJTCVoiceControllerGUI(currentVoice, activeData);
      await interaction.channel?.send(gui.getSendPayload()).catch(() => interaction.channel?.send(gui.getFallbackPayload()));
      return interaction.reply({ content: `<:ticks:1532620580266836148> Posted Voice Controller for ${currentVoice}!`, flags: 64 });
    } else {
      return interaction.reply({ content: `${WRONG_ICON} Please join your temporary voice channel first, or run \`r!vc\` while inside the room.`, flags: 64 });
    }
  }

  // 4b. Admin: Set Category Modal Prompt
  if (customId === 'jtc_btn_set_category') {
    if (!(await isOwnerOrExtraOwner(interaction.user.id, interaction.guild))) {
      return interaction.reply({ content: `${WRONG_ICON} **Access Denied**: Only the **Server Owner** and designated **Extra Owners** can configure JTC administration.`, flags: 64 });
    }
    const currentCat = config.categoryId ? (interaction.guild.channels.cache.get(config.categoryId)?.name || config.categoryId) : '';
    const modal = new ModalBuilder()
      .setCustomId('jtc_modal_set_category')
      .setTitle('Configure Spawn Category');
    const input = new TextInputBuilder()
      .setCustomId('category_query')
      .setLabel('Category Name or ID (or "auto")')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(currentCat || 'e.g. 🔊 ┃ VOICE CHANNELS or ID')
      .setRequired(true)
      .setMaxLength(64);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    return interaction.showModal(modal);
  }

  // 5. Admin: Refresh Admin Dashboard
  if (customId === 'jtc_btn_refresh_admin') {
    await interaction.deferUpdate().catch(() => { });
    const gui = buildJTCAdminDashboardGUI(interaction.guild, config);
    return respondJtcGui(interaction, gui);
  }

  // In-Voice Controls: Extract target channel ID
  const channelId = customId.split('_').pop();
  const targetChannel = interaction.guild.channels.cache.get(channelId);
  const activeData = activeChannels.find((c: any) => c.channelId === channelId);

  if (!targetChannel) {
    return interaction.reply({ content: `${WRONG_ICON} This voice channel no longer exists.`, flags: 64 });
  }

  const isOwner = activeData?.ownerId === interaction.user.id;
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

  // In-Voice: Lock/Unlock
  if (customId.startsWith('jtc_btn_lock_')) {
    if (!isOwner && !isAdmin) {
      return interaction.reply({ content: `${WRONG_ICON} Only the channel owner can lock this room.`, flags: 64 });
    }
    await interaction.deferUpdate().catch(() => { });
    const everyoneRole = interaction.guild.roles.everyone;
    const isLocked = targetChannel.permissionOverwrites?.cache?.get(everyoneRole.id)?.deny?.has(PermissionFlagsBits.Connect);
    await targetChannel.permissionOverwrites.edit(everyoneRole, { Connect: isLocked ? null : false }).catch(() => { });

    const gui = buildJTCVoiceControllerGUI(targetChannel, activeData);
    return respondJtcGui(interaction, gui);
  }

  // In-Voice: Hide/Unhide
  if (customId.startsWith('jtc_btn_hide_')) {
    if (!isOwner && !isAdmin) {
      return interaction.reply({ content: `${WRONG_ICON} Only the channel owner can hide this room.`, flags: 64 });
    }
    await interaction.deferUpdate().catch(() => { });
    const everyoneRole = interaction.guild.roles.everyone;
    const isHidden = targetChannel.permissionOverwrites?.cache?.get(everyoneRole.id)?.deny?.has(PermissionFlagsBits.ViewChannel);
    await targetChannel.permissionOverwrites.edit(everyoneRole, { ViewChannel: isHidden ? null : false }).catch(() => { });

    const gui = buildJTCVoiceControllerGUI(targetChannel, activeData);
    return respondJtcGui(interaction, gui);
  }

  // In-Voice: Cycle Limit (0 -> 2 -> 4 -> 5 -> 10 -> 0)
  if (customId.startsWith('jtc_btn_limit_')) {
    if (!isOwner && !isAdmin) {
      return interaction.reply({ content: `${WRONG_ICON} Only the channel owner can set user limits.`, flags: 64 });
    }
    await interaction.deferUpdate().catch(() => { });
    const limits = [0, 2, 4, 5, 10];
    const currentLimit = targetChannel.userLimit || 0;
    const nextIdx = (limits.indexOf(currentLimit) + 1) % limits.length;
    const nextLimit = limits[nextIdx >= 0 ? nextIdx : 0];
    await targetChannel.setUserLimit(nextLimit).catch(() => { });

    const gui = buildJTCVoiceControllerGUI(targetChannel, activeData);
    return respondJtcGui(interaction, gui);
  }

  // In-Voice: Rename (Modal prompt)
  if (customId.startsWith('jtc_btn_rename_')) {
    if (!isOwner && !isAdmin) {
      return interaction.reply({ content: `${WRONG_ICON} Only the channel owner can rename this room.`, flags: 64 });
    }
    const modal = new ModalBuilder()
      .setCustomId(`jtc_modal_rename_${channelId}`)
      .setTitle('Rename Voice Channel');
    const input = new TextInputBuilder()
      .setCustomId('new_name')
      .setLabel('Enter New Channel Name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(targetChannel.name)
      .setRequired(true)
      .setMaxLength(32);
    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
    modal.addComponents(row);
    return interaction.showModal(modal);
  }

  // In-Voice: Claim Room
  if (customId.startsWith('jtc_btn_claim_')) {
    const userInVc = interaction.member?.voice?.channelId === targetChannel.id;
    if (!userInVc) {
      return interaction.reply({ content: `${WRONG_ICON} You must be inside the voice channel to claim ownership.`, flags: 64 });
    }
    const ownerInVc = targetChannel.members.has(activeData?.ownerId);
    if (ownerInVc && activeData?.ownerId !== interaction.user.id) {
      return interaction.reply({ content: `${WRONG_ICON} The current room owner is still connected to the voice room.`, flags: 64 });
    }

    if (activeData) {
      activeData.ownerId = interaction.user.id;
      activeData.ownerTag = interaction.user.username;
      saveConfig({ activeChannels });
    }
    await targetChannel.permissionOverwrites.edit(interaction.user.id, {
      ManageChannels: true,
      Connect: true,
      ViewChannel: true,
      Speak: true
    }).catch(() => { });

    await interaction.deferUpdate().catch(() => { });
    const gui = buildJTCVoiceControllerGUI(targetChannel, activeData);
    return respondJtcGui(interaction, gui);
  }

  // In-Voice: Mute/Unmute All Non-Owner Members
  if (customId.startsWith('jtc_btn_mute_all_')) {
    if (!isOwner && !isAdmin) {
      return interaction.reply({ content: `${WRONG_ICON} Only the channel owner can mute/unmute this room.`, flags: 64 });
    }
    await interaction.deferUpdate().catch(() => { });
    const membersList: any[] = targetChannel.members?.values
      ? Array.from(targetChannel.members.values())
      : [];
    const targetMembers = membersList.filter((m: any) => !m.user?.bot && m.id !== activeData?.ownerId);
    const shouldMute = targetMembers.some((m: any) => !m.voice?.serverMute);
    for (const m of targetMembers) {
      await m.voice?.setMute?.(shouldMute, `JTC: Room ${shouldMute ? 'Mute' : 'Unmute'} All`).catch(() => { });
    }

    const gui = buildJTCVoiceControllerGUI(targetChannel, activeData);
    return respondJtcGui(interaction, gui);
  }

  // In-Voice: Cycle Bitrate (64k -> 96k -> 128k -> 64k)
  if (customId.startsWith('jtc_btn_bitrate_')) {
    if (!isOwner && !isAdmin) {
      return interaction.reply({ content: `${WRONG_ICON} Only the channel owner can change audio bitrate.`, flags: 64 });
    }
    await interaction.deferUpdate().catch(() => { });
    const bitrates = [64000, 96000, 128000];
    const currentBr = targetChannel.bitrate || 64000;
    const nextIdx = (bitrates.indexOf(currentBr) + 1) % bitrates.length;
    const nextBr = bitrates[nextIdx >= 0 ? nextIdx : 0];
    await targetChannel.setBitrate(nextBr).catch(() => { });

    const gui = buildJTCVoiceControllerGUI(targetChannel, activeData);
    return respondJtcGui(interaction, gui);
  }

  // In-Voice: Delete Room
  if (customId.startsWith('jtc_btn_delete_')) {
    if (!isOwner && !isAdmin) {
      return interaction.reply({ content: `${WRONG_ICON} Only the channel owner or admin can delete this room.`, flags: 64 });
    }
    const channelName = targetChannel.name;
    await targetChannel.delete('JTC: Room deleted by owner').catch(() => { });
    activeChannels = activeChannels.filter((c: any) => c.channelId !== channelId);
    saveConfig({ activeChannels });
    return interaction.reply({ content: `<:ticks:1532620580266836148> Voice room **${channelName}** deleted.`, flags: 64 });
  }

  // In-Voice: Refresh
  if (customId.startsWith('jtc_btn_refresh_vc_')) {
    await interaction.deferUpdate().catch(() => { });
    const gui = buildJTCVoiceControllerGUI(targetChannel, activeData);
    return respondJtcGui(interaction, gui);
  }
}

// ─── Privacy helper ──────────────────────────────────────────────────────────
// Builds Discord permissionOverwrites for each privacy mode:
//   public    – no restrictions; owner gets ManageChannels
//   private   – visible but Connect denied for @everyone; owner + invites can join
//   locked    – visible but fully locked (Connect denied); only owner
//   invisible – hidden from channel list (ViewChannel denied); only owner sees it
//   stage     – public visibility but Speak denied; owner can unmute (like a stage)
function buildPrivacyOverwrites(privacy: string, guildId: string, memberId: string): any[] {
  const owner = [PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Speak];
  switch (privacy) {
    case 'private':
      return [
        { id: guildId, deny: [PermissionFlagsBits.Connect] },
        { id: memberId, allow: owner }
      ];
    case 'locked':
      return [
        { id: guildId, deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel] },
        { id: memberId, allow: owner }
      ];
    case 'invisible':
      return [
        { id: guildId, deny: [PermissionFlagsBits.ViewChannel] },
        { id: memberId, allow: owner }
      ];
    case 'stage':
      return [
        { id: guildId, deny: [PermissionFlagsBits.Speak], allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel] },
        { id: memberId, allow: [...owner, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers] }
      ];
    case 'sync':
      return [
        { id: memberId, allow: owner }
      ];
    case 'public':
    default:
      return [
        { id: memberId, allow: [PermissionFlagsBits.ManageChannels] }
      ];
  }
}

export const JoinToCreateManifest: ModuleManifest = {
  id: 'join_to_create',
  name: 'Join To Create',
  version: '1.0.0',
  description: 'Auto-create private voice channels when a user joins a trigger channel. Full owner controls.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;

      // Support new triggers array + legacy single triggerChannelId
      const triggers: any[] = config.triggers || [];
      const allTriggerIds: string[] = [
        ...triggers.map((t: any) => t.triggerChannelId),
        config.triggerChannelId
      ].filter(Boolean);

      if (allTriggerIds.length > 0) {
        progress += 100;
        if (registry?.channels) {
          for (const tid of allTriggerIds) {
            if (!registry.channels.some(c => c.id === tid)) {
              errors.push(`JTC trigger channel (${tid}) was deleted or is invalid.`);
            }
          }
        }
      } else {
        // Last resort: auto-detect by channel name
        const found = registry?.channels?.find(c => c.type === 'voice' && c.name.toLowerCase().includes('join to create'));
        if (found) { progress += 100; }
        else { errors.push('No JTC trigger channels configured. Add one from the dashboard or run /jtc setup.'); }
      }
      return { progress, errors };
    }
  },
  commands: [
    {
      name: 'jtc',
      description: 'Join To Create management',
      options: [
        {
          name: 'setup',
          description: 'Add or update a JTC trigger channel',
          type: 1,
          options: [
            { name: 'channel', type: 7, description: 'The voice channel users join to create', required: true, channel_types: [2, 13] },
            { name: 'label', type: 3, description: 'Friendly name for this trigger (e.g. Gaming, Chill)', required: false },
            { name: 'category', type: 7, description: 'Category to spawn new channels in', required: false, channel_types: [4] },
            { name: 'default_name', type: 3, description: 'Channel name template ({username}, {user}, {count})', required: false },
            { name: 'default_limit', type: 4, description: 'Default user limit (0 = unlimited)', required: false },
            {
              name: 'privacy', type: 3, description: 'Default privacy', required: false, choices: [
                { name: 'Public', value: 'public' },
                { name: 'Private', value: 'private' },
                { name: 'Locked', value: 'locked' },
                { name: 'Invisible', value: 'invisible' },
                { name: 'Stage', value: 'stage' },
                { name: 'Sync with Category', value: 'sync' }
              ]
            }
          ]
        },
        {
          name: 'remove',
          description: 'Remove a JTC trigger channel',
          type: 1,
          options: [{ name: 'channel', type: 7, description: 'The trigger channel to remove', required: true, channel_types: [2, 13] }]
        },
        {
          name: 'name',
          description: 'Rename your JTC channel',
          type: 1,
          options: [{ name: 'name', type: 3, description: 'New channel name', required: true }]
        },
        {
          name: 'limit',
          description: 'Set user limit for your JTC channel',
          type: 1,
          options: [{ name: 'limit', type: 4, description: 'User limit (0 = unlimited)', required: true }]
        },
        {
          name: 'lock',
          description: 'Lock your JTC channel',
          type: 1
        },
        {
          name: 'unlock',
          description: 'Unlock your JTC channel',
          type: 1
        },
        {
          name: 'transfer',
          description: 'Transfer ownership of your JTC channel',
          type: 1,
          options: [{ name: 'user', type: 6, description: 'New owner', required: true }]
        },
        {
          name: 'kick',
          description: 'Kick a user from your JTC channel',
          type: 1,
          options: [{ name: 'user', type: 6, description: 'User to kick', required: true }]
        },
        {
          name: 'invite',
          description: 'Invite a user to your private JTC channel',
          type: 1,
          options: [{ name: 'user', type: 6, description: 'User to invite', required: true }]
        },
        {
          name: 'info',
          description: 'View info about your JTC channel',
          type: 1
        },
        {
          name: 'list',
          description: 'List all active JTC channels',
          type: 1
        },
        {
          name: 'triggers',
          description: 'View all configured Join To Create trigger channels',
          type: 1
        },
        {
          name: 'bitrate',
          description: 'Set the bitrate of your JTC channel',
          type: 1,
          options: [{ name: 'bitrate', type: 4, description: 'Bitrate in kbps (e.g. 64)', required: true }]
        },
        {
          name: 'region',
          description: 'Set the voice region for your JTC channel',
          type: 1,
          options: [{ name: 'region', type: 3, description: 'Region (e.g. us-west, europe)', required: true }]
        },
        {
          name: 'reset',
          description: 'Reset your JTC channel to defaults',
          type: 1
        },
        {
          name: 'hide',
          description: 'Hide your voice channel',
          type: 1
        },
        {
          name: 'unhide',
          description: 'Unhide your voice channel',
          type: 1
        },
        {
          name: 'permit',
          description: 'Permit a user to join your locked channel',
          type: 1,
          options: [{ name: 'user', type: 6, description: 'Target user', required: true }]
        },
        {
          name: 'reject',
          description: 'Reject/block a user from joining your channel',
          type: 1,
          options: [{ name: 'user', type: 6, description: 'Target user', required: true }]
        },
        {
          name: 'claim',
          description: 'Claim ownership of the JTC channel if owner left',
          type: 1
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_jtc',
      handler: async (client: any, interaction: any, context: any) => {
        const sub = interaction.options.getSubcommand(false);
        const modules = context.getModulesState ? context.getModulesState() : [];
        const jtcMod = modules.find((m: any) => m.id === 'join_to_create');

        if (!jtcMod || jtcMod.status !== 'enabled') {
          return interaction.reply({ content: '<a:warning:1546155193303957504> Join To Create module is not enabled.', flags: 64 });
        }

        const config: IJoinToCreate = jtcMod.config || {};
        const activeChannels: IJoinToCreate['activeChannels'] = config.activeChannels || [];
        const saveConfig = (updated: Partial<IJoinToCreate>) => context.updateModuleConfig('join_to_create', { ...config, ...updated });

        if (!sub || sub === 'gui') {
          const currentVoice = (interaction.member as any)?.voice?.channel;
          const activeData = currentVoice ? activeChannels.find((c: any) => c.channelId === currentVoice.id) : null;
          if (currentVoice && activeData) {
            const gui = buildJTCVoiceControllerGUI(currentVoice, activeData);
            return respondJtcGui(interaction, gui);
          }
          const gui = buildJTCAdminDashboardGUI(interaction.guild, config);
          return respondJtcGui(interaction, gui);
        }

        if (sub === 'setup') {
          const { isOwnerOrExtraOwner } = await import('../../utils/whitelistCheck.js');
          if (!interaction.guild || !(await isOwnerOrExtraOwner(interaction.user.id, interaction.guild))) {
            return interaction.reply({ content: '<a:warning:1546155193303957504> **Access Denied**: Only the **Server Owner** and designated **Extra Owners** can configure JTC triggers.', flags: 64 });
          }
          const channel = interaction.options.getChannel('channel');
          const category = interaction.options.getChannel('category');
          const defaultName = interaction.options.getString('default_name') || "{username}'s Channel";
          const defaultLimit = interaction.options.getInteger('default_limit') ?? 0;
          const privacy = interaction.options.getString('privacy') || 'public';
          const label = interaction.options.getString('label') || (channel as any).name;

          const existingTriggers: any[] = [...(config.triggers || [])];
          const existingIdx = existingTriggers.findIndex((t: any) => t.triggerChannelId === channel.id);
          const newTrigger = { id: `trigger_${channel.id}`, label, triggerChannelId: channel.id, categoryId: category?.id || null, defaultName, defaultLimit, privacy };

          if (existingIdx >= 0) { existingTriggers[existingIdx] = newTrigger; }
          else { existingTriggers.push(newTrigger); }

          saveConfig({
            id: config.id || `jtc_${interaction.guildId}`,
            guildId: interaction.guildId,
            triggers: existingTriggers,
            allowOwnerRename: config.allowOwnerRename ?? true,
            allowOwnerLimit: config.allowOwnerLimit ?? true,
            allowOwnerLock: config.allowOwnerLock ?? true,
            activeChannels: config.activeChannels || [],
            createdAt: config.createdAt || new Date()
          });

          context.logSyncEvent(`[JTC] Trigger ${existingIdx >= 0 ? 'updated' : 'added'}: #${(channel as any).name} (${existingTriggers.length} total).`, 'success');
          return interaction.reply({ content: `<:ticks:1532620580266836148> **JTC Trigger ${existingIdx >= 0 ? 'Updated' : 'Added'}!**\n- **Channel:** ${channel}\n- **Label:** \`${label}\`\n- **Default Name:** \`${defaultName}\`\n- **Privacy:** \`${privacy}\`\n- **Total Triggers:** ${existingTriggers.length}`, flags: 64 });
        }

        if (sub === 'remove') {
          const { isOwnerOrExtraOwner } = await import('../../utils/whitelistCheck.js');
          if (!interaction.guild || !(await isOwnerOrExtraOwner(interaction.user.id, interaction.guild))) {
            return interaction.reply({ content: '<a:warning:1546155193303957504> **Access Denied**: Only the **Server Owner** and designated **Extra Owners** can remove JTC triggers.', flags: 64 });
          }
          const channel = interaction.options.getChannel('channel');
          const existingTriggers: any[] = [...(config.triggers || [])];
          const filtered = existingTriggers.filter((t: any) => t.triggerChannelId !== channel.id);
          if (filtered.length === existingTriggers.length) {
            return interaction.reply({ content: `<a:warning:1546155193303957504> ${channel} is not a registered JTC trigger channel.`, flags: 64 });
          }
          saveConfig({ triggers: filtered });
          context.logSyncEvent(`[JTC] Trigger removed: #${(channel as any).name} (${filtered.length} remaining).`, 'info');
          return interaction.reply({ content: `<:ticks:1532620580266836148> Removed **${(channel as any).name}** as a JTC trigger. **${filtered.length}** trigger(s) remaining.`, flags: 64 });
        }

        // Find user's active channel
        const myChannel = activeChannels.find((c: any) => c.ownerId === interaction.user.id);

        if (sub === 'name') {
          if (!myChannel) return interaction.reply({ content: '<a:warning:1546155193303957504> You don\'t own an active JTC channel.', flags: 64 });
          const name = interaction.options.getString('name');
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel) return interaction.reply({ content: '<a:warning:1546155193303957504> Channel not found.', flags: 64 });
          await channel.setName(name).catch(() => { });
          myChannel.name = name;
          saveConfig({ activeChannels });
          return interaction.reply({ content: `<:ticks:1532620580266836148> Renamed your channel to **${name}**.`, flags: 64 });
        }

        if (sub === 'limit') {
          if (!myChannel) return interaction.reply({ content: '<a:warning:1546155193303957504> You don\'t own an active JTC channel.', flags: 64 });
          const limit = interaction.options.getInteger('limit');
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel || channel.type !== ChannelType.GuildVoice) return interaction.reply({ content: '<a:warning:1546155193303957504> Channel not found.', flags: 64 });
          await channel.setUserLimit(limit).catch(() => { });
          return interaction.reply({ content: `<:ticks:1532620580266836148> Set user limit to **${limit === 0 ? 'unlimited' : limit}**.`, flags: 64 });
        }

        if (sub === 'lock') {
          if (!myChannel) return interaction.reply({ content: '<a:warning:1546155193303957504> You don\'t own an active JTC channel.', flags: 64 });
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel) return interaction.reply({ content: '<a:warning:1546155193303957504> Channel not found.', flags: 64 });
          // Lock = deny Connect (and ViewChannel for invisible mode) for @everyone
          await channel.permissionOverwrites.edit(interaction.guildId, {
            Connect: false,
            ViewChannel: null // keep visibility as-is, only block connect
          }).catch(() => { });
          myChannel.locked = true;
          saveConfig({ activeChannels });
          return interaction.reply({ content: '<a:success_check:1546134620087783526> Your channel is now **locked**. Use `/jtc unlock` to reopen.', flags: 64 });
        }

        if (sub === 'unlock') {
          if (!myChannel) return interaction.reply({ content: '<a:warning:1546155193303957504> You don\'t own an active JTC channel.', flags: 64 });
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel) return interaction.reply({ content: '<a:warning:1546155193303957504> Channel not found.', flags: 64 });
          // Restore privacy mode from the originating trigger
          const originTrigger = (config.triggers || []).find((t: any) => t.id === myChannel.triggerId);
          const originPrivacy = originTrigger?.privacy || 'public';
          // Reset @everyone to original privacy, but keep Connect open (unlocked)
          if (originPrivacy === 'invisible') {
            await channel.permissionOverwrites.edit(interaction.guildId, { Connect: null, ViewChannel: false }).catch(() => { });
          } else if (originPrivacy === 'stage') {
            await channel.permissionOverwrites.edit(interaction.guildId, { Connect: null, ViewChannel: null, Speak: false }).catch(() => { });
          } else {
            // public / private / locked — just open Connect
            await channel.permissionOverwrites.edit(interaction.guildId, { Connect: null }).catch(() => { });
          }
          myChannel.locked = false;
          saveConfig({ activeChannels });
          return interaction.reply({ content: '<:ticks:1532620580266836148> Your channel is now **unlocked**.', flags: 64 });
        }

        if (sub === 'transfer') {
          if (!myChannel) return interaction.reply({ content: '<a:warning:1546155193303957504> You don\'t own an active JTC channel.', flags: 64 });
          const user = interaction.options.getUser('user');
          myChannel.ownerId = user.id;
          myChannel.ownerTag = user.username;
          saveConfig({ activeChannels });
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (channel) {
            await channel.permissionOverwrites.edit(user.id, {
              ManageChannels: true,
              Connect: true,
              ViewChannel: true,
              Speak: true
            }).catch(() => { });
          }
          context.logSyncEvent(`[JTC] ${interaction.user.username} transferred channel to ${user.username}.`, 'info');
          return interaction.reply({ content: `<:ticks:1532620580266836148> Transferred channel ownership to ${user}.`, flags: 64 });
        }

        if (sub === 'kick') {
          if (!myChannel) return interaction.reply({ content: '<a:warning:1546155193303957504> You don\'t own an active JTC channel.', flags: 64 });
          const user = interaction.options.getUser('user');
          const member = interaction.guild?.members.cache.get(user.id);
          if (!member) return interaction.reply({ content: '<a:warning:1546155193303957504> Member not found.', flags: 64 });
          if (member.voice?.channelId === myChannel.channelId) {
            await member.voice.disconnect('Kicked from JTC channel').catch(() => { });
          }
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (channel) await channel.permissionOverwrites.edit(user.id, { Connect: false }).catch(() => { });
          return interaction.reply({ content: `<:ticks:1532620580266836148> Kicked ${user} from your channel.`, flags: 64 });
        }

        if (sub === 'invite') {
          if (!myChannel) return interaction.reply({ content: '<a:warning:1546155193303957504> You don\'t own an active JTC channel.', flags: 64 });
          const user = interaction.options.getUser('user');
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel) return interaction.reply({ content: '<a:warning:1546155193303957504> Channel not found.', flags: 64 });
          await channel.permissionOverwrites.edit(user.id, { Connect: true, ViewChannel: true }).catch(() => { });
          return interaction.reply({ content: `<:ticks:1532620580266836148> Invited ${user} to your channel.`, flags: 64 });
        }

        if (sub === 'info') {
          if (!myChannel) return interaction.reply({ content: '<a:warning:1546155193303957504> You don\'t own an active JTC channel.', flags: 64 });
          const originTrigger = (config.triggers || []).find((t: any) => t.id === myChannel.triggerId);
          const privacyLabel: Record<string, string> = { public: 'Public', private: 'Private', locked: 'Locked', invisible: 'Invisible', stage: 'Stage', sync: 'Synced' };
          const embed = new EmbedBuilder()
            .setTitle(`<:voicechannelgreen:1532425750278438962> Your JTC Channel`)
            .setColor('#4f8cff')
            .addFields(
              { name: '<:voicechannelgreen:1532425750278438962> Channel', value: `<#${myChannel.channelId}>`, inline: true },
              { name: '<a:lovemail:1527647157371535420> Name', value: myChannel.name, inline: true },
              { name: '<a:success_check:1546134620087783526> Status', value: myChannel.locked ? 'Locked' : 'Open', inline: true },
              { name: '<:config:1532425712844144701> Privacy Mode', value: privacyLabel[originTrigger?.privacy || 'public'] || 'Public', inline: true },
              { name: '<:member:1532621317487071426> User Limit', value: (myChannel.limit || 0) === 0 ? '∞ Unlimited' : `${myChannel.limit} max`, inline: true },
              { name: '<:link:1532620952087826602> Trigger', value: originTrigger ? originTrigger.label : 'Legacy', inline: true },
              { name: '<a:loading:1546134304625528882> Created', value: `<t:${Math.floor(new Date(myChannel.createdAt).getTime() / 1000)}:R>`, inline: true }
            );
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (!sub || sub === 'list' || sub === 'triggers' || sub === 'help' || sub === 'status') {
          const triggers: any[] = config.triggers || [];
          const triggerLines = triggers.length > 0
            ? triggers.map((t: any, i: number) => `• <#${t.triggerChannelId}> — Label: \`${t.label || 'Default'}\` | Privacy: \`${t.privacy || 'public'}\``)
            : [config.triggerChannelId ? `• <#${config.triggerChannelId}> — Legacy Trigger` : '*No JTC triggers set up yet. Use `r!jtc setup <#channel>` to add one.*'];

          const activeLines = activeChannels.length > 0
            ? activeChannels.map((c: any, i: number) => `• <#${c.channelId}> — Owner: <@${c.ownerId}> ${c.locked ? '[Locked]' : '[Open]'}`)
            : ['*No active spawned JTC channels currently.*'];

          const embed = buildLimeOverviewCard({
            title: 'JOIN TO CREATE (JTC) SYSTEM',
            subtitle: 'AUTOMATED TEMPORARY VOICE CHANNELS',
            color: Colors.LIME,
            sections: [
              {
                title: ' CONFIGURATIONS & TRIGGERS',
                items: triggerLines
              },
              {
                title: ' ACTIVE SPAWNED CHANNELS',
                items: activeLines
              },
              {
                title: ' COMMANDS & CONTROLS',
                items: [
                  '`r!jtc setup <#channel>` — Register a voice channel trigger',
                  '`r!jtc remove <#channel>` — Unregister a voice trigger',
                  '`r!jtc name <name>` — Rename your active channel',
                  '`r!jtc limit <count>` — Set user limit (0 = unlimited)',
                  '`r!jtc lock` / `r!jtc unlock` — Toggle channel lock',
                  '`r!jtc hide` / `r!jtc unhide` — Toggle channel visibility',
                  '`r!jtc invite @user` / `r!jtc kick @user` — Manage member access',
                  '`r!jtc permit @user` / `r!jtc reject @user` — Manage channel permissions',
                  '`r!jtc claim` — Claim channel if owner left'
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Voice Security Engine'
          });

          return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'bitrate') {
          if (!myChannel) return interaction.reply({ content: '<a:warning:1546155193303957504> You don\'t own an active JTC channel.', flags: 64 });
          const bitrate = interaction.options.getInteger('bitrate');
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel || channel.type !== ChannelType.GuildVoice) return interaction.reply({ content: '<a:warning:1546155193303957504> Channel not found.', flags: 64 });
          await channel.setBitrate(bitrate * 1000).catch(() => { });
          return interaction.reply({ content: `<:ticks:1532620580266836148> Set bitrate to **${bitrate}kbps**.`, flags: 64 });
        }

        if (sub === 'region') {
          if (!myChannel) return interaction.reply({ content: '<a:warning:1546155193303957504> You don\'t own an active JTC channel.', flags: 64 });
          const region = interaction.options.getString('region');
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel || channel.type !== ChannelType.GuildVoice) return interaction.reply({ content: '<a:warning:1546155193303957504> Channel not found.', flags: 64 });
          const rtcRegion = region?.toLowerCase() === 'auto' ? null : (region || null);
          await (channel as any).setRTCRegion(rtcRegion).catch(() => { });
          return interaction.reply({ content: `<:ticks:1532620580266836148> Set voice region to **${rtcRegion ?? 'Automatic'}**.`, flags: 64 });
        }

        if (sub === 'reset') {
          if (!myChannel) return interaction.reply({ content: '<a:warning:1546155193303957504> You don\'t own an active JTC channel.', flags: 64 });
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel) return interaction.reply({ content: '<a:warning:1546155193303957504> Channel not found.', flags: 64 });
          // BUG FIX: resolve defaults from originating trigger, not stale root config fields
          const originTrigger = (config.triggers || []).find((t: any) => t.id === myChannel.triggerId);
          const defaultName = ((originTrigger?.defaultName || config.defaultName || "{username}'s Channel"))
            .replace(/{username}/g, interaction.user.username)
            .replace(/{user}/g, (interaction.member as any)?.displayName || interaction.user.username);
          const defaultLimit = originTrigger?.defaultLimit ?? config.defaultLimit ?? 0;
          const defaultPrivacy = originTrigger?.privacy || config.privacy || 'public';
          await channel.setName(defaultName).catch(() => { });
          if (channel.type === ChannelType.GuildVoice) await channel.setUserLimit(defaultLimit).catch(() => { });

          if (defaultPrivacy === 'sync') {
            if (channel.parentId) {
              await channel.lockPermissions().catch(() => { });
            }
          }
          // Re-apply the trigger's original privacy overwrite
          const overwrites = buildPrivacyOverwrites(defaultPrivacy, interaction.guildId!, interaction.user.id);
          for (const ow of overwrites) {
            await channel.permissionOverwrites.edit(ow.id, ow).catch(() => { });
          }
          myChannel.name = defaultName;
          myChannel.locked = false;
          saveConfig({ activeChannels });
          return interaction.reply({ content: `<:ticks:1532620580266836148> Reset your channel to **${defaultPrivacy}** defaults.`, flags: 64 });
        }

        if (sub === 'hide') {
          if (!myChannel) return interaction.reply({ content: '<a:warning:1546155193303957504> You don\'t own an active JTC channel.', flags: 64 });
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel) return interaction.reply({ content: '<a:warning:1546155193303957504> Channel not found.', flags: 64 });
          await channel.permissionOverwrites.edit(interaction.guild?.roles.everyone.id!, { ViewChannel: false }).catch(() => { });
          return interaction.reply({ content: '<:ticks:1532620580266836148> Channel successfully hidden.', flags: 64 });
        }

        if (sub === 'unhide') {
          if (!myChannel) return interaction.reply({ content: '<a:warning:1546155193303957504> You don\'t own an active JTC channel.', flags: 64 });
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel) return interaction.reply({ content: '<a:warning:1546155193303957504> Channel not found.', flags: 64 });
          await channel.permissionOverwrites.edit(interaction.guild?.roles.everyone.id!, { ViewChannel: null }).catch(() => { });
          return interaction.reply({ content: '<:ticks:1532620580266836148> Channel successfully unhidden.', flags: 64 });
        }

        if (sub === 'permit') {
          if (!myChannel) return interaction.reply({ content: '<a:warning:1546155193303957504> You don\'t own an active JTC channel.', flags: 64 });
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel) return interaction.reply({ content: '<a:warning:1546155193303957504> Channel not found.', flags: 64 });
          const target = interaction.options.getUser('user');
          await channel.permissionOverwrites.edit(target.id, { Connect: true, ViewChannel: true }).catch(() => { });
          return interaction.reply({ content: `<:ticks:1532620580266836148> Allowed ${target} to join your channel.`, flags: 64 });
        }

        if (sub === 'reject') {
          if (!myChannel) return interaction.reply({ content: '<a:warning:1546155193303957504> You don\'t own an active JTC channel.', flags: 64 });
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel) return interaction.reply({ content: '<a:warning:1546155193303957504> Channel not found.', flags: 64 });
          const target = interaction.options.getUser('user');
          await channel.permissionOverwrites.edit(target.id, { Connect: false }).catch(() => { });
          const member = interaction.guild?.members.cache.get(target.id);
          if (member && member.voice?.channelId === channel.id) {
            await member.voice.disconnect().catch(() => { });
          }
          return interaction.reply({ content: `<a:warning:1546155193303957504> Blocked ${target} from joining your channel.`, flags: 64 });
        }

        if (sub === 'claim') {
          const currentVoiceChannel = (interaction.member as any)?.voice?.channel;
          if (!currentVoiceChannel) return interaction.reply({ content: '<a:warning:1546155193303957504> You must be in a JTC voice channel to claim it.', flags: 64 });
          const activeCh = activeChannels.find((c: any) => c.channelId === currentVoiceChannel.id);
          if (!activeCh) return interaction.reply({ content: '<a:warning:1546155193303957504> This channel is not a managed JTC channel.', flags: 64 });
          const originalOwnerInVc = currentVoiceChannel.members.has(activeCh.ownerId);
          if (originalOwnerInVc && activeCh.ownerId !== interaction.user.id) {
            return interaction.reply({ content: '<a:warning:1546155193303957504> You cannot claim this channel because the owner is still in the voice channel.', flags: 64 });
          }
          activeCh.ownerId = interaction.user.id;
          activeCh.ownerTag = interaction.user.tag;
          saveConfig({ activeChannels });
          await currentVoiceChannel.permissionOverwrites.edit(interaction.user.id, { ManageChannels: true, Connect: true, ViewChannel: true }).catch(() => { });
          return interaction.reply({ content: '<:vip:1532620837117759508> **You have successfully claimed ownership of this channel!**' });
        }
      }
    },
    // Auto-create channel when user joins any trigger
    {
      name: 'voiceStateUpdate',
      handler: async (client: any, data: any, context: any) => {
        const { oldState, newState } = data;
        const modules = context.getModulesState ? context.getModulesState() : [];
        const jtcMod = modules.find((m: any) => m.id === 'join_to_create' || m.id === 'joinToCreate');
        const config: IJoinToCreate = jtcMod?.config || {};
        if (config.enabled === false) return;

        const guild = newState.guild || oldState.guild;
        if (!guild) return;

        // Auto-heal status if triggers exist or master is active
        const hasConfiguredTriggers = (config.triggers && config.triggers.length > 0) || (config as any).hubChannelId || config.triggerChannelId;
        if (jtcMod && jtcMod.status !== 'enabled') {
          if (config.enabled === true || hasConfiguredTriggers) {
            jtcMod.status = 'enabled';
            context.toggleModule?.('join_to_create', true);
          } else {
            const hasCandidate = guild.channels?.cache?.some((c: any) => 
              c.type === ChannelType.GuildVoice && 
              (/join to create|temp\s*vc|create\s*vc|➕/i.test(c.name) || /^[.﹒]?\s*temp/i.test(c.name))
            );
            if (hasCandidate) {
              jtcMod.status = 'enabled';
              context.toggleModule?.('join_to_create', true);
            } else {
              return;
            }
          }
        }

        let activeChannels: IJoinToCreate['activeChannels'] = config.activeChannels || [];

        // Build effective triggers list: new array + legacy single-trigger compat + hubChannelId
        const triggers: any[] = [...(config.triggers || [])];
        if (config.triggerChannelId && !triggers.find((t: any) => t.triggerChannelId === config.triggerChannelId)) {
          triggers.push({
            id: 'legacy',
            label: 'Default Trigger',
            triggerChannelId: config.triggerChannelId,
            categoryId: config.categoryId || null,
            defaultName: config.defaultName || "{username}'s Channel",
            defaultLimit: config.defaultLimit || 0,
            privacy: config.privacy || 'public'
          });
        }
        if ((config as any).hubChannelId && !triggers.find((t: any) => t.triggerChannelId === (config as any).hubChannelId)) {
          triggers.push({
            id: 'hub',
            label: 'Configured Hub',
            triggerChannelId: (config as any).hubChannelId,
            categoryId: config.categoryId || null,
            defaultName: (config as any).nameTemplate || config.defaultName || "{username}'s Room",
            defaultLimit: (config as any).userLimit || config.defaultLimit || 0,
            privacy: config.privacy || 'public'
          });
        }
        // Auto-detect fallback if no triggers configured
        if (triggers.length === 0) {
          const found = guild.channels.cache.find((c: any) => {
            if (c.type !== ChannelType.GuildVoice) return false;
            const n = c.name.toLowerCase();
            return /join to create|temp\s*vc|create\s*vc|➕/i.test(n) || /^[.﹒]?\s*temp/i.test(n);
          });
          if (found) {
            triggers.push({ 
              id: `auto_${found.id}`, 
              label: found.name, 
              triggerChannelId: found.id, 
              categoryId: found.parentId || null, 
              defaultName: "{username}'s Room", 
              defaultLimit: 0, 
              privacy: 'public' 
            });
          }
        }

        // 1. Find which trigger (if any) the user just joined
        const matchedTrigger = newState.channelId ? triggers.find((t: any) => t.triggerChannelId === newState.channelId) : null;

        if (matchedTrigger && newState.member) {
          const member = newState.member;
          const createKey = `${guild.id}_${member.id}`;
          if (!creatingUsers.has(createKey)) {
            creatingUsers.add(createKey);
            try {
              // Resolve parent category from trigger config / global config first, then from trigger channel
              let triggerCh: any = null;
              try {
                triggerCh = guild.channels.cache.get(matchedTrigger.triggerChannelId) || await guild.channels.fetch(matchedTrigger.triggerChannelId).catch(() => null);
              } catch (e) { console.error('[JTC] Failed to fetch trigger channel:', e); }
              const parentId: string | null = matchedTrigger.categoryId || config.categoryId || triggerCh?.parentId || null;

              const channelName = (matchedTrigger.defaultName || "{username}'s Channel")
                .replace(/{username}/g, member.user.username)
                .replace(/{user}/g, member.displayName)
                .replace(/{count}/g, String(activeChannels.length + 1));

              const isSyncMode = matchedTrigger.privacy === 'sync';
              let initialOverwrites: any[] = [];

              if (isSyncMode) {
                if (parentId) {
                  const categoryCh = guild.channels.cache.get(parentId) || await guild.channels.fetch(parentId).catch(() => null);
                  if (categoryCh && categoryCh.permissionOverwrites) {
                    initialOverwrites = categoryCh.permissionOverwrites.cache.map((ow: any) => ({
                      id: ow.id,
                      type: ow.type,
                      allow: ow.allow,
                      deny: ow.deny
                    }));
                  }
                }
                // Owner gets priority overrides
                initialOverwrites.push({
                  id: member.id,
                  type: 1, // User type
                  allow: [
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.Connect,
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.Speak
                  ]
                });
              } else {
                initialOverwrites = buildPrivacyOverwrites(matchedTrigger.privacy || 'public', guild.id, member.id);
              }

              const createOptions: any = {
                name: channelName,
                type: ChannelType.GuildVoice,
                parent: parentId,
                userLimit: matchedTrigger.defaultLimit || 0,
                permissionOverwrites: initialOverwrites
              };

              const newChannel = await guild.channels.create(createOptions);

              if (isSyncMode && parentId) {
                await newChannel.lockPermissions().catch(() => { });
                await newChannel.permissionOverwrites.edit(member.id, {
                  ManageChannels: true,
                  Connect: true,
                  ViewChannel: true,
                  Speak: true
                }).catch(() => { });
              }

              let movedOk = true;
              await member.voice.setChannel(newChannel).catch(() => { movedOk = false; });

              if (!movedOk) {
                await newChannel.delete?.('JTC: User disconnected during room creation')?.catch(() => { });
              } else {
                activeChannels.push({
                  channelId: newChannel.id,
                  ownerId: member.id,
                  ownerTag: member.user.username,
                  name: channelName,
                  locked: matchedTrigger.privacy === 'locked',
                  limit: matchedTrigger.defaultLimit || 0,
                  triggerId: matchedTrigger.id,
                  createdAt: new Date()
                });

                context.updateModuleConfig('join_to_create', { activeChannels });
                context.logSyncEvent(`[JTC] Created "${channelName}" for ${member.user.username} via trigger "${matchedTrigger.label}".`, 'success');
              }
            } catch (err) {
              console.error('[JTC] Create error:', err);
            } finally {
              creatingUsers.delete(createKey);
            }
          }
        }

        // 2. Scan and auto-delete all empty JTC channels
        let configChanged = false;
        for (let i = activeChannels.length - 1; i >= 0; i--) {
          const activeCh = activeChannels[i];
          try {
            let channel = guild.channels.cache.get(activeCh.channelId);
            if (!channel) {
              try {
                channel = await guild.channels.fetch(activeCh.channelId);
              } catch (err: any) {
                // Discord API error codes:
                // 10003: Unknown Channel (deleted)
                // 50001: Missing Access
                if (err.code === 10003 || err.code === 50001) {
                  activeChannels.splice(i, 1);
                  configChanged = true;
                  context.logSyncEvent(`[JTC] Cleared stale tracked channel ID ${activeCh.channelId} (deleted or inaccessible).`, 'info');
                } else {
                  console.error(`[JTC] Transient error fetching channel ${activeCh.channelId}:`, err);
                }
                continue;
              }
            }

            if (!channel) {
              // Should not happen unless fetch returned null/undefined without throwing, but handle it anyway
              activeChannels.splice(i, 1);
              configChanged = true;
              continue;
            }

            // Don't auto-delete freshly created channels to allow Discord voice connection handover
            const roomAgeMs = Date.now() - new Date(activeCh.createdAt || 0).getTime();
            if (roomAgeMs < 10000) continue;

            const nonBotMembers = channel.members?.filter ? channel.members.filter((m: any) => !m.user?.bot) : Array.from((channel.members?.values?.() || [])).filter((m: any) => !m.user?.bot);
            const nonBotCount = nonBotMembers?.size !== undefined ? nonBotMembers.size : (nonBotMembers?.length || 0);
            if (nonBotCount === 0) {
              try {
                await channel.delete('JTC: Channel empty');
                activeChannels.splice(i, 1);
                configChanged = true;
                context.logSyncEvent(`[JTC] Auto-deleted empty channel "${activeCh.name || activeCh.channelId}".`, 'info');
              } catch (deleteErr: any) {
                console.error(`[JTC] Failed to delete empty channel ${activeCh.channelId}:`, deleteErr);
                // Do NOT splice out of activeChannels if delete fails (unless it is missing permissions 50013 or channel was deleted 10003)
                if (deleteErr.code === 10003 || deleteErr.code === 50001 || deleteErr.code === 50013) {
                  activeChannels.splice(i, 1);
                  configChanged = true;
                  context.logSyncEvent(`[JTC] Cleared empty channel ID ${activeCh.channelId} due to permission/delete error (${deleteErr.code}).`, 'warning');
                }
              }
            }
          } catch (outerErr) {
            console.error(`[JTC] Error in cleanup loop for channel ${activeCh.channelId}:`, outerErr);
          }
        }

        if (configChanged) context.updateModuleConfig('join_to_create', { activeChannels });
      }
    },
    // Keep DB synchronized when channel is manually deleted
    {
      name: 'channelDelete',
      handler: async (client: any, channel: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const jtcMod = modules.find((m: any) => m.id === 'join_to_create');
        if (!jtcMod || jtcMod.status !== 'enabled') return;

        const config: IJoinToCreate = jtcMod.config || {};
        let activeChannels: IJoinToCreate['activeChannels'] = config.activeChannels || [];
        let triggers = config.triggers || [];
        const originalTriggersLength = triggers.length;

        triggers = triggers.filter((t: any) => t.triggerChannelId !== channel.id);
        const updates: Partial<IJoinToCreate> = {};
        let changed = false;

        if (triggers.length !== originalTriggersLength) {
          updates.triggers = triggers;
          changed = true;
          context.logSyncEvent(`[JTC] Trigger channel "${channel.name}" was deleted; removed from triggers.`, 'info');
        }

        if (config.triggerChannelId === channel.id || (config as any).hubChannelId === channel.id) {
          (updates as any).triggerChannelId = triggers[0]?.triggerChannelId || null;
          (updates as any).hubChannelId = (updates as any).triggerChannelId;
          changed = true;
        }

        const jtcIndex = activeChannels.findIndex((c: any) => c.channelId === channel.id);
        if (jtcIndex !== -1) {
          activeChannels.splice(jtcIndex, 1);
          updates.activeChannels = activeChannels;
          changed = true;
          context.logSyncEvent(`[JTC] Active channel "${channel.name}" was manually deleted; cleared from tracking.`, 'info');
        }

        if (changed) {
          context.updateModuleConfig('join_to_create', updates);
        }
      }
    },
    {
      name: 'button_jtc_generic',
      handler: async (client: any, interaction: any, context: any) => {
        return handleJtcInteraction(interaction, context);
      }
    }
  ],
  routes: [
    {
      path: '/state',
      method: 'get',
      handler: async (req: any, res: any, context: any) => {
        const modules = context.getModulesState();
        const mod = modules.find((m: any) => m.id === 'join_to_create');
        res.json({ config: mod?.config || {}, activeChannels: mod?.config?.activeChannels || [] });
      }
    }
  ]
};

// Register Prefix Command for JTC / Voice Room Controller

export function resolveVoiceChannelInput(guild: any, query: string, firstMention?: any): any {
  if (firstMention && (firstMention.type === ChannelType.GuildVoice || firstMention.isVoiceBased?.())) {
    return firstMention;
  }
  if (!query || !guild) return null;
  const raw = query.trim();
  const cleanId = raw.replace(/[<#>]/g, '').trim();

  // 1. Direct ID lookup
  if (/^\d{17,20}$/.test(cleanId)) {
    const ch = guild.channels?.cache?.get ? guild.channels.cache.get(cleanId) : null;
    if (ch && (ch.type === ChannelType.GuildVoice || ch.isVoiceBased?.())) return ch;
  }

  const channelList: any[] = guild.channels?.cache?.find 
    ? guild.channels.cache 
    : Array.from(guild.channels?.cache?.values?.() || []);

  // 2. Exact name match (case-insensitive)
  const exact = channelList.find((c: any) => 
    (c.type === ChannelType.GuildVoice || c.isVoiceBased?.()) && 
    c.name.toLowerCase() === raw.toLowerCase()
  );
  if (exact) return exact;

  // 3. Normalized alphanumeric match (handles unicode dots '﹒', emojis, extra spaces)
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/gi, '');
  const targetNorm = norm(raw);
  if (targetNorm.length > 0) {
    const normMatch = channelList.find((c: any) => 
      (c.type === ChannelType.GuildVoice || c.isVoiceBased?.()) && 
      norm(c.name) === targetNorm
    );
    if (normMatch) return normMatch;

    // 4. Partial substring match
    const partialMatch = channelList.find((c: any) => 
      (c.type === ChannelType.GuildVoice || c.isVoiceBased?.()) && 
      norm(c.name).includes(targetNorm)
    );
    if (partialMatch) return partialMatch;
  }

  return null;
}

PrefixRegistry.register({
  name: 'jtc',
  category: 'Voice',
  description: 'Interactive Join-To-Create Voice Control Center & Room Manager in Box UI.',
  usage: 'r!jtc [setup|clean|toggle|lock|hide|limit|rename|claim|bitrate]',
  aliases: ['jointocreate', 'vc', 'voicecontrol', 'vcmgr'],
  cooldownSeconds: 2,
  execute: async (message: Message, args: string[], extra?: any) => {
    if (!message.guild) return;
    const modules = extra?.getModulesState ? extra.getModulesState(message.guild.id) : [];
    const jtcMod = modules.find((m: any) => m.id === 'join_to_create');
    const config: IJoinToCreate = jtcMod?.config || {};
    const activeChannels = config.activeChannels || [];

    const currentVoice = message.member?.voice?.channel;
    const activeData = currentVoice ? activeChannels.find((c: any) => c.channelId === currentVoice.id) : null;
    const sub = (args[0] || '').toLowerCase();
    const saveConfig = (updated: Partial<IJoinToCreate>) => extra?.updateModuleConfig?.('join_to_create', { ...config, ...updated });

    const { isOwnerOrExtraOwner } = await import('../../utils/whitelistCheck.js');
    const isOwner = await isOwnerOrExtraOwner(message.author.id, message.guild);

    // Subcommand: setup / auto / add / set
    if (sub === 'setup' || sub === 'auto' || sub === 'add' || sub === 'set') {
      if (!isOwner) {
        return message.reply({ content: `${WRONG_ICON} **Access Denied**: Only the **Server Owner** and designated **Extra Owners** can configure JTC triggers.` });
      }

      const inputQuery = args.slice(1).join(' ').trim();
      let triggerCh: any = null;

      if (inputQuery) {
        // Resolve by Mention, Snowflake ID, or Channel Name (exact / normalized)
        triggerCh = resolveVoiceChannelInput(message.guild, inputQuery, message.mentions.channels.first());
        if (!triggerCh) {
          return message.reply({
            content: `${WRONG_ICON} **Voice Channel Not Found**: Could not find any voice channel matching "` + inputQuery + `".\n> **Tip**: You can mention it (#channel), provide its ID, or write its name.`
          });
        }
      } else {
        // If no parameter given, check if member is currently in a voice channel
        if (message.member?.voice?.channel) {
          triggerCh = message.member.voice.channel;
        } else {
          // Check for existing voice channels matching trigger patterns
          triggerCh = message.guild.channels.cache.find((c: any) => {
            if (c.type !== ChannelType.GuildVoice) return false;
            const n = c.name.toLowerCase();
            return /join to create|temp\s*vc|create\s*vc|➕/i.test(n) || /^[.﹒]?\s*temp/i.test(n);
          });
        }
      }

      let category: any = triggerCh?.parent || message.guild.channels.cache.find((c: any) => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('voice channels'));
      if (!category && !triggerCh) {
        category = await message.guild.channels.create({
          name: '🔊 ┃ VOICE CHANNELS',
          type: ChannelType.GuildCategory
        }).catch(() => null);
      }

      if (!triggerCh) {
        triggerCh = await message.guild.channels.create({
          name: '➕・Join to Create',
          type: ChannelType.GuildVoice,
          parent: category?.id || null
        }).catch(() => null);
      }

      if (triggerCh) {
        const triggerId = triggerCh.id;
        const existingTriggers = [...(config.triggers || [])];
        const idx = existingTriggers.findIndex((t: any) => t.triggerChannelId === triggerId);
        const newTrig = {
          id: `trigger_${triggerId}`,
          label: triggerCh.name,
          triggerChannelId: triggerId,
          categoryId: triggerCh.parentId || category?.id || null,
          defaultName: "{username}'s Room",
          defaultLimit: 0,
          privacy: 'public' as const
        };
        if (idx >= 0) existingTriggers[idx] = newTrig;
        else existingTriggers.push(newTrig);

        const updatedConfig = {
          ...config,
          enabled: true,
          triggerChannelId: triggerId,
          hubChannelId: triggerId,
          triggers: existingTriggers,
          activeChannels: config.activeChannels || []
        };

        saveConfig(updatedConfig);
        config.enabled = true;
        config.triggerChannelId = triggerId;
        (config as any).hubChannelId = triggerId;
        config.triggers = existingTriggers;

        extra?.toggleModule?.('join_to_create', true);
        extra?.logSyncEvent?.(message.guild.id, `[JTC] Setup completed: Saved trigger ID ${triggerId} (#${triggerCh.name}).`, 'success');

        const successNotice = '> **Trigger Channel Configured Successfully**\n> **Channel:** <#' + triggerId + '> (' + triggerCh.name + ')\n> **Saved Channel ID:** `' + triggerId + '`\n> **Backend Status:** `READY` (Backend strictly monitors this channel ID).\n\n';
        const gui = buildJTCAdminDashboardGUI(message.guild, config, successNotice);
        return respondJtcGui(message, gui);
      }
    }

    // Subcommand: clean / purge
    if (sub === 'clean' || sub === 'purge') {
      if (!isOwner) {
        return message.reply({ content: `${WRONG_ICON} **Access Denied**: Only the **Server Owner** and designated **Extra Owners** can clean JTC rooms.` });
      }
      let cleaned = 0;
      const remaining: any[] = [];
      for (const ac of activeChannels) {
        const ch = message.guild.channels.cache.get(ac.channelId);
        if (!ch || (ch.isVoiceBased() && ch.members.filter((m: any) => !m.user.bot).size === 0)) {
          if (ch) await ch.delete('JTC Manual Clean').catch(() => { });
          cleaned++;
        } else {
          remaining.push(ac);
        }
      }
      saveConfig({ activeChannels: remaining });
      config.activeChannels = remaining;
      extra?.logSyncEvent?.(message.guild.id, `[JTC] Cleaned ${cleaned} stale voice channels.`, 'info');
      const gui = buildJTCAdminDashboardGUI(message.guild, config);
      return respondJtcGui(message, gui);
    }

    // Subcommand: category / cat
    if (sub === 'category' || sub === 'cat') {
      if (!isOwner) {
        return message.reply({ content: `${WRONG_ICON} **Access Denied**: Only the **Server Owner** and designated **Extra Owners** can configure JTC category.` });
      }
      const query = args.slice(1).join(' ').trim();
      if (!query) {
        const catStr = config.categoryId ? `<#${config.categoryId}>` : '`Auto-Detect (Inherits from trigger channel)`';
        return message.reply({ content: `📁 **Current JTC Spawn Category:** ${catStr}\n> To change: \`r!jtc category <#category | ID | name>\`\n> To reset to auto: \`r!jtc category auto\`` });
      }
      if (query.toLowerCase() === 'auto' || query.toLowerCase() === 'reset' || query.toLowerCase() === 'none') {
        saveConfig({ categoryId: null });
        config.categoryId = null;
        return message.reply({ content: '<:ticks:1532620580266836148> JTC spawn category reset to **Auto-Detect** (inherits trigger channel\'s category).' });
      }
      const rawId = query.replace(/[<#>]/g, '').trim();
      let foundCat: any = null;
      if (/^\d{17,20}$/.test(rawId)) {
        foundCat = message.guild.channels.cache.get(rawId);
      }
      if (!foundCat) {
        foundCat = message.guild.channels.cache.find((c: any) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === query.toLowerCase());
      }
      if (!foundCat) {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/gi, '');
        const qNorm = norm(query);
        if (qNorm) {
          foundCat = message.guild.channels.cache.find((c: any) => c.type === ChannelType.GuildCategory && norm(c.name).includes(qNorm));
        }
      }
      if (!foundCat || foundCat.type !== ChannelType.GuildCategory) {
        return message.reply({ content: `${WRONG_ICON} Could not find a valid category matching "` + query + `". Please mention it or provide its ID.` });
      }
      saveConfig({ categoryId: foundCat.id });
      config.categoryId = foundCat.id;
      return message.reply({ content: '<:ticks:1532620580266836148> Set JTC temporary channel category to **' + foundCat.name + '** (`' + foundCat.id + '`).' });
    }

    // Subcommand: toggle
    if (sub === 'toggle' || sub === 'enable' || sub === 'disable') {
      if (!isOwner) {
        return message.reply({ content: `${WRONG_ICON} **Access Denied**: Only the **Server Owner** and designated **Extra Owners** can toggle JTC.` });
      }
      const newState = sub === 'enable' ? true : (sub === 'disable' ? false : !(config.enabled !== false));
      saveConfig({ enabled: newState });
      config.enabled = newState;
      extra?.logSyncEvent?.(message.guild.id, `[JTC] Master status toggled to ${newState ? 'ENABLED' : 'DISABLED'}.`, newState ? 'success' : 'warn');
      const gui = buildJTCAdminDashboardGUI(message.guild, config);
      return respondJtcGui(message, gui);
    }

    // Subcommand: lock/unlock
    if (sub === 'lock' || sub === 'unlock') {
      if (!currentVoice || !activeData) {
        return message.reply({ content: `${WRONG_ICON} You must be inside your active temporary voice room to use this.` });
      }
      const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
      if (activeData.ownerId !== message.author.id && !isAdmin) {
        return message.reply({ content: `${WRONG_ICON} Only the channel owner can lock/unlock this room.` });
      }
      const everyoneRole = message.guild.roles.everyone;
      const willLock = sub === 'lock';
      await currentVoice.permissionOverwrites.edit(everyoneRole, { Connect: willLock ? false : null }).catch(() => { });
      const gui = buildJTCVoiceControllerGUI(currentVoice, activeData);
      return respondJtcGui(message, gui);
    }

    // Subcommand: hide/unhide
    if (sub === 'hide' || sub === 'unhide') {
      if (!currentVoice || !activeData) {
        return message.reply({ content: `${WRONG_ICON} You must be inside your active temporary voice room to use this.` });
      }
      const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
      if (activeData.ownerId !== message.author.id && !isAdmin) {
        return message.reply({ content: `${WRONG_ICON} Only the channel owner can hide/unhide this room.` });
      }
      const everyoneRole = message.guild.roles.everyone;
      const willHide = sub === 'hide';
      await currentVoice.permissionOverwrites.edit(everyoneRole, { ViewChannel: willHide ? false : null }).catch(() => { });
      const gui = buildJTCVoiceControllerGUI(currentVoice, activeData);
      return respondJtcGui(message, gui);
    }

    // Subcommand: rename
    if (sub === 'rename' || sub === 'name') {
      if (!currentVoice || !activeData) {
        return message.reply({ content: `${WRONG_ICON} You must be inside your active temporary voice room to use this.` });
      }
      const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
      if (activeData.ownerId !== message.author.id && !isAdmin) {
        return message.reply({ content: `${WRONG_ICON} Only the channel owner can rename this room.` });
      }
      const newName = args.slice(1).join(' ').trim();
      if (!newName) {
        return message.reply({ content: `${WRONG_ICON} Please specify the new room name: \`r!jtc rename Squad-Alpha\`` });
      }
      await currentVoice.setName(newName).catch(() => { });
      activeData.name = newName;
      saveConfig({ activeChannels });
      const gui = buildJTCVoiceControllerGUI(currentVoice, activeData);
      return respondJtcGui(message, gui);
    }

    // Subcommand: limit
    if (sub === 'limit') {
      if (!currentVoice || !activeData) {
        return message.reply({ content: `${WRONG_ICON} You must be inside your active temporary voice room to use this.` });
      }
      const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
      if (activeData.ownerId !== message.author.id && !isAdmin) {
        return message.reply({ content: `${WRONG_ICON} Only the channel owner can set user limits.` });
      }
      const limitNum = parseInt(args[1], 10);
      if (isNaN(limitNum) || limitNum < 0 || limitNum > 99) {
        return message.reply({ content: `${WRONG_ICON} Please specify a valid limit between 0 (unlimited) and 99: \`r!jtc limit 5\`` });
      }
      await currentVoice.setUserLimit(limitNum).catch(() => { });
      const gui = buildJTCVoiceControllerGUI(currentVoice, activeData);
      return respondJtcGui(message, gui);
    }

    // Subcommand: claim
    if (sub === 'claim') {
      if (!currentVoice || !activeData) {
        return message.reply({ content: `${WRONG_ICON} You must be inside a JTC voice room to claim ownership.` });
      }
      const ownerInVc = currentVoice.members.has(activeData.ownerId);
      if (ownerInVc && activeData.ownerId !== message.author.id) {
        return message.reply({ content: `${WRONG_ICON} The current room owner is still connected to the voice room.` });
      }
      activeData.ownerId = message.author.id;
      activeData.ownerTag = message.author.username;
      saveConfig({ activeChannels });
      await currentVoice.permissionOverwrites.edit(message.author.id, {
        ManageChannels: true,
        Connect: true,
        ViewChannel: true,
        Speak: true
      }).catch(() => { });
      const gui = buildJTCVoiceControllerGUI(currentVoice, activeData);
      return respondJtcGui(message, gui);
    }

    // Default GUI rendering:
    // If inside an active voice room: render Voice Room Controller Box UI
    if (currentVoice && activeData) {
      const gui = buildJTCVoiceControllerGUI(currentVoice, activeData);
      return respondJtcGui(message, gui);
    }

    // Otherwise: render JTC Admin Dashboard Hub Box UI
    const gui = buildJTCAdminDashboardGUI(message.guild, config);
    return respondJtcGui(message, gui);
  }
});
