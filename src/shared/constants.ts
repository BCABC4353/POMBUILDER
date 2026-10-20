export const APP_NAME = 'POM Builder';

export const PARTITION_NAME = 'persist:pom-builder';

export const POWERBI_API_BASE = 'https://api.powerbi.com/v1.0/myorg';

export const POM_WORKSPACE_ID = 'e04b0a24-da17-4a17-ac97-2edd7a4e1675';

export const POM_DATASET_ID = '23afc0ce-13b7-4079-ae5d-9c9ad2f0b637';

export const TOKEN = {
  FALLBACK_LIFETIME_MS: 3_600_000,
  VALIDATE_SHORT_CIRCUIT_MS: 5 * 60 * 1000,
  REFRESH_LEAD_MS: 2 * 60 * 1000,
} as const;
