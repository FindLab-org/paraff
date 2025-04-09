
%{

%}


%lex

%option flex unicode

STR									"[^"]*"

H									\b[A-Z](?=\:)
A									\b[A-G]
a									\b[a-g]
z									\b[z]
Z									\b[Z]
N									[0-9]

SPECIAL								[:!^_,'/<>={}\[\]|%.]


%%

\s+									{}

{SPECIAL}							return yytext;

{H}									return 'H'
{A}									return 'A'
{a}									return 'a'
{z}									return 'z'
{Z}									return 'Z'
{N}									return 'N'

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
	;

header_value
	: STR
	| N
	;

body
	: %empty
	;
