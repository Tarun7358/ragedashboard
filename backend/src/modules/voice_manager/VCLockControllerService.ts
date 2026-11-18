import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  Guild,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
  UserSelectMenuBuilder,
  VoiceBasedChannel,
} from 'discord.js';
import { isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';

export interface VCLockSession {
  channelId: string;
  guildId: string;
  ownerId: string;
  lockedAt: number;
  addedUserIds: string[]; // max 15 members
  chatPermittedUserIds: string[]; // members with explicit SendMessages
  panelMessageId?: string;
}

// In-memory active lock sessions (channelId -> session)
const activeLockSessions = new Map<string, VCLockSession>();

export class VCLockControllerService {
  public static getSession(channelId: string): VCLockSession | undefined {
    return activeLockSessions.get(channelId);
  }

  public static async getOrRecoverSession(
    channel: VoiceBasedChannel,
    executorId?: string
  ): Promise<VCLockSession | null> {
    let session = activeLockSessions.get(channel.id);
    if (session) return session;

    // Check if channel is actually locked in Discord (@everyone denied Connect)
    const everyoneOverwrite = channel.permissionOverwrites.cache.get(channel.guild.id);
    const isLocked = everyoneOverwrite?.deny?.has(PermissionFlagsBits.Connect);
    if (!isLocked) return null;

    // Reconstruct session from live Discord channel permission overwrites
    const addedUserIds: string[] = [];
    const chatPermittedUserIds: string[] = [];
    let detectedOwnerId = executorId || channel.guild.ownerId;

    for (const [id, overwrite] of channel.permissionOverwrites.cache) {
      if (id === channel.guild.id || id === channel.client.user?.id) continue;
      if (overwrite.type === 1) { // 1 = Member overwrite in Discord.js
        if (overwrite.allow.has(PermissionFlagsBits.Connect)) {
          addedUserIds.push(id);
          if (!detectedOwnerId || detectedOwnerId === channel.guild.ownerId) {
            detectedOwnerId = id;
          }
        }
        if (overwrite.allow.has(PermissionFlagsBits.SendMessages)) {
          chatPermittedUserIds.push(id);
        }
      }
    }

    const recovered: VCLockSession = {
      channelId: channel.id,
      guildId: channel.guild.id,
      ownerId: detectedOwnerId,
      lockedAt: Date.now(),
      addedUserIds,
      chatPermittedUserIds
    };
    activeLockSessions.set(channel.id, recovered);
    return recovered;
  }

  public static setSession(channelId: string, session: VCLockSession): void {
    activeLockSessions.set(channelId, session);
  }

  public static deleteSession(channelId: string): boolean {
    return activeLockSessions.delete(channelId);
  }

  public static async isAuthorized(
    member: GuildMember | null,
    guild: Guild,
    session: VCLockSession
  ): Promise<boolean> {
    if (!member) return false;
    if (member.id === session.ownerId) return true;
    if (member.id === guild.ownerId) return true;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    const isExtra = await isOwnerOrExtraOwner(member.id, guild).catch(() => false);
    return isExtra;
  }

  /**
   * Builds the Box UI Controller message payload for locked voice channels.
   */
  public static buildLockControllerPayload(opts: {
    channel: VoiceBasedChannel;
    session: VCLockSession;
    guild: Guild;
    botAvatarUrl: string;
  }) {
    const { channel, session, guild, botAvatarUrl } = opts;
    const addedCount = session.addedUserIds.length;
    const chatCount = session.chatPermittedUserIds.length;
    const humanCount = channel.members?.filter
      ? channel.members.filter((m: any) => !m.user?.bot).size
      : (channel.members?.size ?? 1);

    const addedDisplay =
      session.addedUserIds.length > 0
        ? session.addedUserIds.slice(0, 5).map((id) => `<@${id}>`).join(', ') +
          (session.addedUserIds.length > 5 ? ` *(+${session.addedUserIds.length - 5} more)*` : '')
        : '*None added*';

    const body = [
      `### **Voice Controller — Locked Room**`,
      ``,
      `> **Voice Channel**: <#${channel.id}> (\`#${channel.name}\`)`,
      `> **Room Owner**: <@${session.ownerId}>`,
      `> **Active Connected**: \`${humanCount} member(s)\``,
      `> **Allowed Access**: \`${addedCount}/15 members\` (${addedDisplay})`,
      `> **Chat Permitted**: \`${chatCount} members\``,
      ``,
      `*Only <@${session.ownerId}>, Extra Owners, and Server Owner can operate these controls.*`,
    ].join('\n');

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(botAvatarUrl));

    // Row 1: Primary actions (Unlock, Chat Access To All, Remove All Chat)
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`vclock_btn_unlock:${channel.id}`)
        .setLabel('Unlock VC')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`vclock_btn_chat_all:${channel.id}`)
        .setLabel('Grant Chat to All')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`vclock_btn_chat_none:${channel.id}`)
        .setLabel('Remove Extra Chat')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`vclock_btn_refresh:${channel.id}`)
        .setLabel('Refresh GUI')
        .setStyle(ButtonStyle.Secondary)
    );

    // Row 2: Member Management Select Menus (UserSelectMenu)
    const row2 = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`vclock_select_add:${channel.id}`)
        .setPlaceholder('Add Member (Allow Connect + Chat)')
        .setMaxValues(1)
    );

    const row3 = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`vclock_select_remove:${channel.id}`)
        .setPlaceholder('Remove Member (Revoke Access)')
        .setMaxValues(1)
    );

    const container = new ContainerBuilder()
      .addSectionComponents(section)
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      )
      .addActionRowComponents(row1)
      .addActionRowComponents(row2)
      .addActionRowComponents(row3)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# Rage Optimiser Enterprise • Zero-Trust Voice Sentinel`
        )
      );

    return {
      flags: MessageFlags.IsComponentsV2,
      components: [container],
    };
  }

  /**
   * Safely clears all added member permission overwrites on unlock
   */
  public static async cleanupSessionOverwrites(
    channel: VoiceBasedChannel,
    session: VCLockSession
  ): Promise<void> {
    const allUserIds = Array.from(
      new Set([...session.addedUserIds, ...session.chatPermittedUserIds, session.ownerId])
    );
    for (const uid of allUserIds) {
      await channel.permissionOverwrites.delete(uid).catch(() => {});
    }
  }
}
