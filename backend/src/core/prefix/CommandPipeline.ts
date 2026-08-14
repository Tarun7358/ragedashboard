import { Message, EmbedBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { PrefixCommandMeta } from './PrefixRegistry.js';
import { PrefixCooldownManager } from './PrefixCooldownManager.js';
import { PrefixPermissionManager } from './PrefixPermissionManager.js';
import { PrefixAnalytics } from './PrefixAnalytics.js';
import { SyntheticInteraction } from './SyntheticInteraction.js';
import { ParsedCommand, PrefixParser } from './PrefixParser.js';

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
      const modState = modules.find((m: any) => m.id === cmdMeta.moduleOwnerId);
      
      const isManagementCmd = ['setup', 'enable', 'config', 'settings', 'profile', 'role', 'branding', 'preset'].includes(parsed.subcommand || '') ||
        ['setup-tickets', 'setup-discord-dashboard', 'security', 'logs', 'backup', 'audit', 'diagnostics', 'automod', 'automation'].includes(cmdMeta.name);

      if (cmdMeta.moduleOwnerId !== 'core' && !isManagementCmd && (!modState || modState.status !== 'enabled')) {
        return this.sendError(ctx, `The backing module **\`${cmdMeta.moduleOwnerId}\`** is currently disabled on this server. Run \`r!${cmdMeta.name} enable\` or use setup commands to activate it.`);
      }

      // 3. Permission Validation
      const isOwner = PrefixPermissionManager.isDeveloper(ctx.executor.id, ctx.message);

      // Anti-Nuke & AutoMod Owner / Extra Owner Gate
      const isAntiNukeOrAutoMod = ['security', 'automod', 'AutoMod', 'Security'].includes(cmdMeta.category) ||
        ['security', 'antinuke', 'automod', 'antilink', 'extraowner', 'whitelist', 'member_whitelist', 'blacklist', 'upm', 'antirole', 'antichannel', 'antimod', 'antiwebhook', 'antiemoji'].includes(cmdMeta.name) ||
        (cmdMeta.name === 'config' && ['security', 'antinuke', 'automod', 'antilink', 'whitelist', 'extraowner', 'antirole', 'antichannel', 'antimod', 'antiwebhook', 'antiemoji'].includes(ctx.args[0]?.toLowerCase()));

      if (isAntiNukeOrAutoMod) {
        const { isOwnerOrExtraOwner } = await import('../../utils/whitelistCheck.js');
        const allowed = await isOwnerOrExtraOwner(ctx.executor.id, ctx.guild);
        if (!allowed) {
          PrefixAnalytics.trackFailure('permission');
          return this.sendError(ctx, 'Access Denied: Only the Guild Owner and Extra Owners can access Anti-Nuke and AutoMod features.');
        }
      }

      const permResult = PrefixPermissionManager.checkPermissions(ctx.message, cmdMeta, modState);
      if (!permResult.allowed && !isOwner) {
        PrefixAnalytics.trackFailure('permission');
        return this.sendError(ctx, permResult.reason || 'You lack the required permissions to execute this command.');
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
          .setTitle('<:timer:1532620491662037123> Command Cooldown Active')
          .setDescription(`Please wait **\`${cdResult.retryAfter}s\`** before executing \`r!${cmdMeta.name}\` again.`)
          .setColor(0xF59E0B)
          .setFooter({ text: `Rage Optimiser v4.2 • Correlation ID: ${correlationId}` })
          .setTimestamp();
        return ctx.message.reply({ embeds: [embed] }).catch(() => {});
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

      // Path A: manifest event handler (standard module commands)
      // Prioritize the manifest that explicitly owns the command or module ID
      let targetManifest = manifests.find(m => m.id === cmdMeta.moduleOwnerId || m.commands?.some((c: any) => c.name === cmdMeta.name));
      if (targetManifest) {
        const eventObj = targetManifest.events?.find((e: any) => e.name === `command_${cmdMeta.name}`);
        if (eventObj) {
          handlerFound = true;
          await eventObj.handler(ctx.message.client, syntheticInteraction, ctx.extra);
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

      // Path B: execute stored directly on meta (commands registered via PrefixRegistry.register())
      if (!handlerFound && typeof cmdMeta.execute === 'function') {
        handlerFound = true;
        await cmdMeta.execute(ctx.message, ctx.args, ctx.extra);
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
        .setTitle('<:wrong:1532390628330307634> Command Execution Failed')
        .setDescription(err.message || 'An internal server error occurred during validation or execution of this command.')
        .setColor(0xEF4444)
        .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
        .setTimestamp();
      await ctx.message.reply({ embeds: [errEmbed] }).catch(() => {});
    }
  }

  private static async requestConfirmation(ctx: CommandContext): Promise<boolean> {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('confirm_yes').setLabel('Confirm Action').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('confirm_no').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );

    const embed = new EmbedBuilder()
      .setAuthor({ name: 'Rage Optimiser Security Gate • High Risk Action' })
      .setTitle('<:shield:1532403012751065179> High Risk Action Confirmation')
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
        await confirmation.update({ content: '<a:approved:1532390590707142956> Command confirmed. Starting execution...', embeds: [], components: [] });
        return true;
      } else {
        await confirmation.update({ content: '<:wrong:1532390628330307634> Command cancelled.', embeds: [], components: [] });
        return false;
      }
    } catch {
      await response.edit({ content: '<:timer:1532620491662037123> Command timed out due to inactivity.', embeds: [], components: [] }).catch(() => {});
      return false;
    }
  }

  private static sendError(ctx: CommandContext, message: string) {
    const embed = new EmbedBuilder()
      .setAuthor({ name: 'Rage Optimiser Security Gate • System Error' })
      .setTitle('<:wrong:1532390628330307634> Command Pipeline Exception')
      .setDescription(message)
      .setColor(0xEF4444)
      .setFooter({ text: `Rage Optimiser v4.2 • Correlation ID: ${ctx.correlationId}` })
      .setTimestamp();
    return ctx.message.reply({ embeds: [embed] }).catch(() => {});
  }
}
