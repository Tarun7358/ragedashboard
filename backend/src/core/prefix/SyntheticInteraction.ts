import { Message, User, GuildMember, Channel, Role, TextChannel } from 'discord.js';
import { ParsedCommand } from './PrefixParser.js';
import { PayloadFormatter } from '../PayloadFormatter.js';

export class SyntheticInteraction {
  public id: string;
  public commandName: string;
  public guild: any;
  public guildId: string | null;
  public channel: any;
  public channelId: string;
  public user: User;
  public member: GuildMember | null;
  public client: any;

  public replied = false;
  public deferred = false;
  public _antigravity_wrapped = true;

  private message: Message;
  private parsed: ParsedCommand;
  private commandDef: any;
  private replyMessage: Message | null = null;
  private ephemeralMessages: Message[] = [];

  // BUG-SUB-001 FIX: tracks whether getSubcommand() has been called.
  // Kept for backward compatibility — getString() now reads parsed.options first,
  // so positional offset logic is the fallback path only.
  private _subcommandConsumed = false;

  constructor(message: Message, parsed: ParsedCommand, commandDef?: any) {
    this.message = message;
    this.parsed = parsed;
    this.commandDef = commandDef;

    this.id = message.id;
    this.commandName = parsed.commandName;
    this.guild = message.guild;
    this.guildId = message.guildId;
    this.channel = message.channel;
    this.channelId = message.channelId;
    this.user = message.author;
    this.member = message.member;
    this.client = message.client;
  }

  public get createdTimestamp(): number {
    return this.message.createdTimestamp;
  }

  public get memberPermissions() {
    return this.member?.permissions;
  }

  public isChatInputCommand(): boolean { return true; }
  public isRepliable(): boolean { return true; }
  public isButton(): boolean { return false; }
  public isSelectMenu(): boolean { return false; }
  public isAutocomplete(): boolean { return false; }

  // ── Reply API ────────────────────────────────────────────────────────────

  public async reply(options: any): Promise<any> {
    if (this.replied) return this.followUp(options);
    if (this.deferred && this.replyMessage) return this.editReply(options);

    const payload = PayloadFormatter.normalize(options, this.user);

    const sent = await this.message.reply(payload);
    this.replyMessage = sent;
    this.replied = true;
    return sent;
  }

  public async deferReply(options?: any): Promise<any> {
    if (this.deferred || this.replied) return;
    this.deferred = true;
    if (this.channel && typeof this.channel.sendTyping === 'function') {
      await this.channel.sendTyping().catch(() => {});
    }
  }

  public async editReply(options: any): Promise<any> {
    const payload = PayloadFormatter.normalize(options, this.user);
    if (this.replyMessage) {
      return await this.replyMessage.edit(payload as any);
    }
    return await this.reply(options);
  }

  public async followUp(options: any): Promise<any> {
    const payload = PayloadFormatter.normalize(options, this.user);
    return await (this.channel as TextChannel).send(payload);
  }

  // ── Options API (mirrors discord.js CommandInteractionOptionResolver) ──────

  public options = {
    /**
     * Resolve a User option.
     * Checks mention first, then named options map, then positional fallback.
     */
    getUser: (name: string, required?: boolean): User | null => {
      const mentionedUser = this.message.mentions.users.first();
      if (mentionedUser) return mentionedUser;

      const val = this.parsed.options[name] ?? this.parsed.flags[name.toLowerCase()];
      if (typeof val === 'string') {
        const idMatch = val.match(/\d{17,19}/);
        if (idMatch) {
          const userObj = this.client.users.cache.get(idMatch[0]);
          if (userObj) return userObj;
        }
      }

      // Positional fallback (BUG-SUB-001 compat)
      const offset = this._subcommandConsumed ? 1 : 0;
      const posVal = this.parsed.args[offset];
      if (typeof posVal === 'string') {
        const idMatch = posVal.match(/\d{17,19}/);
        if (idMatch) return this.client.users.cache.get(idMatch[0]) ?? null;
      }
      return null;
    },

    /**
     * Resolve a GuildMember option.
     */
    getMember: (name: string, required?: boolean): GuildMember | null => {
      const mentionedMember = this.message.mentions.members?.first();
      if (mentionedMember) return mentionedMember;

      const val = this.parsed.options[name] ?? this.parsed.flags[name.toLowerCase()];
      if (typeof val === 'string' && this.guild) {
        const idMatch = val.match(/\d{17,19}/);
        if (idMatch) return this.guild.members.cache.get(idMatch[0]) ?? null;
      }

      const offset = this._subcommandConsumed ? 1 : 0;
      const posVal = this.parsed.args[offset];
      if (typeof posVal === 'string' && this.guild) {
        const idMatch = posVal.match(/\d{17,19}/);
        if (idMatch) return this.guild.members.cache.get(idMatch[0]) ?? null;
      }
      return null;
    },

    /**
     * Resolve a string option.
     * Priority: parsed.options[name] (semantic) → flags → positional fallback
     */
    getString: (name: string, required?: boolean): string | null => {
      // 1. Semantic named option (populated by PrefixParser.enrichOptions)
      const semanticVal = this.parsed.options[name];
      if (semanticVal !== undefined) return semanticVal;

      // 2. Flag with same name
      const flagVal = this.parsed.flags[name.toLowerCase()];
      if (typeof flagVal === 'string') return flagVal;

      // 3. Positional fallback (BUG-SUB-001: offset past subcommand token)
      const offset = this._subcommandConsumed ? 1 : 0;
      const effectiveArgs = this.parsed.args.slice(offset);

      if (this.commandDef && Array.isArray(this.commandDef.options)) {
        const subName = this.parsed.subcommand;
        const subDef = subName
          ? this.commandDef.options.find((o: any) => o.name === subName && o.type === 1)
          : null;
        const subOptions = subDef?.options || this.commandDef.options;

        const optIndex = subOptions.findIndex((o: any) => o.name === name);
        if (optIndex !== -1 && effectiveArgs[optIndex]) {
          if (optIndex === subOptions.length - 1 && effectiveArgs.length > optIndex) {
            return effectiveArgs.slice(optIndex).join(' ');
          }
          return effectiveArgs[optIndex];
        }
      }

      // Final fallback: first non-mention arg
      if (effectiveArgs.length > 0) {
        const filteredArgs = effectiveArgs.filter(a => !a.startsWith('<@') && !a.startsWith('<#'));
        return filteredArgs[0] ?? effectiveArgs[0];
      }
      return null;
    },

    /**
     * Resolve an integer option.
     */
    getInteger: (name: string, required?: boolean): number | null => {
      const semanticVal = this.parsed.options[name];
      if (semanticVal !== undefined && !isNaN(Number(semanticVal))) {
        return parseInt(semanticVal, 10);
      }

      const flagVal = this.parsed.flags[name.toLowerCase()];
      if (flagVal !== undefined && !isNaN(Number(flagVal))) {
        return parseInt(String(flagVal), 10);
      }

      const offset = this._subcommandConsumed ? 1 : 0;
      const effectiveArgs = this.parsed.args.slice(offset);

      if (this.commandDef && Array.isArray(this.commandDef.options)) {
        const subName = this.parsed.subcommand;
        const subDef = subName
          ? this.commandDef.options.find((o: any) => o.name === subName && o.type === 1)
          : null;
        const subOptions = subDef?.options || this.commandDef.options;
        const optIndex = subOptions.findIndex((o: any) => o.name === name);
        if (optIndex !== -1 && effectiveArgs[optIndex]) {
          const num = parseInt(effectiveArgs[optIndex], 10);
          if (!isNaN(num)) return num;
        }
      }

      for (const arg of effectiveArgs) {
        const num = parseInt(arg, 10);
        if (!isNaN(num)) return num;
      }
      return null;
    },

    /**
     * Resolve a number (float) option.
     */
    getNumber: (name: string, required?: boolean): number | null => {
      const semanticVal = this.parsed.options[name];
      if (semanticVal !== undefined && !isNaN(Number(semanticVal))) {
        return Number(semanticVal);
      }

      const flagVal = this.parsed.flags[name.toLowerCase()];
      if (flagVal !== undefined && !isNaN(Number(flagVal))) return Number(flagVal);

      const offset = this._subcommandConsumed ? 1 : 0;
      const effectiveArgs = this.parsed.args.slice(offset);

      if (this.commandDef && Array.isArray(this.commandDef.options)) {
        const subName = this.parsed.subcommand;
        const subDef = subName
          ? this.commandDef.options.find((o: any) => o.name === subName && o.type === 1)
          : null;
        const subOptions = subDef?.options || this.commandDef.options;
        const optIndex = subOptions.findIndex((o: any) => o.name === name);
        if (optIndex !== -1 && effectiveArgs[optIndex]) {
          const num = Number(effectiveArgs[optIndex]);
          if (!isNaN(num)) return num;
        }
      }

      for (const arg of effectiveArgs) {
        const num = Number(arg);
        if (!isNaN(num)) return num;
      }
      return null;
    },

    /**
     * Resolve a boolean option.
     */
    getBoolean: (name: string, required?: boolean): boolean | null => {
      const semanticVal = this.parsed.options[name];
      if (semanticVal !== undefined) return semanticVal.toLowerCase() === 'true';

      const flagVal = this.parsed.flags[name.toLowerCase()];
      if (typeof flagVal === 'boolean') return flagVal;
      if (typeof flagVal === 'string') return flagVal.toLowerCase() === 'true';
      return null;
    },

    /**
     * Resolve a Role option.
     */
    getRole: (name: string, required?: boolean): Role | null => {
      const mentionedRole = this.message.mentions.roles.first();
      if (mentionedRole) return mentionedRole;

      const val = this.parsed.options[name] ?? this.parsed.flags[name.toLowerCase()];
      if (typeof val === 'string' && this.guild) {
        const idMatch = val.match(/\d{17,20}/);
        if (idMatch) {
          const cached = this.guild.roles.cache.get(idMatch[0]);
          if (cached) return cached;
        }

        const cleanVal = val.toLowerCase().replace(/^[<@&>]*|[>]*$/g, '').trim();
        const byName = this.guild.roles.cache.find(
          (r: any) => {
            if (!r.name) return false;
            const rn = r.name.toLowerCase();
            return rn === cleanVal || rn.replace(/[^a-z0-9]/g, '') === cleanVal.replace(/[^a-z0-9]/g, '');
          }
        );
        if (byName) return byName;
      }

      if (this.guild && this.parsed.args.length > 0) {
        for (const arg of this.parsed.args) {
          if (!arg) continue;
          const idMatch = arg.match(/\d{17,20}/);
          if (idMatch) {
            const cached = this.guild.roles.cache.get(idMatch[0]);
            if (cached) return cached;
          }
          const cleanName = arg.toLowerCase().replace(/^[<@&>]*|[>]*$/g, '').trim();
          if (cleanName && cleanName.length > 1) {
            const byName = this.guild.roles.cache.find((r: any) => r.name?.toLowerCase() === cleanName);
            if (byName) return byName;
          }
        }
      }
      return null;
    },

    /**
     * Resolve a mentionable (User or Role) option.
     */
    getMentionable: (name: string, required?: boolean): any => {
      const mentionedUser = this.message.mentions.users.first();
      if (mentionedUser) return mentionedUser;
      const mentionedRole = this.message.mentions.roles.first();
      if (mentionedRole) return mentionedRole;

      const val = this.parsed.options[name] ?? this.parsed.flags[name.toLowerCase()];
      const offset = this._subcommandConsumed ? 1 : 0;
      const posVal = typeof val === 'string' ? val : this.parsed.args[offset];

      if (typeof posVal === 'string') {
        const idMatch = posVal.match(/\d{17,20}/);
        if (idMatch) {
          const targetId = idMatch[0];
          const cachedUser = this.client.users.cache.get(targetId);
          if (cachedUser) return cachedUser;
          const cachedRole = this.guild?.roles.cache.get(targetId);
          if (cachedRole) return cachedRole;

          return { id: targetId, username: `User-${targetId}`, tag: `User-${targetId}` };
        }
      }

      return null;
    },

    /**
     * Resolve a Channel option.
     */
    getChannel: (name: string, required?: boolean): Channel | null => {
      const mentionedChannel = this.message.mentions.channels.first();
      if (mentionedChannel) return mentionedChannel;

      const val = this.parsed.options[name] ?? this.parsed.flags[name.toLowerCase()];
      if (typeof val === 'string' && this.guild) {
        const idMatch = val.match(/\d{17,20}/);
        if (idMatch) {
          const cached = this.guild.channels.cache.get(idMatch[0]) || this.client.channels.cache.get(idMatch[0]);
          if (cached) return cached;
          return { id: idMatch[0], name: `Channel-${idMatch[0]}`, type: 2 } as any;
        }

        // Clean name resolution (strip leading # and mention symbols, normalize special characters)
        const cleanVal = val.toLowerCase().replace(/^[<#>]*|[>]*$/g, '').trim();
        const byName = this.guild.channels.cache.find(
          (c: any) => {
            if (!c.name) return false;
            const cn = c.name.toLowerCase();
            if (cn === cleanVal) return true;
            const cnNorm = cn.replace(/[^a-z0-9]/g, '');
            const cleanNorm = cleanVal.replace(/[^a-z0-9]/g, '');
            return cnNorm.length > 0 && cleanNorm.length > 0 && cnNorm === cleanNorm;
          }
        );
        if (byName) return byName;
      }

      if (this.guild && this.parsed.args.length > 0) {
        for (const arg of this.parsed.args) {
          if (!arg) continue;
          const idMatch = arg.match(/\d{17,20}/);
          if (idMatch) {
            const cached = this.guild.channels.cache.get(idMatch[0]) || this.client.channels.cache.get(idMatch[0]);
            if (cached) return cached;
            return { id: idMatch[0], name: `Channel-${idMatch[0]}`, type: 2 } as any;
          }
          const cleanName = arg.toLowerCase().replace(/^[<#>]*/, '').replace(/>$/, '').trim();
          if (cleanName && cleanName.length > 1) {
            const byName = this.guild.channels.cache.find((c: any) => c.name?.toLowerCase() === cleanName);
            if (byName) return byName;
          }
        }
      }
      return null;
    },

    getAttachment: (name: string, required?: boolean): any => {
      return this.message.attachments.first() ?? null;
    },

    getSubcommandGroup: (required?: boolean): string | null => {
      // Reads from the semantic parsed.group field (currently always null at prefix level)
      return this.parsed.group ?? null;
    },

    /**
     * Returns the subcommand name.
     * Reads from the authoritative parsed.subcommand property (set by PrefixParser.parse)
     * rather than re-indexing args[0], making the intent explicit.
     */
    getSubcommand: (required?: boolean): string | null => {
      if (this.parsed.subcommand) {
        // BUG-SUB-001: mark consumed so positional fallback paths still offset correctly
        this._subcommandConsumed = true;
        return this.parsed.subcommand;
      }
      // Legacy: check args[0] as a safety net
      if (this.parsed.args.length > 0) {
        this._subcommandConsumed = true;
        return this.parsed.args[0].toLowerCase();
      }
      return null;
    },

    getFocused: (): string => {
      return this.parsed.rawInput;
    }
  };
}
