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
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
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

  private disconnectTimeout: NodeJS.Timeout | null = null;
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

  private async lockQueue() {
    while (this.queueLock) {
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
    await this.lockQueue();
    try {
      this.client = voiceChannel.client;
      this.textChannelId = this.textChannelId || voiceChannel.id;
      this.voiceChannel = voiceChannel;
      
      if (!voiceChannel) {
        throw new Error('You must be in a voice channel to play music.');
      }

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
    await this.lockQueue();
    try {
      this.client = voiceChannel.client;
      this.textChannelId = this.textChannelId || voiceChannel.id;
      this.voiceChannel = voiceChannel;

      if (!voiceChannel) {
        throw new Error('You must be in a voice channel to play music.');
      }

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
    console.error(`[Music Debug] Error playing track "${track.title}":`, error);
    if (this.retryCount < 1) {
      this.retryCount++;
      console.log(`[Music Debug] Retrying failed track: "${track.title}" (Attempt 1/1)`);
      if (track.url.includes('youtube.com') || track.url.includes('youtu.be')) {
        track.url = `search:${track.title} ${track.artist || ''}`;
      }
      setTimeout(async () => {
        try {
          await this.startStream(track);
        } catch (retryErr) {
          await this.handleTrackError(track, retryErr);
        }
      }, 1500);
    } else {
      this.retryCount = 0;
      console.log(`[Music Debug] Track failed twice, skipping: "${track.title}"`);
      await this.playNext();
    }
  }

  private async startStream(nextTrack: Track, seekSeconds: number = 0) {
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
        const results = await play.search(query, { limit: 1 }).catch(() => []);
        if (results && results.length > 0) {
          audioUrl = results[0].url;
          nextTrack.url = audioUrl;
          if (results[0].title) nextTrack.title = results[0].title;
          if (results[0].durationRaw) nextTrack.duration = results[0].durationRaw;
          if (results[0].thumbnails?.[0]?.url) nextTrack.thumbnail = results[0].thumbnails[0].url;
          if (results[0].channel?.name) nextTrack.artist = results[0].channel.name;
        } else {
          throw new Error('Track not found via search stream import.');
        }
      }

      // Stream via yt-dlp binary
      const ytDlpPath = path.join(process.cwd(), 'bin', 'yt-dlp.exe');
      const hasLocalYtDlp = fs.existsSync(ytDlpPath);
      const command = hasLocalYtDlp ? ytDlpPath : 'yt-dlp';

      this.currentProcess = spawn(command, [
        '-o', '-',
        '-f', 'bestaudio',
        '--no-playlist',
        audioUrl
      ]);

      this.currentProcess.on('error', (err) => {
        console.error('[Music] yt-dlp process spawn error:', err);
      });

      if (!this.currentProcess.stdout) throw new Error('Failed to create yt-dlp stdout');

      // Prevent EPIPE crash on yt-dlp stdout
      this.currentProcess.stdout.on('error', (err) => {
        console.warn('[Music Debug] yt-dlp stdout stream error (expected during skip):', err.message);
      });

      // Build FFmpeg filters
      const afFilters: string[] = [];
      
      // Volume filter
      afFilters.push(`volume=${this.volume / 100}`);

      // Speed & Pitch filters
      if (this.speed !== 1.0) {
        afFilters.push(`atempo=${this.speed}`);
      }

      if (this.pitch !== 1.0) {
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

      const ffmpegArgs = [
        '-i', 'pipe:0',
      ];

      if (seekSeconds > 0) {
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
        console.error('[Music] ffmpeg process spawn error:', err);
      });

      if (this.currentProcess && this.currentProcess.stdout && this.ffmpegProcess && this.ffmpegProcess.stdin) {
        // Prevent EPIPE crash on ffmpeg streams
        this.ffmpegProcess.stdin.on('error', (err) => {
          console.warn('[Music Debug] ffmpeg stdin stream error (expected during skip):', err.message);
        });
        if (this.ffmpegProcess.stdout) {
          this.ffmpegProcess.stdout.on('error', (err) => {
            console.warn('[Music Debug] ffmpeg stdout stream error (expected during skip):', err.message);
          });
        }

        this.currentProcess.stdout.pipe(this.ffmpegProcess.stdin as any);
      } else {
        throw new Error('Failed to pipe stdout of yt-dlp to stdin of ffmpeg');
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
      await this.handleTrackError(nextTrack, err);
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
    this.stop();
    if (this.connection) {
      try {
        this.connection.destroy();
      } catch (e) {}
    }
    this.connection = null;
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

    const CORE_API = `http://localhost:${process.env.PORT || 5000}`;
    fetch(`${CORE_API}/api/internal/music/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(statePayload)
    }).catch(() => {});
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
          .setColor(0x57F287)
          .setTitle('🎵 Rage Music — Audio Engine')
          .setDescription(
            '> **No music is currently playing.**\n' +
            '> Start a session by joining a voice channel and using `/play` or `r!play <query>`.\n\n' +
            '**🔥 Trending Picks**\n' +
            '`01.` Chill Lofi Beats · Study & Focus\n' +
            '`02.` Synthwave Neon Drive Mix\n' +
            '`03.` Cyberpunk Tokyo Drift Theme'
          )
          .addFields(
            { name: '📡 Engine Status', value: '```Connected — Idle```', inline: true },
            { name: '🎚️ DSP Filters', value: '```None Active```', inline: true },
            { name: '🔁 Loop Mode', value: '```Off```', inline: true }
          )
          .setFooter({ text: 'Rage Optimiser • Audio System', iconURL: client.user?.displayAvatarURL() })
          .setTimestamp();

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('music_view_playlists').setLabel('Playlists').setEmoji('📥').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('music_trending_songs').setLabel('Trending').setEmoji('🔥').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('music_discover').setLabel('Discover').setEmoji('🎵').setStyle(ButtonStyle.Secondary)
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

          const loopLabel = this.loopMode === 'track' ? '🔂 Track' : this.loopMode === 'queue' ? '🔁 Queue' : '➡️ Off';
          const statusLabel = isPaused ? '⏸️ Paused' : '▶️ Playing';

          embed
            .setColor(0x57F287)
            .setTitle(`${statusLabel} — Now Playing`)
            .setDescription(
              `> ### ${titleLink}\n` +
              `> by **${this.currentTrack.artist || 'Various Artists'}** • Requested by **${this.currentTrack.requester}**\n\n` +
              `${bar}\n` +
              `\`${elapsedStr} / ${durationStr}\``
            )
            .addFields(
              { name: '🔊 Voice Channel', value: `\`${voiceChannelName}\`\n**${listeners}** listener${listeners !== 1 ? 's' : ''}`, inline: true },
              { name: '⚙️ Controls', value: `Volume: **${this.volume}%**\nSpeed: **${this.speed}x** | Pitch: **${this.pitch}x**`, inline: true },
              { name: '💿 Session', value: `Platform: **${platform}**\nQueue: **${this.queue.length}** tracks\nLoop: **${loopLabel}**`, inline: true }
            )
            .setFooter({ text: 'Rage Optimiser • Audio System', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();

          if (hasValidUrl) embed.setURL(this.currentTrack.url);
          if (this.currentTrack.thumbnail) embed.setThumbnail(this.currentTrack.thumbnail);

          // Row 1 — Playback
          const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('music_prev').setLabel('Previous').setEmoji('⏮').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_play_pause').setLabel(isPaused ? 'Resume' : 'Pause').setEmoji(isPaused ? '▶️' : '⏸️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('music_skip').setLabel('Skip').setEmoji('⏭').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_stop').setLabel('Stop').setEmoji('⏹').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('music_loop').setLabel('Loop').setEmoji('🔁').setStyle(this.loopMode !== 'off' ? ButtonStyle.Success : ButtonStyle.Secondary)
          );

          // Row 2 — Utilities
          const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('music_queue_btn').setLabel('Queue').setEmoji('📜').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_filters_btn').setLabel('Filters').setEmoji('🎚').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_volume_btn').setLabel('Volume').setEmoji('🔊').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_lyrics').setLabel('Lyrics').setEmoji('🎤').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_settings').setLabel('Settings').setEmoji('⚙').setStyle(ButtonStyle.Secondary)
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
            .setColor(0x57F287)
            .setTitle('📋 Playback Queue')
            .setDescription(
              `> ▶️ **Now Playing**: ${titleLink}\n` +
              `> Duration: \`${this.currentTrack.duration}\` • By: **${this.currentTrack.requester}**\n\n` +
              `**Upcoming Tracks**\n${queueLines}`
            )
            .addFields({
              name: '⏱️ Queue Summary',
              value: `• **Total Duration**: ${estHrs > 0 ? `${estHrs}h ` : ''}${estMins}m\n• **Est. End**: <t:${Math.floor((Date.now() + totalSecs * 1000) / 1000)}:t> (<t:${Math.floor((Date.now() + totalSecs * 1000) / 1000)}:R>)`,
              inline: false
            })
            .setFooter({ text: `Page ${page + 1} / ${totalPages} • Rage Optimiser`, iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();

          const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('music_queue_prev').setLabel('Previous').setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId('music_queue_next').setLabel('Next').setEmoji('➡️').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
            new ButtonBuilder().setCustomId('music_view_player').setLabel('Back to Player').setEmoji('🔙').setStyle(ButtonStyle.Primary)
          );
          components.push(row1);

        } else if (this.viewMode === 'filters') {
          // ─── DSP FILTERS VIEW ─────────────────────────────────────────
          const filtersList = [
            { name: 'Bass Boost', key: 'bassboost', emoji: '🔉', desc: 'Amplifies low-end frequencies' },
            { name: 'Nightcore', key: 'nightcore', emoji: '⚡', desc: 'Faster speed & higher pitch' },
            { name: '8D Audio', key: '8d', emoji: '🌀', desc: 'Rotary surround sound pan' },
            { name: 'Vaporwave', key: 'vaporwave', emoji: '🌊', desc: 'Slows pitch & tempo' },
            { name: 'Treble Boost', key: 'treble', emoji: '🔊', desc: 'High-end frequency clarity' },
            { name: 'Reverb', key: 'reverb', emoji: '🏔️', desc: 'Spatial audio echo simulation' }
          ];

          const filterStatus = filtersList.map(f => {
            const on = this.activeFilters.includes(f.key);
            return `${on ? '🟢' : '⚫'} **${f.emoji} ${f.name}** — ${f.desc}`;
          }).join('\n');

          embed
            .setColor(0x57F287)
            .setTitle('🎚️ DSP Audio Effects Board')
            .setDescription(
              `> Configure real-time frequency modification filters.\n` +
              `> **Active**: ${this.activeFilters.length > 0 ? this.activeFilters.map(f => `\`${f}\``).join(', ') : 'None'}\n\n` +
              filterStatus
            )
            .addFields({
              name: '⚡ Speed & Pitch',
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
            new ButtonBuilder().setCustomId('music_reset_filters').setLabel('Reset All').setEmoji('♻️').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('music_view_player').setLabel('Back to Player').setEmoji('🔙').setStyle(ButtonStyle.Primary)
          );

          components.push(row1, row2, row3);

        } else if (this.viewMode === 'volume') {
          // ─── VOLUME VIEW ──────────────────────────────────────────────
          const barLength = 12;
          const filledLength = Math.round((this.volume / 200) * barLength);
          const volBar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
          const volPercent = this.volume;

          embed
            .setColor(0x57F287)
            .setTitle('🔊 Volume Control')
            .setDescription(
              `> Adjust the playback output level.\n\n` +
              `**Current Volume**\n\`\`\`\n[${volBar}] ${volPercent}%\n\`\`\``
            )
            .addFields(
              { name: '🔉 Min', value: '`0%`', inline: true },
              { name: '🔊 Current', value: `\`${volPercent}%\``, inline: true },
              { name: '📢 Max', value: '`200%`', inline: true }
            )
            .setFooter({ text: 'Rage Optimiser • Audio System', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();

          const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('music_volume_minus').setLabel('-10%').setEmoji('🔉').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_volume_plus').setLabel('+10%').setEmoji('🔊').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_volume_mute').setLabel(this.volume === 0 ? 'Unmute' : 'Mute').setEmoji(this.volume === 0 ? '🔊' : '🔇').setStyle(this.volume === 0 ? ButtonStyle.Success : ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('music_volume_100').setLabel('Reset 100%').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_view_player').setLabel('Back').setEmoji('🔙').setStyle(ButtonStyle.Primary)
          );
          components.push(row1);

        } else if (this.viewMode === 'lyrics') {
          // ─── LYRICS VIEW ──────────────────────────────────────────────
          const hasValidUrl = this.currentTrack.url && this.currentTrack.url.startsWith('http');
          const titleLink = hasValidUrl
            ? `[${this.currentTrack.title}](${this.currentTrack.url})`
            : `**${this.currentTrack.title}**`;

          embed
            .setColor(0x57F287)
            .setTitle('🎤 Synced Lyrics')
            .setDescription(
              `> **Now Playing**: ${titleLink}\n\n` +
              `*Connect a Genius API key in dashboard settings for real-time lyrics.*\n\n` +
              `🎵 *Instrumental / lyrics not available for this track.*`
            )
            .setFooter({ text: 'Rage Optimiser • Lyrics Engine', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();

          const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('music_view_player').setLabel('Back to Player').setEmoji('🔙').setStyle(ButtonStyle.Primary)
          );
          components.push(row1);

        } else if (this.viewMode === 'settings') {
          // ─── SETTINGS VIEW ────────────────────────────────────────────
          embed
            .setColor(0x57F287)
            .setTitle('⚙️ Player Configuration')
            .setDescription(
              `> Configure player operational settings.\n\n` +
              `• **Autoplay**: ${this.autoplay ? '🟢 Enabled' : '⚫ Disabled'}\n` +
              `• **Loop Mode**: \`${this.loopMode}\`\n` +
              `• **Volume**: \`${this.volume}%\`\n` +
              `• **Speed**: \`${this.speed}x\` | **Pitch**: \`${this.pitch}x\``
            )
            .setFooter({ text: 'Rage Optimiser • Audio System', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();

          const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('music_settings').setLabel(this.autoplay ? 'Disable Autoplay' : 'Enable Autoplay').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_loop').setLabel('Cycle Loop').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_view_player').setLabel('Back to Player').setEmoji('🔙').setStyle(ButtonStyle.Primary)
          );
          components.push(row1);

        } else if (this.viewMode === 'playlists') {
          // ─── PLAYLISTS VIEW ───────────────────────────────────────────
          embed
            .setColor(0x57F287)
            .setTitle('📥 Playlist Engine')
            .setDescription(
              `> Manage saved playlists and liked tracks.\n\n` +
              `• **Saved Playlists**: ${this.playlists.length} playlists stored\n` +
              `• **Favorites**: ${this.favorites.length} tracks liked`
            )
            .setFooter({ text: 'Rage Optimiser • Playlist Engine', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();

          const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('music_save_playlist').setLabel('Save Queue').setEmoji('📥').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_favorite').setLabel('Favorite').setEmoji('❤️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_view_player').setLabel('Back to Player').setEmoji('🔙').setStyle(ButtonStyle.Primary)
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
