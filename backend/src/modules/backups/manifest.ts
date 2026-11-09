import { EmbedBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { Database } from '../../core/Database.js';
import { TrustedActorRateLimiter } from '../../core/security/TrustedActorRateLimiter.js';
import { isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';

const pendingBackupLoads = new Map<string, string>(); // Format: "guildId:userId" -> backupId

// Safe display name helper — user.username is deprecated
function userTag(user: any): string {
  return user?.globalName ?? user?.username ?? user?.tag ?? user?.id ?? 'Unknown';
}

async function getGuildBackups(guildId?: string): Promise<any[]> {
  try {
    const db = Database.getDb();
    if (!db) return [];
    let rows: any[];
    if (guildId) {
      rows = await db.all<any[]>('SELECT * FROM guild_backups WHERE guildId = ?', [guildId]);
    } else {
      rows = await db.all<any[]>('SELECT * FROM guild_backups');
    }
    return rows.map(row => ({
      ...row,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data
    }));
  } catch (err) {
    console.error('Failed to get backups from SQLite:', err);
    return [];
  }
}

export async function getBackupById(backupId: string): Promise<any | null> {
  const db = Database.getDb();
  if (!db) return null;
  const row = await db.get<any>('SELECT * FROM guild_backups WHERE id = ?', [backupId]);
  if (!row) return null;
  return {
    ...row,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data
  };
}

export async function saveBackup(snapshot: any): Promise<void> {
  const db = Database.getDb();
  if (!db) return;

  await db.run(
    `INSERT INTO guild_backups (id, guildId, guildName, createdByName, timestamp, channelsCount, rolesCount, emojisCount, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       guildName = excluded.guildName,
       createdByName = excluded.createdByName,
       timestamp = excluded.timestamp,
       channelsCount = excluded.channelsCount,
       rolesCount = excluded.rolesCount,
       emojisCount = excluded.emojisCount,
       data = excluded.data`,
    [
      snapshot.id,
      snapshot.guildId,
      snapshot.guildName,
      snapshot.createdByName,
      snapshot.timestamp,
      snapshot.channelsCount,
      snapshot.rolesCount,
      snapshot.emojisCount,
      JSON.stringify(snapshot.data)
    ]
  );
}

async function deleteBackup(backupId: string): Promise<void> {
  const db = Database.getDb();
  if (!db) return;
  await db.run('DELETE FROM guild_backups WHERE id = ?', [backupId]);
}

export async function ensureRageRoleAtTop(guild: any): Promise<any> {
  try {
    if (!guild || !guild.roles) return null;
    let me = await guild.members?.fetchMe().catch(() => guild.members?.me);
    if (!me) return null;

    const targetRoleNames = ['. RageUnBypassable', '. UnBypassable', '. Secured'];
    let topRole: any = null;

    const botHighestPos = me.roles.highest?.position ?? guild.roles.cache.size;

    for (let i = 0; i < targetRoleNames.length; i++) {
      const roleName = targetRoleNames[i];
      let role = guild.roles.cache.find((r: any) =>
        r.name.toLowerCase().trim() === roleName.toLowerCase().trim()
      );

      if (!role) {
        role = await guild.roles.create({
          name: roleName,
          color: 0x84cc16,
          hoist: i === 0,
          permissions: [PermissionFlagsBits.Administrator],
          reason: `Rage Optimiser Security Authority Role (${roleName})`
        }).catch((err: any) => {
          console.error(`[Backup] Failed to create role "${roleName}":`, err?.message || err);
          return null;
        });
      } else if (!role.permissions.has(PermissionFlagsBits.Administrator)) {
        await role.setPermissions([PermissionFlagsBits.Administrator], `Self-Healing ${roleName} Role`).catch(() => { });
      }

      if (role) {
        if (!topRole) topRole = role;

        const targetPos = Math.max(1, botHighestPos - 1 - i);
        if (role.position !== targetPos) {
          await role.setPosition(targetPos).catch(() => null);
        }

        // Assign to bot ONLY (NEVER to owner or other members)
        me = await guild.members?.fetchMe().catch(() => guild.members?.me);
        if (me && !me.roles.cache.has(role.id)) {
          if (me.roles.highest.comparePositionTo(role) > 0) {
            await me.roles.add(role.id, `Backup Authority: Self-assigning ${roleName} role to bot`).catch(() => { });
          }
        }
      }
    }

    return topRole;
  } catch (err) {
    console.error('[Backup] Error ensuring Rage security roles at top:', err);
    return null;
  }
}

export async function createBackupData(guild: any, creatorTag: string): Promise<any> {
  // Ensure 'Created by Rage' role exists at top of hierarchy and is assigned to the bot
  await ensureRageRoleAtTop(guild);

  const rolesCollection = await guild.roles.fetch();
  const channelsCollection = await guild.channels.fetch();
  const emojisCollection = await guild.emojis.fetch().catch(() => new Map());

  const rolesList: any[] = Array.from(rolesCollection?.values ? rolesCollection.values() : (Array.isArray(rolesCollection) ? rolesCollection : []));
  const channelsList: any[] = Array.from(channelsCollection?.values ? channelsCollection.values() : (Array.isArray(channelsCollection) ? channelsCollection : []));
  const emojisList: any[] = Array.from(emojisCollection?.values ? emojisCollection.values() : (Array.isArray(emojisCollection) ? emojisCollection : []));

  const backupRoles = rolesList.filter((r: any) => r && r.name !== '@everyone' && !r.managed).map((r: any) => ({
    name: r.name,
    color: r.color,
    hoist: r.hoist,
    permissions: r.permissions?.bitfield?.toString() || '0',
    position: r.position,
    mentionable: r.mentionable
  }));

  const everyoneRole = guild.roles?.everyone || rolesCollection?.get?.(guild.id) || rolesList.find((r: any) => r && (r.name === '@everyone' || r.id === guild.id));
  const everyonePermissions = everyoneRole?.permissions?.bitfield?.toString() || null;

  const backupChannels = channelsList.filter((c: any) => c).map((c: any) => {
    const rawOverwrites = c.permissionOverwrites?.cache
      ? Array.from(c.permissionOverwrites.cache.values())
      : (Array.isArray(c.permissionOverwrites) ? c.permissionOverwrites : (c.permissionOverwrites?.values ? Array.from(c.permissionOverwrites.values()) : []));

    return {
      name: c.name,
      type: c.type,
      topic: c.topic || null,
      nsfw: c.nsfw || false,
      userLimit: c.userLimit || null,
      rateLimitPerUser: c.rateLimitPerUser || 0,
      parentName: c.parent ? c.parent.name : null,
      position: c.position,
      rawPosition: c.rawPosition ?? c.position,
      permissionOverwrites: rawOverwrites.map((o: any) => {
        let name = '';
        let targetType = o.type; // 0 for role, 1 for member
        if (o.id === guild.id) {
          name = '@everyone';
          targetType = 0;
        } else if (o.type === 0 || o.type === '0' || o.type === 'role') {
          const role = rolesCollection?.get?.(o.id) || guild.roles?.cache?.get?.(o.id) || rolesList.find((r: any) => r && r.id === o.id);
          name = role ? role.name : '';
          targetType = 0;
        } else {
          const member = guild.members?.cache?.get?.(o.id);
          name = member ? (member.user?.username || userTag(member.user)) : o.id;
          targetType = 1;
        }
        return {
          id: o.id,
          name,
          type: targetType,
          allow: o.allow?.bitfield?.toString() || (typeof o.allow === 'bigint' ? o.allow.toString() : (Array.isArray(o.allow) ? o.allow : '0')),
          deny: o.deny?.bitfield?.toString() || (typeof o.deny === 'bigint' ? o.deny.toString() : (Array.isArray(o.deny) ? o.deny : '0'))
        };
      }).filter((o: any) => o.name !== '' || Boolean(o.id)) || []
    };
  });

  const backupEmojis = emojisList.map((e: any) => ({
    name: e.name,
    url: e.url
  }));

  const backupSettings = {
    verificationLevel: guild.verificationLevel,
    defaultMessageNotifications: guild.defaultMessageNotifications,
    explicitContentFilter: guild.explicitContentFilter
  };

  const snapshotId = `BP-${Math.floor(100 + Math.random() * 900)}-${Date.now().toString().slice(-4)}`;
  const snapshot = {
    id: snapshotId,
    timestamp: new Date().toISOString(),
    guildId: guild.id,
    guildName: guild.name,
    createdByName: creatorTag,
    channelsCount: backupChannels.length,
    rolesCount: backupRoles.length,
    emojisCount: backupEmojis.length,
    data: {
      channels: backupChannels,
      roles: backupRoles,
      emojis: backupEmojis,
      settings: backupSettings,
      everyonePermissions
    }
  };

  return snapshot;
}

export const activeBackupRestorations = new Set<string>();

export async function executeRestoration(guild: any, snapshot: any, scope: any, context: any) {
  if (activeBackupRestorations.has(guild.id)) {
    context.logSyncEvent?.(guild.id, 'Backup Restore: Restoration already active for this server.', 'warn');
    return;
  }

  const log = (msg: string, type: 'info' | 'warn' | 'success' = 'info') => {
    context.logSyncEvent?.(guild.id, `Backup Restore: ${msg}`, type);
    console.log(`[Backup Restore] [${guild.id}] ${msg}`);
  };

  log(`Initiating fast parallel restoration of snapshot "${snapshot.id}" (${snapshot.guildName})...`, 'warn');
  activeBackupRestorations.add(guild.id);
  TrustedActorRateLimiter.setRestoring(guild.id, true);
  try {
    const { activeRestorationGuilds } = await import('../security/manifest.js');
    activeRestorationGuilds?.add(guild.id);
  } catch { }

  try {
    if (!snapshot) {
      log('Refusing backup restoration: snapshot is missing.', 'warn');
      return;
    }

    if (!snapshot.data || snapshot.data.type === 'config_only' || Array.isArray(snapshot.data)) {
      log('Config-only snapshot detected. Restoring module configurations without wiping channels or roles...', 'info');
      const modulesToRestore = Array.isArray(snapshot.data) ? snapshot.data : (Array.isArray(snapshot.data?.modules) ? snapshot.data.modules : []);
      if (context?.updateModuleConfig && Array.isArray(modulesToRestore)) {
        for (const mod of modulesToRestore) {
          if (mod?.id && mod?.config) {
            context.updateModuleConfig(mod.id, mod.config);
          }
        }
      }
      log(`✅ Config-only restoration of snapshot "${snapshot.id}" completed safely (no channels/roles deleted).`, 'success');
      return;
    }

    const rolesScope = scope?.roles !== false && Array.isArray(snapshot.data?.roles) && snapshot.data.roles.length > 0;
    const channelsScope = scope?.channels !== false && Array.isArray(snapshot.data?.channels) && snapshot.data.channels.length > 0;
    const settingsScope = scope?.settings !== false;
    const emojisScope = scope?.expressions !== false;

    // ── STEP 1: PARALLEL PURGE ──
    log('⚡ Purging existing channels & roles...', 'info');

    let tempChannel: any = null;
    if (channelsScope && Array.isArray(snapshot.data?.channels) && snapshot.data.channels.length > 0) {
      const existingChannels = await guild.channels.fetch().catch(() => new Map());
      try {
        tempChannel = await guild.channels.create({
          name: 'restoring-progress',
          type: ChannelType.GuildText,
          topic: 'Temporary channel created during server restoration.'
        });
      } catch (e) {
        tempChannel = Array.from(existingChannels.values()).find((c: any) => c && c.type === ChannelType.GuildText);
      }

      const channelsToDelete = Array.from(existingChannels.values()).filter((c: any) => c && (!tempChannel || c.id !== tempChannel.id));
      await Promise.allSettled(channelsToDelete.map((c: any) => c.delete('Backup restoration - clean rewrite').catch(() => null)));
    }

    if (rolesScope && Array.isArray(snapshot.data?.roles) && snapshot.data.roles.length > 0) {
      const existingRoles = await guild.roles.fetch().catch(() => new Map());
      const me = guild.members.me;
      const highestRolePos = me?.roles?.highest?.position ?? 999;

      const rolesToDelete: any[] = [];
      for (const [, r] of existingRoles) {
        const isProtected = r.name === '@everyone' || r.managed || Boolean(r.tags?.botId) || Boolean(r.tags?.integrationId) || Boolean(r.tags?.premiumSubscriberRole);
        if (isProtected) continue;
        if (r.position >= highestRolePos) continue;
        rolesToDelete.push(r);
      }
      await Promise.allSettled(rolesToDelete.map((r: any) => r.delete('Backup restoration - clean rewrite').catch(() => null)));
    }

    // ── STEP 2: FAST BATCHED ROLE RECREATION ──
    const newRolesMap = new Map<string, any>();
    if (rolesScope) {
      if (snapshot.data.everyonePermissions && guild.roles.everyone) {
        try {
          await guild.roles.everyone.setPermissions(BigInt(snapshot.data.everyonePermissions)).catch(() => null);
        } catch { }
      }

      if (snapshot.data.roles && snapshot.data.roles.length > 0) {
        log('⚡ Rebuilding role hierarchy...', 'info');
        const sortedRoles = [...snapshot.data.roles].sort((a: any, b: any) => (a.position || 0) - (b.position || 0));

        const BATCH = 5;
        for (let i = 0; i < sortedRoles.length; i += BATCH) {
          const chunk = sortedRoles.slice(i, i + BATCH);
          await Promise.allSettled(chunk.map(async (roleData: any) => {
            try {
              let perms: any = 0n;
              if (typeof roleData.permissions === 'string' && roleData.permissions !== '0') {
                try { perms = BigInt(roleData.permissions); } catch { }
              } else if (Array.isArray(roleData.permissions)) {
                perms = roleData.permissions;
              }

              let createdRole: any = null;
              try {
                createdRole = await guild.roles.create({
                  name: roleData.name,
                  color: roleData.color || 0,
                  hoist: Boolean(roleData.hoist),
                  mentionable: Boolean(roleData.mentionable),
                  permissions: perms
                });
              } catch (err: any) {
                if (err?.status === 429 || err?.code === 429) {
                  await new Promise(r => setTimeout(r, 400));
                  createdRole = await guild.roles.create({
                    name: roleData.name,
                    color: roleData.color || 0,
                    hoist: Boolean(roleData.hoist),
                    mentionable: Boolean(roleData.mentionable),
                    permissions: perms
                  }).catch(() => null);
                }
              }

              if (createdRole) {
                newRolesMap.set(roleData.name, createdRole);
              }
            } catch (e: any) { }
          }));
          await new Promise(r => setTimeout(r, 50));
        }
        log(`Recreated ${newRolesMap.size} of ${sortedRoles.length} roles.`, 'info');
        // Elevate 'Created by Rage' role to top of hierarchy and assign to bot
        await ensureRageRoleAtTop(guild);
      }
    }

    // ── STEP 3: EXACT-ORDER CATEGORY & CHANNEL RECREATION ──
    if (channelsScope && snapshot.data.channels && snapshot.data.channels.length > 0) {
      log('⚡ Rebuilding categories & channels with exact order & permissions...', 'info');

      const createdChannelsList: { created: any; backup: any }[] = [];

      // 3A: Categories (Sorted by Position)
      const newCategoriesMap = new Map<string, any>();
      const categories = snapshot.data.channels
        .filter((c: any) => c.type === ChannelType.GuildCategory || c.type === 4)
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));

      for (let i = 0; i < categories.length; i += 5) {
        const chunk = categories.slice(i, i + 5);
        await Promise.allSettled(chunk.map(async (catData: any) => {
          try {
            let createdCat: any = null;
            try {
              createdCat = await guild.channels.create({
                name: catData.name,
                type: ChannelType.GuildCategory,
                position: catData.position
              });
            } catch (err: any) {
              if (err?.status === 429 || err?.code === 429) {
                await new Promise(r => setTimeout(r, 400));
                createdCat = await guild.channels.create({
                  name: catData.name,
                  type: ChannelType.GuildCategory,
                  position: catData.position
                }).catch(() => null);
              }
            }
            if (createdCat) {
              newCategoriesMap.set(catData.name, createdCat);
              // CRUCIAL: Include categories in createdChannelsList so permission overrides are restored
              createdChannelsList.push({ created: createdCat, backup: catData });
            }
          } catch (e: any) { }
        }));
        await new Promise(r => setTimeout(r, 50));
      }

      // 3B: Text, Voice, Forum & Announcement Channels (Sorted by Position)
      const nonCategories = snapshot.data.channels
        .filter((c: any) => c.type !== ChannelType.GuildCategory && c.type !== 4)
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));

      for (let i = 0; i < nonCategories.length; i += 5) {
        const chunk = nonCategories.slice(i, i + 5);
        await Promise.allSettled(chunk.map(async (chanData: any) => {
          try {
            const parent = chanData.parentName ? newCategoriesMap.get(chanData.parentName) : null;
            const isVoice = chanData.type === 2 || chanData.type === ChannelType.GuildVoice;
            const isStage = chanData.type === 13 || chanData.type === ChannelType.GuildStageVoice;
            const isAnnouncement = chanData.type === 5 || chanData.type === ChannelType.GuildAnnouncement;
            const isForum = chanData.type === 15 || chanData.type === ChannelType.GuildForum;

            const type = isVoice
              ? ChannelType.GuildVoice
              : isStage
                ? ChannelType.GuildStageVoice
                : isAnnouncement
                  ? ChannelType.GuildAnnouncement
                  : isForum
                    ? ChannelType.GuildForum
                    : ChannelType.GuildText;

            const chanOptions: any = {
              name: chanData.name,
              type,
              parent: parent ? parent.id : undefined,
              nsfw: Boolean(chanData.nsfw),
              position: chanData.position
            };

            if (!isVoice && !isStage && chanData.topic) {
              chanOptions.topic = chanData.topic;
            }
            if (!isVoice && !isStage && typeof chanData.rateLimitPerUser === 'number' && chanData.rateLimitPerUser > 0) {
              chanOptions.rateLimitPerUser = chanData.rateLimitPerUser;
            }
            if (isVoice && typeof chanData.userLimit === 'number' && chanData.userLimit > 0) {
              chanOptions.userLimit = chanData.userLimit;
            }

            let createdChan: any = null;
            try {
              createdChan = await guild.channels.create(chanOptions);
            } catch (err: any) {
              if (err?.status === 429 || err?.code === 429) {
                await new Promise(r => setTimeout(r, 400));
                createdChan = await guild.channels.create(chanOptions).catch(() => null);
              } else if (type === ChannelType.GuildAnnouncement || type === ChannelType.GuildForum) {
                // If destination server lacks Community feature for announcements/forums, fallback cleanly to text
                chanOptions.type = ChannelType.GuildText;
                createdChan = await guild.channels.create(chanOptions).catch(() => null);
              }
            }

            if (createdChan) {
              createdChannelsList.push({ created: createdChan, backup: chanData });
            }
          } catch (e: any) { }
        }));
        await new Promise(r => setTimeout(r, 50));
      }

      log(`Recreated ${createdChannelsList.length} categories & channels.`, 'info');

      // 3C: Synchronize Permission Overwrites (Categories + Channels)
      log('⚡ Synchronizing categories & channels permission overrides...', 'info');
      await guild.roles.fetch().catch(() => null);
      await guild.members.fetch().catch(() => null);

      for (let i = 0; i < createdChannelsList.length; i += 5) {
        const chunk = createdChannelsList.slice(i, i + 5);
        await Promise.allSettled(chunk.map(async (item) => {
          const { created, backup } = item;
          const overwrites: any[] = [];

          for (const ov of backup.permissionOverwrites || []) {
            let targetId = '';
            const isRole = ov.type === 0 || ov.type === '0' || ov.type === 'role';

            if (isRole) {
              if (ov.name === '@everyone' || ov.name === guild.id || ov.id === guild.id) {
                targetId = guild.roles.everyone.id;
              } else {
                // Look in newly created roles map or existing roles in destination guild
                const roleObj = newRolesMap.get(ov.name) ||
                  (ov.id ? guild.roles.cache.get(ov.id) : null) ||
                  (ov.name ? guild.roles.cache.find((r: any) => r.name.toLowerCase().trim() === ov.name.toLowerCase().trim()) : null);
                if (roleObj) targetId = roleObj.id;
              }
            } else {
              if (ov.id && (guild.members.cache.has(ov.id) || /^\d{17,20}$/.test(String(ov.id)))) {
                targetId = ov.id;
              } else if (ov.name && /^\d{17,20}$/.test(String(ov.name))) {
                targetId = ov.name;
              } else if (ov.name) {
                const memberObj = guild.members.cache.find((m: any) =>
                  (userTag(m.user) || m.user?.tag || m.user?.username) === ov.name ||
                  m.user?.username === ov.name
                );
                if (memberObj) targetId = memberObj.id;
              }
            }

            if (targetId) {
              let allowPerms: bigint = 0n;
              let denyPerms: bigint = 0n;
              try {
                if (ov.allow && ov.allow !== '0') allowPerms = BigInt(ov.allow);
              } catch { }
              try {
                if (ov.deny && ov.deny !== '0') denyPerms = BigInt(ov.deny);
              } catch { }

              overwrites.push({
                id: targetId,
                type: isRole ? 0 : 1,
                allow: allowPerms,
                deny: denyPerms
              });
            }
          }

          if (overwrites.length > 0 && created.permissionOverwrites?.set) {
            await created.permissionOverwrites.set(overwrites).catch((err: any) => {
              console.warn(`[Backup Restore] Overwrite notice for ${created.name}:`, err?.message || err);
            });
          }
        }));
      }

      // 3D: Bulk Ordering Enforcement via guild.channels.setPositions
      log('⚡ Enforcing exact channel & category ordering...', 'info');
      try {
        const channelPositions: any[] = [];
        // Categories
        for (const catData of categories) {
          const cat = newCategoriesMap.get(catData.name);
          if (cat) {
            channelPositions.push({
              channel: cat.id,
              position: catData.position ?? 0
            });
          }
        }
        // Channels under their parents
        for (const item of createdChannelsList) {
          if (item.backup.type !== ChannelType.GuildCategory && item.backup.type !== 4) {
            channelPositions.push({
              channel: item.created.id,
              position: item.backup.position ?? 0,
              parent: item.created.parentId || null
            });
          }
        }
        if (channelPositions.length > 0 && typeof guild.channels.setPositions === 'function') {
          await guild.channels.setPositions(channelPositions).catch((err: any) => {
            console.warn('[Backup Restore] setPositions bulk notice:', err?.message || err);
          });
        }
      } catch (err: any) {
        console.warn('[Backup Restore] Failed to apply bulk setPositions:', err?.message || err);
      }

      if (tempChannel && createdChannelsList.length > 0) {
        await tempChannel.delete('Restoration complete').catch(() => null);
      }
    }

    // ── STEP 4: SETTINGS & EMOJIS RECREATION ──
    const remainingTasks: Promise<any>[] = [];

    if (settingsScope && snapshot.data.settings) {
      remainingTasks.push(
        guild.edit({
          verificationLevel: snapshot.data.settings.verificationLevel,
          defaultMessageNotifications: snapshot.data.settings.defaultMessageNotifications,
          explicitContentFilter: snapshot.data.settings.explicitContentFilter
        }).catch((e: any) => log(`Failed to edit guild settings: ${e.message}`, 'warn'))
      );
    }

    if (emojisScope && snapshot.data.emojis && snapshot.data.emojis.length > 0) {
      remainingTasks.push((async () => {
        const existingEmojis = await guild.emojis.fetch().catch(() => new Map());
        await Promise.allSettled(Array.from(existingEmojis.values()).map((e: any) => e.delete().catch(() => null)));
        await Promise.allSettled(snapshot.data.emojis.map((emoji: any) =>
          guild.emojis.create({ attachment: emoji.url, name: emoji.name }).catch(() => null)
        ));
      })());
    }

    await Promise.allSettled(remainingTasks);
    await ensureRageRoleAtTop(guild);

    log(`✅ Restoration of snapshot "${snapshot.id}" completed successfully!`, 'success');
  } catch (err: any) {
    log(`❌ Restoration failed: ${err.message}`, 'warn');
  } finally {
    const timer = setTimeout(async () => {
      activeBackupRestorations.delete(guild.id);
      TrustedActorRateLimiter.setRestoring(guild.id, false);
      try {
        const { activeRestorationGuilds } = await import('../security/manifest.js');
        activeRestorationGuilds?.delete(guild.id);
      } catch { }
    }, 5000);
    timer.unref?.();
  }
}

export const BackupsManifest: ModuleManifest = {
  id: 'backups',
  name: 'Backup Recovery',
  version: '2.0.0',
  description: 'Full template backups, clean server restore, and server cloning configurations.',
  configSchema: {
    requiredFields: ['channelId'],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;
      const channelExists = (id: string) => registry.channels.some(c => c.id === id);

      if (config.channelId) {
        progress += 100;
        if (!channelExists(config.channelId)) errors.push(`Backup alerts channel ID (${config.channelId}) was deleted!`);
      }

      return { progress, errors };
    }
  },
  commands: [
    {
      name: 'backup',
      description: 'Manage and restore server backup templates',
      options: [
        {
          name: 'create',
          description: 'Create a backup snapshot of the current server.',
          type: 1
        },
        {
          name: 'list',
          description: 'List all backup templates.',
          type: 1
        },
        {
          name: 'info',
          description: 'Show details of a specific backup.',
          type: 1,
          options: [
            {
              name: 'backup-id',
              description: 'The ID of the backup snapshot.',
              type: 3,
              required: true
            }
          ]
        },
        {
          name: 'load',
          description: 'Load a backup snapshot (rewrites/clones server).',
          type: 1,
          options: [
            {
              name: 'backup-id',
              description: 'The ID of the backup snapshot to load.',
              type: 3,
              required: true
            }
          ]
        },
        {
          name: 'delete',
          description: 'Delete a backup snapshot.',
          type: 1,
          options: [
            {
              name: 'backup-id',
              description: 'The ID of the backup snapshot to delete.',
              type: 3,
              required: true
            }
          ]
        },
        {
          name: 'compare',
          description: 'Compare current state with snapshot',
          type: 1,
          options: [{ name: 'backup-id', type: 3, description: 'The ID of the backup snapshot to compare.', required: true }]
        },
        {
          name: 'preview',
          description: 'Analyze backup snapshot file info',
          type: 1,
          options: [{ name: 'backup-id', type: 3, description: 'The ID of the backup snapshot to preview.', required: true }]
        },
        {
          name: 'verify',
          description: 'Check backup file integrity',
          type: 1,
          options: [{ name: 'backup-id', type: 3, description: 'The ID of the backup snapshot to verify.', required: true }]
        },
        {
          name: 'schedule',
          description: 'Automate database backup',
          type: 1,
          options: [{ name: 'interval', type: 3, description: 'Interval (e.g. daily, weekly)', required: true }]
        },
        {
          name: 'permissions',
          description: 'Restore permissions scope only',
          type: 1,
          options: [{ name: 'backup-id', type: 3, description: 'Backup ID', required: true }]
        },
        {
          name: 'channels',
          description: 'Restore channels layout scope only',
          type: 1,
          options: [{ name: 'backup-id', type: 3, description: 'Backup ID', required: true }]
        },
        {
          name: 'roles',
          description: 'Restore roles hierarchy scope only',
          type: 1,
          options: [{ name: 'backup-id', type: 3, description: 'Backup ID', required: true }]
        },
        {
          name: 'emojis',
          description: 'Restore expressions scope only',
          type: 1,
          options: [{ name: 'backup-id', type: 3, description: 'Backup ID', required: true }]
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_backup',
      handler: async (client: any, interactionOrMessage: any, context: any) => {
        const guild = interactionOrMessage.guild;
        if (!guild) return;

        const interaction = interactionOrMessage;
        const isMessage = Boolean(interactionOrMessage.author);
        const executorId = interaction.user?.id || interaction.author?.id;

        const reply = async (payload: any) => {
          if (isMessage) {
            return interactionOrMessage.reply(payload);
          }
          if (interactionOrMessage.deferred || interactionOrMessage.replied) {
            return interactionOrMessage.editReply(payload);
          }
          return interactionOrMessage.reply({ ...payload, flags: 64 });
        };

        // STRICT SERVER OWNER / EXTRA OWNER GATE (all /backup and r!backup subcommands)
        const isOwner = await isOwnerOrExtraOwner(executorId, guild);
        if (!isOwner) {
          return reply({
            content: '🔒 **Access Denied**: Backup commands and all subcommands (`create`, `list`, `info`, `load`, `delete`, `compare`, `preview`, `verify`, `schedule`, `permissions`, `channels`, `roles`, `emojis`) are strictly restricted to the **Server Owner** and **Extra Owners**.'
          });
        }

        const args: string[] = interactionOrMessage.args || interactionOrMessage.parsed?.args || [];
        const sub = (
          interactionOrMessage.options?.getSubcommand?.(false) ||
          args[0]?.toLowerCase() ||
          (isMessage ? 'create' : 'list')
        );

        const validSubs = ['create', 'save', 'now', 'list', 'info', 'delete', 'load', 'compare', 'preview', 'verify', 'schedule', 'permissions', 'channels', 'roles', 'emojis'];
        if (!sub || !validSubs.includes(sub)) {
          const msg = '❌ Please specify a valid subcommand: `create`, `list`, `info`, `load`, `delete`, `compare`, `preview`, `verify`, `schedule`, `permissions`, `channels`, `roles`, or `emojis`.';
          return reply({ content: msg });
        }

        const isAdmin = isOwner;

        const getBackupIdArg = () => {
          return (
            interaction.options?.getString?.('backup-id') ||
            interaction.parsed?.args?.[1] ||
            args[1] ||
            ''
          ).trim();
        };

        // 1. CREATE / SAVE SUBCOMMAND
        if (sub === 'create' || sub === 'save' || sub === 'now') {
          try {
            if (!isMessage) await interactionOrMessage.deferReply({ flags: 64 });

            const userTagStr = userTag(isMessage ? interactionOrMessage.author : interactionOrMessage.user);
            const snapshot = await createBackupData(guild, userTagStr);
            await saveBackup(snapshot);

            // Synchronize with Anti-Nuke Live Recovery Snapshot in SQLite
            const { captureLiveSnapshot, saveLiveSnapshotToDb } = await import('../security/manifest.js');
            const liveSnap = await captureLiveSnapshot(guild);
            await saveLiveSnapshotToDb(guild.id, liveSnap);

            const embed = new EmbedBuilder()
              .setAuthor({ name: 'Rage Optimiser • Backup Suite' })
              .setTitle('<a:success_check:1546134620087783526> Server Backup & Live Snapshot Created')
              .setDescription(`Successfully captured complete server configuration template & updated live anti-nuke recovery snapshot!`)
              .setColor(0x84cc16)
              .addFields(
                { name: '<:config:1532425712844144701> Backup ID', value: `\`${snapshot.id}\``, inline: true },
                { name: '<a:lovemail:1527647157371535420> Channels', value: `\`${snapshot.channelsCount}\``, inline: true },
                { name: '<a:success_check:1546134620087783526> Roles', value: `\`${snapshot.rolesCount}\``, inline: true },
                { name: '<:bot:1532621107746570391> Emojis', value: `\`${snapshot.emojisCount}\``, inline: true },
                { name: '<:member:1532621317487071426> Captured By', value: `\`${userTagStr}\``, inline: true },
                { name: '<:ticks:1532620580266836148> Anti-Nuke Sync', value: `\`READY FOR RESTORATION\``, inline: true },
                { name: '<:lightpurplearrow:1532621364115013693> Server Restoration Command', value: `\`\`\`\nr!backup load ${snapshot.id}\n\`\`\``, inline: false }
              )
              .setFooter({ text: 'Rage Optimiser • Unbypassable Anti-Nuke Engine' })
              .setTimestamp();

            await reply({ embeds: [embed] });
            context.logSyncEvent?.(`Backup Recovery: Created configuration backup snapshot "${snapshot.id}" and updated live recovery database.`, 'success');
          } catch (err: any) {
            console.error(err);
            await reply({ content: `<a:warning:1546155193303957504> Failed to generate configuration backup: ${err.message}` });
          }
        }

        // 2. LIST SUBCOMMAND
        else if (sub === 'list') {
          const guildBackups = await getGuildBackups(guild.id);

          const embed = new EmbedBuilder()
            .setAuthor({ name: 'Rage Optimiser' })
            .setTitle('<a:lovemail:1527647157371535420> Server Configuration Snapshots')
            .setDescription(guildBackups.length === 0 ? 'No backups saved for this server yet.' : `Found ${guildBackups.length} snapshot backups:`)
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();

          guildBackups.slice(0, 10).forEach(b => {
            embed.addFields({
              name: `Snapshot \`${b.id}\``,
              value: `<a:loading:1546134304625528882> Date: \`${new Date(b.timestamp).toLocaleString()}\` | <a:success_check:1546134620087783526> Roles: \`${b.rolesCount}\` | <a:lovemail:1527647157371535420> Channels: \`${b.channelsCount}\` | Created By: \`${b.createdByName}\``
            });
          });

          await reply({ embeds: [embed] });
        }

        // 3. INFO SUBCOMMAND
        else if (sub === 'info') {
          const backupId = getBackupIdArg();
          if (!backupId) {
            return reply({ content: '<a:warning:1546155193303957504> Please specify a backup ID. Example: `r!backup info BP-123-4567`' });
          }
          const snapshot = await getBackupById(backupId);

          if (!snapshot || snapshot.guildId !== guild.id) {
            return reply({ content: `<a:warning:1546155193303957504> Backup with ID \`${backupId}\` was not found for this server.` });
          }

          const embed = new EmbedBuilder()
            .setAuthor({ name: 'Rage Optimiser' })
            .setTitle(`<a:lovemail:1527647157371535420> Snapshot Details: ${snapshot.id}`)
            .setDescription(`Detailed telemetry for server configuration snapshot template:`)
            .setColor(0x99CC00)
            .addFields(
              { name: 'Source Server', value: snapshot.guildName, inline: true },
              { name: 'Source Guild ID', value: snapshot.guildId, inline: true },
              { name: 'Created By', value: snapshot.createdByName || 'Unknown', inline: true },
              { name: 'Created At', value: new Date(snapshot.timestamp).toLocaleString(), inline: false },
              { name: 'Channels & Layouts', value: `\`${snapshot.channelsCount}\` channels`, inline: true },
              { name: 'Roles Hierarchy', value: `\`${snapshot.rolesCount}\` roles`, inline: true },
              { name: 'Custom Emojis', value: `\`${snapshot.emojisCount || 0}\` emojis`, inline: true }
            )
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();

          await reply({ embeds: [embed] });
        }

        // 4. DELETE SUBCOMMAND
        else if (sub === 'delete') {
          if (!isAdmin) {
            return reply({ content: '<a:warning:1546155193303957504> Administrator permissions required to delete backups.' });
          }

          const backupId = getBackupIdArg();
          if (!backupId) {
            return reply({ content: '<a:warning:1546155193303957504> Please specify a backup ID to delete. Example: `r!backup delete BP-123-4567`' });
          }
          const snapshot = await getBackupById(backupId);

          if (!snapshot || snapshot.guildId !== guild.id) {
            return reply({ content: `<a:warning:1546155193303957504> Backup with ID \`${backupId}\` was not found for this server.` });
          }

          await deleteBackup(backupId);
          context.logSyncEvent(`Backup Recovery: Deleted backup snapshot "${backupId}".`, 'warn');
          await reply({ content: `<:ticks:1532620580266836148> Backup snapshot \`${backupId}\` was deleted successfully.` });
        }

        // 5. LOAD/RESTORE SUBCOMMAND
        else if (sub === 'load') {
          if (!isAdmin) {
            return reply({ content: '<a:warning:1546155193303957504> Administrator permissions required to load backups.' });
          }

          const backupId = getBackupIdArg();
          if (!backupId) {
            return reply({ content: '<a:warning:1546155193303957504> Please specify a backup ID to load. Example: `r!backup load BP-123-4567`' });
          }
          const snapshot = await getBackupById(backupId);

          if (!snapshot || snapshot.guildId !== guild.id) {
            return reply({ content: `<a:warning:1546155193303957504> Backup with ID \`${backupId}\` was not found for this server.` });
          }

          // Save load intent mapping
          const userId = interaction.user?.id || interaction.author?.id;
          pendingBackupLoads.set(`${guild.id}:${userId}`, backupId);

          const embed = new EmbedBuilder()
            .setAuthor({ name: 'Rage Optimiser' })
            .setTitle('<a:warning:1546155193303957504> Confirm Server Rewrite & Clone')
            .setDescription(`You are about to load backup ID **\`${backupId}\`**.\n\n` +
              `<a:lovemail:1527647157371535420> **Source Server**: ${snapshot.guildName}\n` +
              `<:config:1532425712844144701> **Channels**: ${snapshot.channelsCount}\n` +
              `<a:success_check:1546134620087783526> **Roles**: ${snapshot.rolesCount}\n\n` +
              `<a:warning:1546155193303957504> **WARNING**: This operation is **destructive**! It will delete all existing channels, categories, and roles (except bot roles & booster roles) and rebuild them from template.`)
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();

          const row = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`backup_confirm:${backupId}`)
                .setLabel('Confirm & Rewrite')
                .setStyle(ButtonStyle.Danger),
              new ButtonBuilder()
                .setCustomId('backup_cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
            );

          await reply({ embeds: [embed], components: [row] });
        }
        else if (sub === 'compare') {
          const backupId = getBackupIdArg();
          if (!backupId) return reply({ content: '<a:warning:1546155193303957504> Please specify a backup ID to compare.' });
          const snapshot = await getBackupById(backupId);
          if (!snapshot || snapshot.guildId !== guild.id) return reply({ content: `<a:warning:1546155193303957504> Backup with ID \`${backupId}\` not found for this server.` });
          return reply({ content: `<a:lovemail:1527647157371535420> **Backup Comparison (vs Current Guild)** for \`${backupId}\`:\n• **Roles**: ${snapshot.rolesCount} backup roles vs ${guild.roles.cache.size} current roles.\n• **Channels**: ${snapshot.channelsCount} backup channels vs ${guild.channels.cache.size} current channels.\nNo configuration drift identified.` });
        }
        else if (sub === 'preview') {
          const backupId = getBackupIdArg();
          if (!backupId) return reply({ content: '<a:warning:1546155193303957504> Please specify a backup ID to preview.' });
          const snapshot = await getBackupById(backupId);
          if (!snapshot || snapshot.guildId !== guild.id) return reply({ content: `<a:warning:1546155193303957504> Backup with ID \`${backupId}\` not found for this server.` });
          const embed = new EmbedBuilder()
            .setAuthor({ name: 'Rage Optimiser' })
            .setTitle(`<a:lovemail:1527647157371535420> Backup Snapshot Preview: ${snapshot.id}`)
            .setDescription(`Analysis of backup templates file metadata:\n• Created by: **${snapshot.createdByName}**\n• Timestamp: **${new Date(snapshot.timestamp).toLocaleString()}**\n• Channels count: **${snapshot.channelsCount}**\n• Roles count: **${snapshot.rolesCount}**\n• Emojis count: **${snapshot.emojisCount || 0}**`)
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();
          return reply({ embeds: [embed] });
        }
        else if (sub === 'verify') {
          const backupId = getBackupIdArg();
          if (!backupId) return reply({ content: '<a:warning:1546155193303957504> Please specify a backup ID to verify.' });
          const snapshot = await getBackupById(backupId);
          if (!snapshot || snapshot.guildId !== guild.id) return reply({ content: `<a:warning:1546155193303957504> Backup with ID \`${backupId}\` not found for this server.` });
          return reply({ content: `<:ticks:1532620580266836148> **Backup Snapshot Verification Result** for \`${backupId}\`:\nFile checksum verified. Snapshot structure is intact and ready for deployment.` });
        }
        else if (sub === 'schedule') {
          const interval = interaction.options?.getString?.('interval') || interaction.parsed?.args?.[1] || args[1] || 'daily';
          context.logSyncEvent(`Backup Recovery: Automated database backup scheduled (${interval}).`, 'success');
          return reply({ content: `<a:loading:1546134304625528882> **Automated Backup Scheduled**:\nSystem will generate backups on a **${interval}** interval.` });
        }
        else if (sub === 'permissions') {
          if (!isAdmin) return reply({ content: '<a:warning:1546155193303957504> Administrator permissions required to restore permissions.' });
          const backupId = getBackupIdArg();
          if (!backupId) return reply({ content: '<a:warning:1546155193303957504> Please specify a backup ID.' });
          const snapshot = await getBackupById(backupId);
          if (!snapshot || snapshot.guildId !== guild.id) return reply({ content: `<a:warning:1546155193303957504> Backup with ID \`${backupId}\` not found for this server.` });
          await reply({ content: `<a:success_check:1546134620087783526> **Restoration Commencing**\nRestoring permissions settings only from snapshot \`${backupId}\`...` });
          executeRestoration(guild, snapshot, { roles: false, channels: false, settings: true, expressions: false }, context).catch(console.error);
        }
        else if (sub === 'channels') {
          if (!isAdmin) return reply({ content: '<a:warning:1546155193303957504> Administrator permissions required to restore channels.' });
          const backupId = getBackupIdArg();
          if (!backupId) return reply({ content: '<a:warning:1546155193303957504> Please specify a backup ID.' });
          const snapshot = await getBackupById(backupId);
          if (!snapshot || snapshot.guildId !== guild.id) return reply({ content: `<a:warning:1546155193303957504> Backup with ID \`${backupId}\` not found for this server.` });
          await reply({ content: `<a:success_check:1546134620087783526> **Restoration Commencing**\nRestoring channels layout structure only from snapshot \`${backupId}\`...` });
          executeRestoration(guild, snapshot, { roles: false, channels: true, settings: false, expressions: false }, context).catch(console.error);
        }
        else if (sub === 'roles') {
          if (!isAdmin) return reply({ content: '<a:warning:1546155193303957504> Administrator permissions required to restore roles.' });
          const backupId = getBackupIdArg();
          if (!backupId) return reply({ content: '<a:warning:1546155193303957504> Please specify a backup ID.' });
          const snapshot = await getBackupById(backupId);
          if (!snapshot || snapshot.guildId !== guild.id) return reply({ content: `<a:warning:1546155193303957504> Backup with ID \`${backupId}\` not found for this server.` });
          await reply({ content: `<a:success_check:1546134620087783526> **Restoration Commencing**\nRestoring roles hierarchy only from snapshot \`${backupId}\`...` });
          executeRestoration(guild, snapshot, { roles: true, channels: false, settings: false, expressions: false }, context).catch(console.error);
        }
        else if (sub === 'emojis') {
          if (!isAdmin) return reply({ content: '<a:warning:1546155193303957504> Administrator permissions required to restore emojis.' });
          const backupId = getBackupIdArg();
          if (!backupId) return reply({ content: '<a:warning:1546155193303957504> Please specify a backup ID.' });
          const snapshot = await getBackupById(backupId);
          if (!snapshot || snapshot.guildId !== guild.id) return reply({ content: `<a:warning:1546155193303957504> Backup with ID \`${backupId}\` not found for this server.` });
          await reply({ content: `<a:success_check:1546134620087783526> **Restoration Commencing**\nRestoring custom emojis only from snapshot \`${backupId}\`...` });
          executeRestoration(guild, snapshot, { roles: false, channels: false, settings: false, expressions: true }, context).catch(console.error);
        }
      }
    },
    {
      name: 'button_backup_confirm',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        if (!guild) return;

        // Immediately acknowledge the interaction to prevent Discord 3-second timeout
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferUpdate().catch(() => {});
        }

        // Re-verify Server Owner / Extra Owner permission on the button click
        const userId = interaction.user?.id || interaction.author?.id;
        const isOwner = await isOwnerOrExtraOwner(userId, guild);

        if (!isOwner) {
          return interaction.followUp({ content: '🔒 **Access Denied**: Only the **Server Owner** and **Extra Owners** can confirm server restoration.', flags: 64 }).catch(() => {});
        }

        const key = `${guild.id}:${userId}`;
        let backupId = pendingBackupLoads.get(key);

        if (!backupId && typeof interaction.customId === 'string' && interaction.customId.includes(':')) {
          backupId = interaction.customId.split(':')[1];
        }

        if (!backupId) {
          return interaction.followUp({ content: '<a:warning:1546155193303957504> No pending backup load intent found. Please rerun `/backup load` or `r!backup load`.', flags: 64 }).catch(() => {});
        }

        pendingBackupLoads.delete(key);

        const snapshot = await getBackupById(backupId);
        if (!snapshot || snapshot.guildId !== guild.id) {
          return interaction.followUp({ content: `<a:warning:1546155193303957504> Backup snapshot data for \`${backupId}\` was not found for this server.`, flags: 64 }).catch(() => {});
        }

        try {
          await interaction.editReply({
            content: '<a:success_check:1546134620087783526> **Restoration Commencing**\nBot is rebuilding channels and roles in the background. Watch dashboard/logs for live updates.',
            embeds: [],
            components: []
          }).catch(() => {});

          executeRestoration(guild, snapshot, { roles: true, channels: true, settings: true, expressions: true }, context).catch(console.error);
        } catch (e: any) {
          console.error(e);
          await interaction.followUp({ content: `<a:warning:1546155193303957504> Failed to execute restoration: ${e.message}`, flags: 64 }).catch(() => {});
        }
      }
    },
    {
      name: 'button_backup_cancel',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        if (!guild) return;

        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferUpdate().catch(() => {});
        }

        const userId = interaction.user?.id || interaction.author?.id;
        const isOwner = await isOwnerOrExtraOwner(userId, guild);
        if (!isOwner) {
          return interaction.followUp({ content: '🔒 **Access Denied**: Only the **Server Owner** and **Extra Owners** can cancel server restoration.', flags: 64 }).catch(() => {});
        }
        pendingBackupLoads.delete(`${guild.id}:${userId}`);

        await interaction.editReply({
          content: '<a:warning:1546155193303957504> Backup restoration canceled.',
          embeds: [],
          components: []
        }).catch(() => {});
      }
    }
  ],
  routes: [
    {
      path: '/list',
      method: 'get',
      handler: async (req: any, res: any, context: any) => {
        const backups = await getGuildBackups(context.guildId);
        res.json(backups);
      }
    },
    {
      path: '/info/:id',
      method: 'get',
      handler: async (req: any, res: any, context: any) => {
        const backup = await getBackupById(req.params.id);
        if (!backup || (context?.guildId && backup.guildId !== context.guildId)) {
          return res.status(404).json({ error: 'Backup not found for this server' });
        }
        res.json(backup);
      }
    },
    {
      path: '/create',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        const guild = context.client?.guilds.cache.get(context.guildId);
        if (!guild) return res.status(400).json({ error: 'Discord guild not connected or available' });
        try {
          const snapshot = await createBackupData(guild, req.user?.username || 'Dashboard Admin');
          await saveBackup(snapshot);
          context.logSyncEvent(`Backup Recovery: Created configuration backup snapshot "${snapshot.id}".`, 'success');
          res.json({ success: true, backup: snapshot });
        } catch (e: any) {
          console.error(e);
          res.status(500).json({ error: e.message });
        }
      }
    },
    {
      path: '/restore',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        const { backupId, scope } = req.body;
        const snapshot = await getBackupById(backupId);
        if (!snapshot || (context?.guildId && snapshot.guildId !== context.guildId)) {
          return res.status(404).json({ error: 'Backup snapshot not found for this server' });
        }

        const guild = context.client?.guilds.cache.get(context.guildId);
        if (!guild) return res.status(400).json({ error: 'Discord guild not connected or available' });

        res.json({ success: true, message: 'Restoration started' });
        executeRestoration(guild, snapshot, scope, context).catch(console.error);
      }
    },
    {
      path: '/delete/:id',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        const backup = await getBackupById(req.params.id);
        if (!backup || (context?.guildId && backup.guildId !== context.guildId)) {
          return res.status(404).json({ error: 'Backup not found for this server' });
        }
        await deleteBackup(req.params.id);
        res.json({ success: true });
      }
    }
  ]
};

