import { Message, PermissionFlagsBits } from 'discord.js';
import { PrefixCommandMeta } from './PrefixRegistry.js';

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  missingUserPermissions?: string[];
  missingBotPermissions?: string[];
}

export class PrefixPermissionManager {
  public static isDeveloper(userId: string, message: Message): boolean {
    if (process.env.OWNER_ID && userId === process.env.OWNER_ID) return true;
    const ownerId = message.client.application?.owner?.id;
    if (ownerId && userId === ownerId) return true;
    const teamMembers = (message.client.application?.owner as any)?.members;
    if (teamMembers && teamMembers.has && teamMembers.has(userId)) return true;
    if (message.guild && message.guild.ownerId === userId) return true;
    return false;
  }

  public static checkPermissions(message: Message, commandMeta: PrefixCommandMeta, moduleState?: any): PermissionCheckResult {
    // 1. Owner & Developer bypass
    if (this.isDeveloper(message.author.id, message)) {
      return { allowed: true };
    }

    // 3. Check Required User Permissions
    if (commandMeta.userPermissions && commandMeta.userPermissions.length > 0 && message.member) {
      if (message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return { allowed: true };
      }

      const missing: string[] = [];
      for (const permName of commandMeta.userPermissions) {
        const flagKey = this.permissionNameToFlag(permName);
        if (flagKey && !message.member.permissions.has(flagKey)) {
          missing.push(permName);
        }
      }

      if (missing.length > 0) {
        return {
          allowed: false,
          reason: `You require the following permission(s) to use this command: **${missing.join(', ')}**`,
          missingUserPermissions: missing
        };
      }
    }

    // 4. Check Required Bot Permissions
    if (message.guild?.members.me) {
      const botMember = message.guild.members.me;
      const missingBot: string[] = [];
      const botRequired = commandMeta.botPermissions || ['SendMessages', 'EmbedLinks'];

      const channel = message.channel;
      const channelPerms = (channel as any).permissionsFor 
        ? (channel as any).permissionsFor(botMember) 
        : null;

      for (const permName of botRequired) {
        const flagKey = this.permissionNameToFlag(permName);
        if (flagKey) {
          const hasPerm = channelPerms ? channelPerms.has(flagKey) : botMember.permissions.has(flagKey);
          if (!hasPerm) {
            missingBot.push(permName);
          }
        }
      }

      if (missingBot.length > 0) {
        return {
          allowed: false,
          reason: `I am missing the following required permission(s) in this channel: **${missingBot.join(', ')}**`,
          missingBotPermissions: missingBot
        };
      }
    }

    return { allowed: true };
  }

  private static permissionNameToFlag(name: string): bigint | null {
    const map: Record<string, bigint> = {
      'Administrator': PermissionFlagsBits.Administrator,
      'Ban Members': PermissionFlagsBits.BanMembers,
      'Kick Members': PermissionFlagsBits.KickMembers,
      'Moderate Members': PermissionFlagsBits.ModerateMembers,
      'Manage Messages': PermissionFlagsBits.ManageMessages,
      'Manage Channels': PermissionFlagsBits.ManageChannels,
      'Manage Roles': PermissionFlagsBits.ManageRoles,
      'SendMessages': PermissionFlagsBits.SendMessages,
      'EmbedLinks': PermissionFlagsBits.EmbedLinks,
      'ManageGuild': PermissionFlagsBits.ManageGuild
    };
    return map[name] || null;
  }
}
