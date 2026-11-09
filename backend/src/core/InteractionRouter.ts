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

import { PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { PayloadFormatter } from './PayloadFormatter.js';
import { BlockedDMSettings } from './Gateway.js';
import { PrefixHelpCenter } from './prefix/PrefixHelpCenter.js';
import { AnalyticsService } from './AnalyticsService.js';
import { PrefixCooldownManager } from './prefix/PrefixCooldownManager.js';
import { protections, isOwnerOrExtraOwner, checkWhitelistPermission } from '../utils/whitelistCheck.js';
import { CommandGuard } from './security/CommandGuard.js';

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
  toggleModule?: (guildId: string | undefined, id: string, enabledOverride?: boolean) => any;
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

    // 0. Cooldown protection for slash commands (exempt for Server Owner / Bot Developers)
    const isBotOwner = interaction.user.id === process.env.OWNER_ID ||
                       interaction.user.id === interaction.guild?.ownerId ||
                       interaction.user.id === interaction.client.application?.owner?.id ||
                       Boolean((interaction.client.application?.owner as any)?.members?.has?.(interaction.user.id));
    const cd = PrefixCooldownManager.checkCooldown(interaction.user.id, cmdGuildId || null, commandName, 2.5, isBotOwner);
    if (cd.onCooldown) {
      if (interaction.isRepliable()) {
        await interaction.reply({
          content: `⏳ **Slow down!** You can use \`/${commandName}\` again in **${cd.retryAfter}s**.`,
          flags: 64
        }).catch(() => {});
      }
      return;
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

      // 1. Anti-Nuke, AutoMod & Backup Owner / Extra Owner Security Gate for Slash Commands
      const subCmd = interaction.options?.getSubcommand?.(false) || '';
      const isBackupCmd = ['backup', 'backups'].includes(commandName) || manifest.id === 'backups';
      const isAntiNukeOrAutoMod =
        isBackupCmd ||
        ['security', 'automod', 'AutoMod', 'Security', 'backups', 'Backups'].includes(cmd.category || manifest.category) ||
        ['security', 'antinuke', 'automod', 'antilink', 'whitelist-domain', 'extraowner', 'whitelist', 'member_whitelist', 'blacklist', 'upm', 'antirole', 'antichannel', 'antimod', 'antiwebhook', 'antiemoji', 'prebot', 'backup', 'backups', 'config', 'setup', 'dashboard', 'setup-verify', 'joinguard', 'lockdown', 'quarantine', 'unquarantine'].includes(commandName) ||
        (commandName === 'jtc' && ['setup', 'remove'].includes(subCmd.toLowerCase()));

      if (isAntiNukeOrAutoMod && interaction.guild) {
        const allowed = await isOwnerOrExtraOwner(interaction.user.id, interaction.guild);
        if (!allowed) {
          if (interaction.isRepliable()) {
            await interaction.reply({
              content: isBackupCmd
                ? '🔒 **Access Denied**: Only the **Server Owner** and **Extra Owners** can access server backup commands and subcommands.'
                : '❌ **Access Denied**: Only the **Server Owner** and designated **Extra Owners** can access this command.',
              flags: 64
            }).catch(() => {});
          }
          return;
        }
      }

      // 1b. Role Management Commands Security Gate (addrole, removerole, temprole, role)
      const isRoleCommand = ['addrole', 'removerole', 'temprole'].includes(commandName) ||
        (commandName === 'role' && ['add', 'remove', 'create', 'delete', 'grant'].includes(subCmd.toLowerCase())) ||
        (commandName === 'bulk' && ['role-add', 'role-remove', 'role-purge'].includes(subCmd.toLowerCase()));

      if (isRoleCommand && interaction.guild) {
        const isOwner = await isOwnerOrExtraOwner(interaction.user.id, interaction.guild);
        const isWhitelisted = await checkWhitelistPermission(interaction.user.id, interaction.guild, this.buildExtraContext(cmdGuildId), 'anti_role_grant');
        if (!isOwner && !isWhitelisted) {
          if (interaction.isRepliable()) {
            await interaction.reply({
              content: '🔒 **Access Denied**: Role management commands can only be executed by the **Server Owner**, **Extra Owners**, and **Whitelisted Members**.\nNormal Administrator permissions are not sufficient.',
              flags: 64
            }).catch(() => {});
          }
          return;
        }
      }

      // 1c. Central dangerous-command gate (exact permission, protected targets, hierarchy, rate limit)
      if (interaction.guild) {
        if (CommandGuard.isGuarded(commandName, manifest.id)) {
          const guardCtx = this.buildExtraContext(cmdGuildId);
          const verdict = await CommandGuard.evaluate({
            guild: interaction.guild,
            executorId: interaction.user.id,
            commandName,
            moduleId: manifest.id,
            targetIds: CommandGuard.targetsFromInteraction(interaction),
            getModules: () => guardCtx.getModulesState(cmdGuildId),
            context: guardCtx
          });
          if (!verdict.allowed) {
            this.ctx.logSyncEvent(`Blocked /${commandName} from ${interaction.user.username}: ${verdict.reason}`, 'warn');
            if (interaction.isRepliable()) {
              await interaction.reply({
                content: `**Access Denied**: ${verdict.reason}`,
                flags: 64
              }).catch(() => {});
            }
            return;
          }
        }
      }

      // 2. User Permission Validation for Slash Commands
      const isDeveloper = interaction.user.id === process.env.OWNER_ID ||
                          interaction.user.id === interaction.guild?.ownerId ||
                          interaction.user.id === interaction.client.application?.owner?.id ||
                          Boolean((interaction.client.application?.owner as any)?.members?.has?.(interaction.user.id));

      if (!isDeveloper && interaction.member) {
        const reqPerms = cmd.userPermissions || cmd.permissions || [];
        if (reqPerms.length > 0) {
          const hasAdmin = (interaction.member.permissions as any)?.has?.(PermissionFlagsBits.Administrator);
          if (!hasAdmin) {
            const { resolvePermissionFlag } = await import('./security/CommandGuard.js');
            const memberPerms: any = typeof (interaction.member.permissions as any) === 'string'
              ? ((await interaction.guild?.members?.fetch?.(interaction.user.id).catch(() => null))?.permissions ?? null)
              : interaction.member.permissions;
            const missing = reqPerms.filter((p: string) => {
              const flag = resolvePermissionFlag(p);
              // Fail closed: unknown permission names or an unresolved member count as missing.
              return flag && memberPerms ? !memberPerms.has(flag) : true;
            });
            if (missing.length > 0) {
              if (interaction.isRepliable()) {
                await interaction.reply({
                  content: `❌ **Access Denied**: You require the following permission(s) to use this command: **${missing.join(', ')}**`,
                  flags: 64
                }).catch(() => {});
              }
              return;
            }
          }
        }
      }

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
    // DM Mention Notification Action Buttons
    if (interaction.customId.startsWith('dm_reply:')) {
      const parts = interaction.customId.split(':');
      const channelId = parts[1];
      const messageId = parts[2] || '';

      const modal = new ModalBuilder()
        .setCustomId(`modal_dm_reply:${channelId}:${messageId}`)
        .setTitle('Reply to Channel');

      const textInput = new TextInputBuilder()
        .setCustomId('dm_reply_content')
        .setLabel('Your Reply Message')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Type what you want to send directly to the channel...')
        .setRequired(true)
        .setMaxLength(2000);

      const row = new ActionRowBuilder<TextInputBuilder>().addComponents(textInput);
      modal.addComponents(row);

      return interaction.showModal(modal).catch(console.error);
    }

    if (interaction.customId.startsWith('dm_block_server:')) {
      const serverId = interaction.customId.split(':')[1];
      const nowBlocked = await BlockedDMSettings.toggle(interaction.user.id, serverId);

      // Dynamically update the button on the DM message so the user immediately sees the new state
      try {
        if (interaction.message && interaction.message.components?.length > 0) {
          const rawComponents = interaction.message.components;
          const updatedComponents = rawComponents.map((comp: any) => {
            const compJson = typeof comp.toJSON === 'function' ? comp.toJSON() : comp;
            // Handle Components V2 Container (type 17)
            if (compJson.type === 17 && Array.isArray(compJson.components)) {
              return {
                ...compJson,
                components: compJson.components.map((inner: any) => {
                  if (inner.type === 1 && Array.isArray(inner.components)) {
                    return {
                      ...inner,
                      components: inner.components.map((btn: any) => {
                        if (btn.custom_id && btn.custom_id.startsWith('dm_block_server:')) {
                          return {
                            ...btn,
                            label: nowBlocked ? 'Unblock Server Messages' : 'Block Server Messages',
                            style: nowBlocked ? 4 : 2
                          };
                        }
                        return btn;
                      })
                    };
                  }
                  return inner;
                })
              };
            }
            // Handle traditional ActionRow (type 1)
            if (compJson.type === 1 && Array.isArray(compJson.components)) {
              return {
                ...compJson,
                components: compJson.components.map((btn: any) => {
                  if (btn.custom_id && btn.custom_id.startsWith('dm_block_server:')) {
                    return {
                      ...btn,
                      label: nowBlocked ? 'Unblock Server Messages' : 'Block Server Messages',
                      style: nowBlocked ? 4 : 2
                    };
                  }
                  return btn;
                })
              };
            }
            return compJson;
          });

          const hasV2 = updatedComponents.some((c: any) => c?.type === 17);
          const editPayload: any = hasV2
            ? { flags: MessageFlags.IsComponentsV2, components: updatedComponents }
            : { components: updatedComponents };
          await interaction.message.edit(editPayload).catch(() => {});
        }
      } catch (e) {
        console.warn('[dm_block_server] Failed to update button component:', e);
      }

      if (nowBlocked) {
        return interaction.reply({
          content: 'You will no longer receive mention alerts from this server.\nClick **Unblock Server Messages** at any time to re-enable them.',
          flags: 64
        }).catch(() => {});
      } else {
        return interaction.reply({
          content: 'Mention alerts from this server have been re-enabled.',
          flags: 64
        }).catch(() => {});
      }
    }

    // Executor-ownership guard: if customId ends with :<userId>, only that user may interact
    // Exempt public role/ticket buttons whose customId ends with a Role/Channel/Entity Snowflake ID
    const isPublicColonCustomId =
      interaction.customId.startsWith('sr_btn:') ||
      interaction.customId.startsWith('rr_btn:') ||
      interaction.customId.startsWith('dm_block_server:') ||
      interaction.customId.startsWith('dm_reply:');
    const parts = interaction.customId.split(':');
    if (parts.length > 1 && !isPublicColonCustomId) {
      const targetExecutorId = parts[parts.length - 1];
      if (/^\d{17,20}$/.test(targetExecutorId) && interaction.user.id !== targetExecutorId) {
        return interaction.reply({
          content: `<a:warning:1546155193303957504> This interactive session can only be operated by the command executor (<@${targetExecutorId}>).`,
          flags: 64
        }).catch(() => {});
      }
    }

    // Dismiss / Delete message button handler
    if (interaction.customId.startsWith('btn_dismiss_') || interaction.customId.startsWith('prebot_btn_dismiss_')) {
      const targetId = interaction.customId.split('_').pop();
      if (/^\d{17,20}$/.test(targetId) && interaction.user.id !== targetId) {
        return interaction.reply({
          content: `<a:warning:1546155193303957504> Only the message owner (<@${targetId}>) can dismiss this confidential message.`,
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

    // Strict Server Owner & Extra Owner Gate for Security, Anti-Nuke, AutoMod, Whitelist, Backup, Config & Admin GUI Buttons
    if (interaction.guild) {
      const cid = interaction.customId || '';
      const isOwnerOnlyButton =
        cid.startsWith('btn_sec_') ||
        cid.startsWith('sec_') ||
        cid.startsWith('select_sec_') ||
        cid.startsWith('an_') ||
        cid.startsWith('btn_an_') ||
        cid.startsWith('btn_enable_all_') ||
        cid.startsWith('wl_') ||
        cid.startsWith('btn_al_') ||
        cid.startsWith('al_') ||
        cid.startsWith('backup_') ||
        cid.startsWith('ver_btn_') ||
        cid.startsWith('owner_') ||
        cid.startsWith('config_btn_') ||
        cid.startsWith('mon_') ||
        cid.startsWith('prebot_') ||
        cid === 'jtc_btn_auto_setup' ||
        cid === 'jtc_btn_set_category' ||
        cid === 'jtc_btn_toggle_master' ||
        cid === 'jtc_btn_clean_stale' ||
        cid === 'jtc_btn_send_voice_panel' ||
        cid === 'jtc_btn_refresh_admin';

      if (isOwnerOnlyButton) {
        const allowed = await isOwnerOrExtraOwner(interaction.user.id, interaction.guild);
        if (!allowed) {
          return interaction.reply({
            content: '<:wrong:1532620780796510259> **Access Denied**: Only the **Server Owner** and designated **Extra Owners** can access this control.',
            flags: 64
          }).catch(() => {});
        }
      }
    }

    // Auto-defer for slow button handlers (1.0 s eager safety net)
    // EXCEPTION: Do NOT auto-defer button interactions that trigger a Modal popup,
    // as Discord rejects interaction.showModal() if deferUpdate() or deferReply() has been called.
    const isModalTrigger =
      interaction.customId === 'btn_open_ticket_modal' ||
      interaction.customId === 'btn_ticket_open_direct' ||
      interaction.customId === 'btn_ticket_close' ||
      interaction.customId === 'btn_in_close' ||
      interaction.customId.startsWith('tkmgr_btn_') ||
      interaction.customId.startsWith('btn_in_add_mod') ||
      interaction.customId.startsWith('btn_in_remove_mod') ||
      interaction.customId.startsWith('btn_social_add_') ||
      interaction.customId === 'btn_social_add_yt' ||
      interaction.customId === 'btn_social_add_ig' ||
      interaction.customId === 'btn_sec_link_gmail' ||
      interaction.customId === 'btn_sec_open_otp_modal' ||
      interaction.customId.startsWith('btn_sec_cat_custom_thresh_') ||
      interaction.customId === 'btn_disable_enter_code' ||
      interaction.customId === 'jtc_btn_set_category' ||
      interaction.customId.startsWith('jtc_btn_rename_') ||
      interaction.customId.startsWith('dm_reply:') ||
      interaction.customId.includes('modal');

    let deferred = false;
    const deferTimer = isModalTrigger ? null : setTimeout(async () => {
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
      const genericPrefixes: Array<[string, string]> = [
        ['backup_confirm', 'button_backup_confirm'],
        ['gw_enter_',    'button_gw_enter_generic'],
        ['tickets_v2_',  'button_tickets_v2_generic'],
        ['tkmgr_',       'button_tickets_v2_generic'],
        ['btn_open_',    'button_tickets_v2_generic'],
        ['btn_ticket_',  'button_tickets_v2_generic'],
        ['btn_in_',      'button_tickets_v2_generic'],
        ['btn_control_', 'button_tickets_v2_generic'],
        ['prio_btn_',    'button_tickets_v2_generic'],
        ['btn_deploy_',  'button_tickets_v2_generic'],
        ['addrole_',     'button_addrole_generic'],
        ['wl_',          'button_wl_generic'],
        ['sec_',         'button_sec_generic'],
        ['btn_sec_',     'button_sec_generic'],
        ['select_sec_',  'button_sec_generic'],
        ['jtc_',         'button_jtc_generic'],
        ['ver_',         'button_ver_generic'],
        ['mod_',         'button_mod_generic'],
        ['botstats_',    'button_botstats_generic'],
        ['social_',      'button_social_generic'],
        ['btn_social_',  'button_social_generic'],
        ['btn_sub_',     'button_social_generic'],
        ['btn_al_',      'button_al_generic'],
        ['select_al_',   'button_al_generic'],
        ['al_',          'button_al_generic'],
        ['prebot_',      'button_prebot_generic']
      ];

      const dispatched = new Set<string>();
      for (const [prefix, event] of genericPrefixes) {
        if (interaction.replied) break;
        if (interaction.customId.startsWith(prefix) && !dispatched.has(event)) {
          dispatched.add(event);
          await this.ctx.dispatchEvent(event, interaction);
        }
      }

      if (!interaction.replied) {
        await this.ctx.dispatchEvent('interactionCreate', interaction);
      }
    } finally {
      if (deferTimer) clearTimeout(deferTimer);
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
          content: `<a:warning:1546155193303957504> This interactive session can only be operated by the command executor (<@${targetExecutorId}>).`,
          flags: 64
        }).catch(() => {});
      }
    }

    // Help center select menu — handled directly
    if (interaction.customId.startsWith('help_category_select')) {
      await PrefixHelpCenter.handleSelectMenuInteraction(interaction).catch(console.error);
      return;
    }

    // Strict Server Owner & Extra Owner Gate for Security, Anti-Nuke, AutoMod, Whitelist & Config Select Menus
    if (interaction.guild) {
      const cid = interaction.customId || '';
      const isOwnerOnlySelect =
        cid.startsWith('select_sec_') ||
        cid.startsWith('btn_sec_') ||
        cid.startsWith('sec_') ||
        cid.startsWith('an_') ||
        cid.startsWith('select_an_') ||
        cid.startsWith('wl_') ||
        cid.startsWith('select_wl_') ||
        cid.startsWith('select_al_') ||
        cid.startsWith('btn_al_') ||
        cid.startsWith('al_') ||
        cid === 'ver_role_select' ||
        cid === 'setup_preset_select' ||
        cid === 'config_category_select' ||
        cid.startsWith('prebot_');

      if (isOwnerOnlySelect) {
        const allowed = await isOwnerOrExtraOwner(interaction.user.id, interaction.guild);
        if (!allowed) {
          return interaction.reply({
            content: '<:wrong:1532620780796510259> **Access Denied**: Only the **Server Owner** and designated **Extra Owners** can access this control.',
            flags: 64
          }).catch(() => {});
        }
      }
    }

    const isModalTrigger = interaction.customId === 'ticket_select_category' || interaction.customId.startsWith('ticket_select_');
    const deferTimer = isModalTrigger ? null : setTimeout(() => {
      if (!interaction.replied && !interaction.deferred) {
        interaction.deferUpdate().catch(() => {});
      }
    }, 1000);

    try {
      await this.ctx.dispatchEvent(`select_${interaction.customId}`, interaction);

      const genericPrefixes: Array<[string, string]> = [
        ['tickets_v2_',      'select_tickets_v2_generic'],
        ['tkmgr_',           'select_tickets_v2_generic'],
        ['ticket_select_',   'select_tickets_v2_generic'],
        ['select_sec_',      'button_sec_generic'],
        ['btn_sec_',         'button_sec_generic'],
        ['sec_',             'button_sec_generic'],
        ['select_social_',   'select_social_generic'],
        ['social_',          'select_social_generic'],
        ['select_al_',       'button_al_generic'],
        ['btn_al_',          'button_al_generic'],
        ['al_',              'button_al_generic'],
        ['wl_',              'button_wl_generic'],
        ['select_wl_',       'button_wl_generic'],
        ['jtc_',             'button_jtc_generic'],
        ['ver_',             'button_ver_generic'],
        ['prebot_',          'select_prebot_generic']
      ];

      const dispatched = new Set<string>();
      for (const [prefix, event] of genericPrefixes) {
        if (interaction.replied) break;
        if (interaction.customId.startsWith(prefix) && !dispatched.has(event)) {
          dispatched.add(event);
          await this.ctx.dispatchEvent(event, interaction);
        }
      }

      if (!interaction.replied) {
        await this.ctx.dispatchEvent('interactionCreate', interaction);
      }
    } finally {
      if (deferTimer) clearTimeout(deferTimer);
    }
  }

  // ── Modals ───────────────────────────────────────────────────────────────

  private async handleModal(interaction: any): Promise<void> {
    try {
      // DM Reply Modal Submission
      if (interaction.customId.startsWith('modal_dm_reply:')) {
        const parts = interaction.customId.split(':');
        const channelId = parts[1];
        const messageId = parts[2];
        const replyContent = interaction.fields.getTextInputValue('dm_reply_content');

        try {
          const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
          if (!channel || !channel.isTextBased()) {
            return interaction.reply({
              content: 'Could not send reply: Channel not found or unavailable.',
              flags: 64
            }).catch(() => {});
          }

          let sent = false;
          if (messageId) {
            const targetMsg = await channel.messages.fetch(messageId).catch(() => null);
            if (targetMsg) {
              await targetMsg.reply({
                content: `**Reply from ${interaction.user}:**\n${replyContent}`
              }).catch(() => {});
              sent = true;
            }
          }

          if (!sent) {
            await channel.send({
              content: `**Reply from ${interaction.user}:**\n${replyContent}`
            }).catch(() => {});
          }

          return interaction.reply({
            content: 'Your reply has been sent directly to the channel.',
            flags: 64
          }).catch(() => {});
        } catch (err: any) {
          return interaction.reply({
            content: `Failed to send reply: ${err.message || 'Unknown error'}`
          }).catch(() => {});
        }
      }

      if (interaction.guild) {
        const cid = interaction.customId || '';
        if (cid.startsWith('modal_sec_') || cid.startsWith('sec_')) {
          const allowed = await isOwnerOrExtraOwner(interaction.user.id, interaction.guild);
          if (!allowed) {
            return interaction.reply({
              content: '<:wrong:1532620780796510259> **Access Denied**: Only the **Server Owner** and designated **Extra Owners** can access this control.',
              flags: 64
            }).catch(() => {});
          }
        }
      }

      await this.ctx.dispatchEvent(`modal_${interaction.customId}`, interaction);

      const genericPrefixes: Array<[string, string]> = [
        ['tickets_v2_',      'modal_tickets_v2_generic'],
        ['ticket_modal_',    'modal_tickets_v2_generic'],
        ['panel_draft_',     'modal_tickets_v2_generic'],
        ['set_user_limit_',  'modal_tickets_v2_generic'],
        ['set_admin_role_',  'modal_tickets_v2_generic'],
        ['add_moderator_',   'modal_tickets_v2_generic'],
        ['modal_tkmgr_',     'modal_tickets_v2_generic'],
        ['tkmgr_',           'modal_tickets_v2_generic'],
        ['modal_sec_',       'button_sec_generic'],
        ['sec_',             'button_sec_generic'],
        ['jtc_',             'button_jtc_generic'],
        ['modal_social_',    'modal_social_generic'],
        ['social_',          'modal_social_generic'],
      ];

      const dispatched = new Set<string>();
      for (const [prefix, event] of genericPrefixes) {
        if (interaction.replied) break;
        if (interaction.customId.startsWith(prefix) && !dispatched.has(event)) {
          dispatched.add(event);
          await this.ctx.dispatchEvent(event, interaction);
        }
      }

      if (!interaction.replied) {
        await this.ctx.dispatchEvent('interactionCreate', interaction);
      }
    } catch (err) {
      console.error('[InteractionRouter] Error handling modal submit:', err);
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
      toggleModule: (id: string, enabledOverride?: boolean) => this.ctx.toggleModule ? this.ctx.toggleModule(cmdGuildId, id, enabledOverride) : null,
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
