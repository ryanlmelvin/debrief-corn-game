// Cosmetic alternatives only. Encounter IDs, choices and consequences live in encounters.js.
// Original game-adaptation prose; no source manuscript text.
const has = (s, flag) => s.fieldEvents.flags.includes(flag);
const response = (label, result, shortLabel) => ({ label, result, ...(shortLabel ? { shortLabel } : {}) });

export const ENCOUNTER_FLAVORS = {
  'first-call': [
    {
      id: 'channel', title: 'Every channel is occupied.', art: 'second-call',
      text: 'A radio lies half buried in a dry furrow, its loose microphone resting on your boot prints. The tuning needle moves by itself. Every channel carries your voice: “Stay where you are. I can see you.” Your own set is silent.',
      report: 'Every channel on a buried radio carried my voice. My issued set was silent.',
      shortReport: 'A buried radio carried my voice on every channel.',
      choices: {
        leave: response('Leave the dial alone.', 'You walk on. Your voice keeps describing the next crossing through the buried radio, although you cannot see it yet.'),
        answer: response('Ask it where you are.', 'You ask, “Where am I?” The answer gives your position exactly. “Do not turn around.” The tuning needle stops. Behind you, a leaf brushes the back of your coat.'),
        record: response('Record the changing channels.', 'You hold your recorder to the grille as the needle moves. On playback, none of the words remain. Only your breathing crosses from one channel to the next.')
      }
    },
    {
      id: 'waterline', title: 'The voice under the water.', art: 'radio',
      text: 'Water drains into the grille of a half-buried radio. Your voice comes through clearly: “Stay where you are. I can see you.” Small bubbles break in time with each word. The set on your belt has not made a sound.',
      report: 'A radio spoke in my voice while water ran into its speaker.',
      shortReport: 'My voice came from a radio filling with water.',
      choices: {
        leave: response('Step over the flooded furrow.', 'Your voice describes the next crossing as you leave the buried radio behind. The water around it is perfectly still now.'),
        answer: response('Ask it where you are.', '“Where am I?” you ask. Your voice gives the coordinates beneath your feet. “Do not turn around.” A second stream of bubbles rises behind your heel.'),
        record: response('Hold your recorder to the grille.', 'You crouch above the water and record your voice. The words disappear on playback. Your breathing remains, close to the microphone, with no sound of water at all.')
      }
    }
  ],
  'paired-tracks': [
    {
      id: 'backwards', title: 'The prints face you.', art: 'tracks',
      text: 'Another trail of boot prints runs beside yours, heel damage and all. Those toes point toward you. You take a step forward. The nearest backward print deepens, as though someone has just stepped away without lifting a foot.',
      report: 'A second trail matched my damaged boots, but every print faced the wrong direction.',
      shortReport: 'Matching boot prints faced the wrong way.',
      choices: {
        stay: response('Keep following the marked path.', 'You follow the survey markers. The backward trail turns into the corn. Its toes still point toward you.'),
        mark: response('Mark the crossing with survey twine.', 'You tie survey twine around a stalk and keep the rest of the spool. Beside your knot, a backward footprint slowly fills with water.'),
        follow: response('Follow the backward trail one row over.', 'One row over, the backward prints end. A forward print waits in dry soil, with the split in your heel. You have not put your foot down yet.')
      }
    },
    {
      id: 'standing-water', title: 'Something has your weight.', art: 'extra-step',
      text: 'Water rises in a fresh footprint beside your boot. You shift your weight. Water rises farther. Beyond it, a second trail matches the split heels of your boots, although you have only walked this path once.',
      report: 'Water moved in a second set of my boot prints whenever I shifted my weight.',
      shortReport: 'A second trail of my prints moved with my weight.',
      choices: {
        stay: response('Stay on the marked path.', 'You stop watching the water and follow the markers. Soft splashes keep pace one row away.'),
        mark: response('Tie survey twine beside the prints.', 'You knot survey twine around a stalk at the crossing and keep the remaining spool. The water in the nearest print settles as soon as your hands stop moving.'),
        follow: response('Follow the prints one row over.', 'The second trail leads to dry ground. Your next footprint is already there. You balance on one foot until your calf begins to hurt, then step beside it.')
      }
    }
  ],
  'unattended-lamp': [
    {
      id: 'late-shadow', title: 'The light waits for you.', art: 'unattended-lamp',
      text: 'A lantern hangs over an open supply tin. You raise your light. The lantern brightens a moment later. You lower it. The lantern dims. Something small and round glints at the bottom of the tin.',
      report: 'An unattended lantern brightened and dimmed a moment after I moved my own light.',
      shortReport: 'An unattended lantern copied my light.',
      choices: {
        pass: response('Walk past the hanging light.', 'You pass the lantern without looking into the tin. Your shadow catches up with you at the next stalk.'),
        search: response('Search the supply tin.', 'An old survey compass sits inside the tin beneath the lantern. Its needle points toward the tower. When you pocket it, the lantern goes dim enough to show a thumbprint inside the glass.'),
        wait: response('Stand still and watch.', 'You hold your light steady and breathe slowly. The lantern gradually settles to an ordinary flame. You wait until your shoulders relax.')
      }
    },
    {
      id: 'ash', title: 'Ash against the wind.', art: 'unattended-lamp',
      text: 'Black flakes rise from an open supply tin toward the lantern hanging above it. One reaches the glass and burns white. The tin gives a small metallic click. There is no fire inside it.',
      report: 'Black flakes rose from a cold supply tin and burned against the lantern above it.',
      shortReport: 'Ash rose from a cold tin toward a lantern.',
      choices: {
        pass: response('Leave the tin where it is.', 'You stay on the path. The flakes fall normally once you have passed, making a sound like heavy rain.'),
        search: response('Look inside the supply tin.', 'Beneath the flakes is an old survey compass. Its needle turns toward the tower and holds there. You pocket it. The cold metal leaves a clean circle on your palm.'),
        wait: response('Watch until your breathing settles.', 'You count the flakes as they rise. They grow slower with your breathing. By the time your hands are steady, nothing is moving between the tin and the glass.')
      }
    }
  ],
  'extra-step': [
    {
      id: 'heel-drag', title: 'A dragging heel.', art: 'tracks',
      text: 'The tower light appears between the stalks. Behind your own steps comes a soft scrape, as if someone is dragging one heel. You stop. The scrape stops too. Then one clean footstep lands in the mud.',
      report: 'A dragging step followed me. When I stopped, I heard one more footstep.',
      shortReport: 'One more footstep followed after I stopped.',
      choices: {
        forward: response('Keep walking toward the tower.', 'You keep the tower light ahead of you. The dragging sound resumes, always just after your left foot lands.'),
        listen: response('Wait without looking behind you.', 'You listen until you can distinguish dripping water from the scrape of leaves. Nothing takes another step. Your breathing slows.'),
        turn: response('Turn your light toward the scrape.', 'A bent corn stalk hangs over a fresh print. It straightens slowly in your beam. Mud is still dropping from one leaf.')
      }
    },
    {
      id: 'dry-step', title: 'Dry ground behind you.', art: 'extra-step',
      text: 'You hear a crisp footstep behind you as the tower light comes into view. The path is deep mud; your own boots make no sound like that. You stop. One last dry step lands, and water jumps from a print beside your heel.',
      report: 'I heard a dry footstep on a muddy path after I had stopped walking.',
      shortReport: 'A dry footstep sounded on the muddy path.',
      choices: {
        forward: response('Follow the tower light.', 'You walk on. Each of your wet steps is followed by a dry one, close enough to sound like the same boot.'),
        listen: response('Let the water settle. Do not turn.', 'You wait for the rings in the footprint to disappear. The field grows quiet. Your hands loosen around the light.'),
        turn: response('Shine the light behind you.', 'Only a bent stalk moves in the beam. It straightens a little at a time. The soil beneath it is dry, inside a ring of standing water.')
      }
    }
  ],
  'second-call': [
    {
      id: 'rehearsal', title: 'It leaves room for your reply.', art: 'radio',
      text: s => has(s, 'answered-radio') ? 'The buried radio repeats your first-night question: “Where am I?” A pause follows. Then the corn answers from three different rows, each voice giving a different position.' : 'The buried radio plays your first-night footsteps leaving it behind. Then silence. Then the same footsteps return and stop beside the set. You have not moved.',
      report: 'The buried radio replayed my first night and paused as though it expected an answer.',
      shortReport: 'The radio replayed my first night and waited.',
      choices: {
        disconnect: response('Unplug the loose microphone.', 'You pull the microphone lead from the buried set. The replay pauses. From the empty socket comes a quiet intake of breath.'),
        mislead: response('Tell it you are going west.', 'You give the radio a false direction: west. Leaves turn that way one row at a time. You take the other path.'),
        compare: response('Play your first tape beside it.', 'You play your first recording beside the radio. The two voices cancel into a thin whistle. For a few seconds the field sounds ordinary. You can hear the real path under your boots.')
      }
    },
    {
      id: 'distance', title: 'The sound is getting closer.', art: 'future-call',
      text: s => has(s, 'answered-radio') ? 'The buried radio plays your question from the first night: “Where am I?” It sounds distant. Each repetition comes closer, until the speaker seems to be inside your collar.' : 'The buried radio plays the footsteps you made leaving it on the first night. With each repetition they sound closer. The last set stops where you are standing.',
      report: 'The field radio replayed my first investigation, each repetition sounding closer.',
      shortReport: 'An old recording sounded closer each time.',
      choices: {
        disconnect: response('Disconnect its microphone.', 'You unplug the loose microphone. The sound retreats into the furrow. The empty plug vibrates against your finger.'),
        mislead: response('Give it a false heading: west.', 'You say you are heading west. The next replay carries your footsteps away in that direction. The crop bends after the sound. You go the other way.'),
        compare: response('Play the first tape beside the radio.', 'Your tape and the radio voice meet in a thin whistle, then cancel. The field sounds ordinary for a few seconds. Even the nearest leaves seem farther away.')
      }
    }
  ],
  'moved-crossing': [
    {
      id: 'same-stalk', title: 'Both paths have the same scar.', art: 'moved-crossing',
      text: s => has(s, 'twine') ? 'Two openings divide the row. Your survey twine hangs in both, tied with the same awkward knot. The map shows one crossing. Pale roots grow from both cut ends.' : 'Two openings divide the row. The same broken stalk stands in each. Your boot prints lead into both, although the map shows only one crossing.',
      report: 'Two crossings held the same marker, where my map showed only one path.',
      shortReport: 'The same marker appeared at two crossings.',
      choices: {
        map: response('Find your bearing from the tower.', 'You hold the tower light in view until one opening shifts behind the other. You follow the line that remains.'),
        ribbon: response('Take the narrower opening.', 'You pass the broken stalk and walk through the narrow opening. The same stalk brushes your sleeve from ahead. Your last footprint is still filling with water.'),
        compass: response('Use the compass from the supply tin.', 'Your compass stays north while the two openings slide past each other. You follow its needle until the extra crossing is behind you.')
      }
    },
    {
      id: 'rain', title: 'Rain on the other path.', art: 'moved-crossing',
      text: s => has(s, 'twine') ? 'Your survey twine hangs at a crossing two rows from where you tied it. Beyond it, rain falls into one opening. The other is dry. Neither crossing belongs here on your map.' : 'The path divides where the map shows a straight row. Rain falls into one opening. The other is dry. Your boot prints enter both, without any returning tracks.',
      report: 'The crossing did not match my map. Rain fell on only one of its two paths.',
      shortReport: 'Rain fell on one path at an impossible crossing.',
      choices: {
        map: response('Keep the tower light in view.', 'You use the tower light to work around the split. Rain ticks against the stalks on your left, but none reaches your coat.'),
        ribbon: response('Try the narrower path.', 'You take the narrower opening past a broken stalk. A moment later the same stalk catches your sleeve again. The rain has not moved across the ground.'),
        compass: response('Follow the compass from the tin.', 'The compass needle holds steady. You follow north through the place where the two paths disagree. Behind you, the rain stops in the middle of a drop.')
      }
    }
  ],
  'lamp-keeper': [
    {
      id: 'watch-number', title: 'It knows your shift.', art: 'lantern',
      text: 'A figure waits beyond the lantern with its boots sunk into the soil. It recites your watch number. “Relief,” it says. Its mouth never moves; the word comes from the leaves pressed against its cheek.',
      report: 'A rooted figure beside the lantern knew my watch number and claimed to be my relief.',
      shortReport: 'The figure at the lantern claimed to be my relief.',
      choices: {
        back: response('Back away with your light steady.', 'The figure stays rooted beside the lantern. As you leave, it recites your watch number again, one digit wrong.'),
        ask: response('Ask who sent your relief.', 'The figure gives your name, then the name of the person who trained you. It repeats the second name carefully, as though learning how to say it.'),
        hand: response('Take its hand and try to pull it free.', 'Its cold hand closes around yours. You pull. Neither boot moves in the soil. When you let go, your fingers keep the smell of wet grain.')
      }
    },
    {
      id: 'coat-on-loan', title: 'A coat you recognize.', art: 'your-outline',
      text: 'Beyond the lantern, a figure in an olive coat stands with both boots buried. A pale repair shows on its sleeve. “Relief,” it says, from somewhere behind its head. You touch the repair on your own sleeve.',
      report: 'A figure with rooted boots claimed to be my relief. Its coat had the same repair as mine.',
      shortReport: 'My supposed relief wore a coat like mine.',
      choices: {
        back: response('Back away without lowering the beam.', 'The figure remains behind the lantern. Its sleeve lifts as you move your light, but the rest of its arm stays still.'),
        ask: response('Ask who assigned it to your post.', 'It gives your name as the person who sent it. Then it gives your trainer’s name. Both sound like answers read from a list you cannot see.'),
        hand: response('Offer a hand to free its boots.', 'The figure grips your hand. Its fingers are cold; its boots do not shift. You stop pulling before your shoulder gives. Your palm smells of wet grain.')
      }
    }
  ],
  'two-towers': [
    {
      id: 'call-sign', title: 'Both towers answer.', art: 'two-towers',
      text: 'Two tower lights show above the crop. Your expected radio call comes from one, then repeats from the other with your call sign. Beneath that second light, you hear someone climbing a ladder you cannot see.',
      report: 'Two tower lights answered the same call. I heard climbing beneath the second light.',
      shortReport: 'Two tower lights answered the same radio call.',
      choices: {
        visible: response('Find the ladder you can see.', 'You make out the real ladder through a gap. The other light goes dark during the next radio call. You keep the visible rungs ahead of you.'),
        other: response('Approach the second tower light.', 'You take a few steps toward the second light. The unseen climber stops. Your call sign comes again, this time from directly above you.'),
        listen: response('Put out your light and listen.', 'In the dark, the real tower cable taps against its post. The false radio call stops between those taps. You follow the familiar cable sound.')
      }
    },
    {
      id: 'missing-rungs', title: 'Two lights. One ladder.', art: 'two-towers',
      text: 'One tower light illuminates wooden rungs. Another hangs over an unbroken wall of corn. A boot knocks against a rung beneath the second light. Another knock follows, higher up. Your expected radio call comes from the first tower.',
      report: 'I heard someone climbing beneath a second tower light where there was no visible ladder.',
      shortReport: 'Climbing sounds came from a tower with no ladder.',
      choices: {
        visible: response('Keep the visible ladder ahead of you.', 'You follow the line of wooden rungs. The second light dims with each step until only the real tower remains.'),
        other: response('Step toward the light without a ladder.', 'You approach the second light. The climbing stops. Something knocks twice against wood high above the corn, although your beam finds only leaves.'),
        listen: response('Switch off your light and listen.', 'You hear the familiar cable tapping the real tower post. The climbing noise cannot keep its rhythm. You wait for a steady bearing and walk toward the cable.')
      }
    }
  ],
  'future-call': [
    {
      id: 'carbon-copy', title: 'Your statement is already typed.', art: 'second-call',
      text: s => has(s, 'false-direction') ? 'The buried radio reports a search party heading west, the false direction you gave it. A typewriter starts. Your supervisor reads back tonight’s statement in a room you have not entered yet. Your voice says the typing is too loud.' : 'A typewriter clatters through the buried radio. Your supervisor reads back tonight’s statement. Your voice corrects one word, then asks him to unlock the interview-room door. You have not finished the investigation.',
      report: 'The radio played tonight’s debrief, with my voice correcting a statement that had not been taken.',
      shortReport: 'The radio played a statement I had not made yet.',
      choices: {
        stop: response('Cut off the transmission.', 'The buried radio falls silent. You hear three more typewriter keys from somewhere under the path.'),
        record: response('Record the future interview.', 'You record the interview from the buried radio. On playback, the typing stops. Your voice asks why the door is locked. No answer follows.'),
        compare: response('Compare with your first tape.', 'Under both recordings is the same tiny click: your thumb releasing the radio switch. It sounds a second before your thumb moves. You leave the switch alone.')
      }
    },
    {
      id: 'empty-chair', title: 'A chair scrapes over the radio.', art: 'future-call',
      text: s => has(s, 'false-direction') ? 'The buried radio names the westward search route you invented. A chair scrapes. Your supervisor asks about tonight’s field work. Your voice answers from farther away, as though you are already standing at the interview-room door.' : 'A chair scrapes through the buried radio. Your supervisor asks what you found tonight. Your voice says, “Nothing outside the expected growth pattern.” Then it asks whether the interview-room door opens from this side.',
      report: 'The radio played my unfinished night’s debrief, including sounds from the interview room.',
      shortReport: 'Tonight’s debrief came over the field radio.',
      choices: {
        stop: response('Break off the interview.', 'You stop the radio. The sound of a chair being dragged continues briefly through the soil beneath it.'),
        record: response('Record the interview ahead of you.', 'You record the future interview. On playback, the chair is still and your voice is close to the microphone. It asks why the door is locked.', 'Record the future interview.'),
        compare: response('Play it against your first tape.', 'You compare the two recordings. Both carry the click of your thumb releasing the switch, a second before you release it. You lift your hand clear of the radio.', 'Compare with your first tape.')
      }
    }
  ],
  'root-knot': [
    {
      id: 'lacing', title: 'The roots are learning a knot.', art: 'root-knot',
      text: 'Pale roots have woven an empty boot shape across the furrow. Two fine threads cross and uncross above it, trying to make a bow. Each attempt pulls the soil tight around your own laces.',
      report: 'Roots formed an empty boot and tried to tie a bow above it.',
      shortReport: 'Roots were lacing an empty boot shape.',
      choices: {
        around: response('Step around the knot.', 'You lift your boots carefully over the clear ground. The two root tips keep crossing, unable to finish the bow.'),
        lift: response('Lift it with a fallen stalk.', 'You lift the root knot. Beneath its empty boot shape is the print of your own sole. The two loose threads tie themselves neatly around the stalk.'),
        twine: response('Lay your survey twine across it.', 'You stretch your survey twine across the knot. The root tips follow its straight line instead of your laces. You leave the twine and take the clear path.')
      }
    },
    {
      id: 'heel-beat', title: 'A heel under the path.', art: 'root-knot',
      text: 'A hollow shape in the pale roots presses against the mud: toe, heel, toe, heel. It is the size of your boot. The roots have no foot inside them. You can feel each press through your soles.',
      report: 'An empty boot shape made from roots pressed a walking rhythm into the soil.',
      shortReport: 'An empty root boot pressed against the path.',
      choices: {
        around: response('Go around without touching it.', 'You keep off the roots. The pressure under your soles fades, but the empty shape keeps working against the path.'),
        lift: response('Raise the roots with a fallen stalk.', 'You lift the hollow knot. Under it lies a clear impression of your boot sole. The roots keep walking in the air until you set them down.'),
        twine: response('Draw the roots away with your twine.', 'You lay your survey twine across the roots and toward the verge. The smallest tips follow it away from your boots. You leave the line behind and cross.')
      }
    }
  ],
  'your-outline': [
    {
      id: 'sleeve', title: 'The repair is still wet.', art: 'your-outline',
      text: s => has(s, 'touched') ? 'The figure whose hand you held waits beyond the lantern. Your palm aches. It wears your coat, including the pale sleeve repair, but dark water drips from the stitches. Its shoulders rise with your breathing.' : 'A figure beyond the lantern wears your coat, down to the pale repair on the sleeve. Water drips from those stitches. Your own sleeve is dry. The figure’s shoulders rise when you breathe.',
      report: 'A figure wore my repaired coat and breathed with me. Water dripped from its sleeve.',
      shortReport: 'My double’s repaired sleeve was dripping water.',
      choices: {
        ground: response('Watch the ground and pass.', 'You lower the light to your own dry sleeve, then your boots. The dripping continues behind you until the lantern is out of sight.'),
        name: response('Call your own name.', 'The figure turns its head too far toward the wet sleeve. Your voice answers “Here” from behind you. A drop strikes the back of your hand.'),
        stand: response('Stand beside the figure.', 'You stand beside it. For one breath your sleeve is wet and its sleeve is dry. You move away before you can check the repair.')
      }
    },
    {
      id: 'held-breath', title: 'It is waiting to breathe.', art: 'lantern',
      text: s => has(s, 'touched') ? 'The figure you tried to free stands beyond the lantern, holding up the hand that gripped yours. Its coat has the same pale sleeve repair as yours. You hold your breath. Its shoulders stop moving too.' : 'A figure waits beyond the lantern in a coat with the same pale sleeve repair as yours. Its shoulders follow your breathing. You hold a breath. It holds still, although the leaves around its mouth keep moving.',
      report: 'A figure in a copy of my repaired coat stopped breathing whenever I did.',
      shortReport: 'A figure held its breath when I held mine.',
      choices: {
        ground: response('Keep your beam low and pass.', 'You breathe normally and watch your boots. Behind you, someone exhales just as you do.'),
        name: response('Say your own name.', 'You call your name. The figure turns its head too far. Your voice says “Here” behind you, using the breath you were about to take.'),
        stand: response('Stand beside your outline.', 'You stand beside the figure and breathe in. Only one set of shoulders rises. You step away before breathing out.')
      }
    }
  ],
  'last-follower': [
    {
      id: 'latch', title: 'It knows about the latch.', art: 'last-follower',
      text: s => has(s, 'looked-back') ? 'The tower latch clicks over the radio on your belt. Behind you, a stalk bends like the one you saw straighten on your first night. “Hold the door,” the radio says. The tower door is still shut.' : 'The radio on your belt carries the click of the tower latch. You can see the door ahead; it has not moved. “Hold the door,” the voice says. The nearest row leans toward the ladder.',
      report: 'My radio carried the tower latch’s sound and asked me to hold the door. The crop leaned toward me.',
      shortReport: 'The radio asked me to hold the tower door.',
      choices: {
        climb: response('Keep walking without replying.', 'You keep your eyes on the tower. The radio repeats the request, followed by the careful sound of someone wiping their boots.'),
        leave: response('Set the radio beside the path.', 'You leave the radio by a stalk. The latch keeps clicking from its speaker, but the sound stays behind you. Your breathing settles as you walk away.'),
        reply: response('Tell it there is room for one more.', 'You tell the radio there is room for one more. The crop stops leaning. Something beside your boot exhales, and the latch falls silent.')
      }
    },
    {
      id: 'polite', title: 'It says please this time.', art: 'extra-step',
      text: s => has(s, 'looked-back') ? 'Near the tower, a footprint fills beside your boot. A stalk behind you bends just as it did on the first night. Your belt radio says, “Hold the door.” A pause. “Please.”' : 'Near the tower, a footprint fills with water beside your boot. The crop leans toward the ladder. Your belt radio says, “Hold the door.” After a long pause it adds, “Please.”',
      report: 'Near the tower, a fresh footprint appeared beside me and the radio asked to be let inside.',
      shortReport: 'A voice on the radio asked to come inside.',
      choices: {
        climb: response('Walk on without answering.', 'You continue toward the tower. The voice practices “please” as you walk, trying a different tone each time.'),
        leave: response('Leave the radio beside the footprint.', 'You put the radio on dry ground beside the print. The request stays with it. No more prints appear beside your feet.'),
        reply: response('Say there is room for one more.', 'You say there is room for one more. The water beside your boot goes still. Something exhales at your side. You cannot hear it following anymore.')
      }
    }
  ]
};
