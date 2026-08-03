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

    // Determine the effective args slice:
    // If the first arg matches a subcommand name in the definition, skip it and use that sub's options.
    const subName = parsed.subcommand;
    let optionDefs: any[] = cmdDef.options;
    let argOffset = 0;

    if (subName) {
      const subDef = cmdDef.options.find((o: any) => o.name === subName && o.type === 1);
      if (subDef && Array.isArray(subDef.options)) {
        optionDefs = subDef.options;
        argOffset = 1; // skip the subcommand token in args
      }
    }

    const effectiveArgs = parsed.args.slice(argOffset);

    // Map each defined option to the corresponding positional arg, respecting flags first
    for (let i = 0; i < optionDefs.length; i++) {
      const optDef = optionDefs[i];
      const optName = optDef.name as string;

      // Flags have highest priority (e.g. --reason "some reason")
      if (parsed.flags[optName] !== undefined) {
        parsed.options[optName] = String(parsed.flags[optName]);
        continue;
      }

      // If it's the last string option, capture all remaining args joined
      if (i === optionDefs.length - 1 && optDef.type === 3 /* STRING */ && effectiveArgs.length > i) {
        parsed.options[optName] = effectiveArgs.slice(i).join(' ');
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
