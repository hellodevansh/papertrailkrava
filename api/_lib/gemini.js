import { GoogleGenAI } from "@google/genai";
import { loadEnv } from "./env.js";

export async function readDocumentText(input) {
  loadEnv();

  if (input.text?.trim()) {
    return {
      text: input.text.trim(),
      provider: "user-text",
      note: "Pasted/text document was passed directly to Krava without Gemini.",
    };
  }

  if (!input.dataBase64 || !input.mimeType) {
    return {
      text: "",
      provider: "empty",
      warning: "No document text or file bytes were provided.",
    };
  }

  if (!process.env.GEMINI_API_KEY) {
    return {
      text: "",
      provider: "missing-gemini",
      warning: "GEMINI_API_KEY is missing, so file transcription is unavailable.",
    };
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "Transcribe this life-admin document or image into plain text only. Do not summarize, classify, infer, redact, or produce JSON. Preserve dates, amounts, names, identifiers, line items, and tables as text.",
          },
          {
            inlineData: {
              mimeType: input.mimeType,
              data: input.dataBase64,
            },
          },
        ],
      },
    ],
  });

  return {
    text: (response.text || "").trim(),
    provider: "gemini-transcription",
  };
}
