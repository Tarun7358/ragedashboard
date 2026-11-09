import {
  Client,
  GatewayIntentBits,
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
const RAI_HOMIES_ICON = 'https://cdn.discordapp.com/icons/1499116512940654856/dee8bac6c5d28e5f967cb4cbfdd44554.png?size=512';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages]
});

async function main() {
  console.log('[RaiHomiesRuleBookDM] Logging in...');
  await client.login(process.env.DISCORD_TOKEN);
  console.log(`[RaiHomiesRuleBookDM] Logged in as ${client.user?.tag} (${client.user?.id})`);

  const user = await client.users.fetch(TARGET_USER_ID);
  if (!user) {
    throw new Error(`User ${TARGET_USER_ID} not found`);
  }
  console.log(`[RaiHomiesRuleBookDM] Target user found: ${user.tag} (${user.id})`);

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

    await user.send({
      flags: MessageFlags.IsComponentsV2,
      components: [container]
    });

    console.log('[RaiHomiesRuleBookDM] Successfully sent preview to DM via Components V2 Box UI!');
  } catch (v2Err: any) {
    console.warn('[RaiHomiesRuleBookDM] Components V2 failed, sending fallback embed:', v2Err?.message);
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

    await user.send({
      embeds: [embed]
    });
    console.log('[RaiHomiesRuleBookDM] Successfully sent preview to DM via fallback embed!');
  }

  await client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('[RaiHomiesRuleBookDM] Error:', err);
  process.exit(1);
});

