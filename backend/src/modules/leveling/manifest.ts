import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { EmbedBuilder } from 'discord.js';
import { Database } from '../../core/Database.js';

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
            .setTitle('⭐ Level Up!')
            .setDescription(`> ${message.author} has advanced to Level **${newLevel}**!\n\n**Member**: ${message.author} (\`${message.author.username}\`)\n**New Level**: \`${newLevel}\`\n**Total XP**: \`${newXp}\``)
            .setColor('#10b981')
            .setThumbnail(message.author.displayAvatarURL({ size: 256 }) || null)
            .setTimestamp();
          await channel.send({ embeds: [levelEmbed] }).catch(() => {});
          context.logSyncEvent(`Leveling: ${userTag(message.author)} leveled up to Lvl ${newLevel}.`, 'info');

          // Role Reward assignment
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
        
        const rankEmbed = new EmbedBuilder()
          .setTitle(`📊 Rank & Progress — ${target.username}`)
          .setThumbnail(target.displayAvatarURL({ size: 256 }) || null)
          .setDescription(`> **Member**: ${target} (\`${target.username}\`)\n\n**Current Level**: \`${level}\`\n**Current XP**: \`${xp} / ${nextLevelXp}\``)
          .setColor('#3b82f6')
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
          const emptyEmbed = new EmbedBuilder()
            .setTitle('🏆 Server Level Leaderboard')
            .setDescription('> No XP data recorded for this server yet.')
            .setColor('#f59e0b');
          return interaction.reply({ embeds: [emptyEmbed], flags: 64 });
        }

        const lines = [];
        for (let i = 0; i < sorted.length; i++) {
          const item = sorted[i];
          const level = Math.floor(0.1 * Math.sqrt(item.xp));
          lines.push(`**#${i+1}** <@${item.userId}> — Level **${level}** (\`${item.xp} XP\`)`);
        }

        const lbEmbed = new EmbedBuilder()
          .setTitle('🏆 Server Level Leaderboard')
          .setThumbnail(interaction.guild?.iconURL({ size: 256 }) || null)
          .setDescription(`> Top active members in **${interaction.guild?.name || 'Server'}**:\n\n${lines.join('\n')}`)
          .setColor('#f59e0b')
          .setFooter({ text: `${interaction.guild?.name} • XP Leaderboard` })
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
        const balEmbed = new EmbedBuilder()
          .setTitle(`💰 Balance — ${target.username}`)
          .setThumbnail(target.displayAvatarURL({ size: 256 }) || null)
          .setDescription(`> **User**: ${target} (\`${target.username}\`)\n\n**Wallet Balance**: \`${eco.balance.toLocaleString()}\` coins`)
          .setColor('#f59e0b')
          .setTimestamp();

        await interaction.reply({ embeds: [balEmbed] });
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
          const cdEmbed = new EmbedBuilder()
            .setTitle('⏳ Daily Cooldown Active')
            .setDescription(`> You have already claimed your daily reward today.\n\n**Cooldown Remaining**: \`${remaining} hours\``)
            .setColor('#f59e0b');
          return interaction.reply({ embeds: [cdEmbed], flags: 64 });
        }
        
        eco.balance += 500;
        eco.lastDaily = now;
        await saveUserEco(guildId, interaction.user.id, eco);
        
        const dailyEmbed = new EmbedBuilder()
          .setTitle('🎁 Daily Reward Claimed')
          .setDescription(`> You claimed your daily reward of **500 coins**!\n\n**New Balance**: \`${eco.balance.toLocaleString()}\` coins`)
          .setColor('#10b981')
          .setTimestamp();

        await interaction.reply({ embeds: [dailyEmbed] });
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
          const cdEmbed = new EmbedBuilder()
            .setTitle('⏳ Work Shift Cooldown')
            .setDescription(`> You are currently resting after your work shift.\n\n**Cooldown Remaining**: \`${remaining} minutes\``)
            .setColor('#f59e0b');
          return interaction.reply({ embeds: [cdEmbed], flags: 64 });
        }
        
        const earnings = Math.floor(Math.random() * 200) + 100; // 100 to 300
        eco.balance += earnings;
        eco.lastWork = now;
        await saveUserEco(guildId, interaction.user.id, eco);
        
        const workEmbed = new EmbedBuilder()
          .setTitle('💼 Work Shift Completed')
          .setDescription(`> You worked hard and earned **${earnings} coins**!\n\n**New Balance**: \`${eco.balance.toLocaleString()}\` coins`)
          .setColor('#10b981')
          .setTimestamp();

        await interaction.reply({ embeds: [workEmbed] });
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
          return interaction.reply({ content: `❌ You do not have enough coins. Your balance is **${senderEco.balance}**.`, flags: 64 });
        }
        
        const targetEco = await getUserEco(guildId, target.id);
        
        senderEco.balance -= amount;
        targetEco.balance += amount;

        await saveUserEco(guildId, interaction.user.id, senderEco);
        await saveUserEco(guildId, target.id, targetEco);
        
        const payEmbed = new EmbedBuilder()
          .setTitle('💸 Coin Transfer Successful')
          .setDescription(`> Successfully transferred **${amount} coins** to ${target}.\n\n**Recipient**: ${target} (\`${target.username}\`)\n**Amount Transferred**: \`${amount}\` coins`)
          .setColor('#10b981')
          .setTimestamp();

        await interaction.reply({ embeds: [payEmbed] });
      }
    },
    {
      name: 'command_shop',
      handler: async (client: any, interaction: any, context: any) => {
        const embed = new EmbedBuilder()
          .setTitle('🛒 Server Shop')
          .setDescription('Use `/buy <item>` to purchase (Coming soon).')
          .addFields(
            { name: '1. VIP Role', value: '10,000 coins', inline: true },
            { name: '2. Custom Name Color', value: '5,000 coins', inline: true },
            { name: '3. Mystery Box', value: '1,000 coins', inline: true }
          )
          .setColor('#9b59b6');
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_inventory',
      handler: async (client: any, interaction: any, context: any) => {
        const guildId = interaction.guildId;
        if (!guildId) return;

        const eco = await getUserEco(guildId, interaction.user.id);
        const inv = eco.inventory || [];
        
        if (inv.length === 0) {
          const emptyEmbed = new EmbedBuilder()
            .setTitle(`🎒 Inventory — ${interaction.user.username}`)
            .setDescription('> Your inventory is currently empty.')
            .setColor('#8b5cf6');
          return interaction.reply({ embeds: [emptyEmbed] });
        }
        
        const invEmbed = new EmbedBuilder()
          .setTitle(`🎒 Inventory — ${interaction.user.username}`)
          .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }) || null)
          .setDescription(`> **Member**: ${interaction.user}\n\n**Owned Items**:\n- ${inv.join('\n- ')}`)
          .setColor('#8b5cf6')
          .setTimestamp();

        await interaction.reply({ embeds: [invEmbed] });
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
        
        if (myEco.balance < 500) return interaction.reply({ content: '❌ You need at least 500 coins to attempt a robbery.', flags: 64 });
        if (targetEco.balance < 100) return interaction.reply({ content: `❌ ${target.username} is too poor to rob.`, flags: 64 });
        
        const success = Math.random() > 0.6; // 40% chance of success
        
        if (success) {
          const stolen = Math.floor(targetEco.balance * 0.2); // Steal 20%
          myEco.balance += stolen;
          targetEco.balance -= stolen;
          await saveUserEco(guildId, interaction.user.id, myEco);
          await saveUserEco(guildId, target.id, targetEco);

          const robEmbed = new EmbedBuilder()
            .setTitle('🥷 Robbery Successful')
            .setDescription(`> You successfully robbed ${target} and got away with **${stolen} coins**!\n\n**New Balance**: \`${myEco.balance.toLocaleString()}\` coins`)
            .setColor('#10b981')
            .setTimestamp();
          await interaction.reply({ embeds: [robEmbed] });
        } else {
          const fine = 500;
          myEco.balance -= fine;
          await saveUserEco(guildId, interaction.user.id, myEco);

          const failEmbed = new EmbedBuilder()
            .setTitle('🚓 Robbery Failed')
            .setDescription(`> You were caught attempting to rob ${target} and paid a fine of **${fine} coins**.\n\n**New Balance**: \`${myEco.balance.toLocaleString()}\` coins`)
            .setColor('#ef4444')
            .setTimestamp();
          await interaction.reply({ embeds: [failEmbed] });
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
        
        if (eco.balance < bet) return interaction.reply({ content: `❌ You do not have enough coins. Your balance is **${eco.balance}**.`, flags: 64 });
        
        eco.balance -= bet;
        
        const symbols = ['🍒', '🍋', '🍇', '💎', '🔔', '7️⃣'];
        const s1 = symbols[Math.floor(Math.random() * symbols.length)];
        const s2 = symbols[Math.floor(Math.random() * symbols.length)];
        const s3 = symbols[Math.floor(Math.random() * symbols.length)];
        
        let win = 0;
        let msg = '';
        if (s1 === s2 && s2 === s3) {
          win = bet * 10;
          msg = `🎉 **JACKPOT!** You won **${win} coins**!`;
        } else if (s1 === s2 || s2 === s3 || s1 === s3) {
          win = bet * 2;
          msg = `👏 **Mini-win!** You won **${win} coins**!`;
        } else {
          msg = `😢 **You lost.** Better luck next time.`;
        }
        
        eco.balance += win;
        await saveUserEco(guildId, interaction.user.id, eco);
        
        const embed = new EmbedBuilder()
          .setTitle('🎰 Slots')
          .setDescription(`**[ ${s1} | ${s2} | ${s3} ]**\n\n${msg}\n\n*New Balance: ${eco.balance}*`)
          .setColor(win > 0 ? '#2ecc71' : '#e74c3c');
          
        await interaction.reply({ embeds: [embed] });
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
