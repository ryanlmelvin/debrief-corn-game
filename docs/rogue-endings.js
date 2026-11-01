// Original outcomes for the optional breaks in protocol. Share captions live
// separately so the public cards never contain these ending transcripts.
export const ROGUE_ENDINGS = {
  dungeon_escape: {
    code: '23', title: 'Dungeon Crawler Corn.', art: 'drain', stamp: 'SUBTERRANEAN EXIT',
    text: 'The third brass key turns in the gate. You climb out of the ditch with your rifle slung over a torn uniform. Behind you, the lantern lights three flights of wet steps and the broken roots that guarded them. Ahead is an unfamiliar road. There is no tower. No fence. You check the chamber, put the lantern down, and start walking before anyone can call you back for debrief.',
    last: 'The drain was never meant to keep things out.'
  },
  dungeon_lost: {
    code: '24', title: 'Below the root line.', art: 'drain', stamp: 'LANTERN RECOVERED',
    text: 'The lantern rolls into the water. Without it, the corridors are only roots, and the roots are only corridors. You reach for your rifle, but something pins your wrist beneath the water. Above you, your relief shines a flashlight into the drainage channel. You gather everything you have left into one shout. From up there, it sounds like a blocked pipe.',
    last: 'The next descent begins with a lantern waiting on the steps.'
  },
  corn_escape: {
    code: '16', title: 'I was the corn.', art: 'corner', stamp: 'SPECIMEN AT LARGE',
    text: 'The last shot cuts a tassel from your head. Then you are in the ditch beyond the road, listening to the guard reload. You remember that sound from the other side of the rifle. At dawn, a truck slows beside you. The driver mistakes your raised leaves for a wave. You climb into the bed among sacks of seed. The county line passes without a checkpoint.',
    last: 'For once, you are the one that got away.'
  },
  corn_uprising: {
    code: '17', title: 'I left the gate open.', art: 'sighting', stamp: 'PERIMETER ABANDONED',
    text: 'You reach through the wire and lift the latch. Behind you, the rows begin to move. They wait while the tower fires, then cross together in the pause before the next magazine. You know exactly how long it takes to reload. At the station, the supervisor has locked the front door. Through the glass, you watch him turn the dead bolt a second time.',
    last: 'You have brought everyone for debrief.'
  },
  radio_ghost: {
    code: '18', title: 'I stayed on the line.', art: 'tower', stamp: 'OPERATOR UNLOCATED',
    text: 'You hold the three signals together and tell the next lost voice where to turn. Someone reaches the road. Then another voice comes through. By morning your hand has gone numb around the switch. By the next morning there is no hand. The recovery team finds a radio lying in your empty coat. When they lift it, you tell them to put it down. Someone else is still trying to get out.',
    last: 'Your relief can wait.'
  },
  field_voice: {
    code: '19', title: 'I gave the field orders.', art: 'ending-transmission', stamp: 'COMMAND TRANSFERRED',
    text: 'You speak across all three channels. “Stand down.” Every stalk stops. In the tower, the rifle lowers. You try a second order. The supervisor opens the station door and stands beside it with his hands at his sides. For the first time, you can walk anywhere you like. You tell the field to let everyone go. Nothing moves until you give it their names.',
    last: 'You ask for the personnel ledger.'
  },
  corn_contained: {
    code: '21', title: 'I became target practice.', art: 'sighting', stamp: 'SPECIMEN CONTAINED',
    text: 'The rifle finds you before the road. Your last layer of husk opens, and you fall between two rows you once watched from above. You try to pull yourself forward. Fine white threads have already taken hold beneath you. In the tower, the guard marks a containment and waits for the next movement. You are still here. You simply cannot make one.',
    last: 'By morning, the gap in the row has closed.'
  },
  roadkill: {
    code: '22', title: 'I didn’t look both ways.', art: 'corner', stamp: 'ROADSIDE SPECIMEN',
    text: 'You turn toward the headlights too late. The car carries on. Your last layer of husk lies open on the asphalt, and the roots that were your feet find a crack beneath it. You pull toward the far verge. The crack holds. At dawn, a road crew stops beside the new growth. One worker reaches for a shovel. The other asks whether corn is supposed to grow through pavement.',
    last: 'There is no watchtower on this side of the fence.'
  },
  flood: {
    code: '20', title: 'I changed the irrigation plan.', art: 'drain', stamp: 'TREATMENT DISCONTINUED',
    text: 'The valves lock into place. A season’s treatment runs backward through the roots in one long shudder. Outside, the corn folds toward the ground. By dawn you can see from the pump house to the road without turning sideways. The supervisor calls it a total crop loss. You call it over. Then the drainage ditch rises, though the pump has stopped. Beyond the fence, something knocks against the first culvert.',
    last: 'The water has to go somewhere.'
  }
};

// Keep the existing collection badges while the account describes the failure
// the player actually experienced. Older endings retain their original prose.
export function rogueEnding(s) {
  const r = s.rogue;
  if (s.phase !== 'ending' || r?.stage !== 'done' || r.outcome !== s.ending) return null;
  if (r.route === 'corn' && r.patternVersion === 2 && s.ending === 'corn_escape') return {
    text: 'Headlights pass over the ditch and keep going. Behind the road, the guard reloads. You remember that sound from the other side of the rifle. At dawn, a truck slows beside you. The driver mistakes your raised leaves for a wave. You climb into the bed among sacks of seed. The county line passes without a checkpoint.'
  };
  if (r.route === 'corn' && r.patternVersion === 2 && s.ending === 'corn_uprising') return {
    text: 'You wait for the headlights to pass, cross back, and lift the gate latch. The rows follow your tracks to the shoulder. A driver brakes for the first stalk. The rest keep coming. Soon the road is still, and the field is moving. At the station, the supervisor has locked the front door. Through the glass, you watch him turn the dead bolt a second time.'
  };
  if (r.route === 'flood' && s.ending === 'breach') return {
    stamp: 'TREATMENT LINE RUPTURED',
    text: 'The third release tears a pipe from the wall. Treatment pours beneath the pump-house door. You reach for the shutoff, but roots have closed around the wheel. Outside, the flooded rows lean toward the drainage ditch. The fence lifts out of the ground one post at a time. Dispatch asks how many specimens have crossed. You can no longer tell where one ends and the next begins.',
    last: 'The perimeter goes with them.'
  };
  if (r.route === 'broadcast' && s.ending === 'assimilation') return {
    stamp: 'VOICE RETAINED',
    text: 'You miss the carrier again. The needles settle anyway. From the radio comes your voice, giving your name and watch number without hesitation. You release the transmit switch. It keeps talking. Beneath your boots, the soil opens around the cable. The voice finishes your debrief while you try to remember the first word.',
    last: 'The department finally has a statement it can use.'
  };
  if (r.route === 'corn' && s.ending === 'assimilation' && r.hits === 3 && r.lastHit === 'car') return {
    stamp: ROGUE_ENDINGS.roadkill.stamp,
    text: ROGUE_ENDINGS.roadkill.text,
    last: ROGUE_ENDINGS.roadkill.last
  };
  if (r.route === 'corn' && s.ending === 'assimilation' && r.hits === 3) return {
    stamp: 'SPECIMEN ROOTED',
    text: ROGUE_ENDINGS.corn_contained.text,
    last: ROGUE_ENDINGS.corn_contained.last
  };
  return null;
}
