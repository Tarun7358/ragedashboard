import { Guild, GuildMember, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { Database } from '../Database.js';
import { removeExtraOwnerFromCache, getExtraOwnerFromCache, isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';
import { TrustedActorStateSnapshot, SnapshotRecord } from './TrustedActorStateSnapshot.js';
import { TrustedActorRateLimiter, AggregateThreatEvent } from './TrustedActorRateLimiter.js';
import { RestoreEngine, RestoreReport } from './RestoreEngine.js';
import { CentralLogger } from './CentralLogger.js';

export class TrustedActorAbuseHandler {
  private static processingLocks = new Set<string>();

  /**
   * Pre-Attribution Anti-Nuke Circuit Breaker Trigger.
   * Immediately (<1ms) engages narrowly-scoped containment when cross-event velocity explodes,
   * before audit log resolution completes or executor attribution is finalized.
   */
  public static async tripCircuitBreaker(
    guild: Guild,
    recentEvents: AggregateThreatEvent[],
    client?: any
  ): Promise<string> {
    if (!guild) return '';
    TrustedActorRateLimiter.markCircuitBreakerTripped(guild.id);

    const incidentId = `cb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const eventTimelineJson = JSON.stringify(recentEvents);
    const score = recentEvents.reduce((acc, e) => acc + (e.weight || 1), 0);
    const triggerReason = `Cross-Event Velocity Breach: ${recentEvents.length} destructive events (${score.toFixed(1)} velocity points in <5s)`;

    console.warn(`⚡ [Circuit Breaker Tripped] Guild "${guild.name}" (${guild.id}) — Incident ${incidentId}: ${triggerReason}`);

    // 1. Scoped Containment: Isolate dangerous permissions on public roles instantly
    try {
      if (guild.roles?.everyone) {
        const everyonePerms = guild.roles.everyone.permissions;
        const dangerous = [
          PermissionFlagsBits.Administrator,
          PermissionFlagsBits.ManageGuild,
          PermissionFlagsBits.ManageRoles,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.BanMembers,
          PermissionFlagsBits.KickMembers,
          PermissionFlagsBits.ManageWebhooks
        ];
        if (dangerous.some(p => everyonePerms.has(p))) {
          await guild.roles.everyone.setPermissions(
            everyonePerms.remove(dangerous),
            `Circuit Breaker Containment [${incidentId}]`
          ).catch(() => {});
        }
      }
    } catch (e) {}

    // 2. Persist Incident Record in SQLite (Zero-latency background write)
    const db = Database.getDb();
    if (db) {
      await db.run(
        `INSERT INTO security_incidents 
        (incidentId, guildId, threatScore, triggerReason, containmentPolicy, eventTimelineJson, executorAttributionStatus, createdAt) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          incidentId,
          guild.id,
          score,
          triggerReason,
          'scoped_containment_quarantine',
          eventTimelineJson,
          'pending_attribution',
          Date.now()
        ]
      ).catch(() => {});
    }

    // 3. Central Security Log & Alert
    CentralLogger.attack({
      guild,
      action: 'ANTI-NUKE CIRCUIT BREAKER TRIPPED',
      reason: triggerReason,
      executorId: 'PENDING_AUDIT_LOG_ATTRIBUTION',
      executorName: 'Unattributed Multi-Actor/High-Velocity Surge',
      result: 'success',
      note: `Incident ${incidentId}: Pre-attribution scoped containment engaged. Server restoration initiated.`,
      severity: 'critical'
    });

    // 4. Alert in Security Log Channel & Fire Restoration
    setImmediate(async () => {
      try {
        const logChannelId = await this.resolveSecurityLogChannel(guild);
        if (logChannelId) {
          const chan = guild.channels.cache.get(logChannelId) as any;
          if (chan && chan.isTextBased()) {
            const embed = new EmbedBuilder()
              .setColor(0xEF4444)
              .setAuthor({ name: 'Rage Optimiser • Pre-Attribution Circuit Breaker' })
              .setTitle('<a:warning:1546155193303957504> CIRCUIT BREAKER TRIPPED — SCOPED CONTAINMENT ACTIVE')
              .setDescription([
                `**Incident ID**: \`${incidentId}\``,
                `**Threat Score**: \`${score.toFixed(1)}\` (Threshold $\\ge$ 3.0 in 5s)`,
                `**Status**: Scoped Containment Active • Attribution Verifying`,
                `\n**Common Event Timeline**:`,
                ...recentEvents.map(e => `• \`${e.eventType}\` — **${e.targetName}** (+${e.weight}) [${new Date(e.timestamp).toISOString().substring(11, 19)}]`),
                `\n<a:loading:1546134304625528882> *Audit log executor analysis running in background. Server state restoration initiated via live snapshot.*`
              ].join('\n'))
              .setFooter({ text: 'Rage Optimiser • Zero-Trust Circuit Breaker' })
              .setTimestamp();
            await chan.send({ embeds: [embed] }).catch(() => {});
          }
        }

        // Fire UPM Live Snapshot Restoration
        const { restoreFromLiveSnapshot } = await import('../../modules/security/manifest.js');
        await restoreFromLiveSnapshot(guild, client || guild.client, {}).catch(() => {});
      } catch (e) {}
    });

    return incidentId;
  }

  /**
   * Updates an incident record in SQLite once audit log attributes the destructive actor.
   */
  public static async updateIncidentAttribution(
    incidentId: string,
    executorId: string,
    executorName: string
  ): Promise<void> {
    if (!incidentId) return;
    try {
      const db = Database.getDb();
      if (db) {
        await db.run(
          `UPDATE security_incidents 
           SET executorAttributionStatus = 'attributed', 
               triggerReason = triggerReason || ' | Attributed to ' || ? || ' (' || ? || ')' 
           WHERE incidentId = ?`,
          [executorName, executorId, incidentId]
        );
      }
    } catch {}
  }

  /**
   * Ultra-fast (<1ms) trusted actor event processor.
   * Leverages RAM cache and synchronous Map lookups to evaluate rate limits instant-fast.
   */
  public static async processTrustedActorEvent(
    guild: Guild,
    executorId: string,
    action: 'deleted' | 'created',
    assetType: 'channel' | 'role',
    targetObj: any,
    config: any = {}
  ): Promise<boolean> {
    if (!guild || !executorId || !targetObj) return false;
    if (config.trustedActorEnabled === false) return false;

    // 0. Resolve member for behavioral abuse tracking
    const member = guild.members.cache.get(executorId) || await guild.members.fetch(executorId).catch(() => null);
    if (!member) return false;

    // 0a. Check active backup restoration bypass
    try {
      const { activeBackupRestorations } = await import('../../modules/backups/manifest.js');
      if (activeBackupRestorations && activeBackupRestorations.has(guild.id)) {
        return false;
      }
    } catch {}

    // 0b. Sub-millisecond Guild Owner / Extra Owner / Bot Self Immunity check
    const isOwner = executorId === guild.ownerId ||
                    executorId === process.env.OWNER_ID ||
                    executorId === guild.client?.application?.owner?.id ||
                    executorId === guild.client?.user?.id;
    if (isOwner) return false;

    // Extra Owners have full unlimited immunity (no rate limits or warnings)
    const isExtraOwner = await isOwnerOrExtraOwner(executorId, guild);
    if (isExtraOwner) return false;

    const trustType: 'whitelist' = 'whitelist';

    // 2. Instant State Snapshot Capture (<0.01ms)
    let snapshotRecord: SnapshotRecord;
    if (assetType === 'channel') {
      snapshotRecord = action === 'deleted' 
        ? TrustedActorStateSnapshot.captureChannelBeforeDelete(targetObj)
        : TrustedActorStateSnapshot.recordChannelCreated(targetObj);
    } else {
      snapshotRecord = action === 'deleted'
        ? TrustedActorStateSnapshot.captureRoleBeforeDelete(targetObj)
        : TrustedActorStateSnapshot.recordRoleCreated(targetObj);
    }

    TrustedActorStateSnapshot.push(guild.id, executorId, snapshotRecord);

    // 3. Ultra-Fast Rate Limit Record (<0.005ms)
    const targetName = targetObj.name || (assetType === 'channel' ? targetObj.id : targetObj.id);
    const actionName = `${assetType}_${action}`;
    const windowSeconds = config.trustedActorWindow ?? 10;
    const warnAt = config.trustedActorWarnAt ?? 1;
    const punishAt = config.trustedActorPunishAt ?? 2;

    TrustedActorRateLimiter.record(guild.id, executorId, actionName, targetName, windowSeconds);

    if (!member) return false;

    // 4. Sub-Millisecond (<1ms) Punishment & Revocation Trigger
    if (TrustedActorRateLimiter.shouldPunish(guild.id, executorId, punishAt, windowSeconds)) {
      // Delete the illegally created asset immediately (<1ms) if it was a creation event
      if (action === 'created' && targetObj && typeof targetObj.delete === 'function') {
        await targetObj.delete('[Rage Optimiser] Trusted Actor Abuse — Rollback unauthorized creation').catch(() => {});
      }

      // a. Instant RAM revocation of Extra Owner status (<0.001ms)
      removeExtraOwnerFromCache(guild.id, executorId);

      // b. Instant activeQuarantines lock registration (<0.001ms) with auto-expiry
      const { activeQuarantines } = await import('../../modules/security/manifest.js');
      const quarantineKey = `${guild.id}_${executorId}`;
      activeQuarantines.add(quarantineKey);
      setTimeout(() => activeQuarantines.delete(quarantineKey), 15000);

      // c. Fire heavy network restoration & Discord API calls in non-blocking background queue
      setImmediate(() => {
        this.handlePunishment(guild, member, trustType, config.logChannelId).catch(() => {});
      });

      return true; // Revoked & quarantined in <1ms latency
    }

    if (TrustedActorRateLimiter.shouldWarn(guild.id, executorId, warnAt, punishAt, windowSeconds)) {
      await this.handleWarning(guild, member, trustType, config.logChannelId, { warnAt, punishAt, windowSeconds });
    }

    return false;
  }

  public static async handleWarning(
    guild: Guild,
    member: GuildMember,
    trustType: 'whitelist' | 'extraowner',
    logChannelId?: string,
    limits: { warnAt?: number; punishAt?: number; windowSeconds?: number } = {}
  ): Promise<void> {
    TrustedActorRateLimiter.markWarned(guild.id, member.id);

    const winSec = limits.windowSeconds ?? 10;
    const warnCount = limits.warnAt ?? 1;
    const punishCount = limits.punishAt ?? 2;
    const summary = TrustedActorRateLimiter.getSummary(guild.id, member.id, winSec);

    // 1. Direct Message Warning with Custom UI & Emojis
    const dmEmbed = new EmbedBuilder()
      .setColor(0xF59E0B)
      .setAuthor({ name: 'Rage Optimiser • Behavioral Security Gate' })
      .setTitle('<a:loading:1546134304625528882> TRUSTED ACTOR BEHAVIORAL WARNING')
      .setDescription([
        `You are registered as a **${trustType === 'extraowner' ? 'Extra Owner' : 'Whitelisted User'}** in **${guild.name}**.\n`,
        `> <a:success_check:1546134620087783526> **Rapid Actions Detected**: Our sub-millisecond behavioral firewall detected rapid operations:`,
        ...summary,
        `\n<a:loading:1546134304625528882> **WARNING**: You are currently at **${warnCount}/${punishCount} events** in the ${winSec}-second window.`,
        `If rapid destructive actions continue, your trusted status will be **AUTOMATICALLY REVOKED**, you will be **QUARANTINED**, and all changes will be **REVERSED**.`
      ].join('\n'))
      .setFooter({ text: 'Rage Optimiser • Unbypassable Security Engine' })
      .setTimestamp();

    await (typeof (member as any)?.send === 'function' ? (member as any).send({ embeds: [dmEmbed] }) : (member as any)?.user?.send?.({ embeds: [dmEmbed] }))?.catch?.(() => {});

    // 2. Log Channel Warning Entry with Custom UI
    const targetChanId = await this.resolveSecurityLogChannel(guild, logChannelId);
    if (targetChanId) {
      const channel = guild.channels.cache.get(targetChanId) as any;
      if (channel && channel.isTextBased()) {
        const logEmbed = new EmbedBuilder()
          .setColor(0xF59E0B)
          .setAuthor({ name: 'Rage Optimiser • Security Log' })
          .setTitle('<a:loading:1546134304625528882> TRUSTED ACTOR WARNING ISSUED')
          .setDescription([
            `**Actor**: ${member} (\`${member.id}\`)`,
            `**Trust Level**: ${trustType === 'extraowner' ? 'Extra Owner' : 'Whitelisted User'}`,
            `**Status**: ${warnCount}/${punishCount} threshold hit in ${winSec}s window — Active sub-ms monitoring.`,
            `\n**Recorded Action(s)**:`,
            ...summary
          ].join('\n'))
          .setFooter({ text: 'Rage Optimiser • Sub-Millisecond Firewall' })
          .setTimestamp();

        await channel.send({ embeds: [logEmbed] }).catch(() => {});
      }
    }
  }

  public static async handlePunishment(
    guild: Guild,
    member: GuildMember,
    trustType: 'whitelist' | 'extraowner',
    logChannelId?: string
  ): Promise<void> {
    const lockKey = `${guild.id}:${member.id}`;
    if (this.processingLocks.has(lockKey)) return;
    this.processingLocks.add(lockKey);

    try {
      // 1. Get snapshot timeline of all actions
      const timeline = TrustedActorStateSnapshot.getTimeline(guild.id, member.id);

      // 2. STEP 1: REVOKE ALL TRUST & WHITELIST (RAM + Async DB)
      removeExtraOwnerFromCache(guild.id, member.id);
      const db = Database.getDb();
      if (db) {
        await db.run('DELETE FROM extra_owners WHERE guildId = ? AND userId = ?', [guild.id, member.id]).catch(() => {});
        try {
          const row = await db.get<any>('SELECT configJson FROM guild_module_configs WHERE guildId = ? AND moduleId = ?', [guild.id, 'security']);
          if (row?.configJson) {
            const secCfg = JSON.parse(row.configJson);
            if (secCfg.whitelist) {
              secCfg.whitelist = secCfg.whitelist.filter((w: any) => (typeof w === 'string' ? w !== member.id : w.targetId !== member.id));
            }
            if (secCfg.upm?.whitelistUsers) {
              secCfg.upm.whitelistUsers = secCfg.upm.whitelistUsers.filter((u: string) => u !== member.id);
            }
            await db.run('UPDATE guild_module_configs SET configJson = ? WHERE guildId = ? AND moduleId = ?', [JSON.stringify(secCfg), guild.id, 'security']).catch(() => {});
          }

          const mwRow = await db.get<any>('SELECT configJson FROM guild_module_configs WHERE guildId = ? AND moduleId = ?', [guild.id, 'member_whitelist']);
          if (mwRow?.configJson) {
            const mwCfg = JSON.parse(mwRow.configJson);
            if (mwCfg.members) {
              mwCfg.members = mwCfg.members.filter((m: any) => (m.userId !== member.id && m.id !== member.id));
            }
            await db.run('UPDATE guild_module_configs SET configJson = ? WHERE guildId = ? AND moduleId = ?', [JSON.stringify(mwCfg), guild.id, 'member_whitelist']).catch(() => {});
          }
        } catch (e) {}
      }

      // 3. STEP 2: KICK & QUARANTINE USER / BAN & PURGE BOT
      if (member.user.bot) {
        try {
          const { deletePrebotEntry } = await import('../../modules/prebot_whitelist/manifest.js');
          await deletePrebotEntry(guild.id, member.id);
        } catch {}
        if (member.bannable) {
          await guild.members.ban(member.id, { reason: 'Trusted Actor Abuse Zero-Trust: Exceeded 2+ changes under 10 seconds' }).catch(() => {});
        }
      } else if (member.kickable) {
        await member.kick('Trusted Actor Abuse: Exceeded 2+ changes under 10 seconds').catch(() => {});
      }
      await this.applyQuarantine(guild, member);

      const summary = TrustedActorRateLimiter.getSummary(guild.id, member.id, 10);

      CentralLogger.attack({
        guild,
        action: 'TRUSTED ACTOR ABUSE',
        reason: `Exceeded 2+ rapid deletions/creations under 10s: ${summary.join(' • ')}`,
        executorId: member.id,
        executorName: member.user.username,
        executorIsBot: member.user.bot,
        result: 'success',
        note: 'Whitelist permanently revoked, actor quarantined, and server state restored via live snapshot.',
        severity: 'critical'
      });

      // 4. STEP 3: RESTORE ALL DELETED/CREATED ASSETS FAST (LIFO Order + Live Snapshot)
      const restoreReport: RestoreReport = await RestoreEngine.restoreAll(guild, timeline);
      const { restoreFromLiveSnapshot } = await import('../../modules/security/manifest.js');
      await restoreFromLiveSnapshot(guild, guild.client, {}).catch(() => {});

      // 5. STEP 4: WRITE AUDIT DB LOG
      const now = Date.now();
      if (db) {
        await db.run(
          `INSERT INTO trusted_actor_abuse_logs 
          (guildId, userId, trustType, revokedAt, warningsIssued, actionsTimeline, punishmentType, restoreReport) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            guild.id,
            member.id,
            trustType,
            now,
            1,
            JSON.stringify(timeline),
            'quarantine',
            JSON.stringify(restoreReport)
          ]
        ).catch(() => {});
      }

      // 6. STEP 5: LOG CHANNEL EMBED WITH CUSTOM EMOJIS & UI
      const targetChanId = await this.resolveSecurityLogChannel(guild, logChannelId);

      const logEmbed = new EmbedBuilder()
        .setColor(0xEF4444)
        .setAuthor({ name: 'Rage Optimiser • Unbypassable Security Gate' })
        .setTitle('<a:warning:1546155193303957504> TRUSTED ACTOR ABUSE — REVOCATION & ROLLBACK EXECUTED')
        .setDescription([
          `**Actor**: ${member} (\`${member.id}\`)`,
          `**Trust Level**: ${trustType === 'extraowner' ? 'Extra Owner' : 'Whitelisted User'} *(NOW REVOKED)*`,
          `**Punishment**: Quarantined & Revoked`,
          `\n**TRIGGERING ACTIONS (10s Window)**:`,
          ...summary,
          `\n<:ticks:1532620580266836148> **RESTORATION REPORT (${restoreReport.durationMs}ms)**:`,
          ...(restoreReport.restored.length > 0 ? restoreReport.restored.map(r => `> <:ticks:1532620580266836148> ${r}`) : ['> *No assets required restoration*']),
          ...(restoreReport.failed.length > 0 ? restoreReport.failed.map(f => `> <a:warning:1546155193303957504> ${f}`) : []),
          `\n<a:success_check:1546134620087783526> *Trusted status permanently revoked. Server state restored to pre-abuse conditions.*`
        ].join('\n'))
        .setFooter({ text: 'Rage Optimiser • Sub-Millisecond Firewall' })
        .setTimestamp();

      if (targetChanId) {
        const channel = guild.channels.cache.get(targetChanId) as any;
        if (channel && channel.isTextBased()) {
          await channel.send({ embeds: [logEmbed] }).catch(() => {});
        }
      }

      // 7. STEP 6: DM NOTIFICATION TO ACTOR WITH CUSTOM EMOJIS
      const dmEmbed = new EmbedBuilder()
        .setColor(0xEF4444)
        .setAuthor({ name: 'Rage Optimiser • Unbypassable Security Gate' })
        .setTitle('<a:warning:1546155193303957504> TRUSTED STATUS REVOKED & QUARANTINED')
        .setDescription([
          `Your **${trustType === 'extraowner' ? 'Extra Owner' : 'Whitelisted'}** status in **${guild.name}** has been **AUTOMATICALLY REVOKED**.`,
          `\n**Reason**: Exceeded trusted actor threshold (2+ destructive actions under 10 seconds).`,
          `\n<:ticks:1532620580266836148> **Restoration**: All deleted or created channels/roles have been **reversed and restored** to their original state.`
        ].join('\n'))
        .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
        .setTimestamp();

      await (typeof (member as any)?.send === 'function' ? (member as any).send({ embeds: [dmEmbed] }) : (member as any)?.user?.send?.({ embeds: [dmEmbed] }))?.catch?.(() => {});

      // Clear state
      TrustedActorRateLimiter.clear(guild.id, member.id);
      TrustedActorStateSnapshot.clear(guild.id, member.id);
    } finally {
      this.processingLocks.delete(lockKey);
    }
  }

  private static async resolveSecurityLogChannel(guild: Guild, providedChannelId?: string): Promise<string | null> {
    if (providedChannelId && guild.channels.cache.has(providedChannelId)) {
      return providedChannelId;
    }

    try {
      const db = Database.getDb();
      if (db) {
        // 1. Check logging module config for 'security' or 'antiNuke' category
        const logRow = await db.get<any>('SELECT configJson FROM guild_module_configs WHERE guildId = ? AND moduleId = ?', [guild.id, 'logging']).catch(() => null);
        if (logRow?.configJson) {
          const logCfg = JSON.parse(logRow.configJson);
          if (logCfg.security?.enabled !== false && logCfg.security?.channelId) {
            if (guild.channels.cache.has(logCfg.security.channelId)) return logCfg.security.channelId;
          }
          if (logCfg.antiNuke?.enabled !== false && logCfg.antiNuke?.channelId) {
            if (guild.channels.cache.has(logCfg.antiNuke.channelId)) return logCfg.antiNuke.channelId;
          }
        }

        // 2. Check security module config for logChannelId
        const secRow = await db.get<any>('SELECT configJson FROM guild_module_configs WHERE guildId = ? AND moduleId = ?', [guild.id, 'security']).catch(() => null);
        if (secRow?.configJson) {
          const secCfg = JSON.parse(secRow.configJson);
          if (secCfg.logChannelId && guild.channels.cache.has(secCfg.logChannelId)) return secCfg.logChannelId;
          if (secCfg.securityLogChannelId && guild.channels.cache.has(secCfg.securityLogChannelId)) return secCfg.securityLogChannelId;
        }
      }
    } catch (e) {}

    // 3. Fallbacks
    return providedChannelId || null;
  }

  private static async applyQuarantine(guild: Guild, member: GuildMember): Promise<void> {
    try {
      // Find or create . Quarantine role
      let qRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('quarantine'));
      if (!qRole) {
        qRole = await guild.roles.create({
          name: '. Quarantine',
          colors: { primaryColor: 0x343541 },
          reason: 'Rage Optimiser Automated Quarantine System'
        } as any);
      }

      if (qRole && member.manageable) {
        // Atomic role reset: replace all assignable roles with Quarantine role
        await member.roles.set([qRole.id], 'Trusted Actor Abuse — Automated Quarantine').catch(async () => {
          const rolesToRemove = member.roles.cache.filter(r => r.id !== guild.id && r.id !== qRole!.id);
          if (rolesToRemove.size > 0) {
            await member.roles.remove(rolesToRemove, 'Trusted Actor Abuse — Automated Quarantine').catch(() => {});
          }
          await member.roles.add(qRole, 'Trusted Actor Abuse — Automated Quarantine').catch(() => {});
        });
      }
    } catch (e) {
      // Non-fatal if bot hierarchy permissions restricted
    }
  }
}
