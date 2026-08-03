export interface DiscordRole {
  id: string;
  name: string;
  color: string;
  membersCount: number;
  permissions: string[];
  position?: number;
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: 'text' | 'voice' | 'category' | 'announcement' | 'stage' | 'forum' | 'thread';
  category?: string;
  permissions?: string[];
}

export interface DiscordResourceRegistry {
  roles: DiscordRole[];
  channels: DiscordChannel[];
  emojis: { name: string; url: string }[];
  stickers: { name: string; url: string }[];
  lastSyncTime: string;
  memberCount?: number;
  onlineCount?: number;
  globalSettings?: Record<string, any>;
}

export interface ModuleState {
  id: string;
  name: string;
  status: 'installed' | 'not_configured' | 'config_required' | 'validation_failed' | 'ready' | 'enabled' | 'running' | 'paused' | 'maintenance' | 'disabled' | 'error';
  progress: number;
  errors: string[];
  config: Record<string, any>;
  connectionStatus?: string;
  connectedChannelId?: string | null;
  connectionDuration?: string;
  reconnectAttempts?: number;
  voiceGatewayStatus?: string;
}

export interface LogEntry {
  time: string;
  msg: string;
  type: 'info' | 'warn' | 'success';
}

export interface DiscordCommandOption {
  name: string;
  type: number;
  description: string;
  required?: boolean;
  choices?: { name: string; value: string | number }[];
  options?: DiscordCommandOption[];
  /** Restrict channel picker to specific channel types: 0=text, 2=voice, 5=announcement */
  channel_types?: number[];
  /** Enable autocomplete for string options */
  autocomplete?: boolean;
  /** Min/max values for integer/number options */
  min_value?: number;
  max_value?: number;
}

export interface DiscordCommand {
  name: string;
  description: string;
  options?: DiscordCommandOption[];
  execute?: (message: any, args: string[], extra?: any) => Promise<any> | any;
  aliases?: string[];
  usage?: string;
  category?: string;
  cooldownSeconds?: number;
  userPermissions?: string[];
  botPermissions?: string[];
  examples?: string[];
  dangerLevel?: string;
  supportsAutocomplete?: boolean;
  supportsMentions?: boolean;
  argumentTypes?: string[];
  subcommands?: any[];
  experimental?: boolean;
  hidden?: boolean;
  confirmationRequired?: boolean;
}

export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  dependencies?: string[];
  configSchema: {
    requiredFields: string[];
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => { progress: number; errors: string[] };
  };
  commands?: DiscordCommand[];
  events?: Array<{
    name: string;
    handler: (client: any, ...args: any[]) => Promise<void> | void;
  }>;
  routes?: Array<{
    path: string;
    method: 'get' | 'post';
    handler: (req: any, res: any, context: any) => Promise<void> | void;
  }>;
}

export interface IEventBus {
  publish(event: string, data: any): void;
  subscribe(event: string, callback: (data: any) => void): void;
}
