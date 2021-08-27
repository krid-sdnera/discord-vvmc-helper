-- CreateTable
CREATE TABLE `MinecraftPlayer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(256) NOT NULL,
    `uuid` VARCHAR(256) NOT NULL,
    `oper` VARCHAR(256) NOT NULL,
    `time` VARCHAR(256) NOT NULL,
    `userId` INTEGER,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DiscordMember` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `discordId` VARCHAR(256) NOT NULL,
    `nickname` VARCHAR(256),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScoutMember` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `membershipNumber` VARCHAR(256) NOT NULL,
    `firstname` VARCHAR(256) NOT NULL,
    `lastname` VARCHAR(256) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191),
    `scoutMemberId` INTEGER,
    `discordMemberId` INTEGER,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MinecraftPlayer` ADD FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD FOREIGN KEY (`scoutMemberId`) REFERENCES `ScoutMember`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD FOREIGN KEY (`discordMemberId`) REFERENCES `DiscordMember`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
