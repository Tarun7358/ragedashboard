import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';

const XP_FILE = path.join(process.cwd(), 'src', 'xp.json');
const ECO_FILE = path.join(process.cwd(), 'src', 'economy.json');

function loadXP(): Record<string, number> {
  try {
    if (fs.existsSync(XP_FILE)) return JSON.parse(fs.readFileSync(XP_FILE, 'utf-8'));
  } catch {}
  return {};
}

function saveXP(data: Record<string, number>) {
  try { fs.writeFileSync(XP_FILE, JSON.stringify(data, null, 2)); } catch {}
}

interface EcoUser {
  balance: number;
  lastDaily?: number;
  lastWork?: number;
  inventory?: string[];
}

function loadEco(): Record<string, EcoUser> {
  try {
    if (fs.existsSync(ECO_FILE)) return JSON.parse(fs.readFileSync(ECO_FILE, 'utf-8'));
  } catch {}
  return {};
}

function saveEco(data: Record<string, EcoUser>) {
  try { fs.writeFileSync(ECO_FILE, JSON.stringify(data, null, 2)); } catch {}
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
    { name: 'pay', description: 'Pay another user', options: [{ name: 'user', type: 6, description: 'User to pay', required: true }, { name: 'amount', type: 4, description: 'Amount to pay', required: true }] },
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

        const xpData = loadXP();
        const currentXp = xpData[message.author.id] || 0;
        const xpGain = Math.floor(Math.random() * 10) + 15; // 15-25 XP per message
        
        const oldLevel = Math.floor(0.1 * Math.sqrt(currentXp));
        const newXp = currentXp + xpGain;
        const newLevel = Math.floor(0.1 * Math.sqrt(newXp));
        
        xpData[message.author.id] = newXp;
        saveXP(xpData);

        if (newLevel > oldLevel) {
          const channel = message.channel;
          await channel.send(`🎉 **Level Up!** ${message.author} has reached Level **${newLevel}**!`).catch(() => {});
          context.logSyncEvent(`Leveling: ${message.author.tag} leveled up to Lvl ${newLevel}.`, 'info');
        }
      }
    },
    {
      name: 'command_rank',
      handler: async (client: any, interaction: any, context: any) => {
        const target = interaction.options.getUser('user') || interaction.user;
        const xpData = loadXP();
        const xp = xpData[target.id] || 0;
        const level = Math.floor(0.1 * Math.sqrt(xp));
        const nextLevelXp = Math.pow((level + 1) / 0.1, 2);
        
        await interaction.reply({
          content: `📊 **Rank for ${target.username}**\n- **Level**: \`${level}\`\n- **XP**: \`${xp} / ${nextLevelXp}\``
        });
      }
    },
    {
      name: 'command_leaderboard',
      handler: async (client: any, interaction: any, context: any) => {
        const xpData = loadXP();
        const sorted = Object.entries(xpData).sort((a, b) => b[1] - a[1]).slice(0, 10);
        
        if (sorted.length === 0) {
          return interaction.reply({ content: 'No XP data yet.', flags: 64 });
        }

        const lines = ['🏆 **Server Leaderboard**'];
        for (let i = 0; i < sorted.length; i++) {
          const [id, xp] = sorted[i];
          const level = Math.floor(0.1 * Math.sqrt(xp));
          lines.push(`**#${i+1}** <@${id}> — Level **${level}** (${xp} XP)`);
        }

        await interaction.reply({ content: lines.join('\n') });
      }
    },
    {
      name: 'command_balance',
      handler: async (client: any, interaction: any, context: any) => {
        const target = interaction.options.getUser('user') || interaction.user;
        const eco = loadEco();
        const bal = eco[target.id]?.balance || 0;
        await interaction.reply(`💰 **${target.username}** has **${bal}** coins.`);
      }
    },
    {
      name: 'command_daily',
      handler: async (client: any, interaction: any, context: any) => {
        const eco = loadEco();
        if (!eco[interaction.user.id]) eco[interaction.user.id] = { balance: 0 };
        
        const now = Date.now();
        const last = eco[interaction.user.id].lastDaily || 0;
        const diff = now - last;
        const cooldown = 24 * 60 * 60 * 1000;
        
        if (diff < cooldown) {
          const remaining = Math.ceil((cooldown - diff) / 3600000);
          return interaction.reply({ content: `⏳ You already claimed your daily! Come back in **${remaining} hours**.`, flags: 64 });
        }
        
        eco[interaction.user.id].balance += 500;
        eco[interaction.user.id].lastDaily = now;
        saveEco(eco);
        
        await interaction.reply(`🎉 You claimed your daily reward of **500 coins**! Your new balance is **${eco[interaction.user.id].balance}** coins.`);
      }
    },
    {
      name: 'command_work',
      handler: async (client: any, interaction: any, context: any) => {
        const eco = loadEco();
        if (!eco[interaction.user.id]) eco[interaction.user.id] = { balance: 0 };
        
        const now = Date.now();
        const last = eco[interaction.user.id].lastWork || 0;
        const cooldown = 60 * 60 * 1000; // 1 hour
        
        if (now - last < cooldown) {
          const remaining = Math.ceil((cooldown - (now - last)) / 60000);
          return interaction.reply({ content: `⏳ You are too tired to work! Come back in **${remaining} minutes**.`, flags: 64 });
        }
        
        const earnings = Math.floor(Math.random() * 200) + 100; // 100 to 300
        eco[interaction.user.id].balance += earnings;
        eco[interaction.user.id].lastWork = now;
        saveEco(eco);
        
        await interaction.reply(`💼 You worked hard and earned **${earnings} coins**! New balance: **${eco[interaction.user.id].balance}**`);
      }
    },
    {
      name: 'command_pay',
      handler: async (client: any, interaction: any, context: any) => {
        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        
        if (target.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot pay yourself.', flags: 64 });
        if (amount <= 0) return interaction.reply({ content: '❌ Amount must be greater than 0.', flags: 64 });
        
        const eco = loadEco();
        const senderBal = eco[interaction.user.id]?.balance || 0;
        
        if (senderBal < amount) {
          return interaction.reply({ content: `❌ You do not have enough coins. Your balance is **${senderBal}**.`, flags: 64 });
        }
        
        if (!eco[target.id]) eco[target.id] = { balance: 0 };
        
        eco[interaction.user.id].balance -= amount;
        eco[target.id].balance += amount;
        saveEco(eco);
        
        await interaction.reply(`💸 You paid **${amount} coins** to ${target.username}.`);
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
        const eco = loadEco();
        const inv = eco[interaction.user.id]?.inventory || [];
        
        if (inv.length === 0) {
          return interaction.reply(`🎒 ${interaction.user.username}'s inventory is empty.`);
        }
        
        await interaction.reply(`🎒 **${interaction.user.username}'s Inventory**:\n- ${inv.join('\n- ')}`);
      }
    },
    {
      name: 'command_rob',
      handler: async (client: any, interaction: any, context: any) => {
        const target = interaction.options.getUser('user');
        if (target.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot rob yourself.', flags: 64 });
        
        const eco = loadEco();
        const myBal = eco[interaction.user.id]?.balance || 0;
        const targetBal = eco[target.id]?.balance || 0;
        
        if (myBal < 500) return interaction.reply({ content: '❌ You need at least 500 coins to attempt a robbery.', flags: 64 });
        if (targetBal < 100) return interaction.reply({ content: `❌ ${target.username} is too poor to rob.`, flags: 64 });
        
        const success = Math.random() > 0.6; // 40% chance of success
        
        if (success) {
          const stolen = Math.floor(targetBal * 0.2); // Steal 20%
          eco[interaction.user.id].balance += stolen;
          eco[target.id].balance -= stolen;
          saveEco(eco);
          await interaction.reply(`🥷 **Success!** You successfully robbed ${target.username} and got away with **${stolen} coins**!`);
        } else {
          const fine = 500;
          eco[interaction.user.id].balance -= fine;
          saveEco(eco);
          await interaction.reply(`🚓 **Busted!** You were caught trying to rob ${target.username} and paid a fine of **${fine} coins**.`);
        }
      }
    },
    {
      name: 'command_slots',
      handler: async (client: any, interaction: any, context: any) => {
        const bet = interaction.options.getInteger('bet');
        if (bet <= 0) return interaction.reply({ content: '❌ Bet must be greater than 0.', flags: 64 });
        
        const eco = loadEco();
        const myBal = eco[interaction.user.id]?.balance || 0;
        
        if (myBal < bet) return interaction.reply({ content: `❌ You do not have enough coins. Your balance is **${myBal}**.`, flags: 64 });
        
        eco[interaction.user.id].balance -= bet;
        
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
        
        eco[interaction.user.id].balance += win;
        saveEco(eco);
        
        const embed = new EmbedBuilder()
          .setTitle('🎰 Slots')
          .setDescription(`**[ ${s1} | ${s2} | ${s3} ]**\n\n${msg}\n\n*New Balance: ${eco[interaction.user.id].balance}*`)
          .setColor(win > 0 ? '#2ecc71' : '#e74c3c');
          
        await interaction.reply({ embeds: [embed] });
      }
    }
  ]
};
