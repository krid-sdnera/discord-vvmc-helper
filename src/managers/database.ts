import {
  DiscordMember,
  MinecraftPlayer,
  PrismaClient,
  ScoutMember,
  User,
} from "@prisma/client";
import e from "express";
import { AppUserContext, BotManager } from ".";
import { AppError, AppErrorCode } from "../util/app-error";
import { Logger } from "../util/logger";
import { MemberRecord } from "./extranet";

export interface ListUsersOptions {
  page: number;
  perPage: number;
}

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

  async recordVerification(
    scoutMember: {
      membershipNumber: string;
      firstname: string;
      lastname: string;
    },
    extrnetDetail: MemberRecord,
    userContext: AppUserContext
  ) {
    const userEnd = this.logger.time("debug", "Fetch User");
    let user:
      | (User & { scoutMember?: ScoutMember; discordMember?: DiscordMember })
      | null = null;
    if (userContext.email) {
      user = await this.prisma.user.findFirst({
        where: {
          email: userContext.email,
        },
        include: {
          scoutMember: true,
          discordMember: true,
        },
      });
    } else if (userContext.discord) {
      user = await this.prisma.user.findFirst({
        where: {
          discordMember: { discordId: userContext.discord.id },
        },
        include: {
          scoutMember: true,
          discordMember: true,
        },
      });
    }

    if (!user) {
      // check for existing members with the same membership number linked.
      user = await this.prisma.user.findFirst({
        where: {
          scoutMember: { membershipNumber: scoutMember.membershipNumber },
        },
        include: {
          scoutMember: true,
          discordMember: true,
        },
      });
    }

    userEnd();

    if (!user) {
      const userCreateEnd = this.logger.time("debug", "Create User");
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
          scoutMember: {
            create: {
              membershipNumber: scoutMember.membershipNumber,
              firstname: scoutMember.firstname,
              lastname: scoutMember.lastname,
            },
          },
        },
        include: {
          scoutMember: true,
          discordMember: true,
        },
      });
      userCreateEnd();
      return;
    }

    const userUpdateEnd = this.logger.time("debug", "Update User");

    if (userContext.discord?.id) {
      // If the user was created by email, and now has been matched by scout membership number.
      // Make sure the discord member is recorded.
      if (userContext.discord.id !== user.discordMember?.discordId) {
        await this.prisma.user.update({
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
          },
        });
      }
    }
    if (userContext.email) {
      // If the user was created by discord, and now has been matched by scout membership number.
      // Make sure the email is recorded.
      if (userContext.email !== user.email) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { email: userContext.email },
          include: {
            scoutMember: true,
            discordMember: true,
          },
        });
      }
    }

    this.prisma.user.update({
      where: { id: user.id },
      data: {
        scoutMember: {
          update: {
            membershipNumber: scoutMember.membershipNumber,
            firstname: scoutMember.firstname,
            lastname: scoutMember.lastname,
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
    const userEnd = this.logger.time("debug", "Fetch User");
    let user: (User & { minecraftPlayer: MinecraftPlayer[] }) | null = null;
    if (userContext.email) {
      user = await this.prisma.user.findFirst({
        where: {
          email: userContext.email,
        },
        include: {
          minecraftPlayer: true,
        },
      });
    } else if (userContext.discord) {
      user = await this.prisma.user.findFirst({
        where: {
          discordMember: { discordId: userContext.discord.id },
        },
        include: {
          minecraftPlayer: true,
        },
      });
    }
    userEnd();

    if (!user) {
      throw new AppError(
        "Unable to link minecraft player: No user found",
        AppErrorCode.DatabaseNoResults
      );
    }

    const userUpdateEnd = this.logger.time("debug", "Update User");
    const minecraftRecord = user.minecraftPlayer.find(
      (mc: MinecraftPlayer) => mc.name === minecraft.minecraftUsername
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

  async fetchNickname(userContext: AppUserContext) {
    const userEnd = this.logger.time("debug", "Fetch User");
    let user:
      | (User & {
          minecraftPlayer: MinecraftPlayer[];
          scoutMember?: ScoutMember;
          discordMember?: DiscordMember;
        })
      | null = null;
    if (userContext.email) {
      throw new AppError(
        "Fetching nickname by email is unsupported",
        AppErrorCode.ActionUnsupported
      );
    } else if (userContext.discord) {
      user = await this.prisma.user.findFirst({
        where: {
          discordMember: { discordId: userContext.discord.id },
        },
        include: {
          minecraftPlayer: true,
          scoutMember: true,
          discordMember: true,
        },
      });
    }
    userEnd();

    if (!user) {
      throw new AppError(
        "Unable to fetch nickname: No user found",
        AppErrorCode.DatabaseNoResults
      );
    }

    const nickname: string[] = [];

    if (user.discordMember.nickname) {
      nickname.push(user.discordMember.nickname);
    } else if (user.scoutMember.firstname) {
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

  async setDiscordNickname(nickname: string, userContext: AppUserContext) {
    const userEnd = this.logger.time("debug", "Fetch User");
    let user: (User & { discordMember: DiscordMember }) | null = null;
    if (userContext.email) {
      throw new AppError(
        "Fetching nickname by email is unsupported",
        AppErrorCode.ActionUnsupported
      );
    } else if (userContext.discord) {
      user = await this.prisma.user.findFirst({
        where: {
          discordMember: { discordId: userContext.discord.id },
        },
        include: {
          discordMember: true,
        },
      });
    }
    userEnd();

    if (!user) {
      throw new AppError(
        "Unable to update discord nickname: No user found",
        AppErrorCode.DatabaseNoResults
      );
    }

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

  async listUsers(options: ListUsersOptions) {
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
