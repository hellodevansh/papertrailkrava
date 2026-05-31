/**
 * Reference metadata for demo-documents/ (upload manually during the live demo).
 */
export const demoDocumentManifest = [
  { fileBase: "01-pacific-water-power-past-due-notice", uploadOrder: 1, keyDates: ["2026-06-04", "2026-06-05", "2026-06-10"] },
  { fileBase: "02-clearview-robotics-open-enrollment", uploadOrder: 2, keyDates: ["2026-06-03"] },
  { fileBase: "03-frontier-lease-renewal-notice", uploadOrder: 3, keyDates: ["2026-06-07", "2026-07-01"] },
  { fileBase: "04-blue-harbor-card-statement", uploadOrder: 4, keyDates: ["2026-06-12"] },
  { fileBase: "05-northstar-health-appeal-denial", uploadOrder: 5, keyDates: ["2026-06-14"] },
  { fileBase: "06-irs-estimated-tax-voucher", uploadOrder: 6, keyDates: ["2026-06-15"] },
  { fileBase: "07-california-dmv-registration-renewal", uploadOrder: 7, keyDates: ["2026-06-22", "2026-06-30"] },
  { fileBase: "08-ucsf-medical-patient-statement", uploadOrder: 8, keyDates: ["2026-06-06", "2026-06-08"] },
  { fileBase: "09-sf-county-property-tax-installment", uploadOrder: 9, keyDates: ["2026-06-10"] },
  { fileBase: "10-mission-bay-towers-hoa-assessment", uploadOrder: 10, keyDates: ["2026-06-17", "2026-06-20"] },
  { fileBase: "11-lemonade-renters-insurance-renewal", uploadOrder: 11, keyDates: ["2026-06-19", "2026-07-01"] },
  { fileBase: "12-xfinity-internet-price-increase", uploadOrder: 12, keyDates: ["2026-06-09", "2026-06-11"] },
  { fileBase: "13-dr-chen-physical-therapy-referral", uploadOrder: 13, keyDates: ["2026-06-14"] },
  { fileBase: "14-navient-student-loan-billing-statement", uploadOrder: 14, keyDates: ["2026-06-24"] },
  { fileBase: "15-sunset-veterinary-wellness-invoice", uploadOrder: 15, keyDates: ["2026-06-26", "2026-07-31"] },
  { fileBase: "16-apple-card-savings-transfer-1099-int", uploadOrder: 16, keyDates: ["2026-06-15", "2026-06-18"] },
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
    keyDetails: [],
    questionsAnsweredByThisDoc: [],
  };
}
