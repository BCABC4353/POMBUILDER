import type { AuthService } from './auth-service';
import { createAuthService, buildProductionDeps } from './auth-service';

let authInstance: AuthService | null = null;

export function getAuthService(): AuthService {
  if (authInstance === null) {
    authInstance = createAuthService(buildProductionDeps());
  }
  return authInstance;
}

export function __setAuthServiceForTests(instance: AuthService | null): void {
  authInstance = instance;
}
