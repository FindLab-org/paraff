
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


	const patch = (terms, bar) => {
		return {
			terms,
			bar,
		};
	};


	const voice = (number, assign, properties) => ({
		number,
		assign,
		properties,
	});


	const assign = (name, value) => {
		return {
			[name]: value,
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


	const grace = (events, acciaccatura) => ({
		grace: true,
		acciaccatura,
		events,
	});


	const chord = (pitches, tie) => ({
		pitches,
		tie,
	});


	const staffShift = (shift) => ({
		staffShift: shift,
	});


	const comment = (text) => ({
		comment: text,
	});


	const staffGroup = (items, bound) => ({
		items,
		bound,
	});


	const tempo = (note, bpm) => ({
		note,
		bpm,
	});
%}


%lex

%option flex unicode

%x string
%x comment
%x spec_comment


H									\b[A-Z](?=\:)
A									\b[A-G](?=[\W\d\sA-Ga-g_]*\b)
a									\b[a-g](?=[\W\d\sA-Ga-g_]*\b)
z									\b[z]
Z									\b[Z]
x									\b[x](?=[\W\d\s])
N									[0-9]
P									\b[P](?=[A-Ga-g]\b)

SPECIAL								[:!^_,'/<>={}()\[\]|.\-+]

//COMMENTS							^[%].*


%%

\"									{ this.pushState('string'); return 'STR_START'; }
<string>\"							{ this.popState(); return 'STR_END'; }
<string>\\\"						return 'STR_CONTENT'
<string>[^"]+						return 'STR_CONTENT'

^[%]								{ this.pushState('comment'); }
<comment>[%]						{ this.pushState('spec_comment'); }
<comment>[^\n]+						{ return 'COMMENT'; }
<spec_comment>\n					{ this.popState(); this.popState(); }
<comment>\n							{ this.popState(); }
<spec_comment>\s					{}
<spec_comment>"score"				return 'SCORE'
<spec_comment>[\d]+					return 'NN'
<spec_comment>[(){}\[\]|]			return yytext

\s+									{}
//{COMMENTS}							{}

{SPECIAL}							return yytext

{H}									return 'H'
{A}									return 'A'
{a}									return 'a'
{z}									return 'z'
{Z}									return 'Z'
{P}									return 'P'
{x}									return 'x'
{N}									return 'N'
\b[ms]?[pf]+[z]?\b					return 'DYNAMIC'

"staff"								return 'STAFF'
[a-z][\w-]*							return 'NAME'

<<EOF>>								return 'EOF'


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
	;

header
	: head_lines
	;

head_lines
	: head_line							-> [$1]
	| comment							-> [$1]
	| head_lines head_line				-> [...$1, $2]
	| head_lines comment				-> [...$1, $2]
	| head_lines staff_layout_statement	-> [...$1, $2]
	;

comment
	: COMMENT							-> comment($1)
	;

staff_layout_statement
	: 'SCORE' staff_layout				-> $2
	;

staff_layout
	: staff_layout_items				-> ({staffLayout: $1})
	;

staff_layout_items
	: staff_layout_item						-> [$1]
	| staff_layout_items staff_layout_item	-> [...$1, $2]
	| staff_layout_items '|'				-> $1
	;

staff_layout_item
	: NN								-> staffGroup([$1])
	| '(' staff_layout_items ')'		-> staffGroup($2, 'arc')
	| '[' staff_layout_items ']'		-> staffGroup($2, 'square')
	| '{' staff_layout_items '}'		-> staffGroup($2, 'curly')
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
	| NAME
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
	: patches							-> ({patches: $1})
	;

frac
	: number '/' number					-> frac($1, $3)
	;

number
	: N									-> Number($1)
	| number N							-> $1 * 10 + Number($2)
	;

numeric_tempo
	: frac '=' number					-> tempo($1, $3)
	;

voice_exp
	: number							-> voice($1)
	| number NAME						-> voice($1, $2)
	| number NAME assigns				-> voice($1, $2, $3)
	;

assigns
	: assign							-> $1
	| assigns assign					-> ({...$1, ...$2})
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

patches
	: patch								-> [$1]
	| patches patch						-> [...$1, $2]
	| patches comment					-> $1
	;

patch
	: music bar							-> patch($1, $2)
	;

bar
	: '|'								-> '|'
	| '|' ':'							-> '|:'
	| ':' '|'							-> ':|'
	| ':' ':'							-> ':|:'
	| '|' '|'							-> '||'
	| '|' ']'							-> '|]'
	| '|' N								-> '|' + $2
	| ':' '|' N							-> ':|' + $2
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
	: '[' H ':' header_value ']'		-> ({control: header($2, $4)})
	;

expressive_mark
	: articulation
	| '('								-> ({express: $1})
	| ')'								-> ({express: $1})
	| '.'								-> ({express: $1})
	| '-'								-> ({express: $1})
	;

articulation
	: '!' articulation_content '!' 		-> $2
	| P									-> articulation("prall")
	;

articulation_content
	: NAME								-> articulation($1)
	| scope_articulation parenthese		-> articulation($1, $2)
	| scope_articulation				-> articulation($1)
	| DYNAMIC							-> articulation($1)
	| a									-> articulation($1)
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
	: string							-> ({text: $1})
	;

pitch_or_chord
	: pitch								-> [$1]
	| chord
	;

chord
	: '[' pitches ']'					-> chord($2)
	;

pitches
	: pitch								-> [$1]
	| pitches pitch						-> [...$1, $2]
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
	| '='
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
	: pitch_or_chord					-> ({event: event($1)})
	| pitch_or_chord duration			-> ({event: event($1, $2)})
	;

events
	: event								-> [$1]
	| events event						-> [...$1, $2]
	;

grace_events
	: '{' events '}'					-> grace($2)
	| '{' '/' events '}'				-> grace($3, true)
	;

duration
	: number '/' number					-> frac(Number($1), Number($3))
	| '/' number						-> frac(1, Number($2))
	| number							-> frac(Number($1))
	| '/'								-> frac(1, 2)
	| '>'
	| '<'
	;
