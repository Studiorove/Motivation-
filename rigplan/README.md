# Rig Plan

Plan livestream shows: venue layout, kit, cable runs, power and crew. It's all in one diagram, and the paperwork is generated from it.

Static files, no build, no backend. Plans are saved in the browser's `localStorage`. Use **Projects → Export** to share a plan with the team.

## Run it

```
python3 -m http.server 8000
```

Then open `http://localhost:8000/rigplan/`. On GitHub Pages it's served at `/rigplan/`.

## What it does

- **Venue:** draw the room, stage, seating, risers, tables, doors, pillars and zones. You can trace over a floor-plan image scaled to real metres.
- **Kit:** a catalog of cameras, vision mixers, audio, graphics, streaming/network gear, displays, converters, comms and power. Each item has real ports (SDI, HDMI, XLR, 3.5mm, Ethernet, USB, intercom, mains) and a power draw.
- **Cables:** click a device, pick a port, click the floor to add bends, then click the destination. Only compatible ports can be picked. HDMI→SDI tells you to add a converter, and XLR→3.5mm becomes an adapter cable. Lengths come from the drawn route plus slack plus rise/drop allowances, then round up to stock lengths. Runs past practical limits get flagged (HDMI over 10–15m, USB over 5m, SDI over 100m, and so on).
- **Power:** wall sockets, strips, reels, distros and UPSs. Load is tracked per strip, per plug and per circuit (UK/EU/US/AU mains). You get warnings for overloads, anything not plugged in, daisy-chained strips and PoE devices without a PoE switch.
- **Cameras:** sensor + zoom range → horizontal FOV cone on the plan. Frame width at the subject distance, widest→tightest from that position, and one-click Close-up/Mid/Full framing that tells you when the lens can't get there.
- **Crew:** people and roles, assigned to positions. Flags unstaffed positions and people double-booked.
- **Reports:** checks, cable schedule, pull sheet (with spares), power, camera shots, kit list, crew sheet. Tables export as CSV, and **Print / PDF** gives one document with the diagram.

Equipment specs are approximate planning figures. Check the real kit before the show.
