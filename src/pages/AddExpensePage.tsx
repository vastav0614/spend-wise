import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Tag, 
  Calendar, 
  CreditCard, 
  FileText, 
  Plus,
  ArrowLeft,
  Sparkles
} from 'lucide-react';
import { CATEGORIES, type Expense, type Category } from '../types';
import { createExpense } from '../lib/financeApi';
import { getStoredUserProfile } from '../lib/userProfile';
import { predictCategoryFromText } from '../lib/categorizer';

export default function AddExpensePage() {
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState(getStoredUserProfile);
  const [customCategory, setCustomCategory] = useState('');
  const [customPaymentMethod, setCustomPaymentMethod] = useState('');
  const [autoCategoryBadge, setAutoCategoryBadge] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    amount: '',
    category: 'Food' as string,
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'UPI',
    notes: ''
  });

  useEffect(() => {
    const handleProfileUpdate = () => setUserProfile(getStoredUserProfile());
    window.addEventListener('userProfileUpdated', handleProfileUpdate);
    return () => window.removeEventListener('userProfileUpdated', handleProfileUpdate);
  }, []);

  const handleNotesChange = (text: string) => {
    setFormData((prev) => ({ ...prev, notes: text }));

    const predicted = predictCategoryFromText(text);
    if (predicted) {
      setFormData((prev) => ({ ...prev, category: predicted }));
      setAutoCategoryBadge(`Auto-categorized as ${predicted}`);
    } else {
      setAutoCategoryBadge(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const amount = Number(formData.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Please enter a valid amount greater than zero');
      return;
    }

    const finalCategory = formData.category === 'Other' ? (customCategory.trim() || 'Other') : formData.category;
    const finalPaymentMethod = formData.paymentMethod === 'Other' ? (customPaymentMethod.trim() || 'Other') : formData.paymentMethod;

    // Create new expense
    const newExpense: Expense = {
      id: Date.now().toString(),
      amount,
      category: finalCategory,
      date: formData.date,
      paymentMethod: finalPaymentMethod,
      notes: formData.notes
    };

    // Save to expenses history
    await createExpense(newExpense);

    navigate('/history');
  };

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <button 
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-zinc-500 hover:text-emerald-500 transition-colors mb-6 font-medium"
      >
        <ArrowLeft size={18} /> Back
      </button>

      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl shadow-zinc-200/50 dark:shadow-none overflow-hidden">
        <div className="bg-emerald-500 p-8 text-white">
          <h1 className="text-2xl font-bold mb-2">Add New Expense</h1>
          <p className="text-emerald-50/80">Keep track of your spending with smart AI auto-categorization.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold dark:text-zinc-300">Expense Title / Description</label>
            <div className="relative">
              <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input 
                type="text" 
                value={formData.notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="e.g. Biryani, Uber ride, Netflix bill, Amazon shopping..."
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-11 pr-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white font-medium"
              />
            </div>
            {autoCategoryBadge && (
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1 animate-in fade-in">
                <Sparkles size={14} className="text-emerald-500" />
                <span>{autoCategoryBadge}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold dark:text-zinc-300">Amount</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-sm">
                  {userProfile.currency}
                </span>
                <input 
                  type="number" 
                  required
                  min="0.01"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  placeholder="0.00"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-14 pr-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white font-medium"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold dark:text-zinc-300">Category</label>
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <select 
                  value={formData.category}
                  onChange={(e) => {
                    setFormData({...formData, category: e.target.value});
                    setAutoCategoryBadge(null);
                  }}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white appearance-none"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {formData.category === 'Other' && (
                <div className="mt-2">
                  <input
                    type="text"
                    required
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="Specify custom category..."
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2.5 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white text-sm"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold dark:text-zinc-300">Date</label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, date: new Date().toISOString().split('T')[0] })}
                    className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 transition-colors"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const yesterday = new Date();
                      yesterday.setDate(yesterday.getDate() - 1);
                      setFormData({ ...formData, date: yesterday.toISOString().split('T')[0] });
                    }}
                    className="text-xs font-semibold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 transition-colors"
                  >
                    Yesterday
                  </button>
                </div>
              </div>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                <input 
                  type="date" 
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  onClick={(e) => {
                    try {
                      (e.target as HTMLInputElement).showPicker?.();
                    } catch {}
                  }}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white font-medium cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold dark:text-zinc-300">Payment Method</label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <select 
                  value={formData.paymentMethod}
                  onChange={(e) => setFormData({...formData, paymentMethod: e.target.value})}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white appearance-none font-medium"
                >
                  <option value="UPI">UPI (GPay / PhonePe / Paytm)</option>
                  <option value="Cash">Cash</option>
                  <option value="EMI">EMI / Loan Installment</option>
                  <option value="Credit Card">Credit Card</option>
                  <option value="Debit Card">Debit Card</option>
                  <option value="Net Banking">Net Banking</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {formData.paymentMethod === 'Other' && (
                <div className="mt-2">
                  <input
                    type="text"
                    required
                    value={customPaymentMethod}
                    onChange={(e) => setCustomPaymentMethod(e.target.value)}
                    placeholder="Specify custom payment method..."
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2.5 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white text-sm"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 flex gap-4">
            <button 
              type="button"
              onClick={() => navigate(-1)}
              className="flex-1 px-6 py-3 border border-zinc-200 dark:border-zinc-800 rounded-xl font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="flex-1 bg-emerald-500 text-white py-3 rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              <Plus size={18} /> Add Expense
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
