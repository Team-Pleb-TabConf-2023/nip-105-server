const WebSocket = require("ws");
const express = require("express");
const cors = require('cors');
const app = express();
const axios = require("axios");
const bolt11 = require("bolt11");
const bodyParser = require("body-parser");
const { getBitcoinPrice } = require('./lib/bitcoinPrice');
const { analyze_tokens } = require('./lib/token-estimator');
const {
  relayInit,
  getPublicKey,
  getEventHash,
  getSignature,
} = require("nostr-tools");
const {
  GPT_SCHEMA,
  GPT_RESULT_SCHEMA,
  STABLE_DIFFUSION_SCHEMA,
  STABLE_DIFFUSION_RESULT_SCHEMA,
  OFFERING_KIND,
} = require("./lib/defines.js");
const { sleep } = require("./lib/helpers");

require("dotenv").config();
global.WebSocket = WebSocket;

const mongoose = require("mongoose");

// --------------------- MONGOOSE -----------------------------

const JobRequestSchema = new mongoose.Schema({
  invoice: Object,
  paymentHash: String,
  verifyURL: String,
  status: String,
  result: String,
  price: Number,
  requestData: Object,
  requestResponse: Object,
  service: String,
  state: String,
});

const JobRequest = mongoose.model("JobRequest", JobRequestSchema);

const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });

const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => {
  console.log("Connected to MongoDB!");
});

// --------------------- HELPERS -----------------------------

function logState(service, paymentHash, state) {
  console.log(`${paymentHash.substring(0, 5)} - ${service}: ${state}`);
}

function getLNURL() {
  const parts = process.env.LN_ADDRESS.split("@");
  if (parts.length !== 2) {
    throw new Error(`Invalid lnAddress: ${process.env.LN_ADDRESS}`);
  }
  const username = parts[0];
  const domain = parts[1];
  return `https://${domain}/.well-known/lnurlp/${username}`;
}

async function createNewJobDocument(service, invoice, paymentHash, price) {
  const newDocument = new JobRequest({
    invoice,
    paymentHash,
    verifyURL: invoice.verify,
    price,
    service,
    status: "UNPAID",
    result: null,
    requestData: null,
  });

  // Save the document to the collection
  await newDocument.save();
}

async function findJobRequestByPaymentHash(paymentHash) {
  const jobRequest = await JobRequest.findOne({ paymentHash }).exec();
  if (!jobRequest) {
    throw new Error("No Doc found");
  }

  return jobRequest;
}

async function getIsInvoicePaid(paymentHash) {
  const doc = await findJobRequestByPaymentHash(paymentHash);

  const invoice = doc.invoice;

  if (doc.status == "PAID") {
    return { isPaid: true, invoice };
  }

  const response = await axios.get(doc.verifyURL, {
    headers: {
      Accept: "application/json",
    },
  });

  const isPaid = response.data.settled == true;

  doc.status = isPaid ? "PAID" : doc.status;
  await doc.save();

  return { isPaid, invoice };
}

async function getPaymentHash(invoice) {
  const decodedInvoice = await bolt11.decode(invoice);
  const paymentHashTag = decodedInvoice.tags.find(
    (tag) => tag.tagName === "payment_hash"
  ).data;
  return paymentHashTag;
}

async function generateInvoice(service) {
  const msats = getServicePrice(service);
  const lnurlResponse = await axios.get(getLNURL(), {
    headers: {
      Accept: "application/json",
    },
  });

  const lnAddress = lnurlResponse.data;

  if (msats > lnAddress.maxSendable || msats < lnAddress.minSendable) {
    throw new Error(
      `${msats} msats not in sendable range of ${lnAddress.minSendable} - ${lnAddress.maxSendable}`
    );
  }

  const expiration = new Date(Date.now() + 3600 * 1000); // One hour from now
  const url = `${lnAddress.callback}?amount=${msats}&expiry=${Math.floor(
    expiration.getTime() / 1000
  )}`;

  const invoiceResponse = await axios.get(url);
  const invoiceData = invoiceResponse.data;

  const paymentHash = await getPaymentHash(invoiceData.pr);
  const successAction = getSuccessAction(service, paymentHash);

  const invoice = { ...invoiceData, successAction, paymentHash };

  await createNewJobDocument(service, invoice, paymentHash, msats);

  return invoice;
}

function getSuccessAction(service, paymentHash) {
  return {
    tag: "url",
    url: `http://localhost:3000/${service}/${paymentHash}/get_result`,
    description: "Open to get the confirmation code for your purchase.",
  };
}

// --------------------- ENDPOINTS -----------------------------

app.use(cors());

app.use(bodyParser.json());

app.post("/:service", async (req, res) => {
  try {
    const service = req.params.service;
    const invoice = await generateInvoice(service);
    const doc = await findJobRequestByPaymentHash(invoice.paymentHash);

    doc.requestData = req.body;
    doc.state = "NOT_PAID";
    await doc.save();

    logState(service, invoice.paymentHash, "REQUESTED");

    res.status(402).send(invoice);
  } catch (e) {
    console.log(e.toString().substring(0, 150));
    res.status(500).send(e);
  }
});

app.get("/:service/:payment_hash/get_result", async (req, res) => {
  try {
    const service = req.params.service;
    const paymentHash = req.params.payment_hash;
    const { isPaid, invoice } = await getIsInvoicePaid(paymentHash);

    logState(service, paymentHash, "POLL");
    if (isPaid != true) {
      res.status(402).send({ ...invoice, isPaid });
    } else {
      const doc = await findJobRequestByPaymentHash(paymentHash);

      switch (doc.state) {
        case "WORKING":
          logState(service, paymentHash, "WORKING");
          res.status(202).send({ state: doc.state });
          break;
        case "ERROR":
        case "DONE":
          logState(service, paymentHash, doc.state);
          res.status(200).send(doc.requestResponse);
          break;
        default:
          logState(service, paymentHash, "PAID");
          const data = doc.requestData;
          submitService(service, data)
            .then(async (response) => {
              doc.requestResponse = response;
              doc.state = "DONE";
              await doc.save();
            })
            .catch(async (e) => {
              doc.requestResponse = e;
              doc.state = "ERROR";
              await doc.save();
            });

          doc.state = "WORKING";
          await doc.save();
          res.status(202).send({ state: doc.state });
      }
    }
  } catch (e) {
    console.log(e.toString().substring(0, 300));
    res.status(500).send(e);
  }
});

app.get("/:service/:payment_hash/check_payment", async (req, res) => {
  try {
    const paymentHash = req.params.payment_hash;
    const { isPaid, invoice } = await getIsInvoicePaid(paymentHash);

    res.status(200).json({ invoice, isPaid });
  } catch (e) {
    console.log(e.toString().substring(0, 50));
    res.status(500).send(e);
  }
});

// --------------------- SERVICES -----------------------------

async function getServicePrice(service) {
  const bitcoinPrice = await getBitcoinPrice(); 
  const profitMarginFactor = (1.0 + (process.env.PROFIT_MARGIN_PCT/100.0));
  switch (service) {
    case "GPT":
      return Math.round((process.env.GPT_USD * 100000000000 * profitMarginFactor) / bitcoinPrice);
    case "STABLE":
      return Math.round((process.env.STABLE_DIFFUSION_USD * 100000000000 * profitMarginFactor) / bitcoinPrice);
    default:
      return process.env.GPT_MSATS;
  }
}

function submitService(service, data) {
  switch (service) {
    case "GPT":
      return callChatGPT(data);
    case "STABLE":
      return callStableDiffusion(data);
    default:
      return callChatGPT(data);
  }
}

async function callChatGPT(data) {
  var config = {
    method: "post",
    url: "https://api.openai.com/v1/chat/completions",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY}`,
    },
    data,
  };

  try {
    const response = await axios(config);
    return response.data;
  } catch (e) {
    console.log(`ERROR: ${e.toString().substring(0, 50)}`);
    return e;
  }
}

async function callStableDiffusion(data) {
  const newData = {
    ...data,
    key: process.env.STABLE_DIFFUSION_API_KEY,
  };

  const config = {
    method: "post",
    url: "https://stablediffusionapi.com/api/v4/dreambooth",
    headers: {
      "Content-Type": "application/json",
    },
    data: newData,
  };

  try {
    let isProcessing = true;
    let response;
    while (isProcessing) {
      response = await axios(config);
      if (response.data.status !== "processing") isProcessing = false;
      await sleep(1000);
    }

    return response.data;
  } catch (e) {
    console.log(`ERROR: ${e.toString().substring(0, 50)}`);
    return e;
  }
}

// --------------------- NOSTR -----------------------------
function createOfferingNote(
  pk,
  sk,
  service,
  cost,
  endpoint,
  status,
  inputSchema,
  outputSchema,
  description
) {
  const now = Math.floor(Date.now() / 1000);

  const content = {
    endpoint, // string
    status, // UP/DOWN/CLOSED
    cost, // number
    inputSchema, // Json Schema
    outputSchema, // Json Schema
    description, // string / NULL
  };

  let offeringEvent = {
    kind: OFFERING_KIND,
    pubkey: pk,
    created_at: now,
    tags: [
      ["s", service],
      ["d", service],
    ],
    content: JSON.stringify(content),
  };
  offeringEvent.id = getEventHash(offeringEvent);
  offeringEvent.sig = getSignature(offeringEvent, sk);

  return offeringEvent;
}

// Post Offerings
async function postOfferings() {
  const sk = process.env.NOSTR_SK;
  const pk = getPublicKey(sk);

  const relay = relayInit(process.env.NOSTR_RELAY);
  relay.on("connect", () => {
    console.log(`connected to ${relay.url}`);
  });
  relay.on("error", (e) => {
    console.log(`failed to connect to ${relay.url}: ${e}`);
  });
  await relay.connect();

  const gptOffering = createOfferingNote(
    pk,
    sk,
    "https://api.openai.com/v1/chat/completions",
    Number(process.env.GPT_MSATS),
    process.env.ENDPOINT + "/" + "GPT",
    "UP",
    GPT_SCHEMA,
    GPT_RESULT_SCHEMA,
    "Get your GPT needs here!"
  );

  await relay.publish(gptOffering);
  console.log(`Published GPT Offering: ${gptOffering.id}`);

  const sdOffering = createOfferingNote(
    pk,
    sk,
    "https://stablediffusionapi.com/api/v4/dreambooth",
    Number(process.env.STABLE_DIFFUSION_MSATS),
    process.env.ENDPOINT + "/" + "STABLE",
    "UP",
    STABLE_DIFFUSION_SCHEMA,
    STABLE_DIFFUSION_RESULT_SCHEMA,
    "Get your SD needs here!"
  );

  await relay.publish(sdOffering);
  console.log(`Published Stable Diffusion Offering: ${sdOffering.id}`);

  relay.close();
}

postOfferings();

// --------------------- SERVER -----------------------------

let port = process.env.PORT;
if (port == null || port == "") {
  port = 3000;
}

app.listen(port, async function () {
  console.log("Starting NST Backend...");
  console.log(`Server started on port ${port}.`);
  // const price = await getBitcoinPrice();
  // console.log(`Bitcoin Price: ${price} per Cuck Buck`);
  // const gptPrice = await getServicePrice("GPT");
  // console.log(`GPT Price: ${gptPrice} msats per call`);
  // const stablePrice = await getServicePrice("STABLE");
  // console.log(`STABLE Price: ${stablePrice} msats per call`);

  //const str = "The quick brown fox jumps over the lazy dog. This is a test sentence to demonstrate a sentence with exactly 100 tokens. It's important to count tokens accurately when working with language models like GPT-3. Tokens can be words, punctuation, or even individual characters, so be mindful of token limits in your applications. What a crazy proposition. You can actually charge people based on exactly how much semantic information their request contains! It is of paramount importance to correctly estimate the size if you want profits"
  const str = `Once upon a time, in a kingdom far, far away, there lived a courageous princess named Isabella. Isabella was known throughout the land for her beauty, intelligence, and unwavering kindness. But little did the people of the kingdom know that beneath her graceful exterior, Isabella possessed a heart full of adventure and a thirst for the unknown.

One sunny morning, as the golden rays of the sun danced across the emerald meadows of the kingdom, Isabella received a mysterious letter. The letter, sealed with a wax emblem of a fearsome dragon, bore news of a perilous threat. A colossal dragon named Drakar had awakened from its slumber deep within the Misty Mountains, and it was now terrorizing the neighboring lands.

Without hesitation, Princess Isabella donned her armor, mounted her trusty steed, Seraphina, and set forth on a journey to confront the dragon. Her determination to protect her kingdom and its people burned like a fiery beacon in her heart.

Days turned into weeks as Isabella ventured deeper into the rugged terrain of the Misty Mountains. The air grew colder, and the dense fog obscured her path. Yet, Isabella pressed on, guided only by her unwavering resolve and the legends passed down through generations.

Finally, on the edge of a precipice shrouded in mist, she laid eyes upon the imposing figure of Drakar. With scales as dark as midnight and eyes that glowed like burning coals, the dragon was a formidable adversary. But Isabella's bravery knew no bounds.

She unsheathed her gleaming sword and shouted, "Oh, mighty Drakar, I come not to destroy you but to seek understanding and peace between our worlds. What has driven you to such acts of terror?"

To her surprise, Drakar's deep voice resonated through the mist, "Princess Isabella, you are unlike any human I have encountered. Long have I slumbered in solitude, guarding the ancient treasures of these mountains. It was fear and ignorance that led your people to believe I was a threat."

Isabella listened attentively as Drakar recounted his story. He spoke of a time when humans and dragons coexisted harmoniously, sharing knowledge and wisdom. But as time passed, greed and misunderstanding drove a wedge between the two races.

With empathy in her heart, Isabella vowed to mend the broken bonds between humans and dragons. She returned to her kingdom with Drakar as her ally, carrying a message of peace and reconciliation.

Through her wisdom and compassion, Princess Isabella brought about a new era of cooperation between humans and dragons. The kingdom flourished as it had never before, and the Misty Mountains once again became a place of wonder and discovery.

And so, the courageous princess and the once-feared dragon became symbols of unity and understanding, proving that even the most daunting challenges could be overcome with a heart full of compassion.

The end.`;

  const n_tokens = await analyze_tokens(str);
  console.log(`The string has ${n_tokens} tokens.`)
});


