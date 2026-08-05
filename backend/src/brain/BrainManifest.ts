/**
 * BrainManifest — Rage Optimiser Module
 *
 * Provides r!brain command suite for managing and inspecting the Rage Brain AI layer.
 *
 * All commands are gated to isOwnerOrExtraOwner.
 * No public visibility — this is an internal intelligence tool.
 */

import { ModuleManifest, DiscordResourceRegistry } from '../core/types.js';
import {
  buildLimeOverviewCard, createLimeEmbed, Colors,
  VERIFIED_ICON, WRONG_ICON, CONFIG_ICON, SHIELD_ICON, INFO_ICON, BOT_ICON, TIMER_ICON
} from '../core/UIFactory.js';
import { BrainStore } from './BrainStore.js';
import { DatasetExporter } from './DatasetExporter.js';
import { PrefixRegistry } from '../core/prefix/PrefixRegistry.js';

const BRAIN_ICON = '<:bot:1532621107746570391>';
const VIP_ICON = '<:vip:1532620837117759508>';

export const BrainManifest: ModuleManifest = {
  id: 'brain',
  name: 'Rage Brain Intelligence Layer',
  version: '1.0.0',
  description: 'Passive AI/ML data collection engine — silently observes, fingerprints, and learns attack patterns.',
  configSchema: {
    requiredFields: [],
    validate: () => ({ progress: 100, errors: [] })
  },
  commands: [],  // No slash commands — purely prefix/internal
  events: []
};

// ── r!brain Command Suite ─────────────────────────────────────────────────────

export function registerBrainCommands(): void {
  // r!brain status
  PrefixRegistry.register({
    name: 'brain',
    description: 'Rage Brain AI intelligence layer status and management',
    category: 'Enterprise',
    usage: 'r!brain <status|export|actor|sessions|purge>',
    aliases: ['ai', 'rageBrain'],
    userPermissions: [],
    cooldownSeconds: 5,
    moduleOwnerId: 'brain',
    dangerLevel: 'Low',
    hidden: false,
    examples: ['r!brain status', 'r!brain export', 'r!brain actor @user', 'r!brain sessions'],
    subcommands: [
      { name: 'status', description: 'View brain data collection stats' },
      { name: 'export', description: 'Export training dataset to local JSONL files' },
      { name: 'actor', description: 'View behavioral risk profile for a user' },
      { name: 'sessions', description: 'View recent confirmed attack sessions' },
      { name: 'purge', description: 'Purge all brain data for this guild (GDPR)' }
    ],
    execute: async (message: any, args: string[], extra: any) => {
      const { isOwnerOrExtraOwner } = await import('../utils/whitelistCheck.js');
      const allowed = await isOwnerOrExtraOwner(message.author.id, message.guild);
      if (!allowed) {
        return message.reply({
          embeds: [createLimeEmbed({
            title: `${WRONG_ICON} Access Denied`,
            description: 'The Rage Brain command suite is restricted to **Server Owner** and **Extra Owners** only.',
            color: Colors.DANGER
          })]
        }).catch(() => {});
      }

      const sub = args[0]?.toLowerCase() ?? 'status';
      const guildId = message.guild?.id;

      switch (sub) {

        // ── r!brain status ──────────────────────────────────────────────────
        case 'status':
        case undefined: {
          const stats = await BrainStore.getStats(guildId);
          const globalStats = guildId ? await BrainStore.getStats() : stats;

          const embed = buildLimeOverviewCard({
            title: 'RAGE BRAIN — AI INTELLIGENCE ENGINE',
            subtitle: 'PHASE 1: PASSIVE DATA COLLECTION & LEARNING',
            color: Colors.BRAND,
            sections: [
              {
                title: `${BRAIN_ICON} THIS SERVER — DATA CORPUS`,
                items: [
                  `Total Events Captured: \`${stats.totalEvents.toLocaleString()}\``,
                  `Unique Actors Profiled: \`${stats.uniqueActors.toLocaleString()}\``,
                  `Attack Sessions Logged: \`${stats.attackSessions.toLocaleString()}\``,
                ]
              },
              {
                title: `${SHIELD_ICON} LABEL DISTRIBUTION`,
                items: [
                  `${VERIFIED_ICON} Attack (Confirmed): \`${stats.labeledAttack.toLocaleString()}\``,
                  `${TIMER_ICON} Suspicious (Flagged): \`${stats.labeledSuspicious.toLocaleString()}\``,
                  `${CONFIG_ICON} Benign (Normal ops): \`${stats.labeledBenign.toLocaleString()}\``,
                  `${INFO_ICON} Unlabeled: \`${stats.unlabeled.toLocaleString()}\``,
                ]
              },
              {
                title: `${BOT_ICON} SYSTEM STATUS`,
                items: [
                  'Mode: **Passive Collection Only** (bot behavior unchanged)',
                  'Retention Policy: **90 days** (auto-purge daily @ 03:00 UTC)',
                  'Export Location: `../brain_exports/` (local disk)',
                  'Phase 2 (LLM Inference): **Coming Soon**'
                ]
              }
            ],
            footerText: 'Rage Brain v1.0 • Passive Intelligence Layer'
          });

          return message.reply({ embeds: [embed] }).catch(() => {});
        }

        // ── r!brain export ──────────────────────────────────────────────────
        case 'export': {
          const format = (args[1] as any) ?? 'both';
          const validFormats = ['classification', 'instruct', 'both'];
          const exportFormat = validFormats.includes(format) ? format : 'both';

          const processingEmbed = createLimeEmbed({
            title: `${TIMER_ICON} Exporting Training Dataset...`,
            description: `Exporting labeled events in **\`${exportFormat}\`** format.\nThis may take a moment for large datasets.`,
            color: Colors.WARN
          });
          const msg = await message.reply({ embeds: [processingEmbed] }).catch(() => null);

          const result = await DatasetExporter.export(exportFormat as any).catch((err: any) => {
            console.error('[BrainManifest] export error:', err.message);
            return null;
          });

          if (!result || result.recordCount === 0) {
            const noDataEmbed = createLimeEmbed({
              title: `${WRONG_ICON} No Exportable Data`,
              description: 'No labeled events found. The Brain needs time to collect and label data.\n\nRun `r!brain status` to check current collection progress.',
              color: Colors.DANGER
            });
            return msg
              ? msg.edit({ embeds: [noDataEmbed] }).catch(() => {})
              : message.reply({ embeds: [noDataEmbed] }).catch(() => {});
          }

          const exports = DatasetExporter.listExports().slice(0, 3);
          const fileLines = exports.map(e =>
            `• \`${e.file}\` — **${e.sizeKb} KB** — <t:${Math.floor(e.createdAt.getTime() / 1000)}:R>`
          );

          const successEmbed = buildLimeOverviewCard({
            title: 'TRAINING DATASET EXPORTED',
            subtitle: 'LOCAL JSONL FILES READY FOR MODEL TRAINING',
            color: Colors.SUCCESS,
            sections: [
              {
                title: `${VERIFIED_ICON} EXPORT SUMMARY`,
                items: [
                  `Records Exported: \`${result.recordCount.toLocaleString()}\``,
                  `Format: \`${exportFormat}\``,
                  `Export ID: \`${result.exportId}\``,
                  `Location: \`../brain_exports/\``
                ]
              },
              {
                title: `${CONFIG_ICON} RECENT EXPORT FILES`,
                items: fileLines.length > 0 ? fileLines : ['No files found']
              }
            ],
            footerText: 'Rage Brain • Training Data Ready'
          });

          return msg
            ? msg.edit({ embeds: [successEmbed] }).catch(() => {})
            : message.reply({ embeds: [successEmbed] }).catch(() => {});
        }

        // ── r!brain actor <@user | userId> ─────────────────────────────────
        case 'actor': {
          const target = message.mentions.users.first() ?? null;
          const targetId = target?.id ?? args[1];

          if (!targetId) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: `${WRONG_ICON} Missing User`,
                description: 'Usage: `r!brain actor @user`',
                color: Colors.DANGER
              })]
            }).catch(() => {});
          }

          const profile = await BrainStore.getActorProfile(guildId, targetId);

          if (!profile) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: `${INFO_ICON} No Profile Found`,
                description: `No brain data collected for **<@${targetId}>** yet.\nThis actor has either had no tracked events or was recently purged.`,
                color: Colors.MUTED
              })]
            }).catch(() => {});
          }

          const riskColor = profile.riskScore >= 0.9 ? Colors.DANGER
            : profile.riskScore >= 0.6 ? Colors.WARN
            : Colors.SUCCESS;

          const riskLabel = profile.riskScore >= 0.9 ? `${WRONG_ICON} CRITICAL`
            : profile.riskScore >= 0.6 ? `${TIMER_ICON} HIGH`
            : `${VERIFIED_ICON} LOW`;

          const embed = buildLimeOverviewCard({
            title: 'RAGE BRAIN — ACTOR RISK PROFILE',
            subtitle: `BEHAVIORAL INTELLIGENCE REPORT`,
            color: riskColor,
            sections: [
              {
                title: `${SHIELD_ICON} RISK ASSESSMENT`,
                items: [
                  `Risk Score: \`${(profile.riskScore * 100).toFixed(1)}%\` — **${riskLabel}**`,
                  `Total Events Logged: \`${profile.totalEvents.toLocaleString()}\``,
                  `Times Flagged: \`${profile.totalFlags}\``,
                  `Confirmed Attacks: \`${profile.totalConfirmedAttacks}\``,
                  `Last Seen: <t:${Math.floor(profile.lastSeen / 1000)}:R>`
                ]
              }
            ],
            footerText: `Rage Brain • Actor: ${targetId}`
          });

          return message.reply({ embeds: [embed] }).catch(() => {});
        }

        // ── r!brain sessions ────────────────────────────────────────────────
        case 'sessions': {
          const sessions = await BrainStore.getRecentSessions(guildId, 10);

          if (sessions.length === 0) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: `${INFO_ICON} No Attack Sessions`,
                description: 'No confirmed attack sessions recorded yet.\nAttack sessions are logged when the anti-nuke system fires.',
                color: Colors.MUTED
              })]
            }).catch(() => {});
          }

          const sessionLines = sessions.map((s, i) => {
            const attackers = JSON.parse(s.attackerIds || '[]') as string[];
            const duration = s.endedAt ? Math.round((s.endedAt - s.startedAt) / 1000) : null;
            return [
              `**Session ${i + 1}** — <t:${Math.floor(s.startedAt / 1000)}:R>`,
              `• Events: \`${s.eventCount}\` | Severity: \`${s.severity}\` | Outcome: \`${s.outcome ?? 'unknown'}\``,
              `• Attackers: ${attackers.slice(0, 3).map(id => `<@${id}>`).join(', ')}${attackers.length > 3 ? ` +${attackers.length - 3} more` : ''}`,
              duration ? `• Duration: \`${duration}s\`` : ''
            ].filter(Boolean).join('\n');
          });

          const embed = buildLimeOverviewCard({
            title: 'RAGE BRAIN — ATTACK SESSION LOG',
            subtitle: 'LAST 10 CONFIRMED SECURITY INCIDENTS',
            color: Colors.DANGER,
            sections: [
              {
                title: `${SHIELD_ICON} RECENT ATTACK SESSIONS`,
                items: sessionLines
              }
            ],
            footerText: `Rage Brain • ${sessions.length} sessions shown`
          });

          return message.reply({ embeds: [embed] }).catch(() => {});
        }

        // ── r!brain purge ───────────────────────────────────────────────────
        case 'purge': {
          const confirm = args[1]?.toLowerCase();
          if (confirm !== 'confirm') {
            return message.reply({
              embeds: [createLimeEmbed({
                title: `${SHIELD_ICON} Confirm Guild Data Purge`,
                description: [
                  `This will **permanently delete** all Rage Brain data for **${message.guild?.name}**:`,
                  `• All captured event records`,
                  `• All actor behavioral profiles`,
                  `• All attack session logs`,
                  `\nType \`r!brain purge confirm\` to proceed.`,
                  `\n*This action cannot be undone.*`
                ].join('\n'),
                color: Colors.WARN
              })]
            }).catch(() => {});
          }

          const result = await BrainStore.purgeGuild(guildId);

          const embed = createLimeEmbed({
            title: `${VERIFIED_ICON} Guild Brain Data Purged`,
            description: [
              `All Rage Brain data for **${message.guild?.name}** has been deleted:`,
              `• Events deleted: \`${result.events.toLocaleString()}\``,
              `• Actor profiles deleted: \`${result.actors.toLocaleString()}\``,
              `• Attack sessions deleted: \`${result.sessions.toLocaleString()}\``,
            ].join('\n'),
            color: Colors.SUCCESS
          });

          return message.reply({ embeds: [embed] }).catch(() => {});
        }

        default: {
          return message.reply({
            embeds: [createLimeEmbed({
              title: `${WRONG_ICON} Unknown Subcommand`,
              description: `Available subcommands: \`status\`, \`export\`, \`actor\`, \`sessions\`, \`purge\`\n\nUsage: \`r!brain <subcommand>\``,
              color: Colors.DANGER
            })]
          }).catch(() => {});
        }
      }
    }
  });
}
