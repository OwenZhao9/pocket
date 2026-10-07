import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Unlocked } from "./account";
import { drip, keeperStatus, type KeeperStatus } from "./api";
import { getBalances, getPositions, getPrice, type Balances, type Position, type Price } from "./chain";
import { appendJournal, loadJournal, type JournalEntry } from "./journal";

export interface Toast {
  text: string;
  tx?: string;
  tone?: "ok" | "error";
}

interface Store {
  session: Unlocked | null;
  setSession(s: Unlocked | null): void;
  price: Price | null;
  balances: Balances | null;
  positions: Position[];
  keeper: KeeperStatus | null;
  journal: JournalEntry[];
  onboarding: boolean;
  toast: Toast | null;
  showToast(t: Toast): void;
  refresh(): Promise<void>;
  record(entry: Omit<JournalEntry, "at">): Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<Unlocked | null>(null);
  const [price, setPrice] = useState<Price | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [keeper, setKeeper] = useState<KeeperStatus | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [onboarding, setOnboarding] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), t.tx ? 7000 : 4000);
  }, []);

  const refresh = useCallback(async () => {
    const owner = session?.account.address;
    const tasks: Promise<unknown>[] = [getPrice().then(setPrice), keeperStatus().then(setKeeper)];
    if (owner) {
      tasks.push(getBalances(owner).then(setBalances), getPositions(owner).then(setPositions));
    }
    await Promise.allSettled(tasks);
  }, [session]);

  const setSession = useCallback(
    (s: Unlocked | null) => {
      session?.lock();
      setSessionState(s);
      setBalances(null);
      setPositions([]);
      setJournal([]);
    },
    [session],
  );

  // On unlock: load the journal and hand a brand-new account its starter kit.
  useEffect(() => {
    if (!session) return;
    const owner = session.account.address;
    loadJournal(owner, session.journalKey)
      .then(setJournal)
      .catch(() => setJournal([]));
    (async () => {
      const b = await getBalances(owner).catch(() => null);
      setBalances(b);
      if (b && b.usd === 0n && b.gas === 0n) {
        setOnboarding(true);
        try {
          const r = await drip(owner);
          if (r.tx) showToast({ text: "新手资金已到账:100 pUSD + 手续费", tx: r.tx });
        } catch {
          showToast({ text: "新手资金暂时领不到,稍后会自动重试", tone: "error" });
        } finally {
          setOnboarding(false);
          void refresh();
        }
      }
    })();
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  const record = useCallback(
    async (entry: Omit<JournalEntry, "at">) => {
      if (!session) return;
      const next = await appendJournal(session.account.address, session.journalKey, { ...entry, at: Date.now() });
      setJournal(next);
    },
    [session],
  );

  return (
    <Ctx.Provider
      value={{
        session,
        setSession,
        price,
        balances,
        positions,
        keeper,
        journal,
        onboarding,
        toast,
        showToast,
        refresh,
        record,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
