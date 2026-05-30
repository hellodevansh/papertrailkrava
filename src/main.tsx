import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CircleAlert,
  Clock3,
  FileText,
  Image,
  LockKeyhole,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Upload,
  WalletCards,
} from "lucide-react";
import "./styles.css";

type Status = {
  env: {
    gemini: boolean;
    krava: boolean;
    linq: boolean;
    linqMode?: string;
    webhook: boolean;
  };
  krava: {
    connected: boolean;
    mode: string;
    message?: string;
  };
  linq?: {
    mode: string;
    ready: boolean;
    from: string;
    to: string;
    integration: string;
    note?: string;
  };
  storage?: {
    mode: string;
    durable: boolean;
    note?: string;
  };
  state: PaperTrailState;
};

type PaperTrailState = {
  documents: DocumentRecord[];
  facts: Fact[];
  deadlines: Deadline[];
  subscriptions: Subscription[];
  payments: Payment[];
  contacts: Contact[];
  actionItems: ActionItem[];
  sensitiveFields: SensitiveField[];
  consentDecisions: ConsentDecision[];
  linqActivities: LinqActivity[];
  updatedAt: string | null;
};

type DocumentRecord = {
  id: string;
  name: string;
  documentType: string;
  summary: string;
  uploadedAt: string;
};

type Fact = {
  id: string;
  label: string;
  value: string;
  category: string;
  sensitivity: string;
  sourceDocument: string;
};

type Deadline = {
  id: string;
  title: string;
  date: string;
  urgency: string;
  nextStep: string;
  sourceDocument: string;
};

type Subscription = {
  id: string;
  merchant: string;
  amount: string;
  cadence: string;
  category: string;
  cancelSuggestion: string;
  sourceDocument: string;
};

type Payment = {
  id: string;
  label: string;
  amount: string;
  dueDate: string;
  payee: string;
  sourceDocument: string;
};

type Contact = {
  id: string;
  name: string;
  role: string;
  contact: string;
  sourceDocument: string;
};

type ActionItem = {
  id: string;
  title: string;
  priority: string;
  dueDate: string;
  suggestedAction: string;
  sourceDocument: string;
};

type SensitiveField = {
  id: string;
  label: string;
  value: string;
  category: string;
  reason: string;
  approved: boolean;
  locked: boolean;
  denied?: boolean;
  sourceDocument: string;
};

type ConsentDecision = {
  id: string;
  command: string;
  approved: string[];
  denied: string[];
  createdAt: string;
};

type LinqActivity = {
  id: string;
  direction: "inbound" | "outbound";
  kind: string;
  text: string;
  status: string;
  createdAt: string;
  from?: string;
  to?: string;
  channel?: string;
};

type Answer = {
  answer: string;
  provider: string;
  sources: string[];
  privateFactsAccessed: string[];
  warning?: string;
};

const emptyState: PaperTrailState = {
  documents: [],
  facts: [],
  deadlines: [],
  subscriptions: [],
  payments: [],
  contacts: [],
  actionItems: [],
  sensitiveFields: [],
  consentDecisions: [],
  linqActivities: [],
  updatedAt: null,
};

const sampleDocs = [
  {
    id: "lease-renewal",
    name: "Lease Renewal Notice",
    type: "Lease",
    text: `Hi Maya,

Your lease at 995 Market Street, Unit 1502 renews on July 1, 2026 and expires June 30, 2027.
Your rent will increase from $2,850 to $3,100 per month starting July 1.
If you need a payment plan or accommodation, respond by June 7, 2026.
Please include your unit number and reason for request.

Frontier Property Management
leasing@example.com`,
  },
  {
    id: "card-statement",
    name: "Credit Card Statement",
    type: "Statement",
    text: `Statement period: May 1 - May 28, 2026
Payment due: June 12, 2026
Minimum payment: $85.00

Recurring charges:
Netflix - $15.49 monthly - May 4
Spotify - $11.99 monthly - May 9
iCloud - $2.99 monthly - May 12
Gympass - $39.00 monthly - May 17
Notion - $10.00 monthly - May 21

Card ending in 4421.`,
  },
  {
    id: "insurance-appeal",
    name: "Insurance Appeal Letter",
    type: "Insurance",
    text: `Claim ID: INS-48291-A
Member: Maya Patel
Your claim for physical therapy reimbursement was denied because documentation was missing.
Appeal deadline: June 14, 2026.
Required documents: referral letter, itemized receipt, provider NPI, and visit dates.
Mail or upload your appeal before the deadline.`,
  },
];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
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

function shortDate(value: string) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [state, setState] = useState<PaperTrailState>(emptyState);
  const [pasteName, setPasteName] = useState("Pasted document");
  const [pasteText, setPasteText] = useState("");
  const [question, setQuestion] = useState("What subscriptions am I paying for?");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linqReply, setLinqReply] = useState("approve address rent, deny medical");

  const linqThread = useMemo(() => {
    const messages = state.linqActivities.filter(
      (activity) => activity.text !== "(delivered)" && !activity.kind.startsWith("message."),
    );
    return [...messages].reverse();
  }, [state.linqActivities]);

  const linqDelivered = state.linqActivities.some(
    (activity) => activity.direction === "outbound" && activity.status === "delivered",
  );

  const loadStatus = async () => {
    const next = await api<Status>("/api/status");
    setStatus(next);
    setState(next.state || emptyState);
  };

  useEffect(() => {
    loadStatus().catch((err) => setError(err.message));
    const interval = window.setInterval(() => {
      loadStatus().catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(interval);
  }, []);

  const totals = useMemo(
    () => [
      { label: "Docs", value: state.documents.length, icon: FileText },
      { label: "Deadlines", value: state.deadlines.length, icon: Clock3 },
      { label: "Subscriptions", value: state.subscriptions.length, icon: WalletCards },
      { label: "Locked facts", value: state.sensitiveFields.filter((field) => field.locked).length, icon: LockKeyhole },
    ],
    [state],
  );

  const extractDocument = async (payload: { id?: string; name: string; text?: string; mimeType?: string; dataBase64?: string }) => {
    setBusy(`Extracting ${payload.name}`);
    setError(null);
    try {
      const result = await api<{ state: PaperTrailState; warning?: string }>("/api/documents/extract", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setState(result.state);
      if (result.warning) setError(result.warning);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setBusy(null);
    }
  };

  const loadSamples = async () => {
    for (const doc of sampleDocs) {
      await extractDocument({ id: doc.id, name: doc.name, text: doc.text, mimeType: "text/plain" });
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
  };

  const uploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(`Reading ${file.name}`);
    try {
      if (file.type.startsWith("text/")) {
        await extractDocument({ name: file.name, text: await file.text(), mimeType: file.type });
      } else {
        await extractDocument({ name: file.name, mimeType: file.type || "application/octet-stream", dataBase64: await fileToBase64(file) });
      }
    } finally {
      event.target.value = "";
      setBusy(null);
    }
  };

  const ask = async (query = question) => {
    setBusy("Asking PaperTrail");
    setError(null);
    try {
      const result = await api<Answer>("/api/krava/ask", {
        method: "POST",
        body: JSON.stringify({ query }),
      });
      setAnswer(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Question failed");
    } finally {
      setBusy(null);
    }
  };

  const sendApproval = async () => {
    setBusy("Sending approval via iMessage");
    try {
      const result = await api<{ state: PaperTrailState }>("/api/linq/send", {
        method: "POST",
        body: JSON.stringify({ kind: "approval" }),
      });
      setState(result.state);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Linq send failed");
    } finally {
      setBusy(null);
    }
  };

  const sendLinqReply = async (text = linqReply) => {
    if (!text.trim()) return;
    setBusy("Sending iMessage reply");
    try {
      const result = await api<{ state: PaperTrailState }>("/api/linq/reply", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setState(result.state);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "iMessage reply failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="appShell">
      <header className="topBar">
        <div>
          <div className="brand">
            <ShieldCheck size={24} />
            <span>PaperTrail</span>
          </div>
          <p>Krava-native AI reasoning for leases, bills, insurance, HR, statements, and life admin paperwork.</p>
        </div>
        <div className="statusRail">
          <StatusPill active={Boolean(status?.krava.connected)} label={`Krava brain ${status?.krava.mode || "demo"}`} />
          <StatusPill active={Boolean(status?.env.gemini)} label="Gemini file reader" />
          <StatusPill active={Boolean(status?.env.linq)} label={`Linq iMessage ${status?.linq?.mode || status?.env.linqMode || "demo"}`} />
          <StatusPill active={Boolean(status?.env.webhook)} label={status?.linq?.mode === "live" ? "Webhook" : "Webhook (sim)"} />
        </div>
      </header>

      {!status?.env.krava && (
        <div className="demoNotice">
          <CircleAlert size={18} />
          <span>Add KRAVA_APP_KEY for live extraction and Q&A. Gemini is only used to read image/PDF files before Krava reasons over the text.</span>
        </div>
      )}

      {status?.linq?.mode === "demo" && (
        <div className="linqDemoBanner">
          <MessageSquareText size={18} />
          <span>
            <strong>Linq demo mode:</strong> simulates iMessage approvals and inbound webhooks locally — same UX as production{" "}
            <code>chats.create</code> → <code>message.received</code> without API keys.
          </span>
        </div>
      )}

      <section className="metrics">
        {totals.map((item) => (
          <div className="metric" key={item.label}>
            <item.icon size={20} />
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </section>

      <section className="layout">
        <aside className="sidebar">
          <Panel title="Document Inbox" icon={<Upload size={18} />} action={<button onClick={loadSamples} disabled={Boolean(busy)}>Load samples</button>}>
            <label className="uploadBox">
              <input type="file" accept=".txt,.md,.pdf,image/*" onChange={uploadFile} />
              <Image size={20} />
              <span>Upload PDF, image, or text</span>
            </label>
            <div className="pasteBox">
              <input value={pasteName} onChange={(event) => setPasteName(event.target.value)} />
              <textarea value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder="Paste a bill, lease clause, statement, HR email, or insurance note." />
              <button disabled={!pasteText.trim() || Boolean(busy)} onClick={() => extractDocument({ name: pasteName, text: pasteText, mimeType: "text/plain" })}>
                Extract pasted text
              </button>
            </div>
            <div className="docList">
              {state.documents.map((doc) => (
                <div className="docItem" key={doc.id}>
                  <FileText size={16} />
                  <div>
                    <strong>{doc.name}</strong>
                    <span>{doc.documentType}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </aside>

        <section className="mainGrid">
          <Panel title="Priority Timeline" icon={<Clock3 size={18} />}>
            <div className="timeline">
              {[...state.deadlines, ...state.actionItems].slice(0, 8).map((item) => (
                <div className="timelineItem" key={item.id}>
                  <time>{shortDate("date" in item ? item.date : item.dueDate)}</time>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{"nextStep" in item ? item.nextStep : item.suggestedAction}</span>
                  </div>
                </div>
              ))}
              {!state.deadlines.length && !state.actionItems.length && <EmptyState text="Load sample docs or upload paperwork to generate action items." />}
            </div>
          </Panel>

          <Panel title="Subscriptions & Payments" icon={<WalletCards size={18} />}>
            <div className="table">
              {state.subscriptions.map((item) => (
                <div className="row" key={item.id}>
                  <strong>{item.merchant}</strong>
                  <span>{item.amount}</span>
                  <span>{item.cadence}</span>
                  <em>{item.cancelSuggestion}</em>
                </div>
              ))}
              {state.payments.map((item) => (
                <div className="row payment" key={item.id}>
                  <strong>{item.label}</strong>
                  <span>{item.amount}</span>
                  <span>{shortDate(item.dueDate)}</span>
                  <em>{item.payee}</em>
                </div>
              ))}
              {!state.subscriptions.length && !state.payments.length && <EmptyState text="No payments found yet." />}
            </div>
          </Panel>

          <Panel title="Ask PaperTrail" icon={<Search size={18} />}>
            <div className="askBox">
              <div className="askInput">
                <input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => event.key === "Enter" && ask()} />
                <button onClick={() => ask()} disabled={!question.trim() || Boolean(busy)}>
                  <Send size={16} />
                </button>
              </div>
              <div className="quickQuestions">
                {["When does my lease expire?", "What is urgent this week?", "What subscriptions am I paying for?"].map((item) => (
                  <button key={item} onClick={() => ask(item)}>{item}</button>
                ))}
              </div>
              {answer && (
                <div className="answerCard">
                  <p>{answer.answer}</p>
                  <div className="audit">
                    <span>Provider: {answer.provider}</span>
                    <span>Sources: {answer.sources?.join(", ") || "local private index"}</span>
                    <span>Private facts: {answer.privateFactsAccessed?.slice(0, 4).join(", ") || "none"}</span>
                  </div>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Private Facts Vault" icon={<LockKeyhole size={18} />}>
            <div className="vault">
              {state.sensitiveFields.map((field) => (
                <div className="vaultItem" key={field.id}>
                  <div>
                    <strong>{field.label}</strong>
                    <span>{field.value}</span>
                    <small>{field.reason} · {field.sourceDocument}</small>
                  </div>
                  <em className={field.approved ? "ok" : field.denied ? "deny" : "locked"}>{field.approved ? "Approved" : field.denied ? "Denied" : "Locked"}</em>
                </div>
              ))}
              {!state.sensitiveFields.length && <EmptyState text="Sensitive fields will appear here after extraction." />}
            </div>
          </Panel>
        </section>

        <aside className="rightRail">
          <Panel
            title="iMessage via Linq"
            icon={<MessageSquareText size={18} />}
            action={
              <button onClick={sendApproval} disabled={Boolean(busy) || !state.sensitiveFields.length}>
                Send approval
              </button>
            }
          >
            <div className="linqMeta">
              <span className="linqModeBadge">{status?.linq?.mode === "live" ? "Live" : "Demo"}</span>
              <span>
                {status?.linq?.from || "+1 (415) 555-0142"} → {status?.linq?.to || "+1 (415) 555-0198"}
              </span>
            </div>

            <div className="imessageThread">
              {linqThread.map((activity) => (
                <div
                  key={activity.id}
                  className={activity.direction === "outbound" ? "imessageBubble outbound" : "imessageBubble inbound"}
                >
                  <p>{activity.text}</p>
                  <small>{activity.kind.replace("message.", "")} · {new Date(activity.createdAt).toLocaleTimeString()}</small>
                </div>
              ))}
              {!linqThread.length && (
                <EmptyState text="Send an approval request after extracting docs. Sensitive facts unlock when you reply on iMessage." />
              )}
              {linqDelivered && <div className="imessageReceipt">Delivered</div>}
            </div>

            <div className="linqQuickReplies">
              {[
                "approve address rent, deny medical",
                "approve address rent",
                "deny medical",
                "What subscriptions am I paying for?",
              ].map((item) => (
                <button key={item} type="button" disabled={Boolean(busy)} onClick={() => sendLinqReply(item)}>
                  {item}
                </button>
              ))}
            </div>

            <div className="linqComposer">
              <input
                value={linqReply}
                onChange={(event) => setLinqReply(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && sendLinqReply()}
                placeholder="Reply as the user on iMessage…"
              />
              <button type="button" disabled={!linqReply.trim() || Boolean(busy)} onClick={() => sendLinqReply()}>
                <Send size={16} />
              </button>
            </div>

            <details className="linqArchitecture">
              <summary>How this maps to Linq in production</summary>
              <ol>
                <li>
                  <code>POST /api/linq/send</code> → Linq <code>chats.create</code> or <code>messages.send</code>
                </li>
                <li>
                  User replies on iMessage → Linq <code>message.received</code> webhook → <code>POST /api/linq/webhook</code>
                </li>
                <li>PaperTrail parses consent, updates vault, auto-confirms on thread</li>
              </ol>
            </details>
          </Panel>

          <Panel title="System" icon={<RefreshCw size={18} />}>
            <div className="systemList">
              <span>Last sync: {state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString() : "waiting"}</span>
              <span>Krava: {status?.krava.message || status?.krava.mode || "checking"}</span>
              <span>Storage: {status?.storage?.mode || "checking"}{status?.storage?.durable === false ? " (add Redis on Vercel)" : ""}</span>
              {busy && <span>Working: {busy}</span>}
              {error && <span className="errorText">{error}</span>}
            </div>
          </Panel>
        </aside>
      </section>
    </main>
  );
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return <span className={active ? "pill active" : "pill"}>{label}</span>;
}

function Panel({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="panel">
      <div className="panelHeader">
        <div>
          {icon}
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

createRoot(document.getElementById("root")!).render(<App />);
