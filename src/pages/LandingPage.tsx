import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, PieChart, Shield, Zap, Wallet, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';
import { defaultUserProfile, saveUserProfile } from '../lib/userProfile';
import type { Expense, Budget, IncomeEntry, EMIPlan } from '../types';

export default function LandingPage() {
  const navigate = useNavigate();

  const handleViewDemo = () => {
    const demoUser = { ...defaultUserProfile, fullName: 'Demo User' };
    saveUserProfile(demoUser);

    // Clear old data
    localStorage.removeItem('expenses');
    localStorage.removeItem('budgets');
    localStorage.removeItem('income');
    localStorage.removeItem('emiPlans');
    localStorage.removeItem('savingsGoals');
    localStorage.removeItem('mongoBootstrapComplete');

    // Demo budgets
    localStorage.setItem('budgets', JSON.stringify([
      { category: 'Food', limit: 500, spent: 345 },
      { category: 'Transport', limit: 200, spent: 180 },
      { category: 'Entertainment', limit: 300, spent: 290 },
      { category: 'Shopping', limit: 400, spent: 150 },
      { category: 'Utilities', limit: 250, spent: 245 },
    ]));

    // Demo expenses
    localStorage.setItem('expenses', JSON.stringify([
      { id: 'e1', amount: 45, category: 'Food', date: '2024-10-15', paymentMethod: 'Card', notes: 'Lunch at cafe' },
      { id: 'e2', amount: 20, category: 'Transport', date: '2024-10-14', paymentMethod: 'Cash', notes: 'Bus to work' },
      { id: 'e3', amount: 120, category: 'Entertainment', date: '2024-10-12', paymentMethod: 'Card', notes: 'Movie night' },
      { id: 'e4', amount: 80, category: 'Shopping', date: '2024-10-10', paymentMethod: 'Card', notes: 'Groceries' },
      { id: 'e5', amount: 90, category: 'Utilities', date: '2024-10-08', paymentMethod: 'Bank Transfer', notes: 'Electricity bill' },
    ]));

    // Demo income
    localStorage.setItem('income', JSON.stringify([
      { id: 'i1', amount: 2500, source: 'Salary', date: '2024-10-01', notes: 'Monthly salary', recurrence: 'monthly' as const },
      { id: 'i2', amount: 200, source: 'Freelance', date: '2024-10-05', notes: 'Side project', recurrence: 'one_time' as const },
    ]));

    // Demo EMI
    localStorage.setItem('emiPlans', JSON.stringify([
      { id: 'emi1', name: 'Phone EMI', monthlyAmount: 75, startDate: '2024-09-01', durationMonths: 12 },
    ]));

    window.dispatchEvent(new CustomEvent('financeDataUpdated'));
    window.dispatchEvent(new CustomEvent('userProfileUpdated', { detail: demoUser }));

    navigate('/signup');
  };

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 selection:bg-emerald-100">
      {/* Nav */}
      <nav className="max-w-7xl mx-auto px-6 py-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Spendwise" className="w-10 h-10 rounded-xl object-cover shadow-md shadow-emerald-500/20" />
          <span className="text-2xl font-bold tracking-tight dark:text-white">SpendWise</span>
        </div>
        <div className="flex items-center gap-6">
          <Link to="/login" className="text-zinc-600 dark:text-zinc-400 font-medium hover:text-emerald-500 transition-colors">Login</Link>
          <Link to="/signup" className="bg-emerald-500 text-white px-6 py-2.5 rounded-full font-semibold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20">Sign Up</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-20 pb-32 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="inline-block px-4 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-full text-sm font-semibold mb-6">
            Smart Finance Management
          </span>
          <h1 className="text-6xl md:text-8xl font-bold tracking-tight text-zinc-900 dark:text-white mb-8 leading-[1.1]">
            Master your money <br />
            <span className="text-emerald-500 italic serif">effortlessly.</span>
          </h1>
          <p className="text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto mb-12 leading-relaxed">
            The modern expense tracker designed for clarity. Track spending, set budgets, and reach your savings goals with SpendWise.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/signup" className="w-full sm:w-auto bg-zinc-900 dark:bg-white dark:text-zinc-900 text-white px-8 py-4 rounded-full font-bold text-lg flex items-center justify-center gap-2 hover:scale-105 transition-transform">
              Get Started Free <ArrowRight size={20} />
            </Link>
            <button 
              onClick={handleViewDemo}
              className="w-full sm:w-auto px-8 py-4 rounded-full font-bold text-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 border-2 border-emerald-200 dark:border-emerald-800 transition-all hover:scale-[1.02] shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30"
            >
              Start Demo ✨
            </button>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="bg-zinc-50 dark:bg-zinc-900/50 py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-12">
            <FeatureCard 
              icon={<PieChart className="text-emerald-500" />}
              title="Visual Analytics"
              description="Understand where your money goes with beautiful, interactive charts and detailed breakdowns."
            />
            <FeatureCard 
              icon={<Shield className="text-blue-500" />}
              title="Secure & Private"
              description="Your financial data is encrypted and secure. We prioritize your privacy above everything else."
            />
            <FeatureCard 
              icon={<Zap className="text-amber-500" />}
              title="Smart Budgeting"
              description="Set monthly limits for different categories and get notified before you overspend."
            />
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-32 max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-20 items-center">
          <div>
            <h2 className="text-4xl md:text-5xl font-bold dark:text-white mb-6 leading-tight">
              Everything you need to <br />
              <span className="text-emerald-500">grow your wealth.</span>
            </h2>
            <div className="space-y-6 mt-10">
              <CheckItem title="Automatic Expense Categorization" />
              <CheckItem title="Multi-device Synchronization" />
              <CheckItem title="Custom Savings Goals" />
              <CheckItem title="Export Data to CSV/PDF" />
            </div>
          </div>
          <div className="relative">
            <div className="aspect-square bg-emerald-500/10 rounded-3xl flex items-center justify-center p-12">
              <div className="bg-white dark:bg-zinc-900 p-8 rounded-2xl shadow-2xl w-full">
                <div className="flex justify-between items-center mb-8">
                  <span className="font-bold dark:text-white">Monthly Spending</span>
                  <TrendingUp className="text-emerald-500" />
                </div>
                <div className="space-y-4">
                  <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 w-3/4"></div>
                  </div>
                  <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 w-1/2"></div>
                  </div>
                  <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 w-2/3"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="p-8 bg-white dark:bg-zinc-950 rounded-3xl border border-zinc-200 dark:border-zinc-800 hover:shadow-xl transition-shadow">
      <div className="w-12 h-12 bg-zinc-50 dark:bg-zinc-900 rounded-2xl flex items-center justify-center mb-6">
        {icon}
      </div>
      <h3 className="text-xl font-bold dark:text-white mb-4">{title}</h3>
      <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">{description}</p>
    </div>
  );
}

function CheckItem({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-6 h-6 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center">
        <ArrowRight size={14} />
      </div>
      <span className="font-medium dark:text-zinc-300">{title}</span>
    </div>
  );
}
