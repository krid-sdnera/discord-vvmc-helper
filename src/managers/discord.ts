import { Client, Guild, GuildMember, Message, Role } from "discord.js";
import { BotManager } from ".";
import { AppErrorCode } from "../util/app-error";
import { Logger } from "../util/logger";
import { autoDelete } from "../util/util";
import { MemberRecord } from "./extranet";

export class DiscordManager {
  private logger: Logger;
  private token: string;
  private client: Client;
  private manager: BotManager;
  private defaultCommandPrefix: string = "-vvmc";

  constructor(manager: BotManager, token: string, logger: Logger) {
    console.time("[bot:manager:discord] initialise");
    this.token = token;
    this.logger = logger;
    this.manager = manager;
    console.timeEnd("[bot:manager:discord] initialise");
  }

  public async listen(): Promise<string> {
    console.time("[bot:manager] authenticate with discord");
    this.client = new Client();
    this.client.on("message", (message) => this.routeMessage(message));
    this.client.on("ready", () => {
      console.info(`Logged in as ${this.client.user.tag}!`);
      this.client.user.setPresence({
        activity: {
          name: "Testing In Progress",
          type: "PLAYING",
        },
      });
    });
    const loginRes = await this.client.login(this.token);
    console.timeEnd("[bot:manager] authenticate with discord");
    return loginRes;
  }

  protected async routeMessage(message: Message): Promise<void> {
    const p = this.defaultCommandPrefix;
    if (message.author.bot) {
      return;
    }
    console.time("[bot:manager] route message " + message.id);

    try {
      if (message.content.startsWith(`${p} help`)) {
        await this.processCommandHelp(message);
      } else if (message.content.startsWith(`${p} verify`)) {
        await this.processCommandVerify(message);
      } else if (message.content.startsWith(`${p} mc`)) {
        await this.processCommandMC(message);
      } else if (
        message.content.startsWith(`${p} nick`) ||
        message.content.startsWith(`${p} nickname`)
      ) {
        await this.processCommandNickname(message);
      } else {
        console.log("[bot:message]", message.content);
      }
    } catch (e) {
      console.error(e);
    }

    console.timeEnd("[bot:manager] route message " + message.id);
  }

  async processCommandHelp(message: Message) {
    console.time("[bot:manager:message] help message");
    const p = this.defaultCommandPrefix;
    await message.delete();
    const reply1 = await message.channel.send(`VVMC Helper

    \`${p} verify {rego} , {firstname} , {lastname}\`: Link your Scouts Victoria record with your Discord account.
    \`${p} mc {minecraft in game username}\`: Link your Minecraft username with your Discord account.
    \`${p} nick|nickname {nickname}\`: Set the nickname to use instead of your full name.
    \`${p} help\`: This help message
    `);
    setTimeout(() => reply1.delete(), 10 * 1000);
    console.timeEnd("[bot:manager:message] help message");
  }

  async processCommandVerify(message: Message) {
    console.time("[bot:manager:message] verify message");
    const { assumedMember, msgPartial } = await this.assumeMember(message);
    const p = this.defaultCommandPrefix;
    await message.delete();
    const reply1 = await message.channel.send(
      `Okie dokie, verifing and linking your Scouts Victoria membership`
    );
    setTimeout(() => reply1.delete(), 10 * 1000);

    const command = message.content
      .replace(`${p} verify`, "")
      .replace(msgPartial, "");

    const splits = command.split(",");
    if (splits.length !== 3) {
      console.log(command);
      await message.channel.send(`invalid command`);
      console.timeEnd("[bot:manager:message] verify message");
      return;
    }

    const rego = splits[0].trim();
    const firstname = splits[1].trim();
    const lastname = splits[2].trim();

    let extrnetDetail: MemberRecord | null = null;
    try {
      extrnetDetail = await this.manager.verifyExtranet(
        {
          membershipNumber: rego,
          firstname: firstname,
          lastname: lastname,
        },
        { discord: { id: assumedMember.id } }
      );
    } catch (e) {
      if (e.code === AppErrorCode.ExtranetMemberNotVerified) {
        await autoDelete(message.channel.send(`member not found, soz bruv`));
      }
      throw e;
    }

    await autoDelete(
      message.channel.send(
        `Yeet, verified: ${extrnetDetail.detail.MemberStatus}, recording and linking`
      )
    );

    console.timeEnd("[bot:manager:message] verify message");
    this.updateNickname(message);
  }

  async processCommandMC(message: Message) {
    console.time("[bot:manager:message] mc message");
    const { assumedMember, msgPartial } = await this.assumeMember(message);
    const p = this.defaultCommandPrefix;
    await message.delete();
    await autoDelete(
      message.channel.send(`Okie dokie, storing your mc username`)
    );

    const command = message.content
      .replace(`${p} mc`, "")
      .replace(msgPartial, "");

    const splits = command.trim().split(" ");
    if (splits.length < 1) {
      await autoDelete(message.channel.send(`invalid command`));
    }

    const mcUsername = splits[0].trim();

    await this.manager.linkMinecraftUsername(
      { minecraftUsername: mcUsername },
      { discord: { id: assumedMember.id } }
    );

    await autoDelete(message.channel.send(`verry nice, linked`));

    console.timeEnd("[bot:manager:message] mc message");
    this.updateNickname(message);
  }

  async processCommandNickname(message: Message) {
    console.time("[bot:manager:message] nickname message");
    const { assumedMember, msgPartial } = await this.assumeMember(message);
    const p = this.defaultCommandPrefix;
    await message.delete();
    const reply1 = await message.channel.send(
      `Okie dokie, storing your profile nickname`
    );
    setTimeout(() => reply1.delete(), 10 * 1000);

    const command = message.content
      .replace(`${p} nickname`, "")
      .replace(`${p} nick`, "")
      .replace(msgPartial, "");

    const nickname = command.trim();

    await this.manager.recordDiscordNickname(
      { nickname },
      { discord: { id: assumedMember.id } }
    );

    const reply2 = await message.channel.send(`verry nice, updated`);
    setTimeout(() => reply2.delete(), 10 * 1000);

    console.timeEnd("[bot:manager:message] nickname message");
    this.updateNickname(message);
  }

  async assumeMember(
    message: Message
  ): Promise<{ assumedMember: GuildMember; msgPartial: string }> {
    if (message.content.trim().match(/as \<\@\!\d+\>$/)) {
      if (message.mentions.members) {
        let lastMention: GuildMember | null = null;
        message.mentions.members.mapValues((m) => (lastMention = m));

        await autoDelete(
          message.channel.send(`assuming user ${lastMention.displayName}`)
        );

        return {
          assumedMember: lastMention,
          msgPartial: ` as <@!${lastMention.id}>`,
        };
      }
    }
    return {
      assumedMember: message.member,
      msgPartial: ` as <@!${message.member.id}>`,
    };
  }

  async updateNickname(message: Message) {
    console.time("[bot:manager:member] update nickname");
    const { assumedMember, msgPartial } = await this.assumeMember(message);

    const nickname = await this.manager.fetchNickname({
      discord: { id: assumedMember.id },
    });
    // console.log(nickname);
    // console.log(nickname.slice(0, 32));
    // console.log(nickname.slice(0, 32).length);

    if (nickname) {
      try {
        if (message.guild.me.hasPermission("MANAGE_NICKNAMES")) {
          await assumedMember.setNickname(nickname);
        } else {
          await autoDelete(
            message.channel.send(
              "I don't have permission to change your nickname!"
            )
          );
        }
      } catch (e) {
        await autoDelete(
          message.channel.send(
            "I don't have permission to change your nickname!"
          )
        );
      }
    }

    console.timeEnd("[bot:manager:member] update nickname");
  }

  // async syncMembers() {
  //   console.time("[bot:sync:members]");

  //   console.time("[bot:sync:members] fetch guild");
  //   let vvmcGuild: null | Guild = await this.client.guilds.fetch(
  //     "717347125452734476"
  //   );
  //   console.timeEnd("[bot:sync:members] fetch guild");

  //   console.time("[bot:sync:members] fetch members");
  //   const allMembers = await vvmcGuild.members.fetch();
  //   console.timeEnd("[bot:sync:members] fetch members");

  //   console.time("[bot:sync:members] collection to array");
  //   const members: SimpleDiscordMember[] = [];
  //   allMembers.mapValues((m: GuildMember) =>
  //     members.push({
  //       discordId: m.id,
  //       discordName: m.nickname || "",
  //       // @ts-ignore
  //       roles: m.roles.cache
  //         // @ts-ignore
  //         .array()
  //         .map((role: Role): string => role.name)
  //         .join(", "),
  //     })
  //   );
  //   console.timeEnd("[bot:sync:members] collection to array");

  //   await this.db.syncMembers(members);

  //   console.timeEnd("[bot:sync:members]");

  //   return;
  // }
}
