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
var AWS = require('aws-sdk');
var SQSExchange require("nwq/SQSExchange)";

var sqs = new AWS.SQS({region: "eu-west-1"});
var exchange = new SQSExchange(sqs);
```

Construct an Advancer

```javascript
var Advancer = require("./lib/Advancer");

var adv = new Advancer(exchange);
```

Construct a handler for messages, which is returns a promise, or takes a callback.

```javascript
var fetch require("node-fetch");
var querystring = require('querystring');

// Check the spelling of an individual word in the dicitonary
function checkWord(word) {

    let baseUrl = 'https://api.pearson.com:443/v2/dictionaries/ldoce5/entries',
        params = { headword: word },
        url = baseUrl + '?' + querystring.stringify(params);

    return fetch(url)
        .then(function(response) {
            return {
                resolution: (response.status == 200) ? 'found' : 'missing',
                payload: word
            };
        });
}
```

Register the handler.

```javascript
adv.addSpecification(
    'spellcheck',
    { "found": ["word-is-correct"], "missing": ["word-is-correct"] },
    checkWord
);
```

Wait for a message.

```javascript
adv.run('spellcheck')
    .then(function(advResult) {
        console.log(
            "Message " + JSON.stringify(advResult.srcMessage) + " " +
            "taken from " + advResult.srcQueue +
            " queue.\n\n" +
            "It was processed, " +
            "became " + JSON.stringify(advResult.srcMessage) + " " +
            "and placed in the " + advResult.dstQueues.join(", ") + " " +
            "queues.\n\n"
        );
    });
```


Give the Queue some data:

```javascript
exchange.postMessagePayload(
    'spellcheck',
    "hello"
);
```

It will probably be that you want to continually take messages from a queue, in which case see `advancer.runForever()`.
