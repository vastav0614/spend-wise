import React, { useEffect, useState, useCallback } from 'react';
import { Target, Plus, Calendar, Trophy, X, Edit, Trash2, Sparkles, Layers, ShieldCheck, ArrowDownRight } from 'lucide-react';
import type { SavingsGoal } from '../types';
import { formatCurrency, getStoredUserProfile } from '../lib/userProfile';
import { 
  getSavingsGoals, 
  createSavingsGoal, 
  updateSavingsGoal, 
  deleteSavingsGoal, 
  calculatePreviousSavingsPool, 
  calculatePreviousSavingsDetails,
  allocatePreviousSavingsToGoals, 
  type SavingsGoalWithAllocation,
  type PreviousSavingsDetails
} from '../lib/financeApi';

type FormData = {
  name: string;
  targetAmount: string;
  currentAmount: string;
  deadline: string;
  priority: 'high' | 'medium' | 'low';
};

const emptyForm: FormData = {
  name: '',
  targetAmount: '',
  currentAmount: '',
  deadline: new Date().toISOString().split('T')[0],
  priority: 'medium',
};

function formatDateString(rawDate?: string): string {
  if (!rawDate) return '';
  const clean = rawDate.split('T')[0];
  const [year, month, day] = clean.split('-');
  if (!year || !month || !day) return rawDate;
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  if (isNaN(d.getTime())) return rawDate;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SavingsPage() {
  const [userProfile, setUserProfile] = useState(getStoredUserProfile);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [previousSavingsPool, setPreviousSavingsPool] = useState(0);
  const [previousSavingsDetails, setPreviousSavingsDetails] = useState<PreviousSavingsDetails>({
    pastIncomeTotal: 0,
    pastExpenseTotal: 0,
    previousSavingsPool: 0,
  });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [selectedGoal, setSelectedGoal] = useState<SavingsGoal | null>(null);
  const [savingsAmount, setSavingsAmount] = useState('');

  useEffect(() => {
    const syncProfile = () => setUserProfile(getStoredUserProfile());
    window.addEventListener('userProfileUpdated', syncProfile);
    return () => window.removeEventListener('userProfileUpdated', syncProfile);
  }, []);

  const loadGoalsAndSavings = async () => {
    try {
      const loadedGoals = await getSavingsGoals();
      setGoals(loadedGoals.length > 0 ? loadedGoals : []);
      const details = await calculatePreviousSavingsDetails();
      setPreviousSavingsDetails(details);
      setPreviousSavingsPool(details.previousSavingsPool);
    } catch (e) {
      console.warn('Load goals fallback:', e);
      setGoals([]);
      const details = await calculatePreviousSavingsDetails();
      setPreviousSavingsDetails(details);
      setPreviousSavingsPool(details.previousSavingsPool);
    }
  };

  useEffect(() => {
    loadGoalsAndSavings();
    window.addEventListener('financeDataUpdated', loadGoalsAndSavings);
    return () => window.removeEventListener('financeDataUpdated', loadGoalsAndSavings);
  }, []);

  const openCreateForm = () => {
    setFormData(emptyForm);
    setEditingGoal(null);
    setIsFormOpen(true);
  };

  const openEditForm = (goal: SavingsGoal) => {
    setFormData({
      name: goal.name,
      targetAmount: goal.targetAmount.toString(),
      currentAmount: goal.currentAmount.toString(),
      deadline: goal.deadline,
      priority: goal.priority || 'medium',
    });
    setEditingGoal(goal);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setFormData(emptyForm);
    setEditingGoal(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetAmount = parseFloat(formData.targetAmount);
    const currentAmount = parseFloat(formData.currentAmount) || 0;

    if (!formData.name.trim() || !Number.isFinite(targetAmount) || targetAmount <= 0 || currentAmount > targetAmount) {
      alert('Please fill all fields correctly');
      return;
    }

    const goalData: SavingsGoal = {
      id: editingGoal?.id || Date.now().toString(),
      name: formData.name.trim(),
      targetAmount,
      currentAmount,
      deadline: formData.deadline,
      priority: formData.priority,
    };

    try {
      if (editingGoal) {
        await updateSavingsGoal(goalData);
        setGoals(goals.map(g => g.id === goalData.id ? goalData : g));
      } else {
        await createSavingsGoal(goalData);
        setGoals([goalData, ...goals]);
      }
      closeForm();
    } catch (e) {
      alert('Failed to save goal');
    }
  };

  const handleDelete = async (goal: SavingsGoal) => {
    if (!confirm(`Delete "${goal.name}"?`)) return;
    try {
      await deleteSavingsGoal(goal.id);
      setGoals(goals.filter(g => g.id !== goal.id));
    } catch (e) {
      alert('Failed to delete goal');
    }
  };

  const handleAddSavings = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(savingsAmount);
    if (!selectedGoal || !Number.isFinite(amount) || amount <= 0) return;
    const newAmount = Math.min(selectedGoal.currentAmount + amount, selectedGoal.targetAmount);
    const updatedGoal = { ...selectedGoal, currentAmount: newAmount };

    try {
      await updateSavingsGoal(updatedGoal);
      await loadGoalsAndSavings();
      setSelectedGoal(null);
      setSavingsAmount('');
    } catch {
      alert('Failed to add savings. Please try again.');
    }
  };

  const handleApplyAutoAllocated = async (goal: SavingsGoalWithAllocation) => {
    if (!goal.autoAllocatedAmount || goal.autoAllocatedAmount <= 0) return;
    const newAmount = Math.min(goal.currentAmount + goal.autoAllocatedAmount, goal.targetAmount);
    const updatedGoal: SavingsGoal = {
      id: goal.id,
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: newAmount,
      deadline: goal.deadline,
      priority: goal.priority,
    };

    try {
      await updateSavingsGoal(updatedGoal);
      await loadGoalsAndSavings();
    } catch {
      alert('Failed to apply auto-allocated savings to goal.');
    }
  };

  const { allocatedGoals, totalAllocated, unallocatedRemaining } = allocatePreviousSavingsToGoals(
    goals,
    previousSavingsPool
  );

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">Savings Goals & Waterfall Allocation</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Previous months savings auto-fill High Priority goals first before Medium & Low priority.</p>
        </div>
        <button onClick={openCreateForm} className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20">
          <Plus size={18} />
          New Goal
        </button>
      </div>

      {/* Savings Pool Banner */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 dark:from-emerald-950 dark:to-teal-950 p-6 md:p-8 rounded-3xl text-white border border-emerald-500/30 shadow-xl flex items-center justify-between">
        <div>
          <span className="text-emerald-200 text-xs font-bold uppercase tracking-wider">Past Savings Pool</span>
          <h2 className="text-3xl md:text-4xl font-extrabold mt-1">{formatCurrency(previousSavingsPool, userProfile)}</h2>
        </div>
      </div>

      {isFormOpen && (
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl p-8 max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold dark:text-white">{editingGoal ? 'Edit Goal' : 'New Goal'}</h2>
              <p className="text-zinc-500 dark:text-zinc-400 mt-1">Fill details to {editingGoal ? 'update' : 'create'} your savings goal.</p>
            </div>
            <button onClick={closeForm} className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold dark:text-zinc-300 mb-2">Goal Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full p-4 border border-zinc-200 dark:border-zinc-700 rounded-2xl bg-zinc-50 dark:bg-zinc-800 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 dark:text-white"
                placeholder="Emergency Fund"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold dark:text-zinc-300 mb-2">Target Amount</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  value={formData.targetAmount}
                  onChange={(e) => setFormData({...formData, targetAmount: e.target.value})}
                  className="w-full p-4 border border-zinc-200 dark:border-zinc-700 rounded-2xl bg-zinc-50 dark:bg-zinc-800 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 dark:text-white"
                  placeholder="5000"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold dark:text-zinc-300 mb-2">Manual Direct Saved</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.currentAmount}
                  onChange={(e) => setFormData({...formData, currentAmount: e.target.value})}
                  className="w-full p-4 border border-zinc-200 dark:border-zinc-700 rounded-2xl bg-zinc-50 dark:bg-zinc-800 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 dark:text-white"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold dark:text-zinc-300 mb-2">Deadline</label>
                <input
                  type="date"
                  required
                  value={formData.deadline}
                  onChange={(e) => setFormData({...formData, deadline: e.target.value})}
                  className="w-full p-4 border border-zinc-200 dark:border-zinc-700 rounded-2xl bg-zinc-50 dark:bg-zinc-800 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold dark:text-zinc-300 mb-2">Priority Waterfall Level</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({...formData, priority: e.target.value as 'high'|'medium'|'low'})}
                  className="w-full p-4 border border-zinc-200 dark:border-zinc-700 rounded-2xl bg-zinc-50 dark:bg-zinc-800 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 dark:text-white"
                >
                  <option value="high">High (Primary Goal - Fills First)</option>
                  <option value="medium">Medium (Secondary Goal)</option>
                  <option value="low">Low (Tertiary Goal)</option>
                </select>
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={closeForm}
                className="flex-1 px-6 py-3 border border-zinc-200 dark:border-zinc-700 rounded-2xl font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <Edit size={20} />
                {editingGoal ? 'Update Goal' : 'Create Goal'}
              </button>
            </div>
          </form>
        </div>
      )}

      {allocatedGoals.length === 0 ? (
        <div className="text-center py-20">
          <Target className="mx-auto h-24 w-24 text-zinc-400 mb-4" />
          <h3 className="text-2xl font-bold dark:text-white mb-2">No Savings Goals Yet</h3>
          <p className="text-zinc-500 dark:text-zinc-400 mb-8">Start by creating your first savings goal!</p>
          <button onClick={openCreateForm} className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-3 rounded-2xl font-bold shadow-lg transition-all">
            Create First Goal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allocatedGoals.map((goal) => {
            const manualSaved = goal.currentAmount;
            const autoAllocated = goal.autoAllocatedAmount;
            const effectiveTotal = goal.effectiveCurrentAmount;
            const percentage = goal.effectivePercentage;
            const remainingToTarget = Math.max(0, goal.targetAmount - effectiveTotal);

            const priorityLabel = {
              high: 'HIGH (PRIMARY)',
              medium: 'MEDIUM (SECONDARY)',
              low: 'LOW (TERTIARY)'
            }[goal.priority || 'medium'];

            const priorityBadgeColor = {
              high: 'bg-red-500 text-white',
              medium: 'bg-amber-500 text-white',
              low: 'bg-blue-500 text-white'
            }[goal.priority || 'medium'];

            return (
              <div key={goal.id} className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl p-8 group hover:shadow-2xl transition-all relative overflow-hidden flex flex-col justify-between">
                {goal.isFullyFunded && (
                  <div className="absolute top-4 right-4 flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold text-xs bg-amber-50 dark:bg-amber-950/50 px-3 py-1 rounded-full border border-amber-300 dark:border-amber-700 shadow-sm">
                    <Trophy size={16} className="text-amber-500" /> Goal Reached!
                  </div>
                )}
                
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${priorityBadgeColor}`}>
                        {priorityLabel}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEditForm(goal)}
                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                        title="Edit"
                      >
                        <Edit size={16} className="text-blue-500" />
                      </button>
                      <button
                        onClick={() => handleDelete(goal)}
                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} className="text-red-500" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-xl font-bold dark:text-white mb-1">{goal.name}</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">Target Date: {formatDateString(goal.deadline)}</p>

                  <div className="space-y-4 mb-6">
                    <div className="grid grid-cols-2 gap-3 text-center p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                      <div>
                        <p className="text-2xl font-bold dark:text-white">{formatCurrency(effectiveTotal, userProfile)}</p>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-bold">Total Effective</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold dark:text-white">{formatCurrency(remainingToTarget, userProfile)}</p>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-bold">Remaining</p>
                      </div>
                    </div>

                    {autoAllocated > 0 && (
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5">
                          <Sparkles size={14} className="text-emerald-500 flex-shrink-0" />
                          Auto-Allocated Past Savings:
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold">+{formatCurrency(autoAllocated, userProfile)}</span>
                          <button
                            onClick={() => handleApplyAutoAllocated(goal)}
                            className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold text-[11px] transition-all shadow-sm flex items-center gap-1"
                            title="Add this auto-allocated past savings amount directly to goal saved total"
                          >
                            <Plus size={12} /> Apply to Goal
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <div className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden flex">
                        <div 
                          className="h-full bg-emerald-500 transition-all duration-700"
                          style={{ width: `${Math.min((manualSaved / goal.targetAmount) * 100, 100)}%` }}
                          title={`Manual Saved: ${formatCurrency(manualSaved, userProfile)}`}
                        />
                        <div 
                          className="h-full bg-teal-400 transition-all duration-700"
                          style={{ width: `${Math.min((autoAllocated / goal.targetAmount) * 100, 100)}%` }}
                          title={`Auto-Allocated: ${formatCurrency(autoAllocated, userProfile)}`}
                        />
                      </div>
                      <div className="flex justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400 pt-1">
                        <span>{percentage}% Complete</span>
                        <span>Target: {formatCurrency(goal.targetAmount, userProfile)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedGoal(goal)}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3.5 rounded-2xl font-bold shadow-lg transition-all text-sm flex items-center justify-center gap-2"
                >
                  <Plus size={16} /> Add Manual Savings
                </button>
              </div>
            );
          })}
        </div>
      )}

      {selectedGoal && (() => {
        const selectedAllocatedGoal = allocatedGoals.find((g) => g.id === selectedGoal.id);
        const autoAllocatedAmount = selectedAllocatedGoal?.autoAllocatedAmount || 0;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
            <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-700">
                <h2 className="text-2xl font-bold dark:text-white">Add to {selectedGoal.name}</h2>
                <p className="text-zinc-500 dark:text-zinc-400 mt-1">Remaining: {formatCurrency(selectedGoal.targetAmount - selectedGoal.currentAmount, userProfile)}</p>
              </div>
              <form onSubmit={handleAddSavings} className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-semibold dark:text-zinc-300 mb-2">Amount to Add</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={savingsAmount}
                    onChange={(e) => setSavingsAmount(e.target.value)}
                    placeholder="250"
                    className="w-full p-4 border border-zinc-200 dark:border-zinc-700 rounded-2xl bg-zinc-50 dark:bg-zinc-800 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 dark:text-white text-lg"
                  />
                  {autoAllocatedAmount > 0 && (
                    <button
                      type="button"
                      onClick={() => setSavingsAmount(autoAllocatedAmount.toString())}
                      className="text-xs bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 font-semibold hover:bg-emerald-100 transition-all flex items-center gap-1 mt-2.5"
                    >
                      <Sparkles size={12} /> Use Auto-Allocated Past Savings (+{formatCurrency(autoAllocatedAmount, userProfile)})
                    </button>
                  )}
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedGoal(null)}
                    className="flex-1 px-6 py-3 border border-zinc-200 dark:border-zinc-700 rounded-2xl font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-2xl font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 text-lg"
                  >
                    <Plus size={20} />
                    Add Savings
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
