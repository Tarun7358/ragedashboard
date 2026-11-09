import { ModuleManifest } from '../types.js';

export interface PrefixCommandSubMeta {
  name: string;
  description: string;
  usage?: string;
  examples?: string[];
  userPermissions?: string[];
  botPermissions?: string[];
}

export interface PrefixCommandMeta {
  name: string;
  description: string;
  category: string;
  subcategory?: string;
  usage: string;
  aliases: string[];
  userPermissions?: string[];
  botPermissions?: string[];
  cooldownSeconds?: number;
  examples: string[];
  relatedCommands?: string[];
  moduleOwnerId: string;

  // Pipeline-ready attributes
  dangerLevel?: 'Low' | 'Medium' | 'High' | 'Critical';
  supportsAutocomplete?: boolean;
  supportsMentions?: boolean;
  argumentTypes?: string[];
  subcommands?: PrefixCommandSubMeta[];
  options?: any[];
  experimental?: boolean;
  hidden?: boolean;
  confirmationRequired?: boolean;

  // Executor function — stored inline, no separate executeMap required
  execute?: Function;
}

export class PrefixRegistry {
  private static commandsMap = new Map<string, PrefixCommandMeta>();
  private static aliasMap = new Map<string, string>();
  private static manifests: ModuleManifest[] = [];
  private static _duplicateWarnings = 0;

  public static DEFAULT_ALIASES: Record<string, string> = {
    // Security & Zero-Trust
    'wl': 'whitelist',
    'an': 'antinuke',
    'eo': 'extraowner',
    'pb': 'prebot',
    'nop': 'np',
    'noprefix': 'np',
    'npmanager': 'np',
    'threat': 'security',
    'q': 'quarantine',
    'quar': 'quarantine',
    'unq': 'unquarantine',
    'em': 'emergency',
    'panic': 'emergency',
    'media': 'media',
    'med': 'media',
    'attachfiles': 'media',
    'mediaall': 'media',
    'blockfiles': 'media',

    // AutoMod & Filters
    'am': 'automod',
    'al': 'antilink',
    'whitelist-domain': 'antilink',
    'whitelistdomain': 'antilink',
    'allowdomain': 'antilink',
    'as': 'antispam',
    'ae': 'antieveryone',
    'bl': 'blacklist',
    'antiattachment': 'antiattachment',
    'antimedia': 'antiattachment',
    'antiimages': 'antiattachment',
    'antifiles': 'antiattachment',

    // Promotion Engine
    'promo': 'promotion',
    'pr': 'promotion',

    // Moderation Shortcuts
    'b': 'ban',
    'k': 'kick',
    'm': 'mute',
    'to': 'timeout',
    'u': 'unmute',
    'um': 'unmute',
    'uto': 'untimeout',
    'w': 'warn',
    'ws': 'warnings',
    'warns': 'warnings',
    'cw': 'clearwarnings',
    'clearwarn': 'clearwarnings',
    'c': 'purge',
    'clear': 'purge',
    'tr': 'temprole',

    // Configuration & Utilities
    'cfg': 'config',
    'en': 'enable',
    'dis': 'disable',
    'pfx': 'prefix',
    'setprefix': 'prefix',
    'diag': 'diagnostics',
    'bs': 'botstats',
    'bi': 'botstats',
    'botinfo': 'botstats',
    'gw': 'giveaway',
    'rr': 'reactionrole',
    'reactionroles': 'reactionrole',
    'vc': '247',
    '24/7': '247',
    '24-7': '247',
    'voice': '247',
    'vp': '247',
    'voicepresence': '247',
    'jointocreate': 'jtc',
    'j2c': 'jtc',
    'jg': 'joinguard',
    'jguard': 'joinguard',
    'voicemanager': 'voice',
    'vclock': 'vclock',
    'vcunlock': 'vcunlock',
    'lockvc': 'vclock',
    'unlockvc': 'vcunlock',
    'voicelock': 'vclock',
    'voiceunlock': 'vcunlock',
    'vc-lock': 'vclock',
    'vc-unlock': 'vcunlock',
    'automations': 'automation',
    'auto': 'automation',
    'tickets': 'ticket',
    'tkmgr': 'ticketmanager',
    'social': 'social-updates',
    'customembed': 'embed',
    'backups': 'backup',
    'leveling': 'rank',
    'level': 'rank',

    // Informational & System
    'h': 'help',
    'cmds': 'help',
    'commands': 'help',
    'p': 'play',
    's': 'skip',
    'q_music': 'queue',
    'ui': 'userinfo',
    'av': 'avatar',
    'si': 'serverinfo',
    'stat': 'stats',
    'ver': 'botstats',
    'version': 'botstats',
    'sec': 'security',
    'log': 'logs',
    'logging': 'logs'
  };

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────

  /**
   * Retrieve a command by name or alias.
   * Returns the full PrefixCommandMeta including its executor (if registered).
   * This is the single lookup path — no secondary executeMap exists.
   */
  public static get(name: string): PrefixCommandMeta | undefined {
    const canonical = this.aliasMap.get(name.toLowerCase()) || name.toLowerCase();
    return this.commandsMap.get(canonical);
  }

  /**
   * Register a command programmatically (e.g. built-in or module-less commands).
   * Stores the executor directly on the meta object inside commandsMap.
   * Emits a warning and skips if the name is already registered.
   */
  public static register(meta: Partial<PrefixCommandMeta> & { name: string; description: string; category: string; execute?: Function }): void {
    const name = meta.name.toLowerCase();

    if (this.commandsMap.has(name)) {
      const existing = this.commandsMap.get(name)!;
      if (meta.execute || (meta.subcommands && meta.subcommands.length > 0) || meta.examples) {
        if (meta.execute) existing.execute = meta.execute;
        if (meta.description) existing.description = meta.description;
        if (meta.usage) existing.usage = meta.usage;
        if (meta.category) existing.category = meta.category;
        if (meta.subcommands && meta.subcommands.length > 0) existing.subcommands = meta.subcommands;
        if (meta.aliases) {
          existing.aliases = Array.from(new Set([...existing.aliases, ...meta.aliases]));
          for (const alias of meta.aliases) {
            this.aliasMap.set(alias.toLowerCase(), name);
          }
        }
        if (meta.examples) existing.examples = meta.examples;
        if (meta.hidden !== undefined) existing.hidden = meta.hidden;
        return;
      }
      this._duplicateWarnings++;
      console.warn(`[PrefixRegistry] WARN: Duplicate registration attempt for command "${name}" — skipped. (Total duplicates: ${this._duplicateWarnings})`);
      return;
    }

    const commandMeta: PrefixCommandMeta = {
      name,
      description: meta.description,
      category: meta.category,
      usage: meta.usage || `r!${name}`,
      aliases: meta.aliases || [],
      userPermissions: meta.userPermissions || [],
      botPermissions: meta.botPermissions || ['SendMessages', 'EmbedLinks'],
      cooldownSeconds: meta.cooldownSeconds || 3,
      examples: meta.examples || [`r!${name}`],
      moduleOwnerId: meta.moduleOwnerId || 'core',
      dangerLevel: meta.dangerLevel || 'Low',
      hidden: meta.hidden ?? false,
      execute: meta.execute,
    };

    this.commandsMap.set(name, commandMeta);
    for (const alias of commandMeta.aliases) {
      this.aliasMap.set(alias.toLowerCase(), name);
    }
  }

  /**
   * Initialize the registry from a set of module manifests.
   * Clears all existing data first, then:
   *   1. Populates DEFAULT_ALIASES
   *   2. Auto-discovers commands from each manifest
   *   3. Registers built-in commands (help, ping, prefix, music, etc.)
   *   4. Prints a startup summary
   */
  public static initialize(manifests: ModuleManifest[]): void {
    this.manifests = manifests;
    this.commandsMap.clear();
    this.aliasMap.clear();
    this._duplicateWarnings = 0;

    // 1. Map registered aliases
    for (const [alias, canonical] of Object.entries(this.DEFAULT_ALIASES)) {
      this.aliasMap.set(alias.toLowerCase(), canonical.toLowerCase());
    }

    // 2. Auto-discover commands from Module Manifests
    for (const manifest of manifests) {
      const category = this.resolveCategory(manifest.id, manifest.name);

      if (manifest.commands) {
        for (const cmdOfManifest of manifest.commands) {
          const cmd = cmdOfManifest as any;
          const name = cmd.name.toLowerCase();

          if (this.commandsMap.has(name)) {
            this._duplicateWarnings++;
            console.warn(`[PrefixRegistry] WARN: Manifest "${manifest.id}" tried to register already-registered command "${name}" — skipped.`);
            continue;
          }

          const description = cmd.description || `${cmd.name} command`;
          const usage = this.formatUsage(cmd);
          const aliases: string[] = cmd.aliases || [];

          // Find inverted aliases from DEFAULT_ALIASES
          for (const [alias, target] of this.aliasMap.entries()) {
            if (target === name && !aliases.includes(alias)) {
              aliases.push(alias);
            }
          }

          const meta: PrefixCommandMeta = {
            name,
            description,
            category,
            usage: cmd.usage || `r!${name} ${usage}`.trim(),
            aliases,
            userPermissions: cmd.userPermissions || this.inferUserPermissions(name),
            botPermissions: cmd.botPermissions || ['SendMessages', 'EmbedLinks'],
            cooldownSeconds: cmd.cooldownSeconds || 3,
            examples: cmd.examples || [
              `r!${name}`,
              aliases.length > 0 ? `r!${aliases[0]}` : `r!${name} --help`
            ],
            moduleOwnerId: manifest.id,
            dangerLevel: cmd.dangerLevel || 'Low',
            supportsAutocomplete: cmd.supportsAutocomplete ?? false,
            supportsMentions: cmd.supportsMentions ?? false,
            argumentTypes: cmd.argumentTypes || [],
            subcommands: cmd.subcommands || (cmd.options ? cmd.options.filter((o: any) => o.type === 1).map((o: any) => ({ name: o.name, description: o.description })) : []),
            options: cmd.options || [],
            experimental: cmd.experimental ?? false,
            hidden: cmd.hidden ?? false,
            confirmationRequired: cmd.confirmationRequired ?? false,
            execute: cmd.execute,
          };

          this.commandsMap.set(name, meta);
        }
      }
    }

    // 3. Register built-in commands (using register() so dedup logic applies)
    this.registerBuiltinCommands();

    // 4. Print startup summary
    this.printStartupSummary();
  }

  public static getCommand(nameOrAlias: string): PrefixCommandMeta | undefined {
    const key = nameOrAlias.toLowerCase();
    const canonicalName = this.aliasMap.get(key) || key;
    return this.commandsMap.get(canonicalName);
  }

  public static getAllCommands(): PrefixCommandMeta[] {
    return Array.from(this.commandsMap.values());
  }

  public static getCategories(): string[] {
    const set = new Set<string>();
    for (const cmd of this.commandsMap.values()) {
      set.add(cmd.category);
    }
    return Array.from(set).sort();
  }

  public static getCommandsByCategory(category: string): PrefixCommandMeta[] {
    const catLower = category.toLowerCase();
    return Array.from(this.commandsMap.values()).filter(c => c.category.toLowerCase() === catLower);
  }

  public static getDuplicateWarnings(): number {
    return this._duplicateWarnings;
  }

  // ─────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────

  private static resolveCategory(moduleId: string, moduleName: string): string {
    const normalized = (moduleId || '').toLowerCase().replace(/[-_]/g, '_');
    const map: Record<string, string> = {
      'security': 'Security',
      'moderation': 'Security',
      'verification': 'System',
      'community': 'Community',
      'welcome_v2': 'Community',
      'welcome-v2': 'Community',
      'logging': 'Logging',
      'backups': 'Backups',
      'automation': 'Automations',
      'voice': 'Voice',
      'voice_protection': 'Voice',
      'voice-protection': 'Voice',
      'member_whitelist': 'Security',
      'prebot_whitelist': 'Security',
      'botstats': 'Diagnostics',
      'config': 'Configuration',
      'reaction_roles': 'Reaction Roles',
      'reaction-roles': 'Reaction Roles',
      'self_roles': 'Reaction Roles',
      'self-roles': 'Reaction Roles',
      'leveling': 'Leveling & Economy',
      'automod': 'AutoMod',
      'music': 'Voice',
      'blacklist': 'Security',
      'giveaway': 'Giveaways',
      'reminders': 'Reminders',
      'announcements': 'Announcements',
      'jointocreate': 'Voice',
      'join_to_create': 'Voice',
      'joinToCreate': 'Voice',
      'voice_manager': 'Voice',
      'bulk_ops': 'Bulk Operations',
      'diagnostics': 'Diagnostics',
      'join-role-guard': 'Security',
      'join_role_guard': 'Security',
      'social-updates': 'Social Updates',
      'social_updates': 'Social Updates',
      'analytics': 'Analytics',
      'audit': 'Audit',
      'rage-enterprise': 'Enterprise',
      'rage_enterprise': 'Enterprise',
      'tickets': 'Community',
      'embed_builder': 'Community',
      'stats_counter': 'Analytics',
      'stats-counter': 'Analytics',
      'promotion': 'Community',
      'discord_dashboard': 'Configuration',
      'discord-dashboard': 'Configuration',
      'brain': 'Diagnostics'
    };

    return map[normalized] || map[moduleId] || 'System';
  }

  private static formatUsage(cmd: any): string {
    if (!cmd.options || !Array.isArray(cmd.options)) return '';
    return cmd.options.map((o: any) => o.required ? `<${o.name}>` : `[${o.name}]`).join(' ');
  }

  private static inferUserPermissions(commandName: string): string[] {
    if (['addrole', 'removerole', 'temprole', 'role'].includes(commandName)) return ['ManageRoles'];
    if (['ban', 'softban', 'hackban', 'tempban', 'unban'].includes(commandName)) return ['BanMembers'];
    if (['kick', 'mute', 'unmute', 'timeout', 'untimeout', 'warn', 'clearwarn'].includes(commandName)) return ['ModerateMembers'];
    if (['purge', 'clear'].includes(commandName)) return ['ManageMessages'];
    if (['lock', 'unlock', 'slowmode'].includes(commandName)) return ['ManageChannels'];
    if (['setup', 'config', 'settings', 'prefix', 'permissions'].includes(commandName)) return ['Administrator'];
    return [];
  }

  private static registerBuiltinCommands(): void {
    // ── Core system commands ─────────────────────────────────────
    const builtins: Array<Partial<PrefixCommandMeta> & { name: string; description: string; category: string }> = [
      {
        name: 'help',
        description: 'Display interactive help system and module overview',
        category: 'System',
        usage: 'r!help [module/command]',
        aliases: ['h', 'commands'],
        cooldownSeconds: 2,
        examples: ['r!help', 'r!help moderation', 'r!help ban'],
        moduleOwnerId: 'core',
        dangerLevel: 'Low'
      },
      {
        name: 'prefix',
        description: 'View or change the server prefix',
        category: 'System',
        usage: 'r!prefix [set <prefix> | reset | list]',
        aliases: ['pfx', 'setprefix'],
        userPermissions: ['Administrator'],
        cooldownSeconds: 3,
        examples: ['r!prefix', 'r!prefix set !', 'r!prefix reset'],
        moduleOwnerId: 'core',
        dangerLevel: 'Low',
        execute: async (message: any, args: string[]) => {
          const guildId = message.guildId;
          if (!guildId || !message.guild) {
            return message.reply('Custom prefixes can only be configured inside a server.');
          }
          const { isOwnerOrExtraOwner } = await import('../../utils/whitelistCheck.js');
          const isAuthorized = await isOwnerOrExtraOwner(message.author.id, message.guild);
          const { PrefixResolver } = await import('./PrefixResolver.js');
          const { Embeds, VERIFIED_ICON, WRONG_ICON, CONFIG_ICON } = await import('../UIFactory.js');

          const firstArg = args[0]?.toLowerCase();
          if (!firstArg || firstArg === 'list' || firstArg === 'show') {
            const curPrefix = PrefixResolver.getPrefix(guildId);
            const embed = Embeds.info(
              `${CONFIG_ICON} Server Prefix Settings`,
              `Current prefix: **\`${curPrefix}\`**   •   Default fallback: **\`r!\`**\n\nChange with: \`${curPrefix}prefix set <new>\` or \`${curPrefix}setprefix <new>\`\n*Restricted to Server Owner & Extra Owners.*`,
              { module: 'system' }
            );
            return message.reply({ embeds: [embed] });
          }

          if (firstArg === 'reset') {
            if (!isAuthorized) {
              return message.reply(`${WRONG_ICON} **Access Denied**: Resetting the server prefix is strictly restricted to the **Server Owner** (<@${message.guild?.ownerId}>) and designated **Extra Owners**.`);
            }
            const updated = await PrefixResolver.resetPrefix(guildId);
            const embed = Embeds.success(
              `${VERIFIED_ICON} Prefix Reset`,
              `Server prefix has been reset to the default: **\`${updated}\`**`,
              { module: 'system' }
            );
            return message.reply({ embeds: [embed] });
          }

          const targetPrefix = firstArg === 'set' ? args[1] : args[0];
          if (!targetPrefix) {
            return message.reply(`${WRONG_ICON} Please specify a new prefix. Example: \`r!prefix set !\` or \`r!setprefix !\``);
          }

          if (!isAuthorized) {
            return message.reply(`${WRONG_ICON} **Access Denied**: Changing the server prefix is strictly restricted to the **Server Owner** (<@${message.guild?.ownerId}>) and designated **Extra Owners**.`);
          }

          try {
            const updated = await PrefixResolver.setPrefix(guildId, targetPrefix);
            const embed = Embeds.success(
              `${VERIFIED_ICON} Server Prefix Updated`,
              `Prefix for **${message.guild?.name}** has been changed to **\`${updated}\`**`,
              { module: 'system' }
            );
            return message.reply({ embeds: [embed] });
          } catch (err: any) {
            return message.reply(`${WRONG_ICON} Failed to update prefix: ${err.message}`);
          }
        }
      },
      {
        name: 'ping',
        description: 'Check bot latency and gateway performance',
        category: 'System',
        usage: 'r!ping',
        aliases: ['latency'],
        cooldownSeconds: 3,
        examples: ['r!ping'],
        moduleOwnerId: 'core',
        dangerLevel: 'Low',
        execute: async (message: any) => {
          const wsPing = Math.max(1, Math.round(message.client.ws.ping));
          const uptimeSec = process.uptime();
          const startTime = Math.floor((Date.now() - uptimeSec * 1000) / 1000);
          const heapMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
          const { Embeds, BOT_ICON } = await import('../UIFactory.js');
          const pingEmbed = Embeds.info(
            `${BOT_ICON} Bot Latency & Status`,
            `WebSocket Ping: **\`${wsPing}ms\`**\nUptime: <t:${startTime}:R>\nMemory Heap: **\`${heapMb} MB\`**`,
            { module: 'system' }
          );
          return message.reply({ embeds: [pingEmbed] });
        }
      },
      {
        name: 'unblock-alerts',
        description: 'Unblock mention notification DMs from a server',
        category: 'System',
        usage: 'r!unblock-alerts [serverId]',
        aliases: ['unblockserver', 'unblock-server', 'unblock'],
        cooldownSeconds: 2,
        examples: ['r!unblock-alerts', 'r!unblock-alerts 1234567890'],
        moduleOwnerId: 'core',
        dangerLevel: 'Low',
        execute: async (message: any, args: string[]) => {
          const { BlockedDMSettings } = await import('../Gateway.js');
          await BlockedDMSettings.init();
          const targetGuildId = args[0] || message.guild?.id;

          if (targetGuildId) {
            await BlockedDMSettings.unblock(message.author.id, targetGuildId);
            return message.reply({
              content: `Mention alerts for server \`${targetGuildId}\` have been re-enabled. You will receive mention notifications again.`
            });
          }

          // If in DMs and no server ID specified, find and unblock all blocked servers for this user
          const blockedList = BlockedDMSettings.getBlockedGuildsForUser(message.author.id);
          if (blockedList.length === 0) {
            return message.reply({
              content: 'You do not have any servers blocked from sending mention alerts.'
            });
          }

          for (const gId of blockedList) {
            await BlockedDMSettings.unblock(message.author.id, gId);
          }

          return message.reply({
            content: `Mention alerts have been re-enabled for all servers (${blockedList.length} server${blockedList.length > 1 ? 's' : ''} unblocked).`
          });
        }
      },
      {
        name: 'block-alerts',
        description: 'Block mention notification DMs from a server',
        category: 'System',
        usage: 'r!block-alerts [serverId]',
        aliases: ['blockserver', 'block-server'],
        cooldownSeconds: 2,
        examples: ['r!block-alerts', 'r!block-alerts 1234567890'],
        moduleOwnerId: 'core',
        dangerLevel: 'Low',
        execute: async (message: any, args: string[]) => {
          const { BlockedDMSettings } = await import('../Gateway.js');
          const targetGuildId = args[0] || message.guild?.id;
          if (!targetGuildId) {
            return message.reply({ content: 'Please provide a server ID: `r!block-alerts <serverId>`' });
          }
          await BlockedDMSettings.block(message.author.id, targetGuildId);
          return message.reply({
            content: `Mention alerts for server \`${targetGuildId}\` have been blocked. You will no longer receive mention notifications from this server.`
          });
        }
      },
    ];

    for (const b of builtins) {
      this.register(b as any);
    }

    // ── Enterprise shortcut stubs ─────────────────────────────────
    const shortcutCategoryMap: Record<string, string> = {
      permissions: 'System',
      modules: 'System',
      premium: 'System',
      status: 'System',
      performance: 'System',
      telemetry: 'System',
      health: 'System',
      uptime: 'System',
      cache: 'System',
      memory: 'System',
      emergency: 'Security',
      diagnostics: 'Diagnostics',
      developer: 'System',
      reload: 'System',
      restart: 'System',
      sync: 'System',
      debug: 'System'
    };

    for (const [name, cat] of Object.entries(shortcutCategoryMap)) {
      this.register({
        name,
        description: `Enterprise ${name} control interface`,
        category: cat,
        usage: `r!${name}`,
        aliases: [],
        cooldownSeconds: 3,
        examples: [`r!${name}`],
        moduleOwnerId: 'rage-enterprise',
        hidden: false,
        dangerLevel: ['emergency', 'reload', 'restart'].includes(name) ? 'High' : 'Low'
      });
    }

    // ── Music commands ────────────────────────────────────────────
    // Registered here so they enter the standard pipeline (permissions, cooldowns, analytics).
    // The CommandPipeline dispatches them to the rage-enterprise module's manifest event handlers.
    const musicCommands: Array<Partial<PrefixCommandMeta> & { name: string; description: string; category: string }> = [
      {
        name: 'play',
        description: 'Play a song from YouTube, Spotify, SoundCloud or a direct URL.',
        category: 'Voice',
        usage: 'r!play <song name | URL>',
        aliases: ['p'],
        cooldownSeconds: 2,
        examples: ['r!play Blinding Lights', 'r!play https://youtu.be/xxx'],
        moduleOwnerId: 'rage-enterprise',
        dangerLevel: 'Low'
      },
      {
        name: 'pause',
        description: 'Pause the currently playing track.',
        category: 'Voice',
        usage: 'r!pause',
        aliases: [],
        cooldownSeconds: 2,
        examples: ['r!pause'],
        moduleOwnerId: 'rage-enterprise',
        dangerLevel: 'Low'
      },
      {
        name: 'resume',
        description: 'Resume a paused track.',
        category: 'Voice',
        usage: 'r!resume',
        aliases: [],
        cooldownSeconds: 2,
        examples: ['r!resume'],
        moduleOwnerId: 'rage-enterprise',
        dangerLevel: 'Low'
      },
      {
        name: 'skip',
        description: 'Skip the current track and play the next one in queue.',
        category: 'Voice',
        usage: 'r!skip',
        aliases: ['s'],
        cooldownSeconds: 2,
        examples: ['r!skip'],
        moduleOwnerId: 'rage-enterprise',
        dangerLevel: 'Low'
      },
      {
        name: 'back',
        description: 'Go back to the previously played track.',
        category: 'Voice',
        usage: 'r!back',
        aliases: ['prev', 'previous'],
        cooldownSeconds: 2,
        examples: ['r!back'],
        moduleOwnerId: 'rage-enterprise',
        dangerLevel: 'Low'
      },
      {
        name: 'stop',
        description: 'Stop playback, clear the queue and disconnect from voice.',
        category: 'Voice',
        usage: 'r!stop',
        aliases: ['leave', 'disconnect'],
        cooldownSeconds: 2,
        examples: ['r!stop'],
        moduleOwnerId: 'rage-enterprise',
        dangerLevel: 'Low'
      },
      {
        name: 'queue',
        description: 'View the current music playback queue.',
        category: 'Voice',
        usage: 'r!queue',
        aliases: ['q'],
        cooldownSeconds: 2,
        examples: ['r!queue'],
        moduleOwnerId: 'rage-enterprise',
        dangerLevel: 'Low'
      },
      {
        name: 'shuffle',
        description: 'Shuffle the current music queue randomly.',
        category: 'Voice',
        usage: 'r!shuffle',
        aliases: [],
        cooldownSeconds: 2,
        examples: ['r!shuffle'],
        moduleOwnerId: 'rage-enterprise',
        dangerLevel: 'Low'
      },
      {
        name: 'loop',
        description: 'Toggle loop mode: off, track, or queue.',
        category: 'Voice',
        usage: 'r!loop <off|track|queue>',
        aliases: ['repeat'],
        cooldownSeconds: 2,
        examples: ['r!loop track', 'r!loop queue', 'r!loop off'],
        moduleOwnerId: 'rage-enterprise',
        dangerLevel: 'Low'
      },
      {
        name: 'volume',
        description: 'Adjust the playback volume (1-200).',
        category: 'Voice',
        usage: 'r!volume <1-200>',
        aliases: ['vol'],
        cooldownSeconds: 2,
        examples: ['r!volume 80'],
        moduleOwnerId: 'rage-enterprise',
        dangerLevel: 'Low'
      },
      {
        name: 'nowplaying',
        description: 'Display the currently playing track with progress bar.',
        category: 'Voice',
        usage: 'r!nowplaying',
        aliases: ['current'],
        cooldownSeconds: 2,
        examples: ['r!nowplaying'],
        moduleOwnerId: 'rage-enterprise',
        dangerLevel: 'Low'
      },
      {
        name: 'autoplay',
        description: 'Toggle autoplay mode to queue related tracks automatically.',
        category: 'Voice',
        usage: 'r!autoplay <on|off>',
        aliases: [],
        cooldownSeconds: 3,
        examples: ['r!autoplay on', 'r!autoplay off'],
        moduleOwnerId: 'rage-enterprise',
        dangerLevel: 'Low'
      }
    ];

    for (const mc of musicCommands) {
      this.register(mc as any);
    }
  }

  private static printStartupSummary(): void {
    const totalCmds = this.commandsMap.size;
    const totalAliases = this.aliasMap.size;
    const categories = this.getCategories();
    const musicCmds = this.getCommandsByCategory('Voice').filter(c => c.moduleOwnerId === 'rage-enterprise' || c.moduleOwnerId === 'music').length;

    console.log(`[PrefixRegistry] ═══════════════════════════════════════`);
    console.log(`[PrefixRegistry] Initialized: ${totalCmds} commands across ${categories.length} categories`);
    console.log(`[PrefixRegistry] Aliases mapped: ${totalAliases}`);
    console.log(`[PrefixRegistry] Music commands (pipeline-integrated): ${musicCmds}`);
    console.log(`[PrefixRegistry] Categories: ${categories.join(', ')}`);
    if (this._duplicateWarnings > 0) {
      console.warn(`[PrefixRegistry] ⚠  Duplicate registrations suppressed: ${this._duplicateWarnings}`);
    } else {
      console.log(`[PrefixRegistry] Duplicate warnings: 0`);
    }
    console.log(`[PrefixRegistry] ═══════════════════════════════════════`);
  }
}
