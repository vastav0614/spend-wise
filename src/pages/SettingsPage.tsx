import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Mail, Phone, Settings, User, Moon, Sun, CheckCircle2 } from 'lucide-react';
import {
  formatCurrency,
  getStoredUserProfile,
  inferCurrencyFromPhoneNumber,
  saveUserProfile,
  SUPPORTED_CURRENCIES,
  type UserProfile,
} from '../lib/userProfile';
import { logOut } from '../lib/auth';
import { getDarkMode, toggleDarkMode } from '../lib/theme';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile>(getStoredUserProfile);
  const [isDark, setIsDark] = useState(getDarkMode);

  useEffect(() => {
    setProfile(getStoredUserProfile());
  }, []);

  useEffect(() => {
    const handleThemeChange = (e: CustomEvent<{ isDark: boolean }>) => {
      setIsDark(e.detail.isDark);
    };

    window.addEventListener('themeChanged', handleThemeChange as EventListener);
    return () => {
      window.removeEventListener('themeChanged', handleThemeChange as EventListener);
    };
  }, []);

  const [isSaved, setIsSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const handleChange = (field: keyof UserProfile, value: string) => {
    setIsSaved(false);
    setSaveMessage(null);

    if (field === 'phoneNumber') {
      const inferredCurrency = inferCurrencyFromPhoneNumber(value);
      setProfile((currentProfile) => ({
        ...currentProfile,
        phoneNumber: value,
        ...(inferredCurrency ? { currency: inferredCurrency.currency, locale: inferredCurrency.locale } : {}),
      }));
      return;
    }

    if (field === 'currency') {
      const option = SUPPORTED_CURRENCIES.find((c) => c.code === value);
      setProfile((currentProfile) => ({
        ...currentProfile,
        currency: value,
        locale: option?.locale || currentProfile.locale,
      }));
      return;
    }

    setProfile((currentProfile) => ({
      ...currentProfile,
      [field]: value,
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!profile.fullName.trim() || !profile.email.trim()) {
      alert('Please enter your full name and email address.');
      return;
    }

    const updated: UserProfile = {
      ...profile,
      fullName: profile.fullName.trim(),
      email: profile.email.trim(),
      phoneNumber: profile.phoneNumber.trim(),
    };

    saveUserProfile(updated);
    setIsSaved(true);
    setSaveMessage('Settings and preferred currency saved successfully!');

    setTimeout(() => {
      setIsSaved(false);
    }, 3000);
  };

  const handleLogout = async () => {
    if (confirm('Are you sure you want to logout?')) {
      await logOut();
      navigate('/login');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">Settings</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Manage your personal details and review your detected currency.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-medium text-zinc-600 dark:text-zinc-300">
          <Settings size={16} />
          Currency: {profile.currency}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <form onSubmit={handleSave} className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
          <div className="bg-emerald-500 p-8 text-white">
            <h2 className="text-2xl font-bold mb-2">Profile Details</h2>
            <p className="text-emerald-50/80">Your currency is auto-detected from your phone number country code.</p>
          </div>

          <div className="p-8 space-y-6">
            {saveMessage && (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl flex items-center gap-3 text-emerald-700 dark:text-emerald-300 text-sm font-semibold animate-in fade-in slide-in-from-top-2">
                <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                <span>{saveMessage}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-semibold dark:text-zinc-300">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input
                  type="text"
                  required
                  value={profile.fullName}
                  onChange={(e) => handleChange('fullName', e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold dark:text-zinc-300">Gmail ID / Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input
                  type="email"
                  required
                  value={profile.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold dark:text-zinc-300">Phone Number (Optional)</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input
                  type="tel"
                  value={profile.phoneNumber}
                  onChange={(e) => handleChange('phoneNumber', e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white"
                />
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Phone prefix auto-detects currency, or select manually below.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold dark:text-zinc-300">Preferred Currency</label>
              <div className="relative">
                <Settings className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <select
                  value={profile.currency}
                  onChange={(e) => handleChange('currency', e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white appearance-none"
                >
                  {SUPPORTED_CURRENCIES.map((curr) => (
                    <option key={curr.code} value={curr.code}>
                      {curr.code} - {curr.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-4 pt-2">
              <button
                type="submit"
                className={`flex-1 py-3 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${
                  isSaved
                    ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                    : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20'
                }`}
              >
                {isSaved ? (
                  <>
                    <CheckCircle2 size={18} /> Saved Successfully
                  </>
                ) : (
                  'Save Settings'
                )}
              </button>
            </div>
          </div>
        </form>

        <div className="space-y-6">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-8">
            <h2 className="text-xl font-bold dark:text-white mb-6">Currency Preview</h2>
            <div className="space-y-4">
              <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-5">
                <p className="text-xs text-zinc-400 uppercase font-bold tracking-wider mb-1">Detected Currency</p>
                <p className="text-3xl font-bold dark:text-white">{profile.currency}</p>
              </div>
              <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-5">
                <p className="text-xs text-zinc-400 uppercase font-bold tracking-wider mb-1">Sample Amount</p>
                <p className="text-3xl font-bold dark:text-white">{formatCurrency(24567.89, profile)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-8">
            <h2 className="text-xl font-bold dark:text-white mb-6">Appearance & Theme</h2>
            <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300">
                  {isDark ? <Moon size={20} /> : <Sun size={20} />}
                </div>
                <div>
                  <p className="font-semibold dark:text-white">Dark Mode</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {isDark ? 'Dark theme enabled' : 'Light theme enabled'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleDarkMode()}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isDark ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isDark ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-8">
            <h2 className="text-xl font-bold dark:text-white mb-4">Account Actions</h2>
            <p className="text-zinc-500 dark:text-zinc-400 mb-6">Manage session and account preferences.</p>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-red-500 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 transition-all"
            >
              <LogOut size={18} /> Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
