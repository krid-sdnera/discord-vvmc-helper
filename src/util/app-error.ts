export enum AppErrorCode {
  ExtranetQueryFailed = "ExtranetQueryFailed",
  ExtranetMemberNotVerified = "ExtranetMemberNotVerified",
  DatabaseNoResults = "DatabaseNoResults",
  ActionUnsupported = "ActionUnsupported",
}

export class AppError extends Error {
  code: AppErrorCode;
  constructor(msg: string, code: AppErrorCode) {
    super(msg);
    this.code = code;
  }
}
