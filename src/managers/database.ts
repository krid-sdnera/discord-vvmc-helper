import {
  DiscordMember,
  MinecraftPlayer,
  PrismaClient,
  ScoutMember,
  User,
  Prisma,
} from "@prisma/client";
import { AppUserContext, BotManager } from ".";
import { AppError, AppErrorCode } from "../util/app-error";
import { Logger } from "../util/logger";
import { MemberRecord } from "./extranet";

export interface ListUsersOptions {
  page: number;
  perPage: number;
}

export type UserEntity = User & {
  scoutMember?: ScoutMember;
  discordMember?: DiscordMember;
  minecraftPlayer: MinecraftPlayer[];
};

export class DatabaseManager {
  private prisma: PrismaClient;
  private logger: Logger;
  private manager: BotManager;
  constructor(manager: BotManager, logger: Logger) {
    console.time("[bot:manager:database] initialise");
    this.logger = logger;
    this.manager = manager;
    this.prisma = new PrismaClient();
    console.timeEnd("[bot:manager:database] initialise");
  }

  async fetchUser(userContext: AppUserContext): Promise<UserEntity> {
    const userEnd = this.logger.time(
      "debug",
      `Fetch User ${JSON.stringify(userContext)}`
    );
    const includeOptions = {
      scoutMember: true,
      discordMember: true,
      minecraftPlayer: true,
    };

    let user: UserEntity | null = null;
    if (userContext.user) {
      // User has previously been loaded and we need to refresh it in memory.
      user = await this.prisma.user.findFirst({
        where: {
          id: userContext.user.id,
        },
        include: includeOptions,
      });
    } else if (userContext.email) {
      // Find user by email.
      user = await this.prisma.user.findFirst({
        where: {
          email: userContext.email,
        },
        include: includeOptions,
      });
    } else if (userContext.discord) {
      // Find user by Discord ID
      user = await this.prisma.user.findFirst({
        where: {
          discordMember: { discordId: userContext.discord.id },
        },
        include: includeOptions,
      });
    }

    userEnd();

    if (!user) {
      throw new AppError(
        `No user found for ${JSON.stringify(userContext)}`,
        AppErrorCode.UserNotFound
      );
    }

    userContext.user = user;

    return user;
  }

  async createUser(userContext: AppUserContext): Promise<UserEntity> {
    // Create user if enabled
    const userCreateEnd = this.logger.time(
      "debug",
      `Create User ${JSON.stringify(userContext)}`
    );
    try {
      const user = await this.prisma.user.create({
        data: {
          discordMember: userContext.discord
            ? {
                create: {
                  discordId: userContext.discord.id,
                  nickname: null,
                },
              }
            : undefined,
          email: userContext.email || null,
        },
        include: {
          scoutMember: true,
          discordMember: true,
          minecraftPlayer: true,
        },
      });

      userContext.user = user;

      return user;
    } catch (e) {
      throw new AppError(
        "Unable to create user",
        AppErrorCode.UserCreationFailed,
        e
      );
    } finally {
      userCreateEnd();
    }
  }

  async mergeUsers(userContext: AppUserContext): Promise<UserEntity> {
    // Create user if enabled
    const userCreateEnd = this.logger.time(
      "debug",
      `Create User ${JSON.stringify(userContext)}`
    );
    try {
      const user = await this.prisma.user.create({
        data: {
          discordMember: userContext.discord
            ? {
                create: {
                  discordId: userContext.discord.id,
                  nickname: null,
                },
              }
            : undefined,
          email: userContext.email || null,
        },
        include: {
          scoutMember: true,
          discordMember: true,
          minecraftPlayer: true,
        },
      });

      return user;
    } catch (e) {
      throw new AppError(
        "Unable to create user",
        AppErrorCode.UserCreationFailed,
        e
      );
    } finally {
      userCreateEnd();
    }
  }

  async recordVerification(
    scoutMember: {
      membershipNumber: string;
      firstname: string;
      lastname: string;
    },
    extrnetDetail: MemberRecord,
    userContext: AppUserContext
  ) {
    const user = await this.fetchUser(userContext);

    console.log(extrnetDetail);

    const userUpdateEnd = this.logger.time("debug", "Update User");
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        scoutMember: {
          upsert: {
            create: {
              membershipNumber: scoutMember.membershipNumber,
              firstname: scoutMember.firstname,
              lastname: scoutMember.lastname,
              details: extrnetDetail as unknown as Prisma.InputJsonValue,
            },
            update: {
              membershipNumber: scoutMember.membershipNumber,
              firstname: scoutMember.firstname,
              lastname: scoutMember.lastname,
              details: extrnetDetail as unknown as Prisma.InputJsonValue,
            },
          },
        },
      },
    });

    await this.fetchUser(userContext);

    userUpdateEnd();
  }

  async recordMinecraftUsername(
    minecraft: { minecraftUsername: string },
    userContext: AppUserContext
  ) {
    const user = await this.manager.fetchUser(userContext);

    const userUpdateEnd = this.logger.time("debug", "Update User");
    const minecraftRecord = user.minecraftPlayer.find(
      (mc: MinecraftPlayer) =>
        mc.name.toLowerCase() === minecraft.minecraftUsername.toLowerCase()
    );

    await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        minecraftPlayer: {
          upsert: {
            where: {
              id: minecraftRecord?.id ?? 0,
            },
            create: {
              name: minecraft.minecraftUsername,
              oper: "",
              time: "",
              uuid: "",
            },
            update: {
              name: minecraft.minecraftUsername,
            },
          },
        },
      },
    });

    await this.fetchUser(userContext);

    userUpdateEnd();
  }

  async setDiscordNickname(nickname: string, userContext: AppUserContext) {
    const user = await this.manager.fetchUser(userContext);

    const userUpdateEnd = this.logger.time("debug", "Update User");
    await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        discordMember: {
          update: {
            nickname: nickname,
          },
        },
      },
    });

    await this.fetchUser(userContext);

    userUpdateEnd();
  }

  async recordRuleAcceptance(userContext: AppUserContext) {
    const user = await this.manager.fetchUser(userContext);

    const userUpdateEnd = this.logger.time("debug", "Update User");
    await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        agreeToRules: true,
      },
    });

    await this.fetchUser(userContext);

    userUpdateEnd();
  }

  async hasAcceptedRules(userContext: AppUserContext): Promise<boolean> {
    const user = await this.fetchUser(userContext);

    return user.agreeToRules;
  }

  async listUsers(options: ListUsersOptions): Promise<UserEntity[]> {
    return await this.prisma.user.findMany({
      skip: (options.page - 1) * options.perPage,
      take: options.perPage,
      include: {
        discordMember: true,
        minecraftPlayer: true,
        scoutMember: true,
      },
    });
  }
}
