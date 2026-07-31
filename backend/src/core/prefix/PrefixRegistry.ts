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
}

export class PrefixRegistry {
  private static commandsMap = new Map<string, PrefixCommandMeta>();
  private static aliasMap = new Map<string, string>();
  private static manifests: ModuleManifest[] = [];

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
    'log': 'logs',
    'ticket-create': 'create',
    'ticket-close': 'close'
  };

  public static initialize(manifests: ModuleManifest[]): void {
    this.manifests = manifests;
    this.commandsMap.clear();
    this.aliasMap.clear();

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
          const description = cmd.description || `${cmd.name} command`;
          const usage = this.formatUsage(cmd);
          const aliases: string[] = cmd.aliases || [];

          // Find inverted aliases
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
            confirmationRequired: cmd.confirmationRequired ?? false
          };

          this.commandsMap.set(name, meta);
        }
      }
    }

    // Add built-in core prefix commands if missing
    this.registerBuiltinCommands();
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

  private static resolveCategory(moduleId: string, moduleName: string): string {
    const map: Record<string, string> = {
      'security': 'Security',
      'moderation': 'Security',
      'tickets': 'Tickets',
      'tickets-v2': 'Tickets',
      'verification': 'System',
      'welcome-v2': 'Welcome',
      'logging': 'Logging',
      'backups': 'Backups',
      'automation': 'Automations',
      'voice': 'Voice',
      'voice-protection': 'Voice Protection',
      'member_whitelist': 'Security',
      'reaction-roles': 'Reaction Roles',
      'leveling': 'Leveling & Economy',
      'automod': 'AutoMod',
      'music': 'Voice',
      'blacklist': 'Security',
      'giveaway': 'Giveaways',
      'reminders': 'Reminders',
      'announcements': 'Announcements',
      'joinToCreate': 'Join To Create',
      'voice_manager': 'Voice',
      'bulk_ops': 'Bulk Operations',
      'diagnostics': 'Diagnostics',
      'join-role-guard': 'Security',
      'social-updates': 'Social Updates',
      'analytics': 'Analytics',
      'audit': 'Audit',
      'rage-enterprise': 'Enterprise',
      'payment': 'Payment QR'
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
    const builtins: PrefixCommandMeta[] = [
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
      this.commandsMap.set(b.name, b);
      for (const a of b.aliases) {
        this.aliasMap.set(a, b.name);
      }
    }
  }
}
