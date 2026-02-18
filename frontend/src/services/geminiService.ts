import { NetworkNode, LogEntry, AIAnalysisResult } from '../types';

export const analyzeNetworkNode = async (
  node: NetworkNode,
  recentLogs: LogEntry[]
): Promise<AIAnalysisResult> => {

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    return {
      summary: "Missing VITE_GEMINI_API_KEY",
      recommendations: ["Set VITE_GEMINI_API_KEY in .env file"],
      riskScore: 0
    };
  }

  const prompt = `
You are a Senior Network Engineer expert in MikroTik RouterOS.

Device:
Name: ${node.name}
Board: ${node.boardName}
Version: ${node.version}
Status: ${node.status}
Latency: ${node.latency} ms
Packet Loss: ${node.packetLoss}%
CPU: ${node.cpuLoad}%
Memory: ${node.memoryUsage}%
Voltage: ${node.voltage}V
Temperature: ${node.temperature}C
Traffic: ${node.txRate}/${node.rxRate} Mbps

Logs:
${recentLogs.map(l => `[${l.timestamp}] ${l.level}: ${l.message}`).join('\n')}

Respond strictly in JSON:
{
  "summary": "string",
  "recommendations": ["string","string","string"],
  "riskScore": number
}
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ]
        })
      }
    );

    if (!response.ok) {
      throw new Error("Gemini API request failed");
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("Empty AI response");
    }

    const parsed = JSON.parse(text);

    return {
      summary: parsed.summary,
      recommendations: parsed.recommendations,
      riskScore: parsed.riskScore
    };

  } catch (error) {
    console.error("Gemini analysis failed:", error);
    return {
      summary: "AI analysis unavailable.",
      recommendations: [
        "Check internet connection",
        "Verify API key",
        "Check Gemini quota"
      ],
      riskScore: 0
    };
  }
};
