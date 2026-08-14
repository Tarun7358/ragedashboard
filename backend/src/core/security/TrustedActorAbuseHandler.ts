import { Guild, GuildMember, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Database } from '../Database.js';
import { removeExtraOwnerFromCache } from '../../utils/whitelistCheck.js';
import { TrustedActorStateSnapshot, SnapshotRecord } from './TrustedActorStateSnapshot.js';
import { TrustedActorRateLimiter } from './TrustedActorRateLimiter.js';
import { RestoreEngine, RestoreReport } from './RestoreEngine.js';

export class TrustedActorAbuseHandler {
  private static processingLocks = new Set<string>();

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

    // Guild Owner & Bot Developer Immunity (Guild Owner cannot hijack themselves)
    const isGuildOwner = executorId === guild.ownerId ||
                         executorId === process.env.OWNER_ID ||
                         executorId === guild.client?.application?.owner?.id;
    if (isGuildOwner) return false;

    // Determine trust type
    const { isOwnerOrExtraOwner } = await import('../../utils/whitelistCheck.js');
    const isExtraOwner = await isOwnerOrExtraOwner(executorId, guild) && executorId !== guild.ownerId;
    const trustType: 'whitelist' | 'extraowner' = isExtraOwner ? 'extraowner' : 'whitelist';

    // 1. Capture snapshot record
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

    // 2. Record event in rate limiter
    const targetName = targetObj.name || (assetType === 'channel' ? targetObj.id : targetObj.id);
    const actionName = `${assetType}_${action}`;
    const windowSeconds = config.trustedActorWindow ?? 5;
    const warnAt = config.trustedActorWarnAt ?? 1;
    const punishAt = config.trustedActorPunishAt ?? 2;

    TrustedActorRateLimiter.record(guild.id, executorId, actionName, targetName, windowSeconds);

    const member = guild.members.cache.get(executorId) || await guild.members.fetch(executorId).catch(() => null);
    if (!member) return false;

    // 3. Check punishment threshold (2+ actions under 5 seconds by default)
    if (TrustedActorRateLimiter.shouldPunish(guild.id, executorId, punishAt, windowSeconds)) {
      await this.handlePunishment(guild, member, trustType, config.logChannelId);
      return true; // Threshold triggered & handled
    }

    // 4. Check warning threshold (1 action under 5 seconds by default)
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

    // 1. Direct Message Warning to Actor
    const dmEmbed = new EmbedBuilder()
      .setColor(0xF59E0B)
      .setAuthor({ name: 'Rage Optimiser Security Monitor' })
      .setTitle('⚠️ TRUSTED ACTOR BEHAVIORAL WARNING')
      .setDescription([
        `You are registered as a **${trustType === 'extraowner' ? 'Extra Owner' : 'Whitelisted User'}** in **${guild.name}**.\n`,
        `> 🛡️ **Rapid Actions Detected**: Our behavioral firewall detected rapid channel/role operations:`,
        ...summary,
        `\n⚠️ **WARNING**: You are currently at **1/2 events** in the 5-second window.`,
        `If rapid destructive actions continue, your trusted status will be **AUTOMATICALLY REVOKED**, you will be **QUARANTINED**, and all changes will be **REVERSED**.`
      ].join('\n'))
      .setFooter({ text: 'Rage Optimiser • Trusted Actor Protection Engine' })
      .setTimestamp();

    await member.send({ embeds: [dmEmbed] }).catch(() => {});

    // 2. Log Channel Warning Entry
    const targetChanId = logChannelId || guild.systemChannelId;
    if (targetChanId) {
      const channel = guild.channels.cache.get(targetChanId) as any;
      if (channel && channel.isTextBased()) {
        const logEmbed = new EmbedBuilder()
          .setColor(0xF59E0B)
          .setAuthor({ name: 'Rage Optimiser Security Log' })
          .setTitle('⚠️ TRUSTED ACTOR WARNING ISSUED')
          .setDescription([
            `**Actor**: ${member} (\`${member.id}\`)`,
            `**Trust Level**: ${trustType === 'extraowner' ? 'Extra Owner' : 'Whitelisted User'}`,
            `**Status**: 1/2 threshold hit in 5s window — Monitoring active.`,
            `\n**Recorded Action(s)**:`,
            ...summary
          ].join('\n'))
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

      // 2. STEP 1: REVOKE TRUST (DB + RAM)
      if (trustType === 'extraowner') {
        const db = Database.getDb();
        if (db) {
          await db.run('DELETE FROM extra_owners WHERE guildId = ? AND userId = ?', [guild.id, member.id]).catch(() => {});
        }
        removeExtraOwnerFromCache(guild.id, member.id);
      }

      // 3. STEP 2: QUARANTINE USER
      await this.applyQuarantine(guild, member);

      // 4. STEP 3: RESTORE ALL DELETED/CREATED ASSETS
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

      // 6. STEP 5: LOG CHANNEL EMBED
      const summary = TrustedActorRateLimiter.getSummary(guild.id, member.id, 5);
      const targetChanId = logChannelId || guild.systemChannelId;

      const logEmbed = new EmbedBuilder()
        .setColor(0xEF4444)
        .setAuthor({ name: 'Rage Optimiser Security Gate' })
        .setTitle('🚨 TRUSTED ACTOR ABUSE — REVOCATION & ROLLBACK EXECUTED')
        .setDescription([
          `**Actor**: ${member} (\`${member.id}\`)`,
          `**Trust Level**: ${trustType === 'extraowner' ? 'Extra Owner' : 'Whitelisted User'} *(NOW REVOKED)*`,
          `**Punishment**: Quarantined & Revoked`,
          `\n**TRIGGERING ACTIONS (5s Window)**:`,
          ...summary,
          `\n**🔄 RESTORATION REPORT (${restoreReport.durationMs}ms)**:`,
          ...(restoreReport.restored.length > 0 ? restoreReport.restored.map(r => `> ✅ ${r}`) : ['> *No assets required restoration*']),
          ...(restoreReport.failed.length > 0 ? restoreReport.failed.map(f => `> ❌ ${f}`) : []),
          `\n📌 *Trusted status permanently revoked. Server state restored to pre-abuse conditions.*`
        ].join('\n'))
        .setTimestamp();

      if (targetChanId) {
        const channel = guild.channels.cache.get(targetChanId) as any;
        if (channel && channel.isTextBased()) {
          await channel.send({ embeds: [logEmbed] }).catch(() => {});
        }
      }

      // 7. STEP 6: DM NOTIFICATION TO ACTOR
      const dmEmbed = new EmbedBuilder()
        .setColor(0xEF4444)
        .setAuthor({ name: 'Rage Optimiser Security Gate' })
        .setTitle('🚨 TRUSTED STATUS REVOKED & QUARANTINED')
        .setDescription([
          `Your **${trustType === 'extraowner' ? 'Extra Owner' : 'Whitelisted'}** status in **${guild.name}** has been **AUTOMATICALLY REVOKED**.`,
          `\n**Reason**: Exceeded trusted actor threshold (2+ destructive actions under 5 seconds).`,
          `\n**Restoration**: All deleted or created channels/roles have been **reversed and restored** to their original state.`
        ].join('\n'))
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
