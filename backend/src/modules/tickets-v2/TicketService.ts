import { Database } from '../../core/Database.js';
import crypto from 'crypto';

export interface Ticket {
  id: string;
  ticketId: string;
  guildId: string;
  panelId: string;
  panelOptionId?: string;
  departmentId?: string;
  categoryId: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar?: string;
  status: 'open' | 'claimed' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  claimedById?: string;
  claimedByName?: string;
  claimedByAvatar?: string;
  claimedAt?: number;
  transferredAt?: number;
  transferredFrom?: string;
  transferredTo?: string;
  escalatedAt?: number;
  escalatedFrom?: string;
  escalatedTo?: string;
  reopenedAt?: number;
  reopenedCount: number;
  ratingValue?: number;
  ratingComment?: string;
  transcriptUrl?: string;
  messageCount: number;
  attachmentCount: number;
  participantsJson?: string;
  modalResponsesJson?: string;
  workflowState?: string;
  tagsJson?: string;
  channelId?: string;
  threadId?: string;
  forumId?: string;
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
  closedBy?: string;
  internalNotes?: string;
  isArchived: number;
  isDeleted: number;
}

export class TicketService {
  
  public static async createTicket(data: Partial<Ticket>): Promise<Ticket> {
    const db = Database.getDb();
    if (!db) throw new Error('Database connection is not available');

    const id = data.id || crypto.randomUUID();
    // Generate a simple readable ticket serial: e.g. TKT-0042
    const totalCountRow = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM tickets WHERE guildId = ?', [data.guildId]);
    const serial = String((totalCountRow?.count || 0) + 1).padStart(4, '0');
    const ticketId = `TKT-${serial}`;

    const now = Date.now();
    const ticket: Ticket = {
      id,
      ticketId,
      guildId: data.guildId!,
      panelId: data.panelId!,
      panelOptionId: data.panelOptionId || null as any,
      departmentId: data.departmentId || null as any,
      categoryId: data.categoryId || 'default',
      creatorId: data.creatorId!,
      creatorName: data.creatorName!,
      creatorAvatar: data.creatorAvatar || null as any,
      status: 'open',
      priority: data.priority || 'medium',
      claimedById: null as any,
      claimedByName: null as any,
      claimedByAvatar: null as any,
      claimedAt: null as any,
      reopenedCount: 0,
      messageCount: 0,
      attachmentCount: 0,
      participantsJson: JSON.stringify([data.creatorId]),
      modalResponsesJson: data.modalResponsesJson || '{}',
      workflowState: 'init',
      tagsJson: '[]',
      channelId: data.channelId || null as any,
      threadId: data.threadId || null as any,
      forumId: data.forumId || null as any,
      createdAt: now,
      updatedAt: now,
      isArchived: 0,
      isDeleted: 0,
      ...data
    };

    await db.run(
      `INSERT INTO tickets (
        id, ticketId, guildId, panelId, panelOptionId, departmentId, categoryId,
        creatorId, creatorName, creatorAvatar, status, priority, claimedById,
        claimedByName, claimedByAvatar, claimedAt, reopenedCount, messageCount,
        attachmentCount, participantsJson, modalResponsesJson, workflowState,
        tagsJson, channelId, threadId, forumId, createdAt, updatedAt, isArchived, isDeleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ticket.id, ticket.ticketId, ticket.guildId, ticket.panelId, ticket.panelOptionId, ticket.departmentId, ticket.categoryId,
        ticket.creatorId, ticket.creatorName, ticket.creatorAvatar, ticket.status, ticket.priority, ticket.claimedById,
        ticket.claimedByName, ticket.claimedByAvatar, ticket.claimedAt, ticket.reopenedCount, ticket.messageCount,
        ticket.attachmentCount, ticket.participantsJson, ticket.modalResponsesJson, ticket.workflowState,
        ticket.tagsJson, ticket.channelId, ticket.threadId, ticket.forumId, ticket.createdAt, ticket.updatedAt, ticket.isArchived, ticket.isDeleted
      ]
    );

    return ticket;
  }

  public static async getTicketById(id: string): Promise<Ticket | null> {
    const db = Database.getDb();
    if (!db) return null;
    return await db.get<Ticket>('SELECT * FROM tickets WHERE id = ? AND isDeleted = 0', [id]);
  }

  public static async getTicketByChannelId(channelId: string): Promise<Ticket | null> {
    const db = Database.getDb();
    if (!db) return null;
    return await db.get<Ticket>('SELECT * FROM tickets WHERE (channelId = ? OR threadId = ?) AND isDeleted = 0', [channelId, channelId]);
  }

  public static async updateTicket(id: string, updates: Partial<Ticket>): Promise<void> {
    const db = Database.getDb();
    if (!db) return;

    updates.updatedAt = Date.now();

    // BUG-002 FIX: Allowlist column names to prevent SQL injection via arbitrary
    // Object.keys() interpolation. Any key not in this set is silently dropped.
    const ALLOWED_TICKET_UPDATE_COLS = new Set([
      'status', 'claimedById', 'claimedByName', 'claimedByAvatar',
      'claimedAt', 'closedAt', 'closedBy', 'priority', 'updatedAt',
      'threadId', 'channelId', 'transcriptUrl', 'rating', 'feedback'
    ]);

    const keys = Object.keys(updates).filter(k => ALLOWED_TICKET_UPDATE_COLS.has(k));
    if (keys.length === 0) return;

    const sets = keys.map(k => `${k} = ?`).join(', ');
    const params = keys.map(k => (updates as any)[k]);
    params.push(id);

    await db.run(`UPDATE tickets SET ${sets} WHERE id = ?`, params);
  }

  public static async claimTicket(id: string, staffId: string, staffName: string, staffAvatar?: string): Promise<void> {
    await this.updateTicket(id, {
      status: 'claimed',
      claimedById: staffId,
      claimedByName: staffName,
      claimedByAvatar: staffAvatar || null as any,
      claimedAt: Date.now()
    });
  }

  public static async closeTicket(id: string, closedBy: string): Promise<void> {
    await this.updateTicket(id, {
      status: 'closed',
      closedAt: Date.now(),
      closedBy
    });
  }

  public static async logMessage(data: {
    ticketId: string;
    messageId: string;
    senderId: string;
    senderName: string;
    senderAvatar?: string;
    content: string;
    embedsJson?: string;
    attachmentsJson?: string;
    isStaff?: number;
    isInternal?: number;
  }): Promise<void> {
    const db = Database.getDb();
    if (!db) return;

    await db.run(
      `INSERT INTO ticket_messages (
        ticketId, messageId, senderId, senderName, senderAvatar, content, embedsJson, attachmentsJson, isStaff, isInternal, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.ticketId, data.messageId, data.senderId, data.senderName, data.senderAvatar || null,
        data.content, data.embedsJson || '[]', data.attachmentsJson || '[]', data.isStaff || 0, data.isInternal || 0, Date.now()
      ]
    );

    // Increment message count on ticket
    await db.run('UPDATE tickets SET messageCount = messageCount + 1, updatedAt = ? WHERE id = ?', [Date.now(), data.ticketId]);
  }

  public static async getTicketMessages(ticketId: string): Promise<any[]> {
    const db = Database.getDb();
    if (!db) return [];
    return await db.all('SELECT * FROM ticket_messages WHERE ticketId = ? ORDER BY timestamp ASC', [ticketId]);
  }

  // --- PANEL MANAGEMENT ---
  
  public static async savePanel(guildId: string, panelId: string, name: string, status: string, config: any, updatedBy: string): Promise<void> {
    const db = Database.getDb();
    if (!db) return;

    const existing = await db.get<{ version: number }>('SELECT version FROM ticket_panels WHERE id = ?', [panelId]);
    const nextVersion = existing ? existing.version + 1 : 1;
    const configStr = JSON.stringify(config);
    const now = Date.now();

    if (existing) {
      // Archive current version to history
      const currentConfigRow = await db.get<{ configJson: string; updatedAt: number }>('SELECT configJson, updatedAt FROM ticket_panels WHERE id = ?', [panelId]);
      if (currentConfigRow) {
        await db.run(
          'INSERT INTO ticket_panel_history (id, panelId, version, configJson, updatedBy, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
          [crypto.randomUUID(), panelId, existing.version, currentConfigRow.configJson, updatedBy, currentConfigRow.updatedAt]
        );
      }

      await db.run(
        'UPDATE ticket_panels SET name = ?, status = ?, version = ?, configJson = ?, updatedAt = ? WHERE id = ?',
        [name, status, nextVersion, configStr, now, panelId]
      );
    } else {
      await db.run(
        'INSERT INTO ticket_panels (id, guildId, name, status, version, configJson, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [panelId, guildId, name, status, 1, configStr, now, now]
      );
    }
  }

  public static async rollbackPanel(panelId: string, version: number, updatedBy: string): Promise<void> {
    const db = Database.getDb();
    if (!db) return;

    const historyRow = await db.get<{ configJson: string }>('SELECT configJson FROM ticket_panel_history WHERE panelId = ? AND version = ?', [panelId, version]);
    if (!historyRow) throw new Error('Historical panel version not found');

    const current = await db.get<{ name: string; status: string; version: number }>('SELECT name, status, version FROM ticket_panels WHERE id = ?', [panelId]);
    if (!current) throw new Error('Target panel does not exist');

    await this.savePanel(
      '', // guildId not needed for update
      panelId,
      current.name,
      current.status,
      JSON.parse(historyRow.configJson),
      updatedBy
    );
  }
}
