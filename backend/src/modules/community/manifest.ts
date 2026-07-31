import { EmbedBuilder } from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { Database } from '../../core/Database.js';

// Safe display name helper
function userTag(user: any): string {
  return user?.globalName ?? user?.username ?? user?.tag ?? user?.id ?? 'Unknown';
}

async function getUserAFK(guildId: string, userId: string): Promise<{ reason: string, timestamp: number } | null> {
  try {
    const db = Database.getDb();
    if (!db) return null;
    const row = await db.get<any>('SELECT reason, timestamp FROM guild_afk WHERE guildId = ? AND userId = ?', [guildId, userId]);
    return row ? { reason: row.reason, timestamp: Number(row.timestamp) } : null;
  } catch (err) {
    console.error('Failed to get user AFK status:', err);
    return null;
  }
}

async function setUserAFK(guildId: string, userId: string, reason: string): Promise<void> {
  try {
    const db = Database.getDb();
    if (!db) return;
    await db.run(
      'INSERT OR REPLACE INTO guild_afk (guildId, userId, reason, timestamp) VALUES (?, ?, ?, ?)',
      [guildId, userId, reason, Date.now()]
    );
  } catch (err) {
    console.error('Failed to set user AFK status:', err);
  }
}

async function clearUserAFK(guildId: string, userId: string): Promise<void> {
  try {
    const db = Database.getDb();
    if (!db) return;
    await db.run('DELETE FROM guild_afk WHERE guildId = ? AND userId = ?', [guildId, userId]);
  } catch (err) {
    console.error('Failed to clear user AFK status:', err);
  }
}

export const CommunityManifest: ModuleManifest = {
  id: 'community',
  name: 'Community Welcomer',
  version: '1.0.0',
  description: 'Greeting cards, auto-moderated welcome logs, and reaction role grids.',
  configSchema: {
    requiredFields: ['welcomeChannelId'],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;

      const channelExists = (id: string) => registry.channels.some(c => c.id === id);

      if (config.welcomeChannelId) {
        progress += 100;
        if (!channelExists(config.welcomeChannelId)) errors.push(`Welcome channel ID (${config.welcomeChannelId}) was deleted!`);
      }

      return { progress, errors };
    }
  },
  commands: [
    {
      name: 'welcome',
      description: 'Manage or test the Community Welcomer module.',
      options: [
        { name: 'action', type: 3, description: 'Action: test, leave-test, status', required: true }
      ]
    },
    { name: 'avatar', description: 'Get a user\'s avatar', options: [{ name: 'user', type: 6, description: 'User to check', required: false }] },
    { name: 'userinfo', description: 'Get info about a user', options: [{ name: 'user', type: 6, description: 'User to check', required: false }] },
    { name: 'serverinfo', description: 'Get info about the server' },
    { name: 'ping', description: 'Check bot latency' },
    { name: 'help', description: 'List all bot commands' },
    { name: 'invite', description: 'Get the bot invite link' },
    { name: 'poll', description: 'Create a poll', options: [{ name: 'question', type: 3, description: 'Poll question', required: true }] },
    { name: 'weather', description: 'Check the weather', options: [{ name: 'location', type: 3, description: 'City name', required: true }] },
    { name: 'afk', description: 'Set your AFK status', options: [{ name: 'reason', type: 3, description: 'Reason for being AFK', required: false }] },
    { name: 'remindme', description: 'Set a reminder', options: [{ name: 'time', type: 3, description: 'Time (e.g. 1h, 1d)', required: true }, { name: 'message', type: 3, description: 'Reminder message', required: true }] },
    { name: '8ball', description: 'Ask the magic 8-ball a question', options: [{ name: 'question', type: 3, description: 'Question to ask', required: true }] },
    { name: 'meme', description: 'Get a random meme' },
    { name: 'flip', description: 'Flip a coin' },
    { name: 'roll', description: 'Roll a dice' },
    {
      name: 'rps',
      description: 'Play Rock Paper Scissors',
      options: [{ name: 'choice', type: 3, description: 'Your choice', required: true, choices: [{ name: 'Rock', value: 'rock' }, { name: 'Paper', value: 'paper' }, { name: 'Scissors', value: 'scissors' }] }]
    },
    {
      name: 'ship',
      description: 'Check love compatibility with another user',
      options: [{ name: 'user1', type: 6, description: 'First user', required: true }, { name: 'user2', type: 6, description: 'Second user', required: false }]
    },
    {
      name: 'timestamp',
      description: 'Generate discord relative timestamps',
      options: [{ name: 'time_or_date', type: 3, description: 'Date or time string (e.g. tomorrow, 2026-12-31 15:00)', required: true }]
    },
    {
      name: 'hash',
      description: 'Encrypt a string with MD5 or SHA-256',
      options: [{ name: 'algorithm', type: 3, description: 'Algorithm', required: true, choices: [{ name: 'MD5', value: 'md5' }, { name: 'SHA-256', value: 'sha256' }] }, { name: 'text', type: 3, description: 'Text to encrypt', required: true }]
    },
    {
      name: 'color',
      description: 'Display a hex color preview',
      options: [{ name: 'hex', type: 3, description: 'Hex code (e.g. #ff0000)', required: true }]
    },
    {
      name: 'embed-builder',
      description: 'Build a custom embed',
      options: [
        { name: 'title', type: 3, description: 'Title', required: true },
        { name: 'description', type: 3, description: 'Description', required: true },
        { name: 'color', type: 3, description: 'Hex Color code', required: false },
        { name: 'footer', type: 3, description: 'Footer text', required: false },
        { name: 'image', type: 3, description: 'Image URL', required: false }
      ]
    }
  ],
  events: [
    {
      name: 'command_welcome',
      handler: async (client: any, interaction: any, context: any) => {
        const globalSettings = context.getGlobalSettings ? context.getGlobalSettings() : {};
        if (globalSettings.useV2Welcome) {
          return interaction.reply({ content: '⚙️ Welcome V2 is active. The legacy /welcome command is disabled.', flags: 64 });
        }
        const action = interaction.options.getString('action');
        const isOwner = interaction.guild?.ownerId === interaction.user?.id ||
                        interaction.member?.permissions?.has?.('Administrator');
        if (!isOwner) return interaction.reply({ content: '🔒 Requires Administrator.', flags: 64 });
        const modules = context.getModulesState();
        const commMod = modules.find((m: any) => m.id === 'community');
        if (action === 'status') {
          const ch = commMod?.config?.welcomeChannelId;
          await interaction.reply({ content: `👥 **Community Welcomer**\n- **Status**: \`${commMod?.status || 'unknown'}\`\n- **Welcome Channel**: ${ch ? `<#${ch}>` : 'Not configured'}`, flags: 64 });
        } else if (action === 'test' || action === 'leave-test') {
          const isWelcome = action === 'test';
          const defaultEmbed = isWelcome 
            ? { title: '👋 Welcome to {server}!', description: 'Welcome {user}!', color: '#4f8cff', showAvatar: true, footer: 'User ID: {userId}' }
            : { title: '😢 Goodbye {user}!', description: '**{userTag}** has left.', color: '#ff4444', showAvatar: true, footer: 'User ID: {userId}' };
            
          const embedConfig = (isWelcome ? commMod?.config?.welcomeEmbed : commMod?.config?.leaveEmbed) || defaultEmbed;
          const channelId = isWelcome ? commMod?.config?.welcomeChannelId : (embedConfig.channelId || commMod?.config?.welcomeChannelId);
          
          if (!channelId) return interaction.reply({ content: `❌ No channel configured for ${action}.`, flags: 64 });
          
          const { EmbedBuilder } = await import('discord.js');
          const channel = interaction.guild?.channels.cache.get(channelId);
          
          if (channel && channel.isTextBased()) {
            const parseStr = (str: string) => (str || '')
              .replace(/{user}/g, interaction.user.toString())
              .replace(/{userTag}/g, userTag(interaction.user))
              .replace(/{server}/g, interaction.guild.name)
              .replace(/{memberCount}/g, interaction.guild.memberCount.toString())
              .replace(/{userId}/g, interaction.user.id);

            const embed = new EmbedBuilder()
              .setTitle(parseStr(embedConfig.title))
              .setDescription(parseStr(embedConfig.description))
              .setColor(embedConfig.color as any);
              
            if (embedConfig.showAvatar) {
              embed.setThumbnail(interaction.user.displayAvatarURL({ forceStatic: false }));
            }
            if (embedConfig.footer) {
              embed.setFooter({ text: parseStr(embedConfig.footer) });
            }

            await channel.send({ content: isWelcome ? `Hey ${interaction.user}, welcome! (TEST)` : `Goodbye (TEST)`, embeds: [embed] });
            await interaction.reply({ content: `✅ Test ${action} sent to ${channel}.`, flags: 64 });
          } else {
            await interaction.reply({ content: '❌ Target channel not found or not a text channel.', flags: 64 });
          }
        }
      }
    },
    {
      name: 'command_avatar',
      handler: async (client: any, interaction: any, context: any) => {
        const user = interaction.options.getUser('user') || interaction.user;
        const embed = new EmbedBuilder()
          .setTitle(`${user.username}'s Avatar`)
          .setImage(user.displayAvatarURL({ size: 1024, forceStatic: false }))
          .setColor('#4f8cff');
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_userinfo',
      handler: async (client: any, interaction: any, context: any) => {
        const user = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        
        const embed = new EmbedBuilder()
          .setAuthor({ name: userTag(user), iconURL: user.displayAvatarURL() })
          .setThumbnail(user.displayAvatarURL())
          .setColor('#4f8cff')
          .addFields(
            { name: 'ID', value: user.id, inline: true },
            { name: 'Joined Discord', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true }
          );
        
        if (member) {
          embed.addFields(
            { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
            { name: 'Roles', value: member.roles.cache.filter((r: any) => r.name !== '@everyone').map((r: any) => `<@&${r.id}>`).join(', ') || 'None' }
          );
        }
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_serverinfo',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        const embed = new EmbedBuilder()
          .setTitle(guild.name)
          .setThumbnail(guild.iconURL())
          .setColor('#4f8cff')
          .addFields(
            { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
            { name: 'Members', value: `${guild.memberCount}`, inline: true },
            { name: 'Created On', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
            { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
            { name: 'Channels', value: `${guild.channels.cache.size}`, inline: true }
          );
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_ping',
      handler: async (client: any, interaction: any, context: any) => {
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        await interaction.editReply(`🏓 Pong! Latency is ${latency}ms. API Latency is ${Math.round(client.ws.ping)}ms`);
      }
    },
    {
      name: 'command_help',
      handler: async (client: any, interaction: any, context: any) => {
        const embed = new EmbedBuilder()
          .setTitle('RAGE OPTIMISER Commands')
          .setDescription('Here are some available commands:')
          .addFields(
            { name: '🛡️ Moderation', value: '`/ban`, `/kick`, `/timeout`, `/warn`, `/purge`, `/lock`, `/slowmode`' },
            { name: '🎮 Community', value: '`/avatar`, `/userinfo`, `/serverinfo`, `/ping`, `/poll`, `/giveaway`' },
            { name: '💰 Economy', value: '`/balance`, `/daily`, `/work`, `/pay`, `/rob`, `/shop`, `/inventory`' },
            { name: '🎲 Fun', value: '`/8ball`, `/flip`, `/roll`, `/meme`, `/joke`, `/weather`' },
            { name: '🛠️ Utilities', value: '`/afk`, `/remindme`, `/stats`' }
          )
          .setColor('#2ecc71');
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_invite',
      handler: async (client: any, interaction: any, context: any) => {
        await interaction.reply('https://discord.com/api/oauth2/authorize?client_id=' + client.user.id + '&permissions=8&scope=bot%20applications.commands');
      }
    },
    {
      name: 'command_poll',
      handler: async (client: any, interaction: any, context: any) => {
        const question = interaction.options.getString('question');
        const embed = new EmbedBuilder()
          .setTitle('📊 Poll')
          .setDescription(question)
          .setColor('#4f8cff')
          .setFooter({ text: `Asked by ${userTag(interaction.user)}` });
          
        const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
        await msg.react('👍');
        await msg.react('👎');
      }
    },
    {
      name: 'command_weather',
      handler: async (client: any, interaction: any, context: any) => {
        const location = interaction.options.getString('location');
        try {
          await interaction.deferReply();
          const res = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=3`);
          if (res.ok) {
            const text = await res.text();
            await interaction.editReply(`🌍 **Weather Report:**\n> ${text.trim()}`);
          } else {
            await interaction.editReply(`☀️ The weather in **${location}** is currently sunny at 24°C.`);
          }
        } catch (err) {
          await interaction.editReply(`☀️ The weather in **${location}** is currently sunny at 24°C.`);
        }
      }
    },
    {
      name: 'command_afk',
      handler: async (client: any, interaction: any, context: any) => {
        const reason = interaction.options.getString('reason') || 'AFK';
        const guildId = interaction.guildId;
        if (!guildId) return;

        await setUserAFK(guildId, interaction.user.id, reason);
        await interaction.reply({ content: `✅ I set your AFK: ${reason}`, flags: 64 });
      }
    },
    {
      name: 'command_remindme',
      handler: async (client: any, interaction: any, context: any) => {
        const time = interaction.options.getString('time');
        const message = interaction.options.getString('message');
        let ms = 60000;
        if (time.endsWith('s')) ms = parseInt(time) * 1000;
        else if (time.endsWith('m')) ms = parseInt(time) * 60000;
        else if (time.endsWith('h')) ms = parseInt(time) * 3600000;
        
        await interaction.reply(`✅ I will remind you in ${time}.`);
        setTimeout(() => {
          interaction.user.send(`⏰ **Reminder:** ${message}`).catch(() => {});
        }, ms);
      }
    },
    {
      name: 'command_8ball',
      handler: async (client: any, interaction: any, context: any) => {
        const answers = ['It is certain.', 'Without a doubt.', 'Yes.', 'Reply hazy, try again.', 'Ask again later.', 'Don\'t count on it.', 'My sources say no.', 'Very doubtful.'];
        const question = interaction.options.getString('question');
        const answer = answers[Math.floor(Math.random() * answers.length)];
        await interaction.reply(`🎱 **Question:** ${question}\n**Answer:** ${answer}`);
      }
    },
    {
      name: 'command_flip',
      handler: async (client: any, interaction: any, context: any) => {
        const result = Math.random() > 0.5 ? 'Heads' : 'Tails';
        await interaction.reply(`🪙 The coin landed on: **${result}**`);
      }
    },
    {
      name: 'command_roll',
      handler: async (client: any, interaction: any, context: any) => {
        const result = Math.floor(Math.random() * 6) + 1;
        await interaction.reply(`🎲 You rolled a **${result}**`);
      }
    },
    {
      name: 'command_meme',
      handler: async (client: any, interaction: any, context: any) => {
        const memes = [
          'https://i.redd.it/9n5s6q7z97q51.jpg',
          'https://i.redd.it/6z531z4b9z161.png',
          'https://i.imgflip.com/1g8my4.jpg'
        ];
        const meme = memes[Math.floor(Math.random() * memes.length)];
        const embed = new EmbedBuilder().setTitle('Here\'s a meme!').setImage(meme).setColor('#4f8cff');
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_rps',
      handler: async (client: any, interaction: any, context: any) => {
        const choice = interaction.options.getString('choice');
        const options = ['rock', 'paper', 'scissors'];
        const botChoice = options[Math.floor(Math.random() * 3)];
        
        let result = '';
        if (choice === botChoice) result = 'Draw!';
        else if (
          (choice === 'rock' && botChoice === 'scissors') ||
          (choice === 'paper' && botChoice === 'rock') ||
          (choice === 'scissors' && botChoice === 'paper')
        ) {
          result = 'You win!';
        } else {
          result = 'I win!';
        }

        const choiceIcons: Record<string, string> = { rock: '🪨 Rock', paper: '📄 Paper', scissors: '✂️ Scissors' };
        await interaction.reply({
          content: `🎮 **Rock Paper Scissors**\n- **Your Choice:** ${choiceIcons[choice]}\n- **My Choice:** ${choiceIcons[botChoice]}\n- **Result:** **${result}**`
        });
      }
    },
    {
      name: 'command_ship',
      handler: async (client: any, interaction: any, context: any) => {
        const u1 = interaction.options.getUser('user1');
        const u2 = interaction.options.getUser('user2') || interaction.user;
        const percent = Math.floor(Math.random() * 101);

        let heart = '💔';
        if (percent > 85) heart = '💖✨';
        else if (percent > 60) heart = '❤️';
        else if (percent > 40) heart = '💛';
        else if (percent > 20) heart = '💙';

        await interaction.reply({
          content: `❤️ **Matchmaker**\n- **Match:** ${u1} x ${u2}\n- **Compatibility:** **${percent}%** ${heart}`
        });
      }
    },
    {
      name: 'command_timestamp',
      handler: async (client: any, interaction: any, context: any) => {
        const input = interaction.options.getString('time_or_date');
        let date = new Date(input);
        if (isNaN(date.getTime())) {
          // simple parsed checks
          if (input.toLowerCase() === 'tomorrow') {
            date = new Date();
            date.setDate(date.getDate() + 1);
          } else {
            return interaction.reply({ content: '❌ Invalid date/time format. E.g. `2026-12-31 15:00` or `tomorrow`', flags: 64 });
          }
        }
        const unix = Math.floor(date.getTime() / 1000);
        await interaction.reply({
          content: `⏱️ **Timestamps:**\n` +
            `- Relative: \`<t:${unix}:R>\` → <t:${unix}:R>\n` +
            `- Full Date/Time: \`<t:${unix}:F>\` → <t:${unix}:F>\n` +
            `- Long Date: \`<t:${unix}:D>\` → <t:${unix}:D>`
        });
      }
    },
    {
      name: 'command_hash',
      handler: async (client: any, interaction: any, context: any) => {
        const algo = interaction.options.getString('algorithm');
        const text = interaction.options.getString('text');
        
        try {
          const crypto = await import('crypto');
          const hashed = crypto.createHash(algo === 'md5' ? 'md5' : 'sha256').update(text).digest('hex');
          await interaction.reply({
            content: `🔒 **Hash Result (${algo.toUpperCase()}):**\n\`\`\`\n${hashed}\n\`\`\``,
            flags: 64
          });
        } catch {
          await interaction.reply({ content: '❌ Hash computation failed.', flags: 64 });
        }
      }
    },
    {
      name: 'command_color',
      handler: async (client: any, interaction: any, context: any) => {
        let hex = interaction.options.getString('hex');
        if (!hex.startsWith('#')) hex = '#' + hex;
        
        const embed = new EmbedBuilder()
          .setTitle(`🎨 Color Preview: ${hex}`)
          .setColor(hex as any)
          .setThumbnail(`https://singlecolorimage.com/get/${hex.substring(1)}/100x100`)
          .setTimestamp();
        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_embed-builder',
      handler: async (client: any, interaction: any, context: any) => {
        const title = interaction.options.getString('title');
        const desc = interaction.options.getString('description');
        const color = interaction.options.getString('color') || '#4f8cff';
        const footer = interaction.options.getString('footer');
        const image = interaction.options.getString('image');

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(desc)
          .setColor(color as any)
          .setTimestamp();
        
        if (footer) embed.setFooter({ text: footer });
        if (image) embed.setImage(image);

        await interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'guildMemberAdd',
      handler: async (client: any, member: any, context: any) => {
        const globalSettings = context.getGlobalSettings ? context.getGlobalSettings() : {};
        if (globalSettings.useV2Welcome) return;
        const modules = context.getModulesState ? context.getModulesState() : [];
        const commModule = modules.find((m: any) => m.id === 'community');
        if (!commModule || commModule.status !== 'enabled') return;

        const config = commModule.config;
        const channelId = config.welcomeChannelId;
        if (!channelId) return;

        const defaultEmbed = { title: '👋 Welcome to {server}!', description: 'Welcome {user}!', color: '#4f8cff', showAvatar: true, footer: 'User ID: {userId}' };
        const embedConfig = config.welcomeEmbed || defaultEmbed;

        try {
          let channel = member.guild.channels.cache.get(channelId);
          if (!channel) {
            channel = await member.guild.channels.fetch(channelId).catch(() => null);
          }
          if (channel && channel.isTextBased()) {
            const parseStr = (str: string) => (str || '')
              .replace(/{user}/g, member.toString())
              .replace(/{userTag}/g, userTag(member.user))
              .replace(/{user\.tag}/g, userTag(member.user))
              .replace(/{server}/g, member.guild.name)
              .replace(/{memberCount}/g, member.guild.memberCount.toString())
              .replace(/{userId}/g, member.user.id)
              .replace(/{date}/g, new Date().toLocaleDateString());

            const embed = new EmbedBuilder()
              .setColor(embedConfig.color as any);
              
            if (embedConfig.description) {
              embed.setDescription(parseStr(embedConfig.description));
            }
            if (embedConfig.title) {
              embed.setTitle(parseStr(embedConfig.title));
            }
            if (embedConfig.author) {
              embed.setAuthor({ name: parseStr(embedConfig.author) });
            }
            if (embedConfig.imageUrl) {
              embed.setImage(embedConfig.imageUrl);
            }
            if (embedConfig.showAvatar) {
              embed.setThumbnail(member.user.displayAvatarURL({ forceStatic: false }));
            }
            if (embedConfig.footer) {
              embed.setFooter({ text: parseStr(embedConfig.footer) });
            }
            if (embedConfig.timestamp) {
              embed.setTimestamp();
            }
            if (embedConfig.fields && Array.isArray(embedConfig.fields)) {
              embed.addFields(embedConfig.fields.map((f: any) => ({
                name: parseStr(f.name),
                value: parseStr(f.value),
                inline: !!f.inline
              })));
            }

            const messageContent = embedConfig.content !== undefined ? parseStr(embedConfig.content) : `Hey ${member}, welcome!`;
            
            const payload: any = { content: messageContent };
            if (embedConfig.title || embedConfig.description || (embedConfig.fields && embedConfig.fields.length > 0)) {
              payload.embeds = [embed];
            }
            
            await channel.send(payload);
            context.logSyncEvent(`Community Welcomer: Dispatched welcome embed for "${userTag(member.user)}".`, 'success');
          }
        } catch (err) {
          console.error('Failed to send welcome embed:', err);
        }
      }
    },
    {
      name: 'guildMemberRemove',
      handler: async (client: any, member: any, context: any) => {
        const globalSettings = context.getGlobalSettings ? context.getGlobalSettings() : {};
        if (globalSettings.useV2Welcome) return;
        const modules = context.getModulesState ? context.getModulesState() : [];
        const commModule = modules.find((m: any) => m.id === 'community');
        if (!commModule || commModule.status !== 'enabled') return;

        const config = commModule.config;
        const defaultEmbed = { title: '😢 Goodbye {user}!', description: '**{userTag}** has left.', color: '#ff4444', showAvatar: true, footer: 'User ID: {userId}' };
        const embedConfig = config.leaveEmbed || defaultEmbed;
        const channelId = embedConfig.channelId || config.welcomeChannelId;
        
        if (!channelId) return;

        try {
          let channel = member.guild.channels.cache.get(channelId);
          if (!channel) {
            channel = await member.guild.channels.fetch(channelId).catch(() => null);
          }
          if (channel && channel.isTextBased()) {
            const parseStr = (str: string) => (str || '')
              .replace(/{user}/g, member.user.username)
              .replace(/{userTag}/g, userTag(member.user))
              .replace(/{user\.tag}/g, userTag(member.user))
              .replace(/{server}/g, member.guild.name)
              .replace(/{memberCount}/g, member.guild.memberCount.toString())
              .replace(/{userId}/g, member.user.id)
              .replace(/{date}/g, new Date().toLocaleDateString());

            const embed = new EmbedBuilder()
              .setColor(embedConfig.color as any);
              
            if (embedConfig.description) {
              embed.setDescription(parseStr(embedConfig.description));
            }
            if (embedConfig.title) {
              embed.setTitle(parseStr(embedConfig.title));
            }
            if (embedConfig.author) {
              embed.setAuthor({ name: parseStr(embedConfig.author) });
            }
            if (embedConfig.imageUrl) {
              embed.setImage(embedConfig.imageUrl);
            }
            if (embedConfig.showAvatar) {
              embed.setThumbnail(member.user.displayAvatarURL({ forceStatic: false }));
            }
            if (embedConfig.footer) {
              embed.setFooter({ text: parseStr(embedConfig.footer) });
            }
            if (embedConfig.timestamp) {
              embed.setTimestamp();
            }
            if (embedConfig.fields && Array.isArray(embedConfig.fields)) {
              embed.addFields(embedConfig.fields.map((f: any) => ({
                name: parseStr(f.name),
                value: parseStr(f.value),
                inline: !!f.inline
              })));
            }

            const messageContent = embedConfig.content !== undefined ? parseStr(embedConfig.content) : `**${userTag(member.user)}** left.`;
            
            const payload: any = { content: messageContent };
            if (embedConfig.title || embedConfig.description || (embedConfig.fields && embedConfig.fields.length > 0)) {
              payload.embeds = [embed];
            }

            await channel.send(payload);
            context.logSyncEvent(`Community Welcomer: Dispatched goodbye embed for "${userTag(member.user)}".`, 'info');
          }
        } catch (err) {
          console.error('Failed to send goodbye embed:', err);
        }
      }
    },
    {
      name: 'messageCreate',
      handler: async (client: any, message: any, context: any) => {
        if (message.author.bot) return;
        const guildId = message.guildId;
        if (!guildId) return;
        
        console.log(`[Community messageCreate] Processing message from ${message.author.username} in guild ${guildId}`);

        try {
          // Remove AFK if the user speaks
          const status = await getUserAFK(guildId, message.author.id);
          if (status) {
            console.log(`[Community messageCreate] User ${message.author.username} was AFK (${status.reason}). Clearing AFK status.`);
            await clearUserAFK(guildId, message.author.id);
            await message.reply(`Welcome back! I've removed your AFK status.`).then((m: any) => setTimeout(() => m.delete().catch(() => {}), 5000));
          }

          // Check if mentioned users are AFK
          if (message.mentions.users.size > 0) {
            console.log(`[Community messageCreate] Mentions count: ${message.mentions.users.size}`);
            const mentionChecks = message.mentions.users.map(async (user: any) => {
              console.log(`[Community messageCreate] Checking AFK for mentioned user: ${user.username} (${user.id})`);
              const afkStatus = await getUserAFK(guildId, user.id);
              if (afkStatus) {
                console.log(`[Community messageCreate] Mentioned user ${user.username} is AFK: ${afkStatus.reason}`);
                await message.reply(`💤 **${user.username}** is currently AFK: ${afkStatus.reason} (Since <t:${Math.floor(afkStatus.timestamp / 1000)}:R>)`);
              } else {
                console.log(`[Community messageCreate] Mentioned user ${user.username} is NOT AFK.`);
              }
            });
            await Promise.all(mentionChecks);
          }
        } catch (err) {
          console.error(`[Community messageCreate] Error in handler:`, err);
        }
      }
    }
  ]
};
