import {
  AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
  NoSubscriberBehavior,
  entersState,
  StreamType
} from '@discordjs/voice';
import play from 'play-dl';
import ytdl from '@distube/ytdl-core';
import { spawn, ChildProcess, execFile } from 'child_process';
import { promisify } from 'util';
import { request as httpRequest } from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

export const EMOJIS = {
  SOUNDWAVE: '<a:soundwave:1527641639924011028>',
  VOICE: '<:voicechannelgreen:1532425750278438962>',
  YOUTUBE: '<:YouTube:1527641424169009412>',
  TIMER: '<:timer:1532620491662037123>',
  MEMBER: '<:member:1532621317487071426>',
  STATS: '<:stats:1532429110775779459>',
  INFO: '<:information:1532621274092929124>',
  CONFIG: '<:config:1532425712844144701>',
  LINK: '<:link:1532620952087826602>',
  APPROVED: '<a:approved:1532390590707142956>',
  TICKS: '<:ticks:1532620580266836148>',
  WRONG: '<:wrong:1532390628330307634>',
  SHIELD: '<:shield:1532403012751065179>',
  ARROW: '<:lightpurplearrow:1532621364115013693>',
  RED_TICK: '<a:redtick:1527647199108796607>',
  VIP: '<:vip:1532620837117759508>',
};

import crypto from 'crypto';

export class AudioStreamCache {
  private static cacheDir = path.join(process.cwd(), '.cache', 'music');
  private static maxCacheSizeBytes = 100 * 1024 * 1024; // 100 MB LRU limit

  public static init() {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    } catch (e) {}
  }

  private static getHash(url: string): string {
    return crypto.createHash('md5').update(url).digest('hex');
  }

  public static getCachedFilePath(url: string): string | null {
    this.init();
    try {
      const hash = this.getHash(url);
      const filePath = path.join(this.cacheDir, `${hash}.audio`);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.size > 100000) {
          fs.utimesSync(filePath, new Date(), new Date());
          console.log(`[Music Cache] Cache HIT for: ${url} (${filePath})`);
          return filePath;
        }
      }
    } catch (e) {}
    return null;
  }

  public static async cacheStream(url: string, stream: any): Promise<string | null> {
    this.init();
    try {
      const hash = this.getHash(url);
      const filePath = path.join(this.cacheDir, `${hash}.audio`);
      const tempPath = path.join(this.cacheDir, `${hash}.tmp`);

      const outStream = fs.createWriteStream(tempPath);
      stream.pipe(outStream);

      await new Promise<void>((resolve, reject) => {
        outStream.on('finish', () => resolve());
        outStream.on('error', reject);
        stream.on('error', reject);
      }).catch(() => {});

      if (fs.existsSync(tempPath)) {
        const stat = fs.statSync(tempPath);
        if (stat.size > 100000) {
          fs.renameSync(tempPath, filePath);
          console.log(`[Music Cache] Successfully cached track: ${url} (${stat.size} bytes)`);
          this.pruneCache();
          return filePath;
        } else {
          try { fs.unlinkSync(tempPath); } catch (e) {}
        }
      }
    } catch (err) {
      console.warn(`[Music Cache] Stream cache warning:`, err);
    }
    return null;
  }

  public static pruneCache() {
    try {
      if (!fs.existsSync(this.cacheDir)) return;
      const files = fs.readdirSync(this.cacheDir);
      let totalSize = 0;
      const fileStats: { path: string; size: number; mtime: number }[] = [];

      for (const file of files) {
        if (file.endsWith('.tmp')) {
          try { fs.unlinkSync(path.join(this.cacheDir, file)); } catch (e) {}
          continue;
        }
        const fullPath = path.join(this.cacheDir, file);
        const stat = fs.statSync(fullPath);
        totalSize += stat.size;
        fileStats.push({ path: fullPath, size: stat.size, mtime: stat.mtimeMs });
      }

      if (totalSize > this.maxCacheSizeBytes) {
        fileStats.sort((a, b) => a.mtime - b.mtime);
        for (const file of fileStats) {
          if (totalSize <= this.maxCacheSizeBytes) break;
          try {
            fs.unlinkSync(file.path);
            totalSize -= file.size;
            console.log(`[Music Cache] Pruned LRU file: ${file.path}`);
          } catch (e) {}
        }
      }
    } catch (e) {}
  }
}

const execFileAsync = promisify(execFile);
const currentModuleDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

function getYtDlpPath(): string {
  const isWin = process.platform === 'win32';
  const candidatePaths = [
    path.join(process.cwd(), 'yt-dlp'),
    path.join(process.cwd(), 'yt-dlp.exe'),
    path.join(process.cwd(), 'bin', 'yt-dlp'),
    path.join(process.cwd(), 'bin', 'yt-dlp.exe'),
    path.join(process.cwd(), '..', 'yt-dlp'),
    path.join(process.cwd(), '..', 'yt-dlp.exe'),
    path.join(process.cwd(), '..', 'bin', 'yt-dlp'),
    path.join(process.cwd(), '..', 'bin', 'yt-dlp.exe'),
    path.join(currentModuleDir, '../../../yt-dlp'),
    path.join(currentModuleDir, '../../../yt-dlp.exe'),
    path.join(currentModuleDir, '../../../bin/yt-dlp'),
    path.join(currentModuleDir, '../../../bin/yt-dlp.exe')
  ];

  for (const candidate of candidatePaths) {
    try {
      if (fs.existsSync(candidate)) {
        if (!isWin) {
          try { fs.chmodSync(candidate, 0o755); } catch (e) {}
        }
        return candidate;
      }
    } catch (e) {}
  }
  return 'yt-dlp';
}

async function extractDirectUrlWithYtDlp(audioUrl: string): Promise<string | null> {
  const ytDlpPath = getYtDlpPath();
  const tryExtract = async (args: string[]) => {
    const { stdout } = await execFileAsync(ytDlpPath, args, { timeout: 15000 });
    const lines = stdout.trim().split('\n').map(l => l.trim());
    return lines.find(l => l.startsWith('http://') || l.startsWith('https://')) || null;
  };

  try {
    const url = await tryExtract(['-g', '-f', 'bestaudio', '--no-playlist', audioUrl]);
    if (url) return url;
  } catch (err: any) {
    console.warn(`[Music Warning] yt-dlp direct URL extraction primary attempt failed:`, err?.message || err);
  }

  try {
    const url = await tryExtract(['-g', '-f', 'bestaudio', '--no-playlist', '--js-runtimes', 'node', audioUrl]);
    if (url) return url;
  } catch (err: any) {
    console.warn(`[Music Warning] yt-dlp direct URL extraction fallback attempt failed:`, err?.message || err);
  }

  return null;
}

async function searchWithYtDlp(query: string): Promise<{ url: string; title: string; duration: string; thumbnail: string; artist: string } | null> {
  const ytDlpPath = getYtDlpPath();
  const runSearch = async (args: string[]) => {
    const { stdout } = await execFileAsync(ytDlpPath, args, { timeout: 15000 });
    const lines = stdout.trim().split('\n').map(l => l.trim()).filter(l => Boolean(l) && !l.startsWith('WARNING:') && !l.startsWith('['));
    if (lines.length >= 2) {
      const url = lines.find(l => l.startsWith('http://') || l.startsWith('https://')) || '';
      if (!url) return null;
      const nonUrlLines = lines.filter(l => !l.startsWith('http://') && !l.startsWith('https://'));
      return {
        url,
        title: nonUrlLines[0] || query,
        duration: lines.find(l => /^\d+(:\d+)+$/.test(l)) || '3:00',
        thumbnail: lines.find(l => (l.startsWith('http://') || l.startsWith('https://')) && l !== url) || '',
        artist: nonUrlLines[1] || 'YouTube Creator'
      };
    }
    return null;
  };

  try {
    const res = await runSearch([
      '-f', 'bestaudio',
      '--no-playlist',
      '--print', 'webpage_url',
      '--print', 'title',
      '--print', 'duration_string',
      '--print', 'thumbnail',
      '--print', 'uploader',
      `ytsearch1:${query}`
    ]);
    if (res) return res;
  } catch (err: any) {
    console.warn(`[Music Warning] yt-dlp search failed:`, err?.message || err);
  }

  return null;
}
// @ts-ignore
import ffmpegPath from 'ffmpeg-static';
import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  StringSelectMenuBuilder, 
  ButtonStyle, 
  EmbedBuilder 
} from 'discord.js';

export interface Track {
  title: string;
  url: string;
  duration: string;
  thumbnail: string;
  requester: string;
  artist?: string;
  uploadDate?: string;
  views?: string;
  platform?: 'YouTube' | 'Spotify' | 'SoundCloud';
}

export function getPlaybackProgress(queue: GuildQueue): { elapsedStr: string; durationStr: string; bar: string } {
  if (!queue.currentTrack) return { elapsedStr: '00:00', durationStr: '00:00', bar: '━━━━━━━━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━' };
  
  let elapsedMs = 0;
  if (queue.playbackStartTime) {
    if (queue.pausedTime) {
      elapsedMs = queue.pausedTime - queue.playbackStartTime - queue.totalPausedDuration;
    } else {
      elapsedMs = Date.now() - queue.playbackStartTime - queue.totalPausedDuration;
    }
  }

  // Adjust for playback speed
  const elapsedSec = Math.max(0, Math.floor((elapsedMs * queue.speed) / 1000));
  
  // parse duration e.g. "03:45" or "01:23:45"
  const durParts = queue.currentTrack.duration.split(':').map(Number);
  let durSec = 0;
  if (durParts.length === 2) {
    durSec = durParts[0] * 60 + durParts[1];
  } else if (durParts.length === 3) {
    durSec = durParts[0] * 3600 + durParts[1] * 60 + durParts[2];
  }
  
  if (isNaN(durSec) || durSec === 0) {
    durSec = 180; // fallback default
  }

  const progress = Math.min(elapsedSec / durSec, 1.0);
  const totalBarLength = 24;
  const dotPosition = Math.round(progress * totalBarLength);
  
  let bar = '';
  for (let i = 0; i <= totalBarLength; i++) {
    if (i === dotPosition) {
      bar += '●';
    } else {
      bar += '━';
    }
  }

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return {
    elapsedStr: formatTime(elapsedSec),
    durationStr: formatTime(durSec),
    bar
  };
}

export class GuildQueue {
  public guildId: string;
  public connection: VoiceConnection | null = null;
  public player: AudioPlayer;
  public queue: Track[] = [];
  public currentTrack: Track | null = null;
  public loopMode: 'off' | 'track' | 'queue' = 'off';
  public volume: number = 100;
  public autoplay: boolean = false;
  public idleSince: number | null = null;
  
  // Premium properties
  public textChannelId: string | null = null;
  public panelMessageId: string | null = null;
  public activeFilters: string[] = [];
  public playHistory: Track[] = [];
  public favorites: Track[] = [];
  public playlists: { name: string; tracks: Track[] }[] = [];
  public speed: number = 1.0;
  public pitch: number = 1.0;
  public playbackStartTime: number | null = null;
  public pausedTime: number | null = null;
  public totalPausedDuration: number = 0;
  public progressInterval: NodeJS.Timeout | null = null;
  public viewMode: 'player' | 'queue' | 'filters' | 'volume' | 'lyrics' | 'settings' | 'playlists' = 'player';
  public queuePage: number = 0;
  public client: any = null;

  public voiceChannel: any = null;
  public resource: any = null;
  private queueLock = false;
  private retryCount = 0;
  private retryInProgress = false;
  private retrySequence = 0; // FIX #2: sequence counter to invalidate stale retry timers

  private disconnectTimeout: NodeJS.Timeout | null = null;
  private playDlStream: any = null;
  private currentProcess: ChildProcess | null = null;
  private ffmpegProcess: ChildProcess | null = null;

  constructor(guildId: string) {
    this.guildId = guildId;
    this.player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
      },
    });
    
    this.player.on(AudioPlayerStatus.Idle, () => {
      this.playNext();
    });

    this.player.on(AudioPlayerStatus.Playing, () => {
      this.retryCount = 0;
    });

    this.player.on('error', async (error) => {
      console.error(`Error playing audio in ${this.guildId}:`, error);
      if (this.currentTrack) {
        await this.handleTrackError(this.currentTrack, error);
      } else {
        await this.playNext();
      }
    });
  }

  public getElapsedSeconds(): number {
    if (!this.currentTrack || !this.playbackStartTime) return 0;
    
    let elapsedMs = 0;
    if (this.pausedTime) {
      elapsedMs = this.pausedTime - this.playbackStartTime - this.totalPausedDuration;
    } else {
      elapsedMs = Date.now() - this.playbackStartTime - this.totalPausedDuration;
    }
    
    return Math.max(0, Math.floor((elapsedMs * this.speed) / 1000));
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(200, vol));
    if (this.resource?.volume) {
      this.resource.volume.setVolume(this.volume / 100);
    }
  }

  private async lockQueue(timeoutMs = 5000) {
    const start = Date.now();
    while (this.queueLock) {
      if (Date.now() - start > timeoutMs) {
        console.warn('[Music] Queue lock timeout — forcing unlock to prevent deadlock');
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    this.queueLock = true;
  }

  private unlockQueue() {
    this.queueLock = false;
  }

  private setupConnection(voiceChannel: any) {
    this.voiceChannel = voiceChannel;
    if (!this.connection) {
      this.connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      });

      this.connection.subscribe(this.player);

      this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          console.log(`[Music Debug] Voice disconnected in guild ${this.guildId}. Attempting auto-reconnection...`);
          await Promise.race([
            entersState(this.connection!, VoiceConnectionStatus.Signalling, 5000),
            entersState(this.connection!, VoiceConnectionStatus.Connecting, 5000),
          ]);
          console.log(`[Music Debug] Voice successfully reconnected in guild ${this.guildId}`);
        } catch (error) {
          console.log(`[Music Debug] Auto-reconnect failed. Trying to rejoin voice channel...`);
          if (this.voiceChannel) {
            try {
              this.connection = joinVoiceChannel({
                channelId: this.voiceChannel.id,
                guildId: this.voiceChannel.guild.id,
                adapterCreator: this.voiceChannel.guild.voiceAdapterCreator,
              });
              this.connection.subscribe(this.player);
              console.log(`[Music Debug] Rejoined voice channel: ${this.voiceChannel.name}`);
              if (this.currentTrack) {
                await this.startStream(this.currentTrack);
              }
            } catch (rejoinErr) {
              console.error(`[Music Debug] Failed to rejoin voice channel:`, rejoinErr);
              this.destroy();
            }
          } else {
            this.destroy();
          }
        }
      });
    }
  }

  public async preloadNextTracks() {
    const maxPreload = 2;
    for (let i = 0; i < Math.min(this.queue.length, maxPreload); i++) {
      const track = this.queue[i];
      if (track.url.startsWith('search:')) {
        try {
          console.log(`[Music Debug] Preloading next track: "${track.title}"`);
          const query = track.url.replace('search:', '');
          const results = await play.search(query, { limit: 1 }).catch(() => []);
          if (results && results.length > 0) {
            track.url = results[0].url;
            if (results[0].title) track.title = results[0].title;
            if (results[0].durationRaw) track.duration = results[0].durationRaw;
            if (results[0].thumbnails?.[0]?.url) track.thumbnail = results[0].thumbnails[0].url;
            if (results[0].channel?.name) track.artist = results[0].channel.name;
            console.log(`[Music Debug] Preloaded track to: ${track.url}`);
          }
        } catch (err) {
          console.error(`[Music Debug] Preload failed for track "${track.title}":`, err);
        }
      }
    }
  }

  public async play(track: Track, voiceChannel: any) {
    if (!voiceChannel) {
      throw new Error('You must be in a voice channel to play music.');
    }
    await this.lockQueue();
    try {
      this.client = voiceChannel.client;
      this.textChannelId = this.textChannelId || voiceChannel.id;
      this.voiceChannel = voiceChannel;

      this.setupConnection(voiceChannel);

      if (this.disconnectTimeout) {
        clearTimeout(this.disconnectTimeout);
        this.disconnectTimeout = null;
      }
      this.idleSince = null;

      if (!this.currentTrack) {
        this.currentTrack = track;
        await this.startStream(track);
      } else {
        this.queue.push(track);
        await this.updatePanel(this.client);
      }

      this.preloadNextTracks().catch(() => {});
    } finally {
      this.unlockQueue();
    }
  }

  public async playPlaylist(tracks: Track[], voiceChannel: any) {
    if (!voiceChannel) {
      throw new Error('You must be in a voice channel to play music.');
    }
    await this.lockQueue();
    try {
      this.client = voiceChannel.client;
      this.textChannelId = this.textChannelId || voiceChannel.id;
      this.voiceChannel = voiceChannel;

      this.setupConnection(voiceChannel);

      if (this.disconnectTimeout) {
        clearTimeout(this.disconnectTimeout);
        this.disconnectTimeout = null;
      }
      this.idleSince = null;

      console.log(`[Music Debug] Queueing playlist of ${tracks.length} tracks.`);
      if (!this.currentTrack) {
        this.currentTrack = tracks[0];
        this.queue.push(...tracks.slice(1));
        await this.startStream(this.currentTrack);
      } else {
        this.queue.push(...tracks);
        await this.updatePanel(this.client);
      }

      this.preloadNextTracks().catch(() => {});
    } finally {
      this.unlockQueue();
    }
  }

  public async playNext(seekSeconds?: number) {
    await this.lockQueue();
    try {
      if (!this.currentTrack && this.queue.length === 0) {
        // Was stopped by user or nothing is playing — do not trigger autoplay or skip
        return;
      }

      if (this.loopMode === 'track' && this.currentTrack) {
        await this.startStream(this.currentTrack, seekSeconds);
        return;
      }

      if (this.loopMode === 'queue' && this.currentTrack) {
        this.queue.push(this.currentTrack);
      }

      const nextTrack = this.queue.shift();
      if (nextTrack) {
        this.currentTrack = nextTrack;
        await this.startStream(nextTrack, seekSeconds);
      } else {
        // Queue is empty, start idle timeout
        this.currentTrack = null;
        this.playbackStartTime = null;
        this.totalPausedDuration = 0;
        this.pausedTime = null;
        if (this.progressInterval) {
          clearInterval(this.progressInterval);
          this.progressInterval = null;
        }
        
        this.idleSince = Date.now();
        await this.updatePanel(this.client);

        // Disconnect after 2 minutes of inactivity
        if (this.disconnectTimeout) clearTimeout(this.disconnectTimeout);
        this.disconnectTimeout = setTimeout(() => {
          if (!this.currentTrack && this.connection) {
            this.destroy();
          }
        }, 120000);
      }
    } finally {
      this.unlockQueue();
    }
  }

  private async handleTrackError(track: Track, error: any) {
    const errStr = error?.stack || error?.message || (typeof error === 'object' && Object.keys(error).length > 0 ? JSON.stringify(error) : String(error));
    console.error(`[Music Debug] Error playing track "${track.title}": ${errStr}`);
    // FIX #2: Guard against duplicate retries using retryInProgress + sequence counter
    if (this.retryInProgress) return;
    if (this.retryCount < 1) {
      this.retryCount++;
      this.retryInProgress = true;
      const seq = ++this.retrySequence;
      console.log(`[Music Debug] Retrying failed track: "${track.title}" (Attempt 1/1, seq=${seq})`);
      if (track.url.includes('youtube.com') || track.url.includes('youtu.be')) {
        track.url = `search:${track.title} ${track.artist || ''}`;
      }
      setTimeout(async () => {
        if (seq !== this.retrySequence) {
          console.log(`[Music Debug] Discarding stale retry (seq=${seq}, current=${this.retrySequence})`);
          return;
        }
        this.retryInProgress = false;
        try {
          await this.startStream(track);
        } catch (retryErr) {
          await this.handleTrackError(track, retryErr);
        }
      }, 1500);
    } else {
      this.retryCount = 0;
      this.retryInProgress = false;
      console.log(`[Music Debug] Track failed twice, skipping: "${track.title}"`);
      await this.playNext();
    }
  }

  private async startStream(nextTrack: Track, seekSeconds: number = 0) {
    // FIX #8: Guard against calling .destroy() on an already-destroyed stream
    if (this.playDlStream) {
      try {
        if (!this.playDlStream.destroyed) this.playDlStream.destroy();
      } catch (e) {}
      this.playDlStream = null;
    }
    if (this.currentProcess) {
      try {
        if (this.currentProcess.stdout) {
          this.currentProcess.stdout.unpipe();
          this.currentProcess.stdout.destroy();
        }
        this.currentProcess.kill();
      } catch (e) {}
      this.currentProcess = null;
    }
    if (this.ffmpegProcess) {
      try {
        if (this.ffmpegProcess.stdin) {
          this.ffmpegProcess.stdin.end();
          this.ffmpegProcess.stdin.destroy();
        }
        if (this.ffmpegProcess.stdout) {
          this.ffmpegProcess.stdout.destroy();
        }
        this.ffmpegProcess.kill();
      } catch (e) {}
      this.ffmpegProcess = null;
    }

    try {
      let audioUrl = nextTrack.url;
      if (nextTrack.url.startsWith('search:')) {
        const query = nextTrack.url.replace('search:', '');
        let foundTrack = false;

        const results = await play.search(query, { limit: 1 }).catch(() => []);
        if (results && results.length > 0) {
          audioUrl = results[0].url;
          nextTrack.url = audioUrl;
          if (results[0].title) nextTrack.title = results[0].title;
          if (results[0].durationRaw) nextTrack.duration = results[0].durationRaw;
          if (results[0].thumbnails?.[0]?.url) nextTrack.thumbnail = results[0].thumbnails[0].url;
          if (results[0].channel?.name) nextTrack.artist = results[0].channel.name;
          foundTrack = true;
        }

        if (!foundTrack) {
          console.log(`[Music] play-dl search empty for "${query}", falling back to yt-dlp search...`);
          const ytResult = await searchWithYtDlp(query);
          if (ytResult && ytResult.url) {
            audioUrl = ytResult.url;
            nextTrack.url = audioUrl;
            if (ytResult.title) nextTrack.title = ytResult.title;
            if (ytResult.duration) nextTrack.duration = ytResult.duration;
            if (ytResult.thumbnail) nextTrack.thumbnail = ytResult.thumbnail;
            if (ytResult.artist) nextTrack.artist = ytResult.artist;
            foundTrack = true;
          }
        }

        if (!foundTrack) {
          throw new Error(`Track "${query}" not found via play-dl or yt-dlp search.`);
        }
      }

      let streamCreated = false;
      let directStreamUrl: string | null = null;

      // Tier 0: Local Disk Cache (0ms instant playback for repeated/popular tracks)
      const cachedFile = AudioStreamCache.getCachedFilePath(audioUrl);
      if (cachedFile && seekSeconds === 0) {
        console.log(`[Music] ⚡ Instant playback from local cache: ${cachedFile}`);
        directStreamUrl = cachedFile;
        streamCreated = true;
      }

      // Tier 1: yt-dlp binary stdout process (Preferred for YouTube - avoids googlevideo CDN 403 blocks)
      if (!streamCreated && (audioUrl.includes('youtube.com') || audioUrl.includes('youtu.be'))) {
        const ytDlpPath = getYtDlpPath();
        try {
          console.log(`[Music] Spawning yt-dlp binary (${ytDlpPath}) stdout stream for: ${audioUrl}`);
          const proc = spawn(ytDlpPath, [
            '-o', '-',
            '-f', 'bestaudio',
            '--no-playlist',
            '--quiet',
            audioUrl
          ]);

          await new Promise<void>((resolve, reject) => {
            proc.once('error', reject);
            setTimeout(() => {
              proc.removeListener('error', reject);
              resolve();
            }, 300);
          });

          this.currentProcess = proc;
          this.currentProcess.on('error', (err) => {
            console.error('[Music Debug] yt-dlp process error:', err);
          });
          if (this.currentProcess.stdout) {
            this.currentProcess.stdout.on('error', (err) => {
              console.warn('[Music Debug] yt-dlp stdout error (ok during skip):', err.message);
            });
          }
          if (this.currentProcess.stderr) {
            this.currentProcess.stderr.on('data', (data) => {
              const msg = data.toString().trim();
              if (msg && !msg.startsWith('[download]') && !msg.startsWith('[youtube]') && !msg.includes('WARNING:')) {
                console.warn(`[Music yt-dlp stderr] ${msg}`);
              }
            });
          }
          streamCreated = true;
          console.log(`[Music] Successfully created yt-dlp binary stdout stream`);
        } catch (ytDlpErr: any) {
          console.warn(`[Music Warning] yt-dlp binary stdout failed, trying direct URL fallback:`, ytDlpErr.message || ytDlpErr);
        }
      }

      // Tier 2: yt-dlp Direct URL Extraction fallback
      if (!streamCreated && (audioUrl.includes('youtube.com') || audioUrl.includes('youtu.be'))) {
        console.log(`[Music] Attempting direct URL extraction via yt-dlp for: ${audioUrl}`);
        const directUrl = await extractDirectUrlWithYtDlp(audioUrl);
        if (directUrl) {
          directStreamUrl = directUrl;
          streamCreated = true;
          console.log(`[Music] Successfully extracted direct media URL via yt-dlp`);
        } else {
          console.warn(`[Music Warning] yt-dlp direct URL extraction returned null, trying play-dl fallback...`);
        }
      }

      // Tier 3: play-dl stream (for SoundCloud, Spotify, or YouTube fallback)
      if (!streamCreated) {
        try {
          console.log(`[Music] Attempting to stream via play-dl: ${audioUrl} (seek: ${seekSeconds}s)`);
          const playOptions: any = {};
          if (seekSeconds > 0) playOptions.seek = seekSeconds;
          const streamData = await play.stream(audioUrl, playOptions);
          this.playDlStream = streamData.stream;
          streamCreated = true;
          console.log(`[Music] Successfully created play-dl stream`);
        } catch (playDlErr: any) {
          console.warn(`[Music Warning] play-dl streaming failed:`, playDlErr.message || playDlErr);
        }
      }

      // Tier 4: @distube/ytdl-core (last resort)
      if (!streamCreated && (audioUrl.includes('youtube.com') || audioUrl.includes('youtu.be'))) {
        try {
          console.log(`[Music] Attempting @distube/ytdl-core for: ${audioUrl}`);
          const ytdlStream = ytdl(audioUrl, {
            filter: 'audioonly',
            quality: 'highestaudio',
            highWaterMark: 1 << 25,
          });
          await new Promise<void>((resolve, reject) => {
            ytdlStream.once('error', reject);
            ytdlStream.once('data', () => {
              ytdlStream.removeListener('error', reject);
              resolve();
            });
            setTimeout(() => {
              ytdlStream.removeListener('error', reject);
              resolve();
            }, 2000);
          });
          this.playDlStream = ytdlStream as any;
          streamCreated = true;
          console.log(`[Music] Successfully created @distube/ytdl-core stream`);
        } catch (ytdlErr: any) {
          console.error(`[Music Error] @distube/ytdl-core failed:`, ytdlErr.message || ytdlErr);
          throw new Error(`All audio backends (yt-dlp, play-dl, ytdl-core) failed for: ${audioUrl}`);
        }
      }

      if (!streamCreated) {
        throw new Error(`No audio stream could be created for: ${audioUrl}`);
      }

      // Build FFmpeg filters
      const afFilters: string[] = [];
      
      // Volume filter
      afFilters.push(`volume=${this.volume / 100}`);

      // Speed & Pitch filters
      if (this.speed !== 1.0) {
        afFilters.push(`atempo=${this.speed}`);
      }

      // Nightcore/Vaporwave already bake in their own asetrate — skip custom pitch to avoid conflict (BUG FIX #7)
      const hasAsetrate = this.activeFilters.includes('nightcore') || this.activeFilters.includes('vaporwave');
      if (this.pitch !== 1.0 && !hasAsetrate) {
        const rate = Math.round(48000 * this.pitch);
        afFilters.push(`asetrate=${rate}`);
        afFilters.push(`atempo=${(1 / this.pitch).toFixed(4)}`);
      }

      // Other active filters
      this.activeFilters.forEach(f => {
        if (f === 'bassboost') {
          afFilters.push('equalizer=f=60:width_type=o:width=2:g=12');
        } else if (f === 'nightcore') {
          afFilters.push('asetrate=48000*1.25,atempo=1.0');
        } else if (f === '8d') {
          afFilters.push('apulsator=hz=0.125');
        } else if (f === 'vaporwave') {
          afFilters.push('asetrate=48000*0.75,atempo=1.0');
        } else if (f === 'treble') {
          afFilters.push('equalizer=f=3000:width_type=h:width=200:g=10');
        } else if (f === 'karaoke') {
          afFilters.push('pan=stereo|c0=c0-c1|c1=c1-c0');
        } else if (f === 'reverb') {
          afFilters.push('aecho=0.8:0.88:60:0.4');
        } else if (f === 'surround') {
          afFilters.push('apulsator=hz=0.25');
        } else if (f === 'normalize') {
          afFilters.push('loudnorm');
        }
      });

      const ffmpegArgs: string[] = ['-loglevel', 'error'];

      if (directStreamUrl) {
        ffmpegArgs.push(
          '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\nReferer: https://www.youtube.com/\r\n',
          '-reconnect', '1',
          '-reconnect_streamed', '1',
          '-reconnect_delay_max', '5',
          '-i', directStreamUrl
        );
      } else {
        ffmpegArgs.push('-i', 'pipe:0');
      }

      if (seekSeconds > 0 && !directStreamUrl && !this.playDlStream) {
        ffmpegArgs.push('-ss', String(seekSeconds));
      } else if (seekSeconds > 0 && directStreamUrl) {
        ffmpegArgs.push('-ss', String(seekSeconds));
      }

      if (afFilters.length > 0) {
        ffmpegArgs.push('-af', afFilters.join(','));
      }

      ffmpegArgs.push(
        '-f', 's16le',
        '-ar', '48000',
        '-ac', '2',
        'pipe:1'
      );

      const actualFfmpeg = (ffmpegPath as any) || 'ffmpeg';
      this.ffmpegProcess = spawn(actualFfmpeg, ffmpegArgs);

      this.ffmpegProcess.on('error', (err) => {
        console.error('[Music FFmpeg Error] process error:', err);
      });
      this.ffmpegProcess.on('exit', (code, signal) => {
        // Code 255 = ECONNRESET (Discord closed pipe on disconnect/skip) — normal
        if (code !== 0 && code !== null && code !== 255) {
          console.warn(`[Music FFmpeg Exit] process exited with code ${code}, signal ${signal}`);
        }
      });
      if (this.ffmpegProcess.stderr) {
        this.ffmpegProcess.stderr.on('data', (data: Buffer) => {
          const msg = data.toString().trim();
          if (msg && !msg.startsWith('frame=') && !msg.startsWith('size=')
              && !msg.includes('Connection reset by peer')
              && !msg.includes('Broken pipe')
              && !msg.includes('muxing overhead')) {
            console.warn('[Music FFmpeg]', msg);
          }
        });
      }

      if (!directStreamUrl) {
        const inputStream = this.playDlStream || (this.currentProcess ? this.currentProcess.stdout : null);

        if (inputStream && this.ffmpegProcess && this.ffmpegProcess.stdin) {
          inputStream.on('error', (err: any) => {
            console.warn('[Music Debug] Input stream error (ok during skip):', err.message);
          });
          if (this.currentProcess) {
            this.currentProcess.on('error', (err: any) => {
              console.warn('[Music Debug] currentProcess error (ok during skip):', err.message);
            });
          }
          this.ffmpegProcess.stdin.on('error', (err: any) => {
            console.warn('[Music Debug] ffmpeg stdin stream error (ok during skip):', err.message);
          });
          if (this.ffmpegProcess.stdout) {
            this.ffmpegProcess.stdout.on('error', (err: any) => {
              console.warn('[Music Debug] ffmpeg stdout stream error (ok during skip):', err.message);
            });
          }

          inputStream.pipe(this.ffmpegProcess.stdin as any);
        } else {
          throw new Error('Failed to pipe stdout of source stream to stdin of ffmpeg');
        }
      }

      if (!this.ffmpegProcess || !this.ffmpegProcess.stdout) throw new Error('Failed to create ffmpeg stdout');

      const resource = createAudioResource(this.ffmpegProcess.stdout as any, {
        inputType: StreamType.Raw,
        inlineVolume: true
      });
      this.resource = resource;
      resource.volume?.setVolume(this.volume / 100);

      this.player.play(resource);
      console.log(`[Music] Player started playing resource via yt-dlp & FFmpeg with filters: ${afFilters.join(',') || 'none'}.`);

      // Track playback start times
      this.playbackStartTime = Date.now() - Math.floor((seekSeconds * 1000) / this.speed);
      this.totalPausedDuration = 0;
      this.pausedTime = null;

      // Start progress update interval
      if (this.progressInterval) {
        clearInterval(this.progressInterval);
      }
      this.progressInterval = setInterval(() => {
        if (this.player.state.status === AudioPlayerStatus.Playing) {
          this.updatePanel(this.client);
        }
      }, 5000);

      // Send/edit control panel message
      await this.updatePanel(this.client);
      
      // Add to play history
      if (!this.playHistory.find(t => t.url === nextTrack.url)) {
        this.playHistory.unshift(nextTrack);
        if (this.playHistory.length > 50) this.playHistory.pop();
      }

      this.preloadNextTracks().catch(() => {});

    } catch (err) {
      // Use process.nextTick to release the queue lock BEFORE handleTrackError
      // re-enters playNext(), preventing a deadlock spin loop (BUG FIX #3)
      process.nextTick(() => this.handleTrackError(nextTrack, err).catch(console.error));
    }
  }

  public skip() {
    this.player.stop(); // triggers Idle which calls playNext
  }

  public stop() {
    this.queue = [];
    this.currentTrack = null;
    this.loopMode = 'off';
    this.playbackStartTime = null;
    this.totalPausedDuration = 0;
    this.pausedTime = null;
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    this.player.stop();
    if (this.playDlStream) {
      try {
        this.playDlStream.destroy();
      } catch (e) {}
      this.playDlStream = null;
    }
    if (this.currentProcess) {
      try {
        if (this.currentProcess.stdout) {
          this.currentProcess.stdout.unpipe();
          this.currentProcess.stdout.destroy();
        }
        this.currentProcess.kill();
      } catch (e) {}
      this.currentProcess = null;
    }
    if (this.ffmpegProcess) {
      try {
        if (this.ffmpegProcess.stdin) {
          this.ffmpegProcess.stdin.end();
          this.ffmpegProcess.stdin.destroy();
        }
        if (this.ffmpegProcess.stdout) {
          this.ffmpegProcess.stdout.destroy();
        }
        this.ffmpegProcess.kill();
      } catch (e) {}
      this.ffmpegProcess = null;
    }
  }

  public pause() {
    this.player.pause();
    this.pausedTime = Date.now();
    this.updatePanel(this.client).catch(() => {});
  }

  public resume() {
    this.player.unpause();
    if (this.pausedTime) {
      this.totalPausedDuration += Date.now() - this.pausedTime;
      this.pausedTime = null;
    }
    this.updatePanel(this.client).catch(() => {});
  }

  public destroy() {
    this.stop(); // stop() already kills all streams, processes and resets state
    if (this.connection) {
      try { this.connection.destroy(); } catch (e) {}
    }
    this.connection = null;
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  public async openControls(client: any) {
    if (this.panelMessageId && this.textChannelId) {
      try {
        const channel = await client.channels.fetch(this.textChannelId).catch(() => null);
        if (channel) {
          const oldMsg = await channel.messages.fetch(this.panelMessageId).catch(() => null);
          if (oldMsg) {
            await oldMsg.delete().catch(() => {});
          }
        }
      } catch (e) {}
    }
    this.panelMessageId = null;
    await this.updatePanel(client);
  }

  public async broadcastState() {
    if (!this.client) return;
    
    // Calculate progress details
    const { elapsedStr, durationStr, bar } = getPlaybackProgress(this);
    
    let voiceChannelName = 'Disconnected';
    let listeners = 0;
    if (this.connection?.joinConfig.channelId) {
      const vc = await this.client.channels.fetch(this.connection.joinConfig.channelId).catch(() => null);
      if (vc) {
        voiceChannelName = vc.name;
        listeners = vc.members.filter((m: any) => !m.user.bot).size;
      }
    }

    const platform = this.currentTrack 
      ? (this.currentTrack.platform || (this.currentTrack.url.includes('spotify') ? 'Spotify' : this.currentTrack.url.includes('soundcloud') ? 'SoundCloud' : 'YouTube'))
      : 'N/A';

    const statePayload = {
      type: 'MUSIC_STATE_UPDATE',
      guildId: this.guildId,
      state: {
        currentTrack: this.currentTrack,
        queue: this.queue,
        volume: this.volume,
        speed: this.speed,
        pitch: this.pitch,
        loopMode: this.loopMode,
        activeFilters: this.activeFilters,
        paused: this.player.state.status === AudioPlayerStatus.Paused,
        elapsedStr,
        durationStr,
        bar,
        voiceChannelName,
        listeners,
        platform,
        viewMode: this.viewMode
      }
    };

    // Use Node.js http module instead of global fetch for Linux/Node <18 compatibility (BUG FIX #11)
    const CORE_API_PORT = parseInt(process.env.PORT || '5000', 10);
    const postData = JSON.stringify(statePayload);
    const req = httpRequest({
      hostname: '127.0.0.1',
      port: CORE_API_PORT,
      path: '/api/internal/music/state',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, () => {});
    req.on('error', () => {});
    req.write(postData);
    req.end();
  }

  public async updatePanel(client: any) {
    if (!this.textChannelId || !client) return;

    try {
      const channel = await client.channels.fetch(this.textChannelId).catch(() => null);
      if (!channel) return;

      const embed = new EmbedBuilder();
      const components: any[] = [];

      if (!this.currentTrack) {
        // ─── IDLE PANEL ───────────────────────────────────────────────
        embed
          .setColor(0x99CC00)
          .setAuthor({ name: 'Rage Optimiser Enterprise • Audio Engine' })
          .setTitle(`${EMOJIS.SOUNDWAVE} Audio Engine Control Panel`)
          .setDescription(
            '> **No music is currently playing.**\n' +
            '> Start a session by joining a voice channel and using `/play` or `r!play <query>`.\n\n' +
            `**${EMOJIS.SOUNDWAVE} Trending Picks**\n` +
            '`01.` Chill Lofi Beats · Study & Focus\n' +
            '`02.` Synthwave Neon Drive Mix\n' +
            '`03.` Cyberpunk Tokyo Drift Theme'
          )
          .addFields(
            { name: `${EMOJIS.INFO} Engine Status`, value: '```Connected — Idle```', inline: true },
            { name: `${EMOJIS.CONFIG} DSP Filters`, value: '```None Active```', inline: true },
            { name: `${EMOJIS.TIMER} Loop Mode`, value: '```Off```', inline: true }
          )
          .setFooter({ text: 'Rage Optimiser v4.2 • Enterprise Suite', iconURL: client.user?.displayAvatarURL() })
          .setTimestamp();

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('music_view_playlists').setLabel('Playlists').setEmoji(EMOJIS.TICKS).setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('music_trending_songs').setLabel('Trending').setEmoji(EMOJIS.SOUNDWAVE).setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('music_discover').setLabel('Discover').setEmoji(EMOJIS.VOICE).setStyle(ButtonStyle.Secondary)
        );
        components.push(row);

      } else {

        if (this.viewMode === 'player') {
          // ─── NOW PLAYING ──────────────────────────────────────────────
          const { elapsedStr, durationStr, bar } = getPlaybackProgress(this);
          const isPaused = this.player.state.status === AudioPlayerStatus.Paused;
          const hasValidUrl = this.currentTrack.url && this.currentTrack.url.startsWith('http');
          const titleLink = hasValidUrl
            ? `[${this.currentTrack.title}](${this.currentTrack.url})`
            : `**${this.currentTrack.title}**`;

          let voiceChannelName = 'Disconnected';
          let listeners = 0;
          if (this.connection?.joinConfig.channelId) {
            const vc = await client.channels.fetch(this.connection.joinConfig.channelId).catch(() => null);
            if (vc) {
              voiceChannelName = vc.name;
              listeners = vc.members.filter((m: any) => !m.user.bot).size;
            }
          }

          const platform = this.currentTrack.platform ||
            (this.currentTrack.url.includes('spotify') ? 'Spotify'
              : this.currentTrack.url.includes('soundcloud') ? 'SoundCloud'
              : 'YouTube');

          const loopLabel = this.loopMode === 'track' ? 'Track' : this.loopMode === 'queue' ? 'Queue' : 'Off';
          const statusLabel = isPaused ? 'Paused' : 'Playing';

          embed
            .setColor(0x99CC00)
            .setAuthor({ name: 'Rage Optimiser Enterprise • Audio Engine' })
            .setTitle(`${isPaused ? EMOJIS.TIMER : EMOJIS.SOUNDWAVE} ${statusLabel} — Now Playing`)
            .setDescription(
              `> ### ${titleLink}\n` +
              `> by **${this.currentTrack.artist || 'Various Artists'}** • Requested by **${this.currentTrack.requester}**\n\n` +
              `${bar}\n` +
              `\`${elapsedStr} / ${durationStr}\``
            )
            .addFields(
              { name: `${EMOJIS.VOICE} Voice Channel`, value: `\`${voiceChannelName}\`\n**${listeners}** listener${listeners !== 1 ? 's' : ''}`, inline: true },
              { name: `${EMOJIS.CONFIG} Controls`, value: `Volume: **${this.volume}%**\nSpeed: **${this.speed}x** | Pitch: **${this.pitch}x**`, inline: true },
              { name: `${EMOJIS.INFO} Session`, value: `Platform: **${platform}**\nQueue: **${this.queue.length}** tracks\nLoop: **${loopLabel}**`, inline: true }
            )
            .setFooter({ text: 'Rage Optimiser v4.2 • Enterprise Suite', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();

          if (hasValidUrl) embed.setURL(this.currentTrack.url);
          if (this.currentTrack.thumbnail) embed.setThumbnail(this.currentTrack.thumbnail);

          // Row 1 — Playback
          const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('music_prev').setLabel('Previous').setEmoji(EMOJIS.ARROW).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_play_pause').setLabel(isPaused ? 'Resume' : 'Pause').setEmoji(isPaused ? EMOJIS.APPROVED : EMOJIS.TIMER).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('music_skip').setLabel('Skip').setEmoji(EMOJIS.ARROW).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_stop').setLabel('Stop').setEmoji(EMOJIS.WRONG).setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('music_loop').setLabel('Loop').setEmoji(EMOJIS.TIMER).setStyle(this.loopMode !== 'off' ? ButtonStyle.Success : ButtonStyle.Secondary)
          );

          // Row 2 — Utilities
          const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('music_queue_btn').setLabel('Queue').setEmoji(EMOJIS.TICKS).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_filters_btn').setLabel('Filters').setEmoji(EMOJIS.CONFIG).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_volume_btn').setLabel('Volume').setEmoji(EMOJIS.VOICE).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_lyrics').setLabel('Lyrics').setEmoji(EMOJIS.INFO).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_settings').setLabel('Settings').setEmoji(EMOJIS.CONFIG).setStyle(ButtonStyle.Secondary)
          );

          components.push(row1, row2);

        } else if (this.viewMode === 'queue') {
          // ─── QUEUE VIEW ───────────────────────────────────────────────
          const hasValidUrl = this.currentTrack.url && this.currentTrack.url.startsWith('http');
          const titleLink = hasValidUrl
            ? `[${this.currentTrack.title}](${this.currentTrack.url})`
            : `**${this.currentTrack.title}**`;

          const itemsPerPage = 6;
          const totalPages = Math.ceil(this.queue.length / itemsPerPage) || 1;
          const page = Math.min(this.queuePage, totalPages - 1);
          const startIdx = page * itemsPerPage;
          const pageTracks = this.queue.slice(startIdx, startIdx + itemsPerPage);

          let totalSecs = 0;
          this.queue.forEach(track => {
            const parts = track.duration.split(':').map(Number);
            if (parts.length === 2) totalSecs += parts[0] * 60 + parts[1];
            else if (parts.length === 3) totalSecs += parts[0] * 3600 + parts[1] * 60 + parts[2];
          });
          const estHrs = Math.floor(totalSecs / 3600);
          const estMins = Math.floor((totalSecs % 3600) / 60);

          const queueLines = pageTracks.length > 0
            ? pageTracks.map((t, i) =>
                `\`${String(startIdx + i + 1).padStart(2, '0')}\` **${t.title.slice(0, 55)}** — \`${t.duration}\` by **${t.requester}**`
              ).join('\n')
            : '*No upcoming tracks. Add songs via `/play` or the dashboard.*';

          embed
            .setColor(0x99CC00)
            .setAuthor({ name: 'Rage Optimiser Enterprise • Audio Engine' })
            .setTitle(`${EMOJIS.TICKS} Playback Queue`)
            .setDescription(
              `> ${EMOJIS.SOUNDWAVE} **Now Playing**: ${titleLink}\n` +
              `> Duration: \`${this.currentTrack.duration}\` • By: **${this.currentTrack.requester}**\n\n` +
              `**Upcoming Tracks**\n${queueLines}`
            )
            .addFields({
              name: `${EMOJIS.TIMER} Queue Summary`,
              value: `• **Total Duration**: ${estHrs > 0 ? `${estHrs}h ` : ''}${estMins}m\n• **Est. End**: <t:${Math.floor((Date.now() + totalSecs * 1000) / 1000)}:t> (<t:${Math.floor((Date.now() + totalSecs * 1000) / 1000)}:R>)`,
              inline: false
            })
            .setFooter({ text: `Page ${page + 1} / ${totalPages} • Rage Optimiser Enterprise`, iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();

          const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('music_queue_prev').setLabel('Previous').setEmoji(EMOJIS.ARROW).setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId('music_queue_next').setLabel('Next').setEmoji(EMOJIS.ARROW).setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
            new ButtonBuilder().setCustomId('music_view_player').setLabel('Back to Player').setEmoji(EMOJIS.ARROW).setStyle(ButtonStyle.Primary)
          );
          components.push(row1);

        } else if (this.viewMode === 'filters') {
          // ─── DSP FILTERS VIEW ─────────────────────────────────────────
          const filtersList = [
            { name: 'Bass Boost', key: 'bassboost', desc: 'Amplifies low-end frequencies' },
            { name: 'Nightcore', key: 'nightcore', desc: 'Faster speed & higher pitch' },
            { name: '8D Audio', key: '8d', desc: 'Rotary surround sound pan' },
            { name: 'Vaporwave', key: 'vaporwave', desc: 'Slows pitch & tempo' },
            { name: 'Treble Boost', key: 'treble', desc: 'High-end frequency clarity' },
            { name: 'Reverb', key: 'reverb', desc: 'Spatial audio echo simulation' }
          ];

          const filterStatus = filtersList.map(f => {
            const on = this.activeFilters.includes(f.key);
            return `${on ? EMOJIS.APPROVED : EMOJIS.WRONG} **${f.name}** — ${f.desc}`;
          }).join('\n');

          embed
            .setColor(0x99CC00)
            .setAuthor({ name: 'Rage Optimiser Enterprise • Audio Engine' })
            .setTitle(`${EMOJIS.CONFIG} DSP Audio Effects Board`)
            .setDescription(
              `> Configure real-time frequency modification filters.\n` +
              `> **Active**: ${this.activeFilters.length > 0 ? this.activeFilters.map(f => `\`${f}\``).join(', ') : 'None'}\n\n` +
              filterStatus
            )
            .addFields({
              name: `${EMOJIS.CONFIG} Speed & Pitch`,
              value: `Speed: **${this.speed}x** | Pitch: **${this.pitch}x**`,
              inline: false
            })
            .setFooter({ text: 'Rage Optimiser • DSP Engine', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();

          const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('music_toggle_bassboost').setLabel('Bass Boost').setStyle(this.activeFilters.includes('bassboost') ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_toggle_nightcore').setLabel('Nightcore').setStyle(this.activeFilters.includes('nightcore') ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_toggle_8d').setLabel('8D Audio').setStyle(this.activeFilters.includes('8d') ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_toggle_vaporwave').setLabel('Vaporwave').setStyle(this.activeFilters.includes('vaporwave') ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_toggle_treble').setLabel('Treble').setStyle(this.activeFilters.includes('treble') ? ButtonStyle.Success : ButtonStyle.Secondary)
          );

          const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('music_toggle_reverb').setLabel('Reverb').setStyle(this.activeFilters.includes('reverb') ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_toggle_speed_plus').setLabel('Speed +').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_toggle_speed_minus').setLabel('Speed −').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_toggle_pitch_plus').setLabel('Pitch +').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_toggle_pitch_minus').setLabel('Pitch −').setStyle(ButtonStyle.Secondary)
          );

          const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('music_reset_filters').setLabel('Reset All').setEmoji(EMOJIS.WRONG).setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('music_view_player').setLabel('Back to Player').setEmoji(EMOJIS.ARROW).setStyle(ButtonStyle.Primary)
          );

          components.push(row1, row2, row3);

        } else if (this.viewMode === 'volume') {
          // ─── VOLUME VIEW ──────────────────────────────────────────────
          const barLength = 12;
          const filledLength = Math.round((this.volume / 200) * barLength);
          const volBar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
          const volPercent = this.volume;

          embed
            .setColor(0x99CC00)
            .setAuthor({ name: 'Rage Optimiser Enterprise • Audio Engine' })
            .setTitle(`${EMOJIS.VOICE} Volume Control`)
            .setDescription(
              `> Adjust the playback output level.\n\n` +
              `**Current Volume**\n\`\`\`\n[${volBar}] ${volPercent}%\n\`\`\``
            )
            .addFields(
              { name: `${EMOJIS.VOICE} Min`, value: '`0%`', inline: true },
              { name: `${EMOJIS.VOICE} Current`, value: `\`${volPercent}%\``, inline: true },
              { name: `${EMOJIS.VOICE} Max`, value: '`200%`', inline: true }
            )
            .setFooter({ text: 'Rage Optimiser • Audio System', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();

          const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('music_volume_minus').setLabel('-10%').setEmoji(EMOJIS.VOICE).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_volume_plus').setLabel('+10%').setEmoji(EMOJIS.VOICE).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_volume_mute').setLabel(this.volume === 0 ? 'Unmute' : 'Mute').setEmoji(this.volume === 0 ? EMOJIS.VOICE : EMOJIS.WRONG).setStyle(this.volume === 0 ? ButtonStyle.Success : ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('music_volume_100').setLabel('Reset 100%').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_view_player').setLabel('Back').setEmoji(EMOJIS.ARROW).setStyle(ButtonStyle.Primary)
          );
          components.push(row1);

        } else if (this.viewMode === 'lyrics') {
          // ─── LYRICS VIEW ──────────────────────────────────────────────
          const hasValidUrl = this.currentTrack.url && this.currentTrack.url.startsWith('http');
          const titleLink = hasValidUrl
            ? `[${this.currentTrack.title}](${this.currentTrack.url})`
            : `**${this.currentTrack.title}**`;

          embed
            .setColor(0x99CC00)
            .setAuthor({ name: 'Rage Optimiser Enterprise • Audio Engine' })
            .setTitle(`${EMOJIS.INFO} Synced Lyrics`)
            .setDescription(
              `> **Now Playing**: ${titleLink}\n\n` +
              `*Connect a Genius API key in dashboard settings for real-time lyrics.*\n\n` +
              `*Instrumental / lyrics not available for this track.*`
            )
            .setFooter({ text: 'Rage Optimiser • Lyrics Engine', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();

          const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('music_view_player').setLabel('Back to Player').setEmoji(EMOJIS.ARROW).setStyle(ButtonStyle.Primary)
          );
          components.push(row1);

        } else if (this.viewMode === 'settings') {
          // ─── SETTINGS VIEW ────────────────────────────────────────────
          embed
            .setColor(0x99CC00)
            .setAuthor({ name: 'Rage Optimiser Enterprise • Audio Engine' })
            .setTitle(`${EMOJIS.CONFIG} Player Configuration`)
            .setDescription(
              `> Configure player operational settings.\n\n` +
              `• **Autoplay**: ${this.autoplay ? `${EMOJIS.APPROVED} Enabled` : `${EMOJIS.WRONG} Disabled`}\n` +
              `• **Loop Mode**: \`${this.loopMode}\`\n` +
              `• **Volume**: \`${this.volume}%\`\n` +
              `• **Speed**: \`${this.speed}x\` | **Pitch**: \`${this.pitch}x\``
            )
            .setFooter({ text: 'Rage Optimiser • Audio System', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();

          const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('music_toggle_autoplay').setLabel(this.autoplay ? 'Disable Autoplay' : 'Enable Autoplay').setEmoji(EMOJIS.CONFIG).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_loop').setLabel('Cycle Loop').setEmoji(EMOJIS.TIMER).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_view_player').setLabel('Back to Player').setEmoji(EMOJIS.ARROW).setStyle(ButtonStyle.Primary)
          );
          components.push(row1);

        } else if (this.viewMode === 'playlists') {
          // ─── PLAYLISTS VIEW ───────────────────────────────────────────
          embed
            .setColor(0x99CC00)
            .setAuthor({ name: 'Rage Optimiser Enterprise • Audio Engine' })
            .setTitle(`${EMOJIS.TICKS} Playlist Engine`)
            .setDescription(
              `> Manage saved playlists and liked tracks.\n\n` +
              `• **Saved Playlists**: ${this.playlists.length} playlists stored\n` +
              `• **Favorites**: ${this.favorites.length} tracks liked`
            )
            .setFooter({ text: 'Rage Optimiser • Playlist Engine', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();

          const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('music_save_playlist').setLabel('Save Queue').setEmoji(EMOJIS.TICKS).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_favorite').setLabel('Favorite').setEmoji(EMOJIS.APPROVED).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_view_player').setLabel('Back to Player').setEmoji(EMOJIS.ARROW).setStyle(ButtonStyle.Primary)
          );
          components.push(row1);
        }
      }

      // Send or Edit message
      if (this.panelMessageId) {
        const msg = await channel.messages.fetch(this.panelMessageId).catch(() => null);
        if (msg) {
          await msg.edit({ embeds: [embed], components }).catch(() => {});
          await this.broadcastState();
          return;
        }
      }

      const newMsg = await channel.send({ embeds: [embed], components }).catch(() => null);
      if (newMsg) {
        this.panelMessageId = newMsg.id;
      }
      await this.broadcastState();
    } catch (err) {
      console.error('[Music] Error rendering control panel:', err);
    }
  }


}

export class QueueManager {
  public static registry: any = null;
  private static queues: Map<string, GuildQueue> = new Map();

  public static getQueue(guildId: string): GuildQueue {
    let queue = this.queues.get(guildId);
    if (!queue) {
      queue = new GuildQueue(guildId);
      this.queues.set(guildId, queue);
    }
    return queue;
  }

  public static deleteQueue(guildId: string) {
    const queue = this.queues.get(guildId);
    if (queue) {
      queue.destroy();
      this.queues.delete(guildId);
    }
  }
}
