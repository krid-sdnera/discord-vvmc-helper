import { Logger } from "../util/logger";
import { DatabaseManager, ListUsersOptions } from "./database";
import { DiscordManager } from "./discord";
import { ExtranetManager, MemberRecord } from "./extranet";
import { WebManager } from "./web";

export interface AppUserContext {
  email?: string;
  discord?: { id: string };
}

export class BotManager {
  private logger: Logger;
  private db: DatabaseManager;
  private discord: DiscordManager;
  private extranet: ExtranetManager;
  private web: WebManager;

  constructor(discordToken: string, webPort: number) {
    console.time("[bot:manager] initialise");
    this.logger = new Logger("bot:manager");
    this.db = new DatabaseManager(this, this.logger);
    this.discord = new DiscordManager(this, discordToken, this.logger);
    this.extranet = new ExtranetManager(this, this.logger);
    this.web = new WebManager(this, webPort, this.logger);
    console.timeEnd("[bot:manager] initialise");
  }

  public async listen(): Promise<void> {
    console.time("[bot:manager] request managers begin listening");
    await Promise.all([this.discord.listen(), this.web.listen()]);
    console.timeEnd("[bot:manager] request managers begin listening");

    // await this.db.recordVerification(
    //   {
    //     membershipNumber: "8036229",
    //     firstname: "Dirk",
    //     lastname: "Arends",
    //   },
    //   {} as any,
    //   // { email: "dirk@arends.com.au" }
    //   { discord: { id: "242265323636523010" } }
    // );
  }

  async verifyExtranet(
    scoutMember: {
      membershipNumber: string;
      firstname: string;
      lastname: string;
    },
    userContext: AppUserContext
  ): Promise<MemberRecord> {
    const timerEnd = this.logger.time("debug", "verify scouting member");
    let extrnetDetail: MemberRecord | null = null;
    try {
      extrnetDetail = await this.extranet.verifyScoutingMember(
        scoutMember.membershipNumber,
        scoutMember.firstname,
        scoutMember.lastname
      );
    } catch (e) {
      timerEnd();
      // Make sure execution stops proceeding.
      throw e;
    }

    await this.db.recordVerification(scoutMember, extrnetDetail, userContext);

    timerEnd();
    return extrnetDetail;
  }

  async linkMinecraftUsername(
    minecraft: { minecraftUsername: string },
    userContext: AppUserContext
  ) {
    const timerEnd = this.logger.time("debug", "linking scouting member");
    await this.db.recordMinecraftUsername(minecraft, userContext);

    timerEnd();
  }

  async fetchNickname(userContext: AppUserContext): Promise<string> {
    const nickname = await this.db.fetchNickname(userContext);

    return nickname;
  }

  async recordDiscordNickname(
    discord: { nickname: string },
    userContext: AppUserContext
  ) {
    await this.db.setDiscordNickname(discord.nickname, userContext);
  }

  async listUsers(options: ListUsersOptions) {
    return this.db.listUsers(options);
  }
}
