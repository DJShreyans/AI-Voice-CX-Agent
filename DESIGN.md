---
name: Aura Care Workspace
colors:
  primary: "#234c3c"
  background: "#f7f7f2"
  surface: "#fffefa"
  studio: "#edf0e5"
  text: "#243f35"
  muted: "#67716a"
  border: "#dfe3d9"
typography:
  display:
    fontFamily: "Georgia, serif"
    fontSize: "34px"
    fontWeight: 400
  body:
    fontFamily: "Geist, sans-serif"
    fontSize: "13px"
rounded:
  panel: "10px"
  button: "7px"
spacing:
  panel: "22px"
  column: "26px"
---
## Overview
A calm botanical workspace for Aura Skincare's Aria voice support demo. Operate mode: prioritize starting a call, reading the conversation, and referencing sample orders.
## Colors
Ivory canvas, forest green actions, pale sage call area. Status colors communicate order and call states. Errors use terracotta tones.
## Typography
Geist for controls and data; Georgia for conversational headings and the brand wordmark. Small text is for supporting details, never the primary action.
## Layout
Maximum width 1280px. Main conversation column plus 350px order reference. At 760px and below, stack call, transcript, summary, and orders. Keep all order information available.
## Elevation & Depth
Thin borders define surfaces. Subtle offset shadows only on the call button and voice visualization.
## Shapes
10px panel corners; 7px buttons. Circular rings exclusively represent the voice assistant.
## Components
Call control retains connecting, active, ended, and error states. Transcript scrolls within a bounded area. Summary supports copying JSON. Sample order rows retain delivery and policy details. Keyboard focus is visible. Motion respects reduced-motion preferences.
## Do's and Don'ts
Use generous separation between tasks and compact spacing within order details. Preserve actual order data. Do not add simulated performance statistics or unconnected navigation.
