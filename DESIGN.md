# Debrief design notes

## The player’s job

The central conflict is between doing the assigned job and understanding what the job is protecting. The player can be good at containing the crop while helping conceal its cause.

The current loop is **orders → watch → investigation → debrief**. It repeats three times, with new orders, sightings, evidence, and dialogue. The final debrief resolves into a short ending shaped by evidence and previous testimony.

## What comes from the story

The watchtower, escaping corn, a woman in a white dress, the northeast corner, pesticide and fungus interaction, recurring recovery teams, human features in the crop, and the officer’s repeated insistence on doing the job come from the supplied manuscript. The game retains the redacted dates and Illinois setting.

The middle shift, application records, pump house, drainage network, exposure meter, departmental identity, and alternate outcomes are additions for this adaptation. The first and last debrief dates align with the manuscript; the additional October 15 interview bridges the playable shifts. Gameplay consequences are fictional, not claims about real pesticide toxicology.

## Shooting and procedure

The watchtower is a simple shooting gallery, with six rounds per magazine and limited reserve ammunition. Corn crosses the view toward the perimeter. Human figures are visually distinct and must be left alone. Keyboard target selection provides an alternative to precise pointer aiming.

Leaving early is possible. Any mobile crop already loose escapes when the post is abandoned. Waiting for relief avoids that particular cost, but the player must survive the watch. All threats, timing, choices, and endings work locally; this version has no generative AI calls or multiplayer.

## Investigation

Field investigation is turn based. Three landmarks provide evidence; all three must be inspected before returning for debrief. Walking adds exposure, and it only partially clears between shifts. Revisiting a familiar route is deliberate: the northeast corner gives different evidence each time, and ordinary infrastructure becomes increasingly difficult to explain.

The current map has no obstacles or tactical pathfinding. Waiting for relief enters this map automatically; leaving at the sighting starts it early. The detours still cost exposure. It is not yet a full exploration system.

## Debrief and consequences

Each debrief contains three questions. Answers depend on whether the player left the tower and what they found. A truthful answer can oppose the approved vocabulary; compliance can redact an observation. Earlier testimony affects whether a compliant final report earns routine reassignment or removal from duty.

The evidence-release option depends on existing discoveries and decisions. Only the final debrief shows cumulative requirements, with green checks and red crosses: three treatment/drainage exhibits, two field recordings, and two challenges to routine reports. Signing is acceptance of the routine account, not a separate testimony-preservation mechanic. There is no private plan, live path counter, preparation action, or early explanation of how to reach this ending. The two recordings are deliberate, exposure-costing encounter choices; all their opportunities occur predictably. Old preparation saves drop the retired state and refund its exposure cost once for ongoing assignments. Six outcomes cover evidence release, leading another team, compliance, dissent, containment failure, and excessive exposure. The story’s original ending is echoed rather than reproduced as a fixed conclusion.

## Ecological horror

Keep the pesticide warning indirect. Show repeated applications, an unexpected response below the roots, and infrastructure carrying consequences beyond a fence. No speech explaining the moral is necessary. The crop should feel like an organism changing in response to conditions, with the possibility that humans have misunderstood both the cause and the scale.

The field is not a conventional enemy army. Its most disturbing behavior is coordinated growth: rows moving together, anatomy appearing in unfamiliar places, and a boundary that only exists on departmental maps.

## What to test with a human player next

1. Does the 55-second watch create tension without becoming repetitive? Are targets legible on a phone?
2. Does leaving the tower feel like a meaningful choice, or does waiting for relief always seem obvious?
3. Are the debrief answers too explicit about their consequences? The current descriptions favor clarity for a first playtest.
4. Does the environmental evidence feel subtle enough? Consider making the administrative concealment less overt if the implication lands too directly.
5. Does map exploration deserve a richer view, sound cues, blocked rows, or a first-person treatment?

## Possible next iteration

The strongest next addition would be a small desk phase: compare an application log, an officer’s notes, and the official report; then physically stamp, redact, or retain evidence. That would deepen the *Papers, Please* influence beyond dialogue buttons. Other useful experiments include a spotlight that reveals anatomy, crop behavior that reacts to the player’s routine, and radio instructions that conflict with visible events. These are proposals, not implemented features.


## Playtest revision: orders, discovery, and the guide route

The handbook contains only the three watch orders. A human sighting introduces the investigate-now / wait-for-relief decision when it becomes relevant. The radio log is collapsed by default. Every field site has a unique exhibit on every night, with unread page markers becoming checks after inspection.

Ending 02 now follows a playable first-person recovery walk through three crossings. The familiar instruction returns as slowly fading red text when the team tries to leave. The player may fire, let them go, or wait; the aftermath records the choice without explaining its cause. Reduced-motion preferences replace the fades with steady text. The tower background and palette are preserved. A local archive retains six ending badges and the last 30 completed transcripts independently of the active save.

After the human sighting, a quiet red “investigate” begins to appear above the field. Its opacity, weight, and size increase with time remaining at the post. Clicking the word leaves the tower; waiting for relief ends with the character already descending the ladder. The pressure is narrative, with no extra exposure penalty for waiting. Reduced-motion preferences keep the type size steady and remove transitions.

## Five more endings

The final debrief offers a separate menu for unresolved encounters. Requirements appear there, after the three shifts; field exploration keeps its existing pacing and exposure costs. All five routes are reachable in Story and Hard. Each contains three scenes and an explicit last choice. Leaving a scene returns to the final debrief, preserving the original options.

- **Relief Accepted (11):** speaking to the relief and acknowledging the double unlock a handover. The last choice distinguishes a false promise from an honest answer.
- **I Brought a Witness (12):** both field recordings and the invitation let the follower enter the recorded interview.
- **One Person Recovered (13):** recording the first radio, comparing it on the second night, and helping the rooted figure establish a way to pull someone free. The rescue leaves the recordings in the field. The survivor remains a real success.
- **The Vacancy (14):** supporting the routine account and signing both earlier reports earns the supervisor’s offer. His release stays conditional until the player approves the open report, so rejecting the handover remains coherent.
- **First Transmission (15):** approaching the second tower and comparing the future recording lead back to the first radio encounter. The replay reflects what the player actually did, including recording without answering.

The original ten endings remain available. New scenes, ending variants, transcripts, collection entries, and progress transfers retain their state through reloads. Separate illustrations and static share pages use the approved first-person captions; the existing backgrounds and palette are preserved.
