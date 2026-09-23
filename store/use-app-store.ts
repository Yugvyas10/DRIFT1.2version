import { create } from "zustand";

interface AppState {
  isSearchOpen: boolean;
  isMobileMenuOpen: boolean;
  activeNotification: string | null;
  setSearchOpen: (open: boolean) => void;
  setMobileMenuOpen: (open: boolean) => void;
  toggleSearch: () => void;
  toggleMobileMenu: () => void;
  setNotification: (msg: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isSearchOpen: false,
  isMobileMenuOpen: false,
  activeNotification: null,
  setSearchOpen: (open) => set({ isSearchOpen: open }),
  setMobileMenuOpen: (open) => set({ isMobileMenuOpen: open }),
  toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),
  toggleMobileMenu: () => set((state) => ({ isMobileMenuOpen: !state.isMobileMenuOpen })),
  setNotification: (msg) => set({ activeNotification: msg }),
}));
