const WebSocket = require("ws");
const axios = require("axios");
const { relayInit } = require("nostr-tools");
const { sleep } = require("./lib/helpers")
const { OFFERING_KIND } = require('./lib/defines')

require("dotenv").config();
global.WebSocket = WebSocket;

// ----------------- HELPERS ---------------------------

function getLatestEventByService(events, desiredService) {
  return events
    .filter((event) => {
      const serviceTag = event.tags.find((tag) => tag[0] === "s");
      return serviceTag && serviceTag[1] === desiredService;
    })
    .sort((a, b) => b.created_at - a.created_at)[0];
}

async function pollUrl(url, runs, delay) {
  for (let i = 0; i < runs; i++) {
    try {
      const response = await axios.get(url);

      if (response.status == 202) {
        throw new Error("Not ready yet");
      }

      return response.data;
    } catch (error) {
    //   console.error(`Fetching ${url}`);
      
      if (i === runs - 1 || error.status == 500) {
        throw new Error("Poll Timeout");
      }
      await sleep(delay);
    }
  }
}

// ----------------- GPT ---------------------------

function parseGPTResponse(response) {
  if (response.choices && response.choices.length > 0) {
    const assistantMessage = response.choices[0].message;
    if (assistantMessage.role === "assistant") {
      return assistantMessage.content.trim(); // Using trim() to remove any unnecessary whitespace
    }
  }
  return null;
}

async function runGPT(relay, index, question) {
  return new Promise(async (resolve, reject) => {
    // --------------------- Fetch Offering Event -----------------------------

    const postedNoteList = await relay.list([
      {
        kinds: [OFFERING_KIND],
        limit: 10,
      },
    ]);

    const postedNote = getLatestEventByService(
      postedNoteList,
      "https://api.openai.com/v1/chat/completions"
    );
    const postedNoteContent = JSON.parse(postedNote.content);

    // --------------------- Post to Note's endpoint -----------------------------

    const requestData = {
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: question ?? "Tell me a joke",
        },
      ],
    };

    let responseData;
    try {
      const response = await axios.post(
        postedNoteContent.endpoint,
        requestData
      );
      responseData = response.data;
    } catch (e) {
      if (e.response && e.response.status === 402) {
        responseData = e.response.data;
      } else {
        throw new Error(`Bad Request ${e}`);
      }
    }

    // --------------------- Pay invoice -----------------------------

    console.log(`------- PAYING GPT ${index} --------`);
    console.log(responseData.pr);
    console.log("----------------------------");

    const response = await axios.post(
      "https://legend.lnbits.com/api/v1/payments",
      {
        out: true,
        bolt11: responseData.pr,
      },
      {
        headers: {
          "X-Api-Key": process.env.LNBITS_API,
          "Content-type": "application/json",
        },
      }
    );

    console.log("------- PAID GPT ---------------");
    console.log(response.data);
    console.log("----------------------------");

    // --------------------- Poll SuccessAction for Response -----------------------------

    

    const totalResponse = await pollUrl(
      responseData.successAction.url,
      99,
      1000
    );
    const gpt = parseGPTResponse(totalResponse);

    console.log(`------- GPT ( ${index} ) ----------------`);
    console.log(`User: ${question}`);
    console.log(`${postedNote.s}: ${gpt}`);
    console.log("----------------------------");

    resolve(gpt);
  });
}

// ----------------- STABLE DIFFUSION ---------------------------

async function runStableDiffusion(relay, index, prompt, model) {
  return new Promise(async (resolve, reject) => {
    // --------------------- Fetch Offering Event -----------------------------

    const postedNoteList = await relay.list([
      {
        kinds: [OFFERING_KIND],
        limit: 10,
      },
    ]);

    const postedNote = getLatestEventByService(
      postedNoteList,
      "https://stablediffusionapi.com/api/v4/dreambooth"
    );
    const postedNoteData = JSON.parse(postedNote.content);

    // --------------------- Post to Note's endpoint -----------------------------

    const requestData = {
      model_id: model ?? "landscapev21",
      prompt: prompt ?? "A puppy",
      negative_prompt:
        "extra fingers, mutated hands, poorly drawn hands, poorly drawn face, deformed, ugly, blurry, bad anatomy, bad proportions, extra limbs, cloned face, skinny, glitchy, double torso, extra arms, extra hands, mangled fingers, missing lips, ugly face, distorted face, extra legs, anime",
      width: "512",
      height: "512",
      samples: "1",
      num_inference_steps: "30",
      safety_checker: "no",
      enhance_prompt: "yes",
      seed: index,
      guidance_scale: 7.5,
      multi_lingual: "no",
      panorama: "no",
      self_attention: "no",
      upscale: "no",
      embeddings: "embeddings_model_id",
      lora: "lora_model_id",
      webhook: null,
      track_id: null,
    };

    let responseData;
    try {
      const response = await axios.post(postedNoteData.endpoint, requestData);
      responseData = response.data;
    } catch (e) {
      if (e.response && e.response.status === 402) {
        responseData = e.response.data;
      } else {
        throw new Error(`Bad Request ${e}`);
      }
    }

    // --------------------- Pay invoice -----------------------------

    console.log(`------- PAYING SD ${index} --------`);
    console.log(responseData.pr);
    console.log("----------------------------");

    const response = await axios.post(
      "https://legend.lnbits.com/api/v1/payments",
      {
        out: true,
        bolt11: responseData.pr,
      },
      {
        headers: {
          "X-Api-Key": process.env.LNBITS_API,
          "Content-type": "application/json",
        },
      }
    );

    console.log("------- PAID SD ---------------");
    console.log(response.data);
    console.log("----------------------------");

    // --------------------- Poll SuccessAction for Response -----------------------------

    const totalResponse = await pollUrl(
      responseData.successAction.url,
      99,
      1000
    );

    console.log("------- IMAGES ---------------");
    console.log(totalResponse);
    console.log("----------------------------");

    resolve(totalResponse);
  });
}

// --------------------- MAIN -----------------------------

async function main() {
  const relay = relayInit(process.env.NOSTR_RELAY);
  relay.on("connect", () => {
    console.log(`connected to ${relay.url}`);
  });
  relay.on("error", (e) => {
    console.log(`failed to connect to ${relay.url}: ${e}`);
  });
  await relay.connect();

  // --------------------- Call Endpoints -----------------------------
  //Ex 1: Simple GPT Examples:
  const runs = 3;
  const gptRuns = [];
  for (let i = 0; i < runs; i++) {
    gptRuns.push(runGPT(relay, i, `Tell me a joke about the number ${i}`));
  }
  await Promise.all(gptRuns);

  //Ex 2: StableDiffusion Example:
  //await runStableDiffusion(relay, 0, "Cypherpunk girl with purple hair", "sdxl");
  
  //Ex 3: Chained Requests from disparate services:
  // Call runGPT to get a GPT response
  // const countries = ["Japan", "Madagascar", "Sweden", "Austrailia", "Brazil"];

  // for (let i = 0; i < countries.length; i++) {
  //   const country = countries[i];
  //   const gptResponse = await runGPT(relay, i, `Write me a prompt for a text to image model that will make a picturesque landscape of ${country} that someone would hang on the wall.`);

  //   // Use the GPT response as the prompt for runStableDiffusion
  //   const sdResponse = await runStableDiffusion(relay, i, gptResponse, "dream-shaper-8797");
  // }


  // --------------------- Clean Up -----------------------------

  relay.close();
}

main();
