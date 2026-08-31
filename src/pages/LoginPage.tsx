import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, AlertCircle, Eye, EyeOff, Github } from 'lucide-react';
import { defaultUserProfile, getStoredUserProfile, saveUserProfile } from '../lib/userProfile';
import { logIn } from '../lib/auth';
import GoogleAuthModal, { GoogleIcon } from '../components/GoogleAuthModal';
import GitHubAuthModal from '../components/GitHubAuthModal';

export default function LoginPage() {
  const navigate = useNavigate();
  const existingProfile = getStoredUserProfile();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [isGithubModalOpen, setIsGithubModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    email: existingProfile.email,
    password: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const user = await logIn(formData.email.trim(), formData.password);
      saveUserProfile({ ...defaultUserProfile, fullName: user.fullName, email: user.email });
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    }
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex items-center justify-center animate-in fade-in duration-500 p-6 relative overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-black to-black">
      {/* Background ambient glow */}
      <div className="absolute w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -top-20 -left-20 pointer-events-none" />
      <div className="absolute w-96 h-96 bg-zinc-800/20 rounded-full blur-3xl -bottom-20 -right-20 pointer-events-none" />

      <div className="relative z-10 bg-zinc-950/90 backdrop-blur-xl p-8 rounded-3xl border border-zinc-800/80 shadow-2xl shadow-black max-w-md w-full">
        <div className="text-center mb-8">
          <img 
            src="/logo.png" 
            alt="Spendwise Logo" 
            className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-lg shadow-emerald-500/20 object-cover ring-1 ring-zinc-800" 
          />
          <h1 className="text-2xl font-bold text-white">Welcome Back</h1>
          <p className="text-zinc-400 mt-1">Sign in to your Spendwise account</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-950/40 border border-red-800/50 rounded-2xl text-xs font-semibold text-red-400 flex items-center gap-2">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-zinc-300 mb-2">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input 
                type="email" 
                required
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                placeholder="name@example.com"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-11 pr-4 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition-all text-zinc-100 placeholder-zinc-500 focus:bg-zinc-900/90"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-zinc-300 mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input 
                type={showPassword ? 'text' : 'password'}
                required
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                placeholder="••••••••"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-11 pr-11 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition-all text-zinc-100 placeholder-zinc-500 focus:bg-zinc-900/90"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1 transition-colors"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button 
            type="submit"
            className="w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400 py-3 rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 mt-6"
          >
            Sign In <ArrowRight size={18} />
          </button>
        </form>

        <div className="mt-8 space-y-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-zinc-950 text-zinc-400">Or continue with</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button 
              type="button"
              onClick={() => setIsGoogleModalOpen(true)} 
              className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 py-3 px-3 rounded-xl font-semibold hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 text-xs shadow-sm"
            >
              <GoogleIcon size={18} /> Google
            </button>
            <button 
              type="button"
              onClick={() => setIsGithubModalOpen(true)} 
              className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 py-3 px-3 rounded-xl font-semibold hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 text-xs shadow-sm"
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

        <p className="text-center mt-8 text-zinc-400">
          Don't have an account? <Link to="/signup" className="text-emerald-400 font-bold hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
