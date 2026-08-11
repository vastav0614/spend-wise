import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  PlusCircle, 
  History, 
  Wallet, 
  Target, 
  Settings, 
  LogOut,
  Menu, 
  X,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  CreditCard
} from 'lucide-react';
import { cn } from '../lib/utils';
import { logOut } from '../lib/auth';

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

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const toggleSidebar = () => setIsOpen(!isOpen);
  const toggleMobileSidebar = () => setIsMobileOpen(!isMobileOpen);
  const handleLogout = async () => {
    await logOut();
    localStorage.removeItem('userProfile');
    window.dispatchEvent(new CustomEvent('userProfileUpdated'));
    navigate('/login');
  };

  return (
    <>
      {/* Mobile Toggle */}
      <button 
        onClick={toggleMobileSidebar}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white dark:bg-zinc-900 rounded-lg shadow-md"
      >
        {isMobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={toggleMobileSidebar}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-full bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 transition-all duration-300 z-40",
        isOpen ? "w-64" : "w-20",
        isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold">
              S
            </div>
            {isOpen && <span className="font-bold text-xl tracking-tight dark:text-white">SpendWise</span>}
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 space-y-2 mt-4">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path || (item.path === '/' && location.pathname === '/dashboard');
              const isLogout = item.path === '/';
              return isLogout ? (
                <button
                  key={item.path}
                  onClick={handleLogout}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group w-full text-left",
                    isActive 
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                      : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  )}
                >
                  <item.icon size={20} className={cn("group-hover:text-red-500", isActive ? "text-white" : "")} />
                  {isOpen && <span className="font-medium">{item.label}</span>}
                </button>
              ) : (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group",
                    isActive 
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                      : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  )}
                >
                  <item.icon size={20} className={cn(isActive ? "text-white" : "group-hover:text-emerald-500")} />
                  {isOpen && <span className="font-medium">{item.label}</span>}
                </Link>
              );
            })}
          </nav>
          {/* Collapse Toggle (Desktop) */}
          <button 
            onClick={toggleSidebar}
            className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full items-center justify-center text-zinc-500 hover:text-emerald-500 shadow-sm"
          >
            {isOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </aside>
    </>
  );
}
