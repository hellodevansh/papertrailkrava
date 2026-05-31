# PaperTrail demo documents

**→ On stage? Start here: [`DEMO-WALKTHROUGH.md`](./DEMO-WALKTHROUGH.md)** — best 4 docs, line-by-line script, time travel, pitch lines.

Fictional life-admin paperwork for **Maya Patel** (995 Market St, Unit 1502, San Francisco). No real PII.

Each topic has **`.txt`** (paste or upload) and **`.pdf`** (upload — needs `GEMINI_API_KEY` for transcription). TXT and PDF share the same content.

**Demo “today”:** Saturday **May 30, 2026** (in-app time machine default).

---

## Full library (16 documents)

### Core flow (upload first in a live demo)

| Step | File | Type | Key dates | ~Reminder fire |
|------|------|------|-----------|----------------|
| 1 | `01-pacific-water-power-past-due-notice` | Utility disconnect warning | Pay **Jun 5**; extension **Jun 4**; disconnect **Jun 10** | ~Jun 2 |
| 2 | `02-clearview-robotics-open-enrollment` | HR benefits email | Close **Jun 3** | ~May 31 |
| 3 | `03-frontier-lease-renewal-notice` | Lease / rent | Respond **Jun 7**; rent **Jul 1** | ~Jun 5 |
| 4 | `04-blue-harbor-card-statement` | Credit card | Pay **Jun 12** | ~Jun 9 |
| 5 | `05-northstar-health-appeal-denial` | Insurance EOB / denial | Appeal **Jun 14** | ~Jun 12 |
| 6 | `06-irs-estimated-tax-voucher` | Federal estimated tax | **Jun 15** | ~Jun 13 |
| 7 | `07-california-dmv-registration-renewal` | DMV | Pay **Jun 22** | ~Jun 20 |

### Additional realistic documents (upload anytime)

| File | Type | Key dates | Demo angle |
|------|------|-----------|------------|
| `08-ucsf-medical-patient-statement` | Hospital bill | Pay **Jun 8** | Pairs with insurance denial; “how much do I owe UCSF?” |
| `09-sf-county-property-tax-installment` | Property tax | **Jun 10** | Big dollar amount ($2,118) |
| `10-mission-bay-towers-hoa-assessment` | HOA invoice | **Jun 17** | Condo fees + special assessment vote **Jun 20** |
| `11-lemonade-renters-insurance-renewal` | Renters insurance | Change/cancel by **Jun 19**; renew **Jul 1** | Lease renewal proof of insurance |
| `12-xfinity-internet-price-increase` | ISP notice | New rate **Jun 11**; downgrade by **Jun 9** | Subscription / cost creep |
| `13-dr-chen-physical-therapy-referral` | Medical referral (PHI) | Appeal docs by **Jun 14** | Upload *with* #05 for appeal storyline |
| `14-navient-student-loan-billing-statement` | Student loan | **Jun 24** | Autopay + federal loan tone |
| `15-sunset-veterinary-wellness-invoice` | Vet invoice | **Jun 26** | Pet + dental follow-up **Jul 31** |
| `16-apple-card-savings-transfer-1099-int` | Tax 1099-INT | Prep by **Jun 18**; CA filing **Jun 15** | Cross-links estimated tax doc |

After all uploads: **15+ reminders**, morning brief, time machine **+1 day** / **+1 week** / **Next due**.

---

## Suggested Q&A per new document

**08 UCSF:** *How much do I owe the hospital?* · *Is this related to my insurance denial?*

**09 Property tax:** *When is my property tax due?* · *What's the total installment amount?*

**10 HOA:** *How much is my HOA bill?* · *Is there a special assessment vote?*

**11 Lemonade:** *When does my renters insurance renew?* · *How much did my premium increase?*

**12 Xfinity:** *When does my internet price go up?* · *What can I do before June 9?*

**13 Referral:** *What diagnosis was on my PT referral?* · *What do I need for my appeal?*

**14 Navient:** *When is my student loan payment due?* · *What's my monthly payment?*

**15 Vet:** *When is Mochi's vet bill due?* · *When should I schedule a dental cleaning?*

**16 1099:** *How much interest did I earn last year?* · *What tax deadlines are in mid-June?*

---

## Story arc (optional 10-min demo)

1. Utility PDF → urgent tone  
2. HR enrollment TXT → deadline in 3 days  
3. Lease PDF → rent increase  
4. Insurance denial + **referral letter** (#05 + #13) → appeal packet  
5. UCSF bill (#08) → ties denial to dollars owed  
6. Card statement → subscriptions  
7. Property tax + IRS voucher → “money out” montage  
8. Inbox time machine → fire reminders → `checklist`  

---

## Regenerate PDFs

```bash
npm run demo:pdfs
```

## Format tips

- **PDF** = most impressive on stage; needs Gemini to read bytes.  
- **TXT** = fastest if API key missing; paste works too.  
- Upload **one file at a time** so the audience sees extraction + reminders grow.
