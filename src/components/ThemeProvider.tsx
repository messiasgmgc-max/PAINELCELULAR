"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { ThemeProvider as NextThemesProvider, ThemeProviderProps, useTheme } from "next-themes";

export type ColorTheme = 'padrao' | 'black-white' | 'purple' | 'red-black' | 'green-black';

interface ColorThemeContextType {
  colorTheme: ColorTheme;
  setColorTheme: (theme: ColorTheme) => void;
}

const ColorThemeContext = createContext<ColorThemeContextType | undefined>(undefined);

export function useColorTheme() {
  const context = useContext(ColorThemeContext);
  if (!context) throw new Error("useColorTheme deve ser usado dentro de um ThemeProvider");
  return context;
}

function ThemeSync({ children }: { children: React.ReactNode }) {
  const { colorTheme } = useColorTheme();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (colorTheme !== 'padrao') {
      setTheme('dark'); // Força o modo escuro para os temas customizados
    }
  }, [colorTheme, setTheme]);

  return <>{children}</>;
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const [colorTheme, setColorThemeState] = useState<ColorTheme>('padrao');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('phonecenter-color-theme') as ColorTheme;
    if (saved) {
      setColorThemeState(saved);
      document.documentElement.setAttribute('data-color-theme', saved);
    }
  }, []);

  const setColorTheme = (theme: ColorTheme) => {
    setColorThemeState(theme);
    localStorage.setItem('phonecenter-color-theme', theme);
    document.documentElement.setAttribute('data-color-theme', theme);
  };

  return (
    <ColorThemeContext.Provider value={{ colorTheme, setColorTheme }}>
      <NextThemesProvider {...props}>
        <ThemeSync>
          {children}
          {mounted && <ColorThemeStyles theme={colorTheme} />}
          <style dangerouslySetInnerHTML={{ __html: `
            option { background-color: #ffffff; color: #0f172a; }
            html.dark option { background-color: #0f172a; color: #f8fafc; }
          `}} />
        </ThemeSync>
      </NextThemesProvider>
    </ColorThemeContext.Provider>
  );
}

function ColorThemeStyles({ theme }: { theme: ColorTheme }) {
  if (theme === 'padrao') return null;

  // Interceptação e substituição CSS das classes Tailwind originais do sistema
  const styles: Record<string, string> = {
    'black-white': `
      [data-color-theme="black-white"] body, [data-color-theme="black-white"] .bg-background { background-color: #000000 !important; }
      [data-color-theme="black-white"] .dark\\:bg-slate-950 { background-color: #050505 !important; }
      [data-color-theme="black-white"] .dark\\:bg-slate-900 { background-color: #0a0a0a !important; }
      [data-color-theme="black-white"] .dark\\:bg-slate-800 { background-color: #141414 !important; }
      [data-color-theme="black-white"] .bg-blue-600 { background-color: #ffffff !important; color: #000000 !important; }
      [data-color-theme="black-white"] .bg-blue-600\\/90 { background-color: rgba(255,255,255,0.9) !important; color: #000000 !important; }
      [data-color-theme="black-white"] .hover\\:bg-blue-700:hover { background-color: #cccccc !important; }
      [data-color-theme="black-white"] .text-blue-600, [data-color-theme="black-white"] .dark\\:text-blue-400 { color: #ffffff !important; }
      [data-color-theme="black-white"] .data-\\[state\\=active\\]\\:text-blue-600[data-state="active"], [data-color-theme="black-white"] .dark\\:data-\\[state\\=active\\]\\:text-blue-400[data-state="active"] { color: #ffffff !important; }
      [data-color-theme="black-white"] .border-blue-600, [data-color-theme="black-white"] .border-blue-500 { border-color: #ffffff !important; }
      [data-color-theme="black-white"] .bg-blue-50, [data-color-theme="black-white"] .bg-blue-100 { background-color: #1a1a1a !important; color: #ffffff !important; }
      [data-color-theme="black-white"] .bg-blue-50\\/50 { background-color: rgba(26,26,26,0.5) !important; }
      [data-color-theme="black-white"] .dark\\:border-blue-800 { border-color: #333333 !important; }
      [data-color-theme="black-white"] .text-blue-900, [data-color-theme="black-white"] .text-blue-800 { color: #ffffff !important; }
      [data-color-theme="black-white"] .bg-blue-500 { background-color: #f0f0f0 !important; color: #000000 !important; }
      [data-color-theme="black-white"] .text-blue-500 { color: #f0f0f0 !important; }
      [data-color-theme="black-white"] .ring-blue-500, [data-color-theme="black-white"] .focus-within\\:ring-\\[\\#155dfc\\]:focus-within { --tw-ring-color: #ffffff !important; }
      [data-color-theme="black-white"] .shadow-blue-500\\/20, [data-color-theme="black-white"] .shadow-blue-500\\/30, [data-color-theme="black-white"] .shadow-blue-500\\/40 { --tw-shadow-color: rgba(255,255,255,0.3) !important; }
      [data-color-theme="black-white"] .bg-blue-900\\/20, [data-color-theme="black-white"] .dark\\:bg-blue-900\\/20, [data-color-theme="black-white"] .dark\\:bg-blue-950\\/20 { background-color: rgba(255,255,255,0.1) !important; }
      [data-color-theme="black-white"] .text-blue-400 { color: #cccccc !important; }
      [data-color-theme="black-white"] .bg-\\[\\#155cfb\\] { background-color: #ffffff !important; color: #000000 !important; }
      [data-color-theme="black-white"] .bg-\\[\\#155cfb2e\\], [data-color-theme="black-white"] .dark\\:bg-\\[\\#155cfb50\\] { background-color: rgba(255,255,255,0.1) !important; }
      [data-color-theme="black-white"] .border-\\[\\#155dfc\\], [data-color-theme="black-white"] .focus-within\\:border-\\[\\#155dfc\\]:focus-within { border-color: #ffffff !important; }
      [data-color-theme="black-white"] .text-\\[\\#155cfb\\] { color: #ffffff !important; }
      [data-color-theme="black-white"] .border-l-blue-500 { border-left-color: #ffffff !important; }
      [data-color-theme="black-white"] .dark\\:bg-\\[linear-gradient\\(160deg\\,rgba\\(15\\,23\\,42\\,1\\)_0\\%\\,rgba\\(30\\,41\\,59\\,1\\)_100\\%\\)\\] { background: linear-gradient(160deg, #000000 0%, #111111 100%) !important; }
    `,
    'purple': `
      [data-color-theme="purple"] body, [data-color-theme="purple"] .bg-background { background-color: #0b001a !important; }
      [data-color-theme="purple"] .dark\\:bg-slate-950 { background-color: #0d001a !important; }
      [data-color-theme="purple"] .dark\\:bg-slate-900 { background-color: #150029 !important; }
      [data-color-theme="purple"] .dark\\:bg-slate-800 { background-color: #220042 !important; }
      [data-color-theme="purple"] .bg-blue-600 { background-color: #9333ea !important; color: #ffffff !important; }
      [data-color-theme="purple"] .bg-blue-600\\/90 { background-color: rgba(147,51,234,0.9) !important; color: #ffffff !important; }
      [data-color-theme="purple"] .hover\\:bg-blue-700:hover { background-color: #7e22ce !important; }
      [data-color-theme="purple"] .text-blue-600, [data-color-theme="purple"] .dark\\:text-blue-400 { color: #c084fc !important; }
      [data-color-theme="purple"] .data-\\[state\\=active\\]\\:text-blue-600[data-state="active"], [data-color-theme="purple"] .dark\\:data-\\[state\\=active\\]\\:text-blue-400[data-state="active"] { color: #c084fc !important; }
      [data-color-theme="purple"] .border-blue-600, [data-color-theme="purple"] .border-blue-500 { border-color: #9333ea !important; }
      [data-color-theme="purple"] .bg-blue-50, [data-color-theme="purple"] .bg-blue-100 { background-color: #2e1065 !important; color: #f3e8ff !important; }
      [data-color-theme="purple"] .bg-blue-50\\/50 { background-color: rgba(46,16,101,0.5) !important; }
      [data-color-theme="purple"] .dark\\:border-blue-800 { border-color: #581c87 !important; }
      [data-color-theme="purple"] .text-blue-900, [data-color-theme="purple"] .text-blue-800 { color: #e9d5ff !important; }
      [data-color-theme="purple"] .bg-blue-500 { background-color: #a855f7 !important; color: #ffffff !important; }
      [data-color-theme="purple"] .text-blue-500 { color: #a855f7 !important; }
      [data-color-theme="purple"] .ring-blue-500, [data-color-theme="purple"] .focus-within\\:ring-\\[\\#155dfc\\]:focus-within { --tw-ring-color: #a855f7 !important; }
      [data-color-theme="purple"] .shadow-blue-500\\/20, [data-color-theme="purple"] .shadow-blue-500\\/30, [data-color-theme="purple"] .shadow-blue-500\\/40 { --tw-shadow-color: rgba(168,85,247,0.3) !important; }
      [data-color-theme="purple"] .bg-blue-900\\/20, [data-color-theme="purple"] .dark\\:bg-blue-900\\/20, [data-color-theme="purple"] .dark\\:bg-blue-950\\/20 { background-color: rgba(147,51,234,0.2) !important; }
      [data-color-theme="purple"] .text-blue-400 { color: #d8b4fe !important; }
      [data-color-theme="purple"] .bg-\\[\\#155cfb\\] { background-color: #9333ea !important; color: #ffffff !important; }
      [data-color-theme="purple"] .bg-\\[\\#155cfb2e\\], [data-color-theme="purple"] .dark\\:bg-\\[\\#155cfb50\\] { background-color: rgba(147,51,234,0.2) !important; }
      [data-color-theme="purple"] .border-\\[\\#155dfc\\], [data-color-theme="purple"] .focus-within\\:border-\\[\\#155dfc\\]:focus-within { border-color: #9333ea !important; }
      [data-color-theme="purple"] .text-\\[\\#155cfb\\] { color: #c084fc !important; }
      [data-color-theme="purple"] .border-l-blue-500 { border-left-color: #a855f7 !important; }
      [data-color-theme="purple"] .dark\\:bg-\\[linear-gradient\\(160deg\\,rgba\\(15\\,23\\,42\\,1\\)_0\\%\\,rgba\\(30\\,41\\,59\\,1\\)_100\\%\\)\\] { background: linear-gradient(160deg, #1e0033 0%, #0b001a 100%) !important; }
    `,
    'red-black': `
      [data-color-theme="red-black"] body, [data-color-theme="red-black"] .bg-background { background-color: #120000 !important; }
      [data-color-theme="red-black"] .dark\\:bg-slate-950 { background-color: #1a0000 !important; }
      [data-color-theme="red-black"] .dark\\:bg-slate-900 { background-color: #290000 !important; }
      [data-color-theme="red-black"] .dark\\:bg-slate-800 { background-color: #420000 !important; }
      [data-color-theme="red-black"] .bg-blue-600 { background-color: #dc2626 !important; color: #ffffff !important; }
      [data-color-theme="red-black"] .bg-blue-600\\/90 { background-color: rgba(220,38,38,0.9) !important; color: #ffffff !important; }
      [data-color-theme="red-black"] .hover\\:bg-blue-700:hover { background-color: #b91c1c !important; }
      [data-color-theme="red-black"] .text-blue-600, [data-color-theme="red-black"] .dark\\:text-blue-400 { color: #f87171 !important; }
      [data-color-theme="red-black"] .data-\\[state\\=active\\]\\:text-blue-600[data-state="active"], [data-color-theme="red-black"] .dark\\:data-\\[state\\=active\\]\\:text-blue-400[data-state="active"] { color: #f87171 !important; }
      [data-color-theme="red-black"] .border-blue-600, [data-color-theme="red-black"] .border-blue-500 { border-color: #dc2626 !important; }
      [data-color-theme="red-black"] .bg-blue-50, [data-color-theme="red-black"] .bg-blue-100 { background-color: #450a0a !important; color: #fecaca !important; }
      [data-color-theme="red-black"] .bg-blue-50\\/50 { background-color: rgba(69,10,10,0.5) !important; }
      [data-color-theme="red-black"] .dark\\:border-blue-800 { border-color: #7f1d1d !important; }
      [data-color-theme="red-black"] .text-blue-900, [data-color-theme="red-black"] .text-blue-800 { color: #fecaca !important; }
      [data-color-theme="red-black"] .bg-blue-500 { background-color: #ef4444 !important; color: #ffffff !important; }
      [data-color-theme="red-black"] .text-blue-500 { color: #ef4444 !important; }
      [data-color-theme="red-black"] .ring-blue-500, [data-color-theme="red-black"] .focus-within\\:ring-\\[\\#155dfc\\]:focus-within { --tw-ring-color: #ef4444 !important; }
      [data-color-theme="red-black"] .shadow-blue-500\\/20, [data-color-theme="red-black"] .shadow-blue-500\\/30, [data-color-theme="red-black"] .shadow-blue-500\\/40 { --tw-shadow-color: rgba(239,68,68,0.3) !important; }
      [data-color-theme="red-black"] .bg-blue-900\\/20, [data-color-theme="red-black"] .dark\\:bg-blue-900\\/20, [data-color-theme="red-black"] .dark\\:bg-blue-950\\/20 { background-color: rgba(220,38,38,0.2) !important; }
      [data-color-theme="red-black"] .text-blue-400 { color: #fca5a5 !important; }
      [data-color-theme="red-black"] .bg-\\[\\#155cfb\\] { background-color: #dc2626 !important; color: #ffffff !important; }
      [data-color-theme="red-black"] .bg-\\[\\#155cfb2e\\], [data-color-theme="red-black"] .dark\\:bg-\\[\\#155cfb50\\] { background-color: rgba(220,38,38,0.2) !important; }
      [data-color-theme="red-black"] .border-\\[\\#155dfc\\], [data-color-theme="red-black"] .focus-within\\:border-\\[\\#155dfc\\]:focus-within { border-color: #dc2626 !important; }
      [data-color-theme="red-black"] .text-\\[\\#155cfb\\] { color: #f87171 !important; }
      [data-color-theme="red-black"] .border-l-blue-500 { border-left-color: #ef4444 !important; }
      [data-color-theme="red-black"] .dark\\:bg-\\[linear-gradient\\(160deg\\,rgba\\(15\\,23\\,42\\,1\\)_0\\%\\,rgba\\(30\\,41\\,59\\,1\\)_100\\%\\)\\] { background: linear-gradient(160deg, #330000 0%, #120000 100%) !important; }
    `,
    'green-black': `
      [data-color-theme="green-black"] body, [data-color-theme="green-black"] .bg-background { background-color: #001206 !important; }
      [data-color-theme="green-black"] .dark\\:bg-slate-950 { background-color: #001a0a !important; }
      [data-color-theme="green-black"] .dark\\:bg-slate-900 { background-color: #00290f !important; }
      [data-color-theme="green-black"] .dark\\:bg-slate-800 { background-color: #004218 !important; }
      [data-color-theme="green-black"] .bg-blue-600 { background-color: #059669 !important; color: #ffffff !important; }
      [data-color-theme="green-black"] .bg-blue-600\\/90 { background-color: rgba(5,150,105,0.9) !important; color: #ffffff !important; }
      [data-color-theme="green-black"] .hover\\:bg-blue-700:hover { background-color: #047857 !important; }
      [data-color-theme="green-black"] .text-blue-600, [data-color-theme="green-black"] .dark\\:text-blue-400 { color: #34d399 !important; }
      [data-color-theme="green-black"] .data-\\[state\\=active\\]\\:text-blue-600[data-state="active"], [data-color-theme="green-black"] .dark\\:data-\\[state\\=active\\]\\:text-blue-400[data-state="active"] { color: #34d399 !important; }
      [data-color-theme="green-black"] .border-blue-600, [data-color-theme="green-black"] .border-blue-500 { border-color: #059669 !important; }
      [data-color-theme="green-black"] .bg-blue-50, [data-color-theme="green-black"] .bg-blue-100 { background-color: #022c22 !important; color: #a7f3d0 !important; }
      [data-color-theme="green-black"] .bg-blue-50\\/50 { background-color: rgba(2,44,34,0.5) !important; }
      [data-color-theme="green-black"] .dark\\:border-blue-800 { border-color: #064e3b !important; }
      [data-color-theme="green-black"] .text-blue-900, [data-color-theme="green-black"] .text-blue-800 { color: #a7f3d0 !important; }
      [data-color-theme="green-black"] .bg-blue-500 { background-color: #10b981 !important; color: #ffffff !important; }
      [data-color-theme="green-black"] .text-blue-500 { color: #10b981 !important; }
      [data-color-theme="green-black"] .ring-blue-500, [data-color-theme="green-black"] .focus-within\\:ring-\\[\\#155dfc\\]:focus-within { --tw-ring-color: #10b981 !important; }
      [data-color-theme="green-black"] .shadow-blue-500\\/20, [data-color-theme="green-black"] .shadow-blue-500\\/30, [data-color-theme="green-black"] .shadow-blue-500\\/40 { --tw-shadow-color: rgba(16,185,129,0.3) !important; }
      [data-color-theme="green-black"] .bg-blue-900\\/20, [data-color-theme="green-black"] .dark\\:bg-blue-900\\/20, [data-color-theme="green-black"] .dark\\:bg-blue-950\\/20 { background-color: rgba(5,150,105,0.2) !important; }
      [data-color-theme="green-black"] .text-blue-400 { color: #6ee7b7 !important; }
      [data-color-theme="green-black"] .bg-\\[\\#155cfb\\] { background-color: #059669 !important; color: #ffffff !important; }
      [data-color-theme="green-black"] .bg-\\[\\#155cfb2e\\], [data-color-theme="green-black"] .dark\\:bg-\\[\\#155cfb50\\] { background-color: rgba(5,150,105,0.2) !important; }
      [data-color-theme="green-black"] .border-\\[\\#155dfc\\], [data-color-theme="green-black"] .focus-within\\:border-\\[\\#155dfc\\]:focus-within { border-color: #059669 !important; }
      [data-color-theme="green-black"] .text-\\[\\#155cfb\\] { color: #34d399 !important; }
      [data-color-theme="green-black"] .border-l-blue-500 { border-left-color: #10b981 !important; }
      [data-color-theme="green-black"] .dark\\:bg-\\[linear-gradient\\(160deg\\,rgba\\(15\\,23\\,42\\,1\\)_0\\%\\,rgba\\(30\\,41\\,59\\,1\\)_100\\%\\)\\] { background: linear-gradient(160deg, #003314 0%, #001206 100%) !important; }
    `
  };

  return <style dangerouslySetInnerHTML={{ __html: styles[theme] || '' }} />;
}
