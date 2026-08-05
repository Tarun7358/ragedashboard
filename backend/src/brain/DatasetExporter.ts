/**
 * DatasetExporter — Rage Brain
 *
 * Exports labeled brain_events to local .jsonl files
 * (one JSON object per line — standard ML training format).
 *
 * Supports two output modes:
 *   - classification: flat feature vector + label (for sklearn, XGBoost, distilbert)
 *   - instruct: conversational LLM format (for GPT-4 fine-tuning, Llama, Mistral)
 */

import fs from 'fs';
import path from 'path';
import { BrainStore, BrainEventRow } from './BrainStore.js';

const EXPORT_DIR = path.resolve(process.cwd(), '..', 'brain_exports');

function ensureExportDir(): void {
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }
}

function generateExportId(): string {
  return `export_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

// ── Classification format record ─────────────────────────────────────────────
function toClassificationRecord(row: BrainEventRow): object {
  const features = (() => {
    try { return JSON.parse(row.eventFeatures); } catch { return {}; }
  })();

  return {
    input: {
      eventType: row.eventType,
      actorEventRate_10s: row.actorEventRate_10s,
      actorEventRate_60s: row.actorEventRate_60s,
      guildEventRate_10s: row.guildEventRate_10s,
      actorBanRate: row.actorBanRate,
      actorRoleDeleteRate: row.actorRoleDeleteRate,
      actorChannelDeleteRate: row.actorChannelDeleteRate,
      actorIsOwner: row.actorIsOwner,
      actorIsBot: row.actorIsBot,
      actorAccountAgeDays: Number(row.actorAccountAgeDays.toFixed(2)),
      actorJoinedGuildDays: Number(row.actorJoinedGuildDays.toFixed(2)),
      actorHighestRolePosition: row.actorHighestRolePosition,
      actorWhitelisted: row.actorWhitelisted,
      actorPreviousFlags: row.actorPreviousFlags,
      ...features
    },
    output: row.label,
    confidence: row.labelConfidence,
    attackSessionId: row.attackSessionId ?? undefined,
    labelSource: row.labelSource,
    timestamp: row.timestamp
  };
}

// ── Instruct / LLM format record ─────────────────────────────────────────────
function toInstructRecord(row: BrainEventRow): object {
  const labelText: Record<string, string> = {
    attack: 'ATTACK — High-confidence threat. Immediate quarantine or ban recommended.',
    suspicious: 'SUSPICIOUS — Abnormal pattern detected. Monitor closely; may escalate.',
    benign: 'BENIGN — Normal administrative action. No intervention needed.',
    unlabeled: 'UNKNOWN — Insufficient data to classify.'
  };

  const eventSummary = [
    `Event type: ${row.eventType}.`,
    `Actor joined guild ${row.actorJoinedGuildDays.toFixed(1)} days ago.`,
    `Account age: ${row.actorAccountAgeDays.toFixed(1)} days.`,
    `Events in last 10s: ${row.actorEventRate_10s}. Events in last 60s: ${row.actorEventRate_60s}.`,
    row.actorRoleDeleteRate > 0 ? `Role deletions in 10s: ${row.actorRoleDeleteRate}.` : '',
    row.actorBanRate > 0 ? `Bans in 30s: ${row.actorBanRate}.` : '',
    row.actorChannelDeleteRate > 0 ? `Channel deletions in 10s: ${row.actorChannelDeleteRate}.` : '',
    `Actor is owner: ${row.actorIsOwner ? 'yes' : 'no'}. Whitelisted: ${row.actorWhitelisted ? 'yes' : 'no'}.`,
    `Previous flags on this actor: ${row.actorPreviousFlags}.`,
    `Guild-wide event rate in 10s: ${row.guildEventRate_10s}.`
  ].filter(Boolean).join(' ');

  return {
    messages: [
      {
        role: 'system',
        content: 'You are a Discord server security AI for Rage Optimiser. Analyze the following security event and classify it as ATTACK, SUSPICIOUS, or BENIGN. Provide a brief justification.'
      },
      {
        role: 'user',
        content: eventSummary
      },
      {
        role: 'assistant',
        content: labelText[row.label] ?? labelText['unlabeled']
      }
    ],
    metadata: {
      label: row.label,
      confidence: row.labelConfidence,
      labelSource: row.labelSource,
      eventType: row.eventType
    }
  };
}

export class DatasetExporter {

  /**
   * Main export function.
   * Exports labeled brain events to local .jsonl files.
   *
   * @param format       - 'classification' | 'instruct' | 'both'
   * @param labelFilter  - only export events with this label (undefined = all labeled)
   * @param limit        - max records per export (default 50,000)
   */
  public static async export(
    format: 'classification' | 'instruct' | 'both' = 'both',
    labelFilter?: 'attack' | 'suspicious' | 'benign',
    limit = 50_000
  ): Promise<{ filePaths: string[]; recordCount: number; exportId: string }> {
    ensureExportDir();

    const exportId = generateExportId();
    const ts = formatTimestamp(Date.now());
    const filePaths: string[] = [];

    // Fetch events from DB
    const events = await BrainStore.getExportableEvents(labelFilter, limit);
    const recordCount = events.length;

    if (recordCount === 0) {
      return { filePaths: [], recordCount: 0, exportId };
    }

    // Write classification format
    if (format === 'classification' || format === 'both') {
      const fname = path.join(EXPORT_DIR, `rage_brain_classification_${ts}.jsonl`);
      const lines = events.map(row => JSON.stringify(toClassificationRecord(row))).join('\n');
      fs.writeFileSync(fname, lines, 'utf-8');
      filePaths.push(fname);
    }

    // Write instruct format
    if (format === 'instruct' || format === 'both') {
      const fname = path.join(EXPORT_DIR, `rage_brain_instruct_${ts}.jsonl`);
      const lines = events.map(row => JSON.stringify(toInstructRecord(row))).join('\n');
      fs.writeFileSync(fname, lines, 'utf-8');
      filePaths.push(fname);
    }

    // Record export metadata in DB
    await BrainStore.recordExport(
      exportId, recordCount, filePaths.join('|'), format, labelFilter
    );

    console.log(`[DatasetExporter] Exported ${recordCount} records → ${filePaths.join(', ')}`);

    return { filePaths, recordCount, exportId };
  }

  public static getExportDir(): string {
    return EXPORT_DIR;
  }

  /**
   * List all existing export files with metadata
   */
  public static listExports(): { file: string; sizeKb: number; createdAt: Date }[] {
    try {
      ensureExportDir();
      return fs.readdirSync(EXPORT_DIR)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => {
          const fullPath = path.join(EXPORT_DIR, f);
          const stat = fs.statSync(fullPath);
          return {
            file: f,
            sizeKb: Math.round(stat.size / 1024),
            createdAt: stat.birthtime
          };
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch {
      return [];
    }
  }
}
