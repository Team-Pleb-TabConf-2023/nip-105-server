# Data Buffet Example

In this repo you can run and test an implementation of [NIP-103 - API Service Marketplace](./103.md). The idea is simple, service providers post their API offerings in a `kind:31402` then clients can search for and consume them for lightning. 

This project was created for the TABconf 2023 hackathon. 

[Presentation Slides](./data-buffet-presentation.pdf)

## Getting it running

First you will need to copy the example env file and fill out the missing fields with your own keys:

`cp .env.example .env`

Then install everything:

`npm i`

Then run the server:

`node server.js`

Lastly run the client in a different terminal:

`node client.js`



