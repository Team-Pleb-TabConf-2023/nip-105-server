
const OFFERING_KIND = 31_402;

const GPT_SCHEMA = {
    "type": "object",
    "properties": {
        "model": {
            "type": "string",
            "enum": ["gpt-3.5-turbo"]
        },
        "messages": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "role": {
                        "type": "string",
                        "enum": ["system", "user"]
                    },
                    "content": {
                        "type": "string"
                    }
                },
                "required": ["role", "content"]
            },
            "minItems": 1
        }
    },
    "required": ["model", "messages"]
}

const GPT_RESULT_SCHEMA = {
    "type": "object",
    "required": ["id", "object", "created", "model", "choices", "usage"],
    "properties": {
      "id": {
        "type": "string",
        "pattern": "^chatcmpl-[a-zA-Z0-9-]+$"
      },
      "object": {
        "type": "string",
        "enum": ["chat.completion"]
      },
      "created": {
        "type": "integer"
      },
      "model": {
        "type": "string"
      },
      "choices": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["index", "message"],
          "properties": {
            "index": {
              "type": "integer"
            },
            "message": {
              "type": "object",
              "required": ["role", "content"],
              "properties": {
                "role": {
                  "type": "string",
                  "enum": ["assistant"]
                },
                "content": {
                  "type": "string"
                }
              }
            },
            "finish_reason": {
              "type": "string",
              "enum": ["stop"]
            }
          }
        }
      },
      "usage": {
        "type": "object",
        "required": ["prompt_tokens", "completion_tokens", "total_tokens"],
        "properties": {
          "prompt_tokens": {
            "type": "integer"
          },
          "completion_tokens": {
            "type": "integer"
          },
          "total_tokens": {
            "type": "integer"
          }
        }
      }
    }
  }

const STABLE_DIFFUSION_SCHEMA = {
    "type": "object",
    "properties": {
        "model_id": {
            "type": "string"
        },
        "prompt": {
            "type": "string"
        },
        "negative_prompt": {
            "type": "string"
        },
        "width": {
            "type": "string"
        },
        "height": {
            "type": "string"
        },
        "samples": {
            "type": "string"
        },
        "num_inference_steps": {
            "type": "string"
        },
        "safety_checker": {
            "type": "string",
            "enum": ["yes", "no"]
        },
        "enhance_prompt": {
            "type": "string",
            "enum": ["yes", "no"]
        },
        "seed": {
            "type": "integer"
        },
        "guidance_scale": {
            "type": "number"
        },
        "multi_lingual": {
            "type": "string",
            "enum": ["yes", "no"]
        },
        "panorama": {
            "type": "string",
            "enum": ["yes", "no"]
        },
        "self_attention": {
            "type": "string",
            "enum": ["yes", "no"]
        },
        "upscale": {
            "type": "string",
            "enum": ["yes", "no"]
        },
        "embeddings": {
            "type": "string"
        },
        "lora": {
            "type": "string"
        },
        "webhook": {
            "type": ["string", "null"]
        },
        "track_id": {
            "type": ["string", "null"]
        }
    },
    "required": [
        "model_id", "prompt", "negative_prompt", "width", "height", "samples", "num_inference_steps", "safety_checker", "enhance_prompt", "seed", "guidance_scale", "multi_lingual", "panorama", "self_attention", "upscale", "embeddings", "lora"
    ]
}

const STABLE_DIFFUSION_RESULT_SCHEMA = {
    "type": "object",
    "required": ["status", "generationTime", "id", "output", "webhook_status", "meta"],
    "properties": {
      "status": {
        "type": "string",
        "enum": ["success"]
      },
      "generationTime": {
        "type": "number"
      },
      "id": {
        "type": "integer"
      },
      "output": {
        "type": "array",
        "items": {
          "type": "string",
          "format": "uri"
        }
      },
      "webhook_status": {
        "type": "string"
      },
      "meta": {
        "type": "object",
        "required": [
          "prompt", "model_id", "negative_prompt", "scheduler", 
          "safety_checker", "W", "H", "guidance_scale", 
          "seed", "steps", "n_samples", "full_url", 
          "instant_response", "tomesd", "upscale", "multi_lingual",
          "panorama", "self_attention", "use_karras_sigmas",
          "algorithm_type", "safety_checker_type", "lora_strength",
          "clip_skip", "temp", "base64", "file_prefix"
        ],
        "properties": {
          "prompt": { "type": "string" },
          "model_id": { "type": "string" },
          "negative_prompt": { "type": "string" },
          "scheduler": { "type": "string" },
          "safety_checker": { "type": "string" },
          "W": { "type": "integer" },
          "H": { "type": "integer" },
          "guidance_scale": { "type": "number" },
          "seed": { "type": "integer" },
          "steps": { "type": "integer" },
          "n_samples": { "type": "integer" },
          "full_url": { "type": "string" },
          "instant_response": { "type": "string" },
          "tomesd": { "type": "string" },
          "upscale": { "type": "string" },
          "multi_lingual": { "type": "string" },
          "panorama": { "type": "string" },
          "self_attention": { "type": "string" },
          "use_karras_sigmas": { "type": "string" },
          "algorithm_type": { "type": "string" },
          "safety_checker_type": { "type": "string" },
          "embeddings": { "type": ["null", "array"] },
          "vae": { "type": ["null", "string"] },
          "lora": { "type": ["null", "string"] },
          "lora_strength": { "type": "number" },
          "clip_skip": { "type": "integer" },
          "temp": { "type": "string" },
          "base64": { "type": "string" },
          "file_prefix": { "type": "string" }
        }
      }
    }
  }

module.exports = { GPT_SCHEMA, GPT_RESULT_SCHEMA, STABLE_DIFFUSION_SCHEMA, STABLE_DIFFUSION_RESULT_SCHEMA, OFFERING_KIND };