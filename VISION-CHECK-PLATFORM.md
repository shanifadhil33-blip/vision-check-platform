# VISION CHECK PLATFORM — Browser-Based Online Vision Check

Source of truth for the build. Read this before writing any code.

**Client's own name for it:** Browser-Based Online Vision Check. Repo folder: `vision-check-platform`.

**Current milestone:** Phase A — Technical Feasibility & Prototype. $1,400 fixed, 15 days from escrow funding. Funded and accepted.

**Version 2** — supersedes v1 on everything it covers. Updated after the client's clinical direction message of 1 September and after reading the published DigiVis validation literature.

## CHANGELOG v1 to v2

Decided by the client, no longer open:
- Test distance: 3 m preferred, 2 m supported alternative. Both first class.
- Acuity scale: logMAR underlying, 0.10 logMAR steps. Snellen shown to the user as a label only.
- Optotypes: Sloan set C D H K N O R S V Z.
- Rendering: controlled vector geometry, not browser font rendering. The client has explicitly decided against using his Optician Sans font as the measurement standard.
- Response: phone presents a small set of letter choices plus a not-sure option. Matching, not naming.
- Test structure: adaptive, not a fixed chart worked down line by line.
- Technical validity recorded separately from the acuity result.

Reversed or corrected since v1:
- Anti-aliasing. v1 treated grey-scale edge rendering as a risk. The published evidence says the opposite: filtered grey-scale optotypes are more resistant to pixellation than hard black and white, and the pixel-size limit is roughly twice as permissive with it. It is now a deliberate design choice, agreed with the client.
- Row format. v1 said build both formats in Phase A. The client has since said he does not want a conventional chart reproduced. Row format drops out of Phase A.
- The optotype font is no longer a blocker for any step.

De-scoped from Phase A by this update: row format, further patent research, confidence algorithms.

---

# PART 1 — WHAT THIS IS

## 1.1 The client and the product

A long-established UK online optical business, led by a qualified optometrist, wants a **proprietary browser-based online vision-checking platform**. They are building it themselves specifically to avoid the substantial per-test licensing costs of existing commercial online vision-testing platforms.

Stage 1 is a focused application for measuring a user's **corrected distance visual acuity**. The user performs the check wearing their normal glasses or contact lenses.

This is not a request for the developer to devise an eye test or make clinical decisions. The client provides clinical methodology, testing rules, optical calculations and the optotype font. The developer translates those requirements into a reliable, intuitive web application.

**Target user, narrowed by the client:** adults testing themselves at home on ordinary consumer hardware. Nobody to hold the occluder, nobody to confirm distance, nobody to rescue a failed setup. Every step must be recoverable by one person standing two metres from their own screen holding a phone.

## 1.2 Stage 1, as originally specified

The application broadly works as follows.

### Screen calibration
Different monitors and devices have different physical dimensions and pixel densities. The application must establish the relationship between pixels displayed and actual physical size on the user's screen. Initial methodology uses an object of known dimensions, such as a standard credit or debit card. The user adjusts an onscreen reference until it physically matches their card. The resulting calibration is used to render visual-acuity optotypes at clinically specified physical dimensions.

### Computer plus smartphone interaction
The test is performed at a specified distance from the main display. **3 m is the recommended distance, 2 m is the supported alternative where the user does not have 3 m of clear space.** Both are first-class, the distance is recorded with the result, and it feeds the confidence record rather than being a mere setup preference. Users must not repeatedly walk between the display and the computer controls.

- Main screen displays the visual targets.
- Smartphone acts as the user's remote control.

Journey: user starts on computer/tablet → QR code displayed → user scans with phone → phone joins the same test session → user moves to the required testing distance → main display presents visual targets → user responds using their phone → phone and main display remain synchronised throughout.

### Visual acuity testing
Optotypes displayed at precisely calculated sizes corresponding to different levels of visual acuity. Client supplies the optotype font. The system must be capable of:
- dynamically generating and randomising optotypes
- changing optotype size according to the clinical test algorithm
- testing right and left eyes independently
- accepting responses through the smartphone
- determining the acuity level reached according to rules supplied by the client
- detecting incomplete or invalid tests
- **storing the underlying test data rather than simply the final result**

### Results
At completion the application generates a simple result based on rules supplied by the optometrist. The eventual system may identify:
- expected corrected visual acuity
- reduced visual acuity in one eye
- reduced visual acuity in both eyes
- significant difference between eyes
- **test could not be completed reliably**

The application is not expected to diagnose ocular conditions. Results and test data are stored so they can form part of a user's clinical/customer record.

Note that "test could not be completed reliably" is already a first-class output in the client's own specification. This is where bounded results and unreliable-monitoring cases land.

## 1.3 User experience requirements

Explicitly called "extremely important" by the client. Ordinary consumers with widely differing technical ability.

Canonical journey:

**calibrate screen → connect phone → position yourself correctly → cover specified eye → perform test → change eye → receive result**

The client particularly welcomes developers who identify where users are likely to make mistakes and design safeguards accordingly.

## 1.4 Accuracy and calibration

Called one of the most important technical aspects. The client needs confidence that an optotype intended to have a particular physical size is actually displayed at that size after calibration, across a sensible range of monitors, laptops, resolutions, operating systems, browser zoom settings, device pixel ratios and browsers.

## 1.5 Intellectual property and constraints

Proprietary project. The client requires:
- ownership of the completed source code
- source code in a repository accessible to them throughout development
- documentation sufficient for another competent developer to continue
- no dependency on proprietary developer-owned components that would prevent them operating or modifying the system independently
- disclosure and agreement before using any paid third-party service that creates ongoing per-user or per-test costs

That last point is a hard constraint. The entire reason for building this is to escape per-test licensing.

## 1.6 Later stages (not in scope, but architecture must allow)

Longitudinal vision monitoring, more sophisticated vision measurements, contact-lens over-refraction, spectacle refraction, pupillary-distance measurement, smartphone-camera-based measurement and calibration, optometrist review interfaces, integration with customer and clinical systems.

The client wants sensible modular architecture that can be extended rather than rebuilt.

## 1.7 Integration

Developed and tested as a standalone web application. The client's existing website developer handles final integration into their e-commerce and customer infrastructure. Detailed knowledge of their existing platform is not needed, but API and data requirements for eventual integration should be considered in the design.

---

# PART 2 — THE HARD PROBLEMS AND AGREED APPROACHES

These positions were worked out across five rounds of written exchange with the client. Several were adopted by him into his own requirements. Do not casually reverse them.

## 2.1 CSS has no reliable relationship to physical size

The foundational constraint. Browsers assume 96 CSS pixels per inch regardless of the display attached, so `mm` and `cm` units in CSS are fiction. **Every physical dimension in this application derives from the card calibration and nothing else.**

Consequence worth naming: at 2 m a 6/6 optotype is roughly 2.9 mm tall with a stroke around 0.6 mm, landing near two physical pixels on a typical desktop display. At 3 m the same optotype is 4.4 mm with a 0.87 mm stroke, which is meaningfully easier to draw.

**Anti-aliasing, corrected from v1.** v1 framed the browser's edge softening as a risk. It does change the effective contrast of a thin stroke, but the published evidence runs the other way: grey-scale filtered optotypes, where pixel luminance is averaged across the pixel aperture, are *more* resistant to pixellation than unfiltered black and white. Carkeet's monitor-pixellation work recommends a maximum pixel size of 0.6 times the smallest MAR being measured for filtered optotypes, against 0.35 times for unfiltered. So anti-aliasing roughly doubles the permissible pixel pitch. It goes in deliberately. The client has agreed this explicitly.

Getting the size right remains necessary but not sufficient, which is why requested versus actual rendered dimensions are measured on every presentation.

## 2.2 Renderable acuity range

For a given calibrated screen at a given distance there is a hard floor and a hard ceiling.

Floor: below roughly two physical pixels of stroke width, the letter cannot be drawn faithfully. Ceiling: at the poor-vision end a large optotype plus its crowding surround can outgrow the screen.

**The system computes the measurable range for that specific screen at that specific distance before the test begins.** Not halfway through. Inputs: px per mm from calibration, device pixel ratio, screen dimensions in pixels, test distance.

**The floor now has a published formula rather than a rule of thumb:**

```
max_pixel_pitch_mm = 0.6 x MAR_arcmin x distance_mm x 0.00029089
```

where `MAR_arcmin` is the minimum angle of resolution at the finest acuity to be measured (1.0 arcmin at 6/6, 0.794 at 6/5). The 0.6 coefficient is Carkeet's filtered-optotype recommendation. Use 0.35 if anti-aliasing is ever disabled.

Worked numbers, 6/6:
- At 2 m the screen needs a pixel pitch of 0.35 mm or finer.
- At 3 m it needs 0.52 mm or finer.

| Display | Pitch | 6/6 at 2 m | 6/6 at 3 m |
|---|---|---|---|
| 24" 1080p | 0.277 mm | yes | yes |
| 27" 1080p | 0.311 mm | marginal, fails 6/5 | yes |
| 32" 1080p | 0.369 mm | no | yes |
| 1440p and above, any Retina | under 0.24 mm | yes | yes |

**Pixel pitch means physical pixels, not CSS pixels.** On a high-DPI display the canvas must be scaled by `devicePixelRatio` or half the available resolution is discarded and a screen that should pass will fail.

**Surface the range to the user at the point of choosing distance.** Because the range is known immediately after calibration, the app can tell that specific user whether 2 m is adequate for their screen or whether they genuinely need 3 m. This turns "3 m is recommended" into a reason rather than an instruction, removes friction for users whose screens do not need it, and makes the recorded distance choice far more informative: the interesting variable is not 2 m versus 3 m, it is whether the user was told they needed 3 m and chose 2 m anyway.

Where the screen cannot reach the required acuity, the useful lever is **distance, not rendering**. The same angular size needs a physically larger letter at a greater distance, and a larger letter has more pixels to work with. So if a screen cannot render finely enough for 6/6 at 2 m, it can at 3 m. If letters are too large to fit at the poor-vision end, move the patient closer.

Where that is not enough, the test returns a **bounded result**: "6/9 or better, finer acuity cannot be reliably measured on this display." The client has explicitly stated this is more clinically useful to him than an incorrectly reported 6/6.

**Never silently round an optotype to the nearest whole pixel and score it as though it were the requested size.** If sizes must snap to what the display can draw, shape the acuity steps around what the display can produce and score against what was actually rendered.

## 2.3 Crowding

A conventional acuity chart does not present isolated letters. The presence and spacing of neighbouring optotypes affects measured acuity. Isolated letters overestimate acuity, most severely in the patients you least want to miss, which matters because "significant difference between eyes" is one of the client's intended outputs.

**Crowding depends on spacing relative to the letter, not on absolute distance.** So spacing is never expressed in millimetres or pixels. It is expressed in units of the optotype itself, conventionally a gap of one letter width, and the renderer converts it once using the calibration. Change the letter size and the gap follows automatically, on any screen, at any distance.

**Format, updated.** The client has now ruled out reproducing a conventional chart. He wants a central target with controlled flankers, conceptually `N H V` with the middle letter as the target. His instruction: do not settle the exact crowding method yet, but do not design the system in a way that permanently assumes a single isolated letter.

**Row format is out of Phase A.** v1 said build both. He has since said he does not need rows. Format stays a declared property of the stimulus spec so a row can be added later without rework, but nothing is built for it now.

**Mark the target with an arrow, not by position.** DigiVis randomises the letter display and uses an arrow to indicate which letter is to be identified. That is better than relying on "it is the middle one", because it removes an instruction the user has to remember and it allows the flanker arrangement to change without confusing anyone.

## 2.4 Viewing distance

The client asked how to detect if the patient moves significantly closer or further **during** the test, and what can realistically be verified versus what cannot.

Key reframe: absolute distance measurement in a browser is unreliable, but **change detection is tractable**, because relative change needs no knowledge of camera optics.

The architecture already guarantees a camera in the room, because the phone is required for the test. Do not build this around the computer webcam, which many desktops lack or have badly positioned.

**The client has proposed a specific mechanism and it is now the primary approach.** His mockup: the screen displays a calibrated marker of known physical size, the phone camera detects the marker and its corners, marker size and perspective give distance and viewing angle, the app guides the user into a target zone, the position is locked as a baseline, and the marker is then monitored throughout the test. On drift the app either compensates by rescaling the optotype to hold the correct visual angle, or asks the user to reposition. On marker loss or low confidence the test pauses.

Three things about that mechanism that must be designed in rather than assumed:

**The phone is in the user's hand, because it is also the response device.** The mockup shows a tripod in the monitoring frame. Nobody has a tripod, and a phone on a tripod cannot be tapped from two metres away. The workable posture is the phone held at chest height, rear camera facing the screen, touchscreen facing the user. At 2 m a phone camera sees roughly 2.3 m of width, so the monitor stays in frame even with careless holding. Consequences: the measured distance is phone-to-screen, not eye-to-screen, and the vertical offset is worth correcting for using the marker's perspective; the marker should be sampled at the moment of response rather than continuously, which also saves battery and heat; and the user should be able to lower their arm between trials.

**Compensation is bounded by the renderable range, not by a fixed tolerance.** Rescaling the optotype when the user drifts closer makes it physically smaller, and physically smaller can fall below what that screen can draw. So the acceptable drift band is asymmetric: drifting away is nearly always safe, drifting closer is the direction that can silently break the measurement. Compute the band from the renderable range at that moment. This is section 2.2 applying somewhere the client did not expect it and it is worth telling him.

**Absolute distance still needs one assumption, monitoring needs none.** Once a baseline is locked, every later reading is a ratio of current marker size to baseline marker size. No camera optics involved, no error. Only the initial absolute anchor is approximate. Two routes to that anchor are set out under Layer 2 below.

Layered approach, to be investigated and reported on in Phase A:

**Layer 1 — phone motion sensors.** Distinguishes shifting weight from actually walking. That distinction is the whole question: leaning a few inches barely moves the result, taking two steps closer changes it completely. No camera, much smaller permission ask. Note iOS requires `DeviceMotionEvent.requestPermission()` triggered by a user gesture.

**Layer 2 — phone rear camera against an on-screen marker.** The display shows a marker whose physical size is known from calibration. Baseline its apparent size when the user confirms position, then track the ratio. For change detection lens properties cancel out entirely, so it works on any phone with no assumptions.

For the **absolute** baseline, two candidate routes, to be compared in Phase A:

- **Assumed field of view.** Distance follows from the marker's apparent size if the camera's focal length in pixels is known. Browsers do not expose it, but most phone main cameras sit in a 65 to 75 degree horizontal field of view. Assuming 70 degrees gives roughly ±8 percent distance error at the extremes of that range, which on the client's own arithmetic is around 0.03 logMAR. Cheap, single-position, no extra user step. Validate against a tape measure across every available device.
- **Two-position calibration.** The published DigiVis method: focus the phone camera on a graphic on the larger screen at 30 cm, using the length of an A4 sheet as the reference, then again at test distance. Solves for focal length exactly. Costs the user an extra step. See the IP note in 2.8 before choosing this route.

**Marker sizing.** The marker's physical size should be derived from the calibration and scaled to the chosen test distance, so it subtends a usable number of camera pixels at 3 m as well as 2 m. A 100 mm marker at 3 m on a 1080p phone camera is only about 50 pixels across, which is close to the detection floor. Compute the required size rather than fixing it.

**Free extra signal.** The camera is already running and pointed at a screen of known brightness content. Its exposure settings and frame luminance give a usable estimate of ambient room lighting and of whether screen brightness is unusually low. Neither is otherwise obtainable in a browser and both affect contrast and therefore acuity. Log both into the technical validity record.

**Layer 3 — computer webcam where present.** Passive continuous. Baseline interocular distance in pixels at confirmed position, then watch the ratio. Adult IPD ranges roughly 54 to 70 mm, which wrecks absolute estimates but is fixed for the person sitting there, so self-comparison removes it. Nothing leaves the machine.

**Layer 4 — catch trials.** Occasionally present an optotype well below the established threshold. A correct answer means either they moved closer or they are guessing unusually well, and both deserve a flag. Survives every camera permission being refused.

Honest limitations to report: change detection is exact, absolute distance rests on one assumption or one extra calibration step. A setup that starts half a metre off will be guarded perfectly at the wrong distance unless the absolute anchor works. Camera permission can be refused, and the test must still function when it is. Head rotation reads as moving away on the webcam path. Sampling only at response time can miss someone who leans in, answers, and leans back. On iOS, `getUserMedia` stops when the tab is backgrounded or the screen locks, so a wake lock is required and its loss must be logged as a session event.

Record distance events with timestamps **and the monitoring mode**, so a result taken with no camera never reads as equivalent to one with all layers running.

Thresholds are a clinical decision. The client sets them.

## 2.5 Test integrity and state

Three failure modes the client named: phone briefly loses connection, browser refreshes, computer sleeps and reconnects. Three requirements: resume without losing results, without duplicating answers, without phone and display falling out of sync.

All three are the same problem. Something disappears and comes back holding stale information.

**Neither browser owns the test. The server does. Both devices are views onto it.** Nothing important lives in browser memory, so when a browser vanishes nothing important vanishes with it.

- **Every presentation is written as a row before it is shown.** Trial id, acuity level, exact optotypes, eye under test, timestamp. Answers record against the trial id.
- **Idempotency kills duplicates.** Answer submission is keyed on trial id plus a client-generated request id. First write wins. Retries, double taps and messages replayed after reconnect all return the same result rather than creating a second answer.
- **Versioning kills desync.** Session state carries a version that increments on every transition. Clients send the version they are currently rendering. A phone that slept and woke holding version 12 while the server is on 15 gets its tap rejected and is told to resync. Stale views cannot act.
- **Transport.** Realtime channel plus heartbeat, plus a polling fallback for networks that block sockets. A dropped connection is normal, not an error state.
- **Visibility matters clinically.** A trial only counts if the stimulus was actually visible. The display confirms it rendered, and the Page Visibility API reports whether the tab was hidden or the machine slept. If the screen went dark mid-trial, that trial is void and re-presented at the same level **with different letters**, because otherwise the patient answers from memory. Take a Wake Lock, treated as best effort.
- **Eye state is server state**, so a resume never returns with the wrong eye uncovered.
- **Resume rules are clinical, not technical.** A five second blip resumes in place. A three minute gap should re-confirm distance and occlusion first. Past some point the test is incomplete rather than resumed. The client draws that line.

## 2.6 Engine versus test module

The client named the split himself: tests differ in their **stimuli** and their **decision rules**, and almost everything else they hold in common.

**Common test engine owns:**
- session lifecycle and device pairing
- sync, versioning, idempotency
- screen calibration and the physical-units service, so anything specified in millimetres is converted in exactly one place
- viewing conditions, including distance monitoring and eye state
- the trial ledger, generic enough that every test writes to the same tables
- response transport from phone to server, plus a small set of generic response primitives
- rendering from a declarative stimulus spec
- result envelope, audit trail, export

**An individual test module owns:**
- what to show, described in physical units rather than pixels
- what response format it needs
- decision rules: when to go harder, when to ease off, when to stop, what the result means
- what counts as an invalid trial for that test
- the display conditions it requires

**The contract between them is deliberately thin.** A module is a pure function over trial history. Hand it everything that has happened so far, it returns either the next stimulus spec or a signal that it is finished plus the result. It holds no state of its own and never touches the DOM. This makes each test checkable with no hardware, and lets old sessions be replayed through an updated version of a test later. For a clinical product, re-running last year's data through this year's rules is worth a great deal.

**Boundary risk to design for now:** colour vision and visual fields will need things acuity does not. Colour-managed rendering and display gamut for one, a fixation target and far more screen area for the other, possibly a different working distance. So **required display conditions must be a first-class declared thing from day one**, even though Stage 1 only exercises size and distance. Cheap now, expensive to retrofit once three tests exist.

## 2.7 Validation thinking (relevant to Phase C, informs data capture now)

The client posed a scenario: 50 people, technically stable, 20% differ from conventional measurement by a line or more, one week to investigate.

The reasoning that matters for Phase A is what it implies about data capture.

Conventional acuity measurement disagrees with itself. A one-line difference on repeat testing is ordinary. So the shape of the disagreement matters more than its size: scatter both ways around zero is noise, a lean is a bias with a findable cause.

Each suspect leaves a different fingerprint in stored data:
- **Calibration errors track with hardware.** Group by device, browser, resolution, pixel ratio, and against the calibration figure set. Algorithm noise does not care what laptop was used.
- **Distance errors track with the monitoring logs.** Note that a distance error and a calibration error are mathematically the same error, since both change angular size. They cannot be separated from the result, only from the logs.
- **Timings and interruptions** are underused signals. Fast answers at threshold usually mean guessing. A run with disconnections is a disagreement candidate before anything optical is examined.

This is why the raw record must be complete enough to replay sessions under different scoring rules without re-running anything.

## 2.8 DigiVis — benchmark, not blueprint

The client originally called it "DigiVision." The correct name is **DigiVis**, from Louise Allen's work at Addenbrooke's, commercialised through Cambridge Enterprise. It is a web application where two devices are paired, letters are shown on a distant screen and matched on a handheld device, calibrated with household items including a standard-sized card, with threshold determined by a staircase algorithm.

**The client researched the Cambridge patent himself** and has cleared it. He went through the PCT application, claims, drawings, International Search Report and EPO Written Opinion. His findings: the application contained two separate inventions, the two-device testing system and a physical glyph worn by the patient allowing a camera to calculate distance. The broader remote-testing claims ran into substantial prior art, with the EPO finding several claims lacked novelty over earlier Sony work and others lacked inventive step. His conclusion is that nothing there should dictate how this system is developed.

**Standing instruction from the client:** approach the problems independently and from first principles. DigiVis is useful as a clinically researched benchmark, particularly its published validation work, but must not become the technical blueprint. If the investigation leads somewhere quite different, that is fine and potentially preferable.

Useful to know: their response task is **matching, not naming**, which is a validated precedent for the forced-choice question. Most of their published validation is in children, median age around six, so adult evidence is thinner. That is a genuine gap rather than a settled question.

**Published mechanism, from the validation papers.** Worth knowing precisely, because it is the benchmark the client is measuring us against:
- Calibration by dragging virtual callipers to match a credit or store card held against the screen. Same as ours.
- Distance either by tape measure or by the two-position camera method described in 2.4. Optotype size is compensated across a 1.5 m to 2.5 m range, and the test refuses to start outside it.
- Sloan optotypes with crowding scaled to the letter size, randomised, with an arrow indicating the target.
- Response by selecting from five optotypes on the handheld device, four of them randomised, or a **Not Sure** option.
- Threshold by a modified Garcia-Perez staircase with three reversal points. Garcia-Perez 1998, "Forced-choice staircases with fixed step sizes".
- Test duration 30 seconds to 2 minutes depending on response consistency.

**Published performance, which is the bar for Phase C:**

| Comparison | Limits of agreement | ICC |
|---|---|---|
| DigiVis vs clinical assessment | ±0.174 logMAR, bias −0.001 | 0.818 |
| DigiVis test vs retest | ±0.123 logMAR | 0.922 |
| Conventional chart vs itself, real clinic | ±0.15 logMAR | — |
| Theoretical best, controlled conditions | ±0.14 logMAR | — |
| Peek Acuity vs clinical | ±0.444 logMAR | — |

The useful conclusion: a home test landing within roughly ±0.17 logMAR of a clinic is at the state of the art, and a conventional chart used by a trained observer only agrees with itself to about ±0.15. Perfection is not the target and never was.

**IP note, narrowed.** The client's own review of the PCT application found two inventions: the two-device testing system, and a physical glyph worn by the patient allowing a camera to calculate distance. We use no worn glyph, so that claim does not touch our approach. The published papers separately state that an international application was made for the DigiVis distance calibration system, and the implemented mechanism is the two-position camera method rather than a worn glyph. Whether those are the same family is not established here. The practical consequence is narrow: **the assumed-field-of-view route in 2.4 avoids the question entirely and should be tried first.** If the two-position route turns out to be necessary, raise it with the client before building it, since he has already read the claims and can settle it in one reply.

**No further patent research is needed in Phase A.**

## 2.9 Adaptive testing, not a chart worked down

The client's instruction: the test should be adaptive rather than stepping down a fixed chart. Correct responses make the target smaller, incorrect responses make it larger, with repeated trials around threshold until there is enough information to compute the acuity.

He has explicitly said the exact staircase rules, number of presentations and final scoring algorithm are **not needed before building calibration and the basic test framework**, and that they will be refined once a first working version exists. What he wants now is architecture that supports it rather than a line-by-line test that has to be torn out.

Section 2.6 already provides this. A test module is a pure function over trial history returning the next stimulus or a finish signal. An adaptive staircase is exactly that shape. The requirement is that nothing outside the module assumes a monotonic descent through a fixed list.

Published starting point when it is time: the modified Garcia-Perez fixed-step staircase with three reversals, as used by DigiVis. Do not invent one.

**Handling "not sure".** The response set includes a not-sure option, which the client's chosen precedent also has. It is a usability necessity, because a user with no such button either guesses or gets stuck. It does have a psychometric cost: a forced-choice test assumes a fixed and known guess rate, and an opt-out makes the effective guess rate person-dependent. The resolution is to **treat not-sure as an incorrect response for staircase purposes so the target grows and the user is never trapped, but store it as its own response category rather than collapsing it into "wrong".** Then the rate at which a given person uses it becomes an input to response consistency instead of a hidden distortion.

## 2.10 Technical validity, recorded separately from the result

A new requirement from the client and it touches the whole data model, so it is designed in now rather than bolted on.

The acuity result and the reliability of the test that produced it are two different things and must never be collapsed into one number. His list of what to retain:

- calibration quality
- test distance, requested and actually observed
- screen and pixel limitation for that setup
- response consistency
- retries and reversals
- final logMAR and its Snellen label

His worked example, which is the whole principle: a 2 m setup capable of resolving 6/6 can return a high-confidence 6/6. A screen that can only reliably resolve 6/7.5 must **not** report 6/7.5 as the person's vision, because they may be 6/6. That is recorded as a limitation of the test setup, not as reduced vision.

This is the bounded-result principle from 2.2, now applied to the reported output rather than only to the rendering. It is also already present in the client's original specification, where "test could not be completed reliably" is a first-class result.

Add to his list, since the data is available at no extra cost: monitoring mode actually running, ambient light estimate, interruption and reposition events, and whether the user was advised to use 3 m and chose 2 m.

---

# PART 3 — PHASE STRUCTURE

- **Phase A** — Technical design / proof of concept. Demonstrate reliable calibration, accurate optotype rendering, and communication between main display and smartphone. **CURRENT MILESTONE. $1,400, 15 days, funded.**
- **Phase B** — Functional Stage 1 application. Build the complete visual-acuity workflow. Quoted $2,800 / 4 weeks.
- **Phase C** — Testing. Cross-browser and device testing, clinical validation against conventional visual-acuity measurement. Quoted $1,400 / 2.5 weeks, the variable in the estimate.
- **Phase D** — Production / integration. Prepare the tested standalone application for integration into the existing website and customer systems. Quoted $900 / 1.5 weeks.

Stage 1 total quoted $6,500, realistic range $6,500 to $8,000.

---

# PART 4 — PHASE A SCOPE (CURRENT MILESTONE)

## 4.1 Purpose, in the client's words

Not to build a polished visual acuity test. To establish whether the difficult foundations can be made sufficiently reliable, understand their real-world limitations, and avoid building Stage 1 around assumptions that later prove wrong.

## 4.2 The six areas the client wants investigated

1. Physical screen calibration and the accuracy actually achievable across different displays.
2. The range of visual acuity a particular calibrated screen can genuinely render.
3. Establishing and maintaining viewing distance, including what can realistically be verified and what cannot.
4. A basic visual-acuity stimulus, including the practical implications of crowding.
5. Basic phone/display pairing and response capture.
6. Capturing sufficient raw information for later analysis.

## 4.3 Agreed deliverables

**Something working**, deployed so the client can open it on his own machines without running anything locally. Source in a repository he has access to throughout.

**A written summary**: what was tested, what was actually measured, what worked, what did not, the limitations discovered, and what to carry forward into Stage 1.

## 4.4 Explicitly out of scope for Phase A

- clinical scoring or pass/fail rules
- per-eye workflow
- result output
- user accounts
- integration with any existing system
- visual polish beyond what is needed to use it
- confidence algorithms (raw data retained, no algorithm built)
- further DigiVis or patent research
- row / conventional chart format (client no longer wants it; spec must remain able to express it)
- final staircase rules, number of presentations, scoring algorithm (client has explicitly deferred these and said not to wait)

## 4.5 The client's own commitment

He will test the calibration link across a range of desktops, laptops, monitors and phones and report back. **Get that link to him early.** He is keen, and his device coverage is far better than what is available locally.

---

# PART 5 — TECHNICAL PLAN

## 5.1 Stack

- **Next.js (App Router) + TypeScript** — matches the client's stated preference for React/Next.js and TypeScript.
- **Supabase** — Postgres for the record, Realtime for device sync, replacing raw WebSockets. Satisfies "suitable database/API backend" and "WebSockets or equivalent."
- **Tailwind** for UI.
- **Vercel** for deployment.
- **SVG or Canvas** for optotype rendering.

Check before committing: Supabase and Vercel free or low tiers must not create per-user or per-test costs. The client requires disclosure and agreement before any paid third-party service with ongoing per-test cost. Flag anything that could become one.

## 5.2 Application shape

One web application, two routes.

- `/display` — runs on the laptop, monitor or tablet. Shows calibration, QR code, and the visual targets.
- `/remote` — runs on the phone. Joined by scanning the QR, which is just a URL carrying a session id. No install, no native app.

No native iOS or Android app is required. Both interfaces run in modern browsers.

## 5.3 Calibration

Reference object: ISO/IEC 7810 ID-1 card, **85.60 mm × 53.98 mm**. Standard credit and debit cards.

User drags to resize an onscreen rectangle until it matches the physical card held against the screen. Store the resulting **px per mm**.

Store alongside it, because calibration is only valid for the conditions it was made under:
- `devicePixelRatio`
- viewport dimensions
- `screen.width` / `screen.height`
- user agent
- timestamp

**Browser zoom invalidates calibration.** On desktop, `devicePixelRatio` changes with browser zoom. Compare the stored DPR against the current one on every session and invalidate if it has moved.

**Verification is physical, not mathematical.** The app draws a shape it claims is a known size, a ruler goes against the screen, and the actual measurement is recorded. The gap between claimed and measured is the finding. Do this on every screen and every scaling and zoom setting reachable.

## 5.4 Acuity mathematics

logMAR 0.0 (6/6) is defined as a letter subtending 5 arcminutes with a stroke width of 1 arcminute.

```
stroke_mm  = distance_mm × tan(1 arcmin) ≈ distance_mm × 0.00029089
letter_mm  = stroke_mm × 5
```

At 2000 mm: stroke ≈ 0.582 mm, letter ≈ 2.91 mm.
At 3000 mm: stroke ≈ 0.873 mm, letter ≈ 4.36 mm.

**The ladder is decided.** logMAR is the underlying measurement, in **0.10 logMAR steps**. Snellen equivalents (6/12, 6/9.5, 6/7.5, 6/6) are shown to the user as a familiar label only and are never the stored value. The client chose this partly because it makes changing test distance mathematically clean.

Each 0.1 logMAR step scales size by 10^0.1 ≈ 1.2589.

```
size_at_logMAR(L) = size_at_0 × 10^L
```

Converting to pixels:

```
stroke_css_px      = stroke_mm × px_per_mm
stroke_physical_px = stroke_css_px × devicePixelRatio
```

**Renderable floor:** use the Carkeet limit from 2.2, `max_pixel_pitch_mm = 0.6 x MAR_arcmin x distance_mm x 0.00029089`, with anti-aliasing on. The older "roughly 2 physical pixels of stroke" heuristic is superseded but should still be checked empirically, because the two should agree and a disagreement is a finding.

**Renderable ceiling:** the letter plus its crowding surround must fit the viewport. Note this binds harder at 3 m than at 2 m, since a 6/60 optotype is about 43.6 mm tall at 3 m before flankers.

The calculator is a pure function in `/lib/acuity`. Inputs: px per mm, device pixel ratio, screen dimensions, distance, finest and coarsest acuity of interest. Outputs: renderable logMAR range, and a flag for whether the requested finest acuity is reachable at each supported distance. It drives three things: the distance recommendation, the compensation band, and the bounded result.

## 5.5 Optotype rendering

**Decided by the client. Vector geometry, not font rendering.** He has Optician Sans and has explicitly said the browser font should not be the measurement standard, because font rasterisation, hinting and OS-level smoothing distort stroke weight at these sizes in ways nobody controls or can measure. Optotypes are drawn as controlled vector paths following Sloan geometry.

**Optotype set:** Sloan, `C D H K N O R S V Z`. Ten letters, equal difficulty by construction, 5x5 unit grid with a 1-unit stroke.

Consequence worth stating: **the client's font is no longer a blocker for any step.** Sloan geometry is a published specification. If a font arrives later it is a cross-check, not a dependency.

Anti-aliasing stays on, per 2.1. Render to a canvas scaled by `devicePixelRatio` so the full physical resolution is used.

**Measuring what was actually rendered** is a Phase A requirement, not an optional extra. Approach: render to an offscreen canvas, read back the pixel data, find the bounding box of the ink and measure actual stroke thickness. Record requested versus actual for every presentation.

## 5.6 Crowding geometry

Spacing expressed in units of the optotype, never in mm or px.

- **Flanked triplet, the client's stated direction.** A central target with a letter either side, conceptually `N H V`, spacing expressed as a multiple of letter width. An arrow marks the target.
- Flanking bars forming a box around the target remain a valid alternative the spec should be able to express.
- Row format is **not built in Phase A**. The stimulus spec must be able to describe it so it can be added later without rework.

Exact spacing multiples come from the client, but he has said not to settle them yet. Default to the ETDRS convention of one letter width until told otherwise and record the value used with every presentation.

## 5.7 Pairing and sync

1. `/display` creates a session, receives a session id.
2. Display renders a QR encoding `https://<host>/remote?session=<id>`.
3. Phone opens the URL and joins the session.
4. Both subscribe to a Supabase Realtime channel keyed on session id.
5. Server state is the source of truth. Both clients render from it.

Test reconnection deliberately: kill the phone connection, refresh the display, background the tab, sleep the machine. Each must recover cleanly.

## 5.8 Data model sketch

```
sessions
  id, created_at, status, version, current_state (jsonb)

calibrations
  id, session_id, px_per_mm, device_pixel_ratio,
  viewport_w, viewport_h, screen_w, screen_h,
  user_agent, method, created_at

presentations
  id, session_id, trial_index, eye,
  requested_logmar, requested_letter_mm, requested_stroke_mm,
  requested_px, actual_rendered_px,
  optotypes, target_index, format, crowding_spec,
  distance_mm_requested, distance_mm_observed,
  rendered_at, visibility_confirmed

responses
  id, presentation_id, session_id,
  client_request_id, response, response_kind, responded_at, latency_ms
  UNIQUE (presentation_id, client_request_id)
  -- response_kind: 'letter' | 'not_sure'
  -- not_sure counts as incorrect for the staircase, stored distinctly

distance_events
  id, session_id, method, raw_value, baseline_ratio,
  absolute_mm, confidence, flagged, created_at

test_quality
  id, session_id, eye,
  calibration_quality, distance_requested_mm,
  distance_observed_min_mm, distance_observed_max_mm,
  distance_confidence, monitoring_modes_active,
  renderable_logmar_min, renderable_logmar_max,
  screen_limited (bool), bounded_result_reason,
  response_consistency, not_sure_count,
  reversals, retries, interruptions,
  ambient_light_estimate,
  distance_recommended_mm, distance_chosen_mm,
  final_logmar, final_snellen_label

session_events
  id, session_id, type, payload (jsonb), created_at
  -- interruptions, visibility changes, reconnects, wake lock loss
```

The unique constraint on `(presentation_id, client_request_id)` is what makes answer submission idempotent. The `version` column on sessions is what rejects stale clients.

`test_quality` is the client's point 8 made concrete. It is deliberately separate from the acuity result so that "what the vision is" and "how much this particular test can be trusted" can never be collapsed into one field. Nothing is derived into it that cannot also be recomputed from the raw ledger.

Design the trial ledger generically enough that a future colour-vision or visual-field module writes to the same tables.

## 5.9 Distance investigation

Time-boxed. This is the part that can consume unlimited time, and a documented failure is a valid Phase A result. The client asked specifically what can and cannot be verified.

Reordered from v1, because the client has now proposed a specific mechanism and the highest-information experiment should run first.

1. **Marker detection at test distance.** Render a marker of known physical size, detect it from the phone camera at 2 m and 3 m, on the phone actually held in the hand. Measure how small the marker can get before detection fails, and derive the required marker size per distance. If this fails the whole primary approach fails and the remaining work reshapes, so it goes first.
2. **Absolute anchor by assumed field of view.** Compare against a tape measure across every device available. Record the error distribution. This is the single number that decides whether the two-position calibration is needed at all.
3. **Baseline plus ratio monitoring.** Lock a baseline, walk in and out, confirm the ratio tracks. Expected to be near-exact; a falsifiable prediction worth stating before running it.
4. **Catch trials.** No camera needed, survives every permission refusal.
5. **Phone motion sensors.** Cheapest, no camera, useful as corroboration rather than as a primary.

Laptop webcam and interocular ratio drops to optional. It was v1's fallback for a world where the phone camera could not be used, and the client's direction has made the phone camera primary.

Report honestly on each: what worked, how noisy, what the failure modes were, and which are limits of the browser as a platform rather than limits of this implementation. That distinction matters to the client and should be made explicitly in the write-up.

---

# PART 6 — BUILD ORDER

Roughly 50 hours total across 15 days at 3 to 4 hours a day. Order matters more than usual.

**Days 1–3 — Foundation and calibration**
Project setup, Supabase schema, deploy pipeline. Calibration UI with card-matching. Store calibration plus device context. Deploy. **Send the link to the client.** He starts gathering device data while the rest is built.

**Days 4–6 — Rendering and renderable range**
Sloan optotypes as vector geometry. Requested versus actual measurement via canvas readback. Renderable range calculator per screen and distance, using the Carkeet limit. Distance recommendation surfaced to the user from that calculation. Ruler verification across every reachable screen, zoom and scaling combination.

**Days 7–9 — Stimulus and crowding**
Flanked triplet with spacing in optotype units and an arrow marking the target. Verify spacing holds as size changes. No row format.

**Days 10–12 — Pairing and state**
QR pairing, Realtime channel, server-authoritative session state, versioning, idempotent response capture, visibility confirmation. Phone response UI with five letter choices plus not-sure. Test reconnection scenarios deliberately.

**Days 13–14 — Distance investigation**
Work the reordered list in 5.9, marker detection first. Record what holds up.

**Day 15 — Write-up**
The summary document. What was tested, what was measured, what worked, what did not, limitations, recommendations for Stage 1.

If time runs short, the distance investigation is where it gives, because a documented partial result is acceptable there and nowhere else.

---

# PART 7 — CONSTRAINTS AND OPEN ITEMS

## Constraints
- ~3 to 4 hours a day, alongside a day job and a second contract with the same client.
- Local hardware: one laptop, one phone, one external monitor. Laptop webcam may be faulty. Client is providing broader device coverage for calibration.
- No paid third-party service creating per-user or per-test costs without prior disclosure and agreement.
- Client works entirely in writing. No calls.

## Needed from the client

Now closed:
- ~~The optotype font~~ — not needed, vector Sloan geometry decided.
- ~~The acuity ladder and step values~~ — logMAR, 0.10 steps, decided.
- ~~Crowding spacing multiples~~ — he has said not to settle these yet; default to ETDRS one letter width and record what was used.

Still open, and neither is blocking yet:
- Distance tolerance thresholds and the compensation band, once Phase A shows what is measurable. Present this with the renderable-range interaction from 2.4, since the band cannot be a fixed percentage.
- Whether the two-position distance calibration is cleared, **only if** the assumed-field-of-view route fails in Phase A. Do not raise it before then.

Ask for these as they become blocking, not all at once up front. Reply turnaround with this client has been same-day.

## Superseded background

The client has shared a document titled "Online Vision Check Methodology". It is **historical, not a specification.** It is an earlier developer's written understanding with the client's short answers added in brackets, and it predates everything in Part 2. It uses imperial units and 20/x notation, proposes a yes/no "can you read this" response rather than forced choice, and includes an astigmatism test which the client's own annotation says is not required at this stage. Do not build from it.

One line in it is worth keeping, because it is the clearest statement of the product's purpose anywhere in the record: the point is to establish whether the customer's vision is 6/6 or not, and how far under that standard it is. This is a screening and triage tool for a contact lens business, testing whether the customer's current correction is still doing its job. It is not a diagnostic instrument.

## Standing principles
- Report what the system actually knows, never what it hopes. Bounded results over confident wrong ones.
- Store the underlying data, not just the outcome. The client has said this twice, independently.
- A test that is sometimes wrong and knows it is usable. A test that is sometimes wrong with no warning is not.
