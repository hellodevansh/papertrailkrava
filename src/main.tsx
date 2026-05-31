import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  BellRing,
  CalendarClock,
  Check,
  CheckCheck,
  ChevronRight,
  Clock,
  CreditCard,
  FastForward,
  FileText,
  LayoutDashboard,
  MessageSquareText,
  Paperclip,
  RotateCcw,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import "./styles.css";

type View = "home" | "inbox" | "settings";

type Status = {
  env: { gemini: boolean; krava: boolean; linq: boolean; linqMode?: string; webhook: boolean };
  krava: { connected: boolean; mode: string; message?: string };
  linq?: { mode: string; ready: boolean; from: string; to: string; integration: string; note?: string };
};

type PaperTrailState = {
  documents: DocumentRecord[];
  facts: Fact[];
  deadlines: Deadline[];
  subscriptions: Subscription[];
  payments: Payment[];
  contacts: Contact[];
  actionItems: ActionItem[];
  keyDetails: KeyDetail[];
  linqActivities: LinqActivity[];
  updatedAt: string | null;
};

type DocumentRecord = { id: string; name: string; documentType: string; summary: string; suggestedQuestions?: string[]; uploadedAt: string };
type Fact = { id: string; label: string; value: string; category: string; sensitivity: string; sourceDocument: string };
type Deadline = { id: string; title: string; date: string; urgency: string; nextStep: string; sourceDocument: string };
type Subscription = { id: string; merchant: string; amount: string; cadence: string; category: string; cancelSuggestion: string; sourceDocument: string };
type Payment = { id: string; label: string; amount: string; dueDate: string; payee: string; sourceDocument: string };
type Contact = { id: string; name: string; role: string; contact: string; sourceDocument: string };
type ActionItem = { id: string; title: string; priority: string; dueDate: string; suggestedAction: string; sourceDocument: string };
type KeyDetail = { id: string; label: string; value: string; category: string; sourceDocument: string };
type LinqActivity = { id: string; direction: "inbound" | "outbound"; kind: string; text: string; status: string; createdAt: string; from?: string; to?: string; channel?: string; effect?: string | null };
type Answer = { answer: string; provider: string; sources: string[]; documentCount?: number; warning?: string; hint?: string };
type Reminder = {
  id: string; sourceId: string; kind: "deadline" | "payment"; title: string; dueDate: string;
  nextStep?: string; urgency?: string; amount?: string; sourceDocument?: string;
  leadDays: number; fireAt: string; dueInDays: number; status: "scheduled" | "due"; body: string;
};
type ChatTurn = { role: "user" | "assistant"; text: string; sources?: string[] };

const emptyState: PaperTrailState = {
  documents: [], facts: [], deadlines: [], subscriptions: [], payments: [], contacts: [],
  actionItems: [], keyDetails: [], linqActivities: [], updatedAt: null,
};

const DAY_MS = 24 * 60 * 60 * 1000;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { headers: { "Content-Type": "application/json", ...(init?.headers || {}) }, ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      resolve(value.includes(",") ? value.split(",")[1] : value);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function normalizeDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value).trim()) ? `${value}T12:00:00` : value;
}

function shortDate(value: string) {
  if (!value) return "—";
  const date = new Date(normalizeDate(value));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function parseDate(value: string): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const date = new Date(normalizeDate(value));
  return Number.isNaN(date.getTime()) ? Number.POSITIVE_INFINITY : date.getTime();
}

function urgencyRank(value = "") {
  const v = value.toLowerCase();
  if (v.includes("high") || v.includes("urgent")) return "high";
  if (v.includes("low")) return "low";
  return "medium";
}

function reminderLeadDays(urgency = "") {
  const v = String(urgency).toLowerCase();
  if (v.includes("high") || v.includes("urgent")) return 3;
  if (v.includes("low")) return 1;
  return 2;
}

function amountText(value?: string) {
  if (value === null || value === undefined) return "";
  const s = String(value).trim();
  if (!s) return "";
  // Already starts with a currency symbol (or minus) → leave as-is; otherwise prefix $.
  return /^[-$€£]/.test(s) ? s : `$${s}`;
}

function reminderText(item: Reminder) {
  const due = shortDate(item.dueDate);
  if (item.kind === "payment") {
    const amt = amountText(item.amount);
    return `Reminder from PaperTrail: ${item.title}${amt ? ` (${amt})` : ""} is due ${due}.`;
  }
  const next = item.nextStep ? ` Next: ${item.nextStep}` : "";
  return `Reminder from PaperTrail: ${item.title} is due ${due}.${next} Reply "checklist" for what to prepare.`;
}

function buildClientReminders(state: PaperTrailState, now: number): Reminder[] {
  const out: Reminder[] = [];
  for (const d of state.deadlines || []) {
    const due = parseDate(d.date);
    if (!Number.isFinite(due)) continue;
    const leadDays = reminderLeadDays(d.urgency);
    const fire = due - leadDays * DAY_MS;
    out.push({
      id: `rem-${d.id}`, sourceId: d.id, kind: "deadline", title: d.title, dueDate: d.date,
      nextStep: d.nextStep || "", urgency: d.urgency || "medium", sourceDocument: d.sourceDocument || "",
      leadDays, fireAt: new Date(fire).toISOString(), dueInDays: Math.round((due - now) / DAY_MS),
      status: now >= fire ? "due" : "scheduled", body: "",
    });
  }
  for (const p of state.payments || []) {
    const due = parseDate(p.dueDate);
    if (!Number.isFinite(due)) continue;
    const leadDays = 3;
    const fire = due - leadDays * DAY_MS;
    out.push({
      id: `rem-${p.id}`, sourceId: p.id, kind: "payment", title: p.label || p.payee || "Payment", amount: p.amount,
      dueDate: p.dueDate, sourceDocument: p.sourceDocument || "",
      leadDays, fireAt: new Date(fire).toISOString(), dueInDays: Math.round((due - now) / DAY_MS),
      status: now >= fire ? "due" : "scheduled", body: "",
    });
  }
  out.sort((a, b) => parseDate(a.fireAt) - parseDate(b.fireAt));
  return out.map((r) => ({ ...r, body: reminderText(r) }));
}

function buildClientDigest(state: PaperTrailState, now: number, limit = 3): string {
  const items = buildClientReminders(state, now)
    .slice()
    .sort((a, b) => parseDate(a.dueDate) - parseDate(b.dueDate))
    .slice(0, limit);
  if (!items.length) return "Good news — you're all caught up. Nothing due right now.";
  const lines = items.map((r, i) => {
    const amt = r.kind === "payment" ? amountText(r.amount) : "";
    return `${i + 1}. ${r.title}${amt ? ` (${amt})` : ""} — due ${shortDate(r.dueDate)}`;
  });
  return `Good morning! Here's what's coming up:\n${lines.join("\n")}\n\nReply "checklist" for the details on any of these.`;
}

const ALL_CAUGHT_UP = "That's everything handled — you're all caught up. I'll text you before the next deadline.";

function Confetti({ show }: { show: boolean }) {
  if (!show) return null;
  const colors = ["#ff7a59", "#ffd166", "#06d6a0", "#118ab2", "#ef476f", "#8338ec"];
  const pieces = Array.from({ length: 48 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.35,
    dur: 1.1 + Math.random() * 0.9,
    rot: Math.random() * 360,
    color: colors[i % colors.length],
    size: 6 + Math.random() * 6,
  }));
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confettiPiece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            width: `${p.size}px`,
            height: `${p.size * 1.6}px`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}

function inlineFormat(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function AnswerBody({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(<ul key={`ul-${blocks.length}`}>{list.map((item, i) => <li key={i}>{inlineFormat(item)}</li>)}</ul>);
      list = [];
    }
  };
  for (const line of lines) {
    if (!line) { flush(); continue; }
    const bullet = line.match(/^[-*•]\s+(.*)$/) || line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet) list.push(bullet[1]);
    else { flush(); blocks.push(<p key={`p-${blocks.length}`}>{inlineFormat(line)}</p>); }
  }
  flush();
  return <div className="answerBody">{blocks}</div>;
}

function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [state, setState] = useState<PaperTrailState>(emptyState);
  const [view, setView] = useState<View>("home");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteName, setPasteName] = useState("Pasted document");
  const [pasteText, setPasteText] = useState("");
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [linqReply, setLinqReply] = useState("");

  // Time-travel reminders
  const [demoNow, setDemoNow] = useState<number>(Date.now());
  const [firedIds, setFiredIds] = useState<string[]>([]);
  const [confetti, setConfetti] = useState(false);
  const burst = () => { setConfetti(false); window.setTimeout(() => setConfetti(true), 20); window.setTimeout(() => setConfetti(false), 2000); };

  const hasDocs = state.documents.length > 0;
  const reminders = useMemo(() => (hasDocs ? buildClientReminders(state, demoNow) : []), [state, demoNow, hasDocs]);

  const loadStatus = async () => setStatus(await api<Status>("/api/status"));
  useEffect(() => { loadStatus().catch((err) => setError(err.message)); }, []);
  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => setError(null), 6000);
    return () => window.clearTimeout(id);
  }, [error]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const applyState = (next: PaperTrailState) => setState(next);
  const clearSession = () => {
    setState(emptyState); setChat([]); setFiredIds([]);
    setDemoNow(Date.now()); setError(null); setToast("Session cleared");
  };

  const stats = useMemo(() => [
    { label: "Documents", value: state.documents.length, icon: FileText },
    { label: "Deadlines", value: state.deadlines.length, icon: CalendarClock },
    { label: "Bills", value: state.subscriptions.length + state.payments.length, icon: CreditCard },
    { label: "Reminders", value: reminders.length, icon: Bell },
  ], [state, reminders]);

  const suggestedQuestions = useMemo(() => {
    const perDoc = state.documents.map((d) => (d.suggestedQuestions || []).map((q) => q.trim()).filter(Boolean));
    const out: string[] = [];
    for (let i = 0; out.length < 4 && perDoc.some((arr) => arr[i]); i++) {
      for (const arr of perDoc) {
        if (arr[i] && !out.includes(arr[i])) out.push(arr[i]);
        if (out.length >= 4) break;
      }
    }
    return out;
  }, [state.documents]);

  const timelineItems = useMemo(() => {
    const items = [
      ...state.deadlines.map((d) => ({ id: d.id, title: d.title, date: d.date, note: d.nextStep, urgency: urgencyRank(d.urgency), kind: "Deadline" })),
      ...state.actionItems.map((a) => ({ id: a.id, title: a.title, date: a.dueDate, note: a.suggestedAction, urgency: urgencyRank(a.priority), kind: "To-do" })),
    ];
    return items.sort((a, b) => parseDate(a.date) - parseDate(b.date));
  }, [state.deadlines, state.actionItems]);

  const sentReminders = reminders.filter((r) => firedIds.includes(r.id)).length;
  const dueCount = reminders.filter((r) => r.status === "due" && !firedIds.includes(r.id)).length;
  const progressPct = reminders.length ? Math.round((sentReminders / reminders.length) * 100) : (hasDocs ? 100 : 0);

  const linqThread = useMemo(() => {
    const messages = state.linqActivities.filter((a) => a.kind !== "message.delivered" && a.text !== "(delivered)");
    return [...messages].reverse();
  }, [state.linqActivities]);
  const linqDelivered = state.linqActivities.some((a) => a.direction === "outbound" && a.status === "delivered");

  const extractDocument = async (payload: { id?: string; name: string; text?: string; mimeType?: string; dataBase64?: string }) => {
    setBusy(`Reading ${payload.name}`);
    setError(null);
    try {
      const result = await api<{ state: PaperTrailState; warning?: string; reader?: { provider: string; warning?: string } }>("/api/documents/extract", {
        method: "POST",
        body: JSON.stringify({ ...payload, state }),
      });
      if (!result.state?.documents?.length) { setError("Extraction finished but nothing came back. Check the Krava key."); return; }
      applyState(result.state);
      if (result.warning || result.reader?.warning) setError(result.warning || result.reader?.warning || null);
      else setToast(`Added ${payload.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally { setBusy(null); }
  };

  const uploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.type.startsWith("text/")) await extractDocument({ name: file.name, text: await file.text(), mimeType: file.type });
      else await extractDocument({ name: file.name, mimeType: file.type || "application/octet-stream", dataBase64: await fileToBase64(file) });
    } finally { event.target.value = ""; }
  };

  const extractPasted = async () => {
    if (!pasteText.trim()) return;
    await extractDocument({ name: pasteName || "Pasted document", text: pasteText, mimeType: "text/plain" });
    setPasteText("");
    setPasteOpen(false);
  };

  const ask = async (query = question) => {
    if (!query.trim()) return;
    if (!state.documents.length) { setError("Add a document first, then ask a question."); return; }
    setChat((c) => [...c, { role: "user", text: query }]);
    setQuestion("");
    setBusy("Asking PaperTrail");
    setError(null);
    try {
      const result = await api<Answer>("/api/krava/ask", { method: "POST", body: JSON.stringify({ query, state }) });
      setChat((c) => [...c, { role: "assistant", text: result.answer, sources: result.sources }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Question failed");
      setChat((c) => [...c, { role: "assistant", text: "I couldn't reach Krava just now. Please try again." }]);
    } finally { setBusy(null); }
  };

  // Optimistically drop outbound iMessages into the thread, then best-effort deliver
  // them through Linq (only does anything in live mode; demo errors are ignored).
  const pushOutbound = (entries: { text: string; kind: string; effect?: string }[]) => {
    if (!entries.length) return;
    const stamp = Date.now();
    const acts: LinqActivity[] = entries.map((e, i) => ({
      id: `out-${stamp}-${i}`,
      direction: "outbound",
      kind: e.kind,
      text: e.text,
      status: "delivered",
      createdAt: new Date(stamp + i).toISOString(),
      channel: "imessage",
      effect: e.effect || null,
    }));
    setState((s) => ({ ...s, linqActivities: [...acts.reverse(), ...s.linqActivities], updatedAt: new Date().toISOString() }));
    for (const e of entries) {
      api("/api/linq/send", { method: "POST", body: JSON.stringify({ text: e.text, kind: e.kind, effect: e.effect, state }) }).catch(() => {});
    }
  };

  const fireDue = (id?: string, now = demoNow) => {
    const all = hasDocs ? buildClientReminders(state, now) : [];
    let due = all.filter((r) => r.status === "due" && !firedIds.includes(r.id));
    if (id) due = due.filter((r) => r.id === id);
    if (!due.length) { if (id) setToast("Nothing due to send yet"); return; }

    const newFired = [...new Set([...firedIds, ...due.map((r) => r.id)])];
    const entries: { text: string; kind: string; effect?: string }[] = due.map((r) => ({ text: r.body, kind: "reminder", effect: "confetti" }));
    const everythingFired = all.length > 0 && all.every((r) => newFired.includes(r.id));
    if (everythingFired) entries.push({ text: ALL_CAUGHT_UP, kind: "celebration", effect: "celebration" });

    pushOutbound(entries);
    setFiredIds(newFired);
    setToast(due.length > 1 ? `${due.length} reminders sent over iMessage` : "Reminder sent over iMessage");
    burst();
  };

  const sendDigest = () => {
    if (!hasDocs) { setError("Add a document first, then send a brief."); return; }
    pushOutbound([{ text: buildClientDigest(state, demoNow), kind: "digest" }]);
    setToast("Morning brief sent over iMessage");
  };

  const advanceClock = (days: number) => {
    const next = demoNow + days * DAY_MS;
    setDemoNow(next);
    fireDue(undefined, next);
  };

  const jumpToNextReminder = async () => {
    const upcoming = reminders
      .filter((r) => !firedIds.includes(r.id))
      .map((r) => parseDate(r.fireAt))
      .filter((t) => t > demoNow)
      .sort((a, b) => a - b)[0];
    if (!upcoming) { setToast("No upcoming reminders"); return; }
    const days = Math.ceil((upcoming - demoNow) / DAY_MS);
    await advanceClock(Math.max(days, 1));
  };

  const resetClock = () => { setDemoNow(Date.now()); setFiredIds([]); setToast("Clock reset to today"); };

  const sendLinqReply = async (text = linqReply) => {
    if (!text.trim()) return;
    setBusy("Sending reply");
    try {
      const result = await api<{ state: PaperTrailState; result?: { state?: PaperTrailState } }>("/api/linq/reply", { method: "POST", body: JSON.stringify({ text, state }) });
      applyState(result.state || result.result?.state || state);
    } catch (err) { setError(err instanceof Error ? err.message : "Reply failed"); }
    finally { setBusy(null); }
  };

  const connected = Boolean(status?.krava.connected);

  const shared = {
    state, status, busy, hasDocs, reminders, demoNow, firedIds, dueCount,
    uploadFile, pasteOpen, setPasteOpen, pasteName, setPasteName,
    pasteText, setPasteText, extractPasted, clearSession,
    question, setQuestion, ask, chat, suggestedQuestions,
    timelineItems, stats, progressPct, sentReminders,
    advanceClock, jumpToNextReminder, resetClock, fireDue, sendDigest,
    linqReply, setLinqReply, sendLinqReply, linqThread, linqDelivered,
    goto: setView,
  };

  const marketing = !hasDocs;

  return (
    <div className={marketing ? "appMarketing" : "shell"}>
      <Confetti show={confetti} />
      {marketing ? (
        <TopNav view={view} setView={setView} connected={connected} dueCount={dueCount} />
      ) : (
        <Sidebar view={view} setView={setView} connected={connected} dueCount={dueCount} hasDocs={hasDocs} busy={busy} />
      )}

      <main className={marketing ? "mainMarketing" : view === "home" ? "canvas canvasDash" : view === "inbox" ? "canvas canvasInbox" : "canvas"}>
        {view === "home" && <HomePage {...shared} />}
        {view === "inbox" && <InboxPage {...shared} />}
        {view === "settings" && <SettingsPage {...shared} />}
      </main>

      {(busy || error || toast) && (
        <div className={error ? "toast error" : "toast"}>
          {error ? <TriangleAlert size={16} /> : busy ? <span className="spinner" /> : <Check size={16} />}
          <span>{error || busy || toast}</span>
          {error && <button className="toastClose" onClick={() => setError(null)} aria-label="Dismiss"><X size={14} /></button>}
        </div>
      )}
    </div>
  );
}

const NAV: { id: View; label: string; icon: any }[] = [
  { id: "home", label: "Home", icon: LayoutDashboard },
  { id: "inbox", label: "Inbox", icon: MessageSquareText },
  { id: "settings", label: "Settings", icon: Settings },
];

function TopNav({ view, setView, connected, dueCount }: any) {
  const scrollUpload = () => document.getElementById("mk-upload")?.scrollIntoView({ behavior: "smooth", block: "center" });
  return (
    <header className="topNav">
      <div className="topNavInner">
        <button type="button" className="topBrand" onClick={() => setView("home")}>
          <span className="topBrandMark"><ShieldCheck size={18} /></span>
          <span>PaperTrail</span>
        </button>
        <nav className="topNavLinks" aria-label="Main">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? "topNavLink active" : "topNavLink"}
              onClick={() => setView(item.id)}
            >
              {item.label}
              {item.id === "inbox" && dueCount > 0 && <span className="navCount">{dueCount}</span>}
            </button>
          ))}
        </nav>
        <div className="topNavEnd">
          <span className={connected ? "topStatus on" : "topStatus"}>{connected ? "Krava live" : "Connecting"}</span>
          {view === "home" && (
            <button type="button" className="primary topNavCta" onClick={scrollUpload}>
              Get started
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function Sidebar({ view, setView, connected, dueCount, hasDocs }: any) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brandMark"><ShieldCheck size={18} /></span>
        <span className="brandText">PaperTrail</span>
      </div>

      <nav className="navList">
        {NAV.map((item) => (
          <button key={item.id} className={view === item.id ? "navItem active" : "navItem"} onClick={() => setView(item.id)}>
            <item.icon size={18} />
            <span>{item.label}</span>
            {item.id === "inbox" && dueCount > 0 && <span className="navCount">{dueCount}</span>}
          </button>
        ))}
      </nav>

      <div className="sidePromo">
        <strong>iMessage inbox</strong>
        <p>Q&amp;A and deadline reminders in one thread.</p>
        <button type="button" className="sidePromoBtn" onClick={() => setView("inbox")}>
          {hasDocs ? "Open inbox" : "Preview demo"} <ChevronRight size={12} />
        </button>
      </div>

      <div className="sideFoot">
        <span className={connected ? "statusDot ok" : "statusDot"}><i />{connected ? "Krava connected" : "Connecting…"}</span>
      </div>
    </aside>
  );
}

function PageHead({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <header className="pageHead">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

function UploadControls({ uploadFile, busy, pasteOpen, setPasteOpen, pasteName, setPasteName, pasteText, setPasteText, extractPasted }: any) {
  return (
    <>
      <label className="dropzone">
        <input type="file" accept=".txt,.md,.pdf,image/*" onChange={uploadFile} />
        <span className="dropIcon"><Paperclip size={18} /></span>
        <strong>Upload a document</strong>
        <span className="dropHint">PDF, image, or text</span>
      </label>
      <div className="uploadRow">
        <button className="ghost" onClick={() => setPasteOpen(!pasteOpen)}>{pasteOpen ? "Hide paste" : "Paste text"}</button>
      </div>
      {pasteOpen && (
        <div className="pasteBox">
          <input value={pasteName} onChange={(e) => setPasteName(e.target.value)} placeholder="Document name" />
          <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste a bill, lease clause, statement, or letter…" />
          <button className="primary" disabled={!pasteText.trim() || Boolean(busy)} onClick={extractPasted}>Process text</button>
        </div>
      )}
    </>
  );
}

function ProductPanels() {
  return (
    <div className="mkPanels">
      <article className="mkPanel">
        <header className="mkPanelHead">
          <FileText size={16} />
          <span>Extract</span>
        </header>
        <div className="mkPanelBody">
          <div className="mkDocRow">
            <span className="mkDocIcon"><FileText size={14} /></span>
            <div><strong>Lease.pdf</strong><span>Rent $2,400 · renewal Jun 14</span></div>
            <span className="mkDocBadge">Parsed</span>
          </div>
          <div className="mkDocRow">
            <span className="mkDocIcon"><FileText size={14} /></span>
            <div><strong>Insurance.pdf</strong><span>Premium due Apr 2</span></div>
            <span className="mkDocBadge">Parsed</span>
          </div>
          <div className="mkChipRow">
            <span>3 deadlines</span>
            <span>2 bills</span>
            <span>4 facts</span>
          </div>
        </div>
      </article>

      <article className="mkPanel">
        <header className="mkPanelHead">
          <CalendarClock size={16} />
          <span>Schedule</span>
        </header>
        <div className="mkPanelBody">
          <div className="mkTlRow high"><span>Jun 1</span><strong>Rent payment</strong><em>Bill</em></div>
          <div className="mkTlRow medium"><span>Jun 14</span><strong>Lease renewal</strong><em>Deadline</em></div>
          <div className="mkTlRow low"><span>Jul 3</span><strong>Appeal documents</strong><em>To-do</em></div>
          <div className="mkProgress">
            <span>On track</span>
            <div className="mkProgressBar"><div style={{ width: "72%" }} /></div>
          </div>
        </div>
      </article>

      <article className="mkPanel mkPanelMsg">
        <header className="mkPanelHead">
          <MessageSquareText size={16} />
          <span>iMessage</span>
        </header>
        <div className="mkPanelBody mkImessage">
          <div className="mkImHead">
            <span className="mkImAvatar"><ShieldCheck size={12} /></span>
            <div><strong>PaperTrail</strong><span>via Linq</span></div>
          </div>
          <div className="mkImBubble">
            <span className="mkImTag">Reminder</span>
            <p>Lease renewal due Jun 14. Reply &quot;checklist&quot; for next steps.</p>
          </div>
          <div className="mkImBubble mkImUser"><p>What do I need for the appeal?</p></div>
          <div className="mkImBubble">
            <p>Submit referral letter, itemized receipt, and provider NPI by Jul 3.</p>
          </div>
          <div className="mkImInput">Message PaperTrail…</div>
        </div>
      </article>
    </div>
  );
}

function ChatPanel({ chat, busy, question, setQuestion, ask, suggestedQuestions, hasDocs }: any) {
  return (
    <div className="chatPanel">
      <div className="chatHead">
        <div className="chatHeadMain">
          <span className="chatBadge">Ask PaperTrail</span>
          <span className="chatHint">Powered by Krava</span>
        </div>
      </div>

      <div className="chatThread">
        {chat.length === 0 && (
          <div className="chatWelcome">
            {!hasDocs ? (
              <>
                <h3>Upload a document to start</h3>
                <p>Your questions will be answered from whatever you upload — nothing is saved after you close this tab.</p>
              </>
            ) : (
              <>
                <p>Ask anything pulled from your uploaded documents.</p>
                {suggestedQuestions.length > 0 && (
                  <div className="chips">
                    {suggestedQuestions.map((q: string) => (
                      <button key={q} className="chip" onClick={() => ask(q)} disabled={Boolean(busy)}>{q} <ArrowUpRight size={12} /></button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {chat.map((turn: ChatTurn, i: number) => (
          <div key={i} className={turn.role === "user" ? "msg user" : "msg bot"}>
            {turn.role === "assistant" ? <AnswerBody text={turn.text} /> : <p>{turn.text}</p>}
            {turn.sources && turn.sources.length > 0 && (
              <div className="msgSources">{turn.sources.slice(0, 3).map((s) => <span key={s}><FileText size={10} /> {s}</span>)}</div>
            )}
          </div>
        ))}
        {busy === "Asking PaperTrail" && <div className="msg bot thinking"><span className="spinner dark" /> Reading your documents…</div>}
      </div>

      <div className="chatComposer">
        <input
          value={question}
          placeholder={hasDocs ? "Type something…" : "Add a document first…"}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
        />
        <button className="sendBtn" onClick={() => ask()} disabled={!question.trim() || Boolean(busy)} aria-label="Send"><Send size={16} /></button>
      </div>
    </div>
  );
}

function scrollToHub(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function MarketingHome({
  uploadFile, busy, pasteOpen, setPasteOpen, pasteName, setPasteName, pasteText, setPasteText, extractPasted, goto,
}: any) {
  const stages = [
    { title: "Upload", desc: "Drop a lease, bill, or letter. Krava structures deadlines, bills, and next steps in seconds.", tags: ["PDF", "Images", "Paste"], cta: "Start upload", action: () => document.getElementById("mk-upload")?.scrollIntoView({ behavior: "smooth" }) },
    { title: "Ask", desc: "Question your documents in the app or over iMessage — same brain, same answers.", tags: ["Krava Q&A", "Sources cited"], cta: "See inbox demo", action: () => goto("inbox") },
    { title: "Stay ahead", desc: "Linq texts you before due dates. Demo the time machine to fire reminders instantly.", tags: ["iMessage", "Time travel"], cta: "Open reminders", action: () => goto("inbox") },
  ];

  return (
    <div className="mk">
      <section className="mkHero">
        <div className="mkWrap mkHeroGrid">
          <div className="mkHeroCopy">
            <p className="mkEyebrow">Built for founders who ship paperwork</p>
            <h1>
              Life admin at the
              <br />
              <em>speed of clarity.</em>
            </h1>
            <p className="mkLead">
              No spreadsheets, no guessing — upload once, get deadlines extracted, ask Krava anything, and receive iMessage reminders before it matters.
            </p>
          </div>

          <div id="mk-upload" className="mkQuote">
            <div className="mkQuoteHead">
              <strong>Start in under a minute</strong>
              <span>Session-only · nothing stored after you close the tab</span>
            </div>
            <label className="mkDrop">
              <input type="file" accept=".txt,.md,.pdf,image/*" onChange={uploadFile} />
              <span className="mkDropIcon"><Paperclip size={22} /></span>
              <div className="mkDropText">
                <strong>Drop the files here</strong>
                <span>Max 50MB · PDF, PNG, JPG, or text</span>
              </div>
            </label>
            <div className="mkQuoteFoot">
              <button type="button" className="mkQuoteLink" onClick={() => setPasteOpen(!pasteOpen)}>
                {pasteOpen ? "Hide paste" : "Paste text instead"}
              </button>
              <button type="button" className="mkQuoteLink" onClick={() => goto("inbox")}>Preview iMessage →</button>
            </div>
            {pasteOpen && (
              <div className="mkQuotePaste">
                <input value={pasteName} onChange={(e) => setPasteName(e.target.value)} placeholder="Document name" />
                <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste content…" rows={3} />
                <button type="button" className="primary" disabled={!pasteText.trim() || Boolean(busy)} onClick={extractPasted}>Process</button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mkProduct">
        <div className="mkWrap">
          <div className="mkSectionHead light">
            <p className="mkEyebrow">The full stack</p>
            <h2>Upload → understand → text before it&apos;s late.</h2>
            <p>Three surfaces, one session — nothing overlaps, nothing hidden.</p>
          </div>
          <ProductPanels />
        </div>
      </section>

      <section className="mkStages">
        <div className="mkWrap">
          <div className="mkSectionHead">
            <p className="mkEyebrow">Modular workflow</p>
            <h2>Designed around how you actually manage life admin.</h2>
          </div>
          <div className="mkStageGrid">
            {stages.map((s) => (
              <article className="mkStageCard" key={s.title}>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
                <div className="mkStageTags">{s.tags.map((t) => <span key={t}>{t}</span>)}</div>
                <button type="button" className="mkStageCta" onClick={s.action}>{s.cta} <ChevronRight size={14} /></button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mkCompare">
        <div className="mkWrap mkCompareGrid">
          <div className="mkCompareCol bad">
            <h3>Manual life admin</h3>
            <ul>
              <li>Re-read PDFs every time you forget a date</li>
              <li>Spreadsheets that drift out of sync</li>
              <li>Surprise deadlines with no early warning</li>
              <li>Context lost between email, Notes, and texts</li>
            </ul>
          </div>
          <div className="mkCompareCol good">
            <h3>PaperTrail</h3>
            <ul>
              <li>One upload — Krava extracts structure instantly</li>
              <li>Timeline + bills on a single Home view</li>
              <li>Linq reminders with iMessage-native delivery</li>
              <li>Ask in-app or text — answers cite your documents</li>
            </ul>
            <label className="primary mkCompareCta">
              <input type="file" accept=".txt,.md,.pdf,image/*" onChange={uploadFile} />
              Get started now
            </label>
          </div>
        </div>
      </section>

      <section className="mkFooterCta">
        <div className="mkWrap mkFooterInner">
          <h2>Ready when your next deadline is.</h2>
          <p>Upload your documents one at a time — we&apos;ll extract deadlines and keep you ahead.</p>
          <label className="mkHeroSecondary light mkFooterUpload">
            <input type="file" accept=".txt,.md,.pdf,image/*" onChange={uploadFile} disabled={Boolean(busy)} />
            <Paperclip size={15} /> Upload a document
          </label>
        </div>
      </section>
    </div>
  );
}

function HomePage(props: any) {
  const {
    hasDocs, stats, progressPct, reminders, firedIds, timelineItems, goto,
    uploadFile, busy, pasteOpen, setPasteOpen, pasteName, setPasteName, pasteText, setPasteText, extractPasted,
    state, clearSession,
  } = props;
  const nextReminder = reminders.find((r: Reminder) => !firedIds.includes(r.id)) || reminders[0];
  const [askOpen, setAskOpen] = useState(false);

  if (!hasDocs) {
    return (
      <>
        <MarketingHome
          uploadFile={uploadFile}
          busy={busy}
          pasteOpen={pasteOpen}
          setPasteOpen={setPasteOpen}
          pasteName={pasteName}
          setPasteName={setPasteName}
          pasteText={pasteText}
          setPasteText={setPasteText}
          extractPasted={extractPasted}
          goto={goto}
        />

        <button type="button" className="askFab" onClick={() => setAskOpen(true)}>
          <Sparkles size={16} /> Ask PaperTrail
        </button>

        {askOpen && (
          <div className="askBackdrop" role="presentation" onClick={() => setAskOpen(false)}>
            <div className="askDrawer" role="dialog" aria-label="Ask PaperTrail" onClick={(e) => e.stopPropagation()}>
              <div className="askDrawerHead">
                <strong>Ask PaperTrail</strong>
                <button type="button" className="askDrawerClose" onClick={() => setAskOpen(false)} aria-label="Close">
                  <X size={16} />
                </button>
              </div>
              <ChatPanel {...props} />
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="dash dashLive">
      <section className="dashMain">
        <header className="dashTop">
          <div>
            <p className="dashKicker">Overview</p>
            <h1 className="dashTitle">{progressPct}% caught up</h1>
            <span className="dashMeta">{stats[1].value} deadlines · {stats[2].value} bills · {stats[0].value} docs · next text {nextReminder ? shortDate(nextReminder.fireAt) : "—"}</span>
          </div>
          <div className="dashTopActions">
            <button className="ghost" onClick={() => scrollToHub("hub-docs")}><Paperclip size={15} /> Add</button>
            <button className="primary dashCta" onClick={() => goto("inbox")}><MessageSquareText size={15} /> Inbox</button>
            <button className="ghost danger" onClick={clearSession} disabled={Boolean(busy)}><Trash2 size={13} /> Clear</button>
          </div>
        </header>

        <div className="summaryGrid summaryGridCompact">
          <div className="sumCard">
            <span className="sumIcon warn"><CalendarClock size={16} /></span>
            <strong>{stats[1].value}</strong><span>Deadlines</span>
          </div>
          <div className="sumCard">
            <span className="sumIcon"><Wallet size={16} /></span>
            <strong>{stats[2].value}</strong><span>Bills</span>
          </div>
          <div className="sumCard">
            <span className="sumIcon"><FileText size={16} /></span>
            <strong>{stats[0].value}</strong><span>Documents</span>
          </div>
          <div className="sumCard accent">
            <span className="sumIcon"><Bell size={16} /></span>
            <strong>{nextReminder ? shortDate(nextReminder.fireAt) : "—"}</strong>
            <span>{nextReminder ? nextReminder.title : "Next reminder"}</span>
          </div>
        </div>

        <div className="hubSections">
          <section className="hubBlock" id="hub-docs">
            <DocumentsSection state={state} hasDocs={hasDocs} {...props} />
          </section>
          <section className="hubBlock" id="hub-schedule">
            <TimelineSection timelineItems={timelineItems} />
          </section>
        </div>
      </section>

      <aside className="dashSide">
        <ChatPanel {...props} />
      </aside>
    </div>
  );
}

function DocumentsSection({ state, hasDocs, ...uploadProps }: any) {
  return (
    <Card title="Documents" icon={<FileText size={16} />} actions={<span className="muted">Session only — never stored</span>}>
      <div className="docsHub">
        <div className="docsHubUpload">
          <UploadControls {...uploadProps} />
        </div>
        <div className="docList">
          {state.documents.map((doc: DocumentRecord) => (
            <div className="docItem" key={doc.id}>
              <span className="docIcon"><FileText size={15} /></span>
              <div className="docInfo">
                <strong title={doc.name}>{doc.name}</strong>
                <span>{doc.summary || doc.documentType.replace(/_/g, " ")}</span>
              </div>
              <span className="tag ok"><Check size={11} /></span>
            </div>
          ))}
          {!hasDocs && <EmptyState text="Upload or paste a document to begin." />}
        </div>
      </div>
    </Card>
  );
}

function TimelineSection({ timelineItems }: { timelineItems: any[]; compact?: boolean }) {
  const items = timelineItems;
  return (
    <Card title="Schedule" icon={<CalendarClock size={16} />}>
      <div className="timeline">
        {items.map((item: any) => (
          <div className={`tl ${item.urgency}`} key={item.id}>
            <span className="tlDate">{shortDate(item.date)}</span>
            <div className="tlBody">
              <strong>{item.title}</strong>
              {item.note && <span>{item.note}</span>}
            </div>
            <span className="tlKind">{item.kind}</span>
          </div>
        ))}
        {!items.length && <EmptyState text="Deadlines and to-dos appear after a document is processed." />}
      </div>
    </Card>
  );
}

const INBOX_PROMPTS = ["What's due this week?", "How much do I owe?", "Summarize my documents", "checklist"];

const INBOX_PREVIEW: Array<{ id: string; direction: "inbound" | "outbound"; text: string; kind?: string }> = [
  { id: "p1", direction: "outbound", text: "Good morning — 2 deadlines this week.", kind: "digest" },
  { id: "p2", direction: "outbound", text: "Lease renewal · Jun 15 ($2,400)\nCard payment · May 22 ($1,847)", kind: "reminder" },
  { id: "p3", direction: "inbound", text: "What's due this week?" },
  { id: "p4", direction: "outbound", text: "Lease Jun 15, Visa May 22. Reply checklist when you're caught up." },
];

function InboxBubble({ activity, preview }: { activity: { direction: string; text: string; kind?: string; effect?: string | null; createdAt?: string | number }; preview?: boolean }) {
  const mine = activity.direction === "inbound";
  return (
    <div className={`${mine ? "bubble out" : "bubble in"}${activity.effect ? " fx" : ""}${preview ? " bubblePreview" : ""}`}>
      {activity.kind === "reminder" && <span className="bubbleTag"><Bell size={10} /> Reminder</span>}
      {activity.kind === "digest" && <span className="bubbleTag"><Sparkles size={10} /> Morning brief</span>}
      {activity.kind === "celebration" && <span className="bubbleTag"><Sparkles size={10} /> All caught up</span>}
      <p>{activity.text}</p>
      {!preview && activity.createdAt && (
        <small>{new Date(activity.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
      )}
    </div>
  );
}

function InboxPage(props: any) {
  const {
    status, busy, sendLinqReply, linqReply, setLinqReply, linqThread, linqDelivered, hasDocs,
    reminders, firedIds, demoNow, advanceClock, jumpToNextReminder, resetClock, fireDue, sendDigest, goto,
  } = props;
  const fromPhone = status?.linq?.from || "+1 (415) 555-0142";
  const toPhone = status?.linq?.to || "+1 (415) 555-0198";
  const mode = status?.linq?.mode === "live" ? "Live" : "Demo";
  const clockDate = new Date(demoNow).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const dueCount = reminders.filter((r: Reminder) => r.status === "due" && !firedIds.includes(r.id)).length;
  const showPreview = !hasDocs && !linqThread.length;
  const threadItems = linqThread.length ? linqThread : showPreview ? INBOX_PREVIEW : [];

  return (
    <div className="inboxPage">
      <header className="inboxTop">
        <h1>Inbox</h1>
        <span className="linqTag">Linq · {mode}</span>
        <span className="inboxTopClock"><Clock size={13} /> {clockDate}</span>
        {dueCount > 0 && <span className="inboxDue">{dueCount} ready</span>}
        <div className="inboxTopSpacer" />
        {hasDocs && (
          <button type="button" className="ghost" onClick={sendDigest} disabled={Boolean(busy)}>
            <Sparkles size={14} /> Morning brief
          </button>
        )}
      </header>

      <div className="inboxBody">
        <aside className="inboxRail">
          <section className="inboxTm">
            <strong><Zap size={14} /> Time machine</strong>
            <div className="inboxTmBtns">
              <button type="button" className="inboxTmBtn" onClick={() => advanceClock(1)} disabled={!hasDocs || Boolean(busy)}>+1 day</button>
              <button type="button" className="inboxTmBtn" onClick={() => advanceClock(7)} disabled={!hasDocs || Boolean(busy)}>+1 week</button>
              <button type="button" className="inboxTmBtn" onClick={jumpToNextReminder} disabled={!hasDocs || Boolean(busy)}>Next due</button>
              <button type="button" className="inboxTmBtn" onClick={resetClock} disabled={Boolean(busy)}>Reset</button>
            </div>
          </section>

          <section className="inboxRem">
            <div className="inboxRemHead">
              <Bell size={15} />
              <strong>Reminders</strong>
              <span className="inboxRemCount">{reminders.length}</span>
            </div>
            <div className="inboxRemScroll">
              {reminders.map((r: Reminder) => {
                const sent = firedIds.includes(r.id);
                const stateLabel = sent ? "Sent" : r.status === "due" ? "Ready" : "Scheduled";
                const stateClass = sent ? "ok" : r.status === "due" ? "due" : "sched";
                return (
                  <div className="inboxRemItem" key={r.id}>
                    <span className={`inboxRemIcon ${r.kind}`}>{r.kind === "payment" ? <CreditCard size={14} /> : <CalendarClock size={14} />}</span>
                    <div className="inboxRemText">
                      <strong>{r.title}</strong>
                      <span>Texts {shortDate(r.fireAt)} · due {shortDate(r.dueDate)}</span>
                    </div>
                    <div className="inboxRemAct">
                      <span className={`pillState ${stateClass}`}>{sent ? <CheckCheck size={10} /> : null}{stateLabel}</span>
                      {!sent && (
                        <button type="button" className="inboxRemSend" onClick={() => fireDue(r.id)} disabled={Boolean(busy)}>Send</button>
                      )}
                    </div>
                  </div>
                );
              })}
              {!reminders.length && (
                <div className="inboxRemEmpty">
                  {hasDocs ? "No dated items yet." : "Upload on Home to schedule reminders."}
                </div>
              )}
            </div>
          </section>
        </aside>

        <div className="inboxStage">
          <div className={`phone phoneFull${showPreview ? " phonePreview" : ""}`}>
            {showPreview && <span className="phonePreviewBadge">Preview</span>}
            <div className="phoneHead">
              <span className="avatar"><ShieldCheck size={16} /></span>
              <div><strong>PaperTrail</strong><span>{toPhone}</span></div>
              <span className="linqTag linqTagLight">iMessage</span>
            </div>
            <div className="phoneThread phoneThreadFill">
              {!threadItems.length && (
                <div className="threadEmpty">
                  <MessageSquareText size={28} />
                  <strong>Your thread is empty</strong>
                  <span>Fire a reminder from the left, or pick a prompt on the right.</span>
                </div>
              )}
              {threadItems.map((a: LinqActivity & { id: string }) => (
                <InboxBubble key={a.id} activity={a} preview={showPreview} />
              ))}
              {linqDelivered && <div className="delivered">Delivered</div>}
            </div>
            {showPreview && (
              <div className="inboxPreviewBar">
                <button type="button" className="primary" onClick={() => goto("home")}>
                  <Paperclip size={14} /> Upload on Home
                </button>
              </div>
            )}
            <div className="phoneComposer">
              <input
                value={linqReply}
                onChange={(e) => setLinqReply(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendLinqReply()}
                placeholder={hasDocs ? "Message PaperTrail…" : "Upload on Home to chat…"}
                disabled={!hasDocs}
              />
              <button type="button" onClick={() => sendLinqReply()} disabled={!linqReply.trim() || Boolean(busy) || !hasDocs} aria-label="Send">
                <ArrowRight size={16} />
              </button>
            </div>
            <p className="phoneFoot">From {fromPhone} · Krava replies</p>
          </div>

          <aside className="inboxSide">
            <h2><Sparkles size={15} /> Try asking</h2>
            <p>Tap to send over iMessage. Same answers as in-app chat.</p>
            <div className="inboxSidePrompts">
              {INBOX_PROMPTS.map((t) => (
                <button key={t} type="button" className="inboxSideBtn" onClick={() => sendLinqReply(t)} disabled={Boolean(busy) || !hasDocs}>
                  {t}
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
            {!hasDocs && (
              <div className="inboxSideHint">
                <strong>Get started</strong>
                <span>Upload your documents on Home one at a time. Reminders and chat unlock after extraction.</span>
                <button type="button" className="primary" onClick={() => goto("home")}>
                  <Paperclip size={14} /> Go to Home
                </button>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function SettingsPage(props: any) {
  const { status, state, clearSession, busy } = props;
  return (
    <div className="page">
      <PageHead title="Settings" subtitle="Connections and privacy." />
      <div className="twoCol">
        <Card title="Connections" icon={<Settings size={16} />}>
          <div className="kv">
            <div className="kvRow"><span>Krava</span><b className={status?.krava.connected ? "on" : "off"}>{status?.krava.connected ? "Connected" : "Offline"}</b></div>
            <div className="kvRow"><span>Gemini (file reading)</span><b className={status?.env.gemini ? "on" : "off"}>{status?.env.gemini ? "Enabled" : "Disabled"}</b></div>
            <div className="kvRow"><span>Linq iMessage</span><b className="on">{status?.linq?.mode === "live" ? "Live" : "Demo"}</b></div>
          </div>
        </Card>
        <Card title="Privacy" icon={<ShieldCheck size={16} />}>
          <p className="privacyNote">PaperTrail stores <strong>nothing</strong>. Your documents, extracted details, and reminders live only in this browser session and disappear on refresh. Reminders are computed live — never saved to a database.</p>
          <button className="ghost danger" onClick={clearSession} disabled={Boolean(busy) || !state.documents.length}><Trash2 size={13} /> Clear session now</button>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, icon, actions, children }: { title: string; icon: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="cardHead">
        <div className="cardTitle">{icon}<h3>{title}</h3></div>
        {actions}
      </div>
      <div className="cardBody">{children}</div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

createRoot(document.getElementById("root")!).render(<App />);
