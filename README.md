# a New method for Working with Queues

## Installation

    npm install nwq

## The Situation
I have a pipeline, it's not currently very complicated but it is:

 * Validating Input
 * Loading things from a database
 * Mutating database objects.
 * Contacting multiple remote systems over HTTP(S) but using client libraries to do that.
 * Saving the results to the database

## The Problem

Currently the solution is moddeled on (caolan/async)[https://github.com/caolan/async] and is not too onerous but I found that:

 * Adding logging to track where all the errors could occur was quite onerous and had quite an obtrusive inpact upon the code.
 * The capability to branching is limited and again has a negative impact on code quality.

## The Aims

My aims where as follows:

 * Model each stage of the pipeline as a simple function.
 * Get a log for the path that every message went through the pipeline.
 * If errors occur it should exit pipeline and do sufficient logging of the error.
 * Write little or no logging code for either path through the pipeline or error tracking.

## TODO

 * Add more tests around _forever, see note in unit tests
 * Does `advancer._forever()` exist as an infinite loop... probably.
