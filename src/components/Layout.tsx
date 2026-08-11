import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

export default function Layout() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col transition-all duration-300">
      <Navbar />
      <main className="p-6 flex-1 w-full max-w-7xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
