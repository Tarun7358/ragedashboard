/**
 * AntiLink Enhancement — Context-Aware Command Bypass Utility
 *
 * Intelligently validates whether a message containing a URL is a legitimate
 * command invocation designed to accept URLs (e.g. `r!play https://youtube.com/...`).
 */

import { PrefixResolver } from '../core/prefix/PrefixResolver.js';
import { PrefixParser } from '../core/prefix/PrefixParser.js';
import { PrefixRegistry } from '../core/prefix/PrefixRegistry.js';

/**
 * Set of canonical command names and aliases explicitly designed to accept URLs.
 *
 * SECURITY NOTE: Keep this list tight. Generic words like 'add', 'search', 'load',
 * 'link', 'url' were removed because any non-whitelisted user could craft
 * `r!add https://malicious.site` to bypass anti-link entirely.
 * Only include specific, named commands that strictly require a URL argument.
 */
const URL_ACCEPTING_COMMANDS = new Set<string>([
  // Music & Audio — these commands specifically require a YouTube/Spotify/SoundCloud URL
  'play', 'p', 'playnext', 'playtop', 'playlist', 'song', 'spotify', 'youtube',
  'soundcloud', 'stream', 'enqueue',

  // Social Updates — webhook/feed URL configuration (admin-only commands)
  'social-updates',

  // Avatar — fetches avatar URL of a user (no external URL input)
  'avatar', 'av',
]);

/**
 * Validates whether a message containing a URL is a valid command designed to accept URLs.
 *
 * @param message Discord Message object
 * @param clientUserId Bot application client ID
 * @returns true if the message is a valid URL-accepting command (bypass AntiLink), false otherwise.
 */
export function isUrlCommandBypass(message: any, clientUserId?: string): boolean {
  if (!message || !message.content || typeof message.content !== 'string') {
    return false;
  }

  try {
    // 1. Resolve guild prefix or bot mention
    const resolveResult = PrefixResolver.resolvePrefix(message, clientUserId);
    if (!resolveResult.matched || resolveResult.isMentionOnly) {
      return false;
    }

    // 2. Parse command string into command name and arguments
    const parsed = PrefixParser.parse(resolveResult.commandString);
    if (!parsed.commandName) {
      return false;
    }

    const rawCmd = parsed.commandName.toLowerCase();

    // 3. Resolve command metadata from PrefixRegistry or URL_ACCEPTING_COMMANDS
    const registryCmd = PrefixRegistry.getCommand(rawCmd);
    const canonicalName = registryCmd ? registryCmd.name.toLowerCase() : rawCmd;

    const isUrlCommand = URL_ACCEPTING_COMMANDS.has(rawCmd) ||
                         URL_ACCEPTING_COMMANDS.has(canonicalName) ||
                         (registryCmd?.argumentTypes && (
                           registryCmd.argumentTypes.includes('url') ||
                           registryCmd.argumentTypes.includes('link')
                         ));

    if (!isUrlCommand) {
      return false;
    }

    // 4. Validate that the command message contains arguments following the command name
    if (!parsed.args || parsed.args.length === 0) {
      return false;
    }

    return true;
  } catch (err) {
    // Fail safe: If error occurs during validation, do not bypass AntiLink
    return false;
  }
}
