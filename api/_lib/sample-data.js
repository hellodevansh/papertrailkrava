export const sampleDocuments = [
  {
    id: "lease-renewal",
    name: "Lease Renewal Notice",
    mimeType: "text/plain",
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
    mimeType: "text/plain",
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
    id: "insurance-denial",
    name: "Insurance Appeal Letter",
    mimeType: "text/plain",
    text: `Claim ID: INS-48291-A
Member: Maya Patel
Your claim for physical therapy reimbursement was denied because documentation was missing.
Appeal deadline: June 14, 2026.
Required documents: referral letter, itemized receipt, provider NPI, and visit dates.
Mail or upload your appeal before the deadline.`,
  },
];

export function emptyExtraction(name = "Untitled document") {
  return {
    documentId: crypto.randomUUID(),
    documentName: name,
    documentType: "unknown",
    summary: "No structured extraction is available yet.",
    facts: [],
    deadlines: [],
    subscriptions: [],
    payments: [],
    contacts: [],
    actionItems: [],
    sensitiveFields: [],
    questionsAnsweredByThisDoc: [],
  };
}
