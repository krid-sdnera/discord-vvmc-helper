import {
  ButtonInteraction,
  Client,
  CommandInteraction,
  CommandInteractionOption,
  GuildMember,
  Intents,
  Interaction,
  Message,
  MessageActionRow,
  MessageButton,
} from "discord.js";
import { BotManager } from ".";
import { AppError, AppErrorCode } from "../util/app-error";
import { Logger } from "../util/logger";
import { MemberRecord } from "./extranet";

const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
import { SlashCommandBuilder } from "@discordjs/builders";

const commands = [
  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Verify your Scouts Victoria Membership")
    .addStringOption((option) =>
      option
        .setName("rego")
        .setDescription("Your Scout Membership number")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("firstname")
        .setDescription("Your firstname")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("lastname")
        .setDescription("Your lastname")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("minecraft")
    .setDescription("Link your Minecraft Username")
    .addStringOption((option) =>
      option
        .setName("username")
        .setDescription("Your Scout Membership number")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("nickname")
    .setDescription("Update your nickname")
    .addStringOption((option) =>
      option
        .setName("nickname")
        .setDescription("Set nickname")
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName("help").setDescription("Show help text"),
  new SlashCommandBuilder()
    .setName("ip")
    .setDescription("What is the server's IP"),
  new SlashCommandBuilder()
    .setName("dynmap")
    .setDescription("Where is the Dynmap!?"),
  new SlashCommandBuilder()
    .setName("rules")
    .setDescription("Rules to abide by while in this community")
    .addIntegerOption((option) =>
      option.setName("page").setDescription("Display the first rule")
    ),
].map((command) => command.toJSON());

const testingcommands = [].map((command) => command.toJSON());

export class DiscordManager {
  private logger: Logger;
  private token: string;
  private client: Client;
  private manager: BotManager;

  constructor(manager: BotManager, token: string, logger: Logger) {
    console.time("[bot:manager:discord] initialise");
    this.token = token;
    this.logger = logger;
    this.manager = manager;
    console.timeEnd("[bot:manager:discord] initialise");
  }

  public async listen(): Promise<string> {
    console.time("[bot:manager] authenticate with discord");
    this.client = new Client({
      intents: [Intents.FLAGS.GUILDS],
      presence: {
        activities: [
          {
            name: "Testing In Progress",
            type: "CUSTOM",
          },
        ],
      },
    });
    this.client.on("interactionCreate", async (interaction) => {
      try {
        await this.routeCommandInteraction(interaction as CommandInteraction);
        await this.routeButtonInteraction(interaction as ButtonInteraction);
      } catch (e) {
        try {
          if (interaction.isButton() || interaction.isCommand()) {
            interaction.followUp(this.makeError(e));
          } else {
            console.error("Fatal Error:");
            console.error(e);
          }
        } catch (e) {
          console.error("Silently gobble - Fatal Error:");
          console.error(e);
        }
      }
    });
    this.client.on("ready", (client) => {
      console.info(`Logged in as ${this.client.user.tag}!`);

      const rest = new REST({ version: "9" }).setToken(this.token);

      // try {
      //   await rest.put(
      //     Routes.applicationGuildCommands(
      //       process.env.CLIENTID,
      //       process.env.GUILDID
      //     ),
      //     { body: commands }
      //   );

      //   console.log("Successfully registered application guild commands.");
      // } catch (error) {
      //   console.error(error);
      // }

      // try {
      //   await rest.put(Routes.applicationCommands(process.env.CLIENTID), {
      //     body: commands,
      //   });

      //   console.log("Successfully registered application commands.");
      // } catch (error) {
      //   console.error(error);
      // }

      client.application.commands
        .set(commands as any)
        .catch((x) => console.error(x))
        .then((x) => console.log(x));

      client.application.commands
        .set(testingcommands as any, process.env.GUILDID)
        .catch((x) => console.error(x))
        .then((x) => console.log(x));
    });
    const loginRes = await this.client.login(this.token);
    console.timeEnd("[bot:manager] authenticate with discord");
    return loginRes;
  }

  optionsArrayToObject<T>(options: readonly CommandInteractionOption[]): T {
    return options.reduce((acc, option) => {
      acc[option.name] = String(option.value);
      return acc;
    }, {} as T);
  }

  makeError(error: Error | AppError): string {
    const msg = `lol, gib this to Dirk \`${btoa(JSON.stringify(error))}\``;
    console.error(msg);
    return msg;
  }

  protected async routeCommandInteraction(
    interaction: CommandInteraction
  ): Promise<void> {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === "verify") {
      await this.processCommandVerify(interaction);
    } else if (interaction.commandName === "minecraft") {
      await this.processCommandMinecraft(interaction);
    } else if (interaction.commandName === "nickname") {
      await this.processCommandNickname(interaction);
    } else if (interaction.commandName === "help") {
      await this.processCommandHelp(interaction);
    } else if (interaction.commandName === "ip") {
      await this.processCommandIP(interaction);
    } else if (interaction.commandName === "dynmap") {
      await this.processCommandDynmap(interaction);
    } else if (interaction.commandName === "rules") {
      await this.processCommandRules(interaction);
    }
  }

  protected async routeButtonInteraction(
    interaction: ButtonInteraction
  ): Promise<void> {
    if (!interaction.isButton()) return;

    console.log(interaction);

    if (interaction.customId === "rules-accept") {
      await this.processButtonRulesAccept(interaction);
    }
  }

  async processCommandHelp(interaction: CommandInteraction) {
    console.time("[bot:manager:message] help message");
    interaction.reply(`VVMC Helper

    \`/verify {rego} , {firstname} , {lastname}\`: Link your Scouts Victoria record with your Discord account.
    \`/rules\`: Gives you a link to the rules and allows you to agree to them.
    \`/minecraft {minecraft in game username}\`: Link your Minecraft username with your Discord account.
    \`/nickname {nickname}\`: Set the nickname to use instead of your full name.
    \`/ip\`: Displayed the IP of the Minecraft server for those who have forgotten.
    \`/dynmap\`: Displayed the link to Dynmap (Google maps style navigator for the Minecraft world) for those who have forgotten.
    \`/help\`: This help message
    `);
    console.timeEnd("[bot:manager:message] help message");
  }

  async processCommandIP(interaction: CommandInteraction) {
    console.time("[bot:manager:message] ip");
    interaction.reply(`The minecraft server's IP is \`play.vicvents-mc.ga\``);
    console.timeEnd("[bot:manager:message] ip");
  }

  async processCommandDynmap(interaction: CommandInteraction) {
    console.time("[bot:manager:message] dynmap");
    interaction.reply({
      content: `thanks for asking`,
      components: [
        new MessageActionRow().addComponents(
          new MessageButton()
            .setLabel("Take me there")
            .setStyle("LINK")
            .setURL("https://map.vicvents-mc.ga/")
        ),
      ],
    });
    console.timeEnd("[bot:manager:message] dynmap");
  }

  async processCommandRules(interaction: CommandInteraction) {
    console.time("[bot:manager:message] rules");

    interface CommandRulesOptions {
      page?: number;
    }
    const options = this.optionsArrayToObject<CommandRulesOptions>(
      interaction.options.data
    );

    if (options.page) {
      interaction.reply({
        content: "nah bro, this aint implemented yet",
      });
      console.timeEnd("[bot:manager:message] rules");
      return;
    }

    const components = [
      new MessageActionRow().addComponents(
        new MessageButton()
          .setLabel("Take me there")
          .setStyle("LINK")
          .setURL("https://vicvents-mc.ga/rules")
      ),
      new MessageActionRow().addComponents(
        new MessageButton()
          .setCustomId("rules-accept")
          .setLabel("I accept the rules")
          .setStyle("PRIMARY")
      ),
    ];

    await interaction.reply({
      content:
        "The rules of Victorian Venturers Discord & Minecraft server can be found on our website",
      components,
    });

    try {
      const agreeToRules = await this.manager.hasAcceptedRules({
        discord: { id: interaction.member.user.id },
      });
      if (agreeToRules) {
        await interaction.followUp({
          content: `btw, you have already accepted the rules. thx luv ya`,
          ephemeral: true,
        });
      }
    } catch (e) {
      throw new AppError(
        "Failed to send follow up rules accepted message",
        AppErrorCode.UnknownError,
        e
      );
    } finally {
      console.timeEnd("[bot:manager:message] rules");
    }
  }

  async processButtonRulesAccept(interaction: ButtonInteraction) {
    console.time("[bot:manager:message] accept rules");
    try {
      await interaction.deferReply();
      await this.manager.recordRuleAcceptance({
        discord: { id: interaction.member.user.id },
      });
      await interaction.editReply("Thanks for accepting our rules");
    } catch (e) {
      throw new AppError(
        "Failed to record you accepting the rules",
        AppErrorCode.UnknownError,
        e
      );
    } finally {
      console.timeEnd("[bot:manager:message] accept rules");
    }

    await this.updateMember(interaction);
  }

  async processCommandVerify(interaction: CommandInteraction) {
    console.time("[bot:manager:message] verify message");
    interface CommandVerifyOptions {
      rego: string;
      firstname: string;
      lastname: string;
    }
    const options = this.optionsArrayToObject<CommandVerifyOptions>(
      interaction.options.data
    );

    try {
      await interaction.deferReply();
      const extrnetDetail: MemberRecord = await this.manager.verifyExtranet(
        {
          membershipNumber: options.rego,
          firstname: options.firstname,
          lastname: options.lastname,
        },
        { discord: { id: interaction.member.user.id } }
      );
      await interaction.editReply(
        `Yeet, verified: ${extrnetDetail.detail.MemberStatus}, recording and linking`
      );
    } catch (e) {
      if (e.code === AppErrorCode.ExtranetMemberNotVerified) {
        await interaction.editReply(`member not found, soz bruv`);
      } else {
        throw new AppError(
          "Failed to verify your membership in Scouts Victoria :(",
          AppErrorCode.UnknownError,
          e
        );
      }
    } finally {
      console.timeEnd("[bot:manager:message] verify message");
    }
    await this.updateMember(interaction);
  }

  async processCommandMinecraft(interaction: CommandInteraction) {
    console.time("[bot:manager:message] mc message");

    interface CommandVerifyOptions {
      username: string;
    }
    const options = this.optionsArrayToObject<CommandVerifyOptions>(
      interaction.options.data
    );
    await interaction.deferReply();

    try {
      await this.manager.linkMinecraftUsername(
        { minecraftUsername: options.username },
        { discord: { id: interaction.member.user.id } }
      );
      await interaction.editReply(`verry nice, linked`);
    } catch (e) {
      if (e.code === AppErrorCode.UserDisagreesWithRules) {
        await interaction.editReply(`agree to rules first, thanks cuz`);
      } else {
        throw new AppError(
          "Failed to link you with your minecraft username",
          AppErrorCode.UnknownError,
          e
        );
      }
    } finally {
      console.timeEnd("[bot:manager:message] mc message");
    }

    await this.updateMember(interaction);
  }

  async processCommandNickname(interaction: CommandInteraction) {
    console.time("[bot:manager:message] nickname message");
    interface CommandVerifyOptions {
      nickname: string;
    }
    const options = this.optionsArrayToObject<CommandVerifyOptions>(
      interaction.options.data
    );

    try {
      await interaction.deferReply();
      await this.manager.recordDiscordNickname(
        { nickname: options.nickname },
        { discord: { id: interaction.member.user.id } }
      );
      await interaction.editReply(`verry nice, updated`);
    } catch (e) {
      if (e.code === AppErrorCode.UserDisagreesWithRules) {
        await interaction.editReply(`agree to the rules first, thanks cuz`);
      } else {
        throw new AppError(
          "Failed to update your discord nickname",
          AppErrorCode.UnknownError,
          e
        );
      }
    } finally {
      console.timeEnd("[bot:manager:message] nickname message");
    }

    await this.updateMember(interaction);
  }

  // async assumeMember(
  //   message: Message
  // ): Promise<{ assumedMember: GuildMember; msgPartial: string }> {
  //   if (message.content.trim().match(/as \<\@\!\d+\>$/)) {
  //     if (message.mentions.members) {
  //       let lastMention: GuildMember | null = null;
  //       message.mentions.members.mapValues((m) => (lastMention = m));

  //       await autoDelete(
  //         message.channel.send(`assuming user ${lastMention.displayName}`)
  //       );

  //       return {
  //         assumedMember: lastMention,
  //         msgPartial: ` as <@!${lastMention.id}>`,
  //       };
  //     }
  //   }
  //   return {
  //     assumedMember: message.member,
  //     msgPartial: ` as <@!${message.member.id}>`,
  //   };
  // }

  async updateMember(interaction: ButtonInteraction | CommandInteraction) {
    console.time("[bot:manager:member] update nickname");

    const { nickname, roles } = await this.manager.fetchRoleAndNickname({
      discord: { id: interaction.member.user.id },
    });

    if (nickname) {
      try {
        await this.updateNickname(interaction.member as GuildMember, nickname);
      } catch (e) {
        console.log(`failed to update nickname: "${nickname}"`);

        await interaction.followUp({
          content:
            "I don't have permission to change your nickname!" +
            this.makeError(e),
          ephemeral: true,
        });
      }
    }

    console.timeEnd("[bot:manager:member] update nickname");
  }

  async updateNickname(member: GuildMember, nickname: string) {
    let code = "";
    try {
      if (!member.guild.me.permissions.has("CHANGE_NICKNAME", true)) {
        throw new AppError(
          `Failed to update Discord nickname 0x03`,
          AppErrorCode.UnknownError
        );
      }

      if (!("setNickname" in member)) {
        throw new AppError(
          `Failed to update Discord nickname 0x02`,
          AppErrorCode.UnknownError
        );
      }

      await member.setNickname(nickname);
    } catch (e) {
      throw new AppError(
        `Failed to update Discord nickname 0x01`,
        AppErrorCode.UnknownError
      );
    }
  }
}
