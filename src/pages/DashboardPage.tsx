import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  CreditCard,
  X,
  History,
  Target,
  Settings,
  PiggyBank,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import type { EMIPlan, IncomeEntry } from '../types';
import { formatCurrency, getStoredUserProfile } from '../lib/userProfile';
import { createEmiPlan, deleteEmiPlan, getBudgets, getEmiPlans, getExpenses, getIncomeEntries } from '../lib/financeApi';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1'];

const emptyEmiForm = {
  name: '',
  monthlyAmount: '',
  startDate: new Date().toISOString().split('T')[0],
  durationMonths: '12',
};

function toLocalYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addMonths(dateString: string, monthsToAdd: number) {
  const cleanDate = dateString.split('T')[0];
  const date = new Date(cleanDate);
  if (isNaN(date.getTime())) return dateString;
  const day = date.getDate();
  const nextDate = new Date(date.getFullYear(), date.getMonth() + monthsToAdd, 1);
  const maxDays = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
  nextDate.setDate(Math.min(day, maxDays));
  return toLocalYYYYMMDD(nextDate);
}

function getMonthKey(dateString: string) {
  if (!dateString) return '1970-01';
  const clean = dateString.split('T')[0];
  const parts = clean.split('-');
  if (parts.length >= 2) {
    return `${parts[0]}-${parts[1].padStart(2, '0')}`;
  }
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '1970-01';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthStart(dateString: string) {
  const clean = dateString.split('T')[0];
  const date = new Date(clean);
  if (isNaN(date.getTime())) return new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getEmiInstallments(emiPlans: EMIPlan[]) {
  const today = new Date();

  return emiPlans.flatMap((plan) => {
    const installments = [];

    for (let installmentNumber = 0; installmentNumber < plan.durationMonths; installmentNumber += 1) {
      const installmentDate = addMonths(plan.startDate, installmentNumber);
      const installmentMonth = new Date(installmentDate);

      if (installmentMonth > today) {
        break;
      }

      installments.push({
        id: `${plan.id}-${installmentNumber + 1}`,
        amount: plan.monthlyAmount,
        category: 'EMI',
        date: installmentDate,
        paymentMethod: 'Auto Debit',
        notes: `${plan.name} - installment ${installmentNumber + 1} of ${plan.durationMonths}`,
      });
    }

    return installments;
  });
}

export default function DashboardPage() {
  const [userProfile, setUserProfile] = useState(getStoredUserProfile);
  const navigate = useNavigate();
  const [previousSavings, setPreviousSavings] = useState(0);
  const [totalAvailableBalance, setTotalAvailableBalance] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalBudget, setTotalBudget] = useState(0);
  const [monthlyEmiTotal, setMonthlyEmiTotal] = useState(0);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [monthlyChartData, setMonthlyChartData] = useState<any[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [timePeriod, setTimePeriod] = useState('all');
  const [emiPlans, setEmiPlans] = useState<EMIPlan[]>([]);
  const [isEmiModalOpen, setIsEmiModalOpen] = useState(false);
  const [emiForm, setEmiForm] = useState(emptyEmiForm);

  useEffect(() => {
    const handleProfileUpdate = () => {
      setUserProfile(getStoredUserProfile());
    };

    const checkHash = () => {
      if (window.location.hash === '#emi') {
        setIsEmiModalOpen(true);
      }
    };

    checkHash();
    window.addEventListener('hashchange', checkHash);
    window.addEventListener('userProfileUpdated', handleProfileUpdate);
    return () => {
      window.removeEventListener('hashchange', checkHash);
      window.removeEventListener('userProfileUpdated', handleProfileUpdate);
    };
  }, []);

  const loadData = async () => {
    const expenses = await getExpenses();
    const storedIncome: IncomeEntry[] = (await getIncomeEntries()).map((entry: any) => ({
      ...entry,
      recurrence: entry.recurrence ?? 'one_time',
    }));
    const budgets = await getBudgets();
    const storedEmis = await getEmiPlans();
    const emiInstallments = getEmiInstallments(storedEmis);
    const allExpenses = [...expenses, ...emiInstallments];
    const thisMonthKey = getMonthKey(new Date().toISOString());

    setEmiPlans(storedEmis);
    setMonthlyEmiTotal(
      emiInstallments
        .filter((expense: any) => getMonthKey(expense.date) === thisMonthKey)
        .reduce((sum: number, expense: any) => sum + expense.amount, 0),
    );

    // Calculate previous months unspent balance (previous savings)
    const currentMonthKey = getMonthKey(toLocalYYYYMMDD(new Date()));
    const pastIncomes = storedIncome.filter((inc: IncomeEntry) => getMonthKey(inc.date) < currentMonthKey);
    const pastExpenses = allExpenses.filter((exp: any) => getMonthKey(exp.date) < currentMonthKey);
    const pastIncomeTotal = pastIncomes.reduce((sum: number, inc: IncomeEntry) => sum + (inc.amount || 0), 0);
    const pastExpenseTotal = pastExpenses.reduce((sum: number, exp: any) => sum + (exp.amount || 0), 0);
    const calcPreviousSavings = Math.round((pastIncomeTotal - pastExpenseTotal + Number.EPSILON) * 100) / 100;
    setPreviousSavings(calcPreviousSavings);

    // Calculate total all-time available balance (All Income - All Expenses)
    const allTimeIncomeTotal = storedIncome.reduce((sum: number, inc: IncomeEntry) => sum + (inc.amount || 0), 0);
    const allTimeExpenseTotal = allExpenses.reduce((sum: number, exp: any) => sum + (exp.amount || 0), 0);
    const calcTotalAvailableBalance = Math.round((allTimeIncomeTotal - allTimeExpenseTotal + Number.EPSILON) * 100) / 100;
    setTotalAvailableBalance(calcTotalAvailableBalance);

    const filtered = allExpenses.filter((exp: any) => {
      const matchesSearch =
        exp.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        exp.notes.toLowerCase().includes(searchTerm.toLowerCase());

      let matchesDate = true;
      if (dateFrom) {
        matchesDate = matchesDate && exp.date >= dateFrom;
      }
      if (dateTo) {
        matchesDate = matchesDate && exp.date <= dateTo;
      }

      if (timePeriod !== 'all') {
        const expDate = new Date(exp.date);
        const today = new Date();
        const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
        const oneYearAgo = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);

        switch (timePeriod) {
          case '30':
            matchesDate = matchesDate && expDate >= thirtyDaysAgo;
            break;
          case '90':
            matchesDate = matchesDate && expDate >= ninetyDaysAgo;
            break;
          case '365':
            matchesDate = matchesDate && expDate >= oneYearAgo;
            break;
        }
      }

      return matchesSearch && matchesDate;
    });

    const presentMonthExpenses = (!dateFrom && !dateTo && timePeriod === 'all')
      ? allExpenses.filter((exp: any) => getMonthKey(exp.date) === currentMonthKey)
      : filtered;

    const total = presentMonthExpenses.reduce((sum: number, exp: any) => sum + (exp.amount || 0), 0);
    setTotalExpenses(total);

    const filteredIncome = (!dateFrom && !dateTo && timePeriod === 'all')
      ? storedIncome.filter((inc: IncomeEntry) => getMonthKey(inc.date) === currentMonthKey)
      : storedIncome.filter((inc: IncomeEntry) => {
          let matchesDate = true;

          if (dateFrom) {
            matchesDate = matchesDate && inc.date >= dateFrom;
          }
          if (dateTo) {
            matchesDate = matchesDate && inc.date <= dateTo;
          }

          if (timePeriod !== 'all') {
            const incomeDate = new Date(inc.date);
            const today = new Date();
            const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
            const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
            const oneYearAgo = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);

            switch (timePeriod) {
              case '30':
                matchesDate = matchesDate && incomeDate >= thirtyDaysAgo;
                break;
              case '90':
                matchesDate = matchesDate && incomeDate >= ninetyDaysAgo;
                break;
              case '365':
                matchesDate = matchesDate && incomeDate >= oneYearAgo;
                break;
            }
          }

          return matchesDate;
        });

    const allIncomeForChart = storedIncome.filter((inc: IncomeEntry) => {
      let matchesDate = true;

      if (dateFrom) {
        matchesDate = matchesDate && inc.date >= dateFrom;
      }
      if (dateTo) {
        matchesDate = matchesDate && inc.date <= dateTo;
      }

      if (timePeriod !== 'all') {
        const incomeDate = new Date(inc.date);
        const today = new Date();
        const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
        const oneYearAgo = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);

        switch (timePeriod) {
          case '30':
            matchesDate = matchesDate && incomeDate >= thirtyDaysAgo;
            break;
          case '90':
            matchesDate = matchesDate && incomeDate >= ninetyDaysAgo;
            break;
          case '365':
            matchesDate = matchesDate && incomeDate >= oneYearAgo;
            break;
        }
      }

      return matchesDate;
    });

    const incomeTotal = filteredIncome.reduce((sum: number, inc: IncomeEntry) => sum + (inc.amount || 0), 0);
    setTotalIncome(incomeTotal);

    const budgetTotal = budgets.reduce(
      (sum: number, budget) => sum + (Number.isFinite(budget.limit) ? budget.limit : 0),
      0,
    );
    setTotalBudget(Math.round(budgetTotal * 100) / 100);

    const categoryMap = new Map();
    filtered.forEach((exp: any) => {
      const current = categoryMap.get(exp.category) || 0;
      categoryMap.set(exp.category, current + exp.amount);
    });

    const categoryBreakdown = Array.from(categoryMap.entries()).map(([name, value]) => ({
      name,
      value: parseFloat(value.toFixed(2)),
    }));
    setCategoryData(categoryBreakdown);

    const monthlyMap = new Map();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const today = new Date();

    let monthCount = 6;
    if (timePeriod === '365') {
      monthCount = 12;
    } else if (timePeriod === '90') {
      monthCount = 3;
    } else if (timePeriod === '30') {
      monthCount = 2;
    } else if (timePeriod === 'all') {
      monthCount = 6;
      // Expand month count if transactions exist older than 6 months
      const allDates = [...filtered.map((e: any) => e.date), ...allIncomeForChart.map((i: IncomeEntry) => i.date)].filter(Boolean);
      if (allDates.length > 0) {
        const earliestDate = new Date(Math.min(...allDates.map((d) => new Date(d).getTime())));
        if (!isNaN(earliestDate.getTime())) {
          const monthDiff = (today.getFullYear() - earliestDate.getFullYear()) * 12 + (today.getMonth() - earliestDate.getMonth()) + 1;
          monthCount = Math.max(6, Math.min(monthDiff, 24));
        }
      }
    }

    for (let i = monthCount - 1; i >= 0; i -= 1) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = monthCount > 6 ? `${months[date.getMonth()]} '${String(date.getFullYear()).slice(-2)}` : months[date.getMonth()];
      monthlyMap.set(monthKey, { name: label, income: 0, expenses: 0 });
    }

    filtered.forEach((exp: any) => {
      const monthKey = getMonthKey(exp.date);
      if (monthlyMap.has(monthKey)) {
        monthlyMap.get(monthKey).expenses += exp.amount;
      }
    });

    allIncomeForChart.forEach((inc: IncomeEntry) => {
      const monthKey = getMonthKey(inc.date);
      if (monthlyMap.has(monthKey)) {
        monthlyMap.get(monthKey).income += inc.amount;
      }
    });

    const chartData = Array.from(monthlyMap.values()).map((item: any) => ({
      ...item,
      income: Math.round((item.income + Number.EPSILON) * 100) / 100,
      expenses: Math.round((item.expenses + Number.EPSILON) * 100) / 100,
    }));

    setMonthlyChartData(chartData);

    const recent = [...filtered]
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
    setRecentExpenses(recent);
  };

  useEffect(() => {
    loadData().catch(() => {
      // Fallbacks are handled inside financeApi.
    });
  }, [searchTerm, dateFrom, dateTo, timePeriod]);

  useEffect(() => {
    const handleGlobalSearch = (e: any) => {
      setSearchTerm(e.detail.term);
    };

    const refreshDashboard = () => {
      loadData().catch(() => {
        // Fallbacks are handled inside financeApi.
      });
    };

    window.addEventListener('globalSearch', handleGlobalSearch);
    window.addEventListener('storage', refreshDashboard);
    window.addEventListener('financeDataUpdated', refreshDashboard);

    return () => {
      window.removeEventListener('globalSearch', handleGlobalSearch);
      window.removeEventListener('storage', refreshDashboard);
      window.removeEventListener('financeDataUpdated', refreshDashboard);
    };
  }, []);

  const handleAddEmi = async (e: React.FormEvent) => {
    e.preventDefault();

    const monthlyAmount = parseFloat(emiForm.monthlyAmount);
    const durationMonths = parseInt(emiForm.durationMonths, 10);

    if (!emiForm.name.trim()) {
      alert('Please enter an EMI name');
      return;
    }

    if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) {
      alert('Please enter a valid monthly EMI amount');
      return;
    }

    if (!Number.isFinite(durationMonths) || durationMonths <= 0) {
      alert('Please enter a valid EMI duration');
      return;
    }

    const updatedEmis = [
      {
        id: Date.now().toString(),
        name: emiForm.name.trim(),
        monthlyAmount,
        startDate: emiForm.startDate,
        durationMonths,
      },
      ...emiPlans,
    ];

    await createEmiPlan(updatedEmis[0]);
    setEmiPlans(updatedEmis);
    setEmiForm(emptyEmiForm);
    setIsEmiModalOpen(false);
    await loadData();
  };

  const handleDeleteEmi = async (emiId: string) => {
    if (!confirm('Are you sure you want to delete this EMI plan?')) {
      return;
    }

    const updatedEmis = emiPlans.filter((emi) => emi.id !== emiId);
    await deleteEmiPlan(emiId);
    setEmiPlans(updatedEmis);
    await loadData();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold dark:text-white">Dashboard Overview</h1>
            <p className="text-zinc-500 dark:text-zinc-400">Welcome back, {userProfile.fullName}! Here's what's happening with your money.</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <select
            value={timePeriod}
            onChange={(e) => setTimePeriod(e.target.value)}
            className="px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-medium dark:text-zinc-300 hover:bg-zinc-50 transition-colors"
          >
            <option value="all">All Time</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
            <option value="365">Last Year</option>
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-medium dark:text-zinc-300 dark:text-white"
          />

          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-medium dark:text-zinc-300 dark:text-white"
          />

          <input
            type="text"
            placeholder="Search by category or notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-medium dark:text-zinc-300 dark:text-white flex-1"
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-8">
        <button
          onClick={() => navigate('/history')}
          className="flex flex-col items-center gap-2 p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:shadow-md transition-all group"
        >
          <History className="w-7 h-7 text-zinc-500 group-hover:text-blue-500 transition-colors" />
          <span className="font-medium text-sm dark:text-white">History</span>
        </button>
        <button
          onClick={() => setIsEmiModalOpen(true)}
          className="flex flex-col items-center gap-2 p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:shadow-md transition-all group"
        >
          <CreditCard className="w-7 h-7 text-zinc-500 group-hover:text-amber-500 transition-colors" />
          <span className="font-medium text-sm dark:text-white">EMI Plans</span>
        </button>
        <button
          onClick={() => navigate('/budget')}
          className="flex flex-col items-center gap-2 p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:shadow-md transition-all group"
        >
          <Wallet className="w-7 h-7 text-zinc-500 group-hover:text-emerald-500 transition-colors" />
          <span className="font-medium text-sm dark:text-white">Budget</span>
        </button>
        <button
          onClick={() => navigate('/savings')}
          className="flex flex-col items-center gap-2 p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:shadow-md transition-all group"
        >
          <Target className="w-7 h-7 text-zinc-500 group-hover:text-purple-500 transition-colors" />
          <span className="font-medium text-sm dark:text-white">Savings</span>
        </button>
        <button
          onClick={() => navigate('/settings')}
          className="flex flex-col items-center gap-2 p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:shadow-md transition-all group"
        >
          <Settings className="w-7 h-7 text-zinc-500 group-hover:text-gray-500 transition-colors" />
          <span className="font-medium text-sm dark:text-white">Settings</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <StatCard
          title="Total Income"
          amount={formatCurrency(totalIncome, userProfile)}
          change={totalIncome > 0 ? `+${((totalIncome - totalExpenses) / totalIncome * 100).toFixed(1)}% saved` : 'Add income'}
          isPositive
          icon={<TrendingUp className="text-emerald-500" />}
          color="emerald"
        />
        <StatCard
          title="Total Expenses"
          amount={formatCurrency(totalExpenses, userProfile)}
          change={totalIncome > 0 ? `${((totalExpenses / totalIncome) * 100).toFixed(1)}% of income` : 'No income'}
          isPositive={totalExpenses <= totalIncome}
          icon={<TrendingDown className={totalExpenses > totalIncome ? 'text-red-500' : 'text-orange-500'} />}
          color="red"
        />
        <StatCard
          title="Previous Savings"
          amount={formatCurrency(previousSavings, userProfile)}
          change="Rollover from past months"
          isPositive={previousSavings >= 0}
          icon={<PiggyBank className="text-teal-500" />}
          color="emerald"
        />
        <StatCard
          title="Total Budget"
          amount={formatCurrency(totalBudget, userProfile)}
          change={totalBudget > 0 ? `${((totalExpenses / totalBudget) * 100).toFixed(1)}% used` : 'No budget set'}
          isPositive={totalExpenses <= totalBudget || totalBudget === 0}
          icon={<Wallet className="text-blue-500" />}
          color="blue"
        />
        <StatCard
          title="Monthly EMI"
          amount={formatCurrency(monthlyEmiTotal, userProfile)}
          change={emiPlans.length > 0 ? `${emiPlans.length} active plan${emiPlans.length === 1 ? '' : 's'}` : 'No EMI plans'}
          isPositive={monthlyEmiTotal === 0}
          icon={<CreditCard className="text-amber-500" />}
          color="amber"
        />
        <StatCard
          title="Total Available Balance"
          amount={formatCurrency(totalAvailableBalance, userProfile)}
          change={totalAvailableBalance >= 0 ? 'Total net available balance' : 'Net account deficit'}
          isPositive={totalAvailableBalance >= 0}
          icon={<ArrowUpRight className="text-purple-500" />}
          color="purple"
        />
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <button
          onClick={() => navigate('/add-income')}
          className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 w-full md:w-auto"
        >
          <Plus size={18} /> Add Income
        </button>
        <button
          onClick={() => setIsEmiModalOpen(true)}
          className="flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition-all shadow-lg w-full md:w-auto"
        >
          <CreditCard size={18} /> Add EMI
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-bold dark:text-white">EMI Plans</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Each active EMI is automatically counted as a monthly deduction on your dashboard.</p>
          </div>
        </div>

        {emiPlans.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {emiPlans.map((emi) => (
              <div key={emi.id} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 bg-zinc-50 dark:bg-zinc-950">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-bold dark:text-white">{emi.name}</p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Starts {emi.startDate} for {emi.durationMonths} months</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteEmi(emi.id)}
                    className="text-sm font-semibold text-red-500 hover:text-red-600 transition-colors"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider text-zinc-400 font-bold">Monthly deduction</span>
                  <span className="text-lg font-bold dark:text-white">{formatCurrency(emi.monthlyAmount, userProfile)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-8 text-center text-zinc-500 dark:text-zinc-400">
            No EMI plans yet. Add one and the dashboard will reduce your balance every month automatically.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold dark:text-white">Income vs Expenses</h3>
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></div>
                <span className="dark:text-zinc-400">Income</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 bg-red-500 rounded-full"></div>
                <span className="dark:text-zinc-400">Expenses + EMI</span>
              </div>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f4620" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} dy={10} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  tickFormatter={(val) => `${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    formatCurrency(Number(value) || 0, userProfile),
                    String(name).toLowerCase().includes('income') ? 'Income' : 'Expenses + EMI',
                  ]}
                  cursor={{ fill: 'rgba(16, 185, 129, 0.05)' }}
                />
                <Bar name="Income" dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar name="Expenses + EMI" dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <h3 className="font-bold dark:text-white mb-8">Category Breakdown</h3>
          {categoryData.length > 0 ? (
            <div className="h-[300px] w-full flex items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3 pr-4">
                {categoryData.slice(0, 4).map((item, i) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i] }}></div>
                    <span className="text-xs font-medium dark:text-zinc-400">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[300px] w-full flex items-center justify-center">
              <p className="text-zinc-500 dark:text-zinc-400">No expenses yet. Start adding expenses or EMI to see the breakdown.</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <h3 className="font-bold dark:text-white mb-8">Spending Trends</h3>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlyChartData}>
              <defs>
                <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip />
              <Area type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorExpenses)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
          <h3 className="font-bold dark:text-white">Recent Transactions</h3>
        </div>
        {recentExpenses.length > 0 ? (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {recentExpenses.map((expense, idx) => (
              <div key={`${expense.id}-${idx}`} className="p-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg flex items-center justify-center text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {expense.category.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium dark:text-white">{expense.category}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{expense.date}</p>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold dark:text-white">{formatCurrency(expense.amount, userProfile)}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{expense.paymentMethod}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-zinc-500 dark:text-zinc-400">
            No recent transactions. Start adding expenses!
          </div>
        )}
      </div>

      {isEmiModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl max-w-xl w-full overflow-hidden">
            <div className="bg-zinc-900 p-6 text-white flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Add EMI Plan</h2>
                <p className="text-zinc-300">This EMI will automatically reduce your balance every month.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEmiModalOpen(false);
                  setEmiForm(emptyEmiForm);
                }}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddEmi} className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold dark:text-zinc-300">EMI Name</label>
                <input
                  type="text"
                  required
                  value={emiForm.name}
                  onChange={(e) => setEmiForm({ ...emiForm, name: e.target.value })}
                  placeholder="Bike Loan"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-sm font-semibold dark:text-zinc-300">Monthly Amount</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={emiForm.monthlyAmount}
                    onChange={(e) => setEmiForm({ ...emiForm, monthlyAmount: e.target.value })}
                    placeholder="2500"
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold dark:text-zinc-300">Duration (Months)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="1"
                    value={emiForm.durationMonths}
                    onChange={(e) => setEmiForm({ ...emiForm, durationMonths: e.target.value })}
                    placeholder="12"
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold dark:text-zinc-300">Start Date</label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEmiForm({ ...emiForm, startDate: new Date().toISOString().split('T')[0] })}
                      className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 transition-colors"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                        setEmiForm({ ...emiForm, startDate: firstOfMonth.toISOString().split('T')[0] });
                      }}
                      className="text-xs font-semibold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 transition-colors"
                    >
                      1st of Month
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                        setEmiForm({ ...emiForm, startDate: lastMonth.toISOString().split('T')[0] });
                      }}
                      className="text-xs font-semibold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 transition-colors"
                    >
                      Last Month
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={emiForm.startDate}
                    onChange={(e) => setEmiForm({ ...emiForm, startDate: e.target.value })}
                    onClick={(e) => {
                      try {
                        (e.target as HTMLInputElement).showPicker?.();
                      } catch {}
                    }}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEmiModalOpen(false);
                    setEmiForm(emptyEmiForm);
                  }}
                  className="flex-1 px-6 py-3 border border-zinc-200 dark:border-zinc-800 rounded-xl font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-emerald-500 text-white py-3 rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
                >
                  Save EMI
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, amount, change, isPositive, icon, color }: any) {
  const getBgColor = (colorName: string) => {
    const colors: any = {
      emerald: 'bg-emerald-50 dark:bg-emerald-950/30',
      red: 'bg-red-50 dark:bg-red-950/30',
      blue: 'bg-blue-50 dark:bg-blue-950/30',
      amber: 'bg-amber-50 dark:bg-amber-950/30',
      purple: 'bg-purple-50 dark:bg-purple-950/30',
    };
    return colors[colorName] || colors.emerald;
  };

  return (
    <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 ${getBgColor(color)} rounded-2xl flex items-center justify-center`}>
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-sm font-bold ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
          {isPositive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
          {change}
        </div>
      </div>
      <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium mb-1">{title}</p>
      <h2 className="text-2xl font-bold dark:text-white tracking-tight">{amount}</h2>
    </div>
  );
}
