// Pose library. Each reference figure is generated from bone angles, so the same numbers
// drive the drawn reference and the Pose Match comparison (no stock photos, works offline).
// Angle convention: 0° = bone points straight down, +90° = toward image right, 180° = up.
// "l" = the person's LEFT side, which appears on the IMAGE RIGHT when they face the camera.

export type Fig = {
  x?: number; // horizontal offset in figure units (multi-person)
  s?: number; // scale
  torso?: number;
  head?: number;
  lUA: number; lFA: number; rUA: number; rFA: number;
  lTh: number; lSh: number; rTh: number; rSh: number;
};

export type Pose = {
  id: string;
  name: string;
  categories: string[];
  level: "Easy" | "Medium" | "Advanced";
  figures: Fig[];
  instructions: string[];
  cameraAngle: string;
  framing: string;
  tip: string;
  pack?: string;
  premium?: boolean;
};

export const PACKS = ["Bridal", "Haldi", "Sangeet", "Festival"];

export const CATEGORIES = [
  "Solo", "Couple", "Friends", "Group", "Family", "Wedding", ...PACKS, "Fashion", "Traditional",
  "Casual", "Portrait", "Outdoor", "Indoor", "Sitting", "Standing",
];

const STAND = { lUA: 8, lFA: 4, rUA: -8, rFA: -4, lTh: 4, lSh: 0, rTh: -4, rSh: 0 };

export const POSES: Pose[] = [
  {
    id: "classic-hand-hip", name: "Classic Hand on Hip", categories: ["Solo", "Standing", "Fashion", "Portrait"], level: "Easy",
    figures: [{ ...STAND, lUA: 38, lFA: -55, rTh: -2, lTh: 8 }],
    instructions: ["Place your left hand on your hip, elbow pointing out.", "Let the right arm hang relaxed.", "Shift weight to your back leg.", "Chin slightly down, eyes to the lens."],
    cameraAngle: "Chest height, straight on", framing: "Full body, 3:4 or 4:5", tip: "A gap between arm and waist slims the silhouette.",
  },
  {
    id: "power-stance", name: "Power Stance", categories: ["Solo", "Standing", "Fashion", "Outdoor"], level: "Easy",
    figures: [{ ...STAND, lUA: 30, lFA: -50, rUA: -30, rFA: 50, lTh: 14, rTh: -14, lSh: 10, rSh: -10 }],
    instructions: ["Feet wider than shoulders.", "Both hands on hips.", "Shoulders back and relaxed.", "Strong, direct gaze."],
    cameraAngle: "Low angle, waist height, tilt up slightly", framing: "Full body with ground visible", tip: "Shooting from lower makes the subject look taller and confident.",
  },
  {
    id: "wave-hello", name: "Joyful Wave", categories: ["Solo", "Casual", "Outdoor", "Standing"], level: "Easy",
    figures: [{ ...STAND, rUA: -115, rFA: -170 }],
    instructions: ["Raise your right hand beside your head.", "Open palm toward the camera.", "Big natural smile.", "Keep the other arm relaxed."],
    cameraAngle: "Eye level", framing: "Knees up (3/4 shot)", tip: "Shoot in burst mode to catch the most natural moment.",
  },
  {
    id: "arms-up-freedom", name: "Arms Up Freedom", categories: ["Solo", "Outdoor", "Casual", "Standing"], level: "Easy",
    figures: [{ ...STAND, lUA: 150, lFA: 160, rUA: -150, rFA: -160 }],
    instructions: ["Raise both arms in a wide V.", "Look up toward the sky.", "Keep legs straight and together.", "Breathe out as the photo is taken."],
    cameraAngle: "Low angle from behind or front", framing: "Full body, leave sky above", tip: "Great for beaches, hilltops and sunsets.",
  },
  {
    id: "hair-touch", name: "Hair Touch Portrait", categories: ["Solo", "Portrait", "Fashion", "Indoor"], level: "Medium",
    figures: [{ ...STAND, head: -8, lUA: 150, lFA: -110, rUA: -6 }],
    instructions: ["Lift your left hand and lightly touch your hair.", "Tilt your head gently toward the raised arm.", "Soft eyes, relaxed lips.", "Keep the shoulder down, not hunched."],
    cameraAngle: "Slightly above eye level", framing: "Waist up, 4:5", tip: "Touch lightly — no gripping — so the hand looks elegant.",
  },
  {
    id: "lean-casual", name: "Casual Lean", categories: ["Solo", "Casual", "Standing", "Outdoor"], level: "Easy",
    figures: [{ ...STAND, torso: 170, lUA: 20, lFA: 10, rUA: -40, rFA: -15, lTh: 10, rTh: 14, rSh: -10 }],
    instructions: ["Lean your shoulder against a wall or pole.", "Cross one ankle over the other.", "Hands relaxed or in pockets.", "Look slightly away from the lens."],
    cameraAngle: "Eye level, slightly to the side", framing: "Full body, include the wall", tip: "Leaning creates natural diagonals that feel relaxed.",
  },
  {
    id: "crossed-arms", name: "Confident Crossed Arms", categories: ["Solo", "Portrait", "Standing", "Indoor"], level: "Easy",
    figures: [{ ...STAND, lUA: 20, lFA: -80, rUA: -20, rFA: 80 }],
    instructions: ["Fold your arms loosely across your chest.", "Don't squeeze — keep it relaxed.", "Turn the body slightly, face to the lens.", "Half smile."],
    cameraAngle: "Eye level", framing: "Waist up", tip: "Classic for professional and LinkedIn portraits.",
  },
  {
    id: "walking-candid", name: "Walking Candid", categories: ["Solo", "Casual", "Outdoor", "Fashion", "Standing"], level: "Medium",
    figures: [{ ...STAND, lUA: -18, lFA: -10, rUA: 20, rFA: 12, lTh: 18, lSh: 8, rTh: -16, rSh: -30 }],
    instructions: ["Walk slowly toward the camera.", "Swing your arms naturally.", "Look down or to the side.", "Repeat several times while the photographer bursts."],
    cameraAngle: "Waist height, straight on", framing: "Full body with space ahead", tip: "Use burst/timer so you catch mid-stride.",
  },
  {
    id: "seated-chair", name: "Relaxed Chair Sit", categories: ["Solo", "Sitting", "Indoor", "Portrait"], level: "Easy",
    figures: [{ ...STAND, lUA: 12, lFA: 70, rUA: -12, rFA: -70, lTh: 80, lSh: 5, rTh: -80, rSh: -5 }],
    instructions: ["Sit on the front half of the chair.", "Knees apart slightly, feet flat.", "Rest hands on your thighs.", "Sit tall, lean slightly forward."],
    cameraAngle: "Chest height of the seated person", framing: "Full body including the chair", tip: "Leaning slightly forward looks more engaged.",
  },
  {
    id: "floor-sit-knee", name: "Hug the Knee", categories: ["Solo", "Sitting", "Outdoor", "Casual"], level: "Medium",
    figures: [{ ...STAND, lUA: 25, lFA: -60, rUA: -10, rFA: 40, lTh: 150, lSh: 10, rTh: -85, rSh: -15 }],
    instructions: ["Sit on the floor or grass.", "Bend one knee up and wrap your arm around it.", "Other leg relaxed and bent.", "Rest your chin or look into the distance."],
    cameraAngle: "Low, at the subject's eye level", framing: "Full body, a little ground in front", tip: "Shooting at their level keeps it intimate.",
  },
  {
    id: "steps-sit", name: "Steps Sit", categories: ["Solo", "Sitting", "Outdoor", "Fashion"], level: "Easy",
    figures: [{ ...STAND, lUA: 30, lFA: 60, rUA: -30, rFA: -60, lTh: 95, lSh: 0, rTh: -70, rSh: -10 }],
    instructions: ["Sit on a step, one foot lower than the other.", "Rest forearms on knees.", "Shoulders relaxed and open.", "Look at the lens with a soft smile."],
    cameraAngle: "Slightly below eye level", framing: "Full body including steps", tip: "Different foot heights add depth.",
  },
  {
    id: "couple-side-hug", name: "Couple Side Hug", categories: ["Couple", "Standing", "Outdoor", "Casual"], level: "Easy",
    figures: [
      { ...STAND, x: -0.17, lUA: 45, lFA: 100, torso: 175 },
      { ...STAND, x: 0.17, rUA: -45, rFA: -100, torso: 185 },
    ],
    instructions: ["Stand side by side, hips touching.", "Wrap your inner arms around each other's waist.", "Lean heads slightly toward each other.", "Outer arms relaxed."],
    cameraAngle: "Eye level", framing: "Knees up, centred", tip: "Ask them to whisper something funny for genuine smiles.",
  },
  {
    id: "couple-forehead", name: "Forehead Touch", categories: ["Couple", "Wedding", "Portrait"], level: "Medium",
    figures: [
      { ...STAND, x: -0.12, torso: 168, head: 20, lUA: 70, lFA: 110 },
      { ...STAND, x: 0.12, torso: 192, head: -20, rUA: -70, rFA: -110 },
    ],
    instructions: ["Face each other, close.", "Gently touch foreheads.", "Hands on each other's waist or arms.", "Eyes closed, breathe slowly."],
    cameraAngle: "Eye level, side-on", framing: "Waist up, 4:5", tip: "Backlight (sunset behind them) gives a romantic glow.",
  },
  {
    id: "couple-walk-hands", name: "Hand-in-Hand Walk", categories: ["Couple", "Outdoor", "Wedding", "Casual"], level: "Easy",
    figures: [
      { ...STAND, x: -0.17, lUA: 30, lFA: 25, lTh: 16, rTh: -14, rSh: -20 },
      { ...STAND, x: 0.17, rUA: -30, rFA: -25, lTh: 14, rTh: -16, lSh: 20 },
    ],
    instructions: ["Hold hands and walk slowly.", "Look at each other, not the camera.", "Take relaxed, matching steps.", "Walk the same path a few times."],
    cameraAngle: "Waist height in front", framing: "Full body, wide", tip: "Shoot from behind too for a story-telling frame.",
  },
  {
    id: "couple-back-hug", name: "Back Hug", categories: ["Couple", "Wedding", "Standing", "Portrait"], level: "Medium",
    figures: [
      { ...STAND, x: 0, lUA: 25, lFA: -70, rUA: -25, rFA: 70 },
      { ...STAND, x: 0.06, s: 1.08, lUA: 35, lFA: -85, rUA: -35, rFA: 85 },
    ],
    instructions: ["Partner stands behind and wraps arms around the waist.", "Front person holds the arms.", "Rest chin on the partner's shoulder.", "Both look to the camera or at each other."],
    cameraAngle: "Eye level", framing: "Waist up", tip: "Taller partner behind keeps both faces visible.",
  },
  {
    id: "friends-row", name: "Friends Shoulder Row", categories: ["Friends", "Group", "Standing", "Outdoor"], level: "Easy",
    figures: [
      { ...STAND, x: -0.36, lUA: 80, lFA: 95 },
      { ...STAND, x: 0, lUA: 80, lFA: 95, rUA: -80, rFA: -95 },
      { ...STAND, x: 0.36, rUA: -80, rFA: -95 },
    ],
    instructions: ["Stand in a line, shoulder to shoulder.", "Put arms around each other's shoulders.", "Taller friends at the ends.", "Laugh together on 3."],
    cameraAngle: "Chest height", framing: "Full body or knees up, wide", tip: "Use the timer and burst so nobody blinks.",
  },
  {
    id: "friends-jump", name: "Jump Shot", categories: ["Friends", "Group", "Outdoor", "Casual"], level: "Advanced",
    figures: [
      { ...STAND, x: -0.36, lUA: 150, lFA: 165, rUA: -150, rFA: -165, lTh: 40, lSh: -30, rTh: -40, rSh: 30 },
      { ...STAND, x: 0, lUA: 160, lFA: 170, rUA: -160, rFA: -170, lTh: 30, lSh: -40, rTh: -30, rSh: 40 },
      { ...STAND, x: 0.36, lUA: 140, lFA: 160, rUA: -140, rFA: -160, lTh: 45, lSh: -25, rTh: -45, rSh: 25 },
    ],
    instructions: ["Count down together and jump at the same time.", "Arms up wide, knees bent back.", "Keep faces toward the camera.", "Repeat — it takes a few tries."],
    cameraAngle: "Very low, near the ground", framing: "Full body with lots of sky", tip: "Low angle makes jumps look higher.",
  },
  {
    id: "group-tiered", name: "Tiered Group", categories: ["Group", "Wedding", "Traditional", "Standing"], level: "Medium",
    figures: [
      { ...STAND, x: -0.36, s: 0.92 },
      { ...STAND, x: 0, s: 0.92, lUA: 20, lFA: -60, rUA: -20, rFA: 60 },
      { ...STAND, x: 0.36, s: 0.92 },
    ],
    instructions: ["Tallest in the back, shortest in front.", "Stagger heads so every face is visible.", "Everyone turns slightly toward the centre.", "Hands relaxed, no hiding behind others."],
    cameraAngle: "Slightly above eye level", framing: "Full group with space on both sides", tip: "If you can see the camera, the camera can see you.",
  },
  {
    id: "wedding-veil", name: "Bridal Veil Lift", categories: ["Wedding", "Solo", "Traditional", "Portrait"], level: "Medium",
    figures: [{ ...STAND, head: -6, lUA: 140, lFA: -150, rUA: -140, rFA: 150 }],
    instructions: ["Lift the veil/dupatta edges with both hands above the head.", "Look down softly, then up to the lens.", "Shoulders relaxed.", "Let fabric frame the face."],
    cameraAngle: "Eye level or slightly above", framing: "Waist up", tip: "A light breeze or a helper tossing the fabric adds magic.",
  },
  {
    id: "namaste-traditional", name: "Graceful Namaste", categories: ["Traditional", "Solo", "Portrait", "Wedding"], level: "Easy",
    figures: [{ ...STAND, lUA: 30, lFA: -150, rUA: -30, rFA: 150 }],
    instructions: ["Join palms in front of the chest.", "Elbows relaxed, slightly out.", "Gentle smile, chin a little down.", "Stand tall with feet together."],
    cameraAngle: "Eye level", framing: "Waist up or full outfit", tip: "Perfect for festive and ethnic wear.",
  },
  {
    id: "dupatta-twirl", name: "Lehenga Twirl", categories: ["Traditional", "Wedding", "Fashion", "Outdoor"], level: "Advanced",
    figures: [{ ...STAND, lUA: 110, lFA: 120, rUA: -60, rFA: -40, lTh: 12, rTh: -12 }],
    instructions: ["Hold one side of the skirt/dupatta out.", "Turn slowly in a circle.", "Look over your shoulder at the lens.", "Shoot in burst while turning."],
    cameraAngle: "Waist height", framing: "Full body, wide", tip: "A slower shutter (or burst) shows the flow of fabric.",
  },
  {
    id: "fashion-over-shoulder", name: "Over-the-Shoulder Look", categories: ["Fashion", "Solo", "Portrait", "Standing"], level: "Medium",
    figures: [{ ...STAND, torso: 185, head: 15, lUA: 4, rUA: -4, lTh: 6, rTh: -2 }],
    instructions: ["Turn your back three-quarters to the camera.", "Look back over your shoulder.", "Drop that shoulder slightly.", "Keep the chin close to the shoulder."],
    cameraAngle: "Eye level from behind", framing: "Waist up", tip: "Great to show hairstyles and backless outfits.",
  },
  {
    id: "fashion-pocket", name: "Pocket Cool", categories: ["Fashion", "Casual", "Standing", "Solo"], level: "Easy",
    figures: [{ ...STAND, lUA: 22, lFA: -20, rUA: -22, rFA: 20, lTh: 10, lSh: -6, rTh: -4 }],
    instructions: ["Put thumbs or hands in front pockets.", "Bend one knee, weight on the back leg.", "Relax your shoulders.", "Look off to the side."],
    cameraAngle: "Low, hip height", framing: "Full body", tip: "Bending one knee breaks the stiff 'soldier' look.",
  },
  {
    id: "portrait-chin-rest", name: "Chin Rest Portrait", categories: ["Portrait", "Indoor", "Sitting", "Solo"], level: "Easy",
    figures: [{ ...STAND, head: -5, lUA: 20, lFA: 175, rUA: -15, rFA: 70, lTh: 80, lSh: 0, rTh: -80, rSh: 0 }],
    instructions: ["Sit at a table, elbow on the surface.", "Rest your chin lightly on your hand.", "Don't press — keep the face shape natural.", "Look directly at the lens."],
    cameraAngle: "Eye level, close", framing: "Head and shoulders, 4:5", tip: "Window light from the side gives soft shadows.",
  },
  {
    id: "indoor-window", name: "Window Light Gaze", categories: ["Indoor", "Portrait", "Solo", "Standing"], level: "Easy",
    figures: [{ ...STAND, head: 12, torso: 178, lUA: 60, lFA: 140 }],
    instructions: ["Stand close to a window, side-on.", "Rest a hand on the window frame.", "Look out of the window.", "Keep the face toward the light."],
    cameraAngle: "Eye level, from the room side", framing: "Waist up", tip: "Turn off room lights to avoid mixed colours.",
  },
];

const W = (p: Omit<Pose, "premium">): Pose => ({ ...p, premium: true });

// Premium wedding & festival packs (couples and families).
POSES.push(
  W({ id: "bridal-mehendi-hands", pack: "Bridal", name: "Mehendi Hands Frame", categories: ["Bridal", "Wedding", "Solo", "Portrait", "Traditional"], level: "Easy",
    figures: [{ ...STAND, head: -6, lUA: 25, lFA: -165, rUA: -25, rFA: 165 }],
    instructions: ["Raise both hands to chin height, palms facing the camera.", "Overlap fingertips lightly so both mehendi designs show.", "Look down at your hands, then slowly lift your eyes to the lens.", "Keep elbows soft and close to the body."],
    cameraAngle: "Slightly above eye level", framing: "Chest up, 4:5", tip: "Side window light makes mehendi colour pop without glare." }),
  W({ id: "bridal-dupatta-walk", pack: "Bridal", name: "Bridal Dupatta Walk", categories: ["Bridal", "Wedding", "Solo", "Outdoor", "Standing"], level: "Medium",
    figures: [{ ...STAND, lUA: 60, lFA: 30, rUA: -18, rFA: -10, lTh: 16, lSh: 6, rTh: -14, rSh: -22 }],
    instructions: ["Hold the end of your dupatta out to one side.", "Walk slowly toward the camera in small steps.", "Let the lehenga flow — don't hold it tight.", "Soft smile, look slightly away."],
    cameraAngle: "Waist height, straight on", framing: "Full body with the outfit trail", tip: "Ask a helper to lift the dupatta just before each step." }),
  W({ id: "bridal-mirror-glance", pack: "Bridal", name: "Getting-Ready Glance", categories: ["Bridal", "Wedding", "Indoor", "Sitting", "Portrait"], level: "Easy",
    figures: [{ ...STAND, head: 14, lUA: 140, lFA: -120, rUA: -15, rFA: 60, lTh: 80, lSh: 0, rTh: -80, rSh: 0 }],
    instructions: ["Sit beside a mirror or window.", "Adjust an earring or maang tikka with one hand.", "Turn your face three-quarters toward the camera.", "Shoulders relaxed and down."],
    cameraAngle: "Eye level, close", framing: "Head and shoulders", tip: "Candid getting-ready frames look best with burst mode." }),
  W({ id: "haldi-laugh-splash", pack: "Haldi", name: "Haldi Laughter", categories: ["Haldi", "Wedding", "Solo", "Sitting", "Traditional"], level: "Easy",
    figures: [{ ...STAND, head: -10, lUA: 60, lFA: 160, rUA: -40, rFA: -100, lTh: 80, lSh: 5, rTh: -80, rSh: -5 }],
    instructions: ["Sit on the low stool (patla) facing the camera.", "Raise one hand to shield your face playfully.", "Laugh and lean back slightly as haldi is applied.", "Keep eyes open between laughs."],
    cameraAngle: "Low, at seated eye level", framing: "Waist up", tip: "Shoot with the sun behind you so yellow tones glow." }),
  W({ id: "haldi-couple-cheeks", pack: "Haldi", name: "Couple Haldi Cheek Touch", categories: ["Haldi", "Couple", "Wedding", "Standing"], level: "Medium",
    figures: [
      { ...STAND, x: -0.14, torso: 172, head: 12, lUA: 70, lFA: 140 },
      { ...STAND, x: 0.14, torso: 188, head: -12, rUA: -50, rFA: -90 },
    ],
    instructions: ["Stand side by side facing each other at an angle.", "One partner gently applies haldi to the other's cheek.", "Both laugh — look at each other, not the lens.", "Keep the free arms relaxed."],
    cameraAngle: "Eye level, 45° to the couple", framing: "Waist up", tip: "A marigold backdrop makes yellow and orange tones rich." }),
  W({ id: "haldi-family-circle", pack: "Haldi", name: "Family Haldi Circle", categories: ["Haldi", "Family", "Group", "Wedding"], level: "Medium",
    figures: [
      { ...STAND, x: -0.38, s: 0.9, torso: 170, lUA: 70, lFA: 100 },
      { ...STAND, x: 0, lUA: 25, lFA: -150, rUA: -25, rFA: 150, lTh: 80, lSh: 0, rTh: -80, rSh: 0 },
      { ...STAND, x: 0.38, s: 0.9, torso: 190, rUA: -70, rFA: -100 },
    ],
    instructions: ["Bride or groom sits in the centre.", "Family members stand around and reach in to apply haldi.", "Everyone leans in toward the centre.", "Count to 3 and everyone laughs."],
    cameraAngle: "Slightly above, from the front", framing: "Wide, include everyone's hands", tip: "Step on a chair for a clean top-down group frame." }),
  W({ id: "sangeet-twirl-couple", pack: "Sangeet", name: "Sangeet Couple Twirl", categories: ["Sangeet", "Couple", "Wedding", "Indoor", "Standing"], level: "Advanced",
    figures: [
      { ...STAND, x: -0.15, lUA: 150, lFA: 170, lTh: 10, rTh: -8 },
      { ...STAND, x: 0.15, rUA: -150, rFA: -170, lUA: 40, lFA: 20, lTh: 14, rTh: -14 },
    ],
    instructions: ["Hold hands raised high between you.", "One partner twirls under the raised arms.", "Keep the other hand out for balance.", "Smile at each other mid-turn."],
    cameraAngle: "Waist height", framing: "Full body, wide", tip: "Burst mode during the twirl; stage lights add sparkle." }),
  W({ id: "sangeet-dance-pose", pack: "Sangeet", name: "Bollywood Dance Pose", categories: ["Sangeet", "Solo", "Wedding", "Fashion", "Standing"], level: "Medium",
    figures: [{ ...STAND, torso: 172, lUA: 140, lFA: 175, rUA: -100, rFA: -80, lTh: 6, rTh: -20, rSh: 15 }],
    instructions: ["Raise one arm overhead with a soft wrist.", "Other arm out to the side at shoulder height.", "Pop one hip and point the opposite foot.", "Big expressive smile."],
    cameraAngle: "Low, waist height", framing: "Full body", tip: "Slight low angle makes dance poses look dramatic." }),
  W({ id: "sangeet-friends-group", pack: "Sangeet", name: "Sangeet Squad", categories: ["Sangeet", "Friends", "Group", "Wedding"], level: "Easy",
    figures: [
      { ...STAND, x: -0.38, lUA: 150, lFA: 165 },
      { ...STAND, x: 0, lUA: 150, lFA: 165, rUA: -150, rFA: -165 },
      { ...STAND, x: 0.38, rUA: -150, rFA: -165 },
    ],
    instructions: ["Line up close together.", "Raise inner arms in the air together.", "Cheer on 3 — mouths open, eyes bright.", "Outer arms around each other's waists."],
    cameraAngle: "Chest height", framing: "Knees up, wide", tip: "Use flash at night events to freeze the moment." }),
  W({ id: "festival-diya", pack: "Festival", name: "Diwali Diya Glow", categories: ["Festival", "Solo", "Traditional", "Sitting", "Portrait"], level: "Easy",
    figures: [{ ...STAND, head: -8, lUA: 20, lFA: -120, rUA: -20, rFA: 120, lTh: 80, lSh: 5, rTh: -80, rSh: -5 }],
    instructions: ["Sit and hold a diya in both hands at chest height.", "Let the flame light your face from below.", "Look down at the flame, then softly up.", "Turn off nearby room lights."],
    cameraAngle: "Eye level, close", framing: "Chest up", tip: "Tap to focus on the eyes; keep phone steady in low light." }),
  W({ id: "festival-holi-colours", pack: "Festival", name: "Holi Colour Throw", categories: ["Festival", "Solo", "Outdoor", "Casual", "Standing"], level: "Medium",
    figures: [{ ...STAND, lUA: 160, lFA: 170, rUA: -120, rFA: -150, lTh: 12, rTh: -12 }],
    instructions: ["Hold gulal in raised hands.", "Throw it up and slightly forward.", "Look up into the colour cloud.", "Protect the phone — shoot from a few steps away."],
    cameraAngle: "Low, slightly from the side", framing: "Full body with sky", tip: "Back-lit sun makes the colour cloud glow." }),
  W({ id: "festival-family-portrait", pack: "Festival", name: "Festive Family Portrait", categories: ["Festival", "Family", "Group", "Traditional", "Standing"], level: "Easy",
    figures: [
      { ...STAND, x: -0.4, s: 1.05 },
      { ...STAND, x: -0.13, s: 0.75 },
      { ...STAND, x: 0.13, s: 0.7 },
      { ...STAND, x: 0.4, s: 1.0, lUA: 20, lFA: -60 },
    ],
    instructions: ["Parents at the ends, children in the middle.", "Everyone turns slightly toward the centre.", "Kids stand in front so faces don't overlap.", "Hands resting on shoulders in front."],
    cameraAngle: "Chest height of the adults", framing: "Full body, wide", tip: "Use the timer with the phone on a stable surface." }),
);

export function poseById(id?: string | null) {
  return POSES.find((p) => p.id === id);
}
