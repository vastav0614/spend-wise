export interface UserProfile {
  fullName: string;
  email: string;
  phoneNumber: string;
  currency: string;
  locale: string;
}

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
  locale: string;
}

export const SUPPORTED_CURRENCIES: CurrencyOption[] = [
  { code: 'USD', name: 'US Dollar ($)', symbol: '$', locale: 'en-US' },
  { code: 'EUR', name: 'Euro (€)', symbol: '€', locale: 'de-DE' },
  { code: 'GBP', name: 'British Pound (£)', symbol: '£', locale: 'en-GB' },
  { code: 'INR', name: 'Indian Rupee (₹)', symbol: '₹', locale: 'en-IN' },
  { code: 'JPY', name: 'Japanese Yen (¥)', symbol: '¥', locale: 'ja-JP' },
  { code: 'AUD', name: 'Australian Dollar (A$)', symbol: 'A$', locale: 'en-AU' },
  { code: 'CAD', name: 'Canadian Dollar (C$)', symbol: 'C$', locale: 'en-CA' },
  { code: 'AED', name: 'UAE Dirham (AED)', symbol: 'AED', locale: 'en-AE' },
  { code: 'SGD', name: 'Singapore Dollar (S$)', symbol: 'S$', locale: 'en-SG' },
  { code: 'CHF', name: 'Swiss Franc (CHF)', symbol: 'CHF', locale: 'de-CH' },
  { code: 'CNY', name: 'Chinese Yuan (¥)', symbol: '¥', locale: 'zh-CN' },
  { code: 'BRL', name: 'Brazilian Real (R$)', symbol: 'R$', locale: 'pt-BR' },
];

export const defaultUserProfile: UserProfile = {
  fullName: 'John Doe',
  email: 'john.doe@gmail.com',
  phoneNumber: '+1 555 123 4567',
  currency: 'USD',
  locale: 'en-US',
};

const PHONE_CURRENCY_RULES = [
  { prefix: '+971', currency: 'AED', locale: 'en-AE' },
  { prefix: '+91', currency: 'INR', locale: 'en-IN' },
  { prefix: '+81', currency: 'JPY', locale: 'ja-JP' },
  { prefix: '+65', currency: 'SGD', locale: 'en-SG' },
  { prefix: '+61', currency: 'AUD', locale: 'en-AU' },
  { prefix: '+44', currency: 'GBP', locale: 'en-GB' },
  { prefix: '+49', currency: 'EUR', locale: 'de-DE' },
  { prefix: '+33', currency: 'EUR', locale: 'fr-FR' },
  { prefix: '+1', currency: 'USD', locale: 'en-US' },
];

export function inferCurrencyFromPhoneNumber(phoneNumber: string) {
  const normalizedPhone = phoneNumber.replace(/[\s()-]/g, '');
  if (!normalizedPhone.startsWith('+')) return null;
  return PHONE_CURRENCY_RULES.find((rule) => normalizedPhone.startsWith(rule.prefix)) ?? null;
}

export function getStoredUserProfile(): UserProfile {
  const savedProfile = localStorage.getItem('userProfile');

  if (!savedProfile) {
    localStorage.setItem('userProfile', JSON.stringify(defaultUserProfile));
    return defaultUserProfile;
  }

  try {
    const parsedProfile = JSON.parse(savedProfile);
    return {
      ...defaultUserProfile,
      ...parsedProfile,
    };
  } catch {
    localStorage.setItem('userProfile', JSON.stringify(defaultUserProfile));
    return defaultUserProfile;
  }
}

export function saveUserProfile(profile: UserProfile) {
  localStorage.setItem('userProfile', JSON.stringify(profile));
  window.dispatchEvent(new CustomEvent('userProfileUpdated', { detail: profile }));
}

export function formatCurrency(amount: number, profile?: Pick<UserProfile, 'currency' | 'locale'>) {
  const activeProfile = profile ?? getStoredUserProfile();
  const option = SUPPORTED_CURRENCIES.find((c) => c.code === activeProfile.currency);
  const locale = activeProfile.locale || option?.locale || 'en-US';

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: activeProfile.currency || 'USD',
      maximumFractionDigits: activeProfile.currency === 'JPY' ? 0 : 2,
    }).format(amount);
  } catch {
    return `${option?.symbol || '$'}${amount.toFixed(2)}`;
  }
}
