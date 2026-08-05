import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  StringSelectMenuBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle 
} from 'discord.js';
import { QueueManager, Track, GuildQueue, getPlaybackProgress, EMOJIS } from './QueueManager.js';
import play from 'play-dl';
import spotifyUrlInfo from 'spotify-url-info';

// @ts-ignore
const spotifyFn = (spotifyUrlInfo.default || spotifyUrlInfo) as any;
const spotify = spotifyFn(fetch as any);

function formatSpotifyDuration(spTrack: any): string {
  const ms = spTrack.duration_ms || spTrack.durationInMs || (typeof spTrack.duration === 'number' ? spTrack.duration : 0);
  if (!ms) return 'Unknown';
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function createLimeEmbed(options: {
  author?: string;
  title: string;
  description?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  color?: string;
  commandBox?: string;
  thumbnail?: string;
  footerText?: string;
  client?: any;
}) {
  const embed = new EmbedBuilder()
    .setAuthor({ name: options.author || 'Rage Optimiser Enterprise • Audio Engine' })
    .setTitle(options.title.startsWith('###') ? options.title : `### ${options.title}`)
    .setColor((options.color || '#7C5CFC') as any)
    .setFooter({ 
      text: options.footerText || `Rage Optimiser v4.2 • Enterprise Protection`, 
      iconURL: options.client?.user?.displayAvatarURL?.() 
    })
    .setTimestamp();

  if (options.description) {
    embed.setDescription(options.description);
  }

  if (options.fields && options.fields.length > 0) {
    embed.addFields(options.fields);
  }

  if (options.commandBox) {
    embed.addFields({
      name: `${EMOJIS.CONFIG} System Command`,
      value: `\`\`\`${options.commandBox}\`\`\``,
      inline: false
    });
  }

  if (options.thumbnail && options.thumbnail.startsWith('http')) {
    embed.setThumbnail(options.thumbnail);
  }

  return embed;
}

function checkVoicePermissions(interaction: any, queue: GuildQueue): boolean {
  const memberVoiceChannel = interaction.member?.voice?.channel;
  if (!memberVoiceChannel) {
    interaction.reply({
      embeds: [
        createLimeEmbed({
          author: 'Rage Optimiser Security Gate',
          title: `${EMOJIS.WRONG} Voice Channel Required`,
          description: 'You must be connected to an active voice channel in this server to use music control interfaces.',
          fields: [
            { name: `${EMOJIS.MEMBER} Member`, value: `\`${interaction.user?.username || 'User'}\``, inline: true },
            { name: `${EMOJIS.VOICE} Required Action`, value: '`Join a Voice Channel`', inline: true }
          ],
          commandBox: 'r!play <song name>',
          color: '#EF4444'
        })
      ],
      flags: 64
    }).catch(() => {});
    return false;
  }

  if (queue.connection && queue.connection.joinConfig.channelId) {
    if (memberVoiceChannel.id !== queue.connection.joinConfig.channelId) {
      interaction.reply({
        embeds: [
          createLimeEmbed({
            author: 'Rage Optimiser Security Gate',
            title: `${EMOJIS.WRONG} Voice Channel Mismatch`,
            description: `You must be in the same voice channel as the bot to control playback.`,
            fields: [
              { name: `${EMOJIS.VOICE} Bot Channel`, value: `<#${queue.connection.joinConfig.channelId}>`, inline: true },
              { name: `${EMOJIS.MEMBER} Your Channel`, value: `<#${memberVoiceChannel.id}>`, inline: true }
            ],
            color: '#EF4444'
          })
        ],
        flags: 64
      }).catch(() => {});
      return false;
    }
  }

  return true;
}

export const MusicManifest: ModuleManifest = {
  id: 'music',
  name: 'Music System',
  version: '1.2.0',
  description: 'Persistent music control engine with DSP audio filtering, statistics, and full dashboard integration.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      if (config.musicPrefix) {
        if (config.musicPrefix.length < 1 || config.musicPrefix.length > 5) {
          errors.push('Music Prefix must be between 1 and 5 characters.');
        }
        if (/\s/.test(config.musicPrefix)) {
          errors.push('Music Prefix cannot contain spaces.');
        }
      }
      return { progress: errors.length === 0 ? 100 : 0, errors };
    }
  },
  commands: [],
  routes: [
    {
      method: 'get',
      path: '/stats',
      handler: async (req: any, res: any, context: any) => {
        const queue = QueueManager.getQueue(context.guildId);

        let activeListeners = 0;
        if (queue.connection?.joinConfig.channelId) {
          const vc = await context.client?.channels.fetch(queue.connection.joinConfig.channelId).catch(() => null);
          if (vc) activeListeners = vc.members.filter((m: any) => !m.user.bot).size;
        }

        const playCountMap = new Map<string, { title: string; playCount: number; duration: string }>();
        for (const track of queue.playHistory) {
          const key = track.url || track.title;
          const existing = playCountMap.get(key);
          if (existing) {
            existing.playCount++;
          } else {
            playCountMap.set(key, { title: track.title, playCount: 1, duration: track.duration });
          }
        }
        const mostPlayed = Array.from(playCountMap.values())
          .sort((a, b) => b.playCount - a.playCount)
          .slice(0, 5);

        const userActionMap = new Map<string, number>();
        for (const track of queue.playHistory) {
          if (track.requester && track.requester !== 'Autoplay Engine' && track.requester !== 'Dashboard') {
            userActionMap.set(track.requester, (userActionMap.get(track.requester) || 0) + 1);
          }
        }
        const activeUsers = Array.from(userActionMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([username, actionCount]) => ({ username, actionCount }));

        const stats = {
          totalStreams: queue.playHistory.length,
          avgListeningTime: 'N/A',
          activeListeners,
          mostPlayed,
          activeUsers
        };
        res.json(stats);
      }
    },
    {
      method: 'get',
      path: '/history',
      handler: async (req: any, res: any, context: any) => {
        const queue = QueueManager.getQueue(context.guildId);
        res.json(queue.playHistory);
      }
    },
    {
      method: 'get',
      path: '/playlists',
      handler: async (req: any, res: any, context: any) => {
        const queue = QueueManager.getQueue(context.guildId);
        res.json(queue.playlists);
      }
    },
    {
      method: 'post',
      path: '/playlists',
      handler: async (req: any, res: any, context: any) => {
        const queue = QueueManager.getQueue(context.guildId);
        const { name, tracks } = req.body;
        if (!name) return res.status(400).json({ error: 'Playlist name is required.' });
        
        queue.playlists.push({ name, tracks: tracks || [] });
        res.json({ success: true, playlists: queue.playlists });
      }
    },
    {
      method: 'get',
      path: '/settings',
      handler: async (req: any, res: any, context: any) => {
        const state = context.getModulesState().find((m: any) => m.id === 'music');
        res.json(state?.config || {});
      }
    },
    {
      method: 'post',
      path: '/settings',
      handler: async (req: any, res: any, context: any) => {
        const { config } = req.body;
        context.updateModuleConfig('music', config || {});
        res.json({ success: true });
      }
    },
    {
      method: 'get',
      path: '/player',
      handler: async (req: any, res: any, context: any) => {
        const queue = QueueManager.getQueue(context.guildId);
        const { elapsedStr, durationStr, bar } = getPlaybackProgress(queue);
        const platform = queue.currentTrack 
          ? (queue.currentTrack.platform || (queue.currentTrack.url.includes('spotify') ? 'Spotify' : queue.currentTrack.url.includes('soundcloud') ? 'SoundCloud' : 'YouTube'))
          : 'N/A';
        
        let voiceChannelName = 'Disconnected';
        let listeners = 0;
        if (queue.connection?.joinConfig.channelId) {
          const vc = await context.client?.channels.fetch(queue.connection.joinConfig.channelId).catch(() => null);
          if (vc) {
            voiceChannelName = vc.name;
            listeners = vc.members.filter((m: any) => !m.user.bot).size;
          }
        }

        res.json({
          currentTrack: queue.currentTrack,
          queue: queue.queue,
          volume: queue.volume,
          speed: queue.speed,
          pitch: queue.pitch,
          loopMode: queue.loopMode,
          activeFilters: queue.activeFilters,
          paused: queue.player.state.status === 'paused',
          elapsedStr,
          durationStr,
          bar,
          voiceChannelName,
          listeners,
          platform,
          viewMode: queue.viewMode
        });
      }
    },
    {
      method: 'post',
      path: '/action',
      handler: async (req: any, res: any, context: any) => {
        const queue = QueueManager.getQueue(context.guildId);
        const { action, query, value } = req.body;
        
        if (!action) return res.status(400).json({ error: 'Action is required.' });

        try {
          switch (action) {
            case 'play':
              if (!query) return res.status(400).json({ error: 'Query is required for play action.' });
              
              if (query.includes('spotify.com')) {
                const tracks = await spotify.getTracks(query).catch(() => []);
                if (!tracks || tracks.length === 0) {
                  return res.status(404).json({ error: 'No Spotify tracks found.' });
                }

                // Default VC lookup
                const guild = await context.client.guilds.fetch(context.guildId).catch(() => null);
                const voiceChannel = guild?.channels.cache.find((c: any) => c.type === 2);
                if (!voiceChannel && !queue.connection) {
                  return res.status(400).json({ error: 'Please join a voice channel or connect the bot.' });
                }

                const tracksToAdd = tracks.slice(0, 50);
                for (const spTrack of tracksToAdd) {
                  const track: Track = {
                    title: spTrack.name,
                    artist: spTrack.artists?.[0]?.name || 'Spotify Artist',
                    url: `search:${spTrack.name} ${spTrack.artists?.[0]?.name || ''}`,
                    duration: formatSpotifyDuration(spTrack),
                    thumbnail: 'https://storage.googleapis.com/pr-newsroom-wp/1/2018/11/Spotify_Logo_CMYK_Green.png',
                    requester: 'Dashboard',
                    platform: 'Spotify'
                  };
                  await queue.play(track, queue.connection ? await context.client.channels.fetch(queue.connection.joinConfig.channelId) : voiceChannel);
                }
                break;
              }

              let search = await play.search(query, { limit: 1 }).catch(() => []);
              if (!search || search.length === 0) {
                return res.status(404).json({ error: 'No tracks found.' });
              }
              const trackInfo = search[0];
              const track: Track = {
                title: trackInfo.title || 'Unknown Title',
                artist: trackInfo.channel?.name || 'Various Artists',
                url: trackInfo.url,
                duration: trackInfo.durationRaw || '3:00',
                thumbnail: trackInfo.thumbnails?.[0]?.url || '',
                requester: 'Dashboard User',
                platform: 'YouTube'
              };

              if (!queue.connection) {
                const guild = await context.client.guilds.fetch(context.guildId).catch(() => null);
                const voiceChannel = guild?.channels.cache.find((c: any) => c.type === 2);
                if (!voiceChannel) return res.status(400).json({ error: 'No voice channel found to connect.' });
                await queue.play(track, voiceChannel);
              } else {
                if (queue.currentTrack) {
                  queue.queue.push(track);
                  await queue.updatePanel(context.client);
                } else {
                  const channelId = queue.connection.joinConfig.channelId;
                  const voiceChannel = await context.client.channels.fetch(channelId).catch(() => null);
                  await queue.play(track, voiceChannel);
                }
              }
              break;
            case 'pause':
              queue.pause();
              break;
            case 'resume':
              queue.resume();
              break;
            case 'pause-toggle':
              if (queue.player.state.status === 'paused') {
                queue.resume();
              } else {
                queue.pause();
              }
              break;
            case 'skip':
              queue.skip();
              break;
            case 'stop':
              queue.stop();
              await queue.updatePanel(context.client);
              break;
            case 'loop':
              queue.loopMode = value || (queue.loopMode === 'off' ? 'track' : (queue.loopMode === 'track' ? 'queue' : 'off'));
              await queue.updatePanel(context.client);
              break;
            case 'volume':
              queue.setVolume(Number(value));
              await queue.updatePanel(context.client);
              break;
            case 'speed':
              const elapsedSpeed = queue.getElapsedSeconds();
              queue.speed = Math.max(0.5, Math.min(2.0, Number(value)));
              if (queue.currentTrack) {
                queue.queue.unshift(queue.currentTrack);
                queue.currentTrack = null;
              }
              await queue.playNext(elapsedSpeed);
              break;
            case 'pitch':
              const elapsedPitch = queue.getElapsedSeconds();
              queue.pitch = Math.max(0.5, Math.min(2.0, Number(value)));
              if (queue.currentTrack) {
                queue.queue.unshift(queue.currentTrack);
                queue.currentTrack = null;
              }
              await queue.playNext(elapsedPitch);
              break;
            case 'filter':
              const elapsedFilter = queue.getElapsedSeconds();
              const filter = value;
              if (queue.activeFilters.includes(filter)) {
                queue.activeFilters = queue.activeFilters.filter(f => f !== filter);
              } else {
                queue.activeFilters.push(filter);
              }
              if (queue.currentTrack) {
                queue.queue.unshift(queue.currentTrack);
                queue.currentTrack = null;
              }
              await queue.playNext(elapsedFilter);
              break;
            case 'clear':
              queue.queue = [];
              await queue.updatePanel(context.client);
              break;
            case 'jump':
              const index = parseInt(value) - 1;
              if (index >= 0 && index < queue.queue.length) {
                queue.queue = queue.queue.slice(index);
                queue.skip();
              }
              break;
            default:
              return res.status(400).json({ error: `Unknown action: ${action}` });
          }
          await queue.broadcastState();
          return res.json({ success: true });
        } catch (err: any) {
          console.error(err);
          return res.status(500).json({ error: err.message || 'Playback action failed.' });
        }
      }
    }
  ],
  events: [
    // NOTE: Music prefix commands (r!play, r!skip, etc.) are handled exclusively
    // by the clutch-music bot (Rage Music). The Core bot must NOT intercept them.
    // The messageCreate handler has been removed to prevent double-command execution.
    // Dashboard REST API routes above handle all web-based music controls.

    {
      name: 'command_play',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guild.id);
        queue.textChannelId = interaction.channelId;

        if (!interaction.member?.voice?.channel) {
          return interaction.reply({
            embeds: [
              createLimeEmbed({
                author: 'Rage Optimiser Security Gate',
                title: `${EMOJIS.WRONG} Voice Channel Required`,
                description: 'You must be connected to an active voice channel to request audio streams.',
                fields: [
                  { name: `${EMOJIS.MEMBER} Member`, value: `\`${interaction.user?.username || 'User'}\``, inline: true },
                  { name: `${EMOJIS.VOICE} Required State`, value: '`Connected to VC`', inline: true }
                ],
                commandBox: 'r!play <song name>',
                color: '#EF4444',
                client
              })
            ],
            flags: 64
          });
        }

        await interaction.deferReply({ flags: 64 });
        const query = interaction.options.getString('query');

        const shuffleArray = <T>(array: T[]): T[] => {
          const arr = [...array];
          for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
          }
          return arr;
        };

        try {
          // YouTube playlist link detection
          if (query.includes('youtube.com/playlist') || (query.includes('youtube.com/watch') && query.includes('list='))) {
            const playlist = await play.playlist_info(query, { incomplete: true }).catch(() => null);
            if (!playlist) {
              return interaction.editReply({
                embeds: [
                  createLimeEmbed({
                    title: `${EMOJIS.WRONG} YouTube Playlist Import Failed`,
                    description: 'Could not extract playlist information. Ensure the playlist is public or unlisted.',
                    color: '#EF4444',
                    client
                  })
                ]
              });
            }

            const allVideos = await playlist.all_videos().catch(() => []);
            if (!allVideos || allVideos.length === 0) {
              return interaction.editReply({
                embeds: [
                  createLimeEmbed({
                    title: `${EMOJIS.WRONG} Playlist Empty`,
                    description: 'No videos found in this YouTube playlist.',
                    color: '#EF4444',
                    client
                  })
                ]
              });
            }

            let playlistTracks: Track[] = allVideos.map(video => ({
              title: video.title || 'Unknown Title',
              artist: video.channel?.name || 'YouTube Creator',
              url: video.url,
              duration: video.durationRaw || '3:00',
              thumbnail: video.thumbnails?.[0]?.url || '',
              requester: interaction.user.username ?? interaction.user.tag,
              platform: 'YouTube'
            }));

            // Shuffle playlist tracks via Fisher-Yates
            playlistTracks = shuffleArray(playlistTracks);

            await queue.playPlaylist(playlistTracks, interaction.member.voice.channel);

            return interaction.editReply({
              embeds: [
                createLimeEmbed({
                  title: `${EMOJIS.TICKS} YouTube Playlist Enqueued`,
                  description: `Successfully imported and Fisher-Yates shuffled **${playlistTracks.length}** tracks from **${playlist.title || 'YouTube Playlist'}**.`,
                  fields: [
                    { name: `${EMOJIS.TICKS} Playlist Tracks`, value: `\`${playlistTracks.length}\``, inline: true },
                    { name: `${EMOJIS.CONFIG} Shuffled`, value: '`Yes (Fisher-Yates)`', inline: true },
                    { name: `${EMOJIS.MEMBER} Imported By`, value: `\`${interaction.user.username}\``, inline: true }
                  ],
                  commandBox: 'r!queue',
                  color: '#7C5CFC',
                  client
                })
              ],
              components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setCustomId('music_open_controls')
                    .setLabel('Open Controls')
                    .setEmoji(EMOJIS.CONFIG)
                    .setStyle(ButtonStyle.Success)
                )
              ]
            });
          }

          // Spotify link detection
          if (query.includes('spotify.com')) {
            const tracks = await spotify.getTracks(query).catch(() => []);
            if (!tracks || tracks.length === 0) {
              return interaction.editReply({
                embeds: [
                  createLimeEmbed({
                    title: `${EMOJIS.WRONG} Spotify Import Failed`,
                    description: 'Could not extract any valid audio tracks from this Spotify link.',
                    color: '#EF4444',
                    client
                  })
                ]
              });
            }

            let spTracks: Track[] = tracks.map((spTrack: any) => ({
              title: spTrack.name,
              artist: spTrack.artists?.[0]?.name || 'Spotify Artist',
              url: `search:${spTrack.name} ${spTrack.artists?.[0]?.name || ''}`,
              duration: formatSpotifyDuration(spTrack),
              thumbnail: 'https://storage.googleapis.com/pr-newsroom-wp/1/2018/11/Spotify_Logo_CMYK_Green.png',
              requester: interaction.user.username ?? interaction.user.tag,
              platform: 'Spotify'
            }));

            const isPlaylistOrAlbum = query.includes('/playlist') || query.includes('/album');
            if (isPlaylistOrAlbum) {
              spTracks = shuffleArray(spTracks);
            }

            await queue.playPlaylist(spTracks, interaction.member.voice.channel);

            return interaction.editReply({
              embeds: [
                createLimeEmbed({
                  title: isPlaylistOrAlbum ? `${EMOJIS.TICKS} Spotify Playlist Enqueued` : `${EMOJIS.TICKS} Spotify Track Enqueued`,
                  description: `Successfully imported ${isPlaylistOrAlbum ? 'and Fisher-Yates shuffled ' : ''}**${spTracks.length}** Spotify tracks.`,
                  fields: [
                    { name: `${EMOJIS.VOICE} Platform`, value: '`Spotify`', inline: true },
                    { name: `${EMOJIS.TICKS} Track Count`, value: `\`${spTracks.length}\``, inline: true },
                    { name: `${EMOJIS.MEMBER} Requester`, value: `\`${interaction.user.username}\``, inline: true }
                  ],
                  commandBox: 'r!queue',
                  color: '#1DB954',
                  client
                })
              ],
              components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setCustomId('music_open_controls')
                    .setLabel('Open Controls')
                    .setEmoji(EMOJIS.CONFIG)
                    .setStyle(ButtonStyle.Success)
                )
              ]
            });
          }

          // Standard track fallback (YouTube search / link)
          let search = await play.search(query, { limit: 1 }).catch(() => []);
          if (!search || search.length === 0) {
            return interaction.editReply({
              embeds: [
                createLimeEmbed({
                  title: `${EMOJIS.WRONG} Search Results Empty`,
                  description: `No tracks found matching query: \`${query}\``,
                  color: '#EF4444',
                  client
                })
              ]
            });
          }

          const trackInfo = search[0];
          const track: Track = {
            title: trackInfo.title || 'Unknown Title',
            artist: trackInfo.channel?.name || 'Various Artists',
            url: trackInfo.url,
            duration: trackInfo.durationRaw || 'Unknown',
            thumbnail: trackInfo.thumbnails?.[0]?.url || '',
            requester: interaction.user.tag,
            views: trackInfo.views ? trackInfo.views.toLocaleString() : 'N/A',
            uploadDate: trackInfo.uploadedAt || 'N/A',
            platform: 'YouTube'
          };

          await queue.play(track, interaction.member.voice.channel);

          const hasValidUrl = track.url && track.url.startsWith('http');
          const titleLink = hasValidUrl ? `[${track.title}](${track.url})` : `**${track.title}**`;

          const embed = createLimeEmbed({
            title: `${EMOJIS.SOUNDWAVE} Track Enqueued & Playing`,
            description: `Successfully added requested audio track to the active queue!\n\n${titleLink}`,
            fields: [
              { name: `${EMOJIS.TIMER} Duration`, value: `\`${track.duration}\``, inline: true },
              { name: `${EMOJIS.VOICE} Platform`, value: `\`${track.platform}\``, inline: true },
              { name: `${EMOJIS.MEMBER} Requester`, value: `\`${track.requester}\``, inline: true },
              { name: `${EMOJIS.STATS} Views`, value: `\`${track.views || 'N/A'}\``, inline: true },
              { name: `${EMOJIS.INFO} Uploaded`, value: `\`${track.uploadDate || 'N/A'}\``, inline: true }
            ],
            commandBox: 'r!queue',
            thumbnail: track.thumbnail,
            color: '#7C5CFC',
            client
          });

          return interaction.editReply({
            embeds: [embed],
            components: [
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId('music_open_controls')
                  .setLabel('Open Controls')
                  .setEmoji(EMOJIS.CONFIG)
                  .setStyle(ButtonStyle.Success)
              )
            ]
          });

        } catch (err) {
          console.error(err);
          return interaction.editReply({
            embeds: [
              createLimeEmbed({
                title: `${EMOJIS.WRONG} Stream Initialization Error`,
                description: 'Failed to fetch video information. Ensure this is not age-restricted or region blocked.',
                color: '#EF4444',
                client
              })
            ]
          });
        }
      }
    },
    {
      name: 'command_help',
      handler: async (client: any, interaction: any, context: any) => {
        const embed = createLimeEmbed({
          title: '🎵 Music Engine Command Reference',
          description: 'Here is a list of all available high-fidelity audio system commands. Prefix with `r!`.',
          fields: [
            { name: '🎵 r!play <query>', value: 'Stream audio from YouTube, Spotify, SoundCloud', inline: true },
            { name: '⏸️ r!pause', value: 'Pause active stream playback', inline: true },
            { name: '▶️ r!resume', value: 'Resume paused audio stream', inline: true },
            { name: '⏭️ r!skip', value: 'Skip current playing track', inline: true },
            { name: '⏮️ r!back', value: 'Replay previous track from history', inline: true },
            { name: '🛑 r!stop', value: 'Terminate playback & clear queue', inline: true },
            { name: '📋 r!queue', value: 'Show upcoming track list', inline: true },
            { name: '🔀 r!shuffle', value: 'Randomize upcoming queue order', inline: true },
            { name: '🔁 r!loop <mode>', value: 'Change loop mode (track/queue/off)', inline: true },
            { name: '📻 r!autoplay', value: 'Toggle auto recommendation engine', inline: true },
            { name: '🔊 r!volume <0-200>', value: 'Adjust software gain level', inline: true },
            { name: '🗑️ r!clear', value: 'Flush all upcoming queue items', inline: true }
          ],
          commandBox: 'r!play <song name>',
          color: '#7C5CFC',
          client
        });

        return interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_pause',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guild.id);
        if (!checkVoicePermissions(interaction, queue)) return;
        queue.pause();
        const embed = createLimeEmbed({
          title: '⏸️ Audio Stream Paused',
          description: 'Successfully paused current audio playback stream.',
          fields: [
            { name: '🎵 Active Track', value: `\`${queue.currentTrack?.title?.slice(0, 30) || 'Current Track'}\``, inline: true },
            { name: '👤 Paused By', value: `\`${interaction.user.username}\``, inline: true }
          ],
          commandBox: 'r!resume',
          color: '#F59E0B',
          client
        });
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_resume',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guild.id);
        if (!checkVoicePermissions(interaction, queue)) return;
        queue.resume();
        const embed = createLimeEmbed({
          title: '▶️ Audio Stream Resumed',
          description: 'Successfully resumed active audio playback stream.',
          fields: [
            { name: '🎵 Active Track', value: `\`${queue.currentTrack?.title?.slice(0, 30) || 'Current Track'}\``, inline: true },
            { name: '👤 Resumed By', value: `\`${interaction.user.username}\``, inline: true }
          ],
          commandBox: 'r!pause',
          color: '#10B981',
          client
        });
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_skip',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guild.id);
        if (!checkVoicePermissions(interaction, queue)) return;
        const currentTitle = queue.currentTrack?.title || 'Current Track';
        queue.skip();
        const embed = createLimeEmbed({
          title: '⏭️ Track Skipped',
          description: `Skipped **${currentTitle}**! Moving to the next track...`,
          fields: [
            { name: '👤 Skipped By', value: `\`${interaction.user.username}\``, inline: true },
            { name: '📋 Remaining Queue', value: `\`${queue.queue.length} track(s)\``, inline: true }
          ],
          commandBox: 'r!queue',
          color: '#7C5CFC',
          client
        });
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_back',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guild.id);
        if (!checkVoicePermissions(interaction, queue)) return;
        const prevTrack = queue.playHistory[1]; // [0]=current, [1]=previous
        if (prevTrack) {
          // Insert prev track at front of queue, do NOT re-insert current
          // (skip() → playNext() will record current into history itself)
          queue.queue.unshift(prevTrack);
          queue.skip();
          const embed = createLimeEmbed({
            title: '⏮️ Replaying Previous Track',
            description: `Replaying **[${prevTrack.title}](${prevTrack.url})** from history!`,
            fields: [
              { name: '⏱️ Duration', value: `\`${prevTrack.duration}\``, inline: true },
              { name: '👤 Requested By', value: `\`${interaction.user.username}\``, inline: true }
            ],
            commandBox: 'r!skip',
            color: '#7C5CFC',
            client
          });
          await interaction.reply({ embeds: [embed] });
        } else {
          const embed = createLimeEmbed({
            title: '❌ No History Found',
            description: 'There are no previously played tracks in the session history buffer.',
            color: '#EF4444',
            client
          });
          await interaction.reply({ embeds: [embed] });
        }
      }
    },
    {
      name: 'command_autoplay',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guild.id);
        if (!checkVoicePermissions(interaction, queue)) return;
        queue.autoplay = !queue.autoplay;
        await queue.updatePanel(client);
        const embed = createLimeEmbed({
          title: '📻 Autoplay Engine Updated',
          description: 'Automatic recommendation system setting toggled.',
          fields: [
            { name: '📻 Autoplay Status', value: queue.autoplay ? '`ENABLED`' : '`DISABLED`', inline: true },
            { name: '👤 Toggled By', value: `\`${interaction.user.username}\``, inline: true }
          ],
          color: queue.autoplay ? '#10B981' : '#6B7280',
          client
        });
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_stop',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guild.id);
        if (!checkVoicePermissions(interaction, queue)) return;
        queue.client = client;
        queue.stop();
        await queue.updatePanel(client).catch(() => {});
        const embed = createLimeEmbed({
          title: '🛑 Playback Terminated & Queue Cleared',
          description: 'Successfully released voice connection resources and flushed the session queue.',
          fields: [
            { name: '👤 Executed By', value: `\`${interaction.user.username}\``, inline: true },
            { name: '📋 Queue Status', value: '`Cleared (0 tracks)`', inline: true }
          ],
          commandBox: 'r!play <song name>',
          color: '#EF4444',
          client
        });
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_queue',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guild.id);
        queue.viewMode = 'queue';
        queue.queuePage = 0;
        await queue.updatePanel(client);
        const embed = createLimeEmbed({
          title: '📋 Playback Queue Panel Active',
          description: `Control panel view set to **Queue View**.`,
          fields: [
            { name: '📋 Upcoming Tracks', value: `\`${queue.queue.length}\``, inline: true },
            { name: '👤 Requested By', value: `\`${interaction.user.username}\``, inline: true }
          ],
          commandBox: 'r!queue',
          color: '#7C5CFC',
          client
        });
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_shuffle',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guild.id);
        if (!checkVoicePermissions(interaction, queue)) return;
        for (let i = queue.queue.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [queue.queue[i], queue.queue[j]] = [queue.queue[j], queue.queue[i]];
        }
        await queue.updatePanel(client);
        const embed = createLimeEmbed({
          title: '🔀 Queue Order Randomized',
          description: `Fisher-Yates algorithm reordered **${queue.queue.length}** upcoming tracks in session queue.`,
          fields: [
            { name: '📋 Total Tracks', value: `\`${queue.queue.length}\``, inline: true },
            { name: '👤 Shuffled By', value: `\`${interaction.user.username}\``, inline: true }
          ],
          commandBox: 'r!queue',
          color: '#7C5CFC',
          client
        });
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_loop',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guild.id);
        if (!checkVoicePermissions(interaction, queue)) return;
        const mode = interaction.options.getString('mode') as 'track' | 'queue' | 'off';
        queue.loopMode = mode;
        await queue.updatePanel(client);
        const embed = createLimeEmbed({
          title: '🔁 Loop Mode Updated',
          description: `Playback repeat mode changed.`,
          fields: [
            { name: '🔁 Loop Setting', value: `\`${mode.toUpperCase()}\``, inline: true },
            { name: '👤 Configured By', value: `\`${interaction.user.username}\``, inline: true }
          ],
          color: '#7C5CFC',
          client
        });
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_volume',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guild.id);
        if (!checkVoicePermissions(interaction, queue)) return;
        const vol = interaction.options.getInteger('percent');
        queue.setVolume(vol);
        await queue.updatePanel(client);
        const embed = createLimeEmbed({
          title: '🔊 Software Gain Level Adjusted',
          description: `Audio output volume level changed.`,
          fields: [
            { name: '🔊 Volume Level', value: `\`${vol}%\``, inline: true },
            { name: '👤 Adjusted By', value: `\`${interaction.user.username}\``, inline: true }
          ],
          color: '#7C5CFC',
          client
        });
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_clear',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guild.id);
        if (!checkVoicePermissions(interaction, queue)) return;
        const count = queue.queue.length;
        queue.queue = [];
        await queue.updatePanel(client);
        const embed = createLimeEmbed({
          title: '🗑️ Session Queue Flushed',
          description: `Successfully cleared all pending tracks from upcoming queue.`,
          fields: [
            { name: '📋 Removed Count', value: `\`${count} track(s)\``, inline: true },
            { name: '👤 Cleared By', value: `\`${interaction.user.username}\``, inline: true }
          ],
          commandBox: 'r!play <song name>',
          color: '#EF4444',
          client
        });
        await interaction.reply({ embeds: [embed] });
      }
    },
    
    // BUTTON INTERACTION EVENTS
    {
      name: 'button_music_prev',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;

        const prevTrack = queue.playHistory.shift();
        if (prevTrack) {
          if (queue.currentTrack) {
            queue.queue.unshift(queue.currentTrack);
          }
          queue.queue.unshift(prevTrack);
          queue.skip();
          await interaction.reply({ content: '⏮️ Playing previous track.', flags: 64 });
        } else {
          await interaction.reply({ content: '❌ No previous tracks in playback history.', flags: 64 });
        }
      }
    },
    {
      name: 'button_music_play_pause',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;

        if (queue.player.state.status === 'paused') {
          queue.resume();
        } else {
          queue.pause();
        }
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_skip',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;
        queue.skip();
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_stop',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;
        queue.client = client;
        queue.stop();
        await queue.updatePanel(client).catch(() => {});
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_loop',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;

        queue.loopMode = queue.loopMode === 'off' ? 'track' : (queue.loopMode === 'track' ? 'queue' : 'off');
        await queue.updatePanel(client);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_shuffle',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;

        for (let i = queue.queue.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [queue.queue[i], queue.queue[j]] = [queue.queue[j], queue.queue[i]];
        }
        await queue.updatePanel(client);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_favorite',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (queue.currentTrack) {
          queue.favorites.push(queue.currentTrack);
          await interaction.reply({ content: `❤️ Added **${queue.currentTrack.title}** to your favorites!`, flags: 64 });
        } else {
          await interaction.reply({ content: '❌ No track is currently playing.', flags: 64 });
        }
      }
    },
    {
      name: 'button_music_queue_btn',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        queue.viewMode = 'queue';
        queue.queuePage = 0;
        await queue.updatePanel(client);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_filters_btn',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        queue.viewMode = 'filters';
        queue.queuePage = 0; // reset page on view switch (BUG FIX #8)
        await queue.updatePanel(client);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_volume_btn',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        queue.viewMode = 'volume';
        queue.queuePage = 0;
        await queue.updatePanel(client);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_lyrics',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        queue.viewMode = 'lyrics';
        await queue.updatePanel(client);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_settings',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        queue.viewMode = 'settings';
        await queue.updatePanel(client);
      }
    },
    {
      name: 'button_music_toggle_autoplay',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;

        queue.autoplay = !queue.autoplay;
        await queue.updatePanel(client);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_save_playlist',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!queue.currentTrack) return interaction.reply({ content: '❌ Queue is empty.', flags: 64 });

        queue.playlists.push({
          name: `Playlist #${queue.playlists.length + 1}`,
          tracks: [queue.currentTrack, ...queue.queue]
        });

        await interaction.reply({ content: '📥 Saved current queue sequence to server playlists.', flags: 64 });
      }
    },
    {
      name: 'button_music_clear',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;

        queue.queue = [];
        await queue.updatePanel(client);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_queue_prev',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        queue.queuePage = Math.max(0, queue.queuePage - 1);
        await queue.updatePanel(client);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_queue_next',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        queue.queuePage++;
        await queue.updatePanel(client);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_view_player',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        queue.viewMode = 'player';
        await queue.updatePanel(client);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_view_playlists',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        queue.viewMode = 'playlists';
        await queue.updatePanel(client);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_trending_songs',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!interaction.member?.voice?.channel) return interaction.reply({ content: '❌ You must be in a voice channel.', flags: 64 });

        await interaction.deferReply({ flags: 64 }).catch(() => {});
        try {
          const search = await play.search('trending music', { limit: 1 }).catch(() => []);
          if (search && search.length > 0) {
            const trackInfo = search[0];
            const track: Track = {
              title: trackInfo.title || 'Trending Track',
              artist: trackInfo.channel?.name || 'Various Artists',
              url: trackInfo.url,
              duration: trackInfo.durationRaw || 'Unknown',
              thumbnail: trackInfo.thumbnails?.[0]?.url || '',
              requester: interaction.user.username,
              platform: 'YouTube'
            };
            await queue.play(track, interaction.member.voice.channel);
            return interaction.editReply({ content: `🔥 Enqueued and playing trending track: **[${track.title}](${track.url})**!` });
          } else {
            return interaction.editReply({ content: '❌ Could not find trending music right now.' });
          }
        } catch (err) {
          return interaction.editReply({ content: '❌ Failed to fetch trending music.' });
        }
      }
    },
    {
      name: 'button_music_discover',
      handler: async (client: any, interaction: any, context: any) => {
        await interaction.reply({ content: '🎵 Discover is working. Try `r!play lofi hip hop` to find tracks!', flags: 64 });
      }
    },
    
    // FILTER TOGGLE BUTTONS (FROM FILTERS PANEL VIEW)
    {
      name: 'button_music_toggle_bassboost',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;

        const elapsed = queue.getElapsedSeconds();
        if (queue.activeFilters.includes('bassboost')) {
          queue.activeFilters = queue.activeFilters.filter(f => f !== 'bassboost');
        } else {
          queue.activeFilters.push('bassboost');
        }
        
        if (queue.currentTrack) {
          queue.queue.unshift(queue.currentTrack);
          queue.currentTrack = null;
        }
        await queue.playNext(elapsed);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_toggle_nightcore',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;

        const elapsed = queue.getElapsedSeconds();
        if (queue.activeFilters.includes('nightcore')) {
          queue.activeFilters = queue.activeFilters.filter(f => f !== 'nightcore');
        } else {
          queue.activeFilters.push('nightcore');
        }

        if (queue.currentTrack) {
          queue.queue.unshift(queue.currentTrack);
          queue.currentTrack = null;
        }
        await queue.playNext(elapsed);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_toggle_8d',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;

        const elapsed = queue.getElapsedSeconds();
        if (queue.activeFilters.includes('8d')) {
          queue.activeFilters = queue.activeFilters.filter(f => f !== '8d');
        } else {
          queue.activeFilters.push('8d');
        }

        if (queue.currentTrack) {
          queue.queue.unshift(queue.currentTrack);
          queue.currentTrack = null;
        }
        await queue.playNext(elapsed);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_toggle_vaporwave',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;

        const elapsed = queue.getElapsedSeconds();
        if (queue.activeFilters.includes('vaporwave')) {
          queue.activeFilters = queue.activeFilters.filter(f => f !== 'vaporwave');
        } else {
          queue.activeFilters.push('vaporwave');
        }

        if (queue.currentTrack) {
          queue.queue.unshift(queue.currentTrack);
          queue.currentTrack = null;
        }
        await queue.playNext(elapsed);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_toggle_treble',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;

        const elapsed = queue.getElapsedSeconds();
        if (queue.activeFilters.includes('treble')) {
          queue.activeFilters = queue.activeFilters.filter(f => f !== 'treble');
        } else {
          queue.activeFilters.push('treble');
        }

        if (queue.currentTrack) {
          queue.queue.unshift(queue.currentTrack);
          queue.currentTrack = null;
        }
        await queue.playNext(elapsed);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_toggle_reverb',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;

        const elapsed = queue.getElapsedSeconds();
        if (queue.activeFilters.includes('reverb')) {
          queue.activeFilters = queue.activeFilters.filter(f => f !== 'reverb');
        } else {
          queue.activeFilters.push('reverb');
        }

        if (queue.currentTrack) {
          queue.queue.unshift(queue.currentTrack);
          queue.currentTrack = null;
        }
        await queue.playNext(elapsed);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_toggle_speed_plus',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;

        const elapsed = queue.getElapsedSeconds();
        queue.speed = Math.min(2.0, queue.speed + 0.1);
        if (queue.currentTrack) {
          queue.queue.unshift(queue.currentTrack);
          queue.currentTrack = null;
        }
        await queue.playNext(elapsed);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_toggle_speed_minus',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;

        const elapsed = queue.getElapsedSeconds();
        queue.speed = Math.max(0.5, queue.speed - 0.1);
        if (queue.currentTrack) {
          queue.queue.unshift(queue.currentTrack);
          queue.currentTrack = null;
        }
        await queue.playNext(elapsed);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_toggle_pitch_plus',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;

        const elapsed = queue.getElapsedSeconds();
        queue.pitch = Math.min(2.0, queue.pitch + 0.1);
        if (queue.currentTrack) {
          queue.queue.unshift(queue.currentTrack);
          queue.currentTrack = null;
        }
        await queue.playNext(elapsed);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_toggle_pitch_minus',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;

        const elapsed = queue.getElapsedSeconds();
        queue.pitch = Math.max(0.5, queue.pitch - 0.1);
        if (queue.currentTrack) {
          queue.queue.unshift(queue.currentTrack);
          queue.currentTrack = null;
        }
        await queue.playNext(elapsed);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_reset_filters',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;

        const elapsed = queue.getElapsedSeconds();
        queue.activeFilters = [];
        queue.speed = 1.0;
        queue.pitch = 1.0;
        if (queue.currentTrack) {
          queue.queue.unshift(queue.currentTrack);
          queue.currentTrack = null;
        }
        await queue.playNext(elapsed);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    
    // VOLUME CONTROL BUTTONS
    {
      name: 'button_music_volume_plus',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;
        queue.setVolume(queue.volume + 10);
        await queue.updatePanel(client);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_volume_minus',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;
        queue.setVolume(queue.volume - 10);
        await queue.updatePanel(client);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_volume_mute',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;
        queue.setVolume(queue.volume > 0 ? 0 : 100);
        await queue.updatePanel(client);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_volume_100',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;
        queue.setVolume(100);
        await queue.updatePanel(client);
        await interaction.deferUpdate().catch(() => {});
      }
    },
    {
      name: 'button_music_toggle_247',
      handler: async (client: any, interaction: any, context: any) => {
        // Dummy placeholder to return a state
        await interaction.reply({ content: '⚙️ 24/7 Presence Mode toggled.', flags: 64 });
      }
    },

    // SELECT MENU COMPONENT EVENTS
    {
      name: 'select_music_select_jump',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;

        const val = interaction.values[0];
        if (val) {
          const index = parseInt(val) - 1;
          if (index >= 0 && index < queue.queue.length) {
            const targetTrack = queue.queue[index];
            queue.queue = queue.queue.slice(index);
            queue.skip();
            await interaction.reply({ content: `🎯 Jumped to: **${targetTrack.title}**`, flags: 64 });
          }
        }
      }
    },
    {
      name: 'select_music_select_filter',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;

        const filter = interaction.values[0];
        if (filter) {
          if (queue.activeFilters.includes(filter)) {
            queue.activeFilters = queue.activeFilters.filter(f => f !== filter);
          } else {
            queue.activeFilters.push(filter);
          }

          if (queue.currentTrack) {
            queue.queue.unshift(queue.currentTrack);
            queue.currentTrack = null;
          }
          await queue.playNext();
          await interaction.reply({ content: `🎚️ DSP audio filter list updated. Applied: **${filter}**`, flags: 64 });
        }
      }
    },
    {
      name: 'select_music_select_speed',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        if (!checkVoicePermissions(interaction, queue)) return;

        const speedVal = parseFloat(interaction.values[0]);
        if (!isNaN(speedVal)) {
          queue.speed = speedVal;
          if (queue.currentTrack) {
            queue.queue.unshift(queue.currentTrack);
            queue.currentTrack = null;
          }
          await queue.playNext();
          await interaction.reply({ content: `⚡ Playback speed adjusted to **${speedVal}x**`, flags: 64 });
        }
      }
    },

    // MODAL SUBMIT EVENT
    {
      name: 'modal_music_add_song_modal',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        const query = interaction.fields.getTextInputValue('query');

        await interaction.deferReply({ flags: 64 });
        
        try {
          const voiceChannel = interaction.member?.voice?.channel;
          if (!voiceChannel) {
            return interaction.editReply({ content: '❌ You must be in a voice channel.' });
          }

          if (query.includes('spotify.com')) {
            const tracks = await spotify.getTracks(query).catch(() => []);
            if (!tracks || tracks.length === 0) {
              return interaction.editReply({ content: '❌ No Spotify tracks found.' });
            }

            const tracksToAdd = tracks.slice(0, 50);
            for (const spTrack of tracksToAdd) {
              const track: Track = {
                title: spTrack.name,
                artist: spTrack.artists?.[0]?.name || 'Spotify Artist',
                url: `search:${spTrack.name} ${spTrack.artists?.[0]?.name || ''}`,
            duration: formatSpotifyDuration(spTrack),
                thumbnail: 'https://storage.googleapis.com/pr-newsroom-wp/1/2018/11/Spotify_Logo_CMYK_Green.png',
                requester: interaction.user.username,
                platform: 'Spotify'
              };
              await queue.play(track, voiceChannel);
            }

            return interaction.editReply({ content: `📥 Enqueued **${tracksToAdd.length}** Spotify tracks.` });
          }

          let search = await play.search(query, { limit: 1 }).catch(() => []);
          if (!search || search.length === 0) {
            return interaction.editReply({ content: `❌ No results found for: \`${query}\`` });
          }

          const trackInfo = search[0];
          const track: Track = {
            title: trackInfo.title || 'Unknown Title',
            artist: trackInfo.channel?.name || 'Various Artists',
            url: trackInfo.url,
            duration: trackInfo.durationRaw || 'Unknown',
            thumbnail: trackInfo.thumbnails?.[0]?.url || '',
            requester: interaction.user.username,
            views: trackInfo.views ? trackInfo.views.toLocaleString() : 'N/A',
            uploadDate: trackInfo.uploadedAt || 'N/A',
            platform: 'YouTube'
          };

          await queue.play(track, voiceChannel);
          return interaction.editReply({ content: `➕ Enqueued: **[${track.title}](${track.url})**` });

        } catch (err) {
          console.error(err);
          return interaction.editReply({ content: '❌ Error importing song query.' });
        }
      }
    },
    {
      name: 'button_music_open_controls',
      handler: async (client: any, interaction: any, context: any) => {
        const queue = QueueManager.getQueue(interaction.guildId);
        await queue.openControls(client);
        await interaction.deferUpdate().catch(() => {});
      }
    }
  ]
};

// Client verification helpers
const isMusicBot = (client: any) => client.user?.id === '1520323151928623125';

const checkMusicBot = async (client: any, interaction: any) => {
  if (!isMusicBot(client)) {
    // Silently return false so the Core bot never sends error messages or responds to music commands
    return false;
  }
  return true;
};

// Post-process the events array to wrap handlers with the client check
if (MusicManifest.events) {
  MusicManifest.events = MusicManifest.events.map(event => {
    if (event.name === 'messageCreate') {
      const originalHandler = event.handler;
      event.handler = async (client: any, message: any, context: any) => {
        if (!isMusicBot(client)) return;
        return originalHandler(client, message, context);
      };
      return event;
    }

    const originalHandler = event.handler;
    event.handler = async (client: any, interaction: any, context: any) => {
      if (!await checkMusicBot(client, interaction)) return;
      return originalHandler(client, interaction, context);
    };
    return event;
  });
}
