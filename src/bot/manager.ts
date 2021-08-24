import { Client, Guild, GuildMember, Message, Role } from "discord.js";

import { MemberRecord, verifyScoutingMember } from "./extranet";
import { DbManager, SimpleDiscordMember } from "./sheet-database";

export class BotManager {
  private token: string;
  private client: Client;
  private db: DbManager;

  private defaultCommandPrefix: string = "-vvmc";

  constructor(token: string) {
    console.time("[bot:manager] initialise");
    this.token = token;

    this.db = new DbManager("1s47QoBP7uZyqQWfsvarBAIkix7VppVGrhLRd5QgrmyU");
    console.timeEnd("[bot:manager] initialise");
  }

  public async authoriseSheet(credentials: {
    client_email: string;
    private_key: string;
  }) {
    await this.db.authoriseSheet(credentials);
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

    const data: MemberRecord = await verifyScoutingMember(
      rego,
      firstname,
      lastname
    );

    // console.log(data);

    if (data.detail.memFlag) {
      const reply2 = await message.channel.send(
        `Yeet, verified: ${data.detail.MemberStatus}, recording and linking`
      );
      setTimeout(() => reply2.delete(), 10 * 1000);
      await this.db.recordVerification(assumedMember.id, data);

      const reply3 = await message.channel.send(`verry nice, linked`);
      setTimeout(() => reply3.delete(), 10 * 1000);
    } else {
      await message.channel.send(`member not found, soz bruv`);
    }

    console.timeEnd("[bot:manager:message] verify message");
    this.updateNickname(message);
  }

  async processCommandMC(message: Message) {
    console.time("[bot:manager:message] mc message");
    const { assumedMember, msgPartial } = await this.assumeMember(message);
    const p = this.defaultCommandPrefix;
    await message.delete();
    const reply1 = await message.channel.send(
      `Okie dokie, storing your mc username`
    );
    setTimeout(() => reply1.delete(), 10 * 1000);

    const command = message.content
      .replace(`${p} mc`, "")
      .replace(msgPartial, "");

    const splits = command.trim().split(" ");
    if (splits.length < 1) {
      await message.channel.send(`invalid command`);
    }

    const mcUsername = splits[0].trim();

    console.log(command, splits, mcUsername);
    await this.db.recordMCUsername(assumedMember.id, mcUsername);

    const reply2 = await message.channel.send(`verry nice, linked`);
    setTimeout(() => reply2.delete(), 10 * 1000);

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

    await this.db.recordNickname(assumedMember.id, nickname);

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

        const reply1 = await message.channel.send(
          `assuming user ${lastMention.displayName}`
        );
        setTimeout(() => reply1.delete(), 10 * 1000);

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

    const nickname = await this.db.fetchNickname(assumedMember.id);
    console.log(nickname);
    console.log(nickname.slice(0, 32));
    console.log(nickname.slice(0, 32).length);

    if (nickname) {
      if (message.guild.me.hasPermission("MANAGE_NICKNAMES")) {
        assumedMember.setNickname(nickname);
      } else {
        message.channel.send(
          "I don't have permission to change your nickname!"
        );
      }
    }

    console.timeEnd("[bot:manager:member] update nickname");
  }

  async syncMembers() {
    console.time("[bot:sync:members]");

    console.time("[bot:sync:members] fetch guild");
    let vvmcGuild: null | Guild = await this.client.guilds.fetch(
      "717347125452734476"
    );
    console.timeEnd("[bot:sync:members] fetch guild");

    console.time("[bot:sync:members] fetch members");
    const allMembers = await vvmcGuild.members.fetch();
    console.timeEnd("[bot:sync:members] fetch members");

    console.time("[bot:sync:members] collection to array");
    const members: SimpleDiscordMember[] = [];
    allMembers.mapValues((m: GuildMember) =>
      members.push({
        discordId: m.id,
        discordName: m.nickname || "",
        // @ts-ignore
        roles: m.roles.cache
          // @ts-ignore
          .array()
          .map((role: Role): string => role.name)
          .join(", "),
      })
    );
    console.timeEnd("[bot:sync:members] collection to array");

    await this.db.syncMembers(members);

    console.timeEnd("[bot:sync:members]");

    return;
  }

  // let currentMessageId =
  //   process.env.MESSAGEIDTORESUMEFROM || latestMessage.id;

  // const fetchMessages = async (
  //   vvmcGuild: TextChannel,
  //   before: Snowflake,
  //   firstFetch: boolean,
  //   cb: (msg: Message) => Promise<any>
  // ): Promise<void> => {
  //   const initMessages = firstFetch
  //     ? [await vvmcGuild.messages.fetch(before)]
  //     : [];

  //   const messages = await vvmcGuild.messages.fetch({ before: before });
  //   // @ts-ignore
  //   let currentMessageId = messages.last().id;
  //   console.log("currentMessageId", currentMessageId);

  //   // @ts-ignore
  //   console.log("Number of messages", messages.size);

  //   // @ts-ignore
  //   if (messages.size === 0) {
  //     return;
  //   }

  //   // @ts-ignore
  //   for await (const msg of [...initMessages, ...messages.array()]) {
  //     try {
  //       await cb(msg);
  //     } catch (e) {
  //       console.log(e);
  //       console.log("Waiting 10 seconds...");
  //       await wait(10000);
  //       try {
  //         await cb(msg);
  //       } catch {
  //         console.log(e);
  //         console.log("Not waiting again for this one.   msg.id:", msg.id);
  //       }
  //     }
  //     await wait(1000);
  //   }
  //   await fetchMessages(vvmcGuild, currentMessageId, false, cb);
  // };

  // await sheet.setHeaderRow([
  //   "time",
  //   "discordId",
  //   "discordName",
  //   "message",
  //   "roles",
  //   "user",
  //   "name",
  //   "unit",
  // ]);
  // await wait(500);

  // await fetchMessages(
  //   vvmcGuild,
  //   currentMessageId,
  //   true,
  //   async (m: Message): Promise<any> => {
  //     console.log("m.id", m.id);

  //     if (m.member === null) {
  //       await wait(1000);
  //     }
  //     // if (m.member.roles === null) {
  //     //   await wait(1000);
  //     // }

  //     if (m.member === null || m.member.roles === null) {
  //       console.log({
  //         time: m.createdAt,
  //         discordId: m.member ? m.member.id : "",
  //         discordName: m.member ? m.member.nickname : "",
  //         message: m.content,
  //       });
  //       return;
  //     }

  //     const customMatch = (str, reg): string => {
  //       return str
  //         .match(/[^\r\n]+/g)
  //         .filter((s: string) => reg.test(s))
  //         .map((s: string): string => s.split(":").slice(1).join(" "))
  //         .join(" ");
  //     };

  //     return sheet.addRow({
  //       time: m.createdAt,
  //       discordId: m.member ? m.member.id : "",
  //       discordName: m.member ? m.member.nickname : "",
  //       message: m.content,
  //       // @ts-ignore
  //       roles: m.member.roles.cache
  //         // @ts-ignore
  //         .array()
  //         .map((role: Role): string => role.name)
  //         .join(", "),
  //       user: customMatch(m.content, /(mine)(craft)?|(user)(name)?/i),
  //       name: customMatch(m.content, /name/i),
  //       unit: customMatch(m.content, /unit/i),
  //     });
  //   }
  // );
}
