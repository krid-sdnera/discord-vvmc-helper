const { GoogleSpreadsheet } = require("google-spreadsheet");

import { backOff } from "../util";
import { MemberRecord, MemberRecordResults } from "./extranet";

export interface SimpleDiscordMember {
  discordId: string;
  discordName: string;
  roles: string;
}

export interface DbRow {
  discordId: string;
  discordName: string;
  roles: string;
  verified: string;
  rego: string;
  mcUsername: string;
  firstname: string;
  lastname: string;
  nickname: string;
}

interface Column {
  row: number;
  value: string;
}

interface Column1 {
  col: string;
  title: string;
  name: string;
}

export class DbManager {
  private doc: any;

  static Col: Record<string, Column1> = {
    DiscordId: { col: "A", title: "Discord ID", name: "discordId" },
    DiscordName: { col: "B", title: "Discord Name", name: "discordName" },
    Roles: { col: "C", title: "Roles", name: "roles" },
    Verified: { col: "D", title: "Verified", name: "verified" },
    Rego: { col: "E", title: "Rego", name: "rego" },
    MinecraftUsername: {
      col: "F",
      title: "Minecraft Username",
      name: "mcUsername",
    },
    Firstname: { col: "G", title: "Firstname", name: "firstname" },
    Lastname: { col: "H", title: "Lastname", name: "lastname" },
    Nickname: { col: "I", title: "Nickname", name: "nickname" },
  };

  constructor(sheetId) {
    this.doc = new GoogleSpreadsheet(sheetId);
  }

  public async authoriseSheet(credentials: {
    client_email: string;
    private_key: string;
  }) {
    console.time("[bot:manager] authorise sheet use");
    await this.doc.useServiceAccountAuth(credentials);
    console.timeEnd("[bot:manager] authorise sheet use");
  }

  async loadInfo() {
    await this.doc.loadInfo();
  }

  async syncMembers(members: SimpleDiscordMember[]) {
    console.time("[bot:sync:members] load info");
    await this.loadInfo();
    const sheet = this.doc.sheetsByTitle["membership"];
    console.timeEnd("[bot:sync:members] load info");

    console.time("[bot:sync:members] set header row");
    await sheet.setHeaderRow(Object.values(DbManager.Col).map((x) => x.title));
    console.timeEnd("[bot:sync:members] set header row");

    const indexOfMembers: Column[] = await this.loadIndex(
      sheet,
      DbManager.Col.DiscordId.col
    );

    await sheet.loadCells(`A1:G400`);

    for (const m of members) {
      // console.time("[debug][bot:sync:members] add row");
      const rowObj = indexOfMembers.find((x) => x.value == m.discordId);

      const row = rowObj ? rowObj.row : null;

      await this.createOrUpdate(sheet, row, m, true);

      // if (rowObj) {
      //   this.createOrUpdate(sheet, rowObj.row, m);
      //   // console.log(
      //   //   `[debug] discord id "${m.discordId}" in sheet already, skipping`
      //   // );
      // } else {
      //   // console.log(`[debug] discord id "${m.discordId}" being added`);
      //   await backOff(async () => await sheet.addRow(m));
      // }
      // console.timeEnd("[debug][bot:sync:members] add row");
    }

    console.log(`updated ${members.length} members`);

    return;
  }

  async createOrUpdate(
    sheet,
    row: number | null,
    data: Partial<DbRow>,
    preloaded: boolean = false
  ) {
    interface ConvertedRow {
      column: Column1;
      value: string;
    }

    // Convert from programatic column names to sheet titles.
    const convertedData: ConvertedRow[] = Object.entries(data).reduce(
      (acc, [key, value]) => {
        const column = Object.values(DbManager.Col).find(
          (colObj) => colObj.name === key
        );

        acc.push({ column, value });
        return acc;
      },
      [] as ConvertedRow[]
    );

    console.log(data, convertedData);

    if (row === null) {
      // Creating row.
      const sheetData = {};
      convertedData.forEach((x) => (sheetData[x.column.title] = x.value));

      await backOff(async () => await sheet.addRow(sheetData));
    } else {
      // Updating row.
      const validCols = Object.values(DbManager.Col).map((x) => x.col);
      validCols.sort();
      const firstCol = validCols[0];
      const lastCol = validCols[validCols.length - 1];

      // Load entire row.
      if (preloaded === false) {
        await backOff(
          async () =>
            await sheet.loadCells(`${firstCol}${row}:${lastCol}${row}`)
        );
      }
      const alteredCells = convertedData
        .map((x) => {
          const cell = sheet.getCellByA1(`${x.column.col}${row}`);

          console.log(cell.value, x);
          if (cell.value == x.value || (cell.value == null && x.value === "")) {
            return null;
          }

          cell.value = x.value;

          return cell;
        })
        .filter((cell) => cell !== null);

      if (alteredCells.length === 0) {
        return;
      }
      await backOff(async () => await sheet.saveCells(alteredCells));
    }
  }

  async recordVerification(discordId: string, member: MemberRecordResults) {
    const sheet = this.doc.sheetsByTitle["membership"];

    const rowObj: Column = await this.loadIndexOneRow(
      sheet,
      DbManager.Col.DiscordId.col,
      (x) => x.value == discordId
    );

    console.time("[debug][bot:sync:members] recording verification");

    if (rowObj) {
      console.log(`[debug] discord id "${discordId}" Updating member record`);

      await this.createOrUpdate(sheet, rowObj.row, {
        rego: member.detail.RegID,
        verified: member.detail.MemberStatus,
        firstname: member.detail.Firstname,
        lastname: member.detail.Surname,
      });
    }
    console.timeEnd("[debug][bot:sync:members] recording verification");
  }

  async recordMCUsername(discordId: string, mcUsername: string) {
    const sheet = this.doc.sheetsByTitle["membership"];

    const rowObj: Column = await this.loadIndexOneRow(
      sheet,
      DbManager.Col.DiscordId.col,
      (x) => x.value == discordId
    );

    console.time("[debug][bot:sync:members] recording minecraft username");

    if (rowObj) {
      console.log(`[debug] discord id "${discordId}" Updating member record`);

      await this.createOrUpdate(sheet, rowObj.row, {
        mcUsername: mcUsername,
      });
    }
    console.timeEnd("[debug][bot:sync:members] recording minecraft username");
  }

  async recordNickname(discordId: string, nickname: string) {
    const sheet = this.doc.sheetsByTitle["membership"];

    const rowObj: Column = await this.loadIndexOneRow(
      sheet,
      DbManager.Col.DiscordId.col,
      (x) => x.value == discordId
    );

    console.time("[debug][bot:sync:members] recording nickname");

    if (rowObj) {
      console.log(`[debug] discord id "${discordId}" Updating member record`);

      await this.createOrUpdate(sheet, rowObj.row, {
        nickname: nickname,
      });
    }
    console.timeEnd("[debug][bot:sync:members] recording nickname");
  }

  async fetchNickname(discordId): Promise<string | null> {
    const sheet = this.doc.sheetsByTitle["membership"];

    const rowObj: Column = await this.loadIndexOneRow(
      sheet,
      DbManager.Col.DiscordId.col,
      (x) => x.value == discordId
    );

    const validCols = Object.values(DbManager.Col).map((x) => x.col);
    validCols.sort();
    const firstCol = validCols[0];
    const lastCol = validCols[validCols.length - 1];

    await backOff(
      async () =>
        await sheet.loadCells(`${firstCol}${rowObj}:${lastCol}${rowObj}`)
    );

    const firstname = sheet.getCellByA1(
      `${DbManager.Col.Firstname.col}${rowObj.row}`
    );
    const nicknameOverride = sheet.getCellByA1(
      `${DbManager.Col.Nickname.col}${rowObj.row}`
    );
    const mcUsername = sheet.getCellByA1(
      `${DbManager.Col.MinecraftUsername.col}${rowObj.row}`
    );

    const nickname = [];

    if (nicknameOverride.value) {
      nickname.push(nicknameOverride.value);
    } else if (firstname.value) {
      nickname.push(firstname.value);
    }

    if (mcUsername.value) {
      nickname.push(mcUsername.value);
    }

    if (nickname.length === 0) {
      return null;
    }

    return nickname.join(" | ");
  }

  async loadIndex(sheet, col): Promise<Column[]> {
    console.time("[bot:sync:members] cache column one for discord lookups");
    await sheet.loadCells(`${col}1:${col}400`);

    const column: Column[] = [];
    for (let i = 1; i < 400; i++) {
      const cellValue = await sheet.getCellByA1(`${col}${i}`);
      if (cellValue) {
        column.push({ row: i, value: String(cellValue.value) });
      }
    }
    console.timeEnd("[bot:sync:members] cache column one for discord lookups");

    return column;
  }
  async loadIndexOneRow(
    sheet,
    col,
    matchFn: (x: Column) => boolean
  ): Promise<Column> {
    const columns = await this.loadIndex(sheet, col);

    return columns.find(matchFn);
  }
}
