import React, { useState, useEffect } from 'react';
import { Wallet, Plus, AlertCircle, CheckCircle2, X, Edit2, Trash2 } from 'lucide-react';
import { CATEGORIES, type Budget } from '../types';
import { formatCurrency, getStoredUserProfile } from '../lib/userProfile';
import { deleteBudget, getBudgets, saveBudget } from '../lib/financeApi';

export default function BudgetPage() {
  const [userProfile, setUserProfile] = useState(getStoredUserProfile);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingCategory, setEditingCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [formData, setFormData] = useState({
    category: 'Food',
    limit: ''
  });

  useEffect(() => {
    const syncProfile = () => setUserProfile(getStoredUserProfile());
    window.addEventListener('userProfileUpdated', syncProfile);
    return () => window.removeEventListener('userProfileUpdated', syncProfile);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const limit = parseFloat(formData.limit);
    if (!Number.isFinite(limit) || limit <= 0) {
      alert('Please enter a valid limit greater than zero');
      return;
    }

    const targetCategory = formData.category === 'Other' ? (customCategory.trim() || 'Other') : formData.category;

    const existingBudget = budgets.find(b => b.category === targetCategory && b.category !== editingCategory);
    if (existingBudget) {
      alert('A budget for this category already exists. Please edit the existing one.');
      return;
    }

    if (isEditMode) {
      const targetBudget = budgets.find((b) => b.category === editingCategory);
      if (targetBudget) {
        await saveBudget({ ...targetBudget, category: targetCategory, limit }, editingCategory);
      }
    } else {
      const newBudget: Budget = {
        category: targetCategory,
        limit,
        spent: 0,
      };
      await saveBudget(newBudget);
    }

    setBudgets(await getBudgets());
    setFormData({ category: 'Food', limit: '' });
    setCustomCategory('');
    setIsModalOpen(false);
    setIsEditMode(false);
    setEditingCategory('');
  };

  const handleEdit = (budget: Budget) => {
    setIsEditMode(true);
    setEditingCategory(budget.category);
    setFormData({ category: budget.category, limit: budget.limit.toString() });
    setIsModalOpen(true);
  };

  const handleDelete = async (category: string) => {
    if (confirm(`Are you sure you want to delete the budget for ${category}?`)) {
      const updatedBudgets = budgets.filter((b) => b.category !== category);
      setBudgets(updatedBudgets);
      await deleteBudget(category);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsEditMode(false);
    setEditingCategory('');
    setFormData({ category: 'Food', limit: '' });
  };

  const sumBudgetAmounts = (field: 'limit' | 'spent') =>
    Math.round(
      budgets.reduce((sum, budget) => sum + (Number.isFinite(budget[field]) ? budget[field] : 0), 0) * 100,
    ) / 100;
  const totalBudget = sumBudgetAmounts('limit');
  const totalSpent = sumBudgetAmounts('spent');

  useEffect(() => {
    const loadBudgets = async () => {
      setBudgets(await getBudgets());
    };

    loadBudgets();
    window.addEventListener('financeDataUpdated', loadBudgets);

    return () => {
      window.removeEventListener('financeDataUpdated', loadBudgets);
    };
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">Budget Management</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Set and monitor your monthly spending limits.</p>
        </div>
        <button onClick={() => { setIsEditMode(false); setFormData({ category: 'Food', limit: '' }); setIsModalOpen(true); }} className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20">
          <Plus size={18} /> Set New Budget
        </button>
      </div>

      {/* Summary Card */}
      <div className="bg-zinc-900 dark:bg-emerald-900/20 p-8 rounded-3xl text-white flex flex-col md:flex-row items-center justify-between gap-8">
        <div>
          <p className="text-emerald-200 font-medium mb-1">Total Monthly Budget</p>
          <h2 className="text-4xl font-bold">{formatCurrency(totalBudget, userProfile)}</h2>
        </div>
        <div className="flex-1 max-w-md w-full">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-emerald-200">Total Spent: {formatCurrency(totalSpent, userProfile)}</span>
            <span className="text-emerald-200">{totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0}%</span>
          </div>
          <div className="h-3 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400" style={{ width: `${totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0}%` }}></div>
          </div>
        </div>
      </div>

      {/* Category Budgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {budgets.map((budget) => {
          const percentage = (budget.spent / budget.limit) * 100;
          const isNearLimit = percentage > 85;
          const isOverLimit = percentage > 100;

          return (
            <div key={budget.category} className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-500">
                    <Wallet size={20} />
                  </div>
                  <h3 className="font-bold dark:text-white">{budget.category}</h3>
                </div>
                <div className="flex items-center gap-2">
                  {isOverLimit ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-red-500 bg-red-50 dark:bg-red-950/30 px-2 py-1 rounded-full">
                      <AlertCircle size={14} /> Over Limit
                    </span>
                  ) : isNearLimit ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-amber-500 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded-full">
                      <AlertCircle size={14} /> Near Limit
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-full">
                      <CheckCircle2 size={14} /> On Track
                    </span>
                  )}
                  <button 
                    onClick={() => handleEdit(budget)}
                    className="p-1.5 text-zinc-400 hover:text-emerald-500 transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={() => handleDelete(budget.category)}
                    className="p-1.5 text-zinc-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500 dark:text-zinc-400">Current Month Spent: <span className="font-bold dark:text-white">{formatCurrency(budget.spent, userProfile)}</span></span>
                  <span className="text-zinc-500 dark:text-zinc-400">Monthly Limit: <span className="font-bold dark:text-white">{formatCurrency(budget.limit, userProfile)}</span></span>
                </div>
                <div className="h-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 ${isOverLimit ? 'bg-red-500' : isNearLimit ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  ></div>
                </div>
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-zinc-400 font-medium">
                    Past Months Expenses: <span className="font-semibold text-zinc-600 dark:text-zinc-300">{formatCurrency(budget.previousSpent || 0, userProfile)}</span>
                  </span>
                  <span className="text-zinc-400 font-semibold">
                    {formatCurrency(Math.max(0, budget.limit - budget.spent), userProfile)} remaining
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-xl font-bold dark:text-white">{isEditMode ? 'Edit Budget' : 'Set New Budget'}</h3>
              <button onClick={closeModal} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold dark:text-zinc-300 mb-2">Category</label>
                <select 
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  disabled={isEditMode}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>

                {formData.category === 'Other' && !isEditMode && (
                  <div className="mt-3">
                    <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                      Specify Custom Category Name
                    </label>
                    <input
                      type="text"
                      required
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      placeholder="e.g. Subscriptions, Education, Pets..."
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold dark:text-zinc-300 mb-2">
                  Monthly Limit ({userProfile.currency})
                </label>
                <input 
                  type="number" 
                  required
                  step="0.01"
                  min="0"
                  value={formData.limit}
                  onChange={(e) => setFormData({...formData, limit: e.target.value})}
                  placeholder="0.00"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-3 border border-zinc-200 dark:border-zinc-800 rounded-xl font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-emerald-500 text-white py-3 rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
                >
                  {isEditMode ? 'Update Budget' : 'Set Budget'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
