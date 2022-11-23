export enum AppErrorCode {
  ExtranetQueryFailed = "ExtranetQueryFailed",
  ExtranetMemberNotVerified = "ExtranetMemberNotVerified",
  DatabaseNoResults = "DatabaseNoResults",
  ActionUnsupported = "ActionUnsupported",
  UserDisagreesWithRules = "UserDisagreesWithRules",
  UserCreationFailed = "UserCreationFailed",
  UnknownError = "UnknownError",
  UserNotFound = "UserNotFound",
}

export class AppError extends Error {
  code: AppErrorCode;
  previous?: Error;
  constructor(msg: string, code: AppErrorCode, previous?: Error) {
    super(msg);
    this.code = code;
    this.previous = previous;
  }
}
