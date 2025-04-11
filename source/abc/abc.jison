
%{
	const header = (name, value) => {
		return {
			name,
			value,
		};
	};


	const event = (chord, duration) => {
		return {
			chord,
			duration,
		};
	};


	const pitch = (acc, phonet, quotes) => {
		return {
			acc,
			phonet,
			quotes,
		};
	};


	const measure = (music, bar) => {
		return {
			music,
			bar,
		};
	};


	const assign = (name, value) => {
		return {
			name,
			value,
		};
	};


	const frac = (numerator, denominator) => {
		return {
			numerator,
			denominator,
		};
	};


	const articulation = (content, scope) => ({
		articulation: content,
		scope,
	});


	const tune = (header, body) => ({
		header,
		body,
	});


	const grace = events => ({
		grace: true,
		events,
	});


	const chord = (pitches, tie) => ({
		pitches,
		tie,
	});


	const staffShift = (shift) => ({
		staffShift: shift,
	});
%}


%lex

%option flex unicode

%x string

H									\b[A-Z](?=\:)
A									\b[A-G](?=[\W\d\sA-Ga-g_]*\b)
a									\b[a-g](?=[\W\d\sA-Ga-g_]*\b)
z									\b[z]
Z									\b[Z]
x									\b[x](?=[\W\d\s])
N									[0-9]

SPECIAL								[:!^_,'/<>={}()\[\]|.\-+]

COMMENTS							^[%].*


%%

\"									{ this.pushState('string'); return 'STR_START'; }
<string>\"							{ this.popState(); return 'STR_END'; }
<string>\\\"						return 'STR_CONTENT'
<string>[^"]+						return 'STR_CONTENT'

\s+									{}
{COMMENTS}							{}

{SPECIAL}							return yytext;

{H}									return 'H'
{A}									return 'A'
{a}									return 'a'
{z}									return 'z'
{Z}									return 'Z'
{x}									return 'x'
{N}									return 'N'
\b[ms]?[pf]+[z]?\b					return 'DYNAMIC'

"staff"								return 'STAFF'
[a-z][\w-]*							return 'NAME'

<<EOF>>								return 'EOF';


/lex

%start start_symbol

%%

start_symbol
	: tunes EOF							{ return $1; }
	;

tunes
	: tune								-> [$1]
	| tunes tune						-> [...$1, $2]
	;

tune
	: header body						-> tune($1, $2)
	| body
	;

header
	: head_lines
	;

head_lines
	: head_line							-> [$1]
	| head_lines head_line				-> [...$1, $2]
	;

head_line
	: H ':' header_value				-> header($1, $3)
	;

header_value
	: string
	| number
	| frac
	| numeric_tempo
	| upper_phonet
	| voice_exp
	| staff_shift
	;

staff_shift
	: 'STAFF' plus_minus_number			-> staffShift($2)
	;

plus_minus_number
	: '+' number						-> Number($2)
	| '-' number						-> -Number($2)
	;

string
	: STR_START string_content STR_END	-> $2
	;

string_content
	: %empty							-> ""
	| string_content STR_CONTENT		-> $1 ? $1 + $2 : $2
	;

body
	: measures
	;

frac
	: number '/' number					-> frac($1, $3)
	;

number
	: N									-> Number($1)
	| number N							-> $1 * 10 + Number($2)
	;

numeric_tempo
	: frac '=' number
	;

voice_exp
	: number
	| number NAME
	| number NAME assigns
	;

assigns
	: assign							-> [$1]
	| assigns assign					-> [...$1, $2]
	;

assign
	: NAME '=' assign_value				-> assign($1, $3)
	;

assign_value
	: string
	| number
	;

upper_phonet
	: A
	;

lower_phonet
	: a
	;

measures
	: measure							-> [$1]
	| measures measure					-> [...$1, $2]
	;

measure
	: music bar							-> measure($1, $2)
	;

bar
	: '|'								-> 'bar'
	| '|' ':'							-> 'voltaL'
	| ':' '|'							-> 'voltaR'
	| '|' ']'							-> 'terminator'
	;

music_voice
	: '[' 'V' ':' number ']'			-> $4
	;

music
	: %empty
	| music expressive_mark				-> $1 ? [...$1, $2] : [$2]
	| music text						-> $1 ? [...$1, $2] : [$2]
	| music event						-> $1 ? [...$1, $2] : [$2]
	| music grace_events				-> $1 ? [...$1, $2] : [$2]
	| music control						-> $1 ? [...$1, $2] : [$2]
	;

control
	: '[' H ':' header_value ']'		-> header($2, $4)
	;

expressive_mark
	: articulation
	| '('
	| ')'
	| '.'
	| '='
	;

articulation
	: '!' articulation_content '!' 		-> $2
	;

articulation_content
	: NAME								-> articulation($1)
	| scope_articulation parenthese		-> articulation($1, $2)
	| scope_articulation				-> articulation($1)
	| DYNAMIC							-> articulation($1)
	;

scope_articulation
	: '<'
	| '>'
	;

parenthese
	: '('
	| ')'
	;

text
	: string
	;

pitch_or_chord
	: maybe_tied_pitch					-> [$1]
	| chord
	;

chord
	: '[' pitches ']'					-> chord($2)
	;

pitches
	: maybe_tied_pitch					-> [$1]
	| pitches maybe_tied_pitch			-> [...$1, $2]
	;

maybe_tied_pitch
	: pitch
	| '=' pitch						-	-> ({tied: true, ...$2})
	;

quotes
	: sub_quotes
	| sup_quotes
	;

sub_quotes
	: ','								-> -1
	| sub_quotes ','					-> $1 - 1
	;

sup_quotes
	: "'"								-> 1
	| sup_quotes "'"					-> $1 + 1
	;

accidentals
	: '^'
	| '_'
	;

pitch
	: phonet							-> pitch(null, $1, null)
	| phonet quotes						-> pitch(null, $1, $2)
	| accidentals phonet				-> pitch($1, $2, null)
	| accidentals phonet quotes			-> pitch($1, $2, $3)
	| x									-> pitch(null, $1, null)
	| rest_phonet						-> pitch(null, $1, null)
	;

phonet
	: upper_phonet
	| lower_phonet
	;

rest_phonet
	: z
	| Z
	;

event
	: pitch_or_chord					-> event($1)
	| pitch_or_chord duration			-> event($1, $2)
	;

events
	: event								-> [$1]
	| events event						-> [...$1, $2]
	;

grace_events
	: '{' events '}'					-> grace($2)
	;

duration
	: number '/' number					-> frac(Number($1), Number($3))
	| '/' number						-> frac(1, Number($2))
	| number							-> frac(Number($1))
	| '/'								-> frac(1, 2)
	;
