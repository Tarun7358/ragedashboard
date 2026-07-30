import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { Database } from '../../core/Database.js';
import {
  Embeds, Colors, Components,
  buildRichCard, buildListCard, buildStatusCard,
  progressBar, fmt, ts,
} from '../../core/UIFactory.js';

// Safe display name helper
function userTag(user: any): string {
  return user?.globalName ?? user?.username ?? user?.tag ?? user?.id ?? 'Unknown';
}

async function getUserXP(guildId: string, userId: string): Promise<number> {
  try {
    const db = Database.getDb();
    if (!db) return 0;
    const row = await db.get<any>('SELECT xp FROM guild_xp WHERE guildId = ? AND userId = ?', [guildId, userId]);
    return row ? (row.xp || 0) : 0;
  } catch (err) {
    console.error('Failed to get user XP:', err);
    return 0;
  }
}

async function saveUserXP(guildId: string, userId: string, xp: number): Promise<void> {
  try {
    const db = Database.getDb();
    if (!db) return;
    await db.run(
      'INSERT OR REPLACE INTO guild_xp (guildId, userId, xp, updatedAt) VALUES (?, ?, ?, ?)',
      [guildId, userId, xp, new Date().toISOString()]
    );
  } catch (err) {
    console.error('Failed to save user XP:', err);
  }
}

async function getTopXP(guildId: string, limit: number = 50): Promise<Array<{userId: string, xp: number}>> {
  try {
    const db = Database.getDb();
    if (!db) return [];
    const rows = await db.all<any>(
      'SELECT userId, xp FROM guild_xp WHERE guildId = ? ORDER BY xp DESC LIMIT ?',
      [guildId, limit]
    );
    return rows.map(row => ({ userId: row.userId, xp: row.xp || 0 }));
  } catch (err) {
    console.error('Failed to query leaderboard XP:', err);
    return [];
  }
}

async function resetAllXP(guildId: string): Promise<void> {
  try {
    const db = Database.getDb();
    if (!db) return;
    await db.run('DELETE FROM guild_xp WHERE guildId = ?', [guildId]);
  } catch (err) {
    console.error('Failed to reset all XP:', err);
  }
}

interface EcoUser {
  balance: number;
  lastDaily?: number;
  lastWork?: number;
  inventory?: string[];
}

async function getUserEco(guildId: string, userId: string): Promise<EcoUser> {
  try {
    const db = Database.getDb();
    if (!db) return { balance: 0 };
    const row = await db.get<any>('SELECT balance, lastDaily, lastWork, inventory FROM guild_economy WHERE guildId = ? AND userId = ?', [guildId, userId]);
    if (row) {
      return {
        balance: row.balance || 0,
        lastDaily: row.lastDaily || 0,
        lastWork: row.lastWork || 0,
        inventory: typeof row.inventory === 'string' ? JSON.parse(row.inventory) : (row.inventory || [])
      };
    }
  } catch (err) {
    console.error('Failed to get user economy:', err);
  }
  return { balance: 0 };
}

async function saveUserEco(guildId: string, userId: string, eco: EcoUser): Promise<void> {
  try {
    const db = Database.getDb();
    if (!db) return;
    await db.run(
      `INSERT OR REPLACE INTO guild_economy (guildId, userId, balance, lastDaily, lastWork, inventory, updatedAt) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        guildId,
        userId,
        eco.balance,
        eco.lastDaily || 0,
        eco.lastWork || 0,
        JSON.stringify(eco.inventory || []),
        new Date().toISOString()
      ]
    );
  } catch (err) {
    console.error('Failed to save user economy:', err);
  }
}

export const LevelingManifest: ModuleManifest = {
  id: 'leveling',
  name: 'Leveling & XP',
  version: '1.0.0',
  description: 'Activity tracking, message XP, and role rewards.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      return { progress: 100, errors: [] };
    }
  },
  commands: [
    {
      name: 'rank',
      description: 'Check your current level and XP.',
      options: [
        { name: 'user', type: 6, description: 'User to check', required: false }
      ]
    },
    { name: 'leaderboard', description: 'View the top active members in the server.' },
    { name: 'daily', description: 'Claim your daily reward' },
    { name: 'work', description: 'Work to earn coins' },
    { name: 'transfer', description: 'Transfer coins to another user', options: [{ name: 'user', type: 6, description: 'User to transfer to', required: true }, { name: 'amount', type: 4, description: 'Amount to transfer', required: true }] },
    { name: 'balance', description: 'Check your or another user\'s balance', options: [{ name: 'user', type: 6, description: 'User to check', required: false }] },
    { name: 'shop', description: 'View the server shop' },
    { name: 'inventory', description: 'View your inventory' },
    { name: 'rob', description: 'Attempt to rob a user', options: [{ name: 'user', type: 6, description: 'User to rob', required: true }] },
    { name: 'slots', description: 'Play the slot machine', options: [{ name: 'bet', type: 4, description: 'Amount to bet', required: true }] }
  ],
  events: [
    {
      name: 'messageCreate',
      handler: async (client: any, message: any, context: any) => {
        if (message.author.bot) return;
        const modules = context.getModulesState();
        const lvlMod = modules.find((m: any) => m.id === 'leveling');
        if (!lvlMod || lvlMod.status !== 'enabled') return;

        const guildId = message.guildId;
        if (!guildId) return;

        const currentXp = await getUserXP(guildId, message.author.id);
        const multiplier = parseFloat(lvlMod.config?.multiplier || '1.0');
        const xpGain = Math.floor((Math.floor(Math.random() * 10) + 15) * multiplier);
        
        const oldLevel = Math.floor(0.1 * Math.sqrt(currentXp));
        const newXp = currentXp + xpGain;
        const newLevel = Math.floor(0.1 * Math.sqrt(newXp));
        
        await saveUserXP(guildId, message.author.id, newXp);

        if (newLevel > oldLevel) {
          const channel = message.channel;

          const levelEmbed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('⭐ Level Up!')
            .setDescription(`> <@${message.author.id}> has\nadvanced to Level **${newLevel}**!`)
            .setThumbnail(message.author.displayAvatarURL({ size: 256 }))
            .addFields(
              { name: 'Member:', value: `<@${message.author.id}>\n(\`${message.author.username}\`)`, inline: false },
              { name: 'New Level:', value: `\`${newLevel}\``, inline: false },
              { name: 'Total XP:', value: `\`${newXp}\``, inline: false }
            )
            .setTimestamp();

          await channel.send({ embeds: [levelEmbed] }).catch(() => {});
          context.logSyncEvent(`Leveling: ${userTag(message.author)} leveled up to Lvl ${newLevel}.`, 'info');

          // Role Reward assignment (unchanged backend logic)
          const roleRewards = lvlMod.config?.roleRewards || {};
          const rewardRoleId = roleRewards[newLevel.toString()];
          if (rewardRoleId) {
            try {
              const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
              if (member && !member.roles.cache.has(rewardRoleId)) {
                await member.roles.add(rewardRoleId);
                context.logSyncEvent(`Leveling Reward: Assigned role <@&${rewardRoleId}> to ${userTag(message.author)} for Level ${newLevel}.`, 'success');
              }
            } catch (err) {
              console.error('Failed to assign role reward:', err);
            }
          }
        }
      }
    },
    {
      name: 'command_rank',
      handler: async (client: any, interaction: any, context: any) => {
        const target = interaction.options.getUser('user') || interaction.user;
        const guildId = interaction.guildId;
        if (!guildId) return;

        const xp = await getUserXP(guildId, target.id);
        const level = Math.floor(0.1 * Math.sqrt(xp));
        const nextLevelXp = Math.pow((level + 1) / 0.1, 2);
        const bar = progressBar(xp, nextLevelXp);

        const rankEmbed = new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle(`⭐ Level & XP Status — ${target.username}`)
          .setDescription(`> <@${target.id}>'s activity and ranking overview.`)
          .setThumbnail(target.displayAvatarURL({ size: 256 }))
          .addFields(
            { name: 'Member:', value: `<@${target.id}>\n(\`${target.username}\`)`, inline: false },
            { name: 'Current Level:', value: `\`${level}\``, inline: false },
            { name: 'Total XP:', value: `\`${fmt(xp)} / ${fmt(Math.floor(nextLevelXp))}\``, inline: false },
            { name: 'Progress:', value: bar, inline: false }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [rankEmbed] });
      }
    },
    {
      name: 'command_leaderboard',
      handler: async (client: any, interaction: any, context: any) => {
        const guildId = interaction.guildId;
        if (!guildId) return;

        const sorted = await getTopXP(guildId, 10);
        
        if (sorted.length === 0) {
          const lbEmptyEmbed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('🏆 Server Leaderboard')
            .setDescription('No XP data has been recorded for this server yet. Start chatting to earn XP!')
            .setTimestamp();
          return interaction.reply({ embeds: [lbEmptyEmbed] });
        }

        const medals = ['🥇', '🥈', '🥉'];
        const lines = sorted.map((item, i) => {
          const level = Math.floor(0.1 * Math.sqrt(item.xp));
          const medal = medals[i] ?? `**#${i + 1}**`;
          return `${medal} <@${item.userId}> — Level **${level}** (\`${fmt(item.xp)} XP\`)`;
        });

        const lbEmbed = new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle(`⭐ ${interaction.guild?.name ?? 'Server'} Leaderboard`)
          .setDescription(`> Top ${sorted.length} active members by XP\n\n` + lines.join('\n'))
          .setThumbnail(interaction.guild?.iconURL({ size: 256 }) ?? '')
          .setTimestamp();

        await interaction.reply({ embeds: [lbEmbed] });
      }
    },
    {
      name: 'command_balance',
      handler: async (client: any, interaction: any, context: any) => {
        const target = interaction.options.getUser('user') || interaction.user;
        const guildId = interaction.guildId;
        if (!guildId) return;

        const eco = await getUserEco(guildId, target.id);
        const { components, flags } = buildRichCard({
          emoji: '💰',
          title: `Wallet — ${target.username}`,
          accentColor: Colors.GOLD,
          thumbnailUrl: target.displayAvatarURL({ size: 256 }),
          fields: [
            { label: '💵 Balance', value: `**${fmt(eco.balance)}** coins` },
          ],
          footerNote: `Rage Optimiser Enterprise  •  ⭐ Leveling & Economy`,
        });

        await interaction.reply({ components, flags });
      }
    },
    {
      name: 'command_daily',
      handler: async (client: any, interaction: any, context: any) => {
        const guildId = interaction.guildId;
        if (!guildId) return;

        const eco = await getUserEco(guildId, interaction.user.id);
        const now = Date.now();
        const last = eco.lastDaily || 0;
        const diff = now - last;
        const cooldown = 24 * 60 * 60 * 1000;
        
        if (diff < cooldown) {
          const remaining = Math.ceil((cooldown - diff) / 3600000);
          const { components, flags } = buildStatusCard({
            emoji: '⏳',
            title: 'Daily Cooldown Active',
            body: `You've already claimed your daily reward today.\n\n**Next reward available:** ${ts(Math.floor((last + cooldown) / 1000))}`,
            accentColor: Colors.WARN,
          });
          return interaction.reply({ components, flags: MessageFlags.IsComponentsV2 });
        }
        
        eco.balance += 500;
        eco.lastDaily = now;
        await saveUserEco(guildId, interaction.user.id, eco);
        
        const { components, flags } = buildRichCard({
          emoji: '🎁',
          title: 'Daily Reward Claimed!',
          accentColor: Colors.SUCCESS,
          thumbnailUrl: interaction.user.displayAvatarURL({ size: 256 }),
          fields: [
            { label: '🎁 Reward',     value: '**500 coins**' },
            { label: '💰 New Balance', value: `**${fmt(eco.balance)}** coins` },
            { label: '⏰ Next Daily',  value: ts(Math.floor((now + cooldown) / 1000)) },
          ],
          footerNote: `Rage Optimiser Enterprise  •  ⭐ Leveling & Economy`,
        });

        await interaction.reply({ components, flags });
      }
    },
    {
      name: 'command_work',
      handler: async (client: any, interaction: any, context: any) => {
        const guildId = interaction.guildId;
        if (!guildId) return;

        const eco = await getUserEco(guildId, interaction.user.id);
        const now = Date.now();
        const last = eco.lastWork || 0;
        const cooldown = 60 * 60 * 1000; // 1 hour
        
        if (now - last < cooldown) {
          const remaining = Math.ceil((cooldown - (now - last)) / 60000);
          const { components, flags } = buildStatusCard({
            emoji: '⏳',
            title: 'Work Shift Cooldown',
            body: `You're currently resting after your work shift.\n\n**Back to work in:** \`${remaining} minutes\``,
            accentColor: Colors.WARN,
          });
          return interaction.reply({ components, flags: MessageFlags.IsComponentsV2 });
        }
        
        const earnings = Math.floor(Math.random() * 200) + 100; // 100 to 300
        eco.balance += earnings;
        eco.lastWork = now;
        await saveUserEco(guildId, interaction.user.id, eco);
        
        const { components, flags } = buildRichCard({
          emoji: '💼',
          title: 'Work Shift Completed!',
          accentColor: Colors.SUCCESS,
          fields: [
            { label: '💵 Earned',      value: `**${fmt(earnings)} coins**` },
            { label: '💰 New Balance', value: `**${fmt(eco.balance)} coins**` },
            { label: '⏰ Next Shift',  value: ts(Math.floor((now + cooldown) / 1000)) },
          ],
          footerNote: `Rage Optimiser Enterprise  •  ⭐ Leveling & Economy`,
        });

        await interaction.reply({ components, flags });
      }
    },
    {
      name: 'command_transfer',
      handler: async (client: any, interaction: any, context: any) => {
        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const guildId = interaction.guildId;
        if (!guildId) return;
        
        if (target.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot pay yourself.', flags: 64 });
        if (amount <= 0) return interaction.reply({ content: '❌ Amount must be greater than 0.', flags: 64 });
        
        const senderEco = await getUserEco(guildId, interaction.user.id);
        
        if (senderEco.balance < amount) {
          return interaction.reply({ content: `❌ Insufficient funds. Your balance: **${fmt(senderEco.balance)}** coins.`, flags: 64 });
        }
        
        const targetEco = await getUserEco(guildId, target.id);
        senderEco.balance -= amount;
        targetEco.balance += amount;

        await saveUserEco(guildId, interaction.user.id, senderEco);
        await saveUserEco(guildId, target.id, targetEco);
        
        const { components, flags } = buildRichCard({
          emoji: '💸',
          title: 'Transfer Successful',
          accentColor: Colors.SUCCESS,
          fields: [
            { label: '📤 Sent To',     value: `${target} (\`${target.username}\`)` },
            { label: '💵 Amount',      value: `**${fmt(amount)} coins**` },
            { label: '💰 Your Balance', value: `**${fmt(senderEco.balance)} coins**` },
          ],
          footerNote: `Rage Optimiser Enterprise  •  ⭐ Leveling & Economy`,
        });

        await interaction.reply({ components, flags });
      }
    },
    {
      name: 'command_shop',
      handler: async (client: any, interaction: any, context: any) => {
        const { components, flags } = buildListCard({
          emoji: '🛒',
          title: 'Server Shop',
          subtitle: 'Use /buy <item> to purchase (Coming soon)',
          entries: [
            '**1.** 👑 VIP Role — `10,000 coins`',
            '**2.** 🎨 Custom Name Color — `5,000 coins`',
            '**3.** 🎁 Mystery Box — `1,000 coins`',
          ],
          accentColor: Colors.MUSIC,
        });
        await interaction.reply({ components, flags });
      }
    },
    {
      name: 'command_inventory',
      handler: async (client: any, interaction: any, context: any) => {
        const guildId = interaction.guildId;
        if (!guildId) return;

        const eco = await getUserEco(guildId, interaction.user.id);
        const inv = eco.inventory || [];
        
        const entries = inv.length > 0
          ? inv.map((item, i) => `**${i + 1}.** ${item}`)
          : ['*Your inventory is empty. Visit the shop to get started!*'];

        const { components, flags } = buildListCard({
          emoji: '🎒',
          title: `Inventory — ${interaction.user.username}`,
          subtitle: `${inv.length} item(s) owned`,
          entries,
          accentColor: Colors.MUSIC,
          thumbnailUrl: interaction.user.displayAvatarURL({ size: 256 }),
        });

        await interaction.reply({ components, flags });
      }
    },
    {
      name: 'command_rob',
      handler: async (client: any, interaction: any, context: any) => {
        const target = interaction.options.getUser('user');
        const guildId = interaction.guildId;
        if (!guildId) return;

        if (target.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot rob yourself.', flags: 64 });
        
        const myEco = await getUserEco(guildId, interaction.user.id);
        const targetEco = await getUserEco(guildId, target.id);
        
        if (myEco.balance < 500) return interaction.reply({ content: '❌ You need at least **500 coins** to attempt a robbery.', flags: 64 });
        if (targetEco.balance < 100) return interaction.reply({ content: `❌ **${target.username}** is too broke to rob.`, flags: 64 });
        
        const success = Math.random() > 0.6; // 40% chance
        
        if (success) {
          const stolen = Math.floor(targetEco.balance * 0.2);
          myEco.balance += stolen;
          targetEco.balance -= stolen;
          await saveUserEco(guildId, interaction.user.id, myEco);
          await saveUserEco(guildId, target.id, targetEco);

          const { components, flags } = buildRichCard({
            emoji: '🥷',
            title: 'Heist Successful!',
            accentColor: Colors.SUCCESS,
            fields: [
              { label: '🎯 Target',      value: `${target} (\`${target.username}\`)` },
              { label: '💰 Stolen',      value: `**${fmt(stolen)} coins**` },
              { label: '💵 Your Balance', value: `**${fmt(myEco.balance)} coins**` },
            ],
            footerNote: `Rage Optimiser Enterprise  •  ⭐ Leveling & Economy`,
          });
          await interaction.reply({ components, flags });
        } else {
          const fine = 500;
          myEco.balance -= fine;
          await saveUserEco(guildId, interaction.user.id, myEco);

          const { components, flags } = buildRichCard({
            emoji: '🚓',
            title: 'Caught Red-Handed!',
            description: `You were caught attempting to rob **${target.username}** and fined by the authorities.`,
            accentColor: Colors.DANGER,
            fields: [
              { label: '⚖️ Fine Paid',   value: `**${fmt(fine)} coins**` },
              { label: '💰 New Balance', value: `**${fmt(myEco.balance)} coins**` },
            ],
            footerNote: `Rage Optimiser Enterprise  •  ⭐ Leveling & Economy`,
          });
          await interaction.reply({ components, flags });
        }
      }
    },
    {
      name: 'command_slots',
      handler: async (client: any, interaction: any, context: any) => {
        const bet = interaction.options.getInteger('bet');
        const guildId = interaction.guildId;
        if (!guildId) return;

        if (bet <= 0) return interaction.reply({ content: '❌ Bet must be greater than 0.', flags: 64 });
        
        const eco = await getUserEco(guildId, interaction.user.id);
        
        if (eco.balance < bet) return interaction.reply({ content: `❌ Insufficient funds. Balance: **${fmt(eco.balance)} coins**.`, flags: 64 });
        
        eco.balance -= bet;
        
        const symbols = ['🍒', '🍋', '🍇', '💎', '🔔', '7️⃣'];
        const s1 = symbols[Math.floor(Math.random() * symbols.length)];
        const s2 = symbols[Math.floor(Math.random() * symbols.length)];
        const s3 = symbols[Math.floor(Math.random() * symbols.length)];
        
        let win = 0;
        let resultText = '';
        let accentColor: number = Colors.DANGER;

        if (s1 === s2 && s2 === s3) {
          win = bet * 10;
          resultText = `🎉 **JACKPOT!** You won **${fmt(win)} coins**!`;
          accentColor = Colors.GOLD;
        } else if (s1 === s2 || s2 === s3 || s1 === s3) {
          win = bet * 2;
          resultText = `👏 **Mini-Win!** You won **${fmt(win)} coins**!`;
          accentColor = Colors.SUCCESS;
        } else {
          resultText = `😢 **No Match.** Better luck next time!`;
        }
        
        eco.balance += win;
        await saveUserEco(guildId, interaction.user.id, eco);
        
        const { components, flags } = buildRichCard({
          emoji: '🎰',
          title: 'Slot Machine',
          description: `## ${s1}  ${s2}  ${s3}\n\n${resultText}`,
          accentColor,
          fields: [
            { label: '🎲 Bet',        value: `**${fmt(bet)} coins**` },
            { label: '💵 Net',        value: win > 0 ? `**+${fmt(win - bet)} coins**` : `**-${fmt(bet)} coins**` },
            { label: '💰 Balance',    value: `**${fmt(eco.balance)} coins**` },
          ],
          footerNote: `Rage Optimiser Enterprise  •  ⭐ Leveling & Economy`,
        });
          
        await interaction.reply({ components, flags });
      }
    }
  ],
  routes: [
    {
      path: '/state',
      method: 'get',
      handler: async (req: any, res: any, context: any) => {
        const modules = context.getModulesState();
        const lvlMod = modules.find((m: any) => m.id === 'leveling');
        const roleRewards = lvlMod?.config?.roleRewards || {};
        const multiplier = lvlMod?.config?.multiplier || '1.0';

        const client = context.client;
        const leaderboard = [];
        const sorted = await getTopXP(context.guildId, 50);

        for (const item of sorted) {
          let username = `User_${item.userId.substring(0, 5)}`;
          let avatar = null;

          if (client) {
            try {
              const user = await client.users.fetch(item.userId).catch(() => null);
              if (user) {
                username = user.username;
                avatar = user.displayAvatarURL ? user.displayAvatarURL() : null;
              }
            } catch {}
          }

          const level = Math.floor(0.1 * Math.sqrt(item.xp));
          leaderboard.push({
            userId: item.userId,
            username,
            avatar,
            xp: item.xp,
            level
          });
        }

        res.json({
          leaderboard,
          multiplier,
          roleRewards
        });
      }
    },
    {
      path: '/update',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        const { multiplier, roleRewards } = req.body;
        context.updateModuleConfig('leveling', { multiplier, roleRewards });
        context.logSyncEvent(`Leveling: Settings updated from dashboard.`, 'success');
        res.json({ success: true, multiplier, roleRewards });
      }
    },
    {
      path: '/reset',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        await resetAllXP(context.guildId);
        context.logSyncEvent(`Leveling: Leveling and XP database has been reset.`, 'warn');
        res.json({ success: true, leaderboard: [] });
      }
    }
  ]
};
