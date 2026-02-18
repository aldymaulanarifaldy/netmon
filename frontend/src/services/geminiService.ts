import { GoogleGenAI, Type } from "@google/genai";
import { NetworkNode, LogEntry, AIAnalysisResult } from '../types';

export const analyzeNetworkNode = async (
  node: NetworkNode,
  recentLogs: LogEntry[]
): Promise<AIAnalysisResult> => {
  // Guidelines: API key must be obtained exclusively from process.env.API_KEY
  // Guidelines: Assume this variable is pre-configured, valid, and accessible
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    console.warn("API Key not found in process.env.API_KEY");
    return {
        summary: "Configuration Error: API Key missing.",
        recommendations: ["Set process.env.API_KEY in your environment variables"],
        riskScore: 0
    };
  }

  // Guidelines: Use named parameter for initialization
  const client = new GoogleGenAI({ apiKey });

  const prompt = `
    You are a Senior Network Engineer expert in MikroTik RouterOS. Analyze the following telemetry for device "${node.name}" (${node.boardName}, v${node.version}).
    
    Telemetry:
    - Status: ${node.status}
    - Latency: ${node.latency}ms
    - Packet Loss: ${node.packetLoss}%
    - CPU Load: ${node.cpuLoad}%
    - Memory Usage: ${node.memoryUsage}%
    - Voltage: ${node.voltage}V
    - Temperature: ${node.temperature}C
    - TX/RX Rate: ${node.txRate}/${node.rxRate} Mbps

    Logs (Last 5 mins):
    ${recentLogs.map(l => `[${l.timestamp}] ${l.level}: ${l.message}`).join('\n')}

    Provide a structured JSON response with:
    1. 'summary': Technical diagnosis using Network Engineering terms.
    2. 'recommendations': 3 specific RouterOS commands or actions.
    3. 'riskScore': 0-100 integer.
  `;

  try {
    // Guidelines: Use ai.models.generateContent
    // Guidelines: Use 'gemini-3-flash-preview' for basic text tasks
    const response = await client.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            recommendations: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            riskScore: { type: Type.NUMBER },
          },
          required: ["summary", "recommendations", "riskScore"],
        }
      }
    });

    // Guidelines: Access .text property directly
    const text = response.text;
    
    if (!text) {
         throw new Error("Invalid response format from Gemini API");
    }

    const result = JSON.parse(text);

    return {
        summary: result.summary || "No summary provided.",
        recommendations: Array.isArray(result.recommendations) ? result.recommendations : [],
        riskScore: typeof result.riskScore === 'number' ? result.riskScore : 0
    };

  } catch (error) {
    console.error("Gemini Analysis Failed", error);
    return {
        summary: "Analysis unavailable due to connection error.",
        recommendations: ["Check internet connection", "Verify API Key quota"],
        riskScore: 0
    };
  }
};