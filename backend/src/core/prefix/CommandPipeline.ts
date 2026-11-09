import { Message, EmbedBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { PrefixCommandMeta } from './PrefixRegistry.js';
import { PrefixCooldownManager } from './PrefixCooldownManager.js';
import { PrefixPermissionManager } from './PrefixPermissionManager.js';
import { PrefixAnalytics } from './PrefixAnalytics.js';
import { SyntheticInteraction } from './SyntheticInteraction.js';
import { ParsedCommand, PrefixParser } from './PrefixParser.js';
import { isOwnerOrExtraOwner, checkWhitelistPermission } from '../../utils/whitelistCheck.js';
import { CommandGuard } from '../security/CommandGuard.js';
import { PayloadFormatter } from '../PayloadFormatter.js';

export class CommandContext {
  public message: Message;
  public parsed: ParsedCommand;
  public cmdMeta: PrefixCommandMeta;
  public guild: any;
  public channel: any;
  public executor: any;
  public member: any;
  public args: string[];
  public correlationId: string;
  public startTime: number;
  public extra: any;

  constructor(message: Message, parsed: ParsedCommand, cmdMeta: PrefixCommandMeta, extra: any) {
    this.message = message;
    this.parsed = parsed;
    this.cmdMeta = cmdMeta;
    this.guild = message.guild;
    this.channel = message.channel;
    this.executor = message.author;
    this.member = message.member;
    this.args = parsed.args || [];
    this.correlationId = `corr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.startTime = Date.now();
    this.extra = extra;
  }

  public get(key: string) {
    return this.extra[key];
  }
}

export class CommandPipeline {
  private static locks = new Set<string>();

  public static async execute(
    message: Message,
    parsed: ParsedCommand,
    cmdMeta: PrefixCommandMeta & { execute?: Function },
    manifests: any[],
    extra: any
  ): Promise<any> {
    const ctx = new CommandContext(message, parsed, cmdMeta, extra);
    const correlationId = ctx.correlationId;

    // BUG-004 FIX: Compute lockKey exactly once, null-safe, so the catch block
    // always cleans up the same key that was added. Previously guild?.id could be
    // undefined in the catch block if an early guard threw, producing a different key.
    // BUG-014 FIX: Include subcommand in lock key so sibling subcommands
    // (e.g. r!audit export vs r!audit purge) don't block each other.
    const lockKey = `${ctx.guild?.id ?? 'unknown'}-${cmdMeta.name}-${parsed.subcommand ?? ''}`;

    try {
      // 1. Guild Validation
      if (!ctx.guild) {
        return this.sendError(ctx, 'This command can only be executed within a Discord server.');
      }

      // 2. Module Validation
      const modules = ctx.get('getModulesState') ? ctx.get('getModulesState')() : [];
      const normOwner = (cmdMeta.moduleOwnerId || '').toLowerCase().replace(/[-_]/g, '');
      const modState = modules.find((m: any) =>
        m.id === cmdMeta.moduleOwnerId ||
        (m.id && m.id.toLowerCase().replace(/[-_]/g, '') === normOwner)
      );
      
      const managementCmdNames = [
        'enable', 'disable', 'on', 'off', 'activate', 'deactivate',
        'setup', 'config', 'settings', 'module', 'modules',
        'setup-tickets', 'setup-discord-dashboard', 'security', 'logs',
        'backup', 'audit', 'diagnostics', 'automod', 'automation', 'automations', 'auto',
        '247', '24/7', 'voicepresence', 'voice', 'vc',
        'prefix', 'setprefix', 'pfx'
      ];

      const managementSubCmds = [
        'setup', 'enable', 'disable', 'config', 'settings', 'profile',
        'role', 'branding', 'preset', 'on', 'off', 'activate', 'deactivate', 'status',
        'join', 'leave', 'set'
      ];

      const isManagementCmd =
        managementCmdNames.includes(cmdMeta.name) ||
        managementSubCmds.includes(parsed.subcommand || '');

      let isModuleActive = modState && modState.status === 'enabled';
      if (!isModuleActive && (cmdMeta.moduleOwnerId === 'prebot_whitelist' || cmdMeta.name === 'prebot')) {
        const secMod = modules.find((m: any) => m.id === 'security');
        if (secMod && secMod.status === 'enabled') {
          const toggle = ctx.get('toggleModule');
          if (toggle) toggle('prebot_whitelist', true);
          isModuleActive = true;
        }
      }

      if (!isModuleActive && (cmdMeta.moduleOwnerId === 'voice' || ['247', '24/7', 'voicepresence', 'voice', 'vc'].includes(cmdMeta.name))) {
        if (['join', 'set'].includes(parsed.subcommand || '')) {
          const toggle = ctx.get('toggleModule');
          if (toggle) toggle('voice', true);
          isModuleActive = true;
        }
      }

      if (cmdMeta.moduleOwnerId !== 'core' && cmdMeta.moduleOwnerId !== 'rage-enterprise' && !isManagementCmd && !isModuleActive) {
        return this.sendError(ctx, `The backing module **\`${cmdMeta.moduleOwnerId}\`** is currently disabled on this server. Run \`r!enable ${cmdMeta.moduleOwnerId}\` or \`r!enable all\` to activate it.`);
      }

      // 3. Permission Validation
      const isOwner = PrefixPermissionManager.isDeveloper(ctx.executor.id, ctx.message);

      // Anti-Nuke, AutoMod & Backup Owner / Extra Owner Gate
      const isBackupCmd = ['backup', 'backups', 'bk', 'bkp', 'snap'].includes(cmdMeta.name) || cmdMeta.moduleOwnerId === 'backups';
      const isAntiNukeOrAutoMod =
        isBackupCmd ||
        ['security', 'automod', 'AutoMod', 'Security', 'backups', 'Backups'].includes(cmdMeta.category) ||
        ['security', 'antinuke', 'automod', 'antilink', 'extraowner', 'whitelist', 'member_whitelist', 'blacklist', 'upm', 'antirole', 'antichannel', 'antimod', 'antiwebhook', 'antiemoji', 'prebot', 'backup', 'backups', 'config', 'setup', 'dashboard', 'dash', 'media', 'attachfiles', 'joinguard', 'setup-verify', 'lockdown', 'quarantine', 'unquarantine'].includes(cmdMeta.name);

      if (isAntiNukeOrAutoMod) {
        const allowed = await isOwnerOrExtraOwner(ctx.executor.id, ctx.guild);
        if (!allowed) {
          PrefixAnalytics.trackFailure('permission');
          return this.sendError(
            ctx,
            isBackupCmd
              ? '🔒 Access Denied: Only the Server Owner and Extra Owners can access server backup commands and subcommands.'
              : 'Access Denied: Only the Server Owner and designated Extra Owners can access this command.'
          );
        }
      }

      // Role Management Commands Gate (addrole, removerole, temprole, tr, role, etc.)
      const isRoleCommand = ['addrole', 'removerole', 'temprole', 'tr', 'trole', 'temp-role'].includes(cmdMeta.name) ||
        (cmdMeta.name === 'role' && ['add', 'remove', 'create', 'delete', 'grant'].includes(ctx.args[0]?.toLowerCase()));

      if (isRoleCommand && ctx.guild) {
        const isOwner = await isOwnerOrExtraOwner(ctx.executor.id, ctx.guild);
        const getModules = ctx.get('getModulesState');
        const isWhitelisted = await checkWhitelistPermission(ctx.executor.id, ctx.guild, { getModulesState: getModules ? () => getModules() : () => [] }, 'anti_role_grant');
        if (!isOwner && !isWhitelisted) {
          PrefixAnalytics.trackFailure('permission');
          return this.sendError(ctx, '🔒 Access Denied: Role management commands can only be executed by the Server Owner, Extra Owners, and Whitelisted Members. Normal Administrators cannot use role commands.');
        }
      }

      // Ticket Management Commands Gate (ticketmanager, ticket deploy/config/lock/limit/etc.)
      const isTicketCommand = ['ticketmanager', 'tkmgr', 'ticketmgr', 'tconfig'].includes(cmdMeta.name) ||
        (['ticket', 't', 'tck', 'tickets'].includes(cmdMeta.name) &&
          !['open', 'create', 'ping', 'pingadmin', 'close', 'transcript', 'log'].includes(ctx.args[0]?.toLowerCase()));

      if (isTicketCommand && ctx.guild) {
        const allowed = await isOwnerOrExtraOwner(ctx.executor.id, ctx.guild);
        if (!allowed) {
          PrefixAnalytics.trackFailure('permission');
          return this.sendError(ctx, 'Access Denied: Only the Server Owner and Extra Owners can manage tickets.');
        }
      }

      // Make sure the executor's GuildMember is resolved so permission checks cannot fail open.
      if (!ctx.message.member && ctx.guild) {
        await ctx.guild.members.fetch(ctx.executor.id).catch(() => null);
      }

      // Central dangerous-command gate (exact permission, protected targets, hierarchy, rate limit)
      {
        if (CommandGuard.isGuarded(cmdMeta.name, cmdMeta.moduleOwnerId)) {
          const getMods = ctx.get('getModulesState');
          const guildId = ctx.guild.id;
          const verdict = await CommandGuard.evaluate({
            guild: ctx.guild,
            executorId: ctx.executor.id,
            commandName: cmdMeta.name,
            moduleId: cmdMeta.moduleOwnerId,
            targetIds: CommandGuard.targetsFromMessage(ctx.message, ctx.args),
            getModules: () => (getMods ? getMods(guildId) : []),
            context: { getModulesState: getMods ? () => getMods(guildId) : () => [] }
          });
          if (!verdict.allowed) {
            PrefixAnalytics.trackFailure('permission');
            return this.sendError(ctx, `Access Denied: ${verdict.reason}`);
          }
        }
      }

      const permResult = PrefixPermissionManager.checkPermissions(ctx.message, cmdMeta, modState);
      if (!permResult.allowed && !isOwner) {
        PrefixAnalytics.trackFailure('permission');
        return this.sendError(ctx, permResult.reason || 'You lack the required permissions to execute this command.');
      }

      // Auto-delete sensitive trigger messages containing raw secrets or 2FA setup passcodes
      const rawInputLower = ctx.parsed.rawInput.toLowerCase();
      const containsSecretPin = (
        rawInputLower.includes('2fa set') ||
        rawInputLower.includes('2fa change') ||
        rawInputLower.includes('2fa off') ||
        (ctx.args.some(a => /^\d{6}$/.test(a.trim())) && (rawInputLower.includes('2fa') || rawInputLower.includes('passcode')))
      );

      // Do NOT delete normal prebot commands (e.g. r!prebot add, r!prebot list) before execution,
      // as deleting the trigger message before execution breaks Discord's message.reply() reference in handlers.
      if (containsSecretPin && ctx.message.deletable) {
        ctx.message.delete().catch(() => {});
      }

      // 4. Bot Permission Validation
      const botMember = ctx.guild.members.me;
      if (botMember && cmdMeta.botPermissions) {
        const missingBotPerms = cmdMeta.botPermissions.filter(p => !botMember.permissions.has(p as any));
        if (missingBotPerms.length > 0) {
          PrefixAnalytics.trackFailure('permission');
          return this.sendError(ctx, `Bot is missing required Discord permissions: ${missingBotPerms.map(p => `\`${p}\``).join(', ')}`);
        }
      }

      // 5. Cooldown Validation
      const cdResult = PrefixCooldownManager.checkCooldown(ctx.executor.id, ctx.guild.id, cmdMeta.name, cmdMeta.cooldownSeconds, isOwner);
      if (cdResult.onCooldown) {
        PrefixAnalytics.trackFailure('cooldown');
        const embed = new EmbedBuilder()
          .setAuthor({ name: 'Rage Optimiser Security Gate • Cooldown' })
          .setTitle('<a:loading:1546134304625528882> Command Cooldown Active')
          .setDescription(`Please wait **\`${cdResult.retryAfter}s\`** before executing \`r!${cmdMeta.name}\` again.`)
          .setColor(0xF59E0B)
          .setFooter({ text: `Rage Optimiser v4.2 • Correlation ID: ${correlationId}` })
          .setTimestamp();
        const dmSent = await ctx.executor.send({ embeds: [embed] }).then(() => true).catch(() => false);
        if (dmSent) {
          if (ctx.message.deletable) ctx.message.delete().catch(() => {});
          return;
        }
        return ctx.message.reply({ embeds: [embed] }).then(sent => {
          setTimeout(() => {
            sent.delete().catch(() => {});
            if (ctx.message.deletable) ctx.message.delete().catch(() => {});
          }, 4000);
        }).catch(() => {});
      }

      // 6. Concurrency / Execution Locking
      if (cmdMeta.confirmationRequired && this.locks.has(lockKey)) {
        return this.sendError(ctx, 'A duplicate instance of this execution command is already running on this server.');
      }

      // 7. Interactive Confirmation Validation (if required)
      if (cmdMeta.confirmationRequired) {
        this.locks.add(lockKey);
        const confirmed = await this.requestConfirmation(ctx);
        if (!confirmed) {
          this.locks.delete(lockKey);
          return;
        }
      }

      // 8. Enrich parsed.options with semantic named args before constructing SyntheticInteraction.
      //    This lets getString()/getInteger() etc. resolve by option name instead of positional index.
      PrefixParser.enrichOptions(ctx.parsed, cmdMeta);

      // 9. Execute Business Logic Handler
      const syntheticInteraction = new SyntheticInteraction(ctx.message, ctx.parsed, cmdMeta);
      let handlerFound = false;

      // Path A: execute stored directly on meta (commands registered via PrefixRegistry.register())
      if (typeof cmdMeta.execute === 'function') {
        handlerFound = true;
        await cmdMeta.execute(ctx.message, ctx.args, ctx.extra);
      }

      // Path B: manifest event handler (standard module commands fallback)
      if (!handlerFound) {
        const normOwnerFallback = (cmdMeta.moduleOwnerId || '').toLowerCase().replace(/[-_]/g, '');
        let targetManifest = manifests.find(m => m.id === cmdMeta.moduleOwnerId || (m.id && m.id.toLowerCase().replace(/[-_]/g, '') === normOwnerFallback) || m.commands?.some((c: any) => c.name === cmdMeta.name));
        if (targetManifest) {
          const eventObj = targetManifest.events?.find((e: any) => e.name === `command_${cmdMeta.name}`);
          if (eventObj) {
            handlerFound = true;
            await eventObj.handler(ctx.message.client, syntheticInteraction, ctx.extra);
          }
        }
      }

      if (!handlerFound) {
        for (const manifest of manifests) {
          const eventObj = manifest.events?.find((e: any) => e.name === `command_${cmdMeta.name}`);
          if (eventObj) {
            handlerFound = true;
            await eventObj.handler(ctx.message.client, syntheticInteraction, ctx.extra);
            break;
          }
        }
      }

      this.locks.delete(lockKey);

      if (!handlerFound) {
        return this.sendError(ctx, 'Command registered in registry but no active handler was found. Check that the module is loaded and the manifest event is named correctly.');
      }

      // 9. Post-Execution Telemetry & Success Logs
      const elapsed = Date.now() - ctx.startTime;
      PrefixAnalytics.trackExecution(cmdMeta.name, cmdMeta.category, elapsed, true);
      ctx.extra.logSyncEvent(`Prefix command executed: r!${cmdMeta.name} by ${ctx.executor.username} (Duration: ${elapsed}ms)`, 'info');

    } catch (err: any) {
      this.locks.delete(lockKey);

      console.error(`[CommandPipeline] Error executing prefix command ${cmdMeta.name}:`, err);
      PrefixAnalytics.trackExecution(cmdMeta.name, cmdMeta.category, Date.now() - ctx.startTime, false);

      const errEmbed = new EmbedBuilder()
        .setAuthor({ name: 'Rage Optimiser Engine • Execution Error' })
        .setTitle('<a:warning:1546155193303957504> Command Execution Failed')
        .setDescription(err.message || 'An internal server error occurred during validation or execution of this command.')
        .setColor(0xEF4444)
        .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
        .setTimestamp();
      await ctx.message.reply({ embeds: [errEmbed] }).catch(() => {
        return (ctx.channel as any)?.send({ embeds: [errEmbed] }).catch(() => {});
      });
    }
  }

  private static async requestConfirmation(ctx: CommandContext): Promise<boolean> {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('confirm_yes').setLabel('Confirm Action').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('confirm_no').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );

    const embed = new EmbedBuilder()
      .setAuthor({ name: 'Rage Optimiser Security Gate • High Risk Action' })
      .setTitle('<a:success_check:1546134620087783526> High Risk Action Confirmation')
      .setDescription(`Are you sure you want to execute **\`r!${ctx.cmdMeta.name} ${ctx.args.join(' ')}\`**?\nThis is classified as a high-risk administrative command.`)
      .setColor(0xF59E0B)
      .setFooter({ text: `Rage Optimiser v4.2 • Correlation ID: ${ctx.correlationId}` })
      .setTimestamp();

    const response = await ctx.message.reply({ embeds: [embed], components: [row] });
    
    try {
      const confirmation = await response.awaitMessageComponent({
        filter: i => i.user.id === ctx.executor.id,
        time: 15000
      });

      if (confirmation.customId === 'confirm_yes') {
        await confirmation.update(PayloadFormatter.normalize({ content: '<:ticks:1532620580266836148> Command confirmed. Starting execution...', components: [] }, ctx.executor)).catch(() => {});
        return true;
      } else {
        await confirmation.update(PayloadFormatter.normalize({ content: '<a:warning:1546155193303957504> Command cancelled.', components: [] }, ctx.executor)).catch(() => {});
        return false;
      }
    } catch {
      await response.edit(PayloadFormatter.normalize({ content: '<a:loading:1546134304625528882> Command timed out due to inactivity.', components: [] }, ctx.executor)).catch(() => {});
      return false;
    }
  }

  private static async sendError(ctx: CommandContext, message: string) {
    const dismissRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_dismiss_${ctx.executor.id}`)
        .setLabel('Dismiss Message')
        .setStyle(ButtonStyle.Danger)
    );

    const embed = new EmbedBuilder()
      .setAuthor({ name: 'Rage Optimiser Security Gate • System Warning' })
      .setTitle('<a:warning:1546155193303957504> Command Pipeline Warning')
      .setDescription(message)
      .setColor(0xEF4444)
      .setFooter({ text: `Rage Optimiser v4.2 • Correlation ID: ${ctx.correlationId}` })
      .setTimestamp();

    // Deliver feedback directly in the channel with safe auto-delete and fallback
    const safeChannelSend = async () => {
      try {
        return await ctx.message.reply({ embeds: [embed], components: [dismissRow] });
      } catch {
        return await (ctx.channel as any)?.send({ embeds: [embed], components: [dismissRow] }).catch(() => null);
      }
    };

    return safeChannelSend().then((sent: any) => {
      if (sent) {
        setTimeout(() => {
          sent.delete().catch(() => {});
        }, 7000);
      }
    }).catch(() => {});
  }
}
