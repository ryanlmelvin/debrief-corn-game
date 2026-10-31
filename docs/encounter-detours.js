// Standalone field incidents used after the player's earlier choices have closed
// the corresponding lead. These choices grant no ending flags or equipment.
const choices = (pass, observe, probe) => [
  { id: 'pass', label: pass[0], delta: 0, result: pass[1] },
  { id: 'observe', label: observe[0], delta: -2, result: observe[1] },
  { id: 'probe', label: probe[0], delta: 3, result: probe[1] }
];

export const ENCOUNTER_DETOURS = {
  'second-call': [
    {
      id: 'pipe-knocks', title: 'Three knocks in the pipe.', art: 'field:pump',
      text: 'Through a gap in the rows, you see the pump shed. Three knocks travel along its exposed pipe. The motor is silent. A pause, then three more. Farther down the pipe, something knocks back.',
      report: 'Knocking traveled along the pump pipe while the motor was stopped. An answering knock came from farther down the line.',
      shortReport: 'The stopped pump pipe knocked. Something answered farther down the line.',
      choices: choices(
        ['Keep walking.', 'You leave the pipe to its conversation. The knocks grow quieter, though the shed is still in sight.'],
        ['Wait through a full interval.', 'You count the quiet between each set of knocks. Twelve breaths, every time. Having something to count steadies your hands.'],
        ['Tap a stalk against the pipe.', 'You tap once. Every pipe joint knocks at once. The stalk splits in your hand, leaving a wet line across your palm.']
      )
    },
    {
      id: 'rain-below', title: 'Rain below ground.', art: 'field:drain',
      text: 'A drainage cut runs beside the path. Its water sounds like a heavy downpour, but the surface is smooth. The noise stops beneath each root that crosses the channel, then starts again on the other side.',
      report: 'Still drainage water sounded like falling rain. The sound stopped wherever roots crossed the channel.',
      shortReport: 'Still water sounded like rain, except beneath the crossing roots.',
      choices: choices(
        ['Stay on the path.', 'You keep to the dry edge. The sound continues behind you without a single drop touching your coat.'],
        ['Watch the water without moving.', 'A beetle crosses a root above the water. It reaches the far bank and keeps going. You watch until your breathing slows.'],
        ['Touch the surface with a stalk.', 'The water dimples upward against the stalk. Rain hisses inside the hollow stem. You drop it; the noise stops before it lands.']
      )
    }
  ],
  'future-call': [
    {
      id: 'cotton-seam', title: 'The fence is being mended.', art: 'field:corner',
      text: 'White cotton catches your light along the fence. Loose threads stretch from the torn strip into neighboring stalks. One thread draws taut. A leaf folds neatly along its middle, as if someone has pulled a stitch through it.',
      report: 'Threads from cotton on the fence tightened between the stalks and folded a leaf along its middle.',
      shortReport: 'Threads from the fence cotton pulled a leaf into a neat fold.',
      choices: choices(
        ['Pass outside the hanging threads.', 'You duck beneath the lowest thread. Behind you, leaves fold against leaves with the soft rub of clean laundry.'],
        ['Study one thread from a distance.', 'You follow a single thread with your light until it ends in a loose knot. It stays still. You concentrate on that small, ordinary knot.'],
        ['Lift a thread with a fallen stalk.', 'The thread tightens and cuts a groove into the stalk. For a moment, a matching line presses into your sleeve. You let go before it reaches the skin.']
      )
    },
    {
      id: 'upward-puddle', title: 'The puddle empties upward.', art: 'extra-step',
      text: 'Water fills an old footprint beside your boot. Each ripple draws a little mud up the sides. The bottom rises until the print is almost level with the path. Then the mud sinks again, making the same print without a foot.',
      report: 'A water-filled footprint filled itself with mud, then sank into the same shape again without being stepped in.',
      shortReport: 'A footprint filled itself in, then reappeared without a foot.',
      choices: choices(
        ['Step around the puddle.', 'You give the print room. It keeps filling and emptying behind you, too slowly to match a walking pace.'],
        ['Wait for the water to settle.', 'You watch three slow cycles. On the fourth, the water stays flat. You take a breath and leave it that way.'],
        ['Press a stalk into the heel mark.', 'The stalk sinks until only its tip shows. When you pull it free, it is dry and warm. The water starts rising toward your boot.']
      )
    }
  ],
  'your-outline': [
    {
      id: 'root-clock', title: 'Something is counting.', art: 'root-knot',
      text: 'A hollow tangle of roots lies across the furrow. One root tip strikes a stone, then a second, then a third. Each makes the same small tap. When the last tip has struck, the first begins again.',
      report: 'Root tips tapped a stone one at a time, then repeated the sequence.',
      shortReport: 'Root tips tapped a stone in a repeating sequence.',
      choices: choices(
        ['Go around the tapping roots.', 'You pass on the far side of the furrow. The taps carry clearly for a few steps, then the leaves absorb them.'],
        ['Count without touching anything.', 'There are nine taps. You count another nine, then another. Your pulse settles into a slower rhythm than theirs.'],
        ['Move the stone with a stalk.', 'You push the stone out of reach. The roots keep tapping against bare air. A small dent appears in the toe of your boot at each sound.']
      )
    },
    {
      id: 'breathing-crossing', title: 'The opening narrows.', art: 'moved-crossing',
      text: 'Two openings divide the row ahead. Leaves brush together in the left one, closing it. The right one opens wider. A few seconds later they trade places. Nothing moves above the height of your shoulders.',
      report: 'Two openings in the rows alternately closed and widened while the tops of the stalks stayed still.',
      shortReport: 'Two openings alternately closed while the tops of the stalks stayed still.',
      choices: choices(
        ['Take the clear edge of the crossing.', 'You keep outside the moving leaves. Neither opening follows you. Both continue their slow exchange.'],
        ['Wait for both openings to settle.', 'After a while, both openings stand wide. You hear ordinary insects again. You leave before the leaves begin moving.'],
        ['Hold a leaf back with your light.', 'You use the flashlight barrel to hold a leaf aside. The pressure increases until your wrist aches. You pull free; the opening shuts without a sound.']
      )
    }
  ],
  'last-follower': [
    {
      id: 'brass-on-the-sill', title: 'The cartridges are moving.', art: 'field:tower',
      text: 'Near the ladder, your light catches the kit on the low tower sill. A loose brass cartridge rolls toward the notebook, stops, and rolls back. The radio and binocular strap beside it do not move. There is no wind.',
      report: 'A cartridge rolled back and forth on the tower sill while the equipment beside it stayed still.',
      shortReport: 'A cartridge rolled on the still tower sill without wind.',
      choices: choices(
        ['Leave the kit where it is.', 'You step away from the sill. Brass touches wood once more, then falls quiet.'],
        ['Count the equipment without touching it.', 'Radio, binoculars, notebook, ammunition. Everything issued to you is there. You count again, and get the same answer.'],
        ['Stop the cartridge with the notebook.', 'You slide the notebook into its path. The cartridge stops. Inside the closed notebook, something rolls from one edge to the other.']
      )
    },
    {
      id: 'dry-channel', title: 'The water leaves its place.', art: 'field:drain',
      text: 'Beside the path, a strip of drainage water draws away from both banks. It holds in the middle of the channel, narrow and deep. The exposed mud shines. Tiny roots reach toward it and stop just short.',
      report: 'Drainage water drew away from both banks and held in a narrow strip down the middle of the channel.',
      shortReport: 'Water drew away from both banks and held in the center of the drain.',
      choices: choices(
        ['Keep to the bank.', 'You follow the firm ground. A little farther on, the water touches both banks again.'],
        ['Watch from the dry path.', 'A leaf lands on the narrow strip of water and drifts downstream. You follow it with your light until it reaches the normal current.'],
        ['Lay a stalk across the exposed mud.', 'The stalk bridges the gap. Water climbs it in a thin sleeve, reaches your end, and hangs there. You step back before it can touch you.']
      )
    }
  ],
  'two-towers': [
    {
      id: 'inverted-flame', title: 'The flame points down.', art: 'unattended-lamp',
      text: 'An unattended lantern hangs above an open supply tin. Its flame bends toward the ground inside the glass. The tin reflects it as an ordinary upright flame. Both tremble at the same time.',
      report: 'A lantern flame bent downward while its reflection in a supply tin remained upright.',
      shortReport: 'A lantern flame pointed down. Its reflection stayed upright.',
      choices: choices(
        ['Pass beyond the lantern light.', 'You leave both flames burning. Their light reaches the same patch of mud.'],
        ['Watch only the reflection.', 'The reflection gives you something familiar to look at. You wait until the tension leaves your jaw, then move on.'],
        ['Tilt the supply tin with a stalk.', 'You tip the tin until it reflects the dark sky. The little flame stays visible in it. The lantern glass clicks once, close to your ear.']
      )
    },
    {
      id: 'fence-whistle', title: 'A note along the fence.', art: 'field:corner',
      text: 'A strip of white cotton caught beside the fence quivers in still air. From somewhere along the wire comes a thin whistle. Each time the cloth stops moving, the note stops with it. The surrounding leaves are motionless.',
      report: 'Cotton beside the fence quivered in still air. A whistle along the wire stopped whenever the cloth stopped.',
      shortReport: 'A whistle along the fence kept time with cotton moving in still air.',
      choices: choices(
        ['Walk away from the wire.', 'The note fades as you leave the fence. Your ears keep expecting it for several steps.'],
        ['Wait through the next silence.', 'The cloth settles. You listen to the quiet until you can hear insects beyond the fence. This time you leave before the note returns.'],
        ['Touch the wire with a fallen stalk.', 'The stalk hums against the wire. You feel the note in your teeth. When you let go, it drops half a tone and the cotton goes still.']
      )
    }
  ]
};
