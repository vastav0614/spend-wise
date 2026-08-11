import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  ArrowLeft, 
  Edit2, 
  Trash2, 
  TrendingUp, 
  Calendar, 
  Tag, 
  FileText, 
  X, 
  Repeat, 
  CheckCircle2 
} from 'lucide-react';
import type { IncomeEntry } from '../types';
import { createIncomeEntry, deleteIncomeEntry, getIncomeEntries, updateIncomeEntry } from '../lib/financeApi';
import { formatCurrency, getStoredUserProfile } from '../lib/userProfile';

const INCOME_SOURCES = [
  'Salary',
  'Freelance',
  'Investment',
  'Bonus',
  'Gift',
  'Refund',
  'Other'
];

type FormData = {
  amount: string;
  source: string;
  date: string;
  notes: string;
  recurrence: 'monthly' | 'one_time';
};

function toYYYYMMDD(rawDate?: string): string {
  if (!rawDate) return new Date().toISOString().split('T')[0];
  const clean = rawDate.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }
  const d = new Date(rawDate);
  if (isNaN(d.getTime())) {
    return new Date().toISOString().split('T')[0];
  }
  return d.toISOString().split('T')[0];
}

function formatDisplayDate(rawDate?: string): string {
  if (!rawDate) return '';
  const ymd = toYYYYMMDD(rawDate);
  const [year, month, day] = ymd.split('-');
  const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
  if (isNaN(dateObj.getTime())) return rawDate;
  return dateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function AddIncomePage() {
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState(getStoredUserProfile);
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState<IncomeEntry | null>(null);
  const [customSource, setCustomSource] = useState('');
  const [formData, setFormData] = useState<FormData>({
    amount: '',
    source: 'Salary',
    date: toYYYYMMDD(),
    notes: '',
    recurrence: 'monthly',
  });

  const loadIncomes = async () => {
    try {
      const fetchedIncomes = await getIncomeEntries();
      setIncomes(fetchedIncomes);
    } catch {
      setIncomes([]);
    }
  };

  useEffect(() => {
    loadIncomes();
    const handleProfileUpdate = () => setUserProfile(getStoredUserProfile());
    const handleDataUpdate = () => loadIncomes();

    window.addEventListener('userProfileUpdated', handleProfileUpdate);
    window.addEventListener('financeDataUpdated', handleDataUpdate);

    return () => {
      window.removeEventListener('userProfileUpdated', handleProfileUpdate);
      window.removeEventListener('financeDataUpdated', handleDataUpdate);
    };
  }, []);

  const openCreateModal = () => {
    setEditingIncome(null);
    setCustomSource('');
    setFormData({
      amount: '',
      source: 'Salary',
      date: toYYYYMMDD(),
      notes: '',
      recurrence: 'monthly',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (income: IncomeEntry) => {
    setEditingIncome(income);
    const isStandard = INCOME_SOURCES.includes(income.source);
    setFormData({
      amount: income.amount.toString(),
      source: isStandard ? income.source : 'Other',
      date: toYYYYMMDD(income.date),
      notes: income.notes || '',
      recurrence: income.recurrence || 'one_time',
    });
    setCustomSource(isStandard ? '' : income.source);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingIncome(null);
    setCustomSource('');
    setFormData({
      amount: '',
      source: 'Salary',
      date: toYYYYMMDD(),
      notes: '',
      recurrence: 'monthly',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const amount = parseFloat(formData.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Please enter a valid income amount greater than zero');
      return;
    }

    const validDate = toYYYYMMDD(formData.date);
    const finalSource = formData.source === 'Other' ? (customSource.trim() || 'Other') : formData.source;

    const entryData: IncomeEntry = {
      id: editingIncome?.id || Date.now().toString(),
      amount,
      source: finalSource,
      date: validDate,
      notes: formData.notes.trim(),
      recurrence: formData.recurrence,
    };

    try {
      if (editingIncome) {
        await updateIncomeEntry(entryData);
      } else {
        await createIncomeEntry(entryData);
      }
      await loadIncomes();
      closeModal();
    } catch {
      alert('Failed to save income entry. Please verify the fields.');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this income record?')) {
      try {
        await deleteIncomeEntry(id);
        await loadIncomes();
      } catch {
        alert('Failed to delete income entry');
      }
    }
  };

  const totalIncomeSum = incomes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 text-zinc-500 hover:text-emerald-500 transition-colors rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-bold dark:text-white">Income Management</h1>
            <p className="text-zinc-500 dark:text-zinc-400">Record, edit, and track all your earnings and recurring income.</p>
          </div>
        </div>
        <button 
          onClick={openCreateModal}
          className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
        >
          <Plus size={18} /> Add New Income
        </button>
      </div>

      {/* Summary Card */}
      <div className="bg-emerald-600 dark:bg-emerald-950/40 p-8 rounded-3xl text-white flex flex-col md:flex-row items-center justify-between gap-6 border border-emerald-500/30">
        <div>
          <p className="text-emerald-100 font-medium mb-1 flex items-center gap-2">
            <TrendingUp size={18} /> Total Recorded Income
          </p>
          <h2 className="text-4xl font-bold">{formatCurrency(totalIncomeSum, userProfile)}</h2>
        </div>
        <div className="text-right">
          <p className="text-emerald-100 text-sm">{incomes.length} Total Record{incomes.length === 1 ? '' : 's'}</p>
          <p className="text-xs text-emerald-200/80 mt-1">
            {incomes.filter(i => i.recurrence === 'monthly').length} Monthly Recurring
          </p>
        </div>
      </div>

      {/* Income Records List */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold dark:text-white">Income Entries</h2>

        {incomes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {incomes.map((income) => (
              <div 
                key={income.id} 
                className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                        <Tag size={18} />
                      </div>
                      <div>
                        <h3 className="font-bold dark:text-white">{income.source}</h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatDisplayDate(income.date)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => openEditModal(income)}
                        className="p-2 text-zinc-400 hover:text-emerald-500 transition-colors"
                        title="Edit Income"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(income.id)}
                        className="p-2 text-zinc-400 hover:text-red-500 transition-colors"
                        title="Delete Income"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {income.notes && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
                      {income.notes}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-zinc-100 dark:border-zinc-800/60">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                    income.recurrence === 'monthly'
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                  }`}>
                    {income.recurrence === 'monthly' ? <Repeat size={12} /> : <CheckCircle2 size={12} />}
                    {income.recurrence === 'monthly' ? 'Monthly Recurring' : 'One-time'}
                  </span>
                  <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    +{formatCurrency(income.amount, userProfile)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 p-12 text-center">
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <TrendingUp size={24} />
            </div>
            <h3 className="font-bold text-lg dark:text-white mb-1">No income entries recorded</h3>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-sm mx-auto mb-6">
              Add your salary, freelance earnings, or investment returns to track your cash flow.
            </p>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
            >
              <Plus size={18} /> Add First Income
            </button>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-emerald-500 text-white">
              <h3 className="text-xl font-bold">{editingIncome ? 'Edit Income Entry' : 'Add Income Entry'}</h3>
              <button onClick={closeModal} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold dark:text-zinc-300 mb-2">Amount</label>
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
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="0.00"
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-14 pr-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold dark:text-zinc-300 mb-2">Income Source</label>
                <div className="relative">
                  <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <select 
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white appearance-none"
                  >
                    {INCOME_SOURCES.map((source) => (
                      <option key={source} value={source}>{source}</option>
                    ))}
                  </select>
                </div>

                {formData.source === 'Other' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      required
                      value={customSource}
                      onChange={(e) => setCustomSource(e.target.value)}
                      placeholder="Specify custom income source..."
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2.5 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white text-sm"
                    />
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 space-y-2">
                <p className="text-sm font-semibold dark:text-zinc-300 flex items-center gap-2">
                  <Repeat size={16} className="text-emerald-500" /> Income Behavior
                </p>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.recurrence === 'monthly'}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        recurrence: e.target.checked ? 'monthly' : 'one_time',
                      })
                    }
                    className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Keep this income the same every month.
                    {formData.recurrence === 'monthly'
                      ? ' Will automatically repeat monthly until updated.'
                      : ' Counts once as a bonus or extra source.'}
                  </span>
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold dark:text-zinc-300">Date</label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, date: toYYYYMMDD() })}
                      className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 transition-colors"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const yesterday = new Date();
                        yesterday.setDate(yesterday.getDate() - 1);
                        setFormData({ ...formData, date: toYYYYMMDD(yesterday.toISOString()) });
                      }}
                      className="text-xs font-semibold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 transition-colors"
                    >
                      Yesterday
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                        setFormData({ ...formData, date: toYYYYMMDD(firstOfMonth.toISOString()) });
                      }}
                      className="text-xs font-semibold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 transition-colors"
                    >
                      1st of Month
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                  <input 
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    onClick={(e) => {
                      try {
                        (e.target as HTMLInputElement).showPicker?.();
                      } catch {}
                    }}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white font-medium cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold dark:text-zinc-300 mb-2">Notes (Optional)</label>
                <div className="relative">
                  <FileText className="absolute left-3.5 top-3 text-zinc-400" size={18} />
                  <textarea 
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Add details (e.g. Q3 bonus, client project name)..."
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white min-h-20 resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
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
                  {editingIncome ? 'Update Income' : 'Save Income'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
