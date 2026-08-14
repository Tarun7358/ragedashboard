export interface ParsedCommand {
  commandName: string;
  /**
   * First positional arg treated as a subcommand token.
   * Used by lock-key granularity (BUG-014 FIX) and SyntheticInteraction.getSubcommand().
   */
  subcommand?: string;
  /**
   * Subcommand group name (currently unused at the prefix level; reserved for future slash parity).
   */
  group?: string;
  /**
   * Semantic named-option map, populated by enrichOptions() after registry lookup.
   * Keys are option names as declared in the command definition; values are the resolved arg strings.
   * SyntheticInteraction.getString() reads from here first (O(1) lookup by name)
   * before falling back to positional index logic.
   */
  options: Record<string, string>;
  args: string[];
  flags: Record<string, string | boolean>;
  rawInput: string;
}

export class PrefixParser {
  public static parse(commandString: string): ParsedCommand {
    const rawInput = commandString.trim();
    if (!rawInput) {
      return { commandName: '', args: [], flags: {}, options: {}, rawInput: '' };
    }

    const tokens = this.tokenize(rawInput);
    if (tokens.length === 0) {
      return { commandName: '', args: [], flags: {}, options: {}, rawInput };
    }

    const commandName = tokens[0].toLowerCase();
    const rawArgs = tokens.slice(1);

    const args: string[] = [];
    const flags: Record<string, string | boolean> = {};

    for (let i = 0; i < rawArgs.length; i++) {
      const arg = rawArgs[i];

      if (arg.startsWith('--')) {
        const flagExpr = arg.slice(2);
        if (flagExpr.includes('=')) {
          const [key, ...valParts] = flagExpr.split('=');
          flags[key.toLowerCase()] = valParts.join('=');
        } else if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-')) {
          flags[flagExpr.toLowerCase()] = rawArgs[i + 1];
          i++; // consume next token as value
        } else {
          flags[flagExpr.toLowerCase()] = true;
        }
      } else if (arg.startsWith('-') && arg.length === 2) {
        const key = arg.slice(1).toLowerCase();
        if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-')) {
          flags[key] = rawArgs[i + 1];
          i++;
        } else {
          flags[key] = true;
        }
      } else {
        args.push(arg);
      }
    }

    // First positional arg is the subcommand (for multi-subcommand commands like r!audit export)
    const subcommand = args.length > 0 && !args[0].startsWith('-') ? args[0].toLowerCase() : undefined;

    return {
      commandName,
      subcommand,
      group: undefined,
      options: {}, // populated post-lookup via enrichOptions()
      args,
      flags,
      rawInput
    };
  }

  /**
   * Enrich a ParsedCommand with semantic named options by matching positional args
   * against the command definition's option list. Called by CommandPipeline after
   * the registry lookup, before constructing SyntheticInteraction.
   *
   * This removes the need for getString() to rely on positional index assumptions —
   * it can read parsed.options[name] directly instead.
   *
   * The method is non-destructive: it only writes to parsed.options and never
   * modifies parsed.args, so existing code that reads args[] remains unaffected.
   */
  public static enrichOptions(parsed: ParsedCommand, cmdDef: any): void {
    if (!cmdDef || !Array.isArray(cmdDef.options) || cmdDef.options.length === 0) return;

    const subName = parsed.subcommand;
    let optionDefs: any[] = cmdDef.options;
    let argOffset = 0;

    if (subName) {
      const subDef = cmdDef.options.find((o: any) => o.name === subName && o.type === 1);
      if (subDef && Array.isArray(subDef.options)) {
        optionDefs = subDef.options;
        argOffset = 1;
      }
    }

    const effectiveArgs = parsed.args.slice(argOffset);
    if (effectiveArgs.length === 0) return;

    // Smart type/keyword-based option extraction:
    const knownPrivacyModes = ['public', 'private', 'locked', 'invisible', 'stage', 'sync'];
    const channelIdMatches = effectiveArgs.filter(a => /\d{17,20}/.test(a) || /^<#\d+>$/.test(a));
    const privacyMatch = effectiveArgs.find(a => knownPrivacyModes.includes(a.toLowerCase()));
    const limitMatch = effectiveArgs.find(a => !isNaN(Number(a)) && !channelIdMatches.includes(a));
    const remainingTextArgs = effectiveArgs.filter(a => 
      !channelIdMatches.includes(a) && 
      (!privacyMatch || a.toLowerCase() !== privacyMatch.toLowerCase()) &&
      a !== limitMatch
    );

    if (channelIdMatches.length > 0) {
      const chanOpt = optionDefs.find(o => o.name === 'channel');
      if (chanOpt) parsed.options['channel'] = channelIdMatches[0];
      if (channelIdMatches.length > 1) {
        const catOpt = optionDefs.find(o => o.name === 'category');
        if (catOpt) parsed.options['category'] = channelIdMatches[1];
      }
    }

    if (privacyMatch) {
      const privOpt = optionDefs.find(o => o.name === 'privacy');
      if (privOpt) parsed.options['privacy'] = privacyMatch.toLowerCase();
    }

    if (limitMatch !== undefined) {
      const limOpt = optionDefs.find(o => o.name === 'default_limit' || o.name === 'limit');
      if (limOpt) parsed.options[limOpt.name] = limitMatch;
    }

    if (remainingTextArgs.length > 0) {
      const labelOpt = optionDefs.find(o => o.name === 'label');
      if (labelOpt) parsed.options['label'] = remainingTextArgs.join(' ');
      const nameOpt = optionDefs.find(o => o.name === 'default_name');
      if (nameOpt && !parsed.options['default_name']) parsed.options['default_name'] = remainingTextArgs.join(' ');
    }

    // Standard positional & flag fallback for any unpopulated option definitions
    for (let i = 0; i < optionDefs.length; i++) {
      const optDef = optionDefs[i];
      const optName = optDef.name as string;

      if (parsed.options[optName] !== undefined) continue;

      if (parsed.flags[optName] !== undefined) {
        parsed.options[optName] = String(parsed.flags[optName]);
        continue;
      }

      if (effectiveArgs[i] !== undefined) {
        parsed.options[optName] = effectiveArgs[i];
      }
    }
  }

  private static tokenize(input: string): string[] {
    const tokens: string[] = [];
    let currentToken = '';
    let inDoubleQuote = false;
    let inSingleQuote = false;
    let escaped = false;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if (escaped) {
        currentToken += char;
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
        continue;
      }

      if (char === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
        continue;
      }

      if (/\s/.test(char) && !inDoubleQuote && !inSingleQuote) {
        if (currentToken.length > 0) {
          tokens.push(currentToken);
          currentToken = '';
        }
        continue;
      }

      currentToken += char;
    }

    if (currentToken.length > 0) {
      tokens.push(currentToken);
    }

    return tokens;
  }
}
