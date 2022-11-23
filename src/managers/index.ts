import { AppError, AppErrorCode } from "../util/app-error";
import { Logger } from "../util/logger";
import { DatabaseManager, ListUsersOptions, UserEntity } from "./database";
import { DiscordManager } from "./discord";
import { ExtranetManager, MemberRecord } from "./extranet";
import { WebManager } from "./web";

export interface AppUserContext {
  user?: UserEntity;
  email?: string;
  discord?: { id: string };
  fallback?: {
    minecraftUsername?: string;
    scoutMembershipNumber?: string;
  };
}

export type AppUserScope = "extranet:verified" | "rules:agreed";

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

  /**
   * Fetch user from userContext.
   *
   * @param userContext AppUserContext
   * @param opts Object
   * @returns UserEntity
   */
  async fetchUser(
    userContext: AppUserContext,
    opts?: {
      /** @default false */
      createUser?: boolean;
      /** @default false */
      reload?: boolean;
    }
  ): Promise<UserEntity> {
    const options = {
      createUser: opts.createUser ?? false,
      reload: opts.reload ?? false,
    };

    if (userContext.user && options.reload === false) {
      // A user entitiy has been added to the user context.
      // Just return that object.
      return userContext.user;
    }

    let user: UserEntity;
    try {
      user = await this.db.fetchUser(userContext);
    } catch (e) {
      // Bubble all errors which are not UserNotFound.
      if (e.code !== AppErrorCode.UserNotFound) {
        throw e;
      }

      // User was not found, and should not be created.
      // This is still an error and can be rethrown.
      if (!options.createUser) {
        throw e;
      }

      // Try to create the new user.
      user = await this.createUser(userContext);
    }

    user = await this.detectDuplicatesAndMerge(userContext, user);

    return user;
  }

  private async createUser(userContext: AppUserContext) {
    return await this.db.createUser(userContext);
  }

  private async detectDuplicatesAndMerge(
    userContext: AppUserContext,
    user: UserEntity
  ): Promise<UserEntity> {
    if (userContext.discord) {
    }

    if (user && !user.scoutMember) {
      // This record could be a duplicate. With the fallback ids, lets see if
      // there is an existing record.
      const conditions = [];
      if (userContext?.fallback?.scoutMembershipNumber) {
        conditions.push({
          scoutMember: {
            membershipNumber: userContext.fallback.scoutMembershipNumber,
          },
        });
      }

      if (userContext?.fallback?.minecraftUsername) {
        conditions.push({
          minecraftPlayer: {
            some: {
              name: userContext.fallback.minecraftUsername,
            },
          },
        });
      }

      const userWithMatchingFallback: UserEntity | null =
        await this.prisma.user.findFirst({
          where: { OR: conditions },
          include: {
            scoutMember: true,
            discordMember: true,
            minecraftPlayer: true,
          },
        });

      if (userWithMatchingFallback) {
        const discordData = {
          discordId: user.discordMember.discordId,
          nickname: user.discordMember.nickname,
          id: user.discordMember.id,
        };

        // Delete the mostly empty discord presence.
        await this.prisma.user.delete({ where: { id: user.id } });
        await this.prisma.discordMember.delete({
          where: { id: discordData.id },
        });

        // Move the discord member to the existing user.
        user = await this.prisma.user.update({
          where: { id: userWithMatchingFallback.id },
          data: {
            discordMember: {
              create: {
                discordId: discordData.discordId,
                nickname: discordData.nickname,
              },
              update: {
                discordId: discordData.discordId,
                nickname: discordData.nickname,
              },
            },
            agreeToRules:
              user.agreeToRules ||
              userWithMatchingFallback.agreeToRules ||
              false,
          },
          include: {
            scoutMember: true,
            discordMember: true,
            minecraftPlayer: true,
          },
        });
      }
    }
    return user;
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

  async getScopes(userContext: AppUserContext): Promise<AppUserScope[]> {
    await this.fetchUser(userContext);

    const scopes: AppUserScope[] = [];

    if (userContext.user.agreeToRules) {
      scopes.push("rules:agreed");
    }

    if (userContext.user.scoutMember) {
      const details = userContext.user.scoutMember
        .details as unknown as MemberRecord;

      if (details?.detail?.memFlag) {
        scopes.push("extranet:verified");
      }
    }
    return scopes;
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

  async linkDiscordMember(
    scoutMember: { membershipNumber: string },
    userContext: AppUserContext
  ): Promise<UserEntity | null> {
    const timerEnd = this.logger.time("debug", "linking scouting member");
    try {
      const user = await this.db.fetchUser(
        this.resolveUserContext(userContext)
      );
      return user;
    } catch (e) {
      if (e.code === AppErrorCode.DatabaseNoResults) {
        return null;
      }
      throw e;
    } finally {
      timerEnd();
    }
  }

  async generateRoleAndNickname(
    userContext: AppUserContext
  ): Promise<{ id: string; nickname: string | null; roles: string[] }> {
    const user = await this.fetchUser(this.resolveUserContext(userContext));

    const roles: string[] = [];

    const scopes = await this.getScopes(userContext);
    if (
      scopes.includes("extranet:verified") &&
      scopes.includes("rules:agreed")
    ) {
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
      nickname: this.generateNickname(user),
      roles,
    };
  }

  generateNickname(user: UserEntity): string | null {
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

  async recordRuleAcceptance(userContext: AppUserContext) {
    await this.db.recordRuleAcceptance(this.resolveUserContext(userContext));
  }

  async listAllUsers(): Promise<UserEntity[]> {
    const getPageOfUsers = async (page: number = 1): Promise<UserEntity[]> => {
      const users = await this.db.listUsers({ page: page, perPage: 50 });

      if (users.length === 0) {
        return users;
      }

      return users.concat(await getPageOfUsers(page + 1));
    };

    return await getPageOfUsers();
  }

  async listUsers(options: ListUsersOptions): Promise<UserEntity[]> {
    return this.db.listUsers(options);
  }
}
