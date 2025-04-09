
%{

%}


%lex

%option flex unicode

H									\b[A-Z](?=\:)

SPECIAL								[:!^_,'/<>={}\[\]|%.]

STR									"[^"]*"


%%

\s+									{}

{SPECIAL}							return yytext;
{H}									return 'H'
{STR}								return 'STR'

<<EOF>>								return 'EOF';


/lex

%start start_symbol

%%

start_symbol
	: tunes EOF		{ return $1; }
	;

tunes
	: %empty
	;
