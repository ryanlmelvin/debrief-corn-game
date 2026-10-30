// Original field encounters for the game adaptation. No source manuscript text.
const choice=(id,label,delta,result,flag=null,requires=null)=>({id,label,delta,result,flag,requires});
const has=(s,flag)=>s.fieldEvents.flags.includes(flag);
export const ENCOUNTERS=[
  {id:'first-call',night:0,step:3,art:'radio',title:'Your voice. From the soil.',
    text:'A radio lies half buried in the furrow. Your own voice comes through its grille: “Stay where you are. I can see you.” Your issued set is still clipped to your belt.',
    report:'A radio in the soil spoke in my voice while my own set was silent.',choices:[
      choice('leave','Leave the set in the mud.',0,'You step past it. The voice keeps describing a place you have not reached yet.'),
      choice('answer','Ask it where you are.',3,'It gives your exact position, then whispers, “Do not turn around.” Leaves scrape together behind you. You do not look.','answered-radio'),
      choice('record','Hold your recorder to the grille.',5,'You keep a few seconds of your other voice. On the tape, it stops speaking just before you do.','recording')
    ]},
  {id:'paired-tracks',night:0,step:9,art:'tracks',title:'Someone is keeping pace.',
    text:'Another trail of boot prints runs beside yours. The soles have the same split at the heel. You take one step. A shallow print fills with water a little farther ahead.',
    report:'A second trail had the same damaged heel as my boots. New prints appeared ahead of me.',choices:[
      choice('stay','Keep to the marked path.',0,'You keep your light on the next crossing. The second trail leaves the path and continues into the crop.'),
      choice('mark','Tie survey twine around a stalk.',2,'You knot a piece of twine at knee height and keep the rest. You will recognize this crossing if you come back.','twine'),
      choice('follow','Follow the prints one row over.',4,'The trail ends at a dry patch of soil. Your next footprint is already there, pressed into earth that has not been wet.','followed-tracks')
    ]},
  {id:'unattended-lamp',night:0,step:16,art:'lantern',title:'A light off the path.',
    text:'A lantern swings beyond the next row. No wind reaches you. Beneath it, an open supply tin catches the light. Something metal rolls once inside.',
    report:'An unattended lantern was moving in still air beside an old supply tin.',choices:[
      choice('pass','Pass without leaving the path.',0,'The lantern stops as soon as you pass it. Your shadow takes another step.'),
      choice('search','Search the tin beneath the light.',5,'An old survey compass waits inside. Its needle points toward the tower. For a moment, all the leaves point that way too. You pocket it.','compass'),
      choice('wait','Wait and watch the lantern.',-2,'You slow your breathing. The light swings in time with it. You hold your breath. The lantern stops.','listened')
    ]},
  {id:'extra-step',night:0,step:23,art:'tracks',title:'One more footstep.',
    text:'The tower light shows between the rows. You stop walking. Behind you, one more footstep presses into the mud. Then the field is quiet.',
    report:'When I stopped between the rows, I heard another footstep stop behind me.',choices:[
      choice('forward','Keep your eyes on the tower.',0,'You walk toward the ladder. Whatever is behind you matches your pace again.'),
      choice('listen','Wait without turning.',-2,'The mud settles. Water drains into a footprint beside your boot. You wait until your hands stop shaking.','listened'),
      choice('turn','Turn the light behind you.',4,'Only a bent stalk. It straightens very slowly, as though someone has just let go of it.','looked-back')
    ]},
  {id:'second-call',night:1,step:3,art:'radio',title:'It remembers the conversation.',
    text:s=>has(s,'answered-radio')?'The radio is in the same furrow. It repeats the question you asked last time, in your voice: “Where am I?” This time another voice answers from inside the corn.':'The radio is waiting in a dry furrow. It plays the sound of your boots leaving it behind. Then you hear those boots coming back.',
    report:'The field radio played sounds from my previous investigation.',choices:[
      choice('disconnect','Disconnect the loose microphone.',0,'You unplug the microphone. The walking continues through the empty connector.'),
      choice('mislead','Give it a false direction.',3,'You tell it you are heading west. A whole row bends westward. You go the other way.','false-direction'),
      choice('compare','Play your first recording beside it.',-3,'The two voices cancel into a thin whistle. For a few seconds the field sounds like an ordinary field. You use the silence to get your bearings.','verified-voice','recording')
    ]},
  {id:'moved-crossing',night:1,step:9,art:'tracks',title:'The crossing has moved.',
    text:s=>has(s,'twine')?'Your twine hangs from a stalk at the crossing. The knot is yours. But this crossing should be two rows farther west. The cut end of the twine is growing pale roots.':'Your map shows one crossing. Your light finds two. Both have your boot prints leading into them; neither has prints coming out.',
    report:'The crossings did not match the survey map, although my tracks led into both of them.',choices:[
      choice('map','Use the tower light as your bearing.',0,'You pick out the tower through the stalks. It takes a while to find a line that holds still.'),
      choice('ribbon','Try the narrower opening.',4,'You push through and come out beside the same broken stalk. Mud on your sleeve is still warm.','looped'),
      choice('compass','Trust the compass from the tin.',-4,'The needle holds steady while the two openings trade places. You follow north until the path and the map agree again.','found-bearing','compass')
    ]},
  {id:'lamp-keeper',night:1,step:16,art:'lantern',title:'Someone behind the lamp.',
    text:'A figure stands beyond the hanging lantern. Its boots are sunk into the soil. “Relief,” it says. The word comes from the stalk beside its head.',
    report:'A figure beside a lantern said it was my relief. The voice came from a corn stalk.',choices:[
      choice('back','Back away with the light held steady.',0,'The figure does not follow. Its shadow reaches the crossing before you do.'),
      choice('ask','Ask who sent the relief.',4,'It gives your name. Then the name of the person who trained you. You have never spoken that name here.','named'),
      choice('hand','Offer a hand to pull it free.',7,'Something cold closes around your fingers. The boots stay in the soil. When you let go, your palm smells of wet grain.','touched')
    ]},
  {id:'two-towers',night:1,step:23,art:'lantern',title:'Two lights above the rows.',
    text:'Two tower lights show through the crop. From one comes the radio call you expected. From the other comes the sound of someone climbing your ladder.',
    report:'On my return I saw two tower lights and heard someone climbing an unseen ladder.',choices:[
      choice('visible','Use the visible ladder to get your bearings.',0,'One light goes out. The other is still attached to the tower. You hold on to that direction and keep walking.'),
      choice('other','Take a few steps toward the second light.',5,'The ladder sounds stop. High in the crop, something knocks twice against wood that is not there.','second-tower'),
      choice('listen','Extinguish your light and listen.',-2,'In darkness, you can hear the real tower cable tapping its post. You have heard it every shift. You follow that familiar sound.','listened')
    ]},
  {id:'future-call',night:2,step:3,art:'radio',title:'Tomorrow’s interview.',
    text:s=>has(s,'false-direction')?'The radio describes a search party going west. Then your supervisor asks what you saw tonight. A voice like yours begins to answer before you have reached the first landmark.':'The radio clicks into a recording of the interview room. Your supervisor asks what you saw tonight. A voice like yours answers, “Nothing outside the expected growth pattern.”',
    report:'Before the investigation was finished, the radio played a debrief about this same night.',choices:[
      choice('stop','Break off the transmission.',0,'The tape sound stops. For a moment, you can still hear the supervisor breathing.'),
      choice('record','Record the interview that has not happened.',4,'You keep the sound. On playback, the other you asks why the door is locked.','future-recording'),
      choice('compare','Compare it with the first night’s tape.',-3,'Under both recordings is the same small click. The sound of your thumb releasing the switch, a second before you release it. You keep your hand away from the radio.','verified-future','recording')
    ]},
  {id:'root-knot',night:2,step:9,art:'tracks',title:'The path has a pulse.',
    text:'Pale roots cross the furrow where the boot prints used to be. The smallest threads tighten, then loosen. They have wound themselves around the shape of an empty shoe.',
    report:'Roots across the path tightened around the shape of an empty shoe.',choices:[
      choice('around','Step around without touching the roots.',0,'The threads loosen as your shadow passes over them. You keep walking.'),
      choice('lift','Lift the knot with a fallen stalk.',5,'The empty shape holds together. Beneath it is a print from the sole of your own boot.','lifted-roots'),
      choice('twine','Lay your survey twine across the knot.',-3,'The root tips follow the twine away from your boots. You leave it stretched across the furrow and take the clear ground.','led-roots','twine')
    ]},
  {id:'your-outline',night:2,step:16,art:'lantern',title:'Your coat. Your height.',
    text:s=>has(s,'touched')?'The figure behind the lantern holds up a hand. Your palm aches in exactly the place it touched last time. It is wearing your coat now.':'Your own outline stands beyond the lantern, facing away. A pale repair on its sleeve matches the repair on yours. Its shoulders rise when you breathe.',
    report:'A figure in the field wore a coat with the same repair as mine and moved with my breathing.',choices:[
      choice('ground','Keep the beam on the ground and pass.',0,'You watch your boots until the lantern is behind you. There are only two feet in the light.'),
      choice('name','Call your own name.',4,'The outline turns its head a little too far. From behind you, your voice says, “Here.”','called-name'),
      choice('stand','Stand beside the outline.',7,'For one breath, you cannot tell which shadow is yours. You step away. One of the shadows stays.','stood-beside')
    ]},
  {id:'last-follower',night:2,step:23,art:'radio',title:'Something wants to come back.',
    text:s=>has(s,'looked-back')?'The stalks behind you lean into the shape you saw on the first night. Your radio says, very quietly, “Hold the door.”':'As the tower comes into view, your radio speaks without static. “Hold the door.” Behind you, the dry leaves start moving against the wind.',
    report:'Near the tower, the radio asked me to hold the door while the crop moved toward me.',choices:[
      choice('climb','Keep walking without answering.',0,'You keep both hands free and your eyes on the next crossing. The radio repeats the request in a more familiar voice.'),
      choice('leave','Leave the radio beside the path.',-3,'The voice stays with the set. You walk on in silence, carrying only what you chose to write down.','left-radio'),
      choice('reply','Tell it there is room for one more.',6,'The stalks stop moving. Something beside your boot exhales. You cannot hear it following you anymore.','invited')
    ]}
];
export const encounterById=id=>ENCOUNTERS.find(e=>e.id===id);
export function freshFieldEvents(){return {seen:[],journal:[],flags:[],pending:null,journey:null};}
export function encounterAfterStep(s) {
  const events=s.fieldEvents;
  if(s.phase!=='field'||events.pending)return false;
  const event=ENCOUNTERS.find(e=>e.night===s.shift&&e.step<=s.fieldSteps&&!events.seen.includes(e.id));
  if(!event)return false;
  events.seen.push(event.id);events.pending={id:event.id,choice:null,x:s.player.x,y:s.player.y};return true;
}
export function currentEncounter(s) {
  const pending=s.fieldEvents?.pending,event=pending&&encounterById(pending.id);
  if(!event)return null;
  return {...event,text:typeof event.text==='function'?event.text(s):event.text,choices:event.choices.filter(c=>!c.requires||has(s,c.requires))};
}
export function resolveEncounter(s,id) {
  if(s.phase!=='field'||!s.fieldEvents?.pending||s.fieldEvents.pending.choice)return false;
  const event=currentEncounter(s),option=event.choices.find(c=>c.id===id);
  if(!option)return false;
  const before=s.exposure;s.exposure=Math.max(0,Math.min(100,s.exposure+option.delta));
  if(option.flag&&!has(s,option.flag))s.fieldEvents.flags.push(option.flag);
  s.fieldEvents.pending.choice=id;
  s.fieldEvents.journal.push({id:event.id,choice:id,delta:s.exposure-before,x:s.player.x,y:s.player.y});
  return true;
}
export function dismissEncounter(s) {
  if(s.phase!=='field'||!s.fieldEvents?.pending?.choice)return false;
  s.fieldEvents.pending=null;return true;
}
export function migrateFieldEvents(s) {
  if(s.fieldEvents!==undefined)return;
  s.fieldEvents=freshFieldEvents();
  // Do not dump already-passed encounters onto a player resuming an older build.
  s.fieldEvents.seen=ENCOUNTERS.filter(e=>e.night<s.shift||(e.night===s.shift&&e.step<=s.fieldSteps)).map(e=>e.id);
}
export function validFieldEvents(s) {
  const f=s.fieldEvents,known=ENCOUNTERS.map(e=>e.id),flags=ENCOUNTERS.flatMap(e=>e.choices.map(c=>c.flag).filter(Boolean));
  const uniqueKnown=(items,allowed,max)=>Array.isArray(items)&&items.length<=max&&new Set(items).size===items.length&&items.every(i=>allowed.includes(i));
  const point=p=>Number.isInteger(p.x)&&p.x>=0&&p.x<=10&&Number.isInteger(p.y)&&p.y>=0&&p.y<=8;
  if(!f||!uniqueKnown(f.seen,known,12)||!uniqueKnown(f.flags,flags,36)||!Array.isArray(f.journal)||f.journal.length>12)return false;
  if(new Set(f.journal.map(j=>j?.id)).size!==f.journal.length)return false;
  if(!f.journal.every(j=>j&&f.seen.includes(j.id)&&encounterById(j.id)?.choices.some(c=>c.id===j.choice)&&Number.isFinite(j.delta)&&j.delta>=-4&&j.delta<=7&&point(j)))return false;
  if(f.pending){
    const p=f.pending,e=encounterById(p.id),record=f.journal.find(j=>j.id===p.id);
    if(!e||s.phase!=='field'||e.night!==s.shift||!f.seen.includes(e.id)||!point(p)||p.x!==s.player.x||p.y!==s.player.y||!(p.choice===null||e.choices.some(c=>c.id===p.choice)))return false;
    if(p.choice===null?Boolean(record):!record||record.choice!==p.choice)return false;
  }
  if(f.journey&&(!['corner','pump','drain','tower'].includes(f.journey.destination)||!['quiet','direct'].includes(f.journey.style)))return false;
  return true;
}
