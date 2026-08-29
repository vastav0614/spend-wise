import React, { useState, useEffect } from 'react';
import { Bell, Search, Sun, Moon, User, X, Menu, LayoutDashboard, PlusCircle, History, Wallet, Target, Settings, LogOut, DollarSign, CreditCard } from 'lucide-react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { formatCurrency, getStoredUserProfile, type UserProfile } from '../lib/userProfile';
import { logOut } from '../lib/auth';
import { cn } from '../lib/utils';
import { getSavingsGoals } from '../lib/financeApi';
import type { SavingsGoal } from '../types';

import { getDarkMode, toggleDarkMode } from '../lib/theme';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'budget' | 'reminder' | 'info' | 'savings';
  timestamp: Date;
  read: boolean;
}

function readStoredValue<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: PlusCircle, label: 'Add Expense', path: '/add-expense' },
  { icon: DollarSign, label: 'Add Income', path: '/add-income' },
  { icon: CreditCard, label: 'EMI Plans', path: '/dashboard#emi' },
  { icon: History, label: 'History', path: '/history' },
  { icon: Wallet, label: 'Budget', path: '/budget' },
  { icon: Target, label: 'Savings', path: '/savings' },
  { icon: Settings, label: 'Settings', path: '/settings' },
  { icon: LogOut, label: 'Logout', path: '/' },
];

export default function Navbar() {
  const [isDark, setIsDark] = useState(getDarkMode);
  const [searchTerm, setSearchTerm] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(getStoredUserProfile);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleThemeChange = (e: CustomEvent<{ isDark: boolean }>) => {
      setIsDark(e.detail.isDark);
    };

    window.addEventListener('themeChanged', handleThemeChange as EventListener);
    return () => {
      window.removeEventListener('themeChanged', handleThemeChange as EventListener);
    };
  }, []);

  // Load notifications from localStorage
  useEffect(() => {
    const syncProfile = () => {
      setProfile(getStoredUserProfile());
    };

    syncProfile();
    window.addEventListener('userProfileUpdated', syncProfile);

    return () => {
      window.removeEventListener('userProfileUpdated', syncProfile);
    };
  }, []);

  useEffect(() => {
    const parsed = readStoredValue<Notification[] | null>('notifications', null);
    if (parsed) {
      setNotifications(parsed.map((n: any) => ({ ...n, timestamp: new Date(n.timestamp) })));
    } else {
      // Add a welcome notification for first-time users
      addNotification({
        title: 'Welcome to SpendWise!',
        message: 'Start by adding your income and setting up budgets to track your expenses.',
        type: 'info'
      });
    }
  }, []);

  // Check for budget alerts
  useEffect(() => {
    const checkBudgetAlerts = () => {
      const budgets = readStoredValue<any[]>('budgets', []);
      const expenses = readStoredValue<any[]>('expenses', []);

      budgets.forEach((budget: any) => {
        const categoryExpenses = expenses
          .filter((exp: any) => exp.category === budget.category)
          .reduce((sum: number, exp: any) => sum + exp.amount, 0);

        const percentage = (categoryExpenses / budget.limit) * 100;

        if (percentage >= 80 && percentage < 100) {
          // Warning notification
          const existingNotification = notifications.find(
            n => n.type === 'budget' && n.message.includes(budget.category) && n.message.includes('80%')
          );
          if (!existingNotification) {
            addNotification({
              title: 'Budget Warning',
              message: `${budget.category} budget is ${percentage.toFixed(1)}% used`,
              type: 'budget'
            });
          }
        } else if (percentage >= 100) {
          // Over budget notification
          const existingNotification = notifications.find(
            n => n.type === 'budget' && n.message.includes(budget.category) && n.message.includes('exceeded')
          );
          if (!existingNotification) {
            addNotification({
              title: 'Budget Exceeded',
              message: `${budget.category} budget has been exceeded by ${formatCurrency(categoryExpenses - budget.limit, profile)}`,
              type: 'budget'
            });
          }
        }
      });
    };

    checkBudgetAlerts();
    // Check every 30 seconds
    const interval = setInterval(checkBudgetAlerts, 30000);
    return () => clearInterval(interval);
  }, [notifications, profile]);

  // Check for savings alerts (last 3 days of month)
  useEffect(() => {
    const checkSavingsAlerts = async () => {
      try {
        const savingsGoals = await getSavingsGoals();
        if (savingsGoals.length === 0) return;

        const now = new Date();
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const daysToMonthEnd = Math.ceil((lastDayOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysToMonthEnd > 3) return; // Only last 3 days

        let lowProgressCount = 0;
        let totalProgress = 0;
        let urgentGoals: string[] = [];

        savingsGoals.forEach((goal) => {
          const progress = (goal.currentAmount / goal.targetAmount) * 100;
          totalProgress += progress;
          if (progress < 80) {
            lowProgressCount++;
            urgentGoals.push(goal.name);
          }
        });

        const avgProgress = totalProgress / savingsGoals.length;

        if (avgProgress < 80 && !notifications.some(n => n.type === 'savings' && n.message.includes('month-end'))) {
          addNotification({
            title: 'Month-End Savings Reminder',
            message: `Only ${daysToMonthEnd} days left in the month. Average savings progress: ${avgProgress.toFixed(1)}%. Focus on: ${urgentGoals.slice(0, 2).join(', ') || 'your goals'}${urgentGoals.length > 2 ? '...' : ''}`,
            type: 'savings'
          });
        }
      } catch (e) {
        // Silent fail for savings alerts
      }
    };

    checkSavingsAlerts();
    const interval = setInterval(checkSavingsAlerts, 30000);
    return () => clearInterval(interval);
  }, [notifications]);

  const addNotification = (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: Date.now().toString(),
      timestamp: new Date(),
      read: false
    };
    setNotifications(prev => [newNotification, ...prev]);
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  };

  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    const updated = notifications.filter(n => n.id !== id);
    localStorage.setItem('notifications', JSON.stringify(updated));
  };

  // Close notifications and menu dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.notification-dropdown')) {
        setShowNotifications(false);
      }
      if (!target.closest('.nav-menu-dropdown')) {
        setShowMenu(false);
      }
    };

    if (showNotifications || showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications, showMenu]);

  useEffect(() => {
    localStorage.setItem('notifications', JSON.stringify(notifications.map((n: Notification) => ({
      ...n,
      timestamp: n.timestamp.toISOString()
    }))));
  }, [notifications]);

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Dispatch custom event that can be listened to by other components
    window.dispatchEvent(new CustomEvent('globalSearch', { detail: { term: searchTerm } }));
  };

  return (
    <div className="sticky top-0 z-30 flex flex-col w-full">
      <header className="h-16 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Mobile Menu Dropdown */}
          <div className="relative nav-menu-dropdown lg:hidden">
            <button 
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition-colors flex items-center gap-2"
            >
              <Menu size={24} />
            </button>

          {showMenu && (
            <div className="absolute left-0 top-12 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 lg:hidden">
              <nav className="flex flex-col p-3 space-y-1">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path || (item.path === '/' && location.pathname === '/dashboard');
                  const isLogout = item.path === '/';
                  
                  if (isLogout) {
                    return (
                      <button
                        key={item.path}
                        onClick={async () => {
                          setShowMenu(false);
                          await logOut();
                          localStorage.removeItem('userProfile');
                          window.dispatchEvent(new CustomEvent('userProfileUpdated'));
                          navigate('/login');
                        }}
                        className="flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group w-full text-left text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        <item.icon size={18} className="group-hover:text-red-500" />
                        <span className="font-medium text-sm">{item.label}</span>
                      </button>
                    );
                  }
                  
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setShowMenu(false)}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group",
                        isActive 
                          ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                          : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      )}
                    >
                      <item.icon size={18} className={cn(isActive ? "text-white" : "group-hover:text-emerald-500")} />
                      <span className="font-medium text-sm">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          )}
        </div>
        {/* Desktop Logo */}
        <div className="hidden lg:flex items-center gap-2">
          <img src="/logo.png" alt="Spendwise" className="w-8 h-8 rounded-lg object-cover shadow-sm shadow-emerald-500/20" />
          <span className="font-bold text-xl tracking-tight dark:text-white">SpendWise</span>
        </div>
      </div>

      <div className="flex-1 max-w-md hidden md:flex ml-6">
        <form onSubmit={handleSearch} className="relative group w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-emerald-500 transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Search transactions..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-100 dark:bg-zinc-900 border-none rounded-full py-2 pl-10 pr-4 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none dark:text-white"
          />
        </form>
      </div>

      <div className="flex items-center gap-4 ml-auto">
        <button 
          onClick={() => toggleDarkMode()}
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          className="p-2 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-full transition-colors"
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        
        <div className="relative notification-dropdown">
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-full transition-colors relative"
          >
            <Bell size={20} />
            {notifications.filter(n => !n.read).length > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-zinc-950"></span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-12 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl z-50 max-h-96 overflow-hidden">
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
                <h3 className="font-semibold dark:text-white">Notifications</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {notifications.filter(n => !n.read).length} unread
                </p>
              </div>
              
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-zinc-500 dark:text-zinc-400">
                    No notifications yet
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <div 
                      key={notification.id}
                      className={`p-4 border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${
                        !notification.read ? 'bg-blue-50 dark:bg-blue-950/20' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <h4 className="font-medium dark:text-white text-sm">{notification.title}</h4>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">{notification.message}</p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                            {notification.timestamp.toLocaleDateString()} at {notification.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {!notification.read && (
                            <button
                              onClick={() => markAsRead(notification.id)}
                              className="text-xs px-2 py-1 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
                            >
                              Mark read
                            </button>
                          )}
                          <button
                            onClick={() => deleteNotification(notification.id)}
                            className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {notifications.length > 0 && (
                <div className="p-3 border-t border-zinc-200 dark:border-zinc-800">
                  <button
                    onClick={() => {
                      setNotifications([]);
                  }}
                  className="w-full text-sm text-zinc-500 dark:text-zinc-400 hover:text-red-500 transition-colors"
                >
                    Clear all notifications
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="h-8 w-px bg-zinc-200 dark:border-zinc-800 mx-2"></div>

        <button onClick={() => navigate('/settings')} className="flex items-center gap-2 p-1 pr-3 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-full transition-colors">
          <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center">
            <User size={18} />
          </div>
          <span className="text-sm font-medium dark:text-zinc-200 hidden sm:block">{profile.fullName}</span>
        </button>
      </div>
      </header>

      {/* Desktop Horizontal Sub-Navbar */}
      <nav className="hidden lg:flex h-12 bg-[#4b5563] dark:bg-zinc-900 px-6 items-center justify-center overflow-x-auto shadow-sm">
        <div className="flex items-center gap-1 mx-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path === '/' && location.pathname === '/dashboard');
            const isLogout = item.path === '/';
            
            if (isLogout) {
              return (
                <button
                  key={item.path}
                  onClick={async () => {
                    await logOut();
                    localStorage.removeItem('userProfile');
                    window.dispatchEvent(new CustomEvent('userProfileUpdated'));
                    navigate('/login');
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 text-slate-300 hover:text-white hover:bg-white/10"
                >
                  <item.icon size={16} />
                  <span className="text-sm font-medium tracking-wide">{item.label}</span>
                </button>
              );
            }
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200",
                  isActive 
                    ? "text-white bg-white/10" 
                    : "text-slate-300 hover:text-white hover:bg-white/10"
                )}
              >
                <item.icon size={16} />
                <span className="text-sm font-medium tracking-wide">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
