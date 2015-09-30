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
 * The capability of branching is limited and again has a negative impact on code quality.
 * Not easy to replay data.

## The Aims

My aims where as follows:

 * Model each stage of the pipeline as a simple function.
 * Get a log for the path that every message went through the pipeline.
 * If errors occur it should exit pipeline and do sufficient logging of the error.
 * Write little or no logging code for either path through the pipeline or error tracking.

## Usage

Create an Exchange:

```javascript
    var sqs = new AWS.SQS({region: "eu-west-1"});
    var exchange = new SQSExchange(sqs);
```

Register a function to move messages from somewhere, to somewhere else:


```javascript
    var adv = new Advancer(exchange);

    // Check the spelling of an individual word in the dicitonary
    function checkWord(word) {
        return fetch('http://some-restful-dictionary.com/word/car')
            .then(function(response) {
                return (response.status == 200);
            });
    }

    adv.addSpecification(
        'spellcheck',
        { "success": ["pick-prominent-words"] },
        function({haiku}) {

            function checkSpellingResults(wordsSpeltCorrect) {

                // Once we have all the results, check there are no incorrect
                // spelt words (we should ideally have an array of true).
                //
                // The result of this is that the message will be placed into
                // the "pick_prominent_words" queue as it is defined as the
                // success condition above.
                if (wordsSpeltCorrect.indexOf(false) === -1) {
                    return {
                        resolution: 'success',
                        payload: haiku
                    }
                }

                // If we have some falses, then we set a resolution to
                // "spelling-error". We did not tell it where to send
                // this resolution so it will go into the (and create if
                // neccessary) "spellcheck/spelling-error" queue.
                return {
                    resolution: 'spelling-error',
                    payload: haiku
                }
            }

            // Break into words and send all of them for spellchecking
            return Promise.all(haiku.split(/\s+/).map(checkWord))
                .then(checkSpellingResults);
        }
    );

    adv.run('spellcheck')
        .then(function(advResult) {
            console.log(
                "Message " + JSON.stringify(advResult.srcMessage) + " " +
                "taken from " + advResult.srcQueue +
                " queue.\n\n" +
                "It was processed, " +
                "became " + JSON.stringify(advResult.srcMessage) + " "
                "and placed in the " + advResult.dstQueues.join(", ") + " " +
                "queues.\n\n"
            );
        });
```


Give the Queue some data:

```javascript
    exchange.postMessagePayload(
        'spellcheck',
        {haiku: "Black and orange stripes\n" +
            "Sneaking quietly through grass\n" +
            "Claws pointy and sharp"});
```

It will probably be that you want to continually take messages from a queue, in which case see `advancer.runForever()`.
