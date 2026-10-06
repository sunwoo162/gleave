import { UserApiError } from './api/userApi';

export function userFacingError(error: unknown, fallback: string): string {
  return error instanceof UserApiError ? error.message : fallback;
}
