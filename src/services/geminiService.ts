import { GoogleGenAI } from "@google/genai";

// Use the platform-provided API key
const apiToken = process.env.GEMINI_API_KEY;

let aiInstance: any = null;

function getAI() {
  if (!aiInstance) {
    if (!apiToken) {
      throw new Error("GEMINI_API_KEY is not configured in the environment.");
    }
    aiInstance = new GoogleGenAI({ apiKey: apiToken });
  }
  return aiInstance;
}

export async function analyzePothole(pothole: any) {
  try {
    const ai = getAI();
    const prompt = `As a Smart City Infrastructure expert for Chennai GCC (Greater Chennai Corporation), analyze this pothole detection:
    Severity: ${pothole.severity}
    Detection Confidence: ${Math.round(pothole.confidence * 100)}%
    Bus Route ID: ${pothole.busRouteId}
    Current Remarks: ${pothole.remarks || 'No remarks provided'}
    
    Provide a concise (max 40 words) professional risk assessment and priority level. Start with 'ASSESSMENT: ' and end with 'PRIORITY: [URGENT/MEDIUM/ROUTINE]'.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    return response.text;
  } catch (error) {
    console.error('Gemini Analysis Error:', error);
    return "ANALYSIS_FAILURE: Check model connectivity or quota constraints.";
  }
}

export async function generatePotholeDescription(severity: string) {
  try {
    const ai = getAI();
    const prompt = `Generate a vivid, photorealistic descriptive prompt for an AI image generator depicting a ${severity} severity pothole on a road in Chennai, India. 
    Include these specific local details for Greater Chennai context:
    - Road Type: Worn bituminous asphalt road with loose gravel and characteristic Indian road markings.
    - Surroundings: Typical Chennai urban landscape including a passing green MTC bus or a yellow auto-rickshaw in the background. Low-rise colorful buildings with shop signages or a traditional temple gopuram visible in the hazy distance.
    - Lighting: Harsh tropical sun with sharp shadows or a pre-monsoon humid overcast sky.
    - Pothole Detail: A ${severity} pothole with jagged, cracked edges. If LARGE, show exposed lower layers of the road and possibly a small puddle of muddy water.
    - Composition: Eye-level perspective, documentation style, photorealistic, 8k resolution.
    
    Output ONLY the resulting prompt string.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    return response.text;
  } catch (error) {
    return `A ${severity} pothole on an urban road in Chennai near a busy market, highly detailed, photorealistic, Indian urban context.`;
  }
}
