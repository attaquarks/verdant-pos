# Original-template frontend with Urdu and shopkeeper guidance

This branch restores the original main-branch layout and dimensions: body typography, expanded sidebar, navigation, page structure, date controls and New Sale button. It removes the enlarged styling, separate mobile bottom navigation and other redesign elements. The previous frontend proposal was not merged into production.

## Retained and added

- Authored Urdu interface, RTL and locally bundled Urdu font; English remains available.
- Persistent night/light theme and language preferences use server-rendered, allowlisted cookies. Settings do not change any saved shop records.
- Four dashboard task cards: Sell, Check stock/maal, Collect udhaar and Record a daily expense.
- Clicking the Verdant logo on the desktop sidebar collapses it to an icon rail; clicking it again expands it. Links retain accessible names. The sidebar itself uses the original English navigation labels (or their Urdu translations), not Roman-Urdu variants.
- English pages add short, contextual Roman-Urdu explanations, such as Money ledger (paisay ka hisaab), Expense ledger (kharchon ka hisaab), and profit (munafa). Urdu pages use Urdu instead. These are UI labels, not alterations to saved names or accounting records.
- Date controls preserve the original layout with accessible screen-reader labels. The original floating sale button and stock receive icon are restored.
- The original new-shop defaults are restored: editable currency and browser-detected timezone. Existing shop values remain untouched.

## Outstanding udhaar

The card opens `/sales?due=1`. This mode filters the authenticated shop's credit sales to `balance_due > 0` across **all dates**, before pagination, rather than silently limiting the list to the current week. The sale detail retains the existing collection flow and financial calculations. Partial payment reduces the balance; fully paid sales no longer appear in the due-only list. A Show all sales control returns to ordinary date-filtered sales. Sales export in due mode uses the same all-dates credit and positive-balance filter; normal sales and other exports keep the prior date behavior. No SQL migration or mutation RPC changed.

## Verification boundaries

Unit and PGlite-backed SQL tests exercise currency arithmetic, sales, idempotency, stock, credit/collections, returns, expenses, reports and tenant isolation. The additional udhaar tests inspect tenant scope, positive-balance filtering, date independence and pagination. Chromium fixture tests use a test-only in-memory adapter and synthetic data; those tests alone do not prove hosted behavior.

On November 2, the owner-authorized real-cloud preview run exercised the revised branch against real Supabase Auth, PostgREST and Next.js actions, using a fresh, labeled QA shop. Twelve checkpoints passed, including all four task paths; due-list and CSV filtering with deliberately non-overlapping date parameters; partial and full collections; paid-sale removal; stock after a cash and credit sale; original desktop dimensions; sidebar collapse; Urdu/night persistence; and two Axe checks. The test did not create an actual historically dated sale. An initial sidebar width assertion raced the UI update; the harness was corrected to await the measured state before the successful full run. The exact QA account was subsequently banned and its membership made inactive; a previously issued token could no longer read products. QA ledger records remain retained. Seven independent database reconciliation violation counts were zero.

The baseline real-cloud QA and the independent Secure-cookie fix are in separate QA PR #2. Actual confirmation/reset email delivery, an independent backup/restore, physical devices/printers, and native-speaker/shopkeeper usability review remain unverified. No production deployment or real shop data was changed by this frontend branch.
