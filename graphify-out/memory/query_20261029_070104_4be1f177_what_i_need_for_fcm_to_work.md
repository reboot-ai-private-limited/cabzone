---
type: "query"
date: "2026-10-29T07:01:04.298645+00:00"
question: "what i need for fcm to work?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["ExpoPushService", "FCM Push Notification Fallback", "push-notifications.ts"]
---

# Q: what i need for fcm to work?

## Answer

Expanded from original query via vocab: [fcm, push, notification, notifications, notifier, ridenotifierport, token, tokens, device, expo, android, ios]. Cabzone uses Expo Push Service backed by Firebase Cloud Messaging (FCM v1) on Android. Requires: (1) Firebase project + Android apps com.cabzone.driver and com.cabzone.rider with google-services.json placed in apps/driver-mobile/ and apps/rider-mobile/ (or DRIVER_GOOGLE_SERVICES_JSON / RIDER_GOOGLE_SERVICES_JSON), (2) FCM HTTP v1 Service Account JSON uploaded to EAS credentials, (3) EAS project IDs (DRIVER_EAS_PROJECT_ID / RIDER_EAS_PROJECT_ID), (4) Android development/preview/prod build via EAS (not Expo Go) run on a physical device with EXPO_USE_PUSH=1, (5) optional EXPO_ACCESS_TOKEN on API, and (6) wiring registerForPushAsync + /api/v1/push-token + tap navigation in rider-mobile (driver-mobile and API are already wired).

## Outcome

- Signal: useful

## Source Nodes

- ExpoPushService
- FCM Push Notification Fallback
- push-notifications.ts