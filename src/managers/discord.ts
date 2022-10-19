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
import { AppUserContext, BotManager } from ".";
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
        .setDescription(
          "Your Scout Membership number (used to verify with Scouts Victoria)"
        )
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("firstname")
        .setDescription("Your firstname (used to verify with Scouts Victoria)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("lastname")
        .setDescription("Your lastname (used to verify with Scouts Victoria)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("nickname")
        .setDescription(
          "Your nickname (to display in discord, eg: Benjamin -> Ben)"
        )
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("minecraftusername")
        .setDescription("Your minecraft username")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("link-discord")
    .setDescription(
      "Link your Discord account with your Scouts Membership number if you've used our website to verify."
    )
    .addStringOption((option) =>
      option
        .setName("rego")
        .setDescription(
          "Your Scout Membership number (used to verify with Scouts Victoria)"
        )
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("minecraft")
    .setDescription("Link your Minecraft Username")
    .addStringOption((option) =>
      option
        .setName("username")
        .setDescription("Your minecraft username")
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
  new SlashCommandBuilder()
    .setName("run-as")
    .setDescription("For admin use only")
    .addUserOption((option) =>
      option.setName("user").setDescription("The user to run a command as")
    )
    .setDefaultPermission(false),
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
            await interaction.followUp(this.makeError(e));
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
    this.client.on("ready", async (client) => {
      console.info(`Logged in as ${this.client.user.tag}!`);

      const globalCommands = await client.application.commands.set(
        commands as any
      );

      const guildCommands = await client.application.commands.set(
        testingcommands as any,
        process.env.GUILDID
      );

      const commandPermissions = {
        "run-as": {
          roleName: "Discord Moderator",
        },
      };

      globalCommands.concat(guildCommands).forEach(async (command) => {
        if (Object.keys(commandPermissions).includes(command.name)) {
          const guild = await client.guilds.fetch(process.env.GUILDID);
          await guild.roles.fetch();
          const role = guild.roles.cache.find(
            (role) => role.name === commandPermissions[command.name].roleName
          );
          if (!role) {
            return;
          }
          await command.permissions.set({
            permissions: [{ id: role.id, type: 1, permission: true }],
            guild: guild.id,
          });
        }
      });
    });
    const loginRes = await this.client.login(this.token);
    console.timeEnd("[bot:manager] authenticate with discord");
    return loginRes;
  }

  optionsArrayToObject<T>(options: readonly CommandInteractionOption[]): T {
    return options.reduce((acc, option) => {
      if (option.type === "STRING") {
        acc[option.name] = String(option.value);
      }
      if (option.type === "BOOLEAN") {
        acc[option.name] = Boolean(option.value);
      }
      if (option.type === "INTEGER") {
        acc[option.name] = Number(option.value);
      }
      if (option.type === "USER") {
        acc[option.name] = option.user;
      }
      return acc;
    }, {} as T);
  }

  makeError(error: Error | AppError): string {
    const msg = `lol, gib this to Dirk \`${btoa(JSON.stringify(error))}\``;
    console.error(msg);
    console.error(error);
    return msg;
  }

  protected async routeCommandInteraction(
    interaction: CommandInteraction
  ): Promise<void> {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === "verify") {
      await this.processCommandVerify(interaction);
    } else if (interaction.commandName === "link-discord") {
      await this.processCommandLinkDiscord(interaction);
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
    } else if (interaction.commandName === "run-as") {
      await this.processCommandRunAs(interaction);
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
    interaction.reply(`The minecraft server's IP is \`play.vicvents-mc.tk\``);
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
            .setURL("https://map.vicvents-mc.tk/")
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
          .setURL("https://vicvents-mc.tk/rules")
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
      // await interaction.deferReply();
      // await interaction.deleteReply();
      await this.manager.recordRuleAcceptance({
        discord: { id: interaction.member.user.id },
      });
      await interaction.followUp({
        content: "Thanks for accepting our rules",
        ephemeral: true,
      });
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
      nickname?: string;
      minecraftusername?: string;
    }
    const options = this.optionsArrayToObject<CommandVerifyOptions>(
      interaction.options.data
    );

    try {
      await interaction.deferReply();

      const userContext: AppUserContext = {
        discord: { id: interaction.member.user.id },
        fallback: { scoutMembershipNumber: options.rego },
      };
      const extrnetDetail: MemberRecord = await this.manager.verifyExtranet(
        {
          membershipNumber: options.rego,
          firstname: options.firstname,
          lastname: options.lastname,
        },
        userContext
      );

      if (options.nickname) {
        await this.manager.recordDiscordNickname(
          { nickname: options.nickname },
          userContext
        );
      }
      if (options.minecraftusername) {
        await this.manager.linkMinecraftUsername(
          { minecraftUsername: options.minecraftusername },
          userContext
        );
      }

      await this.manager.recordRuleAcceptance(userContext);

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

  async processCommandLinkDiscord(interaction: CommandInteraction) {
    console.time("[bot:manager:message] link discord message");

    interface CommandVerifyOptions {
      rego: string;
    }
    const options = this.optionsArrayToObject<CommandVerifyOptions>(
      interaction.options.data
    );
    await interaction.deferReply();

    try {
      const user = await this.manager.linkDiscordMember(
        { membershipNumber: options.rego },
        {
          discord: { id: interaction.member.user.id },
          fallback: { scoutMembershipNumber: options.rego },
        }
      );
      if (user && user.scoutMember) {
        await interaction.editReply(`verry nice, linked`);
      } else {
        await interaction.editReply(
          `oh, sorry. we dont think you have verified via our website.`
        );
      }
    } catch (e) {
      throw new AppError(
        "Failed to link you with your discord account",
        AppErrorCode.UnknownError,
        e
      );
    } finally {
      console.timeEnd("[bot:manager:message] link discord message");
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
        {
          discord: { id: interaction.member.user.id },
          fallback: { minecraftUsername: options.username },
        }
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

  async processCommandRunAs(interaction: CommandInteraction) {
    console.time("[bot:manager:message] run as message");
    interface CommandRunAsOptions {
      user?: GuildMember;
    }
    const options = this.optionsArrayToObject<CommandRunAsOptions>(
      interaction.options.data
    );

    this.manager.setDiscordIdRunAs(
      interaction.member.user.id,
      options.user?.id ?? null
    );

    await interaction.reply({ content: "okie", ephemeral: true });
    console.timeEnd("[bot:manager:message] run as message");
  }

  async updateMember(interaction: ButtonInteraction | CommandInteraction) {
    console.time("[bot:manager:member] update nickname");

    const { id, nickname, roles } = await this.manager.fetchRoleAndNickname({
      discord: { id: interaction.member.user.id },
    });

    let member = interaction.member;
    if (id !== member.user.id) {
      member = await interaction.guild.members.fetch({ user: id });
    }

    if (nickname) {
      try {
        await this.updateNickname(member as GuildMember, nickname);
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

    // Set the Discord member's roles.
    try {
      await this.updateRoles(member as GuildMember, roles);
    } catch (e) {
      console.log(`failed to update roles: "${JSON.stringify(roles)}"`);

      await interaction.followUp({
        content:
          "I don't have permission to change your roles!" + this.makeError(e),
        ephemeral: true,
      });
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

  async updateRoles(member: GuildMember, roles: string[]) {
    let code = "";
    try {
      if (!member.guild.me.permissions.has("MANAGE_ROLES", true)) {
        throw new AppError(
          `Failed to update Discord role 0x03`,
          AppErrorCode.UnknownError
        );
      }

      const managedRoleNames = [
        "Leader",
        "Rover",
        "Venturer",
        "Scout",
        "Verified",
        "Verified (Legacy)",
      ];

      member.guild.roles.fetch();

      const discordRolesToAdd = member.guild.roles.cache
        // Only consider roles which we manage.
        .filter((role) => managedRoleNames.includes(role.name))
        // Only consider roles which are currently not assigned to the user.
        .filter((role) => !member.roles.cache.has(role.id))
        // This is a list of all roles we manage and the member doesnt have yet.
        // Only add the ones the user should have.
        .filter((role) => roles.includes(role.name));

      const discordRolesToRemove = member.guild.roles.cache
        // Only consider roles which we manage.
        .filter((role) => managedRoleNames.includes(role.name))
        // Only consider roles which are currently assigned to the user.
        .filter((role) => member.roles.cache.has(role.id))
        // This is a list of all roles we manage and the member does currently have.
        // Only remove the ones the user should not have.
        .filter((role) => !roles.includes(role.name));

      console.log(
        "Adding these roles",
        discordRolesToAdd.map((role) => role.name)
      );
      console.log(
        "Removing these roles",
        discordRolesToRemove.map((role) => role.name)
      );

      if (discordRolesToAdd.size > 0) {
        await member.roles.add(discordRolesToAdd);
      }
      if (discordRolesToRemove.size > 0) {
        await member.roles.remove(discordRolesToRemove);
      }
    } catch (e) {
      throw new AppError(
        `Failed to update Discord role 0x01`,
        AppErrorCode.UnknownError,
        e
      );
    }
  }
}
