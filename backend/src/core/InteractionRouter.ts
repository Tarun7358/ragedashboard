/**
 * InteractionRouter — Rage Optimiser Enterprise
 *
 * Single entry point for all Discord interactions.
 * Replaces the two independent `interactionCreate` listeners that previously
 * existed in Gateway.ts (lines 576 and 1126), eliminating the race condition
 * and double-dispatch risk for help component interactions.
 *
 * Flow:
 *   interactionCreate
 *     └── InteractionRouter.route()
 *           ├── isAutocomplete()      → handleAutocomplete()
 *           ├── isChatInputCommand()  → handleSlashCommand()
 *           ├── isButton()            → handleButton()
 *           ├── isAnySelectMenu()     → handleSelectMenu()
 *           └── isModalSubmit()       → handleModal()
 *
 * Every interaction is acknowledged exactly once.
 * All routing logic that was previously inlined in Gateway is now here.
 */

import { PermissionFlagsBits } from 'discord.js';
import { PayloadFormatter } from './PayloadFormatter.js';
import { PrefixHelpCenter } from './prefix/PrefixHelpCenter.js';
import { AnalyticsService } from './AnalyticsService.js';
import { protections } from '../utils/whitelistCheck.js';

export type RouterDispatch = (eventName: string, ...args: any[]) => Promise<void>;
export type RouterWrap = (interaction: any) => any;

export interface RouterContext {
  dispatchEvent: RouterDispatch;
  wrapInteraction: RouterWrap;
  manifests?: any[];
  getManifests?: () => any[];
  logSyncEvent: (msg: string, type?: 'info' | 'warn' | 'success') => void;
  getModulesState: (guildId?: string) => any[];
  getRegistry: (guildId?: string) => any;
  getGlobalSettings: (guildId?: string) => Record<string, any>;
  updateModuleConfig: (guildId: string | undefined, id: string, config: Record<string, any>) => any;
}

export class InteractionRouter {
  private ctx: RouterContext;

  constructor(ctx: RouterContext) {
    this.ctx = ctx;
  }

  public get manifests(): any[] {
    if (this.ctx.getManifests) {
      return this.ctx.getManifests();
    }
    return this.ctx.manifests || [];
  }

  public updateManifests(manifests: any[]) {
    this.ctx.manifests = manifests;
  }

  /**
   * Route an incoming Discord interaction to the appropriate handler.
   * This is the single `interactionCreate` handler registered by Gateway.
   */
  public async route(rawInteraction: any): Promise<void> {
    try {
      if (rawInteraction.isAutocomplete()) {
        await this.handleAutocomplete(rawInteraction);
        return;
      }

      const interaction = this.ctx.wrapInteraction(rawInteraction);

      if (interaction.isChatInputCommand()) {
        await this.handleSlashCommand(interaction);
      } else if (interaction.isButton()) {
        await this.handleButton(interaction);
      } else if (interaction.isAnySelectMenu()) {
        await this.handleSelectMenu(interaction);
      } else if (interaction.isModalSubmit()) {
        await this.handleModal(interaction);
      }
    } catch (err: any) {
      console.error('[InteractionRouter] Unhandled error during routing:', err);
    }
  }

  // ── Autocomplete ────────────────────────────────────────────────────────

  private async handleAutocomplete(interaction: any): Promise<void> {
    const focusedValue = interaction.options.getFocused();
    const filtered = protections.filter((p: any) =>
      p.label.toLowerCase().includes(focusedValue.toLowerCase()) ||
      p.key.toLowerCase().includes(focusedValue.toLowerCase())
    );
    await interaction.respond(
      filtered.slice(0, 25).map((choice: any) => ({ name: choice.label, value: choice.key }))
    ).catch(console.error);
  }

  // ── Slash Commands ──────────────────────────────────────────────────────

  private async handleSlashCommand(interaction: any): Promise<void> {
    const { commandName } = interaction;
    const cmdGuildId = interaction.guildId || undefined;

    // Maintenance mode gate
    const settings = this.ctx.getGlobalSettings(cmdGuildId);
    if (settings.maintenanceMode) {
      const isOwner = interaction.user.id === interaction.guild?.ownerId ||
                      interaction.user.id === interaction.client.application?.owner?.id ||
                      ((interaction.client.application?.owner as any)?.members?.has?.(interaction.user.id));
      const member = interaction.member;
      let isAdmin = isOwner;
      if (!isAdmin && member && typeof member.permissions !== 'string') {
        isAdmin = (member.permissions as any).has(PermissionFlagsBits.Administrator);
      }
      if (!isAdmin) {
        this.ctx.logSyncEvent(`Blocked /${commandName} from ${interaction.user.username} — Maintenance Mode active.`, 'warn');
        if (interaction.isRepliable()) {
          await interaction.reply({
            content: '🚧 **System Maintenance Mode Active**\nAll public bot commands are temporarily disabled.',
            flags: 64
          }).catch(() => {});
        }
        return;
      }
    }

    this.ctx.logSyncEvent(`Slash command executed: /${commandName}`, 'info');
    if (interaction.guildId) {
      AnalyticsService.trackCommand(interaction.guildId, commandName).catch(() => {});
    }

    // Dispatch to module manifest handler
    for (const manifest of this.manifests) {
      if (!manifest.commands) continue;
      const cmd = manifest.commands.find((c: any) => c.name === commandName);
      if (!cmd) continue;

      const eventObj = manifest.events?.find((e: any) => e.name === `command_${commandName}`);
      if (eventObj) {
        try {
          await eventObj.handler(interaction.client, interaction, this.buildExtraContext(cmdGuildId));
        } catch (err) {
          console.error(`[InteractionRouter] Error executing /${commandName}:`, err);
          const replyPayload = { content: '❌ An internal error occurred while executing this command.', flags: 64 };
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(replyPayload).catch(() => {});
          } else {
            await interaction.reply(replyPayload).catch(() => {});
          }
        }
        return;
      }
    }

    // No handler found
    const fallback = { content: `❌ Command /${commandName} is registered but no module handler is currently active.`, flags: 64 };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(fallback).catch(() => {});
    } else {
      await interaction.reply(fallback).catch(() => {});
    }
  }

  // ── Buttons ─────────────────────────────────────────────────────────────

  private async handleButton(interaction: any): Promise<void> {
    // Executor-ownership guard: if customId ends with :<userId>, only that user may interact
    const parts = interaction.customId.split(':');
    if (parts.length > 1) {
      const targetExecutorId = parts[parts.length - 1];
      if (/^\d{17,20}$/.test(targetExecutorId) && interaction.user.id !== targetExecutorId) {
        return interaction.reply({
          content: `<:wrong:1532390628330307634> This interactive session can only be operated by the command executor (<@${targetExecutorId}>).`,
          flags: 64
        }).catch(() => {});
      }
    }

    // Dismiss / Delete message button handler
    if (interaction.customId.startsWith('btn_dismiss_') || interaction.customId.startsWith('prebot_btn_dismiss_')) {
      const targetId = interaction.customId.split('_').pop();
      if (/^\d{17,20}$/.test(targetId) && interaction.user.id !== targetId) {
        return interaction.reply({
          content: `<:wrong:1532390628330307634> Only the message owner (<@${targetId}>) can dismiss this confidential message.`,
          flags: 64
        }).catch(() => {});
      }
      return interaction.message.delete().catch(() => {});
    }

    // Help center buttons — handled directly, no module dispatch needed
    if (interaction.customId.startsWith('help_btn_')) {
      await PrefixHelpCenter.handleButtonInteraction(interaction).catch(console.error);
      return;
    }

    // Auto-defer for slow button handlers (1.0 s eager safety net)
    let deferred = false;
    const deferTimer = setTimeout(async () => {
      if (!interaction.replied && !interaction.deferred) {
        deferred = true;
        interaction.deferUpdate().catch(() => {});
      }
    }, 1000);

    try {
      // Await the primary exact-customId dispatch so interaction.update() completes
      // before Discord's 3-second acknowledgement window expires.
      await this.ctx.dispatchEvent(`button_${interaction.customId}`, interaction);

      // Prefix-based generic dispatchers for modules that use wildcard patterns.
      // These are fired concurrently after the primary handler has already acknowledged.
      const genericPrefixes: Array<[string, string]> = [
        ['gw_enter_',    'button_gw_enter_generic'],
        ['tickets_v2_',  'button_tickets_v2_generic'],
        ['addrole_',     'button_addrole_generic'],
        ['wl_',          'button_wl_generic'],
        ['sec_',         'button_sec_generic'],
        ['mod_',         'button_mod_generic'],
        ['botstats_',    'button_botstats_generic'],
      ];

      for (const [prefix, event] of genericPrefixes) {
        if (interaction.customId.startsWith(prefix)) {
          await this.ctx.dispatchEvent(event, interaction);
        }
      }
    } finally {
      clearTimeout(deferTimer);
    }
  }


  // ── Select Menus ─────────────────────────────────────────────────────────

  private async handleSelectMenu(interaction: any): Promise<void> {
    // Executor-ownership guard
    const parts = interaction.customId.split(':');
    if (parts.length > 1) {
      const targetExecutorId = parts[parts.length - 1];
      if (/^\d{17,20}$/.test(targetExecutorId) && interaction.user.id !== targetExecutorId) {
        return interaction.reply({
          content: `<:wrong:1532390628330307634> This interactive session can only be operated by the command executor (<@${targetExecutorId}>).`,
          flags: 64
        }).catch(() => {});
      }
    }

    // Help center select menu — handled directly
    if (interaction.customId.startsWith('help_category_select')) {
      await PrefixHelpCenter.handleSelectMenuInteraction(interaction).catch(console.error);
      return;
    }

    const deferTimer = setTimeout(() => {
      if (!interaction.replied && !interaction.deferred) {
        interaction.deferUpdate().catch(() => {});
      }
    }, 1000);

    try {
      await this.ctx.dispatchEvent(`select_${interaction.customId}`, interaction);

      const genericPrefixes: Array<[string, string]> = [
        ['tickets_v2_', 'select_tickets_v2_generic'],
      ];

      for (const [prefix, event] of genericPrefixes) {
        if (interaction.customId.startsWith(prefix)) {
          this.ctx.dispatchEvent(event, interaction);
        }
      }
    } finally {
      clearTimeout(deferTimer);
    }
  }

  // ── Modals ───────────────────────────────────────────────────────────────

  private async handleModal(interaction: any): Promise<void> {
    const deferTimer = setTimeout(() => {
      if (!interaction.replied && !interaction.deferred) {
        interaction.deferUpdate().catch(() => {});
      }
    }, 1000);

    try {
      await this.ctx.dispatchEvent(`modal_${interaction.customId}`, interaction);

      const genericPrefixes: Array<[string, string]> = [
        ['tickets_v2_', 'modal_tickets_v2_generic'],
      ];

      for (const [prefix, event] of genericPrefixes) {
        if (interaction.customId.startsWith(prefix)) {
          this.ctx.dispatchEvent(event, interaction);
        }
      }
    } finally {
      clearTimeout(deferTimer);
    }
  }

  // ── Shared context builder ───────────────────────────────────────────────

  private buildExtraContext(cmdGuildId: string | undefined): any {
    return {
      guildId: cmdGuildId,
      logSyncEvent: (msgOrGuildId: string | undefined, msgOrType?: string, type?: 'info' | 'warn' | 'success') => {
        if (type !== undefined) {
          this.ctx.logSyncEvent(`[${msgOrGuildId}] ${msgOrType}`, type);
        } else {
          this.ctx.logSyncEvent(msgOrGuildId ?? '', msgOrType as any);
        }
      },
      getModulesState: (gId?: string) => this.ctx.getModulesState(gId || cmdGuildId),
      getRegistry: () => this.ctx.getRegistry(cmdGuildId),
      getGlobalSettings: (gId?: string) => this.ctx.getGlobalSettings(gId || cmdGuildId),
      updateModuleConfig: (id: string, config: Record<string, any>) => this.ctx.updateModuleConfig(cmdGuildId, id, config),
      registry: {
        logWhitelistAudit: (guildId: string | undefined, audit: any) => {
          this.ctx.logSyncEvent(`[Audit] ${audit.action || 'whitelist change'} (guild: ${guildId || cmdGuildId})`, 'info');
        },
        logWhitelistActivity: (guildId: string | undefined, activity: any) => {
          this.ctx.logSyncEvent(`[Activity] ${activity.action || ''} ${activity.target || ''}`.trim(), 'info');
        }
      }
    };
  }
}
