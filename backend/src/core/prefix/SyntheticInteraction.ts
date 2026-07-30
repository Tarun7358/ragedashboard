import { Message, User, GuildMember, Channel, Role, TextChannel, MessageReplyOptions, EmbedBuilder } from 'discord.js';
import { ParsedCommand } from './PrefixParser.js';

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

  public isChatInputCommand(): boolean {
    return true;
  }

  public isRepliable(): boolean {
    return true;
  }

  public isButton(): boolean {
    return false;
  }

  public isSelectMenu(): boolean {
    return false;
  }

  public isAutocomplete(): boolean {
    return false;
  }

  public async reply(options: any): Promise<any> {
    if (this.replied) {
      return this.followUp(options);
    }
    if (this.deferred && this.replyMessage) {
      return this.editReply(options);
    }

    const payload = this.normalizePayload(options);
    const isEphemeral = false; // Always display responses publicly in channel for everyone

    if (isEphemeral) {
      try {
        const dm = await this.user.send(payload);
        this.ephemeralMessages.push(dm);
        this.replied = true;
        return dm;
      } catch {
        // Fallback to channel reply if DM is closed
        const msg = await (this.channel as TextChannel).send(payload);
        this.ephemeralMessages.push(msg);
        this.replied = true;
        // Auto-delete ephemeral fallback after 10s
        setTimeout(() => msg.delete().catch(() => {}), 10000);
        return msg;
      }
    }

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
    const payload = this.normalizePayload(options);
    if (this.replyMessage) {
      return await this.replyMessage.edit(payload as any);
    }
    return await this.reply(options);
  }

  public async followUp(options: any): Promise<any> {
    const payload = this.normalizePayload(options);
    const isEphemeral = Boolean(options && (options.flags === 64 || options.ephemeral));

    if (isEphemeral) {
      try {
        return await this.user.send(payload);
      } catch {
        const msg = await (this.channel as TextChannel).send(payload);
        setTimeout(() => msg.delete().catch(() => {}), 10000);
        return msg;
      }
    }
    return await (this.channel as TextChannel).send(payload);
  }

  private normalizePayload(options: any): MessageReplyOptions {
    if (typeof options === 'string') {
      options = { content: options };
    }
    const copy = { ...options };
    delete copy.flags;
    delete copy.ephemeral;

    const verifiedIcon = '<a:approved:1532390590707142956>';
    const wrongIcon = '<:wrong:1532390628330307634>';

    // Case 1: Convert raw string content to reference Lime single-line card
    if (copy.content && (typeof copy.content === 'string') && (!copy.embeds || copy.embeds.length === 0)) {
      const isErr = copy.content.includes('❌') || 
                    copy.content.includes('🔒') || 
                    copy.content.toLowerCase().includes('failed') || 
                    copy.content.toLowerCase().includes('error') || 
                    copy.content.toLowerCase().includes('denied') ||
                    copy.content.toLowerCase().includes('invalid');

      const cleanContent = copy.content.replace(/^[❌✅🔒⚠️🧊🌡️🔓🧹🔨✏️⏱️🔕👁️📋📜📈📝🔗🏓🪙🎲😂☀️💡]+\s*/, '').trim();
      const icon = isErr ? wrongIcon : verifiedIcon;
      const color = isErr ? 0xef4444 : 0x84cc16;

      copy.embeds = [
        new EmbedBuilder()
          .setColor(color)
          .setDescription(`${icon} ${this.user} ${cleanContent}`.trim())
      ];
      delete copy.content;
    }
    // Case 2: Embeds array provided -> Sanitize icons & colors to match Lime GG reference UI
    else if (Array.isArray(copy.embeds)) {
      copy.embeds = copy.embeds.map((emb: any) => {
        if (!emb) return emb;
        let json = typeof emb.toJSON === 'function' ? emb.toJSON() : { ...emb };

        // Clean description
        if (json.description) {
          json.description = json.description
            .replace(/<a:verifiedtwitter:\d+>/g, verifiedIcon)
            .replace(/• ᴵˢ ɢʟᴏʙᴀʟ/g, '')
            .replace(/✅/g, verifiedIcon)
            .replace(/❌/g, wrongIcon)
            .replace(/(?:<:wrong:\d+>|<a:approved:\d+>|[❌✅🔒⚠️])\s*(?:<:wrong:\d+>|<a:approved:\d+>|[❌✅🔒⚠️])+/g, (match: string) => {
              if (match.includes('<:wrong:') || match.includes('❌') || match.includes('⚠️') || match.includes('🔒')) {
                return wrongIcon;
              }
              return verifiedIcon;
            });
        }

        // Clean title
        if (json.title) {
          json.title = json.title
            .replace(/✅/g, verifiedIcon)
            .replace(/❌/g, wrongIcon)
            .replace(/(?:<:wrong:\d+>|<a:approved:\d+>|[❌✅🔒⚠️])\s*(?:<:wrong:\d+>|<a:approved:\d+>|[❌✅🔒⚠️])+/g, (match: string) => {
              if (match.includes('<:wrong:') || match.includes('❌') || match.includes('⚠️') || match.includes('🔒')) {
                return wrongIcon;
              }
              return verifiedIcon;
            });
        }

        // Clean footer
        if (json.footer && json.footer.text) {
          json.footer.text = json.footer.text.replace(/Unbypassable Security \| Menu Expired Rescue it/gi, 'Rage Optimiser • Security Engine');
        }

        // Replace default violet color #7c5cfc with Lime Green #84cc16
        if (!json.color || json.color === 0x7c5cfc || json.color === 8150268) {
          json.color = 0x84cc16;
        }

        return EmbedBuilder.from(json);
      });
    }

    return copy;
  }

  public options = {
    getUser: (name: string, required?: boolean): User | null => {
      // 1. Check direct mention
      const mentionedUser = this.message.mentions.users.first();
      if (mentionedUser) return mentionedUser;

      // 2. Check flags or args for ID or username
      const val = this.parsed.flags[name.toLowerCase()] || this.parsed.args[0];
      if (typeof val === 'string') {
        const idMatch = val.match(/\d{17,19}/);
        if (idMatch) {
          const userObj = this.client.users.cache.get(idMatch[0]);
          if (userObj) return userObj;
        }
      }
      return null;
    },

    getMember: (name: string, required?: boolean): GuildMember | null => {
      // 1. Check direct mention
      const mentionedMember = this.message.mentions.members?.first();
      if (mentionedMember) return mentionedMember;

      // 2. Check guild cache by ID or username
      const val = this.parsed.flags[name.toLowerCase()] || this.parsed.args[0];
      if (typeof val === 'string' && this.guild) {
        const idMatch = val.match(/\d{17,19}/);
        if (idMatch) {
          const memberObj = this.guild.members.cache.get(idMatch[0]);
          if (memberObj) return memberObj;
        }
      }
      return null;
    },

    getString: (name: string, required?: boolean): string | null => {
      // Check flags first
      const flagVal = this.parsed.flags[name.toLowerCase()];
      if (typeof flagVal === 'string') return flagVal;

      // Match option position in command definition if available
      if (this.commandDef && Array.isArray(this.commandDef.options)) {
        const optIndex = this.commandDef.options.findIndex((o: any) => o.name === name);
        if (optIndex !== -1 && this.parsed.args[optIndex]) {
          // If this is the last string option, join remaining args for long reasons/strings
          if (optIndex === this.commandDef.options.length - 1 && this.parsed.args.length > optIndex) {
            return this.parsed.args.slice(optIndex).join(' ');
          }
          return this.parsed.args[optIndex];
        }
      }

      // Fallback: return first non-mention argument or joined args
      if (this.parsed.args.length > 0) {
        const filteredArgs = this.parsed.args.filter(a => !a.startsWith('<@') && !a.startsWith('<#'));
        if (filteredArgs.length > 0) {
          return filteredArgs.join(' ');
        }
        return this.parsed.args.join(' ');
      }
      return null;
    },

    getInteger: (name: string, required?: boolean): number | null => {
      const flagVal = this.parsed.flags[name.toLowerCase()];
      if (flagVal !== undefined && !isNaN(Number(flagVal))) {
        return parseInt(String(flagVal), 10);
      }
      if (this.commandDef && Array.isArray(this.commandDef.options)) {
        const optIndex = this.commandDef.options.findIndex((o: any) => o.name === name);
        if (optIndex !== -1 && this.parsed.args[optIndex]) {
          const num = parseInt(this.parsed.args[optIndex], 10);
          if (!isNaN(num)) return num;
        }
      }
      for (const arg of this.parsed.args) {
        const num = parseInt(arg, 10);
        if (!isNaN(num)) return num;
      }
      return null;
    },

    getNumber: (name: string, required?: boolean): number | null => {
      const flagVal = this.parsed.flags[name.toLowerCase()];
      if (flagVal !== undefined && !isNaN(Number(flagVal))) {
        return Number(flagVal);
      }
      if (this.commandDef && Array.isArray(this.commandDef.options)) {
        const optIndex = this.commandDef.options.findIndex((o: any) => o.name === name);
        if (optIndex !== -1 && this.parsed.args[optIndex]) {
          const num = Number(this.parsed.args[optIndex]);
          if (!isNaN(num)) return num;
        }
      }
      for (const arg of this.parsed.args) {
        const num = Number(arg);
        if (!isNaN(num)) return num;
      }
      return null;
    },

    getBoolean: (name: string, required?: boolean): boolean | null => {
      const flagVal = this.parsed.flags[name.toLowerCase()];
      if (typeof flagVal === 'boolean') return flagVal;
      if (typeof flagVal === 'string') return flagVal.toLowerCase() === 'true';
      return null;
    },

    getRole: (name: string, required?: boolean): Role | null => {
      const mentionedRole = this.message.mentions.roles.first();
      if (mentionedRole) return mentionedRole;
      const val = this.parsed.flags[name.toLowerCase()] || this.parsed.args[0];
      if (typeof val === 'string' && this.guild) {
        const idMatch = val.match(/\d{17,19}/);
        if (idMatch) {
          return this.guild.roles.cache.get(idMatch[0]) || null;
        }
      }
      return null;
    },

    getMentionable: (name: string, required?: boolean): any => {
      const mentionedUser = this.message.mentions.users.first();
      if (mentionedUser) return mentionedUser;
      const mentionedRole = this.message.mentions.roles.first();
      if (mentionedRole) return mentionedRole;
      return null;
    },

    getChannel: (name: string, required?: boolean): Channel | null => {
      const mentionedChannel = this.message.mentions.channels.first();
      if (mentionedChannel) return mentionedChannel;
      const val = this.parsed.flags[name.toLowerCase()] || this.parsed.args[0];
      if (typeof val === 'string' && this.guild) {
        const idMatch = val.match(/\d{17,19}/);
        if (idMatch) {
          return this.guild.channels.cache.get(idMatch[0]) || null;
        }
      }
      return null;
    },

    getAttachment: (name: string, required?: boolean): any => {
      return this.message.attachments.first() || null;
    },

    getSubcommandGroup: (required?: boolean): string | null => {
      return null;
    },

    getSubcommand: (required?: boolean): string | null => {
      if (this.parsed.args.length > 0) {
        return this.parsed.args[0].toLowerCase();
      }
      return null;
    },

    getFocused: (): string => {
      return this.parsed.rawInput;
    }
  };
}
