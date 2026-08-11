import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  Edit2, 
  Trash2, 
  ChevronLeft, 
  ChevronRight,
  X
} from 'lucide-react';
import { CATEGORIES, type Expense } from '../types';
import { formatCurrency, getStoredUserProfile } from '../lib/userProfile';
import { deleteExpense, getBudgets, getExpenses, saveBudget, updateExpense } from '../lib/financeApi';

export default function HistoryPage() {
  const [userProfile, setUserProfile] = useState(getStoredUserProfile);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');
  const [expenses, setExpenses] = useState<Expense[]>([]);

  useEffect(() => {
    const syncProfile = () => setUserProfile(getStoredUserProfile());
    window.addEventListener('userProfileUpdated', syncProfile);
    return () => window.removeEventListener('userProfileUpdated', syncProfile);
  }, []);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [customCategory, setCustomCategory] = useState('');
  const [customPaymentMethod, setCustomPaymentMethod] = useState('');
  const [formData, setFormData] = useState({
    amount: '',
    category: 'Food',
    date: '',
    paymentMethod: 'Cash',
    notes: '',
  });

  useEffect(() => {
    const loadExpenses = async () => {
      const savedExpenses = await getExpenses();
      setExpenses(savedExpenses);
    };

    loadExpenses();
    window.addEventListener('financeDataUpdated', loadExpenses);

    return () => {
      window.removeEventListener('financeDataUpdated', loadExpenses);
    };
  }, []);

  const closeEditModal = () => {
    setEditingExpense(null);
    setCustomCategory('');
    setCustomPaymentMethod('');
    setFormData({
      amount: '',
      category: 'Food',
      date: '',
      paymentMethod: 'Cash',
      notes: '',
    });
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    const isStandardCat = (CATEGORIES as readonly string[]).includes(expense.category);
    const standardPaymentMethods = ['UPI', 'Cash', 'Credit Card', 'Debit Card', 'Net Banking', 'Bank Transfer'];
    const isStandardPay = standardPaymentMethods.includes(expense.paymentMethod);

    setFormData({
      amount: expense.amount.toString(),
      category: isStandardCat ? expense.category : 'Other',
      date: expense.date,
      paymentMethod: isStandardPay ? expense.paymentMethod : 'Other',
      notes: expense.notes,
    });
    setCustomCategory(isStandardCat ? '' : expense.category);
    setCustomPaymentMethod(isStandardPay ? '' : expense.paymentMethod);
  };

  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingExpense) {
      return;
    }

    const amount = parseFloat(formData.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    const finalCategory = formData.category === 'Other' ? (customCategory.trim() || 'Other') : formData.category;
    const finalPaymentMethod = formData.paymentMethod === 'Other' ? (customPaymentMethod.trim() || 'Other') : formData.paymentMethod;

    const updatedExpense: Expense = {
      ...editingExpense,
      amount,
      category: finalCategory,
      date: formData.date,
      paymentMethod: finalPaymentMethod,
      notes: formData.notes,
    };

    setExpenses((currentExpenses) =>
      currentExpenses.map((expense) => (expense.id === editingExpense.id ? updatedExpense : expense)),
    );

    await updateExpense(updatedExpense);
    closeEditModal();
  };

  const filteredExpenses = expenses
    .filter(exp => {
      const matchesSearch = exp.notes.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           exp.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === 'All' || exp.category === categoryFilter;
      const matchesDate = !dateFilter || exp.date === dateFilter;
      return matchesSearch && matchesCategory && matchesDate;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm('Are you sure you want to delete this expense? This action cannot be undone.')) {
      return;
    }

    // Find the expense to delete
    const expenseToDelete = expenses.find(exp => exp.id === expenseId);
    if (!expenseToDelete) return;

    // Remove from local state
    const updatedExpenses = expenses.filter(exp => exp.id !== expenseId);
    setExpenses(updatedExpenses);

    // Remove from storage and backend
    await deleteExpense(expenseId);
  };

  const handleExportPDF = () => {
    const reportWindow = window.open('', '_blank', 'width=900,height=700');

    if (!reportWindow) {
      alert('Please allow popups to export the PDF report.');
      return;
    }

    const totalAmount = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const reportDate = new Date().toLocaleString();
    const rows = filteredExpenses
      .map(
        (expense) => `
          <tr>
            <td>${escapeHtml(expense.date)}</td>
            <td>${escapeHtml(expense.category)}</td>
            <td>${escapeHtml(formatCurrency(expense.amount, userProfile))}</td>
            <td>${escapeHtml(expense.paymentMethod)}</td>
            <td>${escapeHtml(expense.notes || '-')}</td>
          </tr>
        `,
      )
      .join('');

    reportWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <title>SpendWise Expense Report</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 32px;
              color: #18181b;
            }
            h1 {
              margin: 0 0 8px;
              font-size: 28px;
            }
            .meta {
              margin-bottom: 24px;
              color: #52525b;
              font-size: 14px;
            }
            .summary {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 12px;
              margin-bottom: 24px;
            }
            .card {
              border: 1px solid #e4e4e7;
              border-radius: 12px;
              padding: 16px;
            }
            .label {
              font-size: 12px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              color: #71717a;
              margin-bottom: 6px;
            }
            .value {
              font-size: 20px;
              font-weight: 700;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th, td {
              border: 1px solid #e4e4e7;
              padding: 12px;
              text-align: left;
              font-size: 14px;
              vertical-align: top;
            }
            th {
              background: #f4f4f5;
            }
            @media print {
              body {
                margin: 18px;
              }
            }
          </style>
        </head>
        <body>
          <h1>Expense Report</h1>
          <div class="meta">Generated on ${escapeHtml(reportDate)}</div>
          <div class="summary">
            <div class="card">
              <div class="label">Entries</div>
              <div class="value">${filteredExpenses.length}</div>
            </div>
            <div class="card">
              <div class="label">Total Amount</div>
              <div class="value">${escapeHtml(formatCurrency(totalAmount, userProfile))}</div>
            </div>
            <div class="card">
              <div class="label">Filter</div>
              <div class="value">${escapeHtml(categoryFilter === 'All' ? 'All Categories' : categoryFilter)}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Payment Method</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="5">No expenses found for the selected filters.</td></tr>'}
            </tbody>
          </table>
          <script>
            window.onload = () => {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    reportWindow.document.close();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">Expense History</h1>
          <p className="text-zinc-500 dark:text-zinc-400">View and manage all your past transactions.</p>
        </div>
        <button onClick={handleExportPDF} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-medium dark:text-zinc-300 hover:bg-zinc-50 transition-colors">
          <Download size={16} /> Export PDF
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input 
            type="text" 
            placeholder="Search by keyword..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 pl-10 pr-4 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all dark:text-white"
          />
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
            <select 
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 pl-10 pr-8 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all dark:text-white appearance-none text-sm"
            >
              <option value="All">All Categories</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <input 
            type="date" 
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 px-4 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all dark:text-white text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Method</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Notes</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filteredExpenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group">
                  <td className="px-6 py-4 text-sm dark:text-zinc-300 font-medium">{exp.date}</td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-full text-xs font-bold">
                      {exp.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold dark:text-white">{formatCurrency(exp.amount, userProfile)}</td>
                  <td className="px-6 py-4 text-sm text-zinc-500 dark:text-zinc-400">{exp.paymentMethod}</td>
                  <td className="px-6 py-4 text-sm text-zinc-500 dark:text-zinc-400 truncate max-w-[200px]">{exp.notes}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEditExpense(exp)} className="p-2 text-zinc-400 hover:text-emerald-500 transition-colors">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDeleteExpense(exp.id)} className="p-2 text-zinc-400 hover:text-red-500 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Showing <span className="font-bold">1</span> to <span className="font-bold">{filteredExpenses.length}</span> of <span className="font-bold">{filteredExpenses.length}</span> results
          </p>
          <div className="flex items-center gap-2">
            <button className="p-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-400 hover:bg-white dark:hover:bg-zinc-800 transition-colors disabled:opacity-50" disabled>
              <ChevronLeft size={18} />
            </button>
            <button className="p-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-400 hover:bg-white dark:hover:bg-zinc-800 transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {editingExpense && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl max-w-2xl w-full overflow-hidden">
            <div className="bg-emerald-500 p-6 text-white flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Edit Expense</h2>
                <p className="text-emerald-50/80">Update the transaction details and save your changes.</p>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                aria-label="Close edit expense form"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdateExpense} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold dark:text-zinc-300">Amount</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold dark:text-zinc-300">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white"
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>

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
                  <label className="text-sm font-semibold dark:text-zinc-300">Date</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold dark:text-zinc-300">Payment Method</label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white"
                  >
                    <option value="UPI">UPI (GPay / PhonePe / Paytm)</option>
                    <option value="Cash">Cash</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Debit Card">Debit Card</option>
                    <option value="Net Banking">Net Banking</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Other">Other</option>
                  </select>

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

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-semibold dark:text-zinc-300">Notes</label>
                  <textarea
                    rows={3}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="flex-1 px-6 py-3 border border-zinc-200 dark:border-zinc-800 rounded-xl font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-emerald-500 text-white py-3 rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
