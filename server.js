const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const apiKey = process.env.GEMINI_API_KEY;

app.get("/", (req, res) => {
  res.json({
    message: "Diagram2Java AI Backend is running!"
  });
});

app.post("/generate", async (req, res) => {
  try {
    if (!apiKey) {
      return res.status(500).json({
        error: "Gemini API key is not configured on the server."
      });
    }

    const { imageBase64, mimeType } = req.body;

    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/webp"
    ];

    if (!imageBase64 || !allowedTypes.includes(mimeType)) {
      return res.status(400).json({
        error: "Please provide a valid PNG, JPEG or WEBP image."
      });
    }

    // Basic image size limit: approximately 7 MB decoded.
    if (Buffer.from(imageBase64, "base64").length > 7 * 1024 * 1024) {
      return res.status(413).json({
        error: "Image is too large. Maximum size is 7 MB."
      });
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
Analyze this database diagram and generate Java JPA entity classes.

Requirements:
- Identify entities, attributes, data types and relationships.
- Use Jakarta Persistence annotations.
- Include @Entity, @Id and suitable relationship annotations.
- Use appropriate Java types.
- Return ONLY valid JSON, without Markdown.

Required JSON format:
{
  "files": [
    {
      "fileName": "User.java",
      "content": "complete Java source code"
    }
  ]
}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: imageBase64
              }
            }
          ]
        }
      ]
    });

    if (!response.text) {
      return res.status(502).json({
        error: "Gemini returned an empty response."
      });
    }

    let result;

    try {
      const cleaned = response.text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();

      result = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({
        error: "Gemini did not return valid JSON."
      });
    }

    if (!Array.isArray(result.files)) {
      return res.status(502).json({
        error: "The generated response has an invalid format."
      });
    }

    const files = result.files.filter(file =>
      file &&
      typeof file.fileName === "string" &&
      /^[a-zA-Z_$][a-zA-Z0-9_$]*\.java$/.test(file.fileName) &&
      typeof file.content === "string"
    );

    if (files.length === 0) {
      return res.status(502).json({
        error: "No valid Java files were generated."
      });
    }

    return res.json({ files });

  } catch (error) {
    console.error("Generation error:", error.message);

    return res.status(500).json({
      error: "Java generation failed. Please try again."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Diagram2Java backend running on port ${PORT}`);
});