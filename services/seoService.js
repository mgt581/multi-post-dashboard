import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const response = await openai.responses.create({
  prompt: {
    "id": "pmpt_69bb3de30e6c8190b0e48b46e4afd3ba043a4d710bb3ae18",
    "version": "1"
  }
});
