import {
  Client,
  GatewayIntentBits,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ThumbnailBuilder,
  EmbedBuilder,
  MessageFlags,
  TextChannel
} from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const GUILD_ID = '1499116512940654856';
const CHANNEL_ID = '1499630199459811460';
const RAI_HOMIES_ICON = 'https://cdn.discordapp.com/icons/1499116512940654856/dee8bac6c5d28e5f967cb4cbfdd44554.png?size=512';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

async function main() {
  console.log('[DeployRaiHomiesRuleBook] Logging in...');
  await client.login(process.env.DISCORD_TOKEN);
  console.log(`[DeployRaiHomiesRuleBook] Logged in as ${client.user?.tag} (${client.user?.id})`);

  const guild = await client.guilds.fetch(GUILD_ID);
  const channel = (await guild.channels.fetch(CHANNEL_ID)) as TextChannel;
  if (!channel || !channel.isTextBased()) {
    throw new Error(`Channel ${CHANNEL_ID} not found or is not a text channel.`);
  }
  console.log(`[DeployRaiHomiesRuleBook] Found text channel: #${channel.name} (${channel.id}) in ${guild.name}`);

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
    `> **All members must comply with Discord's Community Guidelines and Terms of Service.**`
  ].join('\n');

  try {
    const sec = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('# **Rai Homies Rule Book**')
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(RAI_HOMIES_ICON)
      );

    const sep = new SeparatorBuilder().setDivider(true);

    const body = new TextDisplayBuilder().setContent(ruleContent);

    const footer = new TextDisplayBuilder().setContent('-# Rage Secure RuleBook • Rai Homies');

    const container = new ContainerBuilder()
      .addSectionComponents(sec)
      .addSeparatorComponents(sep)
      .addTextDisplayComponents(body)
      .addTextDisplayComponents(footer);

    const sent = await channel.send({
      flags: MessageFlags.IsComponentsV2,
      components: [container]
    });

    console.log(`[DeployRaiHomiesRuleBook] Successfully deployed to #${channel.name}! Message ID: ${sent.id}`);
  } catch (v2Err: any) {
    console.warn('[DeployRaiHomiesRuleBook] Components V2 failed, sending fallback embed:', v2Err?.message);
    const divider = '──────────────────────────────────────────';
    const embed = new EmbedBuilder()
      .setColor(0x0a0a0c)
      .setThumbnail(RAI_HOMIES_ICON)
      .setDescription([
        `# **Rai Homies Rule Book**`,
        `\u200B`,
        `${divider}`,
        ruleContent
      ].join('\n'))
      .setFooter({ text: 'Rage Secure RuleBook • Rai Homies' });

    const sent = await channel.send({
      embeds: [embed]
    });
    console.log(`[DeployRaiHomiesRuleBook] Successfully deployed via fallback embed! Message ID: ${sent.id}`);
  }

  await client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('[DeployRaiHomiesRuleBook] Error:', err);
  process.exit(1);
});

