import { BotManager } from "./managers";
require("dotenv").config();

async function main() {
  const bot = new BotManager(process.env.BOT_TOKEN, Number(process.env.PORT));

  await bot.listen();
}

main()
  .catch((e) => console.error(e))
  .then(() => {});
