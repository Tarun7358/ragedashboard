import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ThumbnailBuilder,
  EmbedBuilder,
  MessageFlags
} from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const TARGET_USER_ID = '1140892126402596905';
const GUILD_ICON = 'https://cdn.discordapp.com/icons/1266048940101599293/a17d3c7a86fff32084748ff94be35325.png?size=512';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages]
});

async function main() {
  console.log('[RuleBookDM] Logging in...');
  await client.login(process.env.DISCORD_TOKEN);
  console.log(`[RuleBookDM] Logged in as ${client.user?.tag} (${client.user?.id})`);

  const user = await client.users.fetch(TARGET_USER_ID);
  if (!user) {
    throw new Error(`User ${TARGET_USER_ID} not found`);
  }
  console.log(`[RuleBookDM] Target user found: ${user.tag} (${user.id})`);

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Create Support Ticket')
      .setURL('https://discord.com/channels/1266048940101599293/1557018497375141948')
      .setStyle(ButtonStyle.Link),
    new ButtonBuilder()
      .setLabel('Discord Guidelines')
      .setURL('https://discord.com/guidelines')
      .setStyle(ButtonStyle.Link)
  );

  const ruleContent = [
    `<a:Arrow:1565804961391050852> **Respect Everyone**`,
    `> **Treat every member with respect. Harassment, bullying, hate speech, discrimination, or personal attacks are strictly prohibited.**`,
    ``,
    `<a:Arrow:1565804961391050852> **Keep Chats Clean**`,
    `> **Use channels for their intended purpose. Avoid spam, excessive emojis, repeated messages, or unnecessary mentions**`,
    ``,
    `<a:Arrow:1565804961391050852> **No NSFW Content**`,
    `> **Posting or sharing NSFW, explicit, or inappropriate content is strictly forbidden.**`,
    ``,
    `<a:Arrow:1565804961391050852> **No Advertising**`,
    `> **Do not advertise servers, social media, websites, or businesses without staff approval.**`,
    ``,
    `<a:Arrow:1565804961391050852> **No Toxicity**`,
    `> **Keep the environment friendly. Excessive trash talk, racism, sexism, or offensive language will not be tolerated.**`,
    ``,
    `<a:Arrow:1565804961391050852> **Voice Channel Etiquette**`,
    `> **Avoid loud noises, soundboards, mic spam, or disrupting conversations in voice channels.**`,
    ``,
    `<a:Arrow:1565804961391050852> **No Exploits or Malicious Activity**`,
    `> **Using self-bots, malicious bots, phishing links, scams, cheats, or exploits is prohibited.**`,
    ``,
    `<:discord:1518869308162314310> **Follow Discord Terms**`,
    `> **All members must comply with Discord's Community Guidelines and Terms of Service.**`,
    ``,
    `**Any Further Support Need Create a Support Ticket here <#1557018497375141948>**`,
    `**Our Team Will Reach You Within 24hr**  ||@everyone @here <@&1457047397183258706>||`
  ].join('\n');

  try {
    const sec = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('# **Aura Xtremez Community RuleBook**')
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(GUILD_ICON)
      );

    const sep = new SeparatorBuilder().setDivider(true);

    const body = new TextDisplayBuilder().setContent(ruleContent);

    const footer = new TextDisplayBuilder().setContent('-# Rage Secure RuleBook • Aura Xtremez');

    const container = new ContainerBuilder()
      .addSectionComponents(sec)
      .addSeparatorComponents(sep)
      .addTextDisplayComponents(body)
      .addActionRowComponents(actionRow)
      .addTextDisplayComponents(footer);

    await user.send({
      flags: MessageFlags.IsComponentsV2,
      components: [container]
    });

    console.log('[RuleBookDM] Successfully sent via Components V2 container with AX logo!');
  } catch (v2Err: any) {
    console.warn('[RuleBookDM] Components V2 failed, sending fallback embed:', v2Err?.message);
    const divider = '──────────────────────────────────────────';
    const embed = new EmbedBuilder()
      .setColor(0x0a0a0c)
      .setThumbnail(GUILD_ICON)
      .setDescription([
        `# **Aura Xtremez Community RuleBook**`,
        `\u200B`,
        `${divider}`,
        ruleContent
      ].join('\n'))
      .setFooter({ text: 'Rage Secure RuleBook • Aura Xtremez' });

    await user.send({
      embeds: [embed],
      components: [actionRow]
    });
    console.log('[RuleBookDM] Successfully sent via fallback embed!');
  }

  await client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('[RuleBookDM] Error:', err);
  process.exit(1);
});
