# PARAFF

**PARAFF** is a sheet music domian-specific language, designed for algorithmic musical composition.


## Hello World

Paraff code:

```paraff
BOM K0 TN4 TD4 S1 Cg c D1 EOM
```

Lilypond code:

```lilypond
\relative c' {
	\key c \major \time 4/4 \clef "treble" c1
}
```

Sheet music:

![sheet music SVG for 'hello world' paraff code](https://k-l-lambda.github.io/images/paraff-whole-c.svg)


## Language Features

* Friendly for tokenizers

	Paraff vocabulary made up by a group of pure alphabet-number words.
	A paraff sentence is a sequence of words, separated by space.

	The total number of paraff tokens is less than 256.
	So music scores in paraff format can be serialized as a uint8 byte array.

* Convertable from/to Lilypond

	Lilypond is an expressive music language, with comprehensive functionaliy engraving program.
	Paraff is designed refer to Lilypond,
	whose context dependent grammars were simplified,
	and scope symbols were removed.

	Paraff score can be losslessly converted into Lilypond.
	Most regular Lilypond scores can be converted into Paraff. However, there are some restriction in grammar for complex scores.

* Parseable into JSON

	Paraff is not only a music tokenization solution, as a language,
	it also has a grammar interpreter by [JISON](https://github.com/zaach/jison).

	The Paraff grammar file is [here](source/paraff/paraff.jison).
	If you are familiar with BISON/JISON, you can test the grammar parsing by [Jison debugger](https://nolanlawson.github.io/jison-debugger/).


## Usage

### Convert a paraff source file to Lilypond

```sh
yarn ts ./tools/paraffToLilypond.ts paraff-source-file.yaml path-to-target-dir
```

### Binary Paraff converting

```sh
yarn ts ./tools/paraffTokenizer.ts paraff-source-file.yaml
```

---
The Paraff document with more details is coming soon.
