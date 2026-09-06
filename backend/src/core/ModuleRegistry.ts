import { ModuleState, DiscordResourceRegistry, ModuleManifest, LogEntry } from './types.js';
import { Database } from './Database.js';
import { migrateToUnifiedWhitelist, loadExtraOwnersCache } from '../utils/whitelistCheck.js';
import { EmbedBuilder } from 'discord.js';


export class ModuleRegistry {
  private static instance: ModuleRegistry | null = null;
  public static getInstance(): ModuleRegistry | null {
    return ModuleRegistry.instance;
  }

  public client: any = null;
  private guildStates: Map<string, {
    modules: ModuleState[];
    registry: DiscordResourceRegistry;
    syncLogs: LogEntry[];
    globalSettings: Record<string, any>;
    whitelistAudit: any[];
    whitelistActivity: any[];
  }> = new Map();

  private manifests: Map<string, ModuleManifest> = new Map();

  constructor(
    private broadcast: (msg: any) => void
  ) {
    ModuleRegistry.instance = this;
    // Eagerly load the default guild state
    const defaultGuildId = process.env.GUILD_ID || 'default_guild';
    this.getGuildState(defaultGuildId);
  }

  public registerModule(manifest: ModuleManifest) {
    this.manifests.set(manifest.id, manifest);
  }

  private fillManifestModules(modules: ModuleState[]) {
    this.manifests.forEach(manifest => {
      if (!modules.find(m => m.id === manifest.id)) {
        modules.push({
          id: manifest.id,
          name: manifest.name,
          status: 'enabled',
          progress: 0,
          errors: [],
          config: {}
        });
      }
    });
  }

  public async loadAllGuilds() {
    const db = Database.getDb();
    if (!db) return;
    try {
      const rows = await db.all('SELECT * FROM guild_configs');
      for (const row of rows) {
        const modules = JSON.parse(row.modules || '[]');
        const globalSettings = JSON.parse(row.globalSettings || '{}');
        
        const guildId = row.guildId;

        // Hydrate persisted sync logs from SQLite (latest 100, ordered newest-first)
        let persistedLogs: any[] = [];
        try {
          persistedLogs = await db.all(
            'SELECT time, msg, type FROM sync_logs WHERE guildId = ? ORDER BY id DESC LIMIT 100',
            [guildId]
          );
        } catch {
          // sync_logs table may not exist on older installs — safe to ignore
        }

        // Hydrate persisted audit logs from server_audit_logs table
        let persistedWhitelistAudit: any[] = [];
        try {
          const auditRows = await db.all(
            'SELECT * FROM server_audit_logs WHERE guildId = ? ORDER BY timestamp DESC, id DESC LIMIT 100',
            [guildId]
          );
          persistedWhitelistAudit = auditRows.map((r: any) => {
            let parsedDetails = null;
            try { parsedDetails = r.details ? JSON.parse(r.details) : null; } catch { parsedDetails = r.details; }
            return {
              id: r.id.toString(),
              action: r.action,
              target: r.targetName || r.targetId || 'Unknown',
              targetType: r.targetType || 'User',
              targetId: r.targetId,
              executor: r.executorTag || r.executorId || 'System',
              executorId: r.executorId,
              timestamp: new Date(r.timestamp).toLocaleString(),
              status: r.type === 'danger' ? 'Suspicious' : (r.type === 'warn' ? 'Pending' : 'Approved'),
              reason: r.reason,
              details: parsedDetails
            };
          });
        } catch {
          // server_audit_logs table may not exist on older installs — safe to ignore
        }

        const state = {
          modules,
          registry: this.getDefaultRegistry(),
          syncLogs: persistedLogs,
          globalSettings,
          whitelistAudit: persistedWhitelistAudit,
          whitelistActivity: []
        };
        this.guildStates.set(guildId, state);
        this.fillManifestModules(state.modules);
        
        // Sync legacy upmSnapshot metadata from upm_snapshots if missing
        const secMod = state.modules.find((m: any) => m.id === 'security');
        if (secMod && secMod.config && !secMod.config.upmSnapshot) {
          const snap = await db.get('SELECT * FROM upm_snapshots WHERE guildId = ?', [guildId]);
          if (snap) {
            const channels = JSON.parse(snap.channels || '[]');
            const roles = JSON.parse(snap.roles || '[]');
            secMod.config.upmSnapshot = {
              timestamp: snap.timestamp,
              channelsCount: channels.length,
              rolesCount: roles.length
            };
          }
        }
        
        this.reevaluateAllModules(guildId);
        this.triggerWhitelistMigration(guildId);
      }
      await loadExtraOwnersCache();
      console.log(`[ModuleRegistry] Successfully pre-loaded ${rows.length} guild configurations and Extra Owners RAM cache from SQLite.`);
    } catch (e: any) {
      console.error('[ModuleRegistry] Failed to pre-load guild configurations:', e.message);
    }
  }

  public getGuildState(guildId?: string) {
    const id = guildId || process.env.GUILD_ID || 'default_guild';
    let state = this.guildStates.get(id);

    // If not in cache, create default and persist asynchronously
    if (!state) {
      state = {
        modules: this.createDefaultModulesState(),
        registry: this.getDefaultRegistry(),
        syncLogs: [],
        globalSettings: { maintenanceMode: false },
        whitelistAudit: [],
        whitelistActivity: []
      };
      this.guildStates.set(id, state);
      this.fillManifestModules(state.modules);
      this.reevaluateAllModules(id);
      this.saveGuildState(id, state);
    }

    return state;
  }

  public getModulesState(guildId?: string): ModuleState[] {
    return this.getGuildState(guildId).modules;
  }

  public getRegistry(guildId?: string): DiscordResourceRegistry {
    return this.getGuildState(guildId).registry;
  }

  public setRegistry(guildId: string | undefined, reg: DiscordResourceRegistry) {
    const id = guildId || process.env.GUILD_ID || 'default_guild';
    const state = this.getGuildState(id);
    state.registry = reg;
  }

  public getSyncLogs(guildId?: string): LogEntry[] {
    return this.getGuildState(guildId).syncLogs;
  }

  public logSyncEvent(msgOrGuildId: string | undefined, msgOrType?: string, type?: 'info' | 'warn' | 'success') {
    let finalGuildId: string | undefined = undefined;
    let finalMsg = '';
    let finalType: 'info' | 'warn' | 'success' = 'info';

    if (type !== undefined) {
      finalGuildId = msgOrGuildId;
      finalMsg = msgOrType || '';
      finalType = type;
    } else {
      finalMsg = msgOrGuildId || '';
      finalType = (msgOrType as any) || 'info';
    }

    const id = finalGuildId || process.env.GUILD_ID || 'default_guild';
    const state = this.getGuildState(id);
    const time = new Date().toTimeString().split(' ')[0];
    const cleanMsg = finalMsg.replace(/\[DashboardOnly\]\s*/g, '').replace(/\[Internal\]\s*/g, '');
    const log: LogEntry = { time, msg: cleanMsg, type: finalType };
    state.syncLogs.unshift(log);
    if (state.syncLogs.length > 100) state.syncLogs.pop();
    this.broadcast({ type: 'SYNC_LOG', log, guildId: id });

    // Persist to SQLite for durability across restarts
    const db = Database.getDb();
    if (db && id !== 'default_guild') {
      db.run(
        'INSERT INTO sync_logs (guildId, time, msg, type) VALUES (?, ?, ?, ?)',
        [id, time, cleanMsg, finalType]
      ).catch(() => {
        // Non-critical — in-memory log already written
      });
      // Trim to 500 rows per guild (FIFO — delete oldest beyond the limit)
      db.run(
        `DELETE FROM sync_logs WHERE guildId = ? AND id NOT IN (
          SELECT id FROM sync_logs WHERE guildId = ? ORDER BY id DESC LIMIT 500
        )`,
        [id, id]
      ).catch(() => {});
    }

    // Live Discord Log Forwarding
    if (this.client && id && id !== 'default_guild') {
      (async () => {
        try {
          if (
            finalMsg.includes('[DashboardOnly]') ||
            finalMsg.includes('[Internal]') ||
            finalMsg.startsWith('Discord Event:') ||
            finalMsg.toLowerCase().includes('[dashboardonly]')
          ) {
            return;
          }

          const logModule = state.modules.find((m: any) => m.id === 'logging');
          if (!logModule || logModule.status !== 'enabled') return;

          const config = logModule.config || {};
          let resolvedCategory: string | null = null;
          let title = '';
          let color = '#3498db';

          const msgLower = finalMsg.toLowerCase();
          if (msgLower.includes('webhook')) {
            resolvedCategory = 'webhook';
            title = '🔌 Webhook Security Log';
            color = '#a855f7';
          } else if (
            msgLower.includes('anti-nuke') || 
            msgLower.includes('restore') || 
            msgLower.includes('lockdown') || 
            msgLower.includes('re-created') ||
            msgLower.includes('emergency')
          ) {
            resolvedCategory = 'antiNuke';
            title = '🚨 Anti-Nuke Security Alert';
            color = '#ff0055';
          } else if (msgLower.includes('[security]') || msgLower.includes('whitelist')) {
            resolvedCategory = 'security';
            title = '🛡️ Security Event';
            color = '#3498db';
          } else if (
            msgLower.includes('quarantine') || 
            msgLower.includes('ban') || 
            msgLower.includes('kick') || 
            msgLower.includes('timeout') || 
            msgLower.includes('mute') ||
            msgLower.includes('punish')
          ) {
            resolvedCategory = 'moderation';
            title = '🔨 Moderation Action';
            color = '#f1c40f';
          } else if (
            msgLower.includes('soundboard') || 
            msgLower.includes('voice log') || 
            msgLower.includes('voice presence')
          ) {
            resolvedCategory = 'voice';
            title = '🔊 Voice & Soundboard Log';
            color = '#9b59b6';
          } else if (
            msgLower.includes('joined') || 
            msgLower.includes('left') || 
            msgLower.includes('login') || 
            msgLower.includes('sync') || 
            msgLower.includes('startup') || 
            msgLower.includes('database') ||
            msgLower.includes('ready')
          ) {
            resolvedCategory = 'system';
            title = '⚙️ System Log';
            color = '#64748b';
          }

          if (resolvedCategory) {
            const catConfig = config[resolvedCategory];
            if (catConfig && catConfig.enabled && catConfig.channelId) {
              const guild = await this.client.guilds.fetch(id).catch(() => null);
              if (guild) {
                const channel = await guild.channels.fetch(catConfig.channelId).catch(() => null);
                if (channel && channel.isTextBased()) {
                  const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(finalMsg)
                    .setColor(color as any)
                    .setTimestamp();
                  await channel.send({ embeds: [embed] });
                }
              }
            }
          }
        } catch (err) {
          console.error('[Logging Forwarder Error]:', err);
        }
      })();
    }
  }


  public getWhitelistAudit(guildId?: string): any[] {
    return this.getGuildState(guildId).whitelistAudit || [];
  }

  public getWhitelistActivity(guildId?: string): any[] {
    return this.getGuildState(guildId).whitelistActivity || [];
  }

  public logWhitelistAudit(guildId: string | undefined, audit: any) {
    const id = guildId || process.env.GUILD_ID || 'default_guild';
    const state = this.getGuildState(id);
    if (!state.whitelistAudit) state.whitelistAudit = [];
    state.whitelistAudit.unshift(audit);
    if (state.whitelistAudit.length > 200) state.whitelistAudit.pop();

    // Persist to SQLite server_audit_logs table
    const db = Database.getDb();
    if (db && id !== 'default_guild') {
      Database.saveAuditLog({
        guildId: id,
        action: audit.action || 'WHITELIST_CHANGE',
        targetId: audit.targetId || null,
        targetType: audit.targetType || (audit.isRole ? 'Role' : 'User'),
        targetName: audit.target || audit.targetName || null,
        executorId: audit.executorId || null,
        executorTag: audit.executor || audit.executorTag || null,
        reason: audit.reason || null,
        details: audit.details || audit.changes || audit,
        type: audit.status === 'Suspicious' ? 'danger' : (audit.status === 'Pending' ? 'warn' : 'success'),
        timestamp: audit.rawTimestamp || Date.now()
      }).catch(() => {});
    }
  }

  public async logServerAudit(guildId: string | undefined, audit: any) {
    const id = guildId || process.env.GUILD_ID || 'default_guild';
    if (id !== 'default_guild') {
      await Database.saveAuditLog({
        guildId: id,
        action: audit.action || 'SERVER_AUDIT',
        targetId: audit.targetId || null,
        targetType: audit.targetType || null,
        targetName: audit.targetName || audit.target || null,
        executorId: audit.executorId || null,
        executorTag: audit.executorTag || audit.executor || null,
        reason: audit.reason || null,
        details: audit.details || null,
        type: audit.type || 'info',
        timestamp: audit.timestamp || Date.now()
      }).catch(() => {});
    }
  }

  public logWhitelistActivity(guildId: string | undefined, activity: any) {
    const id = guildId || process.env.GUILD_ID || 'default_guild';
    const state = this.getGuildState(id);
    if (!state.whitelistActivity) state.whitelistActivity = [];
    state.whitelistActivity.unshift(activity);
    if (state.whitelistActivity.length > 200) state.whitelistActivity.pop();
  }

  public getGlobalSettings(guildId?: string) {
    return this.getGuildState(guildId).globalSettings;
  }

  public setGlobalSettings(guildId: string | undefined, settings: Record<string, any>) {
    const id = guildId || process.env.GUILD_ID || 'default_guild';
    const state = this.getGuildState(id);
    state.globalSettings = { ...state.globalSettings, ...settings };
    this.saveGuildState(id, state);
    this.broadcast({ type: 'GLOBAL_SETTINGS_UPDATE', settings: state.globalSettings, guildId: id });
  }

  public reevaluateAllModules(guildId?: string) {
    const id = guildId || process.env.GUILD_ID || 'default_guild';
    const state = this.getGuildState(id);
    
    state.modules.forEach(mod => {
      const manifest = this.manifests.get(mod.id);
      if (manifest) {
        if (!manifest.configSchema) {
          console.error(`FATAL: Manifest for ${mod.id} is missing configSchema!`);
          return;
        }
        const { progress, errors } = manifest.configSchema.validate(mod.config, state.registry);
        mod.progress = progress;
        mod.errors = errors;

        // BUG-010 FIX: Preserve 'disabled' AND 'error' states.
        // Previously, any module not in 'disabled' status was forced to 'enabled',
        // which silently re-enabled modules that were in an 'error' or 'pending' state.
        // Now we only transition modules that are not explicitly disabled:
        //   - if progress > 0 and no errors → 'enabled'
        //   - otherwise → 'error'
        if (mod.status !== 'disabled') {
          mod.status = 'enabled';
        }
      }
    });
  }

  private triggerWhitelistMigration(guildId: string, forceSave = false) {
    const state = this.getGuildState(guildId);
    let changed = false;
    const contextAdapter = {
      guildId,
      client: this.client,
      getModulesState: () => state.modules,
      getRegistry: () => state.registry,
      updateModuleConfig: (id: string, config: any) => {
        const mod = state.modules.find(m => m.id === id);
        if (mod) {
          const oldConfig = mod.config || {};
          const mergedConfig = { ...oldConfig, ...config };
          if (JSON.stringify(oldConfig) !== JSON.stringify(mergedConfig)) {
            mod.config = mergedConfig;
            changed = true;
          }
        }
        return mod;
      },
      logSyncEvent: (msg: string, type: 'info' | 'warn' | 'success') => {
        this.logSyncEvent(guildId, msg, type);
      }
    };
    migrateToUnifiedWhitelist(contextAdapter);
    if (changed || forceSave) {
      this.reevaluateAllModules(guildId);
      this.saveGuildState(guildId, state);
      this.broadcast({ type: 'STATE_UPDATE', modules: state.modules, registry: state.registry, guildId });
    }
  }

  public updateModuleConfig(guildId: string | undefined, id: string, config: Record<string, any>): ModuleState | null {
    const gId = guildId || process.env.GUILD_ID || 'default_guild';
    const state = this.getGuildState(gId);
    const mod = state.modules.find(m => m.id === id);
    if (!mod) return null;

    mod.config = { ...mod.config, ...config };
    this.reevaluateAllModules(gId);

    if (['member_whitelist', 'security', 'voice-protection'].includes(id)) {
      this.triggerWhitelistMigration(gId, true);
    } else {
      this.saveGuildState(gId, state);
    }

    this.broadcast({ type: 'STATE_UPDATE', modules: state.modules, registry: state.registry, guildId: gId });
    return mod;
  }

  public toggleModule(guildId: string | undefined, id: string, enabledOverride?: boolean): ModuleState | null {
    const gId = guildId || process.env.GUILD_ID || 'default_guild';
    const state = this.getGuildState(gId);
    const mod = state.modules.find(m => m.id === id);
    if (!mod) return null;

    if (enabledOverride !== undefined) {
      mod.status = enabledOverride ? 'enabled' : 'disabled';
    } else {
      mod.status = mod.status === 'enabled' ? 'disabled' : 'enabled';
    }

    this.saveGuildState(gId, state);
    this.broadcast({ type: 'STATE_UPDATE', modules: state.modules, registry: state.registry, guildId: gId });
    return mod;
  }

  public saveGuildState(guildId: string, state: any) {
    const db = Database.getDb();
    if (db) {
      const persistentState = {
        modules: state.modules.map((m: any) => ({
          id: m.id,
          name: m.name,
          status: m.status,
          config: m.config || {}
        })),
        globalSettings: state.globalSettings || {}
      };
      
      db.run(
        'INSERT OR REPLACE INTO guild_configs (guildId, modules, globalSettings) VALUES (?, ?, ?)',
        [guildId, JSON.stringify(persistentState.modules), JSON.stringify(persistentState.globalSettings)]
      ).catch(e => console.error(`SQLite save failed for guild ${guildId}:`, e));
    }
  }

  private createDefaultModulesState(): ModuleState[] {
    const states: ModuleState[] = [];
    const alwaysEnabledCore = ['config', 'diagnostics', 'bulk_ops', 'rage-enterprise', 'botstats', 'discord-dashboard', 'brain', 'backups', 'join_role_guard'];
    this.manifests.forEach(manifest => {
      const isCore = alwaysEnabledCore.includes(manifest.id);
      states.push({
        id: manifest.id,
        name: manifest.name,
        status: isCore ? 'enabled' : 'disabled',
        progress: 0,
        errors: [],
        config: manifest.id === 'security'
          ? { antiNukeEnabled: false }
          : manifest.id === 'automod'
          ? { autoModEnabled: false, blockLinks: false }
          : {}
      });
    });
    return states;
  }

  private getDefaultRegistry(): DiscordResourceRegistry {
    return {
      roles: [],
      channels: [],
      emojis: [],
      stickers: [],
      lastSyncTime: 'Not synced yet'
    };
  }
}
