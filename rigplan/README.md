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
- **Plan view:** line-icon devices (camera, vision mixer, audio desk, computer, display, projector, power, generic) tinted by category. Cable colours: SDI red, HDMI orange, XLR yellow, Ethernet blue, power bold neutral (black on paper). Cables have three views: **Focus** (dimmed until you select a device or cable), **All**, and **Bundled** (shared runs merged into one line per group with a ×count). Video/audio/data/power toggles sit in the on-plan legend, and the **Cables** tab lists every run with its status; hover it to highlight the run, click to select it.
- **Power:** wall sockets, strips, reels, distros and UPSs. Load is tracked per strip, per plug and per circuit (UK/EU/US/AU mains). You get warnings for overloads, anything not plugged in, daisy-chained strips and PoE devices without a PoE switch.
- **Cameras:** sensor + zoom range → horizontal FOV cone on the plan. Frame width at the subject distance, widest→tightest from that position, and one-click Close-up/Mid/Full framing that tells you when the lens can't get there.
- **Crew:** people and roles, assigned to positions. Flags unstaffed positions and people double-booked.
- **Stream & network:** set outputs per encoder (YouTube 1080p30, LinkedIn 720p30…) and the venue's measured upload. It checks upload needed vs available with 1.5× headroom, splits upload across bonded links, and tracks traffic on every switch/router port (streams + NDI, against gigabit) plus PoE budgets per switch.
- **Signal flow:** vision mixer input lists, audio desk input lists (with 48V phantom), and a chain for every camera, graphics machine and mic showing its route to the stream. It warns when a source never reaches anything that streams.
- **Costing:** a company rate card (kit £/day, cables £/day, crew £/hour by role, VAT, reduced extra-day rate) plus a quote per plan: hire days, crew hours, per-person overrides, extra costs and discount. **Lock prices** freezes the rates on an old quote.
- **Branded PDF:** company name, logo, colour, contact line and terms. **Client proposal** (diagram, equipment, crew roles, costs itemised / section totals / total only) or **Production pack** (everything, no prices). Sections can be toggled.
- **Reports:** checks, costing, signal flow, stream & network, cable schedule, pull sheet (with spares), power, camera shots, kit list, crew sheet (with call times). Tables export as CSV.

Company settings (rate card and branding) are shared by every plan in the browser. Export them from **Company & rates** to give the team the same set.

Equipment specs and default rates are approximate placeholders. Check the real kit before the show.
