export const TRIAL_DAYS = 14;

export interface LicenseInfo {
  licenseStatus: 'trial' | 'active' | 'expired';
  createdAt: string;
}

export function isLicenseActive(business: LicenseInfo): boolean {
  if (business.licenseStatus === 'active') return true;
  if (business.licenseStatus === 'expired') return false;
  return trialDaysLeft(business) > 0;
}

export function trialDaysLeft(business: { createdAt: string }): number {
  const trialEndsAt = new Date(business.createdAt).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((trialEndsAt - Date.now()) / (24 * 60 * 60 * 1000)));
}
