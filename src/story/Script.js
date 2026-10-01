// The words of the first night (docs/PLAN.md §3): the cards, the things you read, the Watcher's
// messages and your answers. Fiction on a real record: the keepers lost in December 1900 appear only
// through what the record says (§2.7); Walter Innes and Ceit Macleod are invented.

export const TITLE = 'Seven Hunters';

export const DAY = {
	date: 'Thursday, 3rd January 1901',
	place: 'Eilean Mòr, the Flannan Isles',
};

// the crossing, before the first card
export const PROLOGUE = [
	'The Hesperus could not lie off the east landing for long in that swell.',
	'They got you up onto the stage with a bag and a crate of stores, and then the sea came up the geo and the coxswain took her out again. The other two men were still aboard.',
	'"Keep her lit," he shouted. "We\'ll be back within the fortnight."',
	'The light has to be lit at sunset. The station is at the top of the steps.',
];

// objectives, by beat
export const GOALS = {
	climb: 'Go up the steps to the light station.',
	room: 'Find the keepers\' room: the door in the east side of the house.',
	letter: 'Read the Board\'s letter on the desk.',
	light: 'Light the lamp at sunset. The tower door is in the corner of the keepers\' room.',
	machine: 'Wind the machine that turns the lens.',
	watch: 'Keep the watch. Gallan Head should show a light after dark.',
	gallan: 'Gallan Head is showing a light. Take the telescope, then the signal lamp on the walkway.',
	answer: 'Answer Gallan Head with the signal lamp on the walkway.',
	obs: 'Chalk the six o\'clock observations on the slate in the keepers\' room.',
	bell: 'The machine is running down. Wind it.',
	haar: 'Keep the watch.',
	gate: 'See to the gate.',
	night: 'Keep the watch until dawn.',
	dawn: 'Put the lamp out at sunrise.',
	journal: 'Write up the journal at the desk.',
};

export const SUNSET = 15.15; // local solar time on the day (Setting.js: 15:09)
export const SUNRISE = 8.9;

// the Board's letter of instructions, on the desk (the instructions are fiction; the Board, its office and
// the station's routine are real)
export const LETTER = {
	title: 'Northern Lighthouse Board, 84 George Street, Edinburgh',
	body: [
		'31st December 1900',
		'To the Assistant Keeper, Flannan Islands.',
		'Until the arrival of the Principal Keeper you will take sole charge of the light, and you will keep it in accordance with the General Instructions.',
		'The light is to be exhibited from sunset to sunrise without interruption. The lamp is to be lit at sunset precisely and the machine set going. The machine is to be wound before its weight reaches the foot of the tube: a bell will warn you of it.',
		'Observations of the barometer, the wind, the sea and the visibility are to be entered on the slate at six in the evening and at the hours prescribed, and copied fair into the journal in the morning, with the times of lighting and extinguishing.',
		'The observer at Gallan Head on Lewis watches the light nightly and will signal if conditions allow. The Board\'s code of signals is in the drawer of the lantern.',
		'You will not leave the station, nor go down to either landing in a heavy sea.',
		'I am, Sir, your obedient servant,',
		'Secretary.',
	],
};

export const NOTES = {
	journal: { title: 'The station journal', body: [ 'A new book. The old journal went to Edinburgh with the Superintendent.', 'The first page is ruled for the 3rd of January and is empty. It is written up in the morning, from the slate.' ] },
	slate: { title: 'The slate', body: [ 'Wiped clean, the chalk on its ledge.' ] },
	oilskins: { title: 'The oilskins', body: [ 'One set of oilskins on the pegs, and two pegs empty.', 'The Superintendent\'s report says it: the men who went to the west landing on the 15th of December went in their oilskins. One of them went in his shirtsleeves.' ] },
	stove: { title: 'The stove', body: [ 'Cold. There is coal in the scuttle.' ] },
	westDoor: { title: 'The bedrooms', body: [ 'There is no sleeping tonight. The light first.' ] },
	kitchenDoor: { title: 'The kitchen', body: [ 'Your crate is in there, and the bread. It can wait.' ] },
	chapel: { title: 'Teampull Beannachadh', body: [ 'St Flannan\'s chapel: a cell of dry stone with a doorway you would have to stoop through.', 'The fowlers who came here once a year took off their caps when they reached the top of the island, and turned sunwise, and never called the island by its name.' ] },
	ropeBox: { title: 'The west landing', body: [ 'A box for the ropes and the landing gear, in a cleft of the rock 110 feet above the sea.', 'The one that stood here in December was gone when the Superintendent came on the 29th, and the railings round the crane were twisted out of shape.' ] },
};

// the barometer: by the hour of the night (it falls as the haar comes in)
export function barometer( h ) {

	const v = h < 19 ? 29.94 : h < 23 ? 29.86 : 29.81;
	return `${ v.toFixed( 2 ) } inches, ${ h < 19 ? 'steady' : 'falling a little' }.`;

}

// the observation form: what you can choose for each, and the right answers by the time of the night
export const OBS = {
	wind: [ 'Calm', 'Light airs, SW', 'Moderate breeze, SW', 'Fresh breeze, SW', 'Strong breeze, W', 'Gale, W' ],
	sea: [ 'Smooth', 'Slight', 'Moderate', 'Rough', 'Very rough' ],
	visibility: [ 'Very good: Lewis in sight', 'Good', 'Moderate', 'Haze', 'Fog' ],
	truth: ( h ) => ( { wind: 'Fresh breeze, SW', sea: 'Moderate', visibility: h < 20.5 || h > 30.5 ? 'Very good: Lewis in sight' : 'Fog' } ),
};

// ---- the Watcher
//
// Her messages are sent letter by letter by lamp (Morse) and read through the telescope. Your answers are
// a code group from the Board's book (quick, formal) or a message spelled out (slow, your own words):
// each costs the night's clock `minutes`. say: whether a message says the island's name on the island.
//
//   node: { her: 'MESSAGE', options: [ { code?: n, text, minutes, next } ], end? }
export const CALL = 'FLANNAN FLANNAN K';

export const WATCHER = {
	start: 'hello',
	nodes: {
		hello: {
			her: 'GALLAN HEAD TO FLANNAN. LIGHT SEEN. K',
			options: [
				{ code: 4, text: 'LIGHT LIT. ALL WELL.', minutes: 3, next: 'who' },
				{ text: 'NEW KEEPER HERE. ALONE.', minutes: 9, next: 'alone' },
			],
		},
		who: {
			her: 'WHO IS KEEPING',
			options: [
				{ text: 'INNES. ASSISTANT. FROM LEITH.', minutes: 8, next: 'ceit' },
				{ text: 'NEW MAN. ALONE TILL THE BOAT.', minutes: 10, next: 'alone' },
			],
		},
		alone: {
			her: 'ALONE. WHERE ARE THE OTHERS',
			options: [
				{ text: 'BOAT TURNED BACK IN THE SWELL.', minutes: 9, next: 'ceit' },
				{ code: 9, text: 'BOAT RETURNING.', minutes: 3, next: 'ceit' },
			],
		},
		ceit: {
			her: 'THIS IS CEIT MACLEOD. I WATCH YOUR LIGHT FOR THE BOARD. EVERY NIGHT',
			options: [
				{ text: 'GLAD OF IT.', minutes: 4, next: 'pay' },
				{ text: 'DID YOU WATCH IT IN DECEMBER', minutes: 9, next: 'december' },
				{ code: 11, text: 'SIGNAL UNDERSTOOD.', minutes: 3, next: 'name' },
			],
		},
		pay: {
			her: 'DONT BE. THE BOARD PAYS EIGHT POUNDS A YEAR. I WOULD WATCH FOR LESS',
			options: [
				{ text: 'WHY', minutes: 2, next: 'nothing' },
				{ code: 11, text: 'SIGNAL UNDERSTOOD.', minutes: 3, next: 'name' },
			],
		},
		nothing: {
			her: 'NOTHING ELSE TO LOOK AT FROM HERE',
			options: [ { code: 11, text: 'SIGNAL UNDERSTOOD.', minutes: 3, next: 'name' } ],
		},
		december: {
			her: 'I WATCHED. THE HAAR LAY ON YOU A WEEK. I TOLD MYSELF IT WAS THE WEATHER',
			options: [
				{ text: 'IT WAS THE WEATHER.', minutes: 6, next: 'maybe' },
				{ text: 'NOT YOUR FAULT.', minutes: 5, next: 'maybe' },
				{ code: 11, text: 'SIGNAL UNDERSTOOD.', minutes: 3, next: 'name' },
			],
		},
		maybe: {
			her: 'MAYBE',
			options: [ { code: 11, text: 'SIGNAL UNDERSTOOD.', minutes: 3, next: 'name' } ],
		},
		name: {
			her: 'A WORD FOR YOU. ON THE ISLAND DO NOT SAY ITS NAME. SAY THE COUNTRY',
			options: [
				{ text: 'WHY', minutes: 2, next: 'fowlers' },
				{ text: 'SUPERSTITION.', minutes: 5, next: 'humour' },
				{ code: 11, text: 'SIGNAL UNDERSTOOD.', minutes: 3, next: 'west' },
			],
		},
		fowlers: {
			her: 'THE OLD MEN NEVER DID. I WOULD NOT START',
			options: [ { code: 11, text: 'SIGNAL UNDERSTOOD.', minutes: 3, next: 'west' } ],
		},
		humour: {
			her: 'AYE. HUMOUR ME',
			options: [ { code: 11, text: 'SIGNAL UNDERSTOOD.', minutes: 3, next: 'west' } ],
		},
		west: {
			her: 'GLASS FALLING HERE. MIND THE WEST LANDING. GOOD NIGHT. KEEP HER LIT',
			options: [
				{ text: 'GOOD NIGHT GALLAN HEAD.', minutes: 5, next: 'end' },
				{ text: 'GOOD NIGHT FROM FLANNAN.', minutes: 5, next: 'end', say: true },
				{ code: 2, text: 'GOOD NIGHT.', minutes: 3, next: 'end' },
			],
		},
		end: { her: 'K', end: true },
	},
};

// at dawn, the night's entry in the journal: remarks you may make or leave out
export const REMARKS = {
	islet: { yes: 'A light seen on Eilean Tighe at {t}, for a minute or less. No vessel.', no: null, ask: 'The light on Eilean Tighe' },
	gate: { yes: 'Entrance gate found standing open at {t}. Secured.', no: null, ask: 'The gate' },
	gallan: { yes: 'Signals exchanged with Gallan Head.', no: 'No signal from Gallan Head.', ask: null },
};

export const ENDING = [
	'The relief did not come that day, or the next.',
	'End of the first night.',
];
