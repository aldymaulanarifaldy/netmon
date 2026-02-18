import { GoogleGenAI, Type } from "@google/genai";
import { NetworkNode, LogEntry, AIAnalysisResult } from '../types';

export const analyzeNetworkNode = async (
  node: NetworkNode,
  recentLogs: LogEntry[]
): Promise<AIAnalysisResult> => {
  // Guidelines: API Key must be obtained exclusively from process.env.API_KEY
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    console.error("API Key not found. Please set the API_KEY environment variable.");
    return {
      summary: "Analysis unavailable. Missing API Key.",
      recommendations: ["Check API configuration"],
      riskScore: 0
    };
  }

  const ai = new GoogleGenAI({ apiKey });

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

    Provide a structured JSON response:
    1. 'summary': Technical diagnosis. Use Network Engineering terms (saturation, flap, interference).
    2. 'recommendations': 3 specific RouterOS commands or actions (e.g., "interface wireless monitor wlan1", "tool torch").
    3. 'riskScore': 0-100.
  `;

  try {
    const response = await ai.models.generateContent({
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

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text) as AIAnalysisResult;
  } catch (error) {
    console.error("Gemini Analysis Failed", error);
    return {
        summary: "Analysis unavailable. Check connectivity to management plane.",
        recommendations: ["ping 8.8.8.8", "tool traceroute", "system resource print"],
        riskScore: 0
    };
  }
};