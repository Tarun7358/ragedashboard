export const protections = [
  { key: 'anti_ban', label: 'Anti Ban' },
  { key: 'anti_unban', label: 'Anti Unban' },
  { key: 'anti_kick', label: 'Anti Kick' },
  { key: 'anti_prune', label: 'Anti Member Prune' },
  { key: 'anti_bot_add', label: 'Anti Bot Add' },
  { key: 'anti_bot_remove', label: 'Anti Bot Remove' },
  { key: 'anti_channel_create', label: 'Anti Channel Create' },
  { key: 'anti_channel_delete', label: 'Anti Channel Delete' },
  { key: 'anti_channel_update', label: 'Anti Channel Update' },
  { key: 'anti_role_create', label: 'Anti Role Create' },
  { key: 'anti_role_delete', label: 'Anti Role Delete' },
  { key: 'anti_role_update', label: 'Anti Role Update' },
  { key: 'anti_role_grant', label: 'Anti Role Assign' },
  { key: 'anti_role_remove', label: 'Anti Role Remove' },
  { key: 'anti_member_update', label: 'Anti Member Update' },
  { key: 'anti_emoji_create', label: 'Anti Emoji/Sticker Create' },
  { key: 'anti_emoji_delete', label: 'Anti Emoji/Sticker Delete' },
  { key: 'anti_emoji_update', label: 'Anti Emoji/Sticker Update' },
  { key: 'anti_everyone_ping', label: 'Anti Everyone/Here Ping' },
  { key: 'anti_role_ping', label: 'Anti Role Ping' },
  { key: 'anti_integration', label: 'Anti Integration' },
  { key: 'anti_guild_update', label: 'Anti Guild Update' },
  { key: 'anti_webhook_create', label: 'Anti Webhook Create' },
  { key: 'anti_webhook_delete', label: 'Anti Webhook Delete' },
  { key: 'anti_webhook_update', label: 'Anti Webhook Update' },
  { key: 'anti_invite_create', label: 'Anti Invite Create' },
  { key: 'anti_invite_delete', label: 'Anti Invite Delete' },
  { key: 'anti_timeout', label: 'Anti Timeout Abuse' },
  { key: 'anti_link', label: 'Anti Link Filter' }
];

export function isModuleBypassed(enabledModules: string[] | undefined, ruleId?: string): boolean {
  if (!enabledModules) return true;
  if (!ruleId) return true;

  const cleanRule = ruleId.toLowerCase();

  // If the exact key or name is enabled
  if (enabledModules.includes(cleanRule) || enabledModules.includes(ruleId)) return true;

  // Anti-Nuke mapping
  const antiNukeRules = [
    'anti_ban', 'anti_unban', 'anti_kick', 'anti_prune', 'anti_bot_add',
    'anti_channel_create', 'anti_channel_delete', 'anti_channel_update',
    'anti_role_create', 'anti_role_delete', 'anti_role_update',
    'anti_role_grant', 'anti_role_remove', 'anti_member_update',
    'anti_emoji_create', 'anti_emoji_delete', 'anti_emoji_update',
    'anti_integration', 'anti_guild_update',
    'anti_webhook_create', 'anti_webhook_delete', 'anti_webhook_update',
    'anti_invite_create', 'anti_invite_delete', 'anti_timeout', 'anti_link'
  ];
  if (antiNukeRules.includes(cleanRule)) {
    return enabledModules.includes('Anti-Nuke') || enabledModules.includes('anti-nuke');
  }

  // Anti-Link mapping
  if (cleanRule === 'anti_link' || cleanRule === 'antilink') {
    return enabledModules.includes('anti_link') || enabledModules.includes('antilink') || enabledModules.includes('Automod') || enabledModules.includes('automod');
  }

  // Anti-Spam mapping
  const antiSpamRules = ['anti_everyone_ping', 'anti_role_ping', 'anti_spam'];
  if (antiSpamRules.includes(cleanRule)) {
    return enabledModules.includes('Anti-Spam') || enabledModules.includes('anti-spam');
  }

  // Voice protection mapping
  if (cleanRule === 'voice_protection' || cleanRule === 'voice-protection') {
    return enabledModules.includes('Voice-Protection') || enabledModules.includes('voice-protection');
  }

  // Automod mapping
  if (cleanRule === 'automod') {
    return enabledModules.includes('Automod') || enabledModules.includes('automod');
  }

  // Verification mapping
  if (cleanRule === 'verification') {
    return enabledModules.includes('Verification') || enabledModules.includes('verification');
  }

  return false;
}

export async function checkWhitelistPermission(userId: string, guild: any, context: any, ruleId?: string): Promise<boolean> {
  if (!guild) return false;

  // 1. Guild owner always has permission
  if (userId === guild.ownerId || 
      userId === guild.client?.application?.owner?.id ||
      ((guild.client?.application?.owner as any)?.members && (guild.client?.application?.owner as any).members.has(userId))) return true;

  const modules = context.getModulesState ? context.getModulesState() : [];

  // 2. Check member_whitelist (users / roles / bots in unified member_whitelist)
  const mwModule = modules.find((m: any) => m && m.id === 'member_whitelist');
  const members = mwModule?.config?.members || [];
  const isWhitelistedMember = members.some((m: any) => 
    m && 
    (m.userId === userId || m.id === userId) && 
    m.status === 'active' && 
    (!m.type || m.type === 'member') &&
    isModuleBypassed(m.enabledModules, ruleId)
  );
  if (isWhitelistedMember) return true;

  // 3. Check security whitelist
  const secModule = modules.find((m: any) => m && m.id === 'security');
  const secConfig = secModule?.config || {};
  const secWhitelist = secConfig.whitelist || [];
  const isSecWhitelisted = secWhitelist.some((w: any) => {
    if (!w) return false;
    if (typeof w === 'string') return w === userId;
    return w.targetId === userId && isModuleBypassed(w.enabledModules, ruleId);
  });
  if (isSecWhitelisted) return true;

  // Fetch member for role and local config checks
  const member = guild.members?.cache?.get(userId) || (guild.members?.fetch ? await guild.members.fetch(userId).catch(() => null) : null);

  // 4. Check whitelisted roles (from unified members with type 'role')
  if (member) {
    // 4. Check whitelisted roles (from unified members with type 'role')
    if (members.some((m: any) => m && m.status === 'active' && m.type === 'role' && m.roleId && member.roles?.cache?.has(m.roleId) && isModuleBypassed(m.enabledModules, ruleId))) {
      return true;
    }

    // Exception roles & UPM roles grant Anti-Nuke immunity, not Anti-Link (unless no ruleId specified)
    if (!ruleId || (ruleId !== 'anti_link' && ruleId !== 'automod')) {
      const exceptionRoleIds: string[] = secConfig.exceptionRoleIds || secConfig.whitelistRoles || [];
      if (exceptionRoleIds.length > 0 && member.roles?.cache?.some((r: any) => r && exceptionRoleIds.includes(r.id))) {
        return true;
      }

      const upm = secConfig.upm || {};
      const upmWhitelistRoles: string[] = upm.whitelistRoles || [];
      const upmIgnoredRoles: string[] = upm.ignoredRoles || [];
      if (upmWhitelistRoles.length > 0 && member.roles?.cache?.some((r: any) => r && upmWhitelistRoles.includes(r.id))) return true;
      if (upmIgnoredRoles.length > 0 && member.roles?.cache?.some((r: any) => r && upmIgnoredRoles.includes(r.id))) return true;
    }
  }

  // 5. Check whitelisted bots (from unified members with type 'bot')
  const isBotWhitelisted = members.some((m: any) =>
    m &&
    (m.userId === userId || m.id === userId) &&
    m.status === 'active' &&
    m.type === 'bot' &&
    isModuleBypassed(m.enabledModules, ruleId)
  );
  if (isBotWhitelisted) return true;

  // 6. Check UPM Whitelisted Users (Anti-Nuke protection only)
  if (!ruleId || (ruleId !== 'anti_link' && ruleId !== 'automod')) {
    const upm = secConfig.upm || {};
    const upmWhitelistUsers: string[] = upm.whitelistUsers || [];
    if (upmWhitelistUsers.includes(userId)) return true;
  }

  // 7. Check voice protection whitelist (Voice Protection rule only)
  if (!ruleId || ruleId === 'voice_protection' || ruleId === 'voice-protection') {
    const vpModule = modules.find((m: any) => m && m.id === 'voice-protection');
    const vpConfig = vpModule?.config || {};
    if (vpConfig.whitelistedUsers?.includes(userId)) return true;
    if (vpConfig.whitelistedRoles?.length > 0 && member) {
      if (vpConfig.whitelistedRoles.some((rId: string) => rId && member.roles?.cache?.has(rId))) return true;
    }
  }

  return false;
}

export async function checkBypassImmunity(
  userId: string,
  guild: any,
  context: any,
  ruleId?: string
): Promise<boolean> {
  if (!guild) {
    console.log('[checkBypassImmunity] No guild provided');
    return false;
  }

  // 1. Guild owner always bypasses
  if (userId === guild.ownerId || 
      userId === guild.client.application?.owner?.id ||
      ((guild.client.application?.owner as any)?.members && (guild.client.application?.owner as any).members.has(userId))) {
    return true;
  }

  // 2. Sibling Music Bot always bypasses
  if (process.env.MUSIC_CLIENT_ID && userId === process.env.MUSIC_CLIENT_ID) {
    return true;
  }

  // 3. Otherwise check whitelist permission directly (flat bypass)
  return checkWhitelistPermission(userId, guild, context, ruleId);
}

export function migrateToUnifiedWhitelist(context: any) {
  const modules = context.getModulesState ? context.getModulesState() : [];
  const mwModule = modules.find((m: any) => m.id === 'member_whitelist');
  if (!mwModule) return;

  const secModule = modules.find((m: any) => m.id === 'security');
  const vpModule = modules.find((m: any) => m.id === 'voice-protection');

  const client = context.client;
  const registry = context.getRegistry ? context.getRegistry() : { roles: [], channels: [] };
  const guildRoles = registry?.roles || [];
  const isRoleId = (id: string) => guildRoles.some((r: any) => r.id === id);

  const isBotId = (id: string) => {
    if (client) {
      if (client.user?.id === id) return true;
      const user = client.users?.cache?.get(id);
      if (user?.bot) return true;
    }
    return false;
  };

  const getTargetType = (id: string, entryType?: string): 'role' | 'bot' | 'member' => {
    if (isRoleId(id) || entryType === 'role') return 'role';
    if (isBotId(id) || entryType === 'bot') return 'bot';
    return 'member';
  };

  const allBypasses = [...protections.map(p => p.key), 'voice_protection'];

  const currentMembers = mwModule.config?.members || [];
  const unifiedMap = new Map<string, any>();

  const sanitize = (val: any, fallback: string): string => {
    if (val === undefined || val === null) return fallback;
    const str = String(val).trim();
    if (
      str === '' || 
      str === 'undefined' || 
      str === 'null' || 
      str.includes('[object Object]')
    ) {
      return fallback;
    }
    return str;
  };

  const registerEntry = (id: string, type: 'role' | 'bot' | 'member', extraData: any = {}) => {
    if (!id || id === 'undefined' || id === 'null') return;
    const existing = unifiedMap.get(id);

    // Resolve clean tag/name from client if possible
    let clientTag: string | undefined = undefined;
    if (type !== 'role' && client) {
      const userObj = client.users?.cache?.get(id);
      if (userObj) {
        clientTag = userObj.username || userObj.username;
      }
    }
    let clientName: string | undefined = undefined;
    if (type === 'role' && client) {
      const roleObj = guildRoles.find((r: any) => r.id === id);
      if (roleObj) {
        clientName = roleObj.name;
      }
    }

    if (existing) {
      const newModules = Array.from(new Set([
        ...(existing.enabledModules || []),
        ...(extraData.enabledModules || allBypasses)
      ]));
      existing.enabledModules = newModules;
      existing.status = 'active'; // Enforce active status
      if (extraData.notes && !existing.notes) {
        existing.notes = extraData.notes;
      }
      if (type === 'role') {
        existing.type = 'role';
        existing.roleId = id;
        delete existing.userId;
        const newName = sanitize(clientName || extraData.name, '');
        if (newName && (!existing.name || existing.name.startsWith('Role-') || existing.name === 'undefined')) {
          existing.name = newName;
        }
      } else {
        existing.type = type;
        existing.userId = id;
        delete existing.roleId;
        const newTag = sanitize(clientTag || extraData.username, '');
        if (newTag && (!existing.username || existing.username.startsWith('User-') || existing.username.startsWith('Bot-') || existing.username === 'undefined')) {
          existing.username = newTag;
        }
      }
    } else {
      const entry: any = {
        id,
        status: 'active',
        type,
        enabledModules: extraData.enabledModules || allBypasses,
        notes: extraData.notes || 'Auto Migrated',
        createdDate: extraData.createdDate || new Date().toISOString()
      };
      if (type === 'role') {
        entry.roleId = id;
        entry.name = sanitize(clientName || extraData.name, `Role-${id}`);
      } else {
        entry.userId = id;
        entry.username = sanitize(clientTag || extraData.username, type === 'bot' ? `Bot-${id}` : `User-${id}`);
      }
      unifiedMap.set(id, entry);
    }
  };

  // 1. Populate from member_whitelist config
  for (const entry of currentMembers) {
    if (entry) {
      const targetId = entry.userId || entry.roleId || entry.id;
      if (targetId) {
        const type = getTargetType(targetId, entry.type);
        registerEntry(targetId, type, {
          name: entry.name,
          tag: entry.username,
          enabledModules: entry.enabledModules,
          notes: entry.notes,
          createdDate: entry.createdDate
        });
      }
    }
  }

  const migrationDone = mwModule.config?.migrationDone === true;

  if (!migrationDone) {
    // 2. Populate from security whitelist
    const secWhitelist = secModule?.config?.whitelist || [];
    for (const w of secWhitelist) {
      if (w) {
        const userId = typeof w === 'string' ? w : w.targetId;
        const tag = typeof w === 'string' ? undefined : w.username;
        const notes = typeof w === 'string' ? 'Security Whitelist' : w.notes || 'Security Whitelist';
        const createdDate = typeof w === 'string' ? undefined : w.addedAt;
        if (userId) {
          const type = getTargetType(userId, 'member');
          registerEntry(userId, type, {
            tag,
            notes,
            createdDate
          });
        }
      }
    }

    // 3. Populate from security exception roles
    const secRoles = secModule?.config?.exceptionRoleIds || secModule?.config?.whitelistRoles || [];
    for (const rId of secRoles) {
      if (rId) {
        registerEntry(rId, 'role', {
          notes: 'Security Exception Role'
        });
      }
    }

    // 4. Populate from UPM users
    const upmUsers = secModule?.config?.upm?.whitelistUsers || [];
    for (const uId of upmUsers) {
      if (uId) {
        const type = getTargetType(uId, 'member');
        registerEntry(uId, type, {
          notes: 'UPM Whitelist User'
        });
      }
    }

    // 5. Populate from UPM roles
    const upmRoles = secModule?.config?.upm?.whitelistRoles || [];
    for (const rId of upmRoles) {
      if (rId) {
        registerEntry(rId, 'role', {
          notes: 'UPM Whitelist Role'
        });
      }
    }

    // 6. Populate from voice protection users
    const vpUsers = vpModule?.config?.whitelistedUsers || [];
    for (const uId of vpUsers) {
      if (uId) {
        const type = getTargetType(uId, 'member');
        registerEntry(uId, type, {
          notes: 'Voice Whitelist User'
        });
      }
    }

    // 7. Populate from voice protection roles
    const vpRoles = vpModule?.config?.whitelistedRoles || [];
    for (const rId of vpRoles) {
      if (rId) {
        registerEntry(rId, 'role', {
          notes: 'Voice Whitelist Role'
        });
      }
    }
  }

  const unified = Array.from(unifiedMap.values());

  // --- Downward Synchronization ---

  // 1. security exceptionRoleIds, whitelist, and upm exception users/roles
  if (secModule) {
    const secConfig = secModule.config || {};
    
    const currentSecWhitelist = secConfig.whitelist || [];
    const newSecWhitelist = unified.filter(e => e.type === 'member').map(e => ({
      targetId: e.userId,
      tag: e.username,
      addedAt: e.createdDate
    })).filter(e => e.targetId);
    
    const currentExceptionRoles = secConfig.exceptionRoleIds || secConfig.whitelistRoles || [];
    const newExceptionRoles = unified.filter(e => e.type === 'role').map(e => e.roleId).filter(Boolean);

    const upm = secConfig.upm || {};
    const currentUpmUsers = upm.whitelistUsers || [];
    const newUpmUsers = unified.filter(e => e.type === 'member' || e.type === 'bot').map(e => e.userId).filter(Boolean);

    const currentUpmRoles = upm.whitelistRoles || [];
    const newUpmRoles = unified.filter(e => e.type === 'role').map(e => e.roleId).filter(Boolean);

    let secChanged = false;
    const updatedSecConfig = { ...secConfig };

    if (JSON.stringify(currentSecWhitelist) !== JSON.stringify(newSecWhitelist)) {
      updatedSecConfig.whitelist = newSecWhitelist;
      secChanged = true;
    }
    if (JSON.stringify(currentExceptionRoles) !== JSON.stringify(newExceptionRoles)) {
      updatedSecConfig.exceptionRoleIds = newExceptionRoles;
      if (secConfig.whitelistRoles) {
        updatedSecConfig.whitelistRoles = newExceptionRoles;
      }
      secChanged = true;
    }
    if (JSON.stringify(currentUpmUsers) !== JSON.stringify(newUpmUsers) || JSON.stringify(currentUpmRoles) !== JSON.stringify(newUpmRoles)) {
      updatedSecConfig.upm = {
        ...upm,
        whitelistUsers: newUpmUsers,
        whitelistRoles: newUpmRoles
      };
      secChanged = true;
    }

    if (secChanged) {
      context.updateModuleConfig('security', updatedSecConfig);
    }
  }

  // 2. voice-protection whitelistedUsers / whitelistedRoles
  if (vpModule) {
    const vpConfig = vpModule.config || {};
    const currentVpUsers = vpConfig.whitelistedUsers || [];
    const newVpUsers = unified.filter(e => e.type === 'member' || e.type === 'bot').map(e => e.userId).filter(Boolean);

    const currentVpRoles = vpConfig.whitelistedRoles || [];
    const newVpRoles = unified.filter(e => e.type === 'role').map(e => e.roleId).filter(Boolean);

    let vpChanged = false;
    const updatedVpConfig = { ...vpConfig };

    if (JSON.stringify(currentVpUsers) !== JSON.stringify(newVpUsers)) {
      updatedVpConfig.whitelistedUsers = newVpUsers;
      vpChanged = true;
    }
    if (JSON.stringify(currentVpRoles) !== JSON.stringify(newVpRoles)) {
      updatedVpConfig.whitelistedRoles = newVpRoles;
      vpChanged = true;
    }

    if (vpChanged) {
      context.updateModuleConfig('voice-protection', updatedVpConfig);
    }
  }

  // Finally, save the unified list in member_whitelist
  const currentSerialized = JSON.stringify(currentMembers);
  const newSerialized = JSON.stringify(unified);
  const updatedConfig: any = { members: unified };
  if (!migrationDone) {
    updatedConfig.migrationDone = true;
  }
  if (currentSerialized !== newSerialized || !migrationDone) {
    context.updateModuleConfig('member_whitelist', updatedConfig);
    context.logSyncEvent(`Synchronized ${unified.length} entries to the Unified Whitelist.`, 'success');
  }
}

export async function getGuildAndCheckPermission(userOrId: string | any, context: any): Promise<boolean> {
  let userId = '';
  let userObj: any = null;

  if (userOrId && typeof userOrId === 'object') {
    userId = userOrId.id;
    userObj = userOrId;
  } else {
    userId = userOrId;
  }

  const guildId = context.guildId;

  // Fast path: JWT managedGuildIds are already verified at OAuth time (user has Manage Server or is owner)
  // Use this as the primary check — no Discord API round-trip required.
  if (userObj) {
    if (Array.isArray(userObj.managedGuildIds) && userObj.managedGuildIds.includes(guildId)) return true;
    if (userObj.role === 'owner') return true;
  }

  // Secondary: Try to fetch guild from Discord for deeper owner/whitelist check
  if (!context.client || !guildId) {
    // No Discord client available — fall back to JWT role check
    return userObj?.role === 'owner';
  }

  const guild = await context.client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    // Guild not reachable — trust JWT managedGuildIds as fallback
    if (userObj) {
      const mgIds: string[] = userObj.managedGuildIds || [];
      if (mgIds.includes(guildId) || userObj.role === 'owner') return true;
    }
    return false;
  }

  return checkWhitelistPermission(userId, guild, context);
}

export const WHITELIST_MENU_OPTIONS = [
  { value: 'all', label: 'All Protections (Full Whitelist)', desc: 'Bypass all anti-nuke, anti-spam, anti-link, and voice checks', emoji: '<:shield:1532403012751065179>' },
  { value: 'antinuke', label: 'All Anti-Nuke Rules', desc: 'Bypass all administrative and server-modifying rules', emoji: '<:shield:1532403012751065179>' },
  { value: 'antispam', label: 'All Anti-Spam Rules', desc: 'Bypass everyone/here and role ping protections', emoji: '<:shield:1532403012751065179>' },
  { value: 'anti_link', label: 'Content: Anti Link Filter', desc: 'Bypass anti-link filter & URL blocking', emoji: '<:shield:1532403012751065179>' },
  { value: 'anti_ban', label: 'Moderation: Ban & Unban', desc: 'Bypass anti-ban and anti-unban rules', emoji: '<:shield:1532403012751065179>' },
  { value: 'anti_kick', label: 'Moderation: Kick & Prune', desc: 'Bypass anti-kick and anti-prune rules', emoji: '<:shield:1532403012751065179>' },
  { value: 'anti_bot_add', label: 'Security: Anti Bot Add', desc: 'Bypass anti-bot addition rule', emoji: '<:shield:1532403012751065179>' },
  { value: 'anti_channel', label: 'Structure: Channels', desc: 'Bypass channel create, delete, and update rules', emoji: '<:shield:1532403012751065179>' },
  { value: 'anti_role', label: 'Structure: Roles & Grants', desc: 'Bypass role modify and assignment rules', emoji: '<:shield:1532403012751065179>' },
  { value: 'anti_webhook', label: 'Access: Webhooks & Integrations', desc: 'Bypass webhook and integration rules', emoji: '<:shield:1532403012751065179>' },
  { value: 'anti_emoji', label: 'Assets: Emojis & Stickers', desc: 'Bypass emoji/sticker modify rules', emoji: '<:shield:1532403012751065179>' },
  { value: 'anti_invite', label: 'Invites: Create & Delete', desc: 'Bypass invite modify rules', emoji: '<:shield:1532403012751065179>' },
  { value: 'anti_timeout', label: 'Moderation: Anti Timeout Abuse', desc: 'Bypass anti-timeout abuse rule', emoji: '<:shield:1532403012751065179>' },
  { value: 'voice_protection', label: 'Utilities: Voice Protection', desc: 'Bypass voice connection limitations', emoji: '<:shield:1532403012751065179>' }
];

export function mapSelectedOptionsToRules(selectedOptions: string[]): string[] {
  const rules = new Set<string>();
  for (const opt of selectedOptions) {
    if (opt === 'all') {
      [...protections.map(p => p.key), 'voice_protection'].forEach(k => rules.add(k));
    } else if (opt === 'antinuke') {
      [
        'anti_ban', 'anti_unban', 'anti_kick', 'anti_prune', 'anti_bot_add',
        'anti_channel_create', 'anti_channel_delete', 'anti_channel_update',
        'anti_role_create', 'anti_role_delete', 'anti_role_update',
        'anti_role_grant', 'anti_role_remove', 'anti_member_update',
        'anti_emoji_create', 'anti_emoji_delete', 'anti_emoji_update',
        'anti_integration', 'anti_guild_update',
        'anti_webhook_create', 'anti_webhook_delete', 'anti_webhook_update',
        'anti_invite_create', 'anti_invite_delete', 'anti_timeout', 'anti_link'
      ].forEach(k => rules.add(k));
    } else if (opt === 'antispam') {
      rules.add('anti_everyone_ping');
      rules.add('anti_role_ping');
    } else if (opt === 'anti_link') {
      rules.add('anti_link');
    } else if (opt === 'anti_ban') {
      rules.add('anti_ban');
      rules.add('anti_unban');
    } else if (opt === 'anti_kick') {
      rules.add('anti_kick');
      rules.add('anti_prune');
    } else if (opt === 'anti_bot_add') {
      rules.add('anti_bot_add');
    } else if (opt === 'anti_channel') {
      rules.add('anti_channel_create');
      rules.add('anti_channel_delete');
      rules.add('anti_channel_update');
    } else if (opt === 'anti_role') {
      rules.add('anti_role_create');
      rules.add('anti_role_delete');
      rules.add('anti_role_update');
      rules.add('anti_role_grant');
      rules.add('anti_role_remove');
    } else if (opt === 'anti_webhook') {
      rules.add('anti_webhook_create');
      rules.add('anti_webhook_delete');
      rules.add('anti_webhook_update');
      rules.add('anti_integration');
    } else if (opt === 'anti_emoji') {
      rules.add('anti_emoji_create');
      rules.add('anti_emoji_delete');
      rules.add('anti_emoji_update');
    } else if (opt === 'anti_invite') {
      rules.add('anti_invite_create');
      rules.add('anti_invite_delete');
    } else if (opt === 'anti_timeout') {
      rules.add('anti_timeout');
    } else if (opt === 'voice_protection') {
      rules.add('voice_protection');
    }
  }
  return Array.from(rules);
}

export function resolveSelectedOptions(enabledModules: string[] | undefined): string[] {
  if (!enabledModules || enabledModules.length === 0) return [];
  const selected: string[] = [];

  const allKeys = [...protections.map(p => p.key), 'voice_protection'];
  const hasAll = allKeys.every(k => enabledModules.includes(k));
  if (hasAll) {
    return ['all'];
  }

  const antiNukeKeys = [
    'anti_ban', 'anti_unban', 'anti_kick', 'anti_prune', 'anti_bot_add',
    'anti_channel_create', 'anti_channel_delete', 'anti_channel_update',
    'anti_role_create', 'anti_role_delete', 'anti_role_update',
    'anti_role_grant', 'anti_role_remove', 'anti_member_update',
    'anti_emoji_create', 'anti_emoji_delete', 'anti_emoji_update',
    'anti_integration', 'anti_guild_update',
    'anti_webhook_create', 'anti_webhook_delete', 'anti_webhook_update',
    'anti_invite_create', 'anti_invite_delete', 'anti_timeout', 'anti_link'
  ];
  const hasAntiNuke = antiNukeKeys.every(k => enabledModules.includes(k));
  if (hasAntiNuke) {
    selected.push('antinuke');
  }

  const hasAntiSpam = ['anti_everyone_ping', 'anti_role_ping'].every(k => enabledModules.includes(k));
  if (hasAntiSpam) {
    selected.push('antispam');
  }

  // Common groups (only add if we didn't add the full antinuke/antispam to avoid UI noise, or let user customize)
  if (!hasAntiNuke) {
    if (enabledModules.includes('anti_link')) selected.push('anti_link');
    if (['anti_ban', 'anti_unban'].every(k => enabledModules.includes(k))) selected.push('anti_ban');
    if (['anti_kick', 'anti_prune'].every(k => enabledModules.includes(k))) selected.push('anti_kick');
    if (enabledModules.includes('anti_bot_add')) selected.push('anti_bot_add');
    if (['anti_channel_create', 'anti_channel_delete', 'anti_channel_update'].every(k => enabledModules.includes(k))) selected.push('anti_channel');
    if (['anti_role_create', 'anti_role_delete', 'anti_role_update', 'anti_role_grant', 'anti_role_remove'].every(k => enabledModules.includes(k))) selected.push('anti_role');
    if (['anti_webhook_create', 'anti_webhook_delete', 'anti_webhook_update', 'anti_integration'].every(k => enabledModules.includes(k))) selected.push('anti_webhook');
    if (['anti_emoji_create', 'anti_emoji_delete', 'anti_emoji_update'].every(k => enabledModules.includes(k))) selected.push('anti_emoji');
    if (['anti_invite_create', 'anti_invite_delete'].every(k => enabledModules.includes(k))) selected.push('anti_invite');
    if (enabledModules.includes('anti_timeout')) selected.push('anti_timeout');
  }

  if (enabledModules.includes('voice_protection')) {
    selected.push('voice_protection');
  }

  return selected;
}

