import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, ArrowRight, Phone, AlertCircle, Eye, EyeOff, Github } from 'lucide-react';
import { inferCurrencyFromPhoneNumber, saveUserProfile } from '../lib/userProfile';
import { signUp } from '../lib/auth';
import GoogleAuthModal, { GoogleIcon } from '../components/GoogleAuthModal';
import GitHubAuthModal from '../components/GitHubAuthModal';

export default function SignupPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [isGithubModalOpen, setIsGithubModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      const user = await signUp(formData.fullName.trim(), formData.email.trim(), formData.password);
      const inferredCurrency = inferCurrencyFromPhoneNumber(formData.phoneNumber) || { currency: 'USD', locale: 'en-US' };

      saveUserProfile({
        fullName: user.fullName,
        email: user.email,
        phoneNumber: formData.phoneNumber.trim(),
        currency: inferredCurrency.currency,
        locale: inferredCurrency.locale,
      });

      navigate('/dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to create account';
      if (/UNIQUE constraint failed|already exists/i.test(msg)) {
        setError('An account with this email address already exists. Please sign in instead.');
      } else {
        setError(msg);
      }
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <Link to="/" className="inline-flex items-center gap-2 mb-8">
            <img src="/logo.png" alt="Spendwise" className="w-10 h-10 rounded-xl object-cover shadow-md shadow-emerald-500/20" />
            <span className="text-2xl font-bold tracking-tight dark:text-white">SpendWise</span>
          </Link>
          <h1 className="text-3xl font-bold dark:text-white mb-2">Create an account</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Start managing your finances better today</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl shadow-zinc-200/50 dark:shadow-none">
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-2xl flex items-start gap-3 text-red-600 dark:text-red-400 text-sm animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="shrink-0 mt-0.5" size={18} />
              <div className="flex-1 font-medium">
                {error}
                {error.includes('already exists') && (
                  <div className="mt-1 font-normal">
                    <Link to="/login" className="underline font-semibold hover:text-red-700 dark:hover:text-red-300">
                      Click here to Sign In
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold dark:text-zinc-300 mb-2">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="John Doe"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold dark:text-zinc-300 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="name@example.com"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold dark:text-zinc-300 mb-2">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input
                  type="tel"
                  required
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold dark:text-zinc-300 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Password"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-10 pr-12 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors p-1"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold dark:text-zinc-300 mb-2">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="Confirm password"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-10 pr-12 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors p-1"
                  title={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" className="w-full bg-emerald-500 text-white py-3 rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 mt-2">
              Create Account <ArrowRight size={18} />
            </button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-200 dark:border-zinc-800"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-zinc-900 text-zinc-500">Or sign up with</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button 
              type="button"
              onClick={() => setIsGoogleModalOpen(true)} 
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 py-3 px-3 rounded-xl font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all flex items-center justify-center gap-2 text-xs shadow-sm"
            >
              <GoogleIcon size={18} /> Google
            </button>
            <button 
              type="button"
              onClick={() => setIsGithubModalOpen(true)} 
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 py-3 px-3 rounded-xl font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all flex items-center justify-center gap-2 text-xs shadow-sm"
            >
              <Github size={18} /> GitHub
            </button>
          </div>
        </div>

        <GoogleAuthModal
          isOpen={isGoogleModalOpen}
          onClose={() => setIsGoogleModalOpen(false)}
          onSuccess={() => navigate('/dashboard')}
        />

        <GitHubAuthModal
          isOpen={isGithubModalOpen}
          onClose={() => setIsGithubModalOpen(false)}
        />

        <p className="text-center mt-8 text-zinc-500 dark:text-zinc-400">
          Already have an account? <Link to="/login" className="text-emerald-500 font-bold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
