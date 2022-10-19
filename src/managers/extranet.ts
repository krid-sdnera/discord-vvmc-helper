import axios from "axios";
import axiosCookieJarSupport from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import { BotManager } from ".";
import { Logger } from "../util/logger";
import { AppError, AppErrorCode } from "../util/app-error";

axiosCookieJarSupport(axios);

axios.defaults.jar = new CookieJar();
axios.defaults.withCredentials = true;

export interface MemberRecordEmpty {
  detail: {
    memFlag: false;
  };
  module: {
    ModRequired: false;
  };
  wwcDojStatus: {
    WWCCRequired: false;
  };
  searchLog: boolean;
}

export interface MemberRecordResults {
  detail: {
    RegID: string;
    Firstname: string;
    Surname: string;
    PoliceClearanceDate: string;
    Status: string;
    Description: string;
    PoliceCheckExemption: string | null;
    MemberStatus: string;
    SortOrder: string;
    PoliceRequired: boolean;
    WWCCRequired: boolean;
    WHSRequired: boolean;
    ChildSafetyRequired: boolean;
    ClassID: string;
    memFlag: true;
  };
  module: {
    childSafety: {
      Name: string;
      Completed: boolean;
      Expired: boolean;
      Status: string;
      ExpiryDate: string;
    };
    whs: {
      Name: string;
      Completed: boolean;
      Expired: boolean;
      Status: string;
      ExpiryDate: string;
    };
    ModRequired: boolean;
  };
  wwcDojStatus: {
    RegID: string;
    DojStatus: string;
    Message: string;
    Current: boolean;
  };
  searchLog: boolean;
}

export type MemberRecord = MemberRecordResults;

export class ExtranetManager {
  private logger: Logger;
  private manager: BotManager;
  constructor(manager: BotManager, logger: Logger) {
    console.time("[bot:manager:extranet] initialise");
    this.manager = manager;
    this.logger = logger.setPrefix("bot:manager:extranet");
    console.timeEnd("[bot:manager:extranet] initialise");
  }

  async verifyScoutingMember(
    rego: string,
    firstname: string,
    lastname: string
  ): Promise<MemberRecord> {
    const timerEnd = this.logger.time("debug", "verify scouting member");
    let memberDetail: MemberRecord | null = null;
    try {
      // Set the state in the PHP session.
      await axios.get(
        `https://myrecord.scoutsvictoria.com.au/memberportal/member-status-check/vic`
      );

      const memberDetailResponse = await axios.get<MemberRecord>(
        `https://myrecord.scoutsvictoria.com.au/memberportal/scoutmemberdetail/scout-member-detail/get-scout-member-detail`,
        {
          params: {
            memberRegid: rego,
            memberFirstname: firstname.replace(" ", "+").replace("'", "_"),
            memberSurname: lastname.replace(" ", "+").replace("'", "_"),
          },
        }
      );
      memberDetail = memberDetailResponse.data;
    } catch (e) {
      timerEnd();
      throw new AppError(
        "Failed to query Scouts Victoria for membership status",
        AppErrorCode.ExtranetQueryFailed
      );
    }

    if (!memberDetail.detail.memFlag) {
      timerEnd();
      throw new AppError(
        "Member not verified as a current scouting member",
        AppErrorCode.ExtranetMemberNotVerified
      );
    }
    timerEnd();
    return memberDetail;
  }
}
