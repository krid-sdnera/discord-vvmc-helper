import { BotManager } from "./bot";
import { timer } from "./util";
require("dotenv").config();
const googleConfig = require("../vvmc-helper.json");

async function main() {
  const bot = new BotManager(process.env.BOT_TOKEN);
  const gAuthPromise = bot.authoriseSheet({
    client_email: googleConfig.client_email,
    private_key: googleConfig.private_key,
  });
  const discordPromise = bot.listen();

  await Promise.all([gAuthPromise, discordPromise]);

  await timer(() => bot.syncMembers(), 60 * 60);
}

main()
  .catch((e) => console.error(e))
  .then(() => {});
