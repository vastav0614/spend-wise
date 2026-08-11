export function getDarkMode(): boolean {
  try {
    const raw = localStorage.getItem('darkMode');
    return raw ? Boolean(JSON.parse(raw)) : false;
  } catch {
    return false;
  }
}

export function setDarkMode(isDark: boolean): void {
  try {
    localStorage.setItem('darkMode', JSON.stringify(isDark));
  } catch {
    // Keep UI usable if localStorage is restricted
  }

  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }

  window.dispatchEvent(new CustomEvent('themeChanged', { detail: { isDark } }));
}

export function toggleDarkMode(): boolean {
  const nextState = !getDarkMode();
  setDarkMode(nextState);
  return nextState;
}
