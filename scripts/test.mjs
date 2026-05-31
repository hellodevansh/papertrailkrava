// PaperTrail unit tests — no network or running server required.
// Exercises the reminders engine, Linq demo send (effects + checklist), and the
// store extraction merge. Run with `npm test`.
import assert from "node:assert/strict";
import {
  buildReminders,
  dueReminders,
  composeReminderText,
  buildDigest,
  allCaughtUpText,
} from "../api/_lib/reminders.js";
import { sendLinqMessage, simulateInboundMessage } from "../api/_lib/linq.js";
import { upsertExtraction } from "../api/_lib/store.js";

// Keep tests offline & deterministic: no Krava token (forces the local fallback
// path instead of a network call) and Linq stays in demo mode.
process.env.KRAVA_APP_KEY = "";
process.env.LINQ_MODE = "demo";

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function sampleState() {
  return {
    documents: [{ id: "doc-1", name: "Lease.pdf", documentType: "lease", summary: "Apartment lease", uploadedAt: new Date().toISOString() }],
    facts: [],
    deadlines: [
      { id: "d1", title: "Lease renewal", date: "2026-06-14", urgency: "high", nextStep: "Sign and return", sourceDocument: "Lease.pdf" },
    ],
    subscriptions: [],
    payments: [
      { id: "p1", label: "Rent", amount: "2400", dueDate: "2026-06-01", sourceDocument: "Lease.pdf" },
    ],
    contacts: [],
    actionItems: [],
    keyDetails: [],
    linqActivities: [],
    linqChatId: null,
  };
}

test("buildReminders derives one reminder per deadline + payment", () => {
  const rems = buildReminders(sampleState(), new Date("2026-05-01T12:00:00").getTime());
  assert.equal(rems.length, 2);
  const ids = rems.map((r) => r.id).sort();
  assert.deepEqual(ids, ["rem-d1", "rem-p1"]);
});

test("high-urgency deadline fires 3 days ahead, payments 3 days ahead", () => {
  const rems = buildReminders(sampleState(), new Date("2026-05-01T12:00:00").getTime());
  const deadline = rems.find((r) => r.id === "rem-d1");
  const payment = rems.find((r) => r.id === "rem-p1");
  assert.equal(deadline.leadDays, 3);
  assert.equal(payment.leadDays, 3);
});

test("date-only deadlines do not drift across timezones (Jun 14 stays Jun 14)", () => {
  const rems = buildReminders(sampleState(), Date.now());
  const deadline = rems.find((r) => r.id === "rem-d1");
  assert.match(composeReminderText(deadline), /Jun 14/);
});

test("status flips to due once we time-travel past fireAt", () => {
  const before = buildReminders(sampleState(), new Date("2026-05-01T12:00:00").getTime());
  assert.ok(before.every((r) => r.status === "scheduled"));
  const after = buildReminders(sampleState(), new Date("2026-06-13T12:00:00").getTime());
  assert.ok(after.some((r) => r.status === "due"));
});

test("dueReminders respects firedIds", () => {
  const now = new Date("2026-06-13T12:00:00").getTime();
  const all = dueReminders(sampleState(), now, []);
  assert.ok(all.length >= 1);
  const filtered = dueReminders(sampleState(), now, all.map((r) => r.id));
  assert.equal(filtered.length, 0);
});

test("payment reminder text includes a dollar-formatted amount", () => {
  const rems = buildReminders(sampleState(), Date.now());
  const payment = rems.find((r) => r.id === "rem-p1");
  assert.match(payment.body, /\$2400/);
});

test("deadline reminder invites the two-way checklist reply", () => {
  const rems = buildReminders(sampleState(), Date.now());
  const deadline = rems.find((r) => r.id === "rem-d1");
  assert.match(deadline.body, /Reply "checklist"/);
});

test("buildDigest summarizes soonest items and invites checklist", () => {
  const digest = buildDigest(sampleState(), new Date("2026-05-01T12:00:00").getTime());
  assert.match(digest, /Good morning/);
  assert.match(digest, /Rent/);
  assert.match(digest, /checklist/);
});

test("buildDigest handles an empty state gracefully", () => {
  const empty = { deadlines: [], payments: [] };
  assert.match(buildDigest(empty, Date.now()), /all caught up/i);
});

test("allCaughtUpText is a friendly closer", () => {
  assert.match(allCaughtUpText(), /caught up/i);
});

test("Linq demo send threads the screen effect onto the outbound message", async () => {
  const res = await sendLinqMessage("Reminder: rent due", "reminder", sampleState(), { effect: "confetti" });
  assert.equal(res.mode, "demo");
  const outbound = res.state.linqActivities.find((a) => a.kind === "reminder");
  assert.equal(outbound.effect, "confetti");
});

test("inbound 'checklist' reply is answered (handled), thread records both sides", async () => {
  const res = await simulateInboundMessage("checklist", sampleState());
  assert.equal(res.handled, true);
  const inbound = res.state.linqActivities.find((a) => a.direction === "inbound");
  assert.ok(inbound, "expected the inbound message to be recorded");
});

test("store merges extraction into keyDetails (no legacy sensitiveFields)", async () => {
  const extraction = {
    documentName: "Bill.pdf",
    documentType: "bill",
    summary: "Electric bill",
    keyDetails: [{ label: "Account", value: "12345" }],
    deadlines: [],
    payments: [{ label: "Electric", amount: "88", dueDate: "2026-06-05" }],
  };
  const state = await upsertExtraction(extraction, { name: "Bill.pdf" }, null);
  assert.equal(state.keyDetails.length, 1);
  assert.equal(state.sensitiveFields, undefined);
  assert.ok(state.documents.some((d) => d.name === "Bill.pdf"));
});

const run = async () => {
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`  \u2713 ${name}`);
    } catch (err) {
      console.error(`  \u2717 ${name}`);
      console.error(`    ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log(`\n${passed}/${tests.length} tests passed`);
};

run();
