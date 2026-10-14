# Cabzone Driver visual system

The driver app is an operating tool used outdoors, often between trips. Make availability, the next action, and transaction state easy to read at a glance. Keep one calm light theme across entry, verification, and duty screens.

## Color decisions

Use `src/design-system/colors.ts` as the source of truth. The brand anchor is deep brown `#3A2414`, the primary action is solid amber `#FBBF24`, and the app canvas, cards, and inputs are plain white. Use cream `#FFF9F0`, light cream `#FFF6E5`, and warm beige `#FFE7C7` sparingly for quiet surfaces and borders. Supporting illustration colors are `#FFD59A`, `#FB923C`, and `#B45309`.

Primary actions use solid amber with deep-brown text and compact corners. Secondary actions use a pale warm surface with brown text; destructive actions remain red. Green means confirmed success or online, amber means attention or pending, and red means an error or destructive action. Status badges always include a text label. A selected or uploaded file is not approval; keep those states distinct.

## Typography and layout

Use the platform system face: Roboto on Android and the system sans face on iOS. Use the `typography` scale for screen titles (28), section titles (22), body (16), labels (14), and supporting copy (13). Normal body text is weight 400–500, labels and actions 600, headings 700–800. Allow text to scale and wrap. Keep small labels readable at larger accessibility settings.

Use 20-point screen gutters, 8-point spacing increments, 12–16-point card corners, and 8-point primary button corners. Use borders for ordinary cards and reserve a soft shadow for elevated sheets. Account for top and bottom system insets on every screen, and keep the focused input and its error above the keyboard.

## Components and states

- `CabzonButton` is the shared action control: solid amber primary, pale warm secondary, red danger, or transparent ghost. Existing `CandyButton` callers follow the same palette. Both own minimum height, disabled/loading behavior, and accessibility state.
- Form fields have an explicit visible label, helper or error message, and a clear focused/invalid border. Choice chips expose selected state to assistive technology.
- Use the existing Ionicons family for controls and status marks. Decorative artwork belongs on entry screens; emoji must not substitute for a status icon or essential control.
- The driver home gives the most space to online/offline status and its primary action. Earnings, rides, and wallet use readable secondary cards. Raw coordinates and transmission timestamps belong in development diagnostics.

## Screen guidance

Entry and authentication may retain their illustration, but controls and text follow the shared palette and type scale. The six KYC screens share one header, progress treatment, field style, and safe-area behavior. Review uses the same surfaces and buttons; document statuses must match backend state. Pending and submitted screens use amber pending language until approval. The duty home and ride offer use the same controls and status vocabulary.

## Verification

Check a narrow Android phone, the primary Android test device, and an iPhone. Verify 200% font scaling, keyboard-open forms, gesture and three-button navigation, TalkBack/VoiceOver labels, disabled/loading/errors, and outdoor legibility. Check text contrast: body text targets at least 4.5:1 and large text at least 3:1. Confirm visually before treating a screen as finished.
