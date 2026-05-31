const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateMs(value) {
  if (!value) return NaN;
  // Anchor bare YYYY-MM-DD at local noon so timezone offsets don't roll the day back.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(String(value).trim()) ? `${value}T12:00:00` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? NaN : date.getTime();
}

/** Start of the local calendar day for demo-clock comparisons. */
function startOfLocalDayMs(nowMs) {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** True when the due date is today or still in the future (not before demo "today"). */
function isDueOnOrAfterDay(dueDate, nowMs) {
  const dueMs = parseDateMs(dueDate);
  if (Number.isNaN(dueMs)) return false;
  return dueMs >= startOfLocalDayMs(nowMs);
}

function prettyDate(value) {
  const ms = parseDateMs(value);
  if (Number.isNaN(ms)) return value || "soon";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function urgencyLeadDays(urgency = "") {
  const v = String(urgency).toLowerCase();
  if (v.includes("high") || v.includes("urgent")) return 3;
  if (v.includes("low")) return 1;
  return 2;
}

function amountText(value) {
  if (value === null || value === undefined) return "";
  const str = String(value).trim();
  if (!str) return "";
  return /^[-$€£]/.test(str) ? str : `$${str}`;
}

/** Short, human iMessage copy for a reminder. Deterministic — never depends on an API. */
export function composeReminderText(item) {
  const due = prettyDate(item.dueDate);
  if (item.kind === "payment") {
    const amt = amountText(item.amount);
    return `Reminder from PaperTrail: ${item.title}${amt ? ` (${amt})` : ""} is due ${due}.`;
  }
  const next = item.nextStep ? ` Next: ${item.nextStep}` : "";
  return `Reminder from PaperTrail: ${item.title} is due ${due}.${next} Reply "checklist" for what to prepare.`;
}

/**
 * Compute the reminder queue from session state. Pure function — no I/O.
 * Each reminder fires `leadDays` before its due date; status is resolved against `now`.
 */
export function buildReminders(state, now = Date.now()) {
  const nowMs = typeof now === "number" ? now : parseDateMs(now) || Date.now();
  const out = [];

  for (const d of state?.deadlines || []) {
    const dueMs = parseDateMs(d.date);
    if (Number.isNaN(dueMs)) continue;
    const leadDays = urgencyLeadDays(d.urgency);
    const fireMs = dueMs - leadDays * DAY_MS;
    out.push({
      id: `rem-${d.id}`,
      sourceId: d.id,
      kind: "deadline",
      title: d.title,
      dueDate: d.date,
      nextStep: d.nextStep || "",
      urgency: d.urgency || "medium",
      sourceDocument: d.sourceDocument || "",
      leadDays,
      fireAt: new Date(fireMs).toISOString(),
      dueInDays: Math.round((dueMs - nowMs) / DAY_MS),
      status: nowMs >= fireMs ? "due" : "scheduled",
    });
  }

  for (const p of state?.payments || []) {
    const dueMs = parseDateMs(p.dueDate);
    if (Number.isNaN(dueMs)) continue;
    const leadDays = 3;
    const fireMs = dueMs - leadDays * DAY_MS;
    out.push({
      id: `rem-${p.id}`,
      sourceId: p.id,
      kind: "payment",
      title: p.label || p.payee || "Payment",
      amount: p.amount,
      dueDate: p.dueDate,
      sourceDocument: p.sourceDocument || "",
      leadDays,
      fireAt: new Date(fireMs).toISOString(),
      dueInDays: Math.round((dueMs - nowMs) / DAY_MS),
      status: nowMs >= fireMs ? "due" : "scheduled",
    });
  }

  out.sort((a, b) => parseDateMs(a.fireAt) - parseDateMs(b.fireAt));
  return out.map((r) => ({ ...r, body: composeReminderText(r) }));
}

/** Reminders whose fireAt has passed relative to `now` and that haven't been fired yet. */
export function dueReminders(state, now = Date.now(), firedIds = []) {
  const fired = new Set(firedIds);
  return buildReminders(state, now).filter((r) => r.status === "due" && !fired.has(r.id));
}

/** A single, human "morning brief" summarizing the soonest upcoming items. */
export function buildDigest(state, now = Date.now(), limit = 3) {
  const nowMs = typeof now === "number" ? now : parseDateMs(now) || Date.now();
  const items = buildReminders(state, nowMs)
    .filter((r) => isDueOnOrAfterDay(r.dueDate, nowMs))
    .sort((a, b) => parseDateMs(a.dueDate) - parseDateMs(b.dueDate))
    .slice(0, limit);
  if (!items.length) return "Good news — you're all caught up. Nothing due right now.";
  const lines = items.map((r, i) => {
    const amt = r.kind === "payment" ? amountText(r.amount) : "";
    return `${i + 1}. ${r.title}${amt ? ` (${amt})` : ""} — due ${prettyDate(r.dueDate)}`;
  });
  return `Good morning! Here's what's coming up:\n${lines.join("\n")}\n\nReply "checklist" for the details on any of these.`;
}

export function allCaughtUpText() {
  return "That's everything handled — you're all caught up. I'll text you before the next deadline.";
}
