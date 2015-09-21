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

## Usage

Create an Exchange:

    var sqs = new AWS.SQS({region: "eu-west-1"});
    return new SQSExchange(sqs);

Register a function to move messages from somewhere, to somewhere else:

    advancer(
        // Where messages are picked up from
        'validate-input',

        // Where messages go after processing
        { "too-short": "log-bad-message", "success": "store-in-db" } 

        // Where to pick up, post and delete messages from
        memoryExchange,

        // The validation function itself
        function validateInput(messageBody, next) {
            if (!messageBody.hasOwnProperty('name')) { return next(null, "done", {}); }
            if (messageBody.name.length < 5) {
                return next(null, {name: "Teapot"});
            }
            next(null, {name: messageBody.name});
        }

        // After the message has been processed, this function will be called
        function(err, details) {
            if (err) {
                return console.log("Something went wrong");
            }
            console.log(
                "The message " + details.message + " "
                "has been moved from " + details.fromQueue + " "
                "to " + details.toQueue + " "
            );
        }
    );

Give the Queue some data:

    memoryExchange.postMessageBody('validate-input', {name: "Bob"});

It will probably be that you want to continually take messages from a queue, in which case see `advancer.forever()`.

## TODO

 * Update MemoryExchange so it behaves like SQS (ie messages are not deleted on getMessage() but instead sleep for a configured amount of time).
