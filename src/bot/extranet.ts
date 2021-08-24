import axios from "axios";
import axiosCookieJarSupport from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";

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

export async function verifyScoutingMember(
  rego: string,
  firstname: string,
  lastname: string
): Promise<MemberRecord> {
  await axios.get(
    `https://myrecord.scoutsvictoria.com.au/memberportal/member-status-check/vic`
  );

  const memberDetailResponse = await axios.get<MemberRecord>(
    `https://myrecord.scoutsvictoria.com.au/memberportal/scoutmemberdetail/scout-member-detail/get-scout-member-detail`,
    {
      params: {
        memberRegid: rego,
        memberFirstname: firstname.replace(" ", "+"),
        memberSurname: lastname.replace(" ", "+"),
      },
    }
  );

  return memberDetailResponse.data;
}
