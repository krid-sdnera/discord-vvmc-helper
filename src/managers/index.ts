import { Logger } from "../util/logger";
import { DatabaseManager, ListUsersOptions, UserEntity } from "./database";
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
  }

  discordIdOverride: Record<string, string> = {};

  setDiscordIdRunAs(id: string, runAsId: string | null) {
    if (runAsId === null) {
      delete this.discordIdOverride[id];
    } else {
      this.discordIdOverride[id] = runAsId;
    }
    console.log("setDiscordIdRunAs", this.discordIdOverride);
  }

  resolveDiscordId(id): string {
    console.log("resolveDiscordId", this.discordIdOverride);
    return this.discordIdOverride[id] ?? id;
  }

  resolveUserContext(userContext: AppUserContext): AppUserContext {
    if (userContext.discord) {
      userContext.discord.id = this.resolveDiscordId(userContext.discord.id);
    }
    return userContext;
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

    await this.db.recordVerification(
      scoutMember,
      extrnetDetail,
      this.resolveUserContext(userContext)
    );

    timerEnd();
    return extrnetDetail;
  }

  async linkMinecraftUsername(
    minecraft: { minecraftUsername: string },
    userContext: AppUserContext
  ) {
    const timerEnd = this.logger.time("debug", "linking scouting member");
    await this.db.recordMinecraftUsername(
      minecraft,
      this.resolveUserContext(userContext)
    );

    timerEnd();
  }

  async fetchRoleAndNickname(
    userContext: AppUserContext
  ): Promise<{ id: string; nickname: string | null; roles: string[] }> {
    const user = await this.db.fetchUser(this.resolveUserContext(userContext));

    const roles: string[] = [];

    if (user.agreeToRules && user.scoutMember) {
      roles.push("Verified");
    }

    const details = user.scoutMember?.details as unknown as MemberRecord;
    if (details?.detail?.ClassID) {
      const classIdToRoleMapping = {
        LDR: "Leader",
        ROVER: "Rover",
        VENT: "Venturer",
        SCOUT: "Scout",
      };
      const mappedRole = classIdToRoleMapping[details.detail.ClassID];
      if (mappedRole) {
        roles.push(mappedRole);
      } else {
        console.log("class id", details.detail.ClassID);
        roles.push("Unmatched section");
      }
    }

    return {
      id: this.resolveDiscordId(userContext.discord.id),
      nickname: this.getNickname(user),
      roles,
    };
  }

  getNickname(user: UserEntity): string | null {
    const nickname: string[] = [];

    if (user.discordMember?.nickname) {
      nickname.push(user.discordMember.nickname);
    } else if (user.scoutMember?.firstname) {
      nickname.push(user.scoutMember.firstname);
    }

    if (user.minecraftPlayer.length > 0) {
      nickname.push(user.minecraftPlayer.map((mc) => mc.name).join(","));
    }

    if (nickname.length === 0) {
      return null;
    }

    return nickname.join(" | ");
  }

  async recordDiscordNickname(
    discord: { nickname: string },
    userContext: AppUserContext
  ) {
    await this.db.setDiscordNickname(
      discord.nickname,
      this.resolveUserContext(userContext)
    );
  }

  async hasAcceptedRules(userContext: AppUserContext): Promise<boolean> {
    return await this.db.hasAcceptedRules(this.resolveUserContext(userContext));
  }

  async recordRuleAcceptance(userContext: AppUserContext) {
    await this.db.recordRuleAcceptance(this.resolveUserContext(userContext));
  }

  async listUsers(options: ListUsersOptions): Promise<UserEntity[]> {
    return this.db.listUsers(options);
  }
}
