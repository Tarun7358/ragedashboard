import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  VoiceStatusState,
  getVoiceStatusConfig,
  saveVoiceStatusConfig,
  setVoiceChannelStatus,
  getHumanMemberCount,
  processVoiceStateUpdate,
  processVoiceChannelStatusUpdate,
  startupVoiceStatusSweep,
  IVoiceStatusTarget
} from './VoiceStatusManager.js';

describe('Voice Channel Auto-Status Management', () => {
  beforeEach(() => {
    // Reset in-memory state
    VoiceStatusState.setManualOverride('vc_test_1', false);
    VoiceStatusState.setCurrentStatus('vc_test_1', '');
    VoiceStatusState.clearPendingTimer('vc_test_1');
  });

  it('correctly calculates human members and ignores bots', () => {
    const mockChannel = {
      id: 'vc_test_1',
      members: new Map([
        ['user1', { id: 'user1', user: { bot: false } }],
        ['bot1', { id: 'bot1', user: { bot: true } }]
      ])
    };

    expect(getHumanMemberCount(mockChannel)).toBe(1);

    const emptyChannel = {
      id: 'vc_test_1',
      members: new Map([
        ['bot1', { id: 'bot1', user: { bot: true } }]
      ])
    };

    expect(getHumanMemberCount(emptyChannel)).toBe(0);
  });

  it('calls REST endpoint to set voice channel status', async () => {
    const putMock = jest.fn().mockImplementation(() => Promise.resolve({ ok: true }));
    const mockChannel = {
      id: 'vc_test_1',
      isVoiceBased: () => true,
      permissionsFor: () => ({ has: () => true }),
      guild: { members: { me: { id: 'bot_id' } } },
      client: {
        rest: { put: putMock }
      }
    };

    const res = await setVoiceChannelStatus(mockChannel, '✨ Playing Under Stars 🦋');
    expect(res.success).toBe(true);
    expect(putMock).toHaveBeenCalledWith('/channels/vc_test_1/voice-status', {
      body: { status: '✨ Playing Under Stars 🦋' }
    });
    expect(VoiceStatusState.getCurrentStatus('vc_test_1')).toBe('✨ Playing Under Stars 🦋');
  });

  it('preserves user manual status update while users are active in channel', () => {
    const context = {
      getModulesState: () => [
        {
          id: 'voice_manager',
          config: {
            voiceStatus: {
              autoStatusEnabled: true,
              channels: [
                {
                  channelId: 'vc_test_1',
                  defaultStatus: '✨ Playing Under Stars 🦋',
                  enabled: true
                }
              ]
            }
          }
        }
      ]
    };

    // User changes status to "Valorant Grinding"
    processVoiceChannelStatusUpdate(
      {},
      { channelId: 'vc_test_1', guildId: 'guild_1', status: 'Valorant Grinding' },
      context
    );

    expect(VoiceStatusState.isManualOverride('vc_test_1')).toBe(true);
    expect(VoiceStatusState.getCurrentStatus('vc_test_1')).toBe('Valorant Grinding');
  });

  it('resets status to default when channel empties out', async () => {
    jest.useFakeTimers();

    const putMock = jest.fn().mockImplementation(() => Promise.resolve({ ok: true }));
    const mockChannel = {
      id: 'vc_test_1',
      name: 'General VC',
      isVoiceBased: () => true,
      permissionsFor: () => ({ has: () => true }),
      members: new Map(), // 0 members
      guild: {
        id: 'guild_1',
        members: { me: { id: 'bot_id' } },
        channels: {
          cache: {
            get: () => mockChannel
          },
          fetch: () => Promise.resolve(mockChannel)
        }
      },
      client: {
        rest: { put: putMock }
      }
    };

    const context = {
      getModulesState: () => [
        {
          id: 'voice_manager',
          config: {
            voiceStatus: {
              autoStatusEnabled: true,
              channels: [
                {
                  channelId: 'vc_test_1',
                  defaultStatus: '✨ Playing Under Stars 🦋',
                  enabled: true
                }
              ]
            }
          }
        }
      ]
    };

    // Simulate user leaving: oldState had vc_test_1, newState is null
    const oldState = { channelId: 'vc_test_1', channel: mockChannel, guild: mockChannel.guild };
    const newState = { channelId: null, guild: mockChannel.guild };

    await processVoiceStateUpdate({}, oldState, newState, context);

    // Fast forward debounce timer
    jest.advanceTimersByTime(2000);

    // Allow promise callbacks in timer to run
    await Promise.resolve();

    expect(putMock).toHaveBeenCalledWith('/channels/vc_test_1/voice-status', {
      body: { status: '✨ Playing Under Stars 🦋' }
    });

    jest.useRealTimers();
  });

  it('does NOT re-apply status when channel is cleared/removed from config', async () => {
    jest.useFakeTimers();

    const putMock = jest.fn().mockImplementation(() => Promise.resolve({ ok: true }));
    const mockChannel = {
      id: 'vc_test_cleared',
      name: 'General VC',
      isVoiceBased: () => true,
      permissionsFor: () => ({ has: () => true }),
      members: new Map(),
      guild: {
        id: 'guild_1',
        members: { me: { id: 'bot_id' } },
        channels: {
          cache: { get: () => mockChannel },
          fetch: () => Promise.resolve(mockChannel)
        }
      },
      client: {
        rest: { put: putMock }
      }
    };

    // Config with 0 channels (channel was cleared / removed)
    const context = {
      getModulesState: () => [
        {
          id: 'voice_manager',
          config: {
            voiceStatus: {
              autoStatusEnabled: true,
              channels: []
            }
          }
        }
      ]
    };

    const oldState = { channelId: 'vc_test_cleared', channel: mockChannel, guild: mockChannel.guild };
    const newState = { channelId: null, guild: mockChannel.guild };

    await processVoiceStateUpdate({}, oldState, newState, context);
    jest.advanceTimersByTime(2000);
    await Promise.resolve();

    // Verify REST API was NEVER called because channel was cleared/removed
    expect(putMock).not.toHaveBeenCalled();

    jest.useRealTimers();
  });
});
