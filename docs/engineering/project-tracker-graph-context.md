# Cabzone Project Tracker — Graphify context

Source workbook: `artifacts/Cabzone_Project_Tracker.xlsx`. Snapshot: 26 October 2026. This file makes the workbook's task register searchable in Graphify; the workbook remains the editable tracker. Status and priority below are the tracker snapshot, not independent proof of production readiness. Owners and task dates were unassigned, so the Gantt has no task bars. Refresh this context after editing the workbook.

The workbook has 27 tasks: 4 Complete, 2 In Progress, 2 At Risk, and 19 Not Started. The 20-week Gantt view begins 26 October 2026; that date is a display anchor, not a promised launch date. The [documentation review](../../graphify-out/documentation/DOCUMENTATION_REVIEW.md) supplied the initial priorities. The newer [real-world gap report](real-world-gap-analysis-report.md) is another audit input; its findings need code and product-decision verification before changing task statuses or scope.

## Product and documentation

### Confirm beta scope and launch exclusions
Decided in docs (sync workbook row) · P0. Internal Beta / Test Staging target, launch exclusions, one-active-ride 9-status guard, next-ride cancellation arrears ledger, non-commissioned toll estimates, and double-blind 7-day ratings are recorded in [D-042–D-046](../decision-log.md) and [Step 1 of dev-to-staging](devtostagestate.md). Source: [rider MVP exit criteria](rider-app-architecture-and-implementation-plan.md), [driver release gate](driver-app-architecture-and-implementation-plan.md).

### Resolve live wallet provider launch scope
At Risk · P1. The test wallet flow exists; live funding and payouts have separate prerequisites. Source: [driver wallet money movement](driver-wallet-money-movement.md).

### Sync D-039 pricing and state-routing specs
Not Started · P1. D-039 supersedes D-037's uniform-state rule. Source: [decision log](../decision-log.md), [documentation review](../../graphify-out/documentation/DOCUMENTATION_REVIEW.md).

### Sync UPI guide and mobile docs hub
Not Started · P1. Source: [UPI checkout guide](razorpay-upi-test-checkout.md), [docs hub](../README.md), [October 24 work log](../../daily-work/24thoct.md).

### Graphify all 71 project documents
Complete · P1 as recorded when the workbook was created. Source: [documentation review](../../graphify-out/documentation/DOCUMENTATION_REVIEW.md). The document corpus has since grown; this is a historical task label, not a live document count.

## Financials and admin web

### Backend: reconcile historical ride money
Not Started · P0. Avoid duplicate earnings credits when reconciling previously settled rides. Source: [driver wallet money movement](driver-wallet-money-movement.md), [audit next sequence](../../audit.md).

### Backend: server earnings totals and paging
Not Started · P0. Period totals and full history must reconcile with the ledger, independently of the latest 100 rides loaded in the driver app. Source: [driver app slice 4](driver-app-architecture-and-implementation-plan.md).

### Web: remove sample Finance figures
Not Started · P0. The admin Finance view currently substitutes illustrative figures when stats are unavailable. Source: [documentation review](../../graphify-out/documentation/DOCUMENTATION_REVIEW.md).

### Backend: closed disputes and receipt evidence
Not Started · P1. Source: [audit next sequence](../../audit.md), [D-041](../decision-log.md).

### Implement test recharge and cashout
Complete · P0 for the documented implementation; phone and provider recovery remain separate checks. Source: [driver wallet money movement](driver-wallet-money-movement.md), [October 24 work log](../../daily-work/24thoct.md).

### Implement rider/driver QR and webhook flow
Complete · P0 for the documented implementation; real UPI app handoff needs live merchant access. Source: [UPI checkout guide](razorpay-upi-test-checkout.md), [October 24 work log](../../daily-work/24thoct.md).

## Identity, KYC and security

### Backend: review KYC storage and ownership
In Progress · P0. Source: [audit current review](../../audit.md), [driver onboarding audit](driver-onboarding-flow-audit.md).

### Driver: document expiry and renewal flow
Not Started · P1. Source: [audit current review](../../audit.md), [driver onboarding audit](driver-onboarding-flow-audit.md).

### Verify production SMS and OTP fail closed
Not Started · P0 as a release verification task. Source: [D-040](../decision-log.md), [audit current review](../../audit.md).

### Verify KYC preview and upload privacy
Not Started · P0 as a release verification task. Source: [audit current review](../../audit.md), [October 24 work log](../../daily-work/24thoct.md).

### Implement admin original KYC preview
Complete · P1 for the documented implementation; privacy and device checks remain separate. Source: [October 24 work log](../../daily-work/24thoct.md).

## Ride, realtime and mobile acceptance

### Backend: durable ride notifications
In Progress · P0. Source: [audit current review](../../audit.md), [driver realtime plan](driver-realtime-websocket-fcm-plan.md).

### Driver: background and app-kill recovery
Not Started · P0 as an acceptance check. Source: [driver realtime plan](driver-realtime-websocket-fcm-plan.md), [driver release gate](driver-app-architecture-and-implementation-plan.md).

### Rider: relaunch recovery in each ride state
Not Started · P0 as an acceptance check. Source: [rider testing and MVP gate](rider-app-architecture-and-implementation-plan.md).

### Backend: reconcile API and OpenAPI routes
Not Started · P1. Source: [audit finding 18](../../audit.md), [API contracts](../LLD/api-contracts.md).

### Repair duplicate active pricing before index
Not Started · P0. Source: [audit current review](../../audit.md).

### Phone: full ride, QR, cash and UPI pass
Not Started · P0 as a real-device acceptance check. Test mode does not prove live UPI app handoff. Source: [rider testing plan](rider-app-architecture-and-implementation-plan.md), [UPI checkout guide](razorpay-upi-test-checkout.md).

### Phone: recharge and cashout recovery pass
Not Started · P0 as a real-device acceptance check. Source: [driver wallet money movement](driver-wallet-money-movement.md).

### Validate live UPI QR after merchant access
At Risk · P0 because live QR access and credentials are external prerequisites. Source: [UPI checkout guide](razorpay-upi-test-checkout.md).

## Release and experience

### Verify backup, restore and load gates
Not Started · P0. Source: [audit next sequence](../../audit.md), [build and deploy](build-and-deploy.md).

### Rider accessibility and low-end Android pass
Not Started · P1. Source: [rider testing and MVP gate](rider-app-architecture-and-implementation-plan.md).

### Driver accessibility and low-end Android pass
Not Started · P1. Source: [driver release gate](driver-app-architecture-and-implementation-plan.md).
