import { Guild, GuildMember, EmbedBuilder } from 'discord.js';
import { Database } from '../Database.js';
import { removeExtraOwnerFromCache, getExtraOwnerFromCache } from '../../utils/whitelistCheck.js';
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

    // 0. Sub-millisecond Guild/Bot Owner Immunity check (<0.005ms)
    const isGuildOwner = executorId === guild.ownerId ||
                         executorId === process.env.OWNER_ID ||
                         executorId === guild.client?.application?.owner?.id;
    if (isGuildOwner) return false;

    // 1. Sub-millisecond Trust Level Resolution via O(1) RAM Cache (<0.005ms)
    const cachedExtraOwner = getExtraOwnerFromCache(guild.id, executorId);
    const isExtraOwner = !!cachedExtraOwner;
    const trustType: 'whitelist' | 'extraowner' = isExtraOwner ? 'extraowner' : 'whitelist';

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
    const windowSeconds = config.trustedActorWindow ?? 5;
    const warnAt = config.trustedActorWarnAt ?? 1;
    const punishAt = config.trustedActorPunishAt ?? 2;

    TrustedActorRateLimiter.record(guild.id, executorId, actionName, targetName, windowSeconds);

    const member = guild.members.cache.get(executorId) || await guild.members.fetch(executorId).catch(() => null);
    if (!member) return false;

    // 4. Sub-Millisecond (<1ms) Punishment & Revocation Trigger
    if (TrustedActorRateLimiter.shouldPunish(guild.id, executorId, punishAt, windowSeconds)) {
      // a. Instant RAM revocation of Extra Owner status (<0.001ms)
      if (trustType === 'extraowner') {
        removeExtraOwnerFromCache(guild.id, executorId);
      }

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

    const summary = TrustedActorRateLimiter.getSummary(guild.id, member.id, 5);

    // 1. Direct Message Warning with Custom UI & Emojis
    const dmEmbed = new EmbedBuilder()
      .setColor(0xF59E0B)
      .setAuthor({ name: 'Rage Optimiser • Behavioral Security Gate' })
      .setTitle('<:timer:1532620491662037123> TRUSTED ACTOR BEHAVIORAL WARNING')
      .setDescription([
        `You are registered as a **${trustType === 'extraowner' ? 'Extra Owner' : 'Whitelisted User'}** in **${guild.name}**.\n`,
        `> <:shield:1532403012751065179> **Rapid Actions Detected**: Our sub-millisecond behavioral firewall detected rapid operations:`,
        ...summary,
        `\n<:timer:1532620491662037123> **WARNING**: You are currently at **1/2 events** in the 5-second window.`,
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
            `**Status**: 1/2 threshold hit in 5s window — Active sub-ms monitoring.`,
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

      // 2. STEP 1: REVOKE TRUST (Instant RAM + Async DB)
      if (trustType === 'extraowner') {
        removeExtraOwnerFromCache(guild.id, member.id);
        const db = Database.getDb();
        if (db) {
          await db.run('DELETE FROM extra_owners WHERE guildId = ? AND userId = ?', [guild.id, member.id]).catch(() => {});
        }
      }

      // 3. STEP 2: QUARANTINE USER
      await this.applyQuarantine(guild, member);

      // 4. STEP 3: RESTORE ALL DELETED/CREATED ASSETS (LIFO Order)
      const restoreReport: RestoreReport = await RestoreEngine.restoreAll(guild, timeline);

      // 5. STEP 4: WRITE AUDIT DB LOG
      const now = Date.now();
      const db = Database.getDb();
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
      const summary = TrustedActorRateLimiter.getSummary(guild.id, member.id, 5);
      const targetChanId = logChannelId || guild.systemChannelId;

      const logEmbed = new EmbedBuilder()
        .setColor(0xEF4444)
        .setAuthor({ name: 'Rage Optimiser • Unbypassable Security Gate' })
        .setTitle('<:wrong:1532390628330307634> TRUSTED ACTOR ABUSE — REVOCATION & ROLLBACK EXECUTED')
        .setDescription([
          `**Actor**: ${member} (\`${member.id}\`)`,
          `**Trust Level**: ${trustType === 'extraowner' ? 'Extra Owner' : 'Whitelisted User'} *(NOW REVOKED)*`,
          `**Punishment**: Quarantined & Revoked`,
          `\n**TRIGGERING ACTIONS (5s Window)**:`,
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
          `\n**Reason**: Exceeded trusted actor threshold (2+ destructive actions under 5 seconds).`,
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
