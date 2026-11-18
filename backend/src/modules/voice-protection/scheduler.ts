export async function runMuteCheck(client: any, guildId: string, config: any, context: any) {
  const activeMutes = config.activeMutes || [];
  if (activeMutes.length === 0) return;

  const now = Date.now();
  const remainingMutes = [];
  const expiredMutes = [];

  for (const mute of activeMutes) {
    if (now >= mute.unmuteAt) {
      expiredMutes.push(mute);
    } else {
      remainingMutes.push(mute);
    }
  }

  if (expiredMutes.length === 0) return;

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (guild) {
    for (const mute of expiredMutes) {
      try {
        const member = await guild.members.fetch(mute.userId).catch(() => null);
        if (member) {
          // Unmute if they are currently connected and server muted
          if (member.voice.channel && member.voice.serverMute) {
            await member.voice.setMute(false, 'Voice Protection: Temporary mute expired').catch(() => {});
          }
          if (context.logSyncEvent) {
            context.logSyncEvent(
              `[Voice Protection] Automatically unmuted user ${member.user.username} (Temporary mute expired).`,
              'success'
            );
          }
        }
      } catch (err) {
        console.error(`[Voice Protection Scheduler] Failed to unmute user ${mute.userId}:`, err);
      }
    }
  }

  // Save the updated list of remaining active mutes to Firestore config state
  await context.updateModuleConfig('voice-protection', { activeMutes: remainingMutes });
}
export async function clearStaleMutes(client: any, guildId: string, context: any) {
  // Can be called to clear all active mutes manually
  await context.updateModuleConfig('voice-protection', { activeMutes: [] });
}
