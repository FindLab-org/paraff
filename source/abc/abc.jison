
%{

%}


%lex

%option flex unicode

STR									["][^"]*["]

V									\b[V](?=\:)
H									\b[A-Z](?=\:)
A									\b[A-G](?=[\W\d\s])
a									\b[a-g](?=[\W\d\s])
z									\b[z]
Z									\b[Z]
x									\b[x](?=[\W\d\s])
N									[0-9]

SPECIAL								[:!^_,'/<>={}()\[\]|.]

COMMENTS							^[%].*


%%

\s+									{}
{COMMENTS}							{}

{SPECIAL}							return yytext;

{V}									return 'V'
{H}									return 'H'
{A}									return 'A'
{a}									return 'a'
{z}									return 'z'
{Z}									return 'Z'
{x}									return 'x'
{N}									return 'N'
\b[ms]?[pf]+[z]?\b					return 'DYNAMIC'

[a-z][\w-]*							return 'NAME'

{STR}								return 'STR'

<<EOF>>								return 'EOF';


/lex

%start start_symbol

%%

start_symbol
	: tunes EOF		{ return $1; }
	;

tunes
	: tune			{ $$ = [$1]; }
	| tunes tune	{ $$ = [...$1, $2]; }
	;

tune
	: header body
	| body
	;

header
	: head_lines			{ $$ = $1; }
	;

head_lines
	: head_line				{ $$ = [$1]; }
	| head_lines head_line	{ $$ = [...$1, $2]; }
	;

head_line
	: H ':' header_value
	| V ':' header_value
	;

header_value
	: STR
	| number
	| frac
	| numeric_tempo
	| upper_phonet
	| voice_exp
	;

body
	: measures
	;

frac
	: number '/' number
	;

number
	: N
	| number N
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
	: assign
	| assigns assign
	;

assign
	: NAME '=' assign_value
	;

assign_value
	: STR
	| number
	;

upper_phonet
	: A
	;

lower_phonet
	: a
	;

measures
	: measure
	| measures measure
	;

measure
	: music_voice music bar
	;

bar
	: '|'
	| '|' ':'
	| ':' '|'
	| '|' ']'
	;

music_voice
	: '[' 'V' ':' number ']'
	;

music
	: %empty
	| music expressive_mark
	| music text
	| music note
	;

expressive_mark
	: '!'
	| '('
	| ')'
	| '.'
	| DYNAMIC
	;

text
	: STR
	;

pitch_or_chord
	: pitch
	| chord
	;

chord
	: '[' pitches ']'
	;

pitches
	: pitch
	| pitches pitch
	;

quotes
	: sub_quotes
	| sup_quotes
	;

sub_quotes
	: ','
	| sub_quotes ','
	;

sup_quotes
	: "'"
	| sup_quotes "'"
	;

accidentals
	: '^'
	| '_'
	;

pitch
	: phonet
	| phonet quotes
	| accidentals phonet
	| accidentals phonet quotes
	| x
	| rest_phonet
	;

phonet
	: upper_phonet
	| lower_phonet
	;

rest_phonet
	: z
	| Z
	;

note
	: pitch_or_chord
	| pitch_or_chord division
	;

division
	: number
	;
