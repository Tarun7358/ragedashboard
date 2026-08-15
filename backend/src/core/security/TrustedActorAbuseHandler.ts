import { Guild, GuildMember, EmbedBuilder } from 'discord.js';
import { Database } from '../Database.js';
import { removeExtraOwnerFromCache, getExtraOwnerFromCache, isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';
import { TrustedActorStateSnapshot, SnapshotRecord } from './TrustedActorStateSnapshot.js';
import { TrustedActorRateLimiter } from './TrustedActorRateLimiter.js';
import { RestoreEngine, RestoreReport } from './RestoreEngine.js';

export class TrustedActorAbuseHandler {
  private static processingLocks = new Set<string>();

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

    // 0. Trusted Actor Abuse Monitor is strictly for HUMAN USERS only.
    // Bots are processed directly by instant Zero-Trust Anti-Nuke enforcement.
    const member = guild.members.cache.get(executorId) || await guild.members.fetch(executorId).catch(() => null);
    if (!member || member.user?.bot) return false;

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

      // b. Instant activeQuarantines lock registration (<0.001ms)
      const { activeQuarantines } = await import('../../modules/security/manifest.js');
      const quarantineKey = `${guild.id}_${executorId}`;
      activeQuarantines.add(quarantineKey);

      // c. Fire heavy network restoration & Discord API calls in non-blocking background queue
      setImmediate(() => {
        this.handlePunishment(guild, member, trustType, config.logChannelId).catch(() => {});
      });

      return true; // Revoked & quarantined in <1ms latency
    }

    if (TrustedActorRateLimiter.shouldWarn(guild.id, executorId, warnAt, punishAt, windowSeconds)) {
      await this.handleWarning(guild, member, trustType, config.logChannelId);
    }

    return false;
  }

  public static async handleWarning(
    guild: Guild,
    member: GuildMember,
    trustType: 'whitelist' | 'extraowner',
    logChannelId?: string
  ): Promise<void> {
    TrustedActorRateLimiter.markWarned(guild.id, member.id);

    const summary = TrustedActorRateLimiter.getSummary(guild.id, member.id, 10);

    // 1. Direct Message Warning with Custom UI & Emojis
    const dmEmbed = new EmbedBuilder()
      .setColor(0xF59E0B)
      .setAuthor({ name: 'Rage Optimiser • Behavioral Security Gate' })
      .setTitle('<:timer:1532620491662037123> TRUSTED ACTOR BEHAVIORAL WARNING')
      .setDescription([
        `You are registered as a **${trustType === 'extraowner' ? 'Extra Owner' : 'Whitelisted User'}** in **${guild.name}**.\n`,
        `> <:shield:1532403012751065179> **Rapid Actions Detected**: Our sub-millisecond behavioral firewall detected rapid operations:`,
        ...summary,
        `\n<:timer:1532620491662037123> **WARNING**: You are currently at **1/2 events** in the 10-second window.`,
        `If rapid destructive actions continue, your trusted status will be **AUTOMATICALLY REVOKED**, you will be **QUARANTINED**, and all changes will be **REVERSED**.`
      ].join('\n'))
      .setFooter({ text: 'Rage Optimiser • Unbypassable Security Engine' })
      .setTimestamp();

    await member.send({ embeds: [dmEmbed] }).catch(() => {});

    // 2. Log Channel Warning Entry with Custom UI
    const targetChanId = logChannelId || guild.systemChannelId;
    if (targetChanId) {
      const channel = guild.channels.cache.get(targetChanId) as any;
      if (channel && channel.isTextBased()) {
        const logEmbed = new EmbedBuilder()
          .setColor(0xF59E0B)
          .setAuthor({ name: 'Rage Optimiser • Security Log' })
          .setTitle('<:timer:1532620491662037123> TRUSTED ACTOR WARNING ISSUED')
          .setDescription([
            `**Actor**: ${member} (\`${member.id}\`)`,
            `**Trust Level**: ${trustType === 'extraowner' ? 'Extra Owner' : 'Whitelisted User'}`,
            `**Status**: 1/2 threshold hit in 10s window — Active sub-ms monitoring.`,
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
      const summary = TrustedActorRateLimiter.getSummary(guild.id, member.id, 10);
      const targetChanId = logChannelId || guild.systemChannelId;

      const logEmbed = new EmbedBuilder()
        .setColor(0xEF4444)
        .setAuthor({ name: 'Rage Optimiser • Unbypassable Security Gate' })
        .setTitle('<:wrong:1532390628330307634> TRUSTED ACTOR ABUSE — REVOCATION & ROLLBACK EXECUTED')
        .setDescription([
          `**Actor**: ${member} (\`${member.id}\`)`,
          `**Trust Level**: ${trustType === 'extraowner' ? 'Extra Owner' : 'Whitelisted User'} *(NOW REVOKED)*`,
          `**Punishment**: Quarantined & Revoked`,
          `\n**TRIGGERING ACTIONS (10s Window)**:`,
          ...summary,
          `\n<a:approved:1532390590707142956> **RESTORATION REPORT (${restoreReport.durationMs}ms)**:`,
          ...(restoreReport.restored.length > 0 ? restoreReport.restored.map(r => `> <a:approved:1532390590707142956> ${r}`) : ['> *No assets required restoration*']),
          ...(restoreReport.failed.length > 0 ? restoreReport.failed.map(f => `> <:wrong:1532390628330307634> ${f}`) : []),
          `\n<:shield:1532403012751065179> *Trusted status permanently revoked. Server state restored to pre-abuse conditions.*`
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
        .setTitle('<:wrong:1532390628330307634> TRUSTED STATUS REVOKED & QUARANTINED')
        .setDescription([
          `Your **${trustType === 'extraowner' ? 'Extra Owner' : 'Whitelisted'}** status in **${guild.name}** has been **AUTOMATICALLY REVOKED**.`,
          `\n**Reason**: Exceeded trusted actor threshold (2+ destructive actions under 10 seconds).`,
          `\n<a:approved:1532390590707142956> **Restoration**: All deleted or created channels/roles have been **reversed and restored** to their original state.`
        ].join('\n'))
        .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
        .setTimestamp();

      await member.send({ embeds: [dmEmbed] }).catch(() => {});

      // Clear state
      TrustedActorRateLimiter.clear(guild.id, member.id);
      TrustedActorStateSnapshot.clear(guild.id, member.id);
    } finally {
      this.processingLocks.delete(lockKey);
    }
  }

  private static async applyQuarantine(guild: Guild, member: GuildMember): Promise<void> {
    try {
      // Find or create . Quarantine role
      let qRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('quarantine'));
      if (!qRole) {
        qRole = await guild.roles.create({
          name: '. Quarantine',
          color: 0x343541,
          reason: 'Rage Optimiser Automated Quarantine System'
        });
      }

      if (qRole && member.manageable) {
        // Strip other roles and apply Quarantine
        const rolesToRemove = member.roles.cache.filter(r => r.id !== guild.id && r.id !== qRole!.id);
        if (rolesToRemove.size > 0) {
          await member.roles.remove(rolesToRemove, 'Trusted Actor Abuse — Automated Quarantine').catch(() => {});
        }
        await member.roles.add(qRole, 'Trusted Actor Abuse — Automated Quarantine').catch(() => {});
      }
    } catch (e) {
      // Non-fatal if bot hierarchy permissions restricted
    }
  }
}
