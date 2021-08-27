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

  async fetchUser(
    userContext: AppUserContext,
    opts?: {
      requireAcceptedRules?: boolean;
      createUser?: boolean;
      updateIdentifiers?: boolean;
      fallback?: { scoutMembershipNumber?: string };
    }
  ): Promise<UserEntity> {
    const options = Object.assign(
      {
        requireAcceptedRules: false,
        createUser: true,
        updateIdentifiers: true,
        fallback: {},
      },
      opts
    );
    const userEnd = this.logger.time(
      "debug",
      `Fetch User ${JSON.stringify(userContext)}`
    );
    let user: UserEntity | null = null;
    if (userContext.email) {
      // Find user by email.
      user = await this.prisma.user.findFirst({
        where: {
          email: userContext.email,
        },
        include: {
          scoutMember: true,
          discordMember: true,
          minecraftPlayer: true,
        },
      });
    } else if (userContext.discord) {
      // Find user by Discord ID
      user = await this.prisma.user.findFirst({
        where: {
          discordMember: { discordId: userContext.discord.id },
        },
        include: {
          scoutMember: true,
          discordMember: true,
          minecraftPlayer: true,
        },
      });
    }

    if (!user && options?.fallback?.scoutMembershipNumber) {
      // Check for existing members with the same membership number linked.
      user = await this.prisma.user.findFirst({
        where: {
          scoutMember: {
            membershipNumber: options.fallback.scoutMembershipNumber,
          },
        },
        include: {
          scoutMember: true,
          discordMember: true,
          minecraftPlayer: true,
        },
      });
    }

    if (!user && options.createUser) {
      // Create user if enabled
      const userCreateEnd = this.logger.time(
        "debug",
        `Create User ${JSON.stringify(userContext)}`
      );
      try {
        user = await this.prisma.user.create({
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
      } catch (e) {
        throw new AppError(
          "Unable to create user",
          AppErrorCode.UserCreationFailed,
          e
        );
      } finally {
        userCreateEnd();
      }
    } else if (!user) {
      userEnd();
      throw new AppError("No user found", AppErrorCode.DatabaseNoResults);
    }

    // A user WILL be loaded at this stage. (or we will have exited early)

    if (options.updateIdentifiers) {
      // If the user was created by email, and now has been matched by scout membership number.
      // Make sure the discord member is recorded.
      if (
        userContext.discord?.id &&
        userContext.discord.id !== user.discordMember?.discordId
      ) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            discordMember: {
              upsert: {
                create: {
                  discordId: userContext.discord.id,
                  nickname: null,
                },
                update: {
                  discordId: userContext.discord.id,
                },
              },
            },
          },
          include: {
            scoutMember: true,
            discordMember: true,
            minecraftPlayer: true,
          },
        });
      }

      // If the user was created by discord, and now has been matched by scout membership number.
      // Make sure the email is recorded.
      if (userContext.email && userContext.email !== user.email) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { email: userContext.email },
          include: {
            scoutMember: true,
            discordMember: true,
            minecraftPlayer: true,
          },
        });
      }
    }

    if (options.requireAcceptedRules && !user.agreeToRules) {
      userEnd();
      throw new AppError(
        "User has not accpeted the rules",
        AppErrorCode.UserDisagreesWithRules
      );
    }

    userEnd();
    return user;
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
    const user = await this.fetchUser(userContext, {
      fallback: { scoutMembershipNumber: scoutMember.membershipNumber },
      requireAcceptedRules: false,
    });

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
    userUpdateEnd();
  }

  async recordMinecraftUsername(
    minecraft: { minecraftUsername: string },
    userContext: AppUserContext
  ) {
    const user = await this.fetchUser(userContext, {
      requireAcceptedRules: true,
    });

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
    userUpdateEnd();
  }

  async setDiscordNickname(nickname: string, userContext: AppUserContext) {
    const user = await this.fetchUser(userContext, {
      requireAcceptedRules: true,
    });

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
    userUpdateEnd();
  }

  async recordRuleAcceptance(userContext: AppUserContext) {
    const user = await this.fetchUser(userContext, {
      requireAcceptedRules: false,
    });

    const userUpdateEnd = this.logger.time("debug", "Update User");
    await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        agreeToRules: true,
      },
    });
    userUpdateEnd();
  }

  async hasAcceptedRules(userContext: AppUserContext): Promise<boolean> {
    const user = await this.fetchUser(userContext, {
      requireAcceptedRules: false,
    });

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
