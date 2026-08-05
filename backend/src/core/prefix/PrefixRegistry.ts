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
    'b': 'ban',
    'k': 'kick',
    'm': 'mute',
    'u': 'unmute',
    'w': 'warn',
    'warns': 'warnings',
    'clearwarn': 'clearwarnings',
    'clear': 'purge',
    'p': 'play',
    's': 'skip',
    'q': 'queue',
    'np': 'nowplaying',
    'ui': 'userinfo',
    'av': 'avatar',
    'si': 'serverinfo',
    'ri': 'roleinfo',
    'ci': 'channelinfo',
    'bi': 'botinfo',
    'rr': 'reactionrole',
    'vc': 'voicemaster',
    'h': 'help',
    'cmds': 'commands',
    'stat': 'stats',
    'ver': 'version',
    'sec': 'security',
    'log': 'logs'
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
      if (meta.execute) {
        existing.execute = meta.execute;
        if (meta.description) existing.description = meta.description;
        if (meta.usage) existing.usage = meta.usage;
        if (meta.category) existing.category = meta.category;
        if (meta.aliases) {
          existing.aliases = meta.aliases;
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
    const map: Record<string, string> = {
      'security': 'Security',
      'moderation': 'Security',
      'verification': 'System',
      'community': 'Community',
      'welcome-v2': 'Community',
      'logging': 'Logging',
      'backups': 'Backups',
      'automation': 'Automations',
      'voice': 'Voice',
      'voice-protection': 'Voice',
      'member_whitelist': 'Security',
      'prebot_whitelist': 'Security',
      'botstats': 'Diagnostics',
      'config': 'Configuration',
      'reaction-roles': 'Reaction Roles',
      'leveling': 'Leveling & Economy',
      'automod': 'AutoMod',
      'music': 'Voice',
      'blacklist': 'Security',
      'giveaway': 'Giveaways',
      'reminders': 'Reminders',
      'announcements': 'Announcements',
      'joinToCreate': 'Voice',
      'voice_manager': 'Voice',
      'bulk_ops': 'Bulk Operations',
      'diagnostics': 'Diagnostics',
      'join-role-guard': 'Security',
      'social-updates': 'Social Updates',
      'analytics': 'Analytics',
      'audit': 'Audit',
      'rage-enterprise': 'Enterprise'
    };

    return map[moduleId] || 'System';
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
        aliases: ['pfx'],
        userPermissions: ['Administrator'],
        cooldownSeconds: 3,
        examples: ['r!prefix', 'r!prefix set !', 'r!prefix reset'],
        moduleOwnerId: 'core',
        dangerLevel: 'Low'
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
        dangerLevel: 'Low'
      }
    ];

    for (const b of builtins) {
      this.register(b as any);
    }

    // ── Enterprise shortcut stubs ─────────────────────────────────
    const shortcutCategoryMap: Record<string, string> = {
      antinuke: 'Security',
      extraowner: 'Security',
      prebot: 'Security',
      antispam: 'AutoMod',
      antilink: 'AutoMod',
      automod: 'AutoMod',
      raidmode: 'Security',
      emergency: 'Security',
      permissions: 'Security',
      verification: 'Verification',
      leveling: 'Leveling & Economy',
      social: 'Social Updates',
      'social-updates': 'Social Updates',
      jtc: 'Voice',
      voiceprotection: 'Voice',
      logging: 'Logging',
      notes: 'Moderation',
      autorole: 'Community',
      embed: 'Community',
      customembed: 'Community',
      goodbye: 'Community',
      birthday: 'Community',
      boost: 'Community',
      milestones: 'Community',
      config: 'Configuration',
      setup: 'Configuration',
      modules: 'System',
      premium: 'System',
      status: 'System',
      performance: 'System',
      telemetry: 'System',
      health: 'System',
      uptime: 'System',
      cache: 'System',
      memory: 'System',
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
        hidden: name === 'prebot' || name === 'prebotwhitelist',
        dangerLevel: ['emergency', 'reload', 'restart'].includes(name) ? 'High' : 'Low'
      });
    }

    // ── Music commands ────────────────────────────────────────────
    // Registered here so they enter the standard pipeline (permissions, cooldowns, analytics).
    // The CommandPipeline dispatches them to the music module's manifest event handlers.
    const musicCommands: Array<Partial<PrefixCommandMeta> & { name: string; description: string; category: string }> = [
      {
        name: 'play',
        description: 'Play a song from YouTube, Spotify, SoundCloud or a direct URL.',
        category: 'Voice',
        usage: 'r!play <song name | URL>',
        aliases: ['p'],
        cooldownSeconds: 2,
        examples: ['r!play Blinding Lights', 'r!play https://youtu.be/xxx'],
        moduleOwnerId: 'music',
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
        moduleOwnerId: 'music',
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
        moduleOwnerId: 'music',
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
        moduleOwnerId: 'music',
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
        moduleOwnerId: 'music',
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
        moduleOwnerId: 'music',
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
        moduleOwnerId: 'music',
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
        moduleOwnerId: 'music',
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
        moduleOwnerId: 'music',
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
        moduleOwnerId: 'music',
        dangerLevel: 'Low'
      },
      {
        name: 'nowplaying',
        description: 'Display the currently playing track with progress bar.',
        category: 'Voice',
        usage: 'r!nowplaying',
        aliases: ['np', 'current'],
        cooldownSeconds: 2,
        examples: ['r!nowplaying', 'r!np'],
        moduleOwnerId: 'music',
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
        moduleOwnerId: 'music',
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
    const musicCmds = this.getCommandsByCategory('Voice').filter(c => c.moduleOwnerId === 'music').length;

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
