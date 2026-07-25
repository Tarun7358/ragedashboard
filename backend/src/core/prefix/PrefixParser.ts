export interface ParsedCommand {
  commandName: string;
  subcommand?: string;  // BUG-014 FIX: first positional arg treated as subcommand for lock key granularity
  args: string[];
  flags: Record<string, string | boolean>;
  rawInput: string;
}

export class PrefixParser {
  public static parse(commandString: string): ParsedCommand {
    const rawInput = commandString.trim();
    if (!rawInput) {
      return { commandName: '', args: [], flags: {}, rawInput: '' };
    }

    const tokens = this.tokenize(rawInput);
    if (tokens.length === 0) {
      return { commandName: '', args: [], flags: {}, rawInput };
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
      args,
      flags,
      rawInput
    };
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
